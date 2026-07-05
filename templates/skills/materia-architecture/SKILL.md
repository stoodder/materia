---
name: materia-architecture
description: From a spec (and, on UI runs, a design), produce a technical architecture document grounded in the repo docs — reusing existing resources wherever possible — at docs/specs/<dated-slug>/architecture.md (where <dated-slug> is the timestamped folder name minted at intake, e.g. 2026-06-13-142530-ab24f9-csv-export). Stage 4 of the ship-spec pipeline.
---

# materia-architecture — the technical plan, grounded in the docs

Turn `spec.md` + `design.md` into an `architecture.md` that maps the work onto
this codebase. **Reuse beats invention.** Runs as a subagent in `materia-ship-spec`;
usable standalone.

## Inputs

- `docs/specs/<dated-slug>/spec.md` + `design.md`; the docs read order
  (`CLAUDE.md` → `docs/README.md` → standards + resource docs).
- `design.md` exists only on UI-affecting runs — the design stage is
  UI-gated (`materia-ship-spec/SKILL.md` § Review — § UI-surface gate). On a non-UI
  run, work from `spec.md` alone and own the operator-surface enumeration
  yourself (§ Non-product features).

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/architecture.md` — `STATUS.md` updated, committed and pushed.

## Recommended tier

`fable/high` — see `MATERIA.md` § Tiers for the model and effort definitions. Grounding the technical plan in existing resources and surfacing reuse opportunities across the codebase is the highest-stakes planning task.

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`.claude/skills/materia-ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

1. **Build context in the docs read order** (this is the whole point of the docs
   system): `CLAUDE.md` → `docs/README.md` → the relevant `docs/standards/*`
   and `docs/resources/*` → only then the code. Use
   `docs/standards/request-lifecycle.md` to see how a feature flows across layers.

2. **Map to existing resources first.** For each thing the feature needs, find
   the resource that already covers it (`docs/resources/*`, `docs/surface-map.md`)
   and document how it changes. Only add a **new** resource when nothing fits.

   **Precedent-invariant check.** When you cite an existing pattern as the
   precedent for the new code (e.g. "this should work like
   `StrengthMetric.value`'s create-once policy"), enumerate the precedent's
   invariants AND the new code's invariants **explicitly**, then check they
   match before adopting the analogy. Analogies that read correct on their
   face but miss a load-bearing invariant (e.g. "both preserve user values"
   — but `StrengthMetric` rows can't be user-deleted while `SessionTemplate`
   rows can) propagate as bugs downstream and surface only at review or in
   production. If the invariants diverge, name the divergence in the
   architecture doc and use a different mechanism for the new code.

   **Discovery breadth — grep by symbol, sweep closed sets, check producer
   siblings.** Three recurring under-scoping traps to close up front so they
   don't surface as downstream rework:

   - **Enumerate consumers by the imported symbol, not local ref names.** When a
     change touches a shared composable/util/export, grep for the **imported
     symbol** (e.g. `useSaveStatus`) to find every consumer — not a specific
     local variable name (`saveFailed`, `planSaveFailed`), which misses
     consumers that bind the same import under a different name.
   - **Closed-set / enum / exemption-list changes get a docs-wide grep.** For a
     change to a closed set (an auth-exemption list, an enum, a fixed token set),
     run a **docs-wide grep** for every stale copy (`surface-map.md`, the
     relevant resource docs, auth prose) rather than reading only the most
     prominent line — reconcile every depiction, not just the canonical one.
   - **New producer skill → check siblings.** For a new producer skill, confirm
     it is listed in the `skills.md` producer examples **and** add a sibling
     **glossary entry** like every other producer has, rather than concluding
     "no glossary entry needed."

3. **Specify changes**, following the standards. **If the change has no
   product surface** (a Claude Code skill, a docs reorganization, a
   CLI/build helper), skip the product-shaped bullets below and jump straight to
   § Non-product features (no product surface) for the skeleton variant, rather
   than re-deriving the product structure here. The bullets below are the
   typical product layers — use the layer vocabulary the repo's
   `docs/standards/*` set actually defines, citing each layer's standard:
   - **Data model & migration** — schema changes + unique indexes for upserts
     (the repo's data standard).
   - **API surface** — new/changed routes: METHOD · path · auth · contract ·
     payload (the repo's server-routes standard; link `surface-map.md`).
   - **Contracts & models** — wire shapes and their construction/serialization
     conventions (the repo's contracts standard).
   - **Client state** — query caching + mutation strategy (the repo's
     API-layer standard).
   - **UI** — pages/components/presentation hooks (the repo's UI standard).
4. **Call out** risks/trade-offs, the test strategy (`testing.md`), and explicit
   out-of-scope/follow-ups.

5. **Write** `docs/specs/<dated-slug>/architecture.md` from the template.

6. **Pre-task scope validation (grep).** For each area architecture
   anticipates as a task (the changes specified in step 3 plus any
   "Affected existing resources" rows), run
   `git grep -E '<expected-token-pattern>' <planned-file-list>` and
   record the hit count per file in the architecture doc. The pattern
   is whatever the task is meant to find/edit: for a rename sweep, the
   old name; for a token-recipe migration, the old token; for a
   doc-edit task, the obsolete phrase. Tasks (or "Affected existing
   resources" rows) whose grep returns **zero hits** across all
   planned files should be:

   - **Reduced** to a narrower scope that actually has work (e.g. a
     prior run scoped a task to 9 resource docs but the relevant grep
     returned zero — the right shape was "add Related links + a single
     semantic-name note in one doc").
   - Or **merged** into an adjacent task that does have hits.
   - Or **removed** from the architecture doc if the work truly
     doesn't exist.

   Surface the grep counts inline (a one-line "Scope validation: N hits
   across M files" under each area) so `materia-plan-tasks` reads them when
   sizing tasks. This converts the prior implicit assumption "the file
   list is right because architecture said so" into a check that
   survives the hand-off to `materia-plan-tasks` and `materia-implement-task`.

   **Evidence line per asserted reuse.** Whenever the doc claims an existing
   resource already provides something the feature needs ("`RowOverflowMenu`
   already supports a `disabled?` field", "the sentinel column already exists"),
   that claim must carry an **evidence line**: the literal `git grep` (or
   `git ls-files`) command and its actual `file:line` hits — never "Confirmed
   by grep" as a bare assertion. A reuse claim that turns out to be assertion-
   by-analogy to a sibling spec (the grep would have returned **zero hits**)
   silently becomes unplanned extension work at implement time. If the grep
   returns zero, the honest record is "zero hits → must create/extend", and the
   work belongs in a task — not a phantom reuse.

7. **Cross-link sanity check (pre-commit).** Before committing, grep
   `architecture.md` for relative markdown links (`](./` or `](../` or
   `](docs/`) and verify each target resolves on disk. Catches broken
   cross-links at the source rather than several stages downstream when
   `materia-docs-sync` runs `node scripts/check-docs.mjs` over the whole branch.

   **Convention for to-be-created docs.** When `architecture.md`
   references a doc that this PR will create in a later stage (e.g. a
   new standards doc named in step 3 under "Specify changes"), use a
   backtick path (`` `docs/standards/visual-language.md` ``) rather
   than a markdown link
   (`[visual-language](docs/standards/visual-language.md)`). The
   markdown form will fail this step's check at architecture-commit
   time (target doesn't exist yet) but the backtick form is
   human-readable prose and is ignored by the link-checker. After the
   to-be-created doc lands in a later commit, a markdown link is fine.

   **Inline-backtick hazard.** `node scripts/check-docs.mjs` only strips
   fenced (triple-backtick) blocks when extracting links; inline
   single-backtick code spans are NOT stripped. So an inline example
   like `` `[bar](baz.md)` `` (illustrating link syntax in prose) will
   trip the checker even though the intent is "this is code." For
   example snippets that contain markdown link syntax, wrap them in a
   fenced block, or write them as plain prose without the bracket
   form.

8. **Persist:** tick stage 4 in `STATUS.md` and set `Next: plan-tasks`; commit
   + push. **Orchestrator-lane exception:** when spawned by `materia-ship-spec`/`materia-fix-bug`, do **not** tick `STATUS.md` or commit it — the orchestrator owns both (see `materia-ship-spec/SKILL.md` § STATUS.md ownership (orchestrator lane)); write only your own artifact.

## Done when

- Every change maps to a resource doc — existing (reused) or a new one named for
  creation.
- Reuse is maximized; new resources are justified.
- Schema changes name their migration; every touched layer cites its standard.
- It's concrete enough that `materia-plan-tasks` can decompose it without re-deciding.
- `STATUS.md` updated; architecture committed + pushed.

## Non-product features (no product surface)

Step 3 above is laid out for product features that touch the data model,
server routes, contracts/models, client state, and UI. For features that
touch none of those (a Claude Code skill, a docs reorganization, a CLI
helper, a build tool), **the spirit of "enumerate what changes and why"
matters more than the section labels**.

- **Restructure step 3's headings** to fit the work — e.g. for a markdown
  skill, the natural headings might be `Parser`, `Renderer`, `Allowlist
  enforcement`, `Resumability gate` instead of `Data model` / `API surface`
  / `Contracts & models` / `Client state` / `UI`.
- **Map "existing resources" (step 2)** to whatever the equivalent is —
  sibling skills under `.claude/skills/`, related templates under
  `docs/specs/_templates/`, prior decisions captured in
  `docs/specs/_improvements/` plans.
- **Enumerate the operator surface.** The design stage is UI-gated and does
  not run for these features, so this doc carries what design would have:
  the operator-facing phases the feature produces (e.g. Discovery →
  Synthesis → Checkpoint) and what the operator sees on each phase's
  loading/empty/error/ready path — "no path left undefined" applies to
  CLI/text output exactly as it does to screens.
- **Keep step 4 verbatim** (risks/trade-offs, test strategy, out-of-scope) —
  it applies regardless of feature shape.
