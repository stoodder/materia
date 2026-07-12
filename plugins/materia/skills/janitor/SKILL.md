---
name: janitor
description: "Maintenance sweep of the codebase against `.materia/docs/standards/` — statically scans for drift (duplication, dead code, kind-purity violations, pattern deviations), fixes the bounded, behavior-preserving findings directly, and opens one PR gated by the full local suite (lint + typecheck + tests + check:docs), riding it to green but never auto-merging. A finding too large or too behavioral to fix safely becomes a queue entry — a proposed spec or bug report (`source: janitor`) committed in the same PR — while an ambiguous one stays a needs-human note. The code counterpart to `/materia:librarian` (which sweeps the docs and auto-merges); the scan fans out to parallel read-only subagents, and a pre-PR adversarial review hardens the diff before the PR opens. Fully autonomous; `--dry-run` previews; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule when the tree should be re-trued against the standards."
---

# janitor — standards-drift sweep that lands its own fix

A single-shot, operator-run (or scheduled) **maintainer** skill that sweeps the
**codebase** for drift against the `.materia/docs/standards/*` rules, applies the
bounded, behavior-preserving fixes directly, and drives one PR to a green CI
state. It is the code counterpart to `/materia:librarian` — the librarian sweeps
the docs, the janitor sweeps the code. Both follow the shared maintainer
lifecycle (`.materia/docs/standards/skills.md` § Maintainer lifecycle): fix
bounded drift in place, file an oversized finding as a queue entry in the same
PR, and note the ambiguous rest. This file states only what is janitor-specific
(its scan, its scope, its merge posture) and cites that section for the shared
machinery.

**Deliberate divergence from `/materia:librarian`:** the janitor **never auto-merges**.
The librarian's auto-merge privilege rests on a mechanical docs-only diff
envelope; a code diff has no such envelope, so the janitor stops at a green PR
and the PR review is the human gate — the same terminal shape as a `ship-spec`
run's `finalize`. And unlike the librarian, the janitor may file into **either**
queue: an oversized finding becomes a proposed spec
(`.materia/docs/specs/_proposed/`) or a bug report
(`.materia/docs/bugs/_reports/`) under `source: janitor`, committed in the same
PR (§ Maintainer lifecycle § Oversized findings); a bounded, behavior-preserving
fix is applied directly; anything ambiguous or unverifiable stays a needs-human
note the operator can escalate with `/materia:report-bug` or
`/materia:propose-spec`. It is NOT a pipeline stage (no tier; runs in the
operator's session).

## Invocation

```
/materia:janitor [--path <dir-or-glob>] [--standard <standard-name>] [--dry-run]
```

- `--path` — confine the scan to a subtree (e.g. `server/`, `composables/`).
- `--standard` — confine to one standard by doc basename (e.g. `api-layer`).
- `--dry-run` — scan and report the fix plan only; no branch, no edits, no PR.

No mid-run checkpoint (autonomous, like `/materia:librarian`); `--dry-run` is the
preview mechanism. Judgment is therefore conservative: an ambiguous or
behavior-affecting fix is noted, never guessed at (§ Rules).

## Inputs

- The in-scope `.materia/docs/standards/*.md` rules (all by default) and the source
  folders they govern (see § Scan strategy).
- `.materia/docs/contributing.md` — the
  touch-X→update-Y map, so each fix carries its doc updates.
- **Both live queues**, read for dedup (a finding already queued belongs to
  the pipeline run that will consume it):
  `git ls-files '.materia/docs/specs/_proposed/*.md'` and
  `git ls-files '.materia/docs/bugs/_reports/*/report.md'`, plus the recent merge log
  (`git log <trunk> --since='3 months ago' --pretty=oneline`; `<trunk>` per
  `MATERIA.md` § Version control).

## Outputs

- One PR (branch `janitor/sweep-<YYYY-MM-DD>`, hex-suffix on same-day rerun)
  containing the fixes plus the doc updates they demand — and any queue entries
  the run filed (§ Classify & plan) — ridden to green CI and **left open for
  human review**. The PR body lists every fix (with the standard rule that
  proved the drift), every skip with a one-line rationale, every queue entry
  filed (with its `id` and target queue), every needs-human note, and the
  deferred remainder.
- Zero-drift run (no fixes, no queue entries): a short "nothing to fix" report;
  no branch, no PR. Notes with no fixes or entries to carry them are printed in
  the session report instead.
- `--dry-run`: the fix plan printed to the session; no other output.

## Procedure

### 1. Preflight

`git checkout <trunk> && git pull <remote> <trunk>` (halt and surface if
blocked by local changes; `<trunk>`/`<remote>` per `MATERIA.md` § Version
control). Confirm the forge is reachable — `gh auth status` when `gh` is on
PATH, else that the GitHub-MCP twin tooling responds, and skip the check
entirely when the forge is `none` (`MATERIA.md` § Version control § Forge).
Verify the Node toolchain — the full local gate (every non-`none` row of
`MATERIA.md § Gate`) must be runnable (apply
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` recipes if
not). Read the in-scope standards and both live queues into context.

### 2. Scan — subagent fan-out

Scanning is the context-heavy half, so fan it out: group the in-scope
standards into 2–4 briefs by shared source targets (§ Scan strategy), then
spawn one **read-only** subagent per group in parallel — **tier `sonnet/low`**
(row `janitor: scan`, `MATERIA.md` § Tiers § Skill routing): a findings-only
standards sweep is mechanical pattern-matching. Each brief names the
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
| Oversized — too large or too behavioral to fix safely in a sweep: a behavioral fault (a missing auth/permission guard, wrong derivation, violated contract with runtime impact), or a big cross-cutting refactor, or anything needing a product/design decision or a schema/wire change | **Queue entry in the same PR** — a bug report (`.materia/docs/bugs/_reports/`) for a behavioral fault, a proposed spec (`.materia/docs/specs/_proposed/`) for a product/design change; `source: janitor`, per § Maintainer lifecycle § Oversized findings. Never fixed inline — the RED-first `/materia:fix-bug` (or `/materia:ship-spec`) run owns the fix. |
| Ambiguous, unverifiable, or already covered by a pending queue entry / recent merge | **Skip / needs-human note** with a one-line rationale (name the overlapping `id` or commit). |

Cap the run at roughly **10 coherent fixes** (one root cause = one fix, even
across files); prioritize by leverage (most files touched, clearest rule) and
list what was deferred so the next run picks it up. Zero fixes **and zero queue
entries** planned → print the zero-drift report (including any notes) and exit —
no branch, no PR. `--dry-run` → print the full plan and exit.

### 4. Fix

```bash
git checkout -b janitor/sweep-<YYYY-MM-DD>   # hex-suffix on same-day rerun
```

Apply the fixes in small scoped commits (`janitor: <what> (<rule it
violated>)`), one commit per cluster, each carrying the doc updates
`.materia/docs/contributing.md` maps to the files it touched. Fixes land
**sequentially in one working tree** — a large mechanical cluster may be
delegated to a single implementer subagent (**tier `sonnet/medium`**, row
`janitor: implementer`, `MATERIA.md` § Tiers § Skill routing), but never two
writers at once; the parent stays the sole committer.

Any cluster classified **oversized** is written here as a queue entry — a
**new** proposed-spec file under `.materia/docs/specs/_proposed/` or a **new**
report folder under `.materia/docs/bugs/_reports/`, each conforming to that
queue's frontmatter/filename contract and id-minting rules (`source: janitor`)
— in its own commit (`janitor: file <id> (<queue>)`). Creating new queue
entries is the sole carve-out from the historical-tree no-touch rule (§ Scope);
never edit or remove an existing artifact in those trees.

### 5. Gate locally

```bash
<full gate - every non-`none` row of MATERIA.md § Gate, in table order>
```

A gate failure a fix caused is fixed on the branch before the review; a fix
that can't be made green is reverted and demoted to a needs-human note.

### 6. Pre-PR review rounds

Before opening the PR, harden the sweep diff with fresh-context adversarial
reviewer(s) spawned at the `janitor: reviewer` row (`MATERIA.md` § Tiers
§ Skill routing), running the bounded loop in
`.materia/docs/standards/skills.md` § Maintainer lifecycle § Pre-PR review
rounds: **≤3 rounds** to convergence (no material `Blocker`/`Major`), findings
folded and re-gated (§ 5) between rounds. A trivially small single-cluster diff
may converge in one round; a contested fix still unresolved after 3 rounds is
dropped to a needs-human note and the rest proceeds. These rounds are distinct
from the post-PR ride-to-green loop (§ 8).

### 7. Open the PR

```bash
git push -u <remote> janitor/sweep-<YYYY-MM-DD>
# open the PR — MATERIA.md § Version control § Forge (open-PR op)
gh pr create --title "janitor: standards-drift sweep <YYYY-MM-DD>" --body "<body>"
```

The `<body>` closes with the Materia sigil naming `janitor` as the
caster (`.materia/docs/standards/skills.md` § PR attribution — the Materia sigil).
It carries the fix list (each naming its standard rule), the skips, every queue
entry filed (with its `id` and target queue), the needs-human notes, and the
deferred remainder.

### 8. Ride the PR to green

Repeat until green, **bounded at 3 rounds**:

1. **Conflicts?** `git fetch <remote> <trunk> && git merge <baseline>` —
   **merge, never rebase, never force-push** (same rule as the librarian and
   ship-spec's § PR watch; the shipped permission rules deny force
   spellings); re-derive each conflicted fix against the trunk's content (drop
   it if moot), then push normally.
2. **Wait for CI:** `gh pr checks <n> --watch` (PR-status op,
   `MATERIA.md` § Version control § Forge).
3. **CI failed?** Failure caused by this diff → fix on the branch, re-gate
   locally, push, loop. Unrelated failure (flaky e2e, the trunk already red) →
   re-run CI once (re-run-CI op, `MATERIA.md` § Version control § Forge); this
   op has no exact GitHub-MCP twin, so in a `gh`-less env skip the one-shot
   rerun and surface it to the operator instead. If still red, stop and report
   with a PR comment (post-PR-comment op, same § Forge) naming the failing job.
4. **Green?** Stop. Report the PR URL for human review — **never merge**.

If the loop exhausts 3 rounds, stop, leave the PR open with a comment
summarizing the state, and report to the operator.

### 9. Close

Print the closing report — fixes landed, queue entries filed, skips,
needs-human notes, unscanned groups, deferred remainder, PR URL — and end the
turn.

## Scan strategy

Derive the scan groups from the repo itself: one group per doc under
`.materia/docs/standards/`, with that standard's primary source targets taken from the
folders/files the standard names (its "Where it lives" section) and the
`.materia/docs/contributing.md` touch-X→update-Y map read in reverse. Typical shape:
the architecture standard scans all folders (placement, naming, layering);
each layer standard scans its layer's folders; the testing standard scans
test files against their source modules; the workflow standard scans the
package manifest and CI config.

## Scope (what this skill does NOT do)

- **NEVER auto-merges and never pushes to the trunk** — the green PR is the
  hand-off; a human merges.
- **NEVER makes behavior-changing fixes.** A behavioral fault is filed as a
  queue entry (a bug report, or a proposed spec when it needs a product/design
  decision), never fixed inline; its fix path is the RED-first
  `/materia:fix-bug` pipeline, not a sweep.
- **Does NOT fix oversized findings inline** — a finding too large or too
  behavioral to fix safely becomes a **queue entry** (a proposed spec or bug
  report, `source: janitor`, committed in the same PR — § Maintainer lifecycle
  § Oversized findings), and an ambiguous or unverifiable one a needs-human
  note the operator can escalate. Only bounded, behavior-preserving drift is
  fixed in place.
- **NEVER edits or removes** existing artifacts in the historical trees
  (`.materia/docs/specs/**`, `.materia/docs/bugs/**`, `.materia/docs/epics/**`,
  `.materia/docs/research/**`) or the Materia plugin skills (installed
  read-only under `${CLAUDE_PLUGIN_ROOT}/skills/`). The one carve-out is
  creating a **new** queue entry — a new proposed-spec file under
  `.materia/docs/specs/_proposed/` or a new report folder under
  `.materia/docs/bugs/_reports/` (§ Maintainer lifecycle § Oversized findings);
  editing or removing any existing file in these trees stays forbidden.
- **Not a linter replacement** — it targets cross-file drift, duplication,
  dead code, and standards conformance the `lint` gate cannot express.

## Rules

- **Ground every fix in a specific `.materia/docs/standards/*` rule**, named in the
  commit and the PR body. No rule to cite → skip.
- **Behavior-preserving by construction.** A green gate is necessary, not
  sufficient — if a fix could change runtime behavior, a wire shape, or the
  schema, it is not fixed inline: it becomes a queue entry (a bug report, or
  a proposed spec when it needs a product/design decision), or a needs-human
  note when ambiguous (§ Classify & plan). When in doubt, note; a wrong fix
  in a code PR costs more than a missed one.
- **One root cause = one fix = one commit**, even across several files.
- **Dedup is binding** — a finding substantially covered by a pending queue
  entry or recently shipped work is skipped naming the overlap; the queued
  pipeline run owns it.
- **Docs ride the same commit** — every fix applies the
  `.materia/docs/contributing.md` touch-X→update-Y map, and doc edits follow
  `.materia/docs/standards/docs.md`.
- **Subagents scan; the parent writes.** Scan fan-out returns findings only;
  fixes are applied and committed by the parent (or one delegate at a time).
- **Idempotent + schedulable** — a run against a clean tree is a no-op; safe
  on a cron (`/schedule`) or ad hoc.
- **One PR per run**; an interrupted run is re-invoked fresh (a stray
  pre-push branch is deleted or pushed manually by the operator).
