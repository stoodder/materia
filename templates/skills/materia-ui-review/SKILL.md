---
name: materia-ui-review
description: Fifth review angle in the ship-spec Review fan-out (UI-gated). Provisions the Eyes environment on-demand per MATERIA.md § Eyes, drives the app at the canonical viewport, captures screenshots and DOM snapshots per ui-test-plan.md flows, and returns structured "ui"-category findings into the remediation loop. Degrades gracefully on known Eyes-toolchain instability (records a STATUS note, returns empty findings, never blocks). Only spawned when the diff is UI-affecting; the gate is defined in materia-ship-spec/SKILL.md § Review — § UI-surface gate.
---

# materia-ui-review — Eyes-driven UI review angle

Drive the running app at the canonical viewport (`MATERIA.md` § Eyes), capture
screenshots and DOM snapshots per the feature's `ui-test-plan.md` flows, and
judge the rendered output against the repo's visual standards docs. Returns
structured findings under the `"ui"` category into `materia-ship-spec`'s remediation
loop. Runs as a subagent in `materia-ship-spec` § Review (the fifth angle, UI-gated —
only spawned when the diff is UI-affecting; the gate is defined in
`materia-ship-spec/SKILL.md` § Review — § UI-surface gate); usable standalone after
implement-task has committed the feature.

## Inputs

- `docs/specs/<dated-slug>/spec.md` — the feature spec (scope, user stories).
- `docs/specs/<dated-slug>/ui-test-plan.md` — the enumerated flows and per-state
  assertions to drive during the review.
- `docs/specs/<dated-slug>/design.md` § Cohesion anchors — the existing sibling
  screens each new/changed screen must visually match (see § Procedure step 5;
  absent on runs whose design predates the section — skip the comparison and
  note it).
- A provisioned Eyes environment (`MATERIA.md` § Eyes — provisioning recipe run
  as the first step of this skill; see § Procedure).
- The running app (brought up per `MATERIA.md` § Eyes / § Run it).

## Outputs

- A structured finding list with `category: "ui"` per the schema at
  `materia-ship-spec/SKILL.md` § Structured finding schema. Empty list on the
  instability degrade path.
- `STATUS.md` updated with `ui-review: ran` on success, or
  `ui-review: skipped (eyes-instability — degrade path)` on the degrade
  path.
- **`docs/specs/<dated-slug>/ui-proof/<flow>-<state>.png`** — one PNG per
  captured flow/state, committed to the feature branch (see § Procedure step 4
  and the discrete commit step that follows step 5). **Screenshots are a
  mandatory deliverable of this angle, not a by-product of the e2e run** — the
  PR's `## UI proof` block is built from them, and runs have shipped without
  visual proof when this was treated as best-effort. Any outcome that leaves
  `ui-proof/` empty MUST write an explicit reason note to `STATUS.md` § Notes
  (the exact eyes-instability line, or `ui-proof: capture failed — <reason>`):
  the orchestrator treats an empty `ui-proof/` with no note as a reviewer
  contract violation and recaptures in its own lane (`materia-ship-spec/SKILL.md`
  § Review — § Screenshot-presence check), and `materia-finalize` blocks on it.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Procedure

1. **Provision the Eyes environment** — run the provisioning recipe from
   `MATERIA.md` § Eyes as the first step. This is an explicit, on-demand call;
   it must be idempotent (safe to call when already provisioned), but it is
   NOT assumed to be ambient. Export any service environment variables the
   recipe names **in the same command** as the runner invocation (shell state
   does not persist between tool calls — see
   `.claude/skills/materia-ship-spec/resources/env-preflight.md` § Gate invocation
   notes).

2. **Run the e2e suite** at the canonical viewport (`MATERIA.md` § Eyes).
   Invoke the `test:e2e` gate command (`MATERIA.md` § Gate) and catch the exit
   code. If the exit signature matches a **known Eyes-toolchain instability**
   listed in `MATERIA.md` § Eyes, follow the instability degrade path (see
   § Instability degrade path) and stop. Any other non-zero exit code is a
   genuine test failure — surface it as a HIGH finding with
   `category: "ui"` and `recommendation: "revert"` naming the failing spec(s),
   then **continue to step 4 anyway**: screenshot capture does not depend on
   the suite passing, and a red suite plus screenshots is strictly more
   information for the remediation loop than a red suite alone. (When
   `MATERIA.md` § Gate has no `test:e2e` row, skip this step and proceed to
   capture — the judgement pass still runs.)

4. **Capture screenshots and DOM snapshots** per the flows enumerated in
   `ui-test-plan.md`. For each flow section in `ui-test-plan.md`:
   - Navigate to the flow's entry point.
   - At each loading/empty/error/ready state the plan names, capture a
     screenshot (or DOM snapshot for text-heavy assertions) so the judgment in
     step 5 is grounded in observed output, not inference.
   - **Persist each captured screenshot to disk** at
     `docs/specs/<dated-slug>/ui-proof/<flow>-<state>.png`:
     - `<flow>` = kebab-slug of the `## Flow <N>` heading text in
       `ui-test-plan.md`, with the leading `Flow N —` prefix stripped, derived
       using the normative kebab-slug algorithm from
       `docs/specs/_proposed/README.md` § Kebab-slug derivation.
     - `<state>` ∈ the closed set `loading` · `empty` · `error` · `ready`,
       matching the state the screenshot was taken in.
     - Files are keyed by `<flow>-<state>`, so a re-spawned `materia-ui-review`
       (resume) overwrites prior files cleanly — idempotent overwrite.
     - **Cap: ≤ 4 screenshots per flow** (one per state). Skip any additional
       captures beyond the four states; the skill enforces this cap, not the
       filesystem.
   - **Anchor captures.** Additionally capture each anchor screen named in
     `design.md` § Cohesion anchors — one `ready`-state screenshot per anchor,
     persisted as `ui-proof/anchor-<screen-slug>.png` (same kebab-slug
     derivation). Anchor shots do **not** count against the ≤4-per-flow cap.
     When `design.md` has no `## Cohesion anchors` section (a run whose design
     predates it), skip anchor capture and the step-5 comparison, and note
     `cohesion anchors absent (pre-cohesion design)` in the findings summary.
   - **Non-instability capture failure** (navigation timeout, write error
     mid-loop): write whatever was captured so far, commit the partial set in
     the commit step below, then surface the failure as a HIGH `"ui"` finding
     into the remediation loop. Partial proof still ships; the HIGH finding
     drives remediation normally. If the failure left **zero** PNGs on disk,
     additionally write `ui-proof: capture failed — <reason>` to `STATUS.md`
     § Notes — an empty `ui-proof/` must always carry a recorded reason.

5. **Judge rendered output against the repo's visual standards docs** (the
   visual-language / UI-components standards under `docs/standards/`). The
   rubric covers:
   - **Token discipline** — surfaces use the design-system tokens the visual
     standard names; raw literals that bypass the token system are findings.
   - **Surface conventions** — cards/regions separate the way the standard
     prescribes (tone shifts, spacing, borders — whatever the repo's rule is);
     a surface treatment the standard prohibits is a finding.
   - **Semantic color roles** — color used for the wrong semantic role per the
     visual standard is a finding.
   - **Tap targets & reach** — interactive elements meet the standard's
     target-size convention and primary actions sit within comfortable reach
     at the canonical viewport; a control that is visibly too small or
     stranded is a finding.
   - **Cross-screen cohesion (against the anchors)** — compare each
     new/changed screen **side-by-side with its anchor screenshots**: same
     surface treatment for the same roles, same spacing/typography
     scale, same header/nav treatment, same card/list/sheet idioms (the same
     component, not a near-duplicate). A screen that passes every token rule
     in isolation but visibly diverges from its anchors — heavier cards,
     different section-header weight, an ad-hoc list pattern where siblings
     share one — is a finding. This is the observed failure mode this angle
     exists to catch: features that *work* but don't cohere with the app.

   For each observed violation, produce one finding record per
   `materia-ship-spec/SKILL.md` § Structured finding schema with `category: "ui"`.
   Reference that schema by location — do NOT copy the schema inline here.

6. **Commit `ui-proof/` to the branch** — after the capture loop and
   judgement, and before returning findings to the orchestrator:

   ```bash
   git add docs/specs/<dated-slug>/ui-proof/
   git commit -m "ui-review: persist captured screenshots to ui-proof/"
   ```

   This step is a **no-op when zero files are staged** (the instability
   degrade path or any run where no screenshots were written — `git add`
   stages nothing and `git commit` exits without creating a commit). If
   `git add` or `git commit` fails for any other reason, record a note under
   `## Notes` in `STATUS.md` and **continue** — a commit failure never blocks
   the run; it degrades gracefully (treat like a non-instability degrade: the
   run proceeds and `materia-finalize` renders the degraded note). This commit does
   **not** open a PR; `materia-finalize` opens the single PR later.

7. **Return findings** to the orchestrator as the structured finding list
   described in step 5. The orchestrator feeds these into the existing ≤3-round
   remediation loop and severity rubric defined in `materia-ship-spec/SKILL.md` § Review.

## Instability degrade path

If the e2e run fails with a signature `MATERIA.md` § Eyes lists as **known
environment instability** (a specific exit code or error pattern that is not a
product bug):

1. Write the following line to `STATUS.md` under `## Notes`:
   `ui-review: skipped (eyes-instability — degrade path)`
2. **No screenshots are written.** `ui-proof/` is absent or empty — this is the
   degrade signal that `materia-finalize` reads (see § Outputs). The commit step (step 6)
   is a no-op because zero files are staged.
3. Return an **empty findings list** to the orchestrator.
4. Do **not** block the remediation loop or the proceed-to-finalize decision.
   The degrade is visible to the human reviewer via the STATUS.md note and the
   PR description (the orchestrator surfaces it there on the final round).

## Scope

This skill does **not**:

- Define the UI-surface gate — that is defined canonically in
  `materia-ship-spec/SKILL.md` § Review — § UI-surface gate. This skill assumes the
  orchestrator has already evaluated the gate and spawned it.
- Author or modify e2e spec files — those are written by the per-feature
  e2e-authoring task derived from `ui-test-plan.md`.
- Perform correctness, security, spec-adherence, or data-safety review — those
  are the other five angles in `materia-ship-spec` § Review fan-out.
- Automate visual baseline diffing — judgment is qualitative, Claude reviewing
  rendered output against the repo's visual standards rubric.
- Run a subset of the suite — the full `test:e2e` run is the default;
  `materia-plan-tasks` or the operator may introduce subset runs in future.

## Rules

- The Eyes provisioning recipe (`MATERIA.md` § Eyes) is always the first step —
  never skip it even if the environment appears already provisioned (the
  idempotency guarantee makes calling it again safe).
- Exporting the service environment variables the recipe names, in the same
  command as the runner, is mandatory.
- A known-instability signature is the degrade path — never treat it as a test
  failure blocker.
- All findings carry `category: "ui"` per `materia-ship-spec/SKILL.md`
  § Structured finding schema.
- The instability note written to STATUS.md must be exact:
  `ui-review: skipped (eyes-instability — degrade path)`.
- **≤ 4 screenshots per flow** (one per state: `loading`, `empty`, `error`,
  `ready`). Skip any additional captures beyond these four states. The skill
  enforces this cap; the filesystem does not.
- **Never return with an empty `ui-proof/` and no recorded reason.** Every
  zero-PNG outcome writes its note to `STATUS.md` § Notes — the
  eyes-instability line or `ui-proof: capture failed — <reason>`. Silence is
  the one outcome the orchestrator and `materia-finalize` treat as a contract
  violation.

## Done when

- The `test:e2e` run completed (or the instability degrade was recorded in
  STATUS.md, or the repo has no `test:e2e` gate and the step was skipped).
- Screenshots/DOM snapshots captured for each `ui-test-plan.md` flow and
  persisted to `docs/specs/<dated-slug>/ui-proof/` (or absent/empty on the
  degrade path — **with the reason note written to `STATUS.md`**).
- The `ui-proof/` commit step completed (or was a no-op on the degrade path).
- Findings returned to the orchestrator as a structured list with
  `category: "ui"` (or empty list on the degrade path).
- `STATUS.md` updated with the outcome line.

## Standalone use

After `materia-implement-task` has committed the feature and `ui-test-plan.md` exists in
the spec folder, invoke this skill with the spec's `<dated-slug>` to run the
UI review without a full `materia-ship-spec` orchestration. Verify that
`ui-test-plan.md` exists and that the feature branch is checked out before
running. The skill commits the STATUS update, persists screenshots to
`ui-proof/`, and returns findings; the caller decides how to act on them
(inline-fix, remediation task, or dismiss with rationale). Screenshots are
keyed by `<flow>-<state>`, so a re-run overwrites prior files cleanly
(idempotent overwrite).
