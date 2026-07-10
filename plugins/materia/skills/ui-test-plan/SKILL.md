---
name: ui-test-plan
description: From a feature spec and UX design, enumerate the UI flows worth guarding and produce a standalone ui-test-plan.md artifact at docs/specs/<dated-slug>/ui-test-plan.md. UI-gated pipeline stage inserted after design and before architecture; usable standalone after design returns. Stage 3 of the ship-spec pipeline (UI-gated — skipped and recorded on non-UI runs, sharing one predictive-form gate decision with the design stage).
---

# ui-test-plan — enumerate UI flows and write the test plan

Read `spec.md` + `design.md`, identify the UI flows worth guarding, and write a
`ui-test-plan.md` artifact the downstream `plan-tasks` stage consumes to derive
the e2e-authoring task. Runs as a subagent in `ship-spec` (UI-gated — only
spawned when the run is UI-affecting; the gate is defined in
`ship-spec/SKILL.md` § Review — § UI-surface gate, whose predictive form is a
single per-run decision covering both `design` and this stage — that gate
owns the timing and resolution); usable standalone after `design` returns.

## Inputs

- `docs/specs/<dated-slug>/spec.md` — the feature spec (user stories, scope,
  goals).
- `docs/specs/<dated-slug>/design.md` — the UX design (flows, screens, and their
  loading/empty/error/ready states).

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/ui-test-plan.md` — the UI test plan artifact written
  into the spec folder.
- `STATUS.md` — stage 3 checkbox ticked (or recorded as "skipped (non-UI)" if
  the orchestrator evaluated the gate and this skill was not spawned) and `Next:`
  set to `architecture`.
- Committed and pushed.

## Procedure

0. **UI self-gate (no-op in the orchestrated lane).** Before any provisioning or
reads, check `MATERIA.md` § Surface gates § UI-affecting. If it is `none` — this
repo ships no user-facing surface (`MATERIA.md` § Eyes is `none` too) — there are
no flows to guard: print one line —
`ui-test-plan: skipped (no UI surface — § UI-affecting is none)` — and end
cleanly, writing nothing. This gate is a no-op in the orchestrated lane:
`ship-spec` only spawns this stage on a UI-affecting diff, so the check
passes and the procedure below runs.

**Pure non-behavioral change → zero-flow waiver (short-circuit).** If the change
is purely non-behavioral — a palette/token-only swap, a presentation-only tweak
with no new or changed user-interactable flow — there is nothing to guard. Don't
adapt the "one section per guarded flow" template to say so at length: write a
**one-line zero-flow waiver** into `ui-test-plan.md` (e.g. "No guarded flows —
`<change>` is non-behavioral (palette/token-only); no loading/empty/error/ready
state changes."), tick stage 3 in `STATUS.md`, commit + push, and return. Use the
full procedure below only when at least one flow is worth guarding.

1. **Read** `docs/specs/<dated-slug>/spec.md` and
   `docs/specs/<dated-slug>/design.md` in full. Identify every user flow defined
   in `design.md` (each flow corresponds to a section or named path in the
   design document).

2. **Enumerate flows worth guarding.** For each flow from `design.md`, decide
   whether it is UI-affecting enough to warrant an e2e assertion. A flow is worth
   guarding when it:
   - Renders a distinct screen state the user interacts with (not a pure data
     mutation with no UI feedback), OR
   - Has a loading/empty/error/ready state that a regression could silently break.

   Skip flows that are pure server-side operations with no UI surface.

3. **Write one section per guarded flow** in `ui-test-plan.md`. Each section
   covers:
   - **Flow name** (match the name used in `design.md` exactly).
   - **Entry point** — the URL or navigation action that starts the flow.
   - **Assertions per state** — one assertion per loading/empty/error/ready state
     defined for that flow in `design.md`; skip a state `design.md` marks
     `n/a — <reason>` (no assertion against a state the design says cannot
     occur), and guard domain-specific states beyond the canonical four
     (e.g. "offline", "conflict") the same way when `design.md` defines them.
     Assertions describe *what the test should observe* (e.g. "heading is
     visible", "empty-state text reads X",
     "error banner contains Y", "value field shows seed value Z") — not the
     driver API calls (those belong in the implementation task).
   - **Runtime-behavior assertions from `design.md` § Assertions** — that
     section can carry assertions a static capture can't check (e.g. "the
     error state preserves the user's typed input"); this skill is the e2e
     lane that checks them — fold each into the flow section it belongs to,
     as an assertion for the relevant state. (The statically-checkable lines
     belong to the `design-conformance` review angle, not this plan.)
   - **Seed values** — note any seeded data values (`docs/standards/testing.md`
     seed-value assertion convention) the assertions should use.

4. **Read** `docs/specs/_templates/ui-test-plan.md` for the output shape. Then
   **Write** `docs/specs/<dated-slug>/ui-test-plan.md`. Use a top-level heading
   matching the feature name. Open with a one-sentence summary of how many flows
   are covered and link to `design.md` for the source. Then list each flow
   section from step 3.

5. **Persist:** tick stage 3 in `STATUS.md` and set `Next: architecture`;
   commit + push. **Orchestrator-lane exception:** when spawned by `ship-spec`/`fix-bug`, do **not** tick `STATUS.md` or commit it — the orchestrator owns both (see `ship-spec/SKILL.md` § STATUS.md ownership (orchestrator lane)); write only your own artifact.

## Done when

- `ui-test-plan.md` exists in the spec folder with one section per guarded flow
  and at least one assertion per loading/empty/error/ready state defined in
  `design.md` (a state `design.md` marks `n/a — <reason>` needs none; guard any
  domain-specific states it defines).
- `STATUS.md` stage 3 ticked; `Next: architecture`; committed and pushed.

## Scope

This skill does **not**:

- Write e2e test code — that is the e2e-authoring task `plan-tasks`
  derives from `ui-test-plan.md`.
- Enumerate all possible edge-case assertions — the plan covers the states
  `design.md` defines, not exhaustive coverage.
- Modify the e2e runner's config — that is part of the per-feature e2e-authoring
  task.
- Evaluate the UI-surface gate itself — the orchestrator evaluates
  `ship-spec/SKILL.md` § Review — § UI-surface gate before spawning this skill;
  this skill assumes it has been gated in.

## Standalone use

After `design` has committed `design.md`, invoke this skill with the spec's
`<dated-slug>` to produce `ui-test-plan.md` without running a full `ship-spec`
pipeline. Verify `design.md` exists before running. The skill commits and pushes
`ui-test-plan.md` + the STATUS tick, leaving the repo ready for the `architecture`
stage.
