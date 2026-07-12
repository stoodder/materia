# Specs & the spec-to-ship pipeline

Each feature gets its own **timestamped folder** here, named

```
.materia/docs/specs/<yyyy-mm-dd-hhmmss>-<rand>-<slug>/
```

— the UTC creation timestamp to the second, a fresh 6-character base36
token (e.g. `ab24f9`), and a short kebab-case feature slug. Example:
`.materia/docs/specs/2026-06-13-142530-ab24f9-csv-export/`. This makes every spec folder
globally unique and chronologically sortable — in true creation order, even
when two features share a slug or a day. The bare `<slug>` is still used for the branch name (e.g. `csv-export`);
the full dated form is used everywhere a path is written.

Each folder holds the artifacts the pipeline produces, in order:

```
.materia/docs/specs/<yyyy-mm-dd-hhmmss>-<rand>-<slug>/
  STATUS.md        ← resumable pipeline state (stages done, next stage/task, blocker, PR, ## Provenance block)
  spec.md          ← what & why (problem, users, acceptance criteria)
  design.md        ← UX flows, screens, states (UI-gated — absent on non-UI runs)
  design/          ← committed static canvas snapshot + README (present iff the design-tool adapter can export/reconstruct — MATERIA.md § Design tool)
  architecture.md  ← technical plan, grounded in .materia/docs/ (reuses existing resources)
  tasks.md         ← dependency-ordered tasks with acceptance criteria
  retro.md         ← per-run retrospective; appended after each stage + orchestrator self-review (see ship-spec skill)
```

Templates live in [`_templates/`](_templates/). They're filled in by the
pipeline skills (installed via the `materia` plugin, invoked as
`/materia:<skill>`), but you can write any of them by hand too.

**Where a run starts.** `ship-spec`'s entry point is the proposed-specs
queue at [`_proposed/`](_proposed/README.md) (see § Proposed specs below).
On a fresh invocation, `ship-spec` lists pending proposals; the operator
picks one by `id`. The selected proposal's body becomes the spec input,
and `finalize` includes the proposal's `git rm` in the same PR — closing
the queue → ship loop. An **ad-hoc** fallback path remains: the operator
can paste a freeform spec instead of picking from the queue, in which case
the `## Provenance` block is filled with `—` and no dequeue happens.

## The pipeline (the installed `materia` plugin's skills)

Stage skills, chained by the `ship-spec` orchestrator. Configured to run
**mostly autonomously**: clarifying questions are asked once during intake.
On an **interactive, design-bearing** (UI) run there's one more checkpoint —
the design gate, which pauses for your approve / revise / abandon call after
the design stage (`ship-spec/SKILL.md` § Design gate) and can pause again per
revision round — then the run continues through to a finished PR for you to
review. `--auto` (autopilot) and `--approve-design` runs don't pause at the
gate. After the PR opens, the orchestrator watches CI, fixes failures, and
resolves merge conflicts on **every** run — surfacing the PR at green for you
to review. Autopilot goes further still: checkpoints accept grounded defaults,
and once the watch reaches green it **additionally merges** — see the ship-spec
skill's Autopilot + PR watch sections.

| Stage | Skill | Produces |
|---|---|---|
| 1. Intake | `intake-spec` | `spec.md` (asks clarifying questions) |
| 2. Design | `design` | `design.md` (UI-gated; skipped+recorded if non-UI), plus `design/` (a committed canvas snapshot — present iff the adapter can export/reconstruct); stage-reviewed adversarially before the human gate — the `design-stage` angles |
| 3. UI-test-plan | `ui-test-plan` | `ui-test-plan.md` (UI-gated; skipped+recorded if non-UI) |
| 4. Architecture | `architecture` | `architecture.md` (reads `.materia/docs/`, reuses resources; on non-UI runs also carries the operator-surface enumeration design would); stage-reviewed — the `architecture-stage` angles |
| 5. Plan | `plan-tasks` | `tasks.md` |
| 6. Implement | `implement-task` | code + tests per task (no per-task review — see row 7) |
| 7. Review | — (orchestrator-spawned review fan-out) | the seven post-implementation angles in the `MATERIA.md` § Review angles registry, each defined in `.materia/review-angles/` (correctness · security · spec-adherence+regression · behavior · ui UI-gated · data-safety data-gated · design-conformance design-gated); the registry's other five angles (design-coherence · design-feasibility · design-fidelity gated to `design-stage`, architecture-grounding · architecture-coverage gated to `architecture-stage`) are stage-review angles that already ran earlier, at rows 2 and 4 — not part of this fan-out; remediation tasks loop back; UI runs must land committed `ui-proof/` screenshots (screenshot-presence check) |
| 8. docs-sync | `docs-sync` | doc edits committed (cross-cutting docs reconciled under intent-oracle rules) |
| 9. docs-audit | `docs-audit` | HIGH/MEDIUM/LOW findings or clean verdict; loop back to docs-sync on HIGH/MEDIUM |
| 9½. reconcile-epic | `reconcile-epic` | **epic-gated** (spawned only when the proposal carries an `epic:` key; skipped+recorded otherwise): syncs the member's epic under [`.materia/docs/epics/`](../epics/README.md) and cascades invalidated content into its pending sibling proposals — the edits ride this run's PR |
| 10. Finalize | `finalize` | re-runs `verify` for `behavior-deferred` tasks, then the gate (lint + typecheck + tests + `check:docs`), PR opened |
| — Orchestrate | `ship-spec` | runs 1→10 (pausing at the design gate on interactive design-bearing runs — not on `--auto`/`--approve-design` runs; and, on every run, the post-finalize § PR watch: CI fixes → conflict resolution → surface at green for review; on `--auto` it additionally merges) |

The pipeline **builds on this repo's docs system**: the architecture stage uses
the progressive-disclosure read order ([../README.md](../README.md)), the
implement stage follows the standards + Definition of Done
([../contributing.md](../contributing.md)), and finalize runs the same gates CI
does.

## Closing the loop — `triage-retros` (retro triage)

A manually-invoked skill consumes the `retro.md` files that ship-spec and
fix-bug capture and turns their signal into **project-specific** backlog
items. It is **not** a pipeline stage — it runs after a stretch of ship-spec /
fix-bug runs. Retros feed the project (proposed specs + bug reports), not
the pipeline skills themselves:

| Skill | Produces |
|---|---|
| `triage-retros` (retro triage) | Clusters retro signal **in-memory** and authors it **directly** into both queues under `source: retro-triage`: product improvements become proposed specs in `.materia/docs/specs/_proposed/`, defects become 13-section bug reports in `.materia/docs/bugs/_reports/`. Consolidates related signal (specs bundle related stories up to `propose-spec`'s split line; reports fold same-defect signal only), de-duplicates the drafts against the pending queues + the recent merge log (nothing silently discarded — a dropped/parked list rides the confirmation and the PR), renames each consumed `retro.md` → `retro.processed.md` across both `.materia/docs/specs/**/` and `.materia/docs/bugs/**/`, and opens exactly one PR (no auto-merge). Pure pipeline/harness friction is out of scope — it produces no artifact. |

It is a single-hop producer for **both** queues: one confirmation, one PR,
retro straight to reviewable proposal/report. See `triage-retros` for the
full procedure.

## Bug reports — sibling queue

A separate `.materia/docs/bugs/` tree (queue at [`.materia/docs/bugs/_reports/`](../bugs/_reports/README.md),
overview at [`.materia/docs/bugs/README.md`](../bugs/README.md)) mirrors this one for
bug reports. Producers that write into the queue: `/materia:report-bug` (operator-described bugs),
`/materia:triage-retros` (authors bug reports clustered from retro signal, `source: retro-triage`),
and `/materia:ui-inspection` (drives the live app
across the full surface-map and files one consolidated checklist bug report).
`/materia:fix-bug` is the consumer that drives a report through reproduce-bug (RED gate)
→ bug-analysis → plan-tasks → implement → review → docs-sync ⇄ docs-audit →
finalize (dequeue), opening one PR at terminal state.

## Proposed specs — the shared intake queue (`triage-retros`, `propose-spec`, and future producers)

[`.materia/docs/specs/_proposed/`](_proposed/README.md) is a **shared intake surface**
where proposed specs from any source land for operator review. It is a
**transient queue** — files at the top level are pending proposals; once a
proposal is reviewed it reaches a terminal state (run through `ship-spec`, or
deleted as rejected) and is removed from the directory. The directory should
trend toward empty.

The frontmatter contract (`id`, `source`, `source_refs`, `title`, `date`,
`status: proposed`) and the filename pattern
(`<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md`, matching the `<yyyy-mm-dd-hhmmss>-<rand>-<slug>`
shape used by spec folders) are documented in
[`_proposed/README.md`](_proposed/README.md). Any producer that drops a file
there MUST conform; any consumer that reads from there MAY rely on it.

| Skill | Source key | Produces |
|---|---|---|
| `triage-retros` | `retro-triage` | Clusters retro signal into proposed specs (product improvements), presents every draft for approval with a de-dup dropped/parked list, then on approve writes the file(s), renames each consumed `retro.md` → `retro.processed.md`, and opens a single PR (no auto-merge). Also authors bug reports into the sibling `_reports/` queue in the same run. |
| `propose-spec` | `user-proposed` | Drafts proposed specs from the user's raw idea via in-conversation Q&A; splits sprawling ideas into separate single-shippable-unit proposals. Q&A is in-memory; on approve it branches, writes the file(s), commits, and opens a PR. |
| `propose-epic` | `epic` | Develops the operator's large multi-spec idea into an epic under [`.materia/docs/epics/`](../epics/README.md) (iterative brainstorm Q&A + a parallel low-tier web-research fan-out), then decomposes it into 2–N member proposals wired by a `depends_on` dependency graph — epic folder + members land in one PR. When a member is later shipped, `ship-spec`'s epic gate spawns the sibling `reconcile-epic` skill (pipeline mode) to sync the epic from as-built reality and cascade changes into the remaining pending members inside the member's own PR; standalone `/materia:reconcile-epic` is the backstop. |

See `triage-retros`, `propose-spec`,
and `propose-epic`
for the full procedures. Epics themselves (the parent initiative documents,
their member-linkage contract, and the `reconcile-epic` cascade lifecycle)
live in the sibling tree at [`.materia/docs/epics/`](../epics/README.md). New producers (market-research, user-feedback, etc.)
add themselves to the table in [`_proposed/README.md`](_proposed/README.md), and
follow the skill-authoring conventions in
[../standards/skills.md](../standards/skills.md).

## Resumable, run by subagents

- **Every stage runs as its own subagent** with only its inputs (the prior
  artifacts) in context — `ship-spec` spawns them. Each skill declares its
  **Inputs / Outputs**. Independent implementation tasks run as parallel,
  worktree-isolated subagents.
- **Reviewers, `docs-sync`, and `docs-audit` all run as fresh-context subagents spawned by the orchestrator.** The post-implementation review angles run once, over the cumulative branch diff — each angle its own subagent (no anchoring on the implementers' reasoning). The stage-review angles run earlier, at their own stage's point (design, pre-gate; architecture, pre-`plan-tasks`) — see `ship-spec/SKILL.md` § Stage reviews (design & architecture). `docs-sync` (edit) and `docs-audit` (verify) are sibling stages between review and finalize. Each receives only its declared inputs (diff + AC + named docs + `spec.md`) — never the producing agent's commit messages, `STATUS.md`, or other reviewers' outputs.
- **Every stage commits + pushes** its artifact and updates `STATUS.md` as it
  finishes, so a fresh session can pull and continue.
- **Resume:** re-invoking `ship-spec` reads `STATUS.md`, finds the first
  incomplete stage/task, and continues — it never restarts.
- **Guardrails:** an autonomous loop (a task's review, or the finalize gate) is
  bounded to ~3 rounds; it exits early when findings converge (a LOW-only round,
  or HIGH/MEDIUM already dismissed) before reaching the bound. If it can't
  converge it writes a `Blocker` into `STATUS.md` and stops for a human, rather
  than spinning. Clearing the blocker makes the run resumable again.

## Index

| Slug | Feature | Stage |
|---|---|---|
