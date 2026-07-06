---
name: materia-janitor
description: Maintenance sweep of the codebase against `docs/standards/` — statically scans for drift (duplication, dead code, kind-purity violations, pattern deviations), fixes the bounded, behavior-preserving findings directly, and opens one PR gated by the full local suite (lint + typecheck + tests + check:docs), riding it to green but never auto-merging. Findings too behavioral or too big to fix safely become needs-human notes in the PR body, never queue entries. The code counterpart to `/materia-librarian` (which sweeps the docs and auto-merges); the scan fans out to parallel read-only subagents. Fully autonomous; `--dry-run` previews; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule when the tree should be re-trued against the standards.
---

# materia-janitor — standards-drift sweep that lands its own fix

A single-shot, operator-run (or scheduled) **maintainer** skill that sweeps the
**codebase** for drift against the `docs/standards/*` rules, applies the
bounded, behavior-preserving fixes directly, and drives one PR to a green CI
state. It is the code counterpart to `/materia-librarian` — the librarian sweeps the
docs, the janitor sweeps the code; both land their own fixes instead of filing
queue entries.

**Deliberate divergence from `/materia-librarian`:** the janitor **never auto-merges**.
The librarian's auto-merge privilege rests on a mechanical docs-only diff
envelope; a code diff has no such envelope, so the janitor stops at a green PR
and the PR review is the human gate — the same terminal shape as a `materia-ship-spec`
run's `materia-finalize`. It is NOT a producer (writes no queue entries) and NOT a
pipeline stage (no tier; runs in the operator's session). Work too large or too
behavioral to fix here still flows through the pipelines: the janitor surfaces
it as a needs-human note and the operator escalates with `/materia-report-bug` (→
`/materia-fix-bug`) or `/materia-propose-spec` (→ `/materia-ship-spec`).

## Invocation

```
/materia-janitor [--path <dir-or-glob>] [--standard <standard-name>] [--dry-run]
```

- `--path` — confine the scan to a subtree (e.g. `server/`, `composables/`).
- `--standard` — confine to one standard by doc basename (e.g. `api-layer`).
- `--dry-run` — scan and report the fix plan only; no branch, no edits, no PR.

No mid-run checkpoint (autonomous, like `/materia-librarian`); `--dry-run` is the
preview mechanism. Judgment is therefore conservative: an ambiguous or
behavior-affecting fix is noted, never guessed at (§ Rules).

## Inputs

- The in-scope `docs/standards/*.md` rules (all by default) and the source
  folders they govern (see § Scan strategy).
- `docs/contributing.md` — the
  touch-X→update-Y map, so each fix carries its doc updates.
- **Both live queues**, read for dedup (a finding already queued belongs to
  the pipeline run that will consume it):
  `git ls-files 'docs/specs/_proposed/*.md'` and
  `git ls-files 'docs/bugs/_reports/*/report.md'`, plus the recent merge log
  (`git log main --since='3 months ago' --pretty=oneline`).

## Outputs

- One PR (branch `janitor/sweep-<YYYY-MM-DD>`, hex-suffix on same-day rerun)
  containing the fixes plus the doc updates they demand, ridden to green CI and
  **left open for human review**. The PR body lists every fix (with the
  standard rule that proved the drift), every skip with a one-line rationale,
  every needs-human note, and the deferred remainder.
- Zero-drift run: a short "nothing to fix" report; no branch, no PR. Notes
  with no fixes to carry them are printed in the session report instead.
- `--dry-run`: the fix plan printed to the session; no other output.

## Procedure

### 1. Preflight

`git checkout main && git pull` (halt and surface if blocked by local
changes). Verify `gh auth status` and the Node toolchain — the full local gate
must be runnable (apply
`${CLAUDE_PLUGIN_ROOT}/skills/materia-ship-spec/resources/env-preflight.md` recipes if not). Read
the in-scope standards and both live queues into context.

### 2. Scan — subagent fan-out

Scanning is the context-heavy half, so fan it out: group the in-scope
standards into 2–4 briefs by shared source targets (§ Scan strategy), then
spawn one **read-only** subagent per group in parallel. Each brief names the
standard doc(s) to read, the folders to sweep, and the return contract:
**findings only** — file:line, the violated rule, a one-line proposed fix, and
a confidence tag — never file dumps. Retry a failed subagent once; a group
that fails twice is recorded as **unscanned** in the report. A narrow scan
(`--standard`, or `--path` limited to one folder) may run inline instead.

The parent aggregates the returns, then clusters by **root cause** — multiple
files with the same pattern deviation are one finding, not N.

### 3. Classify & plan

Triage each cluster:

| Cluster kind | Action |
|---|---|
| Bounded, behavior-preserving conformance drift (dead code, duplication with a mechanical extraction, placement/naming violations, declaration-style drift the standards prohibit, a missing test for a pure module) | **Fix directly.** |
| Behavioral fault (a missing auth/permission guard, wrong derivation, violated contract with runtime impact) or anything needing a product/design decision or a schema/wire change | **Needs-human note** — never fixed here; the fix path is `/materia-report-bug` → `/materia-fix-bug` (RED-first) or `/materia-propose-spec` → `/materia-ship-spec`. |
| Ambiguous, unverifiable, or already covered by a pending queue entry / recent merge | **Skip** with a one-line rationale (name the overlapping `id` or commit). |

Cap the run at roughly **10 coherent fixes** (one root cause = one fix, even
across files); prioritize by leverage (most files touched, clearest rule) and
list what was deferred so the next run picks it up. Zero fixes planned → print
the zero-drift report (including any notes) and exit — no branch, no PR.
`--dry-run` → print the full plan and exit.

### 4. Fix

```bash
git checkout -b janitor/sweep-<YYYY-MM-DD>   # hex-suffix on same-day rerun
```

Apply the fixes in small scoped commits (`janitor: <what> (<rule it
violated>)`), one commit per cluster, each carrying the doc updates
`docs/contributing.md` maps to the files it touched. Fixes land
**sequentially in one working tree** — a large mechanical cluster may be
delegated to a single implementer subagent, but never two writers at once;
the parent stays the sole committer.

### 5. Gate locally, then PR

```bash
<full gate - every non-`none` row of MATERIA.md § Gate, in table order>
git push -u origin janitor/sweep-<YYYY-MM-DD>
gh pr create --title "janitor: standards-drift sweep <YYYY-MM-DD>" --body "<body>"
```

The `<body>` closes with the Materia sigil naming `materia-janitor` as the
caster (`docs/standards/skills.md` § PR attribution — the Materia sigil).

A gate failure a fix caused is fixed on the branch before pushing; a fix that
can't be made green is reverted and demoted to a needs-human note. The PR body
carries the fix list (each naming its standard rule), skips, needs-human
notes, and the deferred remainder. In the remote execution environment (no
`gh` CLI), use the GitHub MCP `create_pull_request` tool.

### 6. Ride the PR to green

Repeat until green, **bounded at 3 rounds**:

1. **Conflicts?** `git fetch origin main && git merge origin/main` —
   **merge, never rebase, never force-push** (same rule as the librarian and
   ship-spec's merge watch; the shipped permission rules deny force
   spellings); re-derive each conflicted fix against `main`'s content (drop
   it if moot), then push normally.
2. **Wait for CI:** `gh pr checks <num> --watch`.
3. **CI failed?** Failure caused by this diff → fix on the branch, re-gate
   locally, push, loop. Unrelated failure (flaky e2e, `main` already red) →
   retry once (`gh run rerun <id> --failed`); if still red, stop and report
   with a PR comment naming the failing job.
4. **Green?** Stop. Report the PR URL for human review — **never merge**.

If the loop exhausts 3 rounds, stop, leave the PR open with a comment
summarizing the state, and report to the operator.

### 7. Close

Print the closing report — fixes landed, skips, needs-human notes, unscanned
groups, deferred remainder, PR URL — and end the turn.

## Scan strategy

Derive the scan groups from the repo itself: one group per doc under
`docs/standards/`, with that standard's primary source targets taken from the
folders/files the standard names (its "Where it lives" section) and the
`docs/contributing.md` touch-X→update-Y map read in reverse. Typical shape:
the architecture standard scans all folders (placement, naming, layering);
each layer standard scans its layer's folders; the testing standard scans
test files against their source modules; the workflow standard scans the
package manifest and CI config.

## Scope (what this skill does NOT do)

- **NEVER auto-merges and never pushes to `main`** — the green PR is the
  hand-off; a human merges.
- **NEVER makes behavior-changing fixes.** Behavioral faults are needs-human
  notes; their fix path is the RED-first `/materia-fix-bug` pipeline, not a sweep.
- **Writes no queue entries** — notes in the PR body replace the old
  proposal/report filing; the operator escalates with `/materia-report-bug` or
  `/materia-propose-spec` when a note warrants it.
- **NEVER edits** the historical trees (`docs/specs/**`, `docs/bugs/**`,
  `docs/epics/**`, `docs/research/**`) or the Materia plugin skills (installed
  read-only under `${CLAUDE_PLUGIN_ROOT}/skills/`).
- **Not a linter replacement** — it targets cross-file drift, duplication,
  dead code, and standards conformance the `lint` gate cannot express.

## Rules

- **Ground every fix in a specific `docs/standards/*` rule**, named in the
  commit and the PR body. No rule to cite → skip.
- **Behavior-preserving by construction.** A green gate is necessary, not
  sufficient — if a fix could change runtime behavior, a wire shape, or the
  schema, it is a note, not a fix. When in doubt, note; a wrong fix in a code
  PR costs more than a missed one.
- **One root cause = one fix = one commit**, even across several files.
- **Dedup is binding** — a finding substantially covered by a pending queue
  entry or recently shipped work is skipped naming the overlap; the queued
  pipeline run owns it.
- **Docs ride the same commit** — every fix applies the
  `docs/contributing.md` touch-X→update-Y map, and doc edits follow
  `docs/standards/docs.md`.
- **Subagents scan; the parent writes.** Scan fan-out returns findings only;
  fixes are applied and committed by the parent (or one delegate at a time).
- **Idempotent + schedulable** — a run against a clean tree is a no-op; safe
  on a cron (`/schedule`) or ad hoc.
- **One PR per run**; an interrupted run is re-invoked fresh (a stray
  pre-push branch is deleted or pushed manually by the operator).
