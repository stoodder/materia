# materia-triage-retros — design notes (the "why" appendix)

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

## Clustering is model-driven, writing markdown directly

Keyword/theme bucketing was rejected: retro entries are free prose, and the
signal lives in meaning, not shared keywords. The cost — run-to-run
non-determinism — is mitigated by the fixed artifact structure and the
operator checkpoint. An earlier design persisted a `synthesis.json`
intermediate between clustering and rendering; it's gone — the markdown is
the single audit record, and operator feedback edits it directly.

## Fan-out sizing: per-retro sub-agents at 3+, inline at ≤2

One sub-agent per retro keeps N retro bodies out of the parent's context and
parallelizes the mechanical parse+bucket work; the genuine reasoning
(clustering, triage, prioritisation) stays in the parent. Sub-agents run at
`sonnet/low` because bucketing and quoting over one small retro is mechanical
— the corpus shows near-perfect return quality at that tier (96/97 clean in
the 2026-06-30 batch).

**2026-07-01 amendment (operator decision):** the original spec bound
"one sub-agent strictly per retro — never per batch". For batches of ≤2
retros the dispatch overhead exceeds the context saved, so the parent now
parses and buckets small batches inline, producing the identical envelope
shape in memory. The per-retro rule (never per-batch sub-agents) still holds
whenever sub-agents are used at all.

## Plan-time anchor validation (2026-07-01 amendment)

The original design kept skill bodies entirely unloaded at cluster time
("paths only"), which meant `anchor_hint`s were guessed — and a guessed
anchor is worse than the null sentinel, because the executor trusts it and
halts on drift. The cluster pass still drafts from paths only; a scoped,
read-only grep per drafted action then validates or repairs each anchor
against the live file. This skill still never *edits* a pipeline skill.

## State is file-derived; no `RUN.md` / `STATUS.md`

The run's lifecycle is short and linear, and each phase is one atomic commit
— so branch name + plan folder + commit graph always identify the first
incomplete phase. A `RUN.md` would be a fourth source of truth and would
drift.

## The checkpoint pauses by ending the turn

A skill cannot synchronously await an operator reply; printing the prompt and
ending the turn is the only mechanism. Nothing is in-flight between turns, so
no timeout or reminder is needed — the resumability gate re-derives
"paused at checkpoint" from disk on any future invocation.

## The approve-token allowlist is strict on purpose

`proceed, but also drop F4` routes to feedback, not approval — folding then
re-asking costs one cheap round-trip; advancing on an ambiguous approval
risks shipping unwanted changes. The strictness is a safety property of the
human gate; do not "improve" it with intent inference.

## PR-URL backfill amends with `--force-with-lease`

The rename commit deliberately defers the PR URL (unknown until
`gh pr create` returns). Amending that one commit — the run's only
force-push, `--force-with-lease`, on a single-operator chore branch — keeps
the history a clean "renamed and recorded the PR URL" story instead of a
noisy two-step. This is consistent with the repo rule's intent (no
force-push to `main` or shared branches).

## Templates are shape truth (2026-07-01 restructure)

The artifact shapes were once stated twice — in SKILL.md render sections and
in the `docs/specs/_improvements/_templates/` stubs. The stubs are now the
single source of shape; `resources/rendering.md` carries only the semantics a
stub can't express, and `resources/actions-contract.md` carries the
planner↔executor parse contract. The same restructure split this SKILL.md
into a lean always-read core plus phase-scoped resources, cutting the per-run
context cost of a skill that previously needed a paginated read of itself.

## Scoped Prettier formatting is load-bearing

A pre-split run shipped a generated artifact that failed the PR's own
`the repo formatter check (MATERIA.md § Gate, lint row)` gate. Formatting is scoped to the files the run wrote —
never `--write .` — so unrelated files don't sweep into the diff.
