---
name: fix-bug
description: Drive a reported bug from docs/bugs/_reports/ to a merged TDD fix — reproduce RED first, then reuse plan-tasks → implement-task → review → docs-sync → finalize to fix GREEN and open one PR. Consumes a bug report (menu or named <id>); produces one PR with the fix, the reproduction tests, and the dequeued report. Use when the operator wants to drive a captured bug report through the full fix pipeline.
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
   **RED gate:** the orchestrator MUST verify `STATUS.md` stage 1 is ticked
   before advancing to stage 2 (see § RED gate).

2. **bug-analysis** (`bug-analysis`) → `bug-analysis.md`. Spawned only after
   the RED gate passes.

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

**The orchestrator MUST verify `STATUS.md` stage 1 is ticked (checked) before
spawning `bug-analysis`.** The check is machine-readable from the `STATUS.md`
field — specifically, the stage-1 checkbox line (`- [x] 1. reproduce-bug …`
must be `[x]`, not `[ ]`). Do not rely on prose or subagent return values
alone; read the committed `STATUS.md` from the remote.

**On `Blocker:`:** if `reproduce-bug` wrote `Blocker:` to `STATUS.md` instead
of ticking stage 1, stop. Surface the blocker text to the human and wait for
the operator to clear it (corrected repro steps, re-invocation). Do not
advance to `bug-analysis`.

Two and only two `Blocker:` exits from `reproduce-bug`:
- `Blocker: cannot reproduce — <reason>`
- `Blocker: test passes on pre-fix code — bug may already be fixed or repro steps insufficient`

Either means stage 1 is not ticked and the pipeline must pause.

## plan-tasks input substitution

`plan-tasks` receives `bug-analysis.md` in place of `architecture.md` as its
decomposition source. No edit to `plan-tasks/SKILL.md` is needed — the
orchestrator parameterises the path in the spawn prompt.

**The exact spawn prompt text to pass to `plan-tasks`:**

> Your decomposition source ("architecture.md" in this skill's text) is
> `docs/bugs/<dated-slug>/bug-analysis.md`. Read it wherever the procedure says
> "architecture.md". Also read `docs/bugs/<dated-slug>/reproduction.md` (for the
> TDD exit condition) and the bug report body. Write `tasks.md`,
> `STATUS.md`, and commit under `docs/bugs/<dated-slug>/`. `bug-analysis.md`'s
> **Affected files** list is the "Affected existing resources" set for your
> § step-3 reconciliation and pre-task grep validation.
> **Stage-number override:** your procedure says "tick stage 5 in STATUS.md",
> but in this bug-run STATUS.md `plan-tasks` is **stage 3** (stage 4 is
> `implement`). Tick **stage 3**, not stage 5, and set `Next: T1`.

**Why the stage-number override matters.** `plan-tasks/SKILL.md` step 6
hard-codes "tick stage 5" because in the *spec* pipeline plan-tasks is
checkbox row 5. The bug pipeline's stage list is `reproduce-bug ·
bug-analysis · plan-tasks · implement · review · docs-sync · docs-audit ·
finalize`, so plan-tasks is stage 3. Without the override the reused skill
would tick stage 5 (`review`) on its own commit. This is a spawn-prompt
content override, not a fork — `plan-tasks/SKILL.md` is untouched.
(The other reused stage skills don't collide: `finalize` carries its
own per-template row numbers — row 9 spec / row 8 bug — and the
`implement`/`review`/docs-stage ticks are orchestrator-driven here.)

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
§ Fallback.

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

## Finalize (dequeue + PR)

Spawn the `finalize` skill with the bug-run folder path and the dequeue target.
`finalize` runs its normal behavior re-check → gate → PR flow
unchanged (docs-sync ⇄ docs-audit already ran as stages 6–7). The **one bug-run delta is the dequeue**, and it must be driven
**explicitly by this orchestrator's spawn prompt** — not left to `finalize`'s
built-in step 4'.

Why: `finalize`'s step 4' only recognizes the spec-pipeline `## Provenance`
block and its `Proposed-spec:` field (pointing into `docs/specs/_proposed/`). A
bug-run `STATUS.md` carries `## Bug-report provenance` / `Bug-report:`
(pointing into `docs/bugs/_reports/`) instead, so `finalize`'s own step 4'
finds no spec proposal and skips silently. Relying on it would leave the report
un-dequeued. Keeping `finalize` unforked means the orchestrator supplies the
bug-queue dequeue procedure in the spawn prompt, mirroring step 4''s semantics
over the bugs queue.

The spawn prompt must pass:

- **Bug-run folder:** `docs/bugs/<dated-slug>/` (where docs-sync, the behavior
  re-check, and the PR-body artifact links point).
- **Dequeue target:** the **parent folder** of the `Bug-report:` path from the
  bug-run `STATUS.md` `## Bug-report provenance` block. `Bug-report:` stores the
  `report.md` file path (e.g. `docs/bugs/_reports/<dated-slug>/report.md`); strip
  the trailing `/report.md` to derive the report folder
  `docs/bugs/_reports/<dated-slug>/`. That folder — not the `report.md` file — is
  the dequeue target so that co-located evidence (`.png`, `.html`) is removed with it.

And must instruct `finalize` to perform the dequeue **after** its gate (step 3)
and acceptance (step 4) pass, mirroring step 4''s semantics:

1. If `Bug-report:` is `—` (ad-hoc run), **skip the dequeue silently**.
2. Derive `<report-folder>` as the parent folder of the `Bug-report:` path (strip
   trailing `/report.md`). **Path guard:** before any `git rm`, verify the
   derived folder matches
   `docs/bugs/_reports/<yyyy-mm-dd-hhmmss>-<id>-<slug>/` exactly (no `..`,
   no leading `/`, confined to `_reports/`) — a STATUS field is data, not a
   trusted path. Quote it. Then stage the removal: `git rm -r <report-folder>`. If the
   folder is already gone (operator removed it mid-run), skip the `git rm -r` and
   note "_report already removed from `_reports/`_" in the PR body — not a Blocker.
3. Re-run `node scripts/check-docs.mjs` against the staged removal. If green, commit
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
  reproduction, not by a UX design.
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
  `reproduce-bug` until `STATUS.md` stage 1 is ticked. This is the one
  discipline the feature pipeline lacks.
- **GREEN-after invariant:** the reproduction test(s) must be green in the
  final merged branch. The review pass confirms this explicitly.
- If a stage contradicts the bug analysis, stop and ask rather than guess.
