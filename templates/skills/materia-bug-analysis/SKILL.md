---
name: materia-bug-analysis
description: Synthesise reproduction.md and the bug report into bug-analysis.md — the architecture.md analogue for the bug loop that plan-tasks decomposes. Consumes docs/bugs/<dated-slug>/reproduction.md plus the bug report body (frontmatter stripped), produces docs/bugs/<dated-slug>/bug-analysis.md, and ticks STATUS.md stage 2. Stage 2 of the fix-bug pipeline; usable standalone given a reproduction.md + report.
---

# materia-bug-analysis — synthesise reproduction into a structured fix plan

Turn `reproduction.md` and the bug report into `bug-analysis.md`: root cause,
affected files, fix approach, and test impact. This document is the
**`architecture.md` analogue for the bug loop** — it is the single artifact
`materia-plan-tasks` decomposes into tasks. Runs as a subagent dispatched by
`/materia-fix-bug` after stage 1 (reproduce-bug) is confirmed RED; usable standalone
given a `reproduction.md` + report.

This skill does **not** enumerate tasks (that is `materia-plan-tasks`'s role) and
does **not** re-derive the reproduction (that is `materia-reproduce-bug`'s role).

## Inputs

- `docs/bugs/<dated-slug>/reproduction.md` — the failing test path(s), repro
  steps, expected vs actual, and the RED evidence from stage 1.
- Bug report body (frontmatter stripped) — the full original description,
  affected surface, and severity from the report file in `docs/bugs/_reports/`.
- `docs/bugs/<dated-slug>/STATUS.md` — the bug run's live state; this skill
  ticks stage 2 here on completion.
- (Read-only) The resource/standards docs for the affected files — for naming
  the fix approach and the standards the fix tasks must read. Resolved by
  reading the "Affected surface" in the report and cross-referencing
  `docs/surface-map.md` and the `docs/resources/` + `docs/standards/` docs.

## Outputs

- `docs/bugs/<dated-slug>/bug-analysis.md` filled per
  `docs/bugs/_templates/bug-analysis.md` — root cause, affected files, fix
  approach (including the standards/resource docs the fix tasks must read),
  test impact, and out-of-scope boundary.

  **`bug-analysis.md` is the `architecture.md` analogue for the bug loop.**
  It is the single document `materia-plan-tasks` decomposes; `/materia-fix-bug` passes it to
  `materia-plan-tasks` as the decomposition source in place of `architecture.md`.
  Its `## Affected files` section is the **"Affected existing resources"
  analogue** that `materia-plan-tasks` reconciles against when generating and
  validating tasks — it must list every file the fix will touch, with a
  one-line description of what's wrong or what changes per file.

- `STATUS.md` stage-2 ticked; `Next: plan-tasks` set.
- Committed + pushed.

## Recommended tier

`fable/medium` — see `MATERIA.md` § Tiers for
the model and effort definitions. This is a synthesis task: two structured
artifacts (`reproduction.md` + the bug report) feed a thin, well-shaped
output (`bug-analysis.md`). The structure is defined by the template; the
judgment call is correctly naming the root cause mechanism and the affected
files. Medium effort is appropriate — no novel design is required.

## Procedure

1. **Load context.** Read `reproduction.md` in full. Read the bug report body.
   Note the "Affected surface / route / module" section in the report.
   Cross-reference `docs/surface-map.md` to find the matching resource and
   standards docs, then read the relevant ones (for naming the fix approach
   in repo terms — what existing patterns the fix should follow). Read
   `docs/bugs/_templates/bug-analysis.md` for the output shape.

2. **Identify the root cause.** From the RED evidence in `reproduction.md`
   (the failing test + verbatim output) and the report's description, reason
   about *why* the bug happens — the mechanism, not the symptom. Write one
   short, precise paragraph. Examples of the right level: "The `computeLoad`
   helper returns `NaN` when `week.loadMultiplier` is `null` because it does
   not guard against null before multiplication" — not "the bug happens because
   there is a null value."

3. **List the affected files.** For each file the fix will need to touch,
   write one row in the `## Affected files` table: repo-root-relative path +
   one-line description of what's wrong or what changes there. This list is
   load-bearing: `materia-plan-tasks` reads it as the "Affected existing resources"
   set for its step-3 reconciliation and pre-task grep validation. Be precise —
   omitting a file means `materia-plan-tasks` may miss a task; adding files that don't
   need touching inflates scope.

4. **Sketch the fix approach.** Write a thin fix sketch — the change shape,
   not a design. Examples: "add a null-guard before the multiplication in
   the derivation util"; "validate the request body field before it reaches the data layer."
   Then list the standards/resource docs the fix tasks must read (the
   docs-scope floor for `materia-plan-tasks`). Do not enumerate specific task steps —
   that is `materia-plan-tasks`'s job.

5. **State the test impact.** List which test(s) from `reproduction.md` must
   flip RED→GREEN, and note any additional regression tests the fix warrants
   (e.g. edge-case inputs not covered by the reproduction test).

6. **State out of scope.** Name what the fix deliberately does NOT touch —
   keeps the blast radius honest and prevents `materia-plan-tasks` from over-scoping
   tasks.

7. **Write `bug-analysis.md`** from the template, populating all six sections.
   Then in `STATUS.md`: tick stage 2 (`- [x] 2. bug-analysis …`) and set
   `Next: plan-tasks`. Commit `bug-analysis.md` + `STATUS.md` and push.

## Scope

This skill:

- **Writes** `bug-analysis.md` — root cause, affected files, fix approach,
  test impact, out of scope.
- **Does NOT** enumerate tasks — that is `materia-plan-tasks`'s role.
- **Does NOT** re-derive the reproduction — that is `materia-reproduce-bug`'s role.
  The RED evidence and failing test path(s) come from `reproduction.md`; this
  skill reads them, it does not re-run or re-create them.
- **Does NOT** design new resources or new API surfaces — a bug fix is a
  correction to existing behavior, not a new feature.

## Rules

- **`## Affected files` must be complete.** Every file the fix will touch must
  appear in this section. This is the load-bearing reconciliation target for
  `materia-plan-tasks` — an incomplete list produces missing tasks; an inflated list
  produces unnecessary tasks. Neither is acceptable.
- **Fix approach is a sketch, not a design.** Name the change shape and the
  standards to read; do not write implementation steps. `materia-plan-tasks` writes
  the steps.
- **Do not skip the standards/resource docs listing.** The `## Fix approach`
  section's standards list is the docs-scope floor `materia-plan-tasks` propagates
  to each task. Omitting it means tasks may not read the right standards.
- **Commit + push before returning.** The orchestrator checks pushed state.
- **Do not tick stage 2 until `bug-analysis.md` is committed.** The
  orchestrator reads the stage-2 checkbox to confirm this stage is done.

## Standalone use

Given a `reproduction.md` (from stage 1) and a bug report body, this skill
runs without the `/materia-fix-bug` orchestrator:

1. Pass the `reproduction.md` path and the report body (frontmatter stripped).
2. The skill synthesises root cause + affected files + fix approach and writes
   `bug-analysis.md`.
3. Output: `bug-analysis.md` — ready for `materia-plan-tasks` to decompose.

The next stage is `materia-plan-tasks`, which receives `bug-analysis.md` as its
decomposition source (in place of `architecture.md`).
