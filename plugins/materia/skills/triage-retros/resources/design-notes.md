# triage-retros — design notes (the "why" appendix)

Read this only when **changing the skill**, not when running it. Each note
records a decision the SKILL.md core states as a bare rule, plus the
alternatives that lost.

## Discovery uses `git ls-files`, not `find` or a glob library

Tracked-only (an uncommitted stray `retro.md` is not consumed — the skill
operates on what the PR will see), `.gitignore`-respecting for free,
deterministic cross-platform ordering, and no new runtime dependency.

## The parser is section-regex, not a markdown AST walker

Retros are small and structurally simple, and the schema is loose by design
(tolerant parsing across `schema_version` drift is a requirement). A
`remark`/`unified` AST walker would add the repo's first markdown-parser
dependency, hard-fail where the design wants tolerance, and cost more
maintenance as the template mutates. ~50 lines of split + named-capture
regexes is easy to extend and easy to keep tolerant (unknown section →
`unknown:<heading>` record; missing section → empty array; unknown
`schema_version` → recorded, not gating).

## Clustering is model-driven, drafting artifacts directly

Keyword/theme bucketing was rejected: retro entries are free prose, and the
signal lives in meaning, not shared keywords. The cost — run-to-run
non-determinism — is mitigated by the fixed artifact structure (the authored
bodies must hit `propose-spec` / `report-bug`'s section shape verbatim) and the
operator checkpoint. An earlier design persisted a `synthesis.json` intermediate
between clustering and rendering; it's gone — the drafts live only in the
parent's context until `approve`, and operator feedback edits them there.

## Fan-out sizing: per-retro sub-agents at 3+, inline at ≤2

One sub-agent per retro keeps N retro bodies out of the parent's context and
parallelizes the mechanical parse+bucket work; the genuine reasoning
(clustering, consolidation, classification, drafting) stays in the parent.
Sub-agents run at `sonnet/low` because bucketing and quoting over one small
retro is mechanical — the corpus shows near-perfect return quality at that tier
(96/97 clean in the 2026-06-30 batch).

**2026-07-01 amendment (operator decision):** the original spec bound
"one sub-agent strictly per retro — never per batch". For batches of ≤2
retros the dispatch overhead exceeds the context saved, so the parent now
parses and buckets small batches inline, producing the identical envelope
shape in memory. The per-retro rule (never per-batch sub-agents) still holds
whenever sub-agents are used at all.

## Retros feed the project, not the pipeline (2026-07 retarget)

An earlier design triaged retros three ways — pipeline findings (→ a
`pipeline-improvements.md` plan applied back into the skills by a companion
executor), product suggestions, and bugs. The self-editing executor was
removed; retros now feed **project-specific** backlog signal only. The pipeline
bucket, its `## Actions`/`anchor_hint`/dimension apparatus, the
protected-contract flagging, and the plan-time anchor validation all went with
it. Pure pipeline/harness friction is now **excluded by design** — it produces
no artifact and is not itemized on the dropped/parked list (there is no longer a
health corpus to absorb it — see below). The "nothing silently discarded"
invariant governs only in-scope spec/bug signal.

## Direct authoring + per-artifact consolidation (2026-07 move)

The bigger 2026-07 change: `triage-retros` stopped writing intermediate
hand-off buckets and became a **single-hop producer**. Previously it triaged
into a `docs/specs/_improvements/<slug>/` folder — `product-suggestions.md`,
`bug-reports.md`, and an always-emitted `pipeline-health.md` rollup — which two
downstream skills (`suggestions-to-specs`, `bugs-to-reports`) later turned into
proposed specs and filed bug reports. That indirection is gone: the two
downstream skills and the `_improvements` buckets were removed, and
`triage-retros` now clusters retro signal **in-memory** and authors the proposed
specs (into `docs/specs/_proposed/`) and bug reports (into `docs/bugs/_reports/`)
itself, both with `source: retro-triage`, following the `propose-spec` /
`report-bug` practice — one hop from retro to reviewable proposal/report, one PR.

Why: the buckets were a second on-disk shape that duplicated the queue contracts
and forced a second human-review hop (triage PR, then per-item PR). Authoring
directly under the queue contracts removes the duplicate shape and lands
everything in one reviewable PR. The cost is that `triage-retros` is now a
**queue producer** and must carry the queue-contract de-duplication invariant it
never carried before (see below) — the single behaviour most likely to ship
wrong.

**Consolidation is per-artifact** because the two queues have different shapes.
Proposed specs bundle small *related* capabilities into one spec as multiple user
stories, capped at `propose-spec`'s split line (`>~5 stories` / independent
surfaces / unrelated outcomes) so each spec stays a unit `ship-spec` can build
end-to-end. Bug reports are single-defect (`fix-bug` consumes one report = one
defect), so consolidation there means folding duplicate signal about the *same*
defect into one report with multiple `source_refs` — never merging unrelated
defects. Collapsing both into one "just merge related things" rule would either
fragment specs or produce multi-defect reports `fix-bug` can't consume.

## Producer de-duplication is mandatory (new queue-contract debt)

Both `docs/specs/_proposed/README.md` and `docs/bugs/_reports/README.md` require
a producer to not duplicate an item already pending in the queue or recently
shipped/fixed. The old retro loop was **not** a queue producer, so it never did
this — the absorbed `suggestions-to-specs` (its §3 overlap filter) did. Now that
`triage-retros` authors into both queues, it inherits that invariant: filter
every draft against the pending queue + the recent merge log, and drop overlaps
to the dropped/parked list. This is flagged loudly in SKILL.md because it is the
one behaviour most likely to be forgotten in the retarget.

## Lifecycle is the in-memory producer pattern; no file-derived resumability

`triage-retros` adopts the shared producer lifecycle (`docs/standards/skills.md`
§ Producer lifecycle): harvest + synthesize + draft + de-dup all in-memory,
present **one** confirmation, and on `approve` branch → write → rename → commit →
push → open one PR in a single shot. It is classified as a **branch-at-approve**
producer (nothing touches the repo until `approve`), so an abandoned confirmation
leaves no branch, no files, nothing to unwind.

This **replaced** the older machinery: the file-derived resumability gate and
phase-detection, the `_improvements` folder/README bootstrap, the always-emitted
`pipeline-health.md` (which doubled as the resumability sentinel), the
commit-then-pause checkpoint, mark-processed as its own commit, and the PR-URL
backfill step — all removed.

**The acknowledged cost: no session survival.** Because nothing is persisted
before `approve`, an interrupt mid-run discards the whole N-way harvest +
synthesis; the operator re-invokes `/materia:triage-retros` fresh (it re-globs
the still-unrenamed retros and re-runs). This is **heavier** than for the cheap
Q&A producers (`propose-spec` / `report-bug` lose only a short in-memory Q&A;
`triage-retros` loses N sub-agent harvests + a clustering pass). It is the
deliberate, operator-locked consequence of adopting the producer pattern **and**
dropping the `pipeline-health.md` sentinel that a file-derived gate would have
resumed from — the operator chose the simpler lifecycle over cross-session
resume. There is no `RUN.md` / `STATUS.md`: a fourth source of truth that would
only drift.

## The checkpoint pauses by ending the turn

A skill cannot synchronously await an operator reply; printing the confirmation
prompt and ending the turn is the only mechanism. Nothing is in-flight or on disk
between turns, so no timeout or reminder is needed — an interrupt is simply
re-invoked fresh (there is nothing to resume).

## The approve-token allowlist is strict on purpose

`proceed, but also drop the second spec` routes to feedback, not approval —
folding then re-asking costs one cheap round-trip; advancing on an ambiguous
approval risks shipping unwanted changes. The strictness is a safety property of
the human gate; do not "improve" it with intent inference.

## Scoped formatting is load-bearing

A pre-retarget run shipped a generated artifact that failed the PR's own
formatter gate (`MATERIA.md` § Gate, lint row). Formatting is scoped to the files
the run wrote — never `--write .` — so unrelated files don't sweep into the diff
(which the scope guard, run on the staged diff, would then halt on).
