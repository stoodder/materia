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

## Retros feed the project, not the pipeline (2026-07 retarget)

An earlier design triaged retros three ways — pipeline findings (→ a
`pipeline-improvements.md` plan applied back into the skills by a companion
executor), product suggestions, and bugs. The self-editing executor was
removed; retros now feed **project-specific** backlog signal only. The
pipeline bucket, its `## Actions`/`anchor_hint`/dimension apparatus, the
protected-contract flagging, and the plan-time anchor validation all went with
it. What remains is a two-bucket triage (`suggestions[]` / `bugs[]`) plus the
always-emitted `pipeline-health.md` rollup, which absorbs the aggregate
pipeline-friction signal as health stats rather than actionable edits.

## State is file-derived; no `RUN.md` / `STATUS.md`

The run's lifecycle is short and linear, and each phase is one atomic commit
— so branch name + triage folder + commit graph always identify the first
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

## PR-URL backfill is a follow-up commit

The rename commit deliberately defers the PR URL (unknown until
`gh pr create` returns). The backfill lands as its own follow-up commit —
no amend, no force-push. An amend + `--force-with-lease` would read as a
cleaner one-commit story, but the shipped permission rules deny every
force-push spelling (the deny is deliberately blunt: agents should never
rewrite pushed history), and a two-commit branch is a fine price for that
invariant.

## Templates are shape truth (2026-07-01 restructure)

The artifact shapes were once stated twice — in SKILL.md render sections and
in the `docs/specs/_improvements/_templates/` stubs. The stubs are now the
single source of shape; `resources/rendering.md` carries only the semantics a
stub can't express, plus the shared traceback + placeholder conventions the
downstream consumers parse. The same restructure split this SKILL.md into a
lean always-read core plus phase-scoped resources, cutting the per-run context
cost of a skill that previously needed a paginated read of itself.

## Scoped formatting is load-bearing

A pre-split run shipped a generated artifact that failed the PR's own
formatter gate (MATERIA.md § Gate, lint row). Formatting is scoped to the files the run wrote —
never `--write .` — so unrelated files don't sweep into the diff.
