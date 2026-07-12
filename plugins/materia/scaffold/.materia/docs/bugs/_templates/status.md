<!-- The pipeline's resumable state for this bug run. `/materia:fix-bug` reads this to
     resume across sessions. Every stage updates it, then commits + pushes. -->
# <Bug title> — status

- **Slug:** <dated-slug>  <!-- full folder name: yyyy-mm-dd-hhmmss-<rand>-<slug> -->
- **Branch:** fix/<slug>  <!-- branch uses the bare slug, not the dated folder name -->
- **Updated:** <date>

## Bug-report provenance

<!-- Filled by `/materia:fix-bug` at report selection (the run's entry point).
     `/materia:fix-bug` reads `Bug-report:` to build the `finalize` spawn prompt, which
     instructs `finalize` to `git rm -r` the report folder from `.materia/docs/bugs/_reports/` in
     the same PR (finalize's own step 3' only recognizes the spec-pipeline
     `## Provenance` block, so the bug-run dequeue is orchestrator-driven).
     Omitting this block or setting any field to `—` means "no report to
     dequeue" (ad-hoc run). -->

- **Bug-id:** <id from the report frontmatter, or `—` for ad-hoc>
- **Bug-report:** <`.materia/docs/bugs/_reports/<dated-slug>/report.md` at selection time, or `—`>  <!-- stores the report.md FILE path (precise provenance); finalize derives the parent folder by stripping `/report.md` and runs `git rm -r <parent-folder>` so all co-located evidence (.png/.html) is removed with it; `—` means no dequeue -->
- **Bug-source:** <`source` from the report frontmatter, or `—`>
- **Bug-severity:** <`severity` from the report frontmatter, or `—`>

## Stages

- [ ] 1. reproduce-bug — reproduction.md + failing tests (RED gate: stage ticks only when reproduction confirmed RED)
- [ ] 2. bug-analysis — bug-analysis.md
- [ ] 3. plan-tasks — tasks.md
- [ ] 4. implement — per-task (see `tasks.md` statuses)
- [ ] 5. review — post-implementation (multi-angle)
  <!-- unlike the spec template (where review has no checkbox), the bug
       template gives review a row; the orchestrator ticks it when the
       review loop converges. -->
- [ ] 6. docs-sync — doc edits committed
- [ ] 7. docs-audit — audit clean, no HIGH/MEDIUM
- [ ] 8. finalize — behavior re-check, gate green, PR opened (dequeue)

## Current

- **Next:** <the stage or task id to do next>
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

<!-- Stage-review convention (ship-spec/SKILL.md § Stage reviews (design &
     architecture) is the normative home for the loop, angle set, spawn, and
     commit-subject format; fix-bug/SKILL.md § Bug-analysis stage review is
     this lane's wiring — the exact line shapes below are pinned in both).
     No `design-stage` point exists on this lane (a bug is scoped by its
     reproduction, not a UX design — no `design` stage ever runs), so
     `<point>` is always `architecture-stage` here — after `bug-analysis`
     (stage 2) returns, before `plan-tasks` (stage 3). One line per outcome:
       stage-review(architecture-stage): converged at round <N>
       stage-review(architecture-stage): skipped (<reason>)
       stage-review(architecture-stage): angle set adjusted — <reason>
     A stage-review spawn may also carry a tier-override line, same format
     as any other tier override (§ Tier routing):
       tier-override: <unit> <artifact-value> → <override-value>
     Stage reviews are orchestrator-lane phases like `review`
     (post-implementation): no STATUS.md checkbox row changes and no new
     retro touchpoints — only these § Notes lines. -->

## Forward-compatible defaults

<!-- For bug runs created before these fields existed:
     - a `## Per-task review state` block with per-task `baselineSha` /
       review counts (pre-post-implementation-review template) → ignored;
       review runs once over the cumulative diff and its baseline is
       `<baseline>` (the ref `<remote>/<trunk>`, per `MATERIA.md` § Version
       control)
     - missing `behavior-deferred:` → `finalize` re-runs `verify` on all
       user-visible ACs (safer default)
     - missing `docs-sync:` row → the docs-sync stage creates it
     - missing `## Bug-report provenance` block → `finalize` treats as ad-hoc
       (no report dequeue)
     New runs should always fill these in. -->
