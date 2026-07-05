---
name: apply-pipeline-improvements
description: The executor half of the triage-retros split. Run manually (schedulable later) after `triage-retros` has landed plans. Globs `docs/specs/_improvements/**/pipeline-improvements.md` for unprocessed improvement plans, builds a dimension-tagged candidate set from each plan's `## Actions`, runs a keep–supersede–conflict Pareto selection pass (surfacing any conflicts to the operator before any edits land), applies the selected deltas to the `ship-spec` pipeline skills with per-delta anti-regression notes, has a fresh-context subagent review the diff against the plan, opens one PR per plan (no auto-merge) with a keep/supersede/conflict disposition summary, and renames the consumed plan to `pipeline-improvements.processed.md` in the same PR. Consumes `pipeline-improvements.md` only — disjoint inputs and edit-paths from `suggestions-to-specs` (which consumes `product-suggestions.md`), so the two run in parallel. Idempotent via the rename; a failed run leaves the plan unprocessed for retry.
---

# apply-pipeline-improvements — apply the planned pipeline edits

The executor half of the two-skill `triage-retros` split. `triage-retros`
(the planner) scans retros and writes a reviewable `pipeline-improvements.md`; **this
skill applies that plan** — it implements each plan's `## Actions` against the
`ship-spec` pipeline skills, has a fresh-context subagent review the result,
opens a PR, and renames the consumed plan to `pipeline-improvements.processed.md` in
the same PR. The two halves are decoupled by the artifact: the planner stops
once the plan is on disk; this skill picks it up on its own schedule.

It runs **independently of `suggestions-to-specs`**: that skill consumes
`product-suggestions.md` and writes proposals under `docs/specs/_proposed/`; this skill
consumes `pipeline-improvements.md` and edits `.claude/skills/**`. The inputs and the
edited paths are disjoint, so the two can run in parallel without contending.

The stack is markdown + `git` + `gh` + the Claude Code skill harness — no
Prisma, no Nitro routes, no Vue. **Manual invocation only** for now (a schedule
can trigger it later); **one PR per plan**; **no auto-merge** — every
pipeline change is approved by a human on the PR.

**Philosophy: keep state in the diff, idempotent via the rename.** There is no
per-run audit folder, no envelope JSON, no resumability gate. A plan is
"unprocessed" iff it is still named `pipeline-improvements.md`; consuming it renames
it to `pipeline-improvements.processed.md` in the same PR that carries the edits. A
run that fails before its PR opens leaves the plan unprocessed, so a re-invoke
re-globs and retries it cleanly.

Read `.claude/skills/triage-retros/resources/actions-contract.md` (the
`pipeline-improvements.md` format + the `## Actions` contract this skill
parses; shape truth in
`docs/specs/_improvements/_templates/pipeline-improvements.md`) and the
`ship-spec` pipeline skills under `.claude/skills/` (the edit targets — this
skill changes the pipeline itself, the consequential part of the job) before
changing this skill.

## Discovery

Glob unprocessed plans from the repo root:

```bash
git ls-files 'docs/specs/_improvements/**/pipeline-improvements.md'
```

The glob pattern matches `pipeline-improvements.md` exactly, so
`pipeline-improvements.processed.md` is excluded by the pattern. As
**belt-and-braces** against future variants, additionally reject any path whose
basename matches `^pipeline-improvements\.processed(\..+)?\.md$`.

**Also reject any path containing a `/_templates/` segment.** The recursive `**`
glob matches the canonical fill-in stub at
`docs/specs/_improvements/_templates/pipeline-improvements.md`, which is a
template full of `<placeholder>` tokens, not a real plan — never consume it.

**Zero matches:** print the line below and **end the turn — no branch created,
nothing written.** The zero-match path is a clean no-op.

```
No unprocessed pipeline-improvements.md found under docs/specs/_improvements/. Nothing to do.
(Globbed: docs/specs/_improvements/**/pipeline-improvements.md — 0 matches, <M> already processed.)
```

For each surviving path, derive `{ path, slug }` where `slug` is the parent
folder name (e.g. `2026-06-21-9c2a3-weekly-roundup`). Print the set:

```
Found <N> unprocessed improvement plan(s):
  - docs/specs/_improvements/2026-06-21-9c2a3-weekly-roundup/pipeline-improvements.md  (weekly-roundup)
  …
```

Then process the plans **one at a time** — each gets its own branch and its own
PR (see `## Per-plan run`). One PR per plan keeps each independently reviewable
and traceable, and isolates a failure to a single plan.

## Plan parsing

Parse each plan with a **section regex over the raw markdown** — no AST walker,
same rationale as the planner's parser. The shape is fixed by
`triage-retros/resources/actions-contract.md` (shape truth: the `_templates/`
stub).

**`schema_version` is informational, not a gate.** Read it from the frontmatter
and record it; **do not hard-fail** on a version this skill doesn't recognise.
If the version is unknown, parse best-effort against the structure below and
note the version in the PR description so a human can sanity-check. The contract
this skill depends on is the `## Actions` section shape, which is stable across
minor version bumps.

### Fields to extract

From the **frontmatter**: `schema_version`, `slug`, `generated_at`,
`findings_total`, `findings_actionable`, `protected_contract_flagged`.

From **`## Actions`** — one record per `### A<n> — <title> → <finding ids>`
block, fields per `actions-contract.md` § The `## Actions` block: `id` and
`title` from the heading, then `skill`, `files[]`, `dimension[]`,
`change_summary`, `anchor_hint` (the literal
`_none — executor recomputes from the file at apply time._` parses as
**null** — recompute at apply time, see `## Implement loop`),
`protected_contract` (`true` when the value starts with `yes`; capture the
trailing `— <justification>`), and `motivating_findings[]`. **Legacy
default:** a block missing the `**Dimension:**` bullet records
`dimension: ["untagged"]` — untagged actions skip supersede/conflict
reasoning entirely, are always treated as **keep** (intent cannot be compared
without a dimension), and their count is surfaced in the PR body.

From **`## Findings`** (for the PR description traceback): per finding, its
`id`, `title`, `priority`, and `supporting[]` (`{ retro_path, anchor, quote }`).

From **`## PR description seed`**: the fenced `markdown` block, used as the PR
body base (see `## PR open`).

**Degradation is tolerable.** A missing optional field → record a one-line note
and keep the action. Only a plan with **zero parseable actions** is a hard stop
for that plan: skip it (leave it unprocessed), print a note, and move to the
next plan — a no-op plan (zero actionable findings) is legitimately empty and
the planner shipped it for the audit trail, so there is nothing to apply.

## Dimension vocabulary

Each action carries one or more **dimension** tags naming the improvement
dimension(s) the edit targets. The vocabulary — five seed tags, open-ended
for new kebab-case tags — lives in
`triage-retros/resources/actions-contract.md` § Dimension vocabulary (the
single source; no copy here). The executor reasons over tags during
candidate-set construction and Pareto selection (below), hands the vocabulary
to the fresh-context reviewer for the anti-regression check, and handles an
unknown tag gracefully — it participates in supersede/conflict reasoning by
its tag string like any other.

## Candidate-set construction

Built **before any edit lands** (Read-only), so the operator sees the selected
set and any conflicts up front. Insert this phase between plan parsing and the
implement loop (it is invoked at `## Per-plan run` → `### 2b`).

### Candidate-delta shape

Each parsed `### A<n>` action becomes one **candidate delta** characterized by
six fields:

- `id` — `A<n>`.
- `dimension[]` — the `**Dimension:**` tag(s) it targets (or `["untagged"]`).
- `files[]` — the target file path(s) it will edit.
- `anchor_hint` — the prose it will replace (may be null → recomputed at apply
  time).
- `change_summary` — one-line description of the change.
- `anti_regression_note` — **executor-derived at selection time, not parsed from
  the plan.** The planner never emits this field; the executor computes it from
  the dimensions of prior accepted deltas that touch overlapping files. Its
  content is:

  > `targets <dimension[]>; must not regress <dimensions of prior accepted deltas on overlapping files>`

  When no prior accepted delta touches any of this action's files, the note is:

  > `targets <dimension[]>; no prior accepted deltas on this file`

### Grounding overlap on the live files

To detect file overlap and incompatible intent against the current pipeline, the
construction phase **reads each `action.files[]` target at HEAD (Read-only)** —
reusing the existing `### 2. Re-read the targets at HEAD` rationale. No new write
path is introduced and the allowlist is unchanged; this phase only reads.

## Pareto selection rule

The selection pass runs over the parsed `actions[]` in `A<n>` order, maintaining
an **accepted set**. For each candidate action `C`:

**Step 1 — Supersede check.** Find all previously accepted actions `P` that
share **at least one `dimension[]` tag** with `C` **AND** edit **at least one
overlapping file**. For each such `P`:

- If `C`'s `change_summary` addresses the same prose improvement `P` addresses
  but is _more specific_, _more complete_, or _replaces the need for_ `P`: mark
  `C` as superseding `P`. **Remove `P` from the accepted set** and record
  "A\<C> supersedes A\<P>".
- Otherwise: fall through to the conflict check.

**Step 2 — Conflict check.** Find all previously accepted actions `P` that (a)
edit at least one **overlapping file** AND (b) have **incompatible intent** with
`C` on that file. "Incompatible intent" means the `anchor_hint` or
`change_summary` of `C` would reverse, contradict, or render meaningless the edit
`P` would make (or vice versa) — e.g. `P` adds a mandatory field to a procedure
step while `C` removes that step; or `P` tightens a prompt for `review-precision`
while `C` loosens the same prompt for `token-cost`. When a conflict is detected:

- Mark `C` as CONFLICT with `P`.
- **Exclude both `C` and `P`** from the accepted set (not last-wins).
- Record the conflict: "A\<C> vs A\<P>: \<one-line description of the
  incompatibility>".

**Step 3 — Keep.** If no supersede or conflict applies, add `C` to the accepted
set with disposition "keep". When the keep survived a Step-1/2 comparison
(`C` overlapped an accepted action's dimension + files but neither superseded
nor conflicted), record the one-line reason the two coexist — supersedes and
conflicts always carry their one-line reason, and these justification lines
travel into the operator ready output and the PR body's Action dispositions.
Independent keeps (no overlap examined) need no justification line.

An `"untagged"` action (legacy plan, no dimension) skips Steps 1–2 entirely and
is always added as **keep** — intent cannot be compared without a dimension.

### The three outcomes

| Outcome | Meaning |
|---|---|
| keep | Action is selected; improves its dimension without regressing another |
| supersedes A\<prev> | Action is selected; a prior accepted action on the same dimension + file is removed because C is strictly better |
| CONFLICT with A\<other> | Both actions are excluded; the conflict is surfaced in the operator output and the PR body |

### Worked examples

**Worked example A — supersede.** The plan has A1 (adds a note to
`ship-spec/SKILL.md` about resuming after a crash, `dimension:
resumability/robustness`) and A3 (rewrites the same paragraph to cover both
crash-resume and a timeout, `dimension: resumability/robustness`). When the pass
reaches A3: A1 and A3 share dimension `resumability/robustness` and both edit the
same section. A3's `change_summary` ("expand the crash-resume paragraph to cover
timeouts too") is strictly more complete than A1's ("add crash-resume note").
**Outcome:** A3 supersedes A1 — the accepted set drops A1 and adds A3.

**Worked example B — conflict.** The plan has A2 (shortens the intake-spec
preamble to save tokens, `dimension: token-cost`) and A5 (expands the intake-spec
preamble with a new required check, `dimension: review-precision`). A2 and A5
edit the same prose with incompatible direction — one shrinks it, the other grows
it. **Outcome:** A2 and A5 are **both excluded** as a CONFLICT pair. The PR body
notes "A2 vs A5: token-cost vs review-precision on intake-spec preamble —
re-draft to resolve".

**Worked example C — independent keep.** The plan has A1 (`ship-spec/SKILL.md`,
`dimension: review-precision`) and A4 (`docs-sync/SKILL.md`, `dimension:
docs-sync accuracy`). No overlapping files. **Outcome:** both are kept; no
supersede or conflict applies.

### Conflict resolution is the operator's job

The executor surfaces conflicts but does not resolve them — both-excluded is the
canonical rule (never silent last-wins). Conflicts are:

1. **Printed as operator output** at candidate-set construction time, before any
   edits land.
2. **Listed in the PR body** under a "Conflicts excluded — re-draft required"
   section.
3. **Not written to any log file** — the PR body and git history are the audit
   trail (no dedicated `superseded:` log file).

The operator re-runs `triage-retros` after merge to produce a follow-up plan
that resolves the conflict explicitly (prioritize one dimension, or split the
edit into two compatible sub-edits).

## Applied-delta convention

Each apply commit carries the action's anti-regression note as the commit-body
paragraph, appended after the existing subject line:

```
apply-improvements: A<n> — <action.title>

Targets: <action.dimension[]>
Must not regress: <dimensions of prior accepted deltas on overlapping files, or "none — first delta on this file">
```

This **extends** the existing `## Implement loop` → Step 6 (Commit per action)
message (today just the subject line) with the two-line body, so the
anti-regression note travels in git history and is visible to the fresh-context
reviewer.

It **composes with** the protected-contract trailer: when the action is flagged,
the existing `PROTECTED-CONTRACT CHANGE: <justification>` line is appended
**after** the `Targets:` / `Must not regress:` body (it does not replace it).

## Per-plan run

For each unprocessed plan, run this cycle on a fresh branch off the latest
`main`. Steps 3–7 below are the body of the run.

### 1. Sync main and branch

No writes have happened yet; branch first so every edit lands somewhere clean:

```bash
git checkout main && git pull
git checkout -b chore/apply-improvements-<plan-slug>
```

`<plan-slug>` is the plan's dated-slug parent folder name. If that branch
already exists locally (a prior run on the same plan), append a short hex
suffix (`openssl rand -hex 2`) to disambiguate. If `git pull` reports local
uncommitted changes that would block, halt with the conflict so the operator
can resolve before re-invoking.

### 2. Re-read the targets at HEAD

The plan's `anchor_hint`s were written against the pipeline skills as they
were when the plan was drafted. Before applying, **re-read each
`action.files[]` target at the current HEAD** so edits resolve against the
live file, not a stale snapshot. This is what makes anchor drift recoverable
(see `## Implement loop`).

### 2b. Candidate-set construction + Pareto selection

Before any edit lands, run the full candidate-set construction and Pareto
selection pass (see `## Candidate-set construction` and `## Pareto selection
rule`).

**Operator-output states:**

- **loading:** "Building candidate set from N actions… Reading target files
  at HEAD…"
- **empty (all-conflict halt):** All N actions were vetoed — the candidate
  set is empty after selection. Halt, print all conflicts, and leave the plan
  unprocessed. No branch state beyond the checked-out branch:

  ```
  Halting plan <slug>: all N actions conflict — candidate set is empty after selection.
  Conflicts:
    A1 vs A2: both modify <file> § <section> (incompatible)
    …
  Plan is left unprocessed. Re-draft via triage-retros to resolve the conflicts.
  ```

- **error (file read failure halt):** If any `action.files[]` target cannot
  be read at HEAD, halt with the file path and raw error; leave the plan
  unprocessed.
- **ready:** Print the selected set with per-action disposition before
  proceeding to the implement loop:

  ```
  Candidate set (N actions total):
    A1 — keep  (<dimension>)
    A2 — supersedes A<prev>  (<dimension>) — <one-line why A2 is strictly better>
    A3 — CONFLICT with A<other> on <file> § <section>
         A3 targets: <dimension>
         A<other> targets: <dimension>
         Conflict: <one-line incompatibility>
    A4 — keep  (<dimension>) — <one-line why it coexists with A1, when the keep survived a comparison>
    …
  Proceeding with <M> non-conflicting actions: A1, A2, …
  ```

### 2c. Pre-flight anchor validation

Before any edit lands, validate every **selected** action's non-null
`anchor_hint` against its target file at HEAD (`grep -F` for the exact
string): each hint must appear **exactly once**. Null-sentinel hints are
exempt (recomputed at apply time). Collect all failures across the whole
selected set before deciding:

- **All valid** → proceed to the implement loop.
- **Any drifted** (not found, or non-unique) → halt the plan with one
  complete drift report and leave it unprocessed:

  ```
  Halting plan <slug>: N anchor(s) drifted since the plan was written.
    A2 — <file>: anchor "<excerpt>" not found
    A5 — <file>: anchor "<excerpt>" matches 3 times (not unique)
  Plan is left unprocessed. Re-draft via triage-retros against the current
  files, or fix the hints by hand and re-invoke.
  ```

Fail-fast here means anchor drift never halts mid-loop with earlier actions
already committed on an abandoned branch. The planner validates hints at plan
time, so this preflight should rarely fire — it guards the window between
plan-merge and apply.

### 3. Implement loop

See `## Implement loop` — apply each action in `A<n>` order, one commit per
action, with an allowlist check before every commit.

### 4. Format + gate

See `## Format and gate` — format the touched files and confirm the full
local gate would pass before opening the PR, so the PR lands green.

### 5. Fresh-context review

See `## Fresh-context review` — spawn a fresh-context subagent to review the
branch diff against the plan, and address what it surfaces.

### 6. Mark processed

See `## Mark processed` — rename the plan to `pipeline-improvements.processed.md`
and append a footer, in one commit.

### 7. Push + open PR

See `## PR open` — push the branch and open one PR carrying the edits and the
rename. No auto-merge.

After the plan's PR is open, return to `main` (`git checkout main`) and process
the next unprocessed plan, if any, from step 1.

## Implement loop

Apply each action in `actions[]` order. Edits happen **inside this skill's own
context** — there is no per-action subagent. Per action `A<n>`:

**Step 1 — Load the target file(s).** `Read` each path in `action.files`
(almost always exactly one `.claude/skills/*/SKILL.md`).

**Step 2 — Apply the edit.** Use `Edit` with `action.anchor_hint` as
`old_string` and the change the action describes as `new_string`. If
`action.anchor_hint` is null (the planner emitted the `_none — executor
recomputes…_` sentinel), **recompute** an anchor: find a unique substring in
the current file that fits `change_summary`, then `Edit`. Keep the edit
**minimal and faithful to `change_summary`** — apply what the plan calls for,
nothing more (see `## Guardrails`).

**Step 3 — Allowlist check (pre-commit).** Run the allowlist check (see
`## Allowlist enforcement`) against the working tree. If any path is outside
the allowlist, discard the stray path (`git checkout -- <path>`) and halt
without committing.

**Step 4 — Protected-contract check.** If the action targets
`.claude/skills/ship-spec/SKILL.md`, run the section-scoped diff (see
`## Protected-contract enforcement`). Halt if the edit fell inside
`## Retrospective capture` without a protected-contract flag.

**Step 5 — Non-empty check.** Run `git diff --name-only HEAD`. If the working
tree is unchanged (the edit was a no-op — content already matches), record a
no-op note and **skip the commit**; move on. Re-applying an already-present
change leaves no stray empty commit.

**Step 6 — Commit per action.** One commit per action, carrying the action's
anti-regression note as the commit body (per `## Applied-delta convention`):

```
apply-improvements: A<n> — <action.title>

Targets: <action.dimension[]>
Must not regress: <dimensions of prior accepted deltas on overlapping files, or "none — first delta on this file">
```

For a protected-contract action, append the trailer **after** the
`Targets:` / `Must not regress:` body (it composes with, does not replace it):
`PROTECTED-CONTRACT CHANGE: <justification>`. See `## Applied-delta convention`
for the full format rationale.

### Anchor-text drift

Rare after the `2c` preflight — this path now mostly covers null-sentinel
actions whose recompute can't find a fitting anchor. If `Edit` reports
`old_string not found` and the anchor can't be re-resolved from the current
file (the target text moved or was removed since the plan was written),
**halt this plan** and leave it unprocessed:

```
Halting plan <plan-slug>: action A<n> failed to apply.
  File: <file>
  Reason: anchor text "<anchor_hint excerpt>" not found (drift since the plan was written).
The plan is left unprocessed. Re-invoke to retry (the loop re-reads the file at
HEAD), or have triage-retros re-draft the action against the current file.
```

Discard any partial working-tree change for the failed action
(`git checkout -- <file>`) so the retry starts clean, end the turn, and (since
nothing was renamed) the next run re-globs this plan.

## Allowlist enforcement

Because this skill **edits the very pipeline that feeds it**, a stray edit could
break the loop. The allowlist confines every action's diff to the pipeline
skills and the run's own plan file.

### The allowlist regex

Applied to `git diff --name-only` output. The rows:

```
^\.claude/skills/.*$                                                  # the pipeline skills — the edit targets
^docs/specs/_improvements/<PLAN_SLUG>/pipeline-improvements(\.processed)?\.md$   # the plan + its processed rename/footer
^docs/specs/_templates/.*$                                            # ONLY when a flagged action exists (see below)
```

`<PLAN_SLUG>` is **interpolated** from the current plan's dated slug before each
check. This skill does **not** edit `product-suggestions.md`, the `_proposed/` queue,
retros, product source, or the improvements `README.md` — any of those in the
diff is out-of-scope and halts.

### Conditional `_templates/**` row

Row 3 is included **iff** the plan has at least one action with
`protected_contract === true`. A plan with no flagged action **cannot** edit the
retro template; the allowlist halts the action first, even if a bad recompute
smuggled a stray template edit into the diff.

### Two enforcement points

- **Pre-commit (per action)** — `git diff --name-only HEAD` inside the
  Implement loop Step 3, before each action's commit.
- **Pre-PR sweep** — `git diff --name-only main...HEAD` before `gh pr create`,
  defense-in-depth over the whole branch.

### Halt behavior

- **Pre-commit stray:** `git checkout -- <path>` for each out-of-allowlist path
  (preserving the rest of the action for a clean retry), then halt without
  committing the action.
- **Post-commit stray (pre-PR sweep):** do **not** auto-revert. Print the
  offending file + commit SHA and end the turn; the operator decides how to
  unwind (`git reset HEAD~1` / `git revert <SHA>`) before re-invoking.

Halt text, adapted to the offending file/action:

```
Halting plan <plan-slug>: action A<n> tried to edit <path> — outside this
skill's allowlist (.claude/skills/** + the plan file; _templates/** only when a
protected-contract action is flagged).
Plan reference: pipeline-improvements.md § Actions → "<action title>".
Either re-draft the plan in triage-retros to drop/rescope the action, or add
explicit allowlist justification.
```

## Protected-contract enforcement

The **protected contracts** are the paths/regions whose silent change would
break the loop this skill (and the planner) depend on:

| Protected path | Why protected |
|---|---|
| `docs/specs/_templates/retro.md` | The schema `triage-retros`'s parser is built against. |
| `.claude/skills/ship-spec/SKILL.md` § Retrospective capture | The retro-generation contract — what gets written into future retros. |
| `.claude/skills/triage-retros/resources/actions-contract.md` / `resources/rendering.md` | The artifact contracts this skill, `suggestions-to-specs`, and `bugs-to-reports` parse. |
| Any path matching `retro\.(processed\.)?md`, `product-suggestions\.(processed\.)?md`, `pipeline-improvements\.(processed\.)?md` | The consume-by-rename naming conventions. A rename here breaks idempotency. |

The skill is allowed to **apply** a flagged change to these (a human approves
the PR), but it makes that path louder so the reviewer can't miss it.

### Layer 1 — the plan already carries the flag

The planner's cluster pass flags any action whose `files[]` intersect the
protected list (`**Protected contract:** yes — <justification>`). This skill
**reads that flag from the plan** — it does not re-derive it. As a safety
cross-check, if an action's `files[]` intersect a protected path but the plan
marked it `no`, treat it as a discrepancy: **halt the plan** and surface it for
a human (the plan and the edit disagree about a protected contract).

### Layer 2 — section-scoped diff for `ship-spec/SKILL.md`

The allowlist can't tell "editing `ship-spec/SKILL.md` § Retrospective capture"
from "editing other parts of `ship-spec/SKILL.md`" — the whole file matches
the first allowlist row. So for **any** edit to that file, run a section-scoped
diff before committing the action:

```bash
git show HEAD:.claude/skills/ship-spec/SKILL.md \
  | awk '/^## Retrospective capture/{flag=1} /^## /{if(flag && !/^## Retrospective capture/) exit} flag' \
  > /tmp/appi-base
awk '/^## Retrospective capture/{flag=1} /^## /{if(flag && !/^## Retrospective capture/) exit} flag' \
  .claude/skills/ship-spec/SKILL.md \
  > /tmp/appi-head
diff /tmp/appi-base /tmp/appi-head | wc -l
```

If the line count is **non-zero** AND the action's `protected_contract` is
`false`, **halt**: the edit touched `## Retrospective capture` without a flag.
Discard the change (`git checkout -- .claude/skills/ship-spec/SKILL.md`) and
print the allowlist-style halt naming the section. The operator re-drafts the
plan (drop the action, reword it so it doesn't touch that section, or flag it
protected) and re-runs.

### Layer 3 — human PR review

The last line of defense. Every flagged action is marked **loudly** in the PR
description (a `🛡` row in the changes table + a dedicated "Protected-contract
changes" callout) and in the commit's `PROTECTED-CONTRACT CHANGE:` trailer. The
machinery escalates visibility; **the merge gate is the human.**

## Format and gate

This skill's edits become a PR that must pass CI
(`eslint . && prettier --check .`, typecheck, tests, `check:docs`). Make the PR
land **green**:

1. **Format the touched files before committing.** Run the repo formatter
   scoped to the files the run edited — never the whole tree:

   ```bash
   pnpm exec prettier --write <each touched file>
   ```

   (Equivalently `pnpm run lint:fix`, but scope to the edited files to keep the
   diff tight.) Do this before staging each action's commit, or as a final
   format pass before the pre-PR sweep.

2. **Run the full local gate** once all actions are applied, before opening the
   PR:

   ```bash
   pnpm lint && pnpm exec nuxt typecheck && pnpm test && pnpm run check:docs
   ```

   Pipeline edits are markdown (`SKILL.md` files), so `prettier --check` and
   `check:docs` are the load-bearing checks; typecheck/tests should be
   unaffected but are run so the PR is verified end-to-end. Fix anything the
   gate flags (a formatting nit, a broken doc link introduced by an edit) in
   place and re-run before proceeding. If the gate isn't runnable in the
   current environment (e.g. wrong Node version, missing `pnpm`), say so
   explicitly in the PR description so the reviewer knows CI is the gate of
   record — do not claim it passed.

## Fresh-context review

Before opening the PR, **spawn a fresh-context subagent** to review the
implemented diff against the plan — this skill is orchestrator-invoked, so it
may spawn a reviewer (per `ship-spec` § Fresh-context reviewer spawning, a
directly-invoked skill is an orchestrator and can spawn; subagents cannot).
Spawn it at **`opus/high`** (tier vocabulary + fallback:
`.claude/skills/ship-spec/resources/tiers.md`), and include this line
verbatim in its brief — reviewer subagents attempting nested spawns have
stalled or returned malformed in past runs:

> Do all analysis inline; you cannot spawn sub-agents.

Give the reviewer, as its brief (not as "prior work" to defer to):

- The plan: `docs/specs/_improvements/<plan-slug>/pipeline-improvements.md`.
- The branch diff: `git diff main...HEAD`.
- The review questions:
  1. **Faithful** — does each hunk implement the action its commit names, and
     match the action's `change_summary`?
  2. **Complete** — is any action in the plan missing from the diff (and not a
     legitimate no-op)?
  3. **Not overreaching** — does the diff change anything the plan did **not**
     call for?
  4. **Safe** — could any edit break the pipeline (a broken cross-reference, a
     contradicted standard, a malformed protected-contract change, a removed
     anchor another skill relies on)?
  5. **Anti-regression check** — for each applied delta, read its commit body's
     "Targets / Must not regress" note. Does the diff, viewed against the skill
     file as a whole, introduce any regression in the listed "must not regress"
     dimensions? (This is a qualitative, judgment-based check — the reviewer
     reads the diff and reasons about whether a dimension named in "must not
     regress" is visibly harmed.)

  Give the reviewer the dimension vocabulary (the five seed tags from
  `## Dimension vocabulary` plus any new tags seen in this plan) so it can
  reason about each dimension's meaning when judging question 5.

Address what the reviewer surfaces: apply fixes as additional commits on the
branch (re-running the allowlist + format checks), or, if it finds an action
that shouldn't be applied as written, halt the plan and route it back to
`triage-retros` for a re-draft. Re-run the review only if the changes were
substantial — a small fix doesn't need another full pass.

Record the review outcome (and any fixes made) in the PR description so the
human reviewer sees the diff was already checked against intent.

## Mark processed

Once the actions are applied, the gate passes, and the review is addressed,
mark the plan processed in **one commit**:

1. **Rename** with `git mv` (preserves history):

   ```bash
   git mv docs/specs/_improvements/<plan-slug>/pipeline-improvements.md \
          docs/specs/_improvements/<plan-slug>/pipeline-improvements.processed.md
   ```

2. **Append a one-line footer** to the bottom of the
   `pipeline-improvements.processed.md` (` · `-separated fields, mirroring the
   retro footer convention):

   ```
   processed_on: <ISO date>  ·  processed_by: apply-pipeline-improvements  ·  pr: <filled by PR open>
   ```

   `pr` carries the `<filled by PR open>` placeholder until `## PR open` returns
   the URL; the **PR-URL backfill** step rewrites it.

3. **Commit**:

   ```bash
   git add docs/specs/_improvements/<plan-slug>/
   git commit -m "apply-improvements(<plan-slug>): mark plan processed"
   ```

The rename **must ship in the same PR as the edits** — that is the idempotency
mechanism. A plan is only consumed once its edits are merged; until the PR
merges, `git ls-files` on `main` still sees `pipeline-improvements.md` as
unprocessed (see `## Scope` for the re-glob-before-merge caveat).

## PR open

Push the branch and open exactly one PR per plan against `main`. No `--draft`,
no auto-merge.

**PR-creation tool.** The `gh pr create` command below is the local-shell
path. In the remote execution environment there is **no `gh` CLI** — open the
PR via the GitHub MCP `create_pull_request` tool instead (same
`base`/`head`/`title`/`body`). The rest of this section (body structure,
closing report) is tool-agnostic.

```bash
git push -u origin chore/apply-improvements-<plan-slug>
gh pr create \
  --base main \
  --head chore/apply-improvements-<plan-slug> \
  --title "apply-improvements: <plan-derived summary>" \
  --body "$(cat <<'EOF'
<PR body — see below>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### PR body

Build the body from the plan so each change is explained and traceable:

1. **Summary** — the plan's summary blockquote / `## PR description seed`
   base, plus a link to the plan
   (`docs/specs/_improvements/<plan-slug>/pipeline-improvements.processed.md`).
2. **Changes → findings → retros table** — one row per applied action: the
   `A<n>` title, the file(s) touched, the motivating finding id(s), and (via
   the finding's `supporting[]`) the source retro anchors. This is the
   traceback: action → finding → retro. Mark any **protected-contract** action
   row with `🛡`.
3. **Protected-contract changes** — a dedicated callout listing each flagged
   action and its justification, when any exist (else omit). So the reviewer
   gives those extra scrutiny.
4. **Action dispositions** — a per-action disposition line for every action in
   the plan (not just those applied), showing the Pareto selection outcome
   with the one-line justification for supersedes, conflicts, and any keep
   that survived a Step-1/2 comparison:

   ```
   Action dispositions:
     A1 — keep  (review-precision)
     A2 — supersedes A<prev>  (resumability/robustness) — <one-line why>
     A3 — CONFLICT with A<other> (excluded) — <one-line incompatibility>
     A4 — keep  (token-cost) — <one-line why it coexists with A1>
     …
   ```

5. **Conflicts excluded — re-draft required** (omit when there are no
   conflicts) — a section naming each CONFLICT pair, their target dimensions,
   and the one-line incompatibility. Includes the recommendation to re-run
   `triage-retros` to produce a plan that resolves the conflict explicitly:

   ```
   ## Conflicts excluded — re-draft required

   The following action pairs conflict and were excluded from this run:

   - A3 vs A7: review-precision vs token-cost on `intake-spec/SKILL.md` §
     intake prompt — both edits modify the same prose with incompatible
     direction.

   Re-run `triage-retros` to produce a follow-up plan that resolves these
   conflicts (prioritize one dimension, or split into compatible sub-edits).
   ```

6. **Untagged-legacy note** (omit when N=0) — "N action(s) had no dimension
   tag (legacy plan); treated as keep."
7. **Review** — a line noting the fresh-context review ran and what it found /
   that fixes were applied.
8. **Gate** — note whether the local gate passed, or that CI is the gate of
   record if it couldn't run locally.
9. **schema_version note** — if the plan's `schema_version` was unrecognised,
   say so, so the reviewer can sanity-check the parse.

### PR-URL backfill

Once `gh pr create` returns the URL, rewrite the `<filled by PR open>`
placeholder in the `pipeline-improvements.processed.md` footer with the real URL and
**amend the mark-processed commit** (the only force-push in the run, with
`--force-with-lease` on this single-operator chore branch):

```bash
git add docs/specs/_improvements/<plan-slug>/pipeline-improvements.processed.md
git commit --amend --no-edit
git push --force-with-lease
```

### Closing report

```
Done — plan <plan-slug>.
  PR: <URL>
  Actions applied: <count of apply commits> of <actions.length> (<no-op count> no-op)
  Disposition tally: <kept count> kept · <superseded count> superseded · <conflicts-excluded count> conflicts-excluded
  Protected-contract changes: <flagged count>
  Plan renamed: pipeline-improvements.md → pipeline-improvements.processed.md
  Gate: <passed | CI is gate of record (not runnable locally)>
Next: human review on the PR. <if more plans remain: "Continuing to the next unprocessed plan." | "No more unprocessed plans.">
```

## Scope

- **Consumes `pipeline-improvements.md` only.** Does NOT touch `product-suggestions.md`, the
  `_proposed/` queue, retros, or product source. Edits `.claude/skills/**` and
  the consumed plan file — disjoint from `suggestions-to-specs`, so the two run
  in parallel.
- **One PR per plan**, no auto-merge — humans approve every pipeline change.
- **Idempotent via the rename** — a processed plan
  (`pipeline-improvements.processed.md`) no longer matches the glob and can't be
  re-applied.
- **Conservative** — apply what the plan calls for, keep the diff reviewable,
  group related edits, never overreach into a sweeping rewrite the reviewer
  can't evaluate (see `## Guardrails`).
- **Re-glob-before-merge caveat** — a plan is only truly consumed once its PR
  merges (the rename lands on `main`). If you re-invoke this skill while a prior
  plan's PR is still open, the still-unprocessed plan will be re-globbed. Let
  open apply-PRs merge (or close them) before re-running, or the same plan gets
  a second branch.
- **Not resumable.** A run interrupted mid-plan leaves the plan unprocessed (no
  rename merged); re-invoke and it re-globs and retries from a fresh branch.
  Delete any abandoned `chore/apply-improvements-*` branch first.

## Guardrails

- **Smaller and well-scoped beats sweeping.** Favor a set of changes the
  reviewer can actually evaluate. The plan's actions are by construction small
  anchored `SKILL.md` edits; keep them that way. If applying an action faithful
  to its `change_summary` would require a large multi-file rewrite, that's a
  signal the action belongs back in `triage-retros` (or its own `ship-spec`
  feature) — halt the plan and say so rather than overreaching.
- **Flag protected-contract changes loudly** in the PR (see
  `## Protected-contract enforcement`, Layer 3).
- **Land green.** Format edited files and confirm the full gate before opening
  the PR (see `## Format and gate`).
- **Faithful, not creative.** Apply the plan; don't add unrequested
  improvements you notice along the way. If you spot a new improvement, it's a
  retro/plan input for `triage-retros`, not a freelance edit here.
