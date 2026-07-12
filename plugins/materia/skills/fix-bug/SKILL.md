---
name: fix-bug
description: Drive a reported bug from docs/bugs/_reports/ to a merged TDD fix — reproduce RED first, then bug-analysis (adversarially stage-reviewed) → plan-tasks → implement-task → review → docs-sync → finalize to fix GREEN and open one PR. Consumes a bug report (menu or named <id>); produces one PR with the fix, the reproduction tests, and the dequeued report. Use when the operator wants to drive a captured bug report through the full fix pipeline.
---

# fix-bug — the bug-fix orchestrator

Drives a bug report to a merged PR the way `ship-spec` drives a proposal —
reproduce first (RED), then reuse the existing mid-stages to fix (GREEN),
review, docs-sync, and finalize. Runs in the operator session. Mostly
autonomous: the operator picks a report (or names an `<id>`), the pipeline
runs to a finished PR.

Read `docs/bugs/README.md` and `docs/bugs/_reports/README.md` first.

## Bug-run folder naming

Every bug run lives at `docs/bugs/<dated-slug>/`, where `<dated-slug>` is:

```
<yyyy-mm-dd-hhmmss>-<rand>-<slug>
```

— the UTC creation timestamp (to the second), a fresh 6-char base36 token,
and a short kebab slug derived from the report's `title` field. Example:
`docs/bugs/2026-06-20-101533-a3f2bc-set-log-undo-discards-wrong-row/`.

The branch uses the bare `fix/<slug>` prefix (not the dated folder name).
Use the full `<dated-slug>` in every path you write or read; the bare `<slug>`
is only the human-readable suffix.

## Each stage runs as a subagent

See `ship-spec/SKILL.md` § "Each stage runs as a subagent" — the rule is
identical: spawn every stage with the Agent tool, pass only its inputs (prior
artifacts + the stage skill) plus the standing rules from ship-spec's spawn
contract — read them with
`cat "$CLAUDE_PLUGIN_ROOT/skills/ship-spec/resources/spawn-contract.md"`
(Block 1 always; Block
2 for stages/tasks; Block 3 for reviewers), verify the artifact + commit on
return, and run independent implement tasks as parallel worktree-isolated
subagents (`isolation: "worktree"`). The one-time session preflight from
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` applies before the
first code-touching spawn, exactly as in ship-spec.

## Resume (run first, every time)

If the operator names a bug id (e.g. `b1a2c`) or a slug (e.g.
`set-log-undo-discards-wrong-row`) and a matching in-flight bug-run folder
exists, **resume — do not restart**.

**Match precedence** (first match wins):

1. **`Bug-id` match** — if any `docs/bugs/*-<slug>/STATUS.md` carries
   `Bug-id: <id>` matching the operator's input (interpreted as an id), resume
   that folder. The id match is the canonical resume key — it survives slug
   collisions.
2. **Slug suffix match** — match by the kebab `<slug>` suffix of the bug-run
   folder. If multiple folders share a suffix, prefer the newest by timestamp prefix.

Then:

1. Read its `STATUS.md`. Find the first unchecked stage (and within implement,
   the first task in `tasks.md` not `[x]`).
2. If `Blocker:` is set, surface it to the human and stop until resolved.
3. Otherwise continue from there.
4. If `retro.md` already exists in the folder, **open and append** — never
   restart it. If header `status:` is `blocked`, set it back to `running` once
   the blocker is cleared. See § Retrospective capture.
Fresh run: go to **§ Bug-report selection** (below) first.

## Bug-report selection (the run's entry point)

Every fresh `/materia:fix-bug` invocation begins here (after the Resume gate has
ruled out an in-flight run).

### Inputs to dispatch on

When the operator invokes the skill, classify their input:

| Input shape | Behavior |
|---|---|
| `/materia:fix-bug` (no args) | Enter the **menu** — list pending reports and ask the operator to pick. |
| `/materia:fix-bug <id>` where `<id>` matches a frontmatter `id` under `docs/bugs/_reports/*/report.md` | Skip the menu, resolve to that report, advance. |
| `/materia:fix-bug <slug>` matching a Resume case | Handled by the Resume gate above; never reaches selection. |

### Discovery

Glob the queue:

```bash
git ls-files 'docs/bugs/_reports/*/report.md'
```

One `report.md` per report folder. For each surviving
path, parse the frontmatter (see § Frontmatter parser) and validate required
fields (`id`, `title`, `severity`, `date`, `status: reported`). **Validate
`id` against `^[a-z0-9]{4,8}$`** — it is interpolated into branch names,
commit messages, and STATUS fields; a non-conforming id is dropped like a
parse failure. Drop any file
whose parse failed or whose `status` isn't `reported`, recording a one-line
warning so the operator sees why a file was skipped.

### In-flight pickup

Before printing the menu, scan all `docs/bugs/*-*/STATUS.md` for `Bug-id:`
lines whose value matches any pending report's `id`. Mark those reports as
**`(in flight — docs/bugs/<dated-slug>/)`** in the menu — picking one
re-enters the Resume gate for that folder rather than starting a parallel run.

### Empty queue → graceful exit

Zero pending unclaimed reports AND no ad-hoc text:

```
No pending bug reports under docs/bugs/_reports/.

You can:
  - Run /materia:report-bug to capture a new reproducible bug report, or
  - Hand-write a report at docs/bugs/_reports/<dated-slug>/report.md
    (see docs/bugs/_reports/README.md for the contract).

Exiting cleanly. No branch created, no files written.
```

End the turn.

### Present the menu

If the discovery set is non-empty:

- **AskUserQuestion available AND ≤4 unclaimed reports.** Build options from
  the reports: each option label is `<id> — <title>`, description is
  `<severity> · <date>`. The "Other" option (always present) lets the operator
  type an id explicitly.
- **>4 reports OR AskUserQuestion not available (Auto Mode).** Print the full
  list as text and end the turn, awaiting the operator's next message with
  an `<id>`.

### Resolve the selection

Given the operator's `<id>`, scan all frontmatter blocks under
`docs/bugs/_reports/*/report.md` for a match. **Match by `id` only, never by
filename.** If zero matches, halt with `Unknown bug id: <id>` and end the
turn. If multiple files share an id (contract violation), halt with the
duplicate paths and end the turn.

## Frontmatter parser + Kebab-slug derivation

See `ship-spec/SKILL.md` § "Frontmatter parser" for the normative BOM-aware,
line-anchored parse algorithm. The same parser applies here (the bug report
queue contract at `docs/bugs/_reports/README.md` § Consumer responsibilities
mandates the same `^---\r?\n` strip).

For slug derivation, apply the `## Kebab-slug derivation` algorithm from
`docs/specs/_proposed/README.md`
to `frontmatter.title` — it is **normative** and shared; cite, don't re-state.

## Stake-and-mint

After the selection resolves, the orchestrator mints the run and stakes its
claim before spawning any subagent. This makes the pick durable on disk.

1. Strip frontmatter from the report file (BOM + `^---\r?\n` opener +
   `^---\r?\n` closer). The body is the bare bug report text.
2. Mint `<dated-slug>`: the UTC creation timestamp
   (`date -u +%Y-%m-%d-%H%M%S`) + fresh 6-char base36 token + the kebab
   slug derived from `frontmatter.title`.
3. Create branch `fix/<slug>` off latest `<trunk>` (the trunk per
   `MATERIA.md` § Version control).
4. `mkdir docs/bugs/<dated-slug>/`.
5. Seed `STATUS.md` from `docs/bugs/_templates/status.md`, filling:
   - `Slug:` → `<dated-slug>`
   - `Branch:` → `fix/<slug>`
   - `Updated:` → today's date
   - `## Bug-report provenance` block:
     - `Bug-id:` → `frontmatter.id`
     - `Bug-report:` → `docs/bugs/_reports/<dated-slug>/report.md`
     - `Bug-source:` → `frontmatter.source`
     - `Bug-severity:` → `frontmatter.severity`
6. Seed `retro.md` from `docs/specs/_templates/retro.md` (fill `slug`,
   `branch`, `started_at`).
7. Commit:
   ```
   fix-bug(stake): claim report <id> as docs/bugs/<dated-slug>/
   ```
8. Push.

## Pipeline

Run in order, each as a subagent; **commit + push after each completes** so a
new session can resume from the remote. After every first-level stage, run the
**retrospective touchpoint** described in § Retrospective capture. Before each
spawn, resolve the tier first and pass it as the `model` override — see
§ Tier routing.

1. **reproduce-bug** (`reproduce-bug`) → `reproduction.md` + failing test(s).
   **RED gate:** the orchestrator independently verifies the committed RED
   artifacts (`reproduction.md` + the failing test in the pushed commit, re-run
   to confirm RED where a runnable command exists) and is itself the one that
   ticks stage 1 before advancing to stage 2 (see § RED gate).

2. **bug-analysis** (`bug-analysis`) → `bug-analysis.md`. Spawned only after
   the RED gate passes. After it returns and its artifact is verified +
   committed, the orchestrator runs the `architecture-stage` review over the
   returned `bug-analysis.md`, before `plan-tasks` spawns — see § Bug-analysis
   stage review (mechanics: `ship-spec/SKILL.md` § "Stage reviews (design &
   architecture)" — § "Architecture-stage review").

3. **plan-tasks** (`plan-tasks`) → `tasks.md`. See § plan-tasks input
   substitution for the exact spawn prompt.

4. **implement** (`implement-task`, once per task, dependency order; independent
   tasks may run as parallel worktree-isolated subagents). Each task commits its
   own work and ticks `tasks.md`. No per-task adversarial review — implementers
   build to the standards and leave the local gate green. The spawn prompt adds:
   the path to `docs/bugs/<dated-slug>/reproduction.md` (so the implementer
   knows which tests must flip RED → GREEN) and the TDD exit condition:
   "reproduction test(s) from `reproduction.md` pass (green); full suite green."

5. **review** (orchestrator-spawned, post-implementation). After every task in
   `tasks.md` is `[x]`. See § Review for the angles and the loop.

6. **docs-sync** (`docs-sync`) → doc edits committed. Spawned after the
   review loop exits clean. **The exact spawn-prompt substitution** (mirrors
   § plan-tasks input substitution — a content override, not a fork):

   > Your run folder is `docs/bugs/<dated-slug>/`. Wherever your procedure
   > reads `docs/specs/<dated-slug>/spec.md`, read the bug report body
   > (provided below) instead; wherever it reads `architecture.md`, read
   > `docs/bugs/<dated-slug>/bug-analysis.md`. All other inputs (the branch
   > diff, `docs/contributing.md`'s touch-map, the named docs) are unchanged.

7. **docs-audit** (`docs-audit`) → verify pass. **Orchestrator-managed
   loop identical to `ship-spec/SKILL.md` § Pipeline step 9:** on
   HIGH/MEDIUM findings re-spawn docs-sync then docs-audit; **bound ≤2
   rounds**; on non-convergence write `Blocker` and stop.

8. **finalize** (`finalize`) → behavior re-check, gate, dequeue report,
   PR opened. See § Finalize for the spawn prompt additions.

After each stage: update `STATUS.md` (tick the stage, set `Next`), then
commit + push.

## RED gate

**The orchestrator independently verifies the RED, then ticks stage 1 itself
before spawning `bug-analysis`** — it never trusts a subagent's self-tick or
bare return value. `reproduce-bug` commits + pushes its own artifacts
(`reproduction.md` + the failing test) but, in this lane, does **not** touch
`STATUS.md`. The gate is machine-checkable from those committed artifacts:

1. **Confirm the artifacts are in the pushed commit** `reproduce-bug` returned:
   `reproduction.md` present and the failing test file present (read the
   committed state from the remote — not local working-tree, not prose, not the
   subagent's summary).
2. **Re-run the failing test to confirm RED** wherever `MATERIA.md` § Gate
   provides a runnable test command (scope it to the new test file). Where the
   test cannot run in this environment, the committed RED-evidence block in
   `reproduction.md` (verbatim failing output + command + SHA) is the
   **designated verified artifact** in its place.
3. On success, **the orchestrator ticks stage 1 itself** (`- [x] 1.
   reproduce-bug …`), sets `Next: bug-analysis`, and commits + pushes the
   `STATUS.md` update.

**On `Blocker:`:** if `reproduce-bug` returns a blocker instead of confirmed
RED artifacts, **the orchestrator writes the `Blocker:` line to `STATUS.md`**
and stops. Surface the blocker text to the human and wait for the operator to
clear it (corrected repro steps, re-invocation). Do not advance to
`bug-analysis`.

Two and only two `Blocker:` returns from `reproduce-bug`:
- `Blocker: cannot reproduce — <reason>`
- `Blocker: test passes on pre-fix code — bug may already be fixed or repro steps insufficient`

Either means the RED is unconfirmed, stage 1 stays unticked, and the pipeline
must pause.

## Bug-analysis stage review

After `bug-analysis` (stage 2) returns and its `bug-analysis.md` is verified
and committed (per § "Each stage runs as a subagent"), and before
`plan-tasks` (stage 3) spawns, the orchestrator runs the `architecture-stage`
angles over `docs/bugs/<dated-slug>/bug-analysis.md` — the bug lane's arrival
at `ship-spec/SKILL.md` § "Stage reviews (design & architecture)" —
§ "Architecture-stage review" Point 2, which names this file as the wiring's
home. The angle set (`MATERIA.md` § Review angles registry rows carrying the
`architecture-stage` token), the spawn (Block 1 + Block 3a), the ≤3-round
loop, revision (re-spawn `bug-analysis` with the findings as feedback), the
commit-subject format (`stage-review(architecture-stage, <dated-slug>): r<N> —
<H> HIGH, <M> MEDIUM addressed, <L> LOW noted`, with `— converged` appended on
the converging round), the § Notes recording vocabulary, the
zero-rows/missing-file degradation, and the non-convergence
`Blocker: architecture stage-review did not converge after 3 rounds
(<summary>)` are all that section's, reused verbatim — this skill adds only
the bug-lane wiring below.

No `design-stage` point exists on this lane: a bug is scoped by its
reproduction, not a UX design (§ Scope) — no `design` stage ever runs, so no
`design-stage` angle rows are evaluated here.

**Bug-lane deltas:**

- **Input substitution (oracle remap).** The artifact under review is
  `docs/bugs/<dated-slug>/bug-analysis.md`. Every angle spawn for this point
  carries the following remap, mirroring § plan-tasks input substitution's
  style:

  > The artifact under review is `docs/bugs/<dated-slug>/bug-analysis.md`.
  > Your intent oracle — where `spawn-contract.md` Block 3a names `spec.md`
  > (and `design.md` for an `architecture.md` review) — is instead the bug
  > report body (frontmatter stripped) plus
  > `docs/bugs/<dated-slug>/reproduction.md` plus the reproduction test
  > path(s) it names. There is no `spec.md` or `design.md` on this lane.

- **The angle checks apply unchanged.** Both `architecture-stage` registry
  rows — `architecture-grounding` and `architecture-coverage` — already carry
  their bug-lane variant inline (each angle file's own "Bug lane:" paragraph:
  grounding requires the Affected-files list to be grounded in the
  reproduction evidence; coverage requires the root cause to fully explain the
  RED evidence and the fix scope to cover the whole affected surface, not just
  the one reproducing case). No instruction beyond the oracle remap above is
  needed.

## plan-tasks input substitution

`plan-tasks` receives `bug-analysis.md` in place of `architecture.md` as its
decomposition source. No edit to `plan-tasks/SKILL.md` is needed — the
orchestrator parameterises the path in the spawn prompt.

**The exact spawn prompt text to pass to `plan-tasks`:**

> Your decomposition source ("architecture.md" in this skill's text) is
> `docs/bugs/<dated-slug>/bug-analysis.md`. Read it wherever the procedure says
> "architecture.md". Also read `docs/bugs/<dated-slug>/reproduction.md` (for the
> TDD exit condition) and the bug report body. Write `tasks.md` under
> `docs/bugs/<dated-slug>/` and commit only that artifact — per your own
> orchestrator-lane exception, do **not** tick or commit `STATUS.md`.
> `bug-analysis.md`'s **Affected files** list is the "Affected existing
> resources" set for your § step-3 reconciliation and pre-task grep validation.

**Bug-lane stage number (for the orchestrator's tick).** `plan-tasks` runs
under its own orchestrator-lane exception here (`plan-tasks/SKILL.md` step 6):
it writes `tasks.md` and does **not** tick `STATUS.md`. The **orchestrator**
owns the tick. The bug pipeline's stage list is `reproduce-bug · bug-analysis ·
plan-tasks · implement · review · docs-sync · docs-audit · finalize`, so
`plan-tasks` is stage 3 — when the orchestrator ticks after `plan-tasks`
returns, it ticks **stage 3**, not stage 5 (the reused skill's spec-pipeline
row), and sets `Next: T1`. This is a spawn-prompt content override, not a
fork — `plan-tasks/SKILL.md` is untouched. (The other reused stage skills don't
collide: `finalize` carries its own per-template row numbers — row 9 spec / row
8 bug — and the `implement`/`review`/docs-stage ticks are orchestrator-driven
here.)

Three consequences the template + sub-skill must guarantee so the substitution
is lossless:

1. **`bug-analysis.md` must contain an "Affected files" section** (the
   "Affected existing resources" analogue) — otherwise `plan-tasks` step-3
   reconciliation has nothing to diff against. Enforced by the
   `docs/bugs/_templates/bug-analysis.md` shape.
2. **Every task in the emitted `tasks.md` that touches code-under-test must
   carry the TDD exit AC**: "reproduction test(s) from `reproduction.md` pass
   (green); full suite green." The orchestrator's spawn prompt instructs
   `plan-tasks` to add this AC (it's a content instruction, not a behavior
   change — `plan-tasks` already writes testable ACs).
3. **`plan-tasks`'s non-product-feature defaults apply unchanged.** For a bug
   that is itself a docs/skill bug, its § "Non-product features" path
   (single-file decomposition, `Tests: none — read-against-spec`) already
   handles it; for a product-code bug, its layer stratification applies. No
   bug-specific branch is needed.

## Tier routing

See `ship-spec/SKILL.md` § "Tier routing" and `MATERIA.md` § Tiers — the
resolve→availability→map→spawn steps are identical. The new sub-skills'
tiers resolve from `MATERIA.md` § Tiers § Skill routing (rows
`reproduce-bug`, `bug-analysis`), with availability checked per
`MATERIA.md` § Tiers § Model set and the fallback per `MATERIA.md` § Tiers
§ Fallback. The § Bug-analysis stage review angle spawns are not among these
rows — like every review angle, they carry their own `Tier` in the
`MATERIA.md` § Review angles registry, with the orchestrator's per-run
override, per `ship-spec/SKILL.md` § "Tier routing".

## Fresh-context reviewer spawning

See `ship-spec/SKILL.md` § "Fresh-context reviewer spawning" — the rule is
identical: subagents cannot spawn subagents, so all reviewers and the
docs-audit are **orchestrator-spawned**.

## Subagent liveness

See `ship-spec/SKILL.md` § "Subagent liveness (long-running spawns)" — the
poll-don't-block and stall-as-resumable-failure rules are identical.

## Review (post-implementation)

See `ship-spec/SKILL.md` § "Review (post-implementation)" — the angles in the
`MATERIA.md` § Review angles registry (each defined in `.materia/review-angles/`;
ui UI-gated, data-safety data-gated),
tiers, fresh-context exclusions, structured finding schema, severity rubric,
loop-on-findings, session-limit fallback, simultaneous-N crash handling, and
tiebreaker are all identical.

**Bug-run delta:** reviewers also confirm the reproduction test(s) from
`reproduction.md` stayed GREEN after the fix. Include the reproduction test
path(s) in every reviewer prompt so they can verify the RED→GREEN flip is
intact in the cumulative diff.

**No `spec.md` in the bug lane — remap the reviewer's intent oracle.**
`spawn-contract.md` Block 3 lists `spec.md` among the docs a reviewer may read
as the change's intent ("…and `spec.md`"). A bug run has no `spec.md`; state in
every reviewer spawn prompt that the intent oracle is instead the **bug report
body + `docs/bugs/<dated-slug>/bug-analysis.md` +
`docs/bugs/<dated-slug>/reproduction.md`** — the same remap this skill already
makes for docs-sync and plan-tasks.

## Finalize (dequeue + PR)

Spawn the `finalize` skill with the bug-run folder path and the dequeue target.
`finalize` runs its normal behavior re-check → gate → PR flow
unchanged (docs-sync ⇄ docs-audit already ran as stages 6–7). The **one bug-run
delta in finalize's procedure is the dequeue**, and it must be driven
**explicitly by this orchestrator's spawn prompt** — not left to `finalize`'s
built-in step 3'.

Why: `finalize`'s step 3' only recognizes the spec-pipeline `## Provenance`
block and its `Proposed-spec:` field (pointing into `docs/specs/_proposed/`). A
bug-run `STATUS.md` carries `## Bug-report provenance` / `Bug-report:`
(pointing into `docs/bugs/_reports/`) instead, so `finalize`'s own step 3'
finds no spec proposal and skips silently. Relying on it would leave the report
un-dequeued. Keeping `finalize` unforked means the orchestrator supplies the
bug-queue dequeue procedure in the spawn prompt, mirroring finalize's step 3'
(the spec-queue dequeue) semantics over the bugs queue.

The spawn prompt must pass:

- **Acceptance intent oracle (no `spec.md` in the bug lane):** `finalize`'s
  acceptance cross-check (its step 3) reads `spec.md`; a bug run has none.
  Instruct `finalize` to cross-check acceptance against the **bug report body +
  `docs/bugs/<dated-slug>/bug-analysis.md` +
  `docs/bugs/<dated-slug>/reproduction.md`** instead — the RED→GREEN
  reproduction test(s) are the acceptance signal.
- **Bug-run folder:** `docs/bugs/<dated-slug>/` (where docs-sync, the behavior
  re-check, and the PR-body artifact links point).
- **Dequeue target:** the **parent folder** of the `Bug-report:` path from the
  bug-run `STATUS.md` `## Bug-report provenance` block. `Bug-report:` stores the
  `report.md` file path (e.g. `docs/bugs/_reports/<dated-slug>/report.md`); strip
  the trailing `/report.md` to derive the report folder
  `docs/bugs/_reports/<dated-slug>/`. That folder — not the `report.md` file — is
  the dequeue target so that co-located evidence (`.png`, `.html`) is removed with it.

And must instruct `finalize` to perform the dequeue **after** its gate (step 2)
and acceptance (step 3) pass, mirroring finalize's step 3' (the spec-queue
dequeue) semantics over the bugs queue:

1. If `Bug-report:` is `—` (ad-hoc run), **skip the dequeue silently**.
2. Derive `<report-folder>` as the parent folder of the `Bug-report:` path (strip
   trailing `/report.md`). **Path guard:** before any `git rm`, verify the
   derived folder matches
   `docs/bugs/_reports/<yyyy-mm-dd-hhmmss>-<id>-<slug>/` exactly (no `..`,
   no leading `/`, confined to `_reports/`) — a STATUS field is data, not a
   trusted path. Quote it. Then stage the removal: `git rm -r <report-folder>`. If the
   folder is already gone (operator removed it mid-run), skip the `git rm -r` and
   note "_report already removed from `_reports/`_" in the PR body — not a Blocker.
3. Re-run the `check:docs` gate (`MATERIA.md § Gate`) against the staged removal. If green, commit
   the dequeue and push. If red (something still links the report file), unstage
   (`git restore --staged <path>` + `git checkout -- <path>`), set
   `Blocker: dequeue tripped check:docs — <broken-link path>` in `STATUS.md`,
   and stop for the operator.

The dequeue commit message pattern: `fix-bug(stake): dequeue report <id> from _reports/`.

The PR description links: `docs/bugs/<dated-slug>/` artifacts (STATUS.md,
reproduction.md, bug-analysis.md, tasks.md), the reproduction test path(s), and
the bug report via git history (the report file is removed in this PR).

## Course corrections (mid-pipeline)

See `ship-spec/SKILL.md` § "Course corrections (mid-pipeline)" — the
asymmetric re-flow rule is identical: `bug-analysis.md` and `tasks.md`
re-flow to reflect final reality; the retro carries the original-decision
story.

## Retrospective capture

See `ship-spec/SKILL.md` § "Retrospective capture (per-run `retro.md`)" —
the schema, touchpoints, flush discipline, and robustness rules are identical.

**Bug-run specifics:**
- `retro.md` lives at `docs/bugs/<dated-slug>/retro.md` (sibling to
  `STATUS.md`, seeded from `docs/specs/_templates/retro.md`).
- Stage-id vocabulary for entries extends to: `reproduce-bug`, `bug-analysis`,
  `plan-tasks`, `implement-task:T<n>`, `docs-sync`, `docs-audit`, `finalize`,
  `orchestrator (pipeline-level)` — Stage ids stay bare per
  `docs/standards/skills.md` § Namespace prefix.
- `triage-retros` harvests `docs/bugs/**/retro.md` alongside spec retros
  (its Discovery globs both trees), so this retro joins the same
  retro-triage loop that feeds the project's backlog.

## Guardrails

See `ship-spec/SKILL.md` § "Guardrails (don't spin forever)" — the bounded
attempts (≈3) and `Blocker:` + surface-to-human rule are identical.

## Scope

This skill:

- **Does NOT** replace `ship-spec` — bugs and features stay distinct loops
  sharing the reusable mid-stages.
- **Does NOT** add design or architecture stages — a bug is scoped by its
  reproduction, not by a UX design. § Bug-analysis stage review is not a new
  pipeline stage and does not change any review angle's definition: it
  reviews the *existing* bug-analysis stage's own artifact, reusing the
  `architecture-stage` review point ship-spec already defines.
- **Does NOT** modify `triage-retros` or any of the reused stages — it
  only changes the *inputs* a bug run feeds them.
- **Does NOT** change the behavior of `plan-tasks`, `implement-task`, the
  review angles, `docs-sync`, or `finalize` beyond passing them different input
  paths and the TDD exit condition.

## Rules

- Keep `STATUS.md`, `tasks.md`, and `retro.md` live + pushed after every stage
  — they are the resume state and audit trail.
- Every code change follows the standards + Definition of Done
  (`docs/contributing.md`); update docs in the same change.
- Never force-push the shared branch. Open exactly one PR (in finalize).
- **RED-before-fix invariant:** the orchestrator never advances past
  `reproduce-bug` until it has verified the committed RED artifacts
  (`reproduction.md` + the failing test in the pushed commit) and ticked
  stage 1 itself. This is the one discipline the feature pipeline lacks.
- **GREEN-after invariant:** the reproduction test(s) must be green in the
  final merged branch. The review pass confirms this explicitly.
- If a stage contradicts the bug analysis, stop and ask rather than guess.
