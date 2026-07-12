<!-- The pipeline's resumable state for this feature. `ship-spec` reads this to
     resume across sessions. Every stage updates it, then commits + pushes. -->
# <Feature> — status

- **Slug:** <dated-slug>  <!-- full folder name: yyyy-mm-dd-hhmmss-<rand>-<slug> -->
- **Branch:** <type>/<slug>  <!-- branch uses the bare slug, not the dated folder name -->
- **Updated:** <date>

## Provenance

<!-- Filled by `ship-spec` at proposal selection (the run's entry point).
     `finalize` reads this block to decide whether to dequeue the proposal
     from `docs/specs/_proposed/` in the same PR. For ad-hoc runs (no
     proposal), every field is `—` and `finalize` skips the dequeue silently.
     Older STATUS.mds that predate this block are also treated as ad-hoc. -->

- **Proposed-id:** <id from the proposal frontmatter, or `—` for ad-hoc>
- **Proposed-spec:** <`docs/specs/_proposed/<filename>` at selection time, or `—`>
- **Proposed-source:** <`source` from the proposal frontmatter, or `—`>
- **Proposed-source-refs:** <comma-separated `source_refs[]` values, or `—`>
- **Proposed-id-selection:** <`manual` | `named-arg` | `auto-deferred` | `autopilot` | `—`>
  <!-- manual = operator picked at the menu; named-arg = operator typed
       `/materia:ship-spec <id>`; auto-deferred = Auto Mode active and the
       orchestrator surfaced the menu and ended the turn rather than
       silently pick (the next operator reply re-resumes with the chosen
       id, which then writes `manual`); autopilot = `--auto` run with
       exactly one pending proposal — auto-picked without the menu. -->
- **Epic-id:** <`epic` from the proposal frontmatter, or `—` when the
  proposal is not an epic member (or the run is ad-hoc)>
  <!-- Non-`—` ⇒ the epic gate is positive: the orchestrator spawns the
       `reconcile-epic` stage (pipeline mode) between docs-audit and
       finalize — see ship-spec/SKILL.md § Pipeline. -->

## Autopilot posture

<!-- The orchestrator owns this block (like ## Provenance). Written once at
     run start from the `--auto` invocation flag; the Resume gate preserves it
     (an explicit `--auto` on a resume upgrades off → on; nothing downgrades
     implicitly). `on` ⇒ operator checkpoints auto-accept grounded defaults
     and, after finalize, the run continues into ship-spec's § Merge watch
     (CI fixes, conflict resolution, merge on green). See
     ship-spec/SKILL.md § Autopilot. -->

- **auto:** off (no `--auto` at invocation)
  <!-- or: on (`--auto` passed at invocation) -->

## Stages

<!-- CANONICAL NOTE — the two stage-numbering scales (single source of truth).
     Two stage-numbering scales coexist BY DESIGN; this note is the one place
     they are explained, and SKILL.md "Stage N of the pipeline" lines should
     cross-reference it ("stage numbering: see docs/specs/_templates/status.md
     § Stages") rather than re-explaining the duality each time.

       - STATUS-checkbox scale (used by these checkboxes): the
         post-implementation `review` pass and the epic-gated `reconcile-epic`
         stage are gates that produce no artifact in this folder, so neither
         has a checkbox here — docs-sync/docs-audit/finalize are rows 7/8/9.
         The scale has 9 rows (1 through 9); both no-checkbox stages record
         their outcome as gate-decision lines in § Notes. Rows 2–3 (design,
         ui-test-plan) are UI-gated and may be skipped on non-UI runs — one
         predictive-form gate decision (resolved once per run — declared at
         stake or via intake) covers both; when
         skipped, each checkbox is ticked as "skipped (non-UI)" and the gate
         decision is recorded in § Notes — never left perpetually blank.
       - Logical-stage scale (used by SKILL.md "Stage N of the pipeline" prose):
         counts `review` as a stage but not `reconcile-epic` (a gated
         interstitial, "stage 9½" informally), so finalize is "Stage 10" there.

     Both are correct in their own frame; a finding that flags their coexistence
     as a bug is by-design (carry it in the docs-audit dismissed-findings list).
     Fully unifying the two scales is a separate, larger proposal.

     - The design gate (ship-spec/SKILL.md § Design gate) has no checkbox row
       of its own — it is not a tenth row inserted after design. Row 2 (design)
       may be ticked while gate approval is still pending: gate state lives in
       `Next:` (`design-approval (awaiting operator)` /
       `design-abandoned (parked)`) plus the `design.md` approval block, not
       in this checkbox scale. This is why ship-spec's Resume step 0 keys on
       the approval block rather than the checkbox scan — a scan alone would
       walk right past a ticked-but-unapproved row 2. -->

- [ ] 1. intake — `spec.md`
- [ ] 2. design — `design.md` (UI-gated; skipped+recorded if non-UI)
- [ ] 3. ui-test-plan — `ui-test-plan.md` (UI-gated; skipped+recorded if non-UI)
- [ ] 4. architecture — `architecture.md`
- [ ] 5. plan-tasks — `tasks.md`
- [ ] 6. implement — per-task (see `tasks.md` statuses)
- [ ] 7. docs-sync — doc edits committed
- [ ] 8. docs-audit — audit clean, no HIGH/MEDIUM
- [ ] 9. finalize — behavior re-check, gate green, PR opened

## Current

- **Next:** <the stage or task id to do next>
  <!-- Two design-gate waiting states, alongside the ordinary stage/task
       names — both are legitimate pauses, not Blockers:
         Next: design-approval (awaiting operator)  — the run is paused for
           the human design-review gate; the design stage's checkbox (row 2)
           may already be ticked while this stands — see § Stages CANONICAL
           NOTE above.
         Next: design-abandoned (parked)  — the design was abandoned by
           operator decision; parked, not blocked; the design stage's
           checkbox stays ticked. See ship-spec/SKILL.md § Design gate. -->
- **Blocker:** none <!-- or: a description of why the run paused for a human -->
- **PR:** <link once finalize opens it>

## Behavior-deferred

<!-- Task IDs whose `verify` reviewer was skipped because they ran inside a
     parallel worktree-isolated slot (port + DB schema contention). `finalize`
     re-runs `verify` over the merged branch for the union of their
     user-visible acceptance criteria, retrying up to 2x to absorb flake. -->

- behavior-deferred: []  <!-- e.g. [T3, T5] -->

## docs-sync / docs-audit (filled in by the docs-sync and docs-audit stages)

<!-- One line after docs-sync completes (per round). -->

- docs-sync: not yet run
  <!-- after run, e.g.:
  - docs-sync: round 1 — coverage clean, accuracy sampled (5/5), 2 silent-oracle edits, links clean
  -->

- docs-audit: round N — N HIGH, N MEDIUM, N LOW; verdict: clean

## Notes

<!-- Anything the next subagent/session needs to know to pick up cleanly. -->

<!-- Gate-decision convention — the orchestrator writes one of these lines
     here after evaluating the UI-surface gate (defined canonically in
     ship-spec/SKILL.md § Review — § UI-surface gate; the design/ui-test-plan
     decision uses its predictive form, resolved once per run — from a
     declared `surfaces:` at stake, otherwise through intake):

     For the surfaces run-fact (the authoritative value; shape and
     semantics are defined in `_proposed/README.md` § Field roles —
     reference, don't restate here):
       Surfaces: [ui] | [ui, data] | [] | —

     The orchestrator writes this line either `declared` — copied straight
     from the proposal frontmatter's `surfaces:` at stake — or `resolved`
     — settled through intake, when the run started ad-hoc or the
     frontmatter omitted the field. `—` or a missing line means "unknown" —
     never treat it as "none". A `[]` value is read together with its
     `(declared|resolved)` provenance: `declared []` is a declared absence
     of any surface, while `resolved []` asserts only "no UI" (data
     unasserted) — see `ship-spec/SKILL.md` § Review — § UI-surface gate.

     For the predictive UI-surface gate (the umbrella decision the design
     and ui-test-plan lines below follow from):
       ui-surface (predictive): <positive|negative> (<declared|resolved> surfaces: […])

     The parenthetical is a derivative echo of the `Surfaces:` line above,
     not a second source of truth: `declared` on the frontmatter path,
     `resolved` on the absent (intake/Auto-Mode/autopilot) path.

     For design:
       design: skipped (non-UI — <reason>) | ran

     For ui-test-plan:
       ui-test-plan: skipped (non-UI — <reason>) | ran

     For ui-review:
       ui-review: skipped (non-UI — <reason>) | skipped (eyes-instability — degrade path) | ran

     For the data-safety review angle (ship-spec/SKILL.md § Data-surface gate):
       data-safety-review: skipped (non-data — <reason>) | ran

     On a non-UI run, the design and ui-test-plan checkboxes (rows 2–3) are
     ticked as "skipped (non-UI)" and the gate-decision lines recorded here. -->

<!-- Screenshot-presence convention (UI runs — ship-spec/SKILL.md § Review —
     § Screenshot-presence check):
       ui-proof: <n> screenshots committed
       ui-proof: capture failed — <reason>   (only after a failed
                 orchestrator-lane recapture; finalize blocks on an empty
                 ui-proof/ with no such note and no degrade/waiver line) -->

<!-- Autopilot merge-watch convention — on an --auto run the orchestrator
     records merge-watch progress here (pre-merge; see ship-spec/SKILL.md
     § Merge watch):
       auto-merge: watching PR #<n>
       auto-merge: CI fix round <n> — <summary>
       auto-merge: conflict resolved (<baseline> merged) -->

<!-- Design-gate convention (ship-spec/SKILL.md § Design gate is the
     normative home — the exact strings below are pinned there too):
       design-gate: awaiting approval
       design-gate: auto-approved (<reason>)
         (parenthetical is the full reason string verbatim, never a
         shortened flag form, e.g.:
           design-gate: auto-approved (--auto autopilot run)
           design-gate: auto-approved (MATERIA.md gate: off))
       design-gate: abandoned (<date>)
       design-gate: re-opened (<date>)
         (appended when the operator re-opens an abandoned gate,
         superseding the abandoned line; the block returns to pending)
       design-gate: auto-approve armed (--approve-design)
       design-gate: auto-approve consumed (--approve-design)
         (the armed line above is rewritten to this at consumption; a
         spent arm must never re-fire on a later re-opened gate)
       design-gate: <on|off> (proposal frontmatter)
         (the capture-at-stake line — written only when the proposal
         frontmatter declares `design_gate:`; durable through dequeue,
         like the `Surfaces:` line above) -->

<!-- Stage-review convention (ship-spec/SKILL.md § Stage reviews (design &
     architecture) is the normative home for both points' angle set, spawn,
     loop, and commit-subject format — the exact line shapes below are
     pinned there too). One line per point per outcome, `<point>` ∈
     `design-stage` (before the design gate's first arrival, design-bearing
     runs only) | `architecture-stage` (after `architecture` returns `ok`,
     before `plan-tasks`):
       stage-review(<point>): converged at round <N>
       stage-review(<point>): skipped (<reason>)
       stage-review(<point>): angle set adjusted — <reason>
     A stage-review spawn may also carry a tier-override line, same format
     as any other tier override (§ Tier routing):
       tier-override: <unit> <artifact-value> → <override-value>
     Stage reviews are orchestrator-lane phases like `review`
     (post-implementation): no STATUS.md checkbox row changes and no new
     retro touchpoints — only these § Notes lines. -->

<!-- Architecture-bounce convention (ship-spec/SKILL.md § Design gate —
     Architecture bounce is the normative home): when the architecture stage
     finds the approved design infeasible, the orchestrator records one line
     here per bounce — durable and resumable, since the ≤2 bounce bound is
     counted from these lines:
       design-revision (architecture): <reason> (bounce <n>/2)
         (<reason> is the short-form infeasibility cause — what cannot be built
          as designed; <n> is the bounce ordinal, 1 or 2) -->

<!-- Epic-gate-decision convention — like `review`, the `reconcile-epic`
     stage has no checkbox row (it edits artifacts outside this spec folder);
     the orchestrator records one of these lines here after evaluating the
     epic gate (Provenance `Epic-id:` non-`—`):

       reconcile-epic: skipped (non-epic) | ran (epic <id> synced; <n> pending members cascaded) -->


<!-- ui-coverage-waiver convention — when a UI-affecting feature intentionally
     ships without tests/e2e/ coverage, the operator records this line here:
       ui-coverage-waiver: <reason>
     The finalize skill reads this line; if it is present, finalize renders
     "No e2e coverage added — rationale: <reason>" in the PR body and the
     e2e-coverage gate passes. If a UI feature has no tests/e2e/ coverage and
     no ui-coverage-waiver line, finalize writes a Blocker and stops. -->

## Forward-compatible defaults

<!-- For specs created before these fields existed:
     - a `## Per-task review state` block with per-task `baselineSha` /
       review counts (pre-post-implementation-review template) → ignored;
       review runs once over the cumulative diff and its baseline is
       `<baseline>` (the ref `<remote>/<trunk>`, per `MATERIA.md` § Version
       control)
     - missing `behavior-deferred:` → `finalize` re-runs `verify` on all
       user-visible ACs (safer default)
     - missing `docs-sync:` row → the docs-sync stage creates it
     - missing `## Provenance` block → `finalize` treats as ad-hoc (no
       proposal dequeue)
     - missing `## Autopilot posture` block → resumes as `off` — never
       assume autopilot when the block is silent
     - missing `Surfaces:` line (and/or missing `ui-surface (predictive):`
       line) → treated as absent ("unknown"), routing to the UI-surface
       gate's absent path — this must degrade to today's behavior, never
       fail or mis-parse
     - a `design.md` with no `approval:` frontmatter block at all → a
       pre-gate run; ship-spec's Resume step 0 does not fire and resume
       behaves exactly as it did before the gate existed — never invent an
       approval state for it
     New runs should always fill these in. -->
