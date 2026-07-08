---
name: librarian
description: "Periodic maintenance sweep of the living docs (docs root + resources/ + standards/ + _templates/, CLAUDE.md, README.md) — seeks out drift against the codebase and the docs-authoring standard, fixes it directly, opens one docs-only PR, rides it to green (resolving merge conflicts and CI failures as they come up), and auto-merges. The docs counterpart to `/materia:janitor`: the janitor sweeps the code, the librarian sweeps the docs; both land their own fixes, but only the librarian auto-merges (its diff is mechanically docs-only). Fully autonomous; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule when the docs should be re-trued against reality."
---

# librarian — docs-drift sweep that lands its own fix

A single-shot, operator-run (or scheduled) maintenance skill that sweeps the
**living docs** for drift against the code and against
`docs/standards/docs.md`, applies the fixes
directly, and drives one docs-only PR all the way to merge. It is the docs
counterpart to `/materia:janitor` — the janitor sweeps the code, the librarian sweeps
the docs; both fix drift in place, but the librarian's docs-only diff is
cheap and mechanically bounded, so it alone verifies and merges its own PR.

**Deliberate divergence from the producer lifecycle:** this skill
**auto-merges its own PR**. That is safe only because its diff is mechanically
confined to docs (see § The docs-only envelope) and gated by CI; the moment
anything outside the envelope would need to change, the librarian stops
instead. It is NOT a producer (writes no queue entries), NOT a pipeline stage
(no tier; runs in the operator's session), and never touches product code.

## Invocation

```
/materia:librarian [--dry-run] [--no-merge]
```

- `--dry-run` — scan and report the drift plan only; no branch, no edits, no PR.
- `--no-merge` — do everything except the final merge; leave the green PR open
  for a human.
- Default — full sweep: fix → PR → ride CI → merge.

No mid-run checkpoint (the lifecycle is autonomous, like `ui-inspection`);
`--dry-run` is the preview mechanism. Judgment is therefore conservative: an
ambiguous fix is skipped and noted, never guessed at (§ Rules).

## Inputs

- The living docs: `docs/*.md` (root), `docs/resources/`, `docs/standards/`,
  `docs/_templates/`, plus `CLAUDE.md`, `README.md`, and `MATERIA.md`
  (swept for drift like any living doc — but any diff touching it downgrades
  the run to no-auto-merge; see § The docs-only envelope).
- The codebase as the oracle: `git ls-files`, the source folders the
  standards docs name (routes, pages, schema, shared modules). The Materia
  skills themselves are cache-resident plugin files, not tracked in this repo,
  so they are outside the sweep.
- `docs/standards/docs.md` (the authoring standard) and
  `docs/contributing.md` (the touch-X→update-Y map, read in reverse: which
  code would have demanded which doc).
- `scripts/check-docs.sh` via `sh scripts/check-docs.sh` (the mechanical gate).

**Not inputs, never edited:** `docs/specs/**`, `docs/bugs/**`,
`docs/epics/**`, `docs/research/**` — historical run artifacts, exempt by the
same rule that exempts them from `check:docs` style checks.

## Outputs

- One squash-merged PR (branch `librarian/sweep-<YYYY-MM-DD>`) containing only
  docs edits — or an **unmerged** green PR when the scale guard or MATERIA.md
  forfeit applies (§ The docs-only envelope) — with the PR body listing every fix, every **skipped** ambiguous
  finding with a one-line rationale, and any **needs-human** notes (suspected
  code bugs surfaced by normative doc statements — surfaced, not acted on).
- Zero-drift run: a short "nothing to fix" report; no branch, no PR.
- `--dry-run`: the drift plan printed to the session; no other output.

## Procedure

### 1. Preflight

`git checkout <trunk> && git pull <remote> <trunk>` (halt and surface if
blocked by local changes; `<trunk>`/`<remote>` per `MATERIA.md` § Version
control). Confirm the forge is reachable — `gh auth status` when `gh` is on
PATH, else that the GitHub-MCP twin tooling responds, and skip the check
entirely when the forge is `none` (`MATERIA.md` § Version control § Forge).
Verify that `sh scripts/check-docs.sh` is runnable — apply
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` (and
`MATERIA.md` § Environment preflight) recipes if not.
Read `docs/standards/docs.md` and the doc indexes into context.

### 2. Scan — the drift taxonomy

Sweep in this order; collect findings with file:line and the observed truth.
Every finding must name its oracle (the code path, index, or standard rule
that proves the doc wrong).

1. **Reference integrity.** Every repo path named in the living docs
   (Canonical files lists, table cells, prose backticks naming source files)
   exists in `git ls-files`. A missing
   path is drift: find where the thing lives now (rename) or remove the
   claim (deletion).
2. **Inventory coverage, both directions.**
   - `docs/surface-map.md` surfaces ⇄ their sources (routes ⇄ handlers and
     pages ⇄ page files on a web stack; commands ⇄ command modules, exports ⇄
     public modules on others — the map's own table shape says which).
   - `docs/README.md` Resources/Standards index tables ⇄ the files in
     `docs/resources/` / `docs/standards/`.
   - schema models ⇄ resource docs (a model with no doc is a
     needs-human note, not a doc the librarian invents; a doc for a dropped
     model is drift to fix).
3. **Claim accuracy (sampled).** Verify the cheaply-checkable claims —
   closed-set member lists vs their source enums/constants, surface
   names/paths vs their source files, exemption/allowlist claims vs the call
   sites that enforce them (derive the concrete pairs from this repo's
   standards docs). Sample broadly across
   docs rather than exhaustively within one.
4. **Authoring-standard conformance.** The `docs/standards/docs.md` rules the
   mechanical checker can't express: delta-appended prose ("now also
   supports…", change-log-shaped sections), facts duplicated across docs
   instead of linked to their one home, table-cell bloat, multi-sentence
   glossary entries. Fix by rewriting to present-state.
5. **Mechanical gate.** Run `sh scripts/check-docs.sh`; any failure on the trunk is a
   finding to fix (narration phrases, over-long lines, duplicate lines,
   glossary order, broken links, unresolvable `#anchor` fragments).

### 3. Classify & plan

For each finding, decide the fix direction using **code as the oracle**:

| Doc statement kind | Code disagrees | Action |
|---|---|---|
| Descriptive (what exists, where it lives, what it's called) | yes | **Fix the doc** to match code. |
| Normative ("must", "never", an invariant, a wire shape) | yes | **Do NOT fix either side.** Record a needs-human note in the PR body — the code may be the regression. |
| Ambiguous / can't verify cheaply | — | **Skip** with a one-line rationale in the PR body. |

Cap the run at roughly **20 coherent fixes** (one root cause = one fix, even
across files); prioritize by leverage (CLAUDE.md and index/inventory drift
first, prose accuracy second, conformance polish last) and list what was
deferred so the next run picks it up. Zero fixes planned → print the
zero-drift report and exit — no branch, no PR. `--dry-run` → print the full
plan (fixes, skips, needs-human notes) and exit.

### 4. Fix

```bash
git checkout -b librarian/sweep-<YYYY-MM-DD>   # hex-suffix on same-day rerun
```

Apply the fixes, writing every edit to `docs/standards/docs.md` (fold into
present-state, one home per fact, cells stay short, glossary one-liners at
alphabetical position). Commit in small scoped commits
(`librarian: <what> (<why it was drift>)`).

### 5. Gate locally, then PR

```bash
sh scripts/check-docs.sh && <lint — MATERIA.md § Gate>   # links/style + formatting over the .md diff
git diff <baseline>...HEAD --name-only     # § The docs-only envelope — assert now
git push -u <remote> librarian/sweep-<YYYY-MM-DD>
# open the PR — MATERIA.md § Version control § Forge (open-PR op)
gh pr create --title "librarian: docs-drift sweep <YYYY-MM-DD>" --body "<body>"
```

The `<body>` closes with the Materia sigil naming `librarian` as the
caster (`docs/standards/skills.md` § PR attribution — the Materia sigil).

The PR body carries: the fix list (one line each, with the oracle that proved
the drift), the skipped list with rationales, the needs-human notes, and the
deferred remainder.

### 6. Ride the PR to green — the resolution loop

Repeat until merged, **bounded at 3 rounds**:

1. **Conflicts?** If GitHub reports the branch un-mergeable:
   `git fetch <remote> <trunk> && git merge <baseline>` — **merge, never
   rebase, never force-push** (the same rule as ship-spec's merge watch; the
   shipped permission rules deny force spellings). Resolve conflicts by
   taking the trunk's content as the new base and re-deriving the fix against
   it — re-verify the underlying claim against the code before re-applying; if
   the trunk's change made the fix moot, drop it. Then push normally.
2. **Wait for CI:** `gh pr checks <n> --watch` (poll `gh pr checks <n>` if
   `--watch` is unavailable) — PR-status op, `MATERIA.md` § Version control
   § Forge.
3. **CI failed?** Read the failing job log (CI-logs op, `MATERIA.md`
   § Version control § Forge).
   - Failure caused by this diff (a `docs` job failure, a formatter
     complaint on an edited `.md`) → fix on the branch, re-gate locally,
     push, loop.
   - Failure unrelated to the diff (a flaky e2e, the trunk already red) →
     re-run CI once (re-run-CI op, same § Forge); this op has no exact
     GitHub-MCP twin, so in a `gh`-less env skip the one-shot rerun and
     surface it to the operator instead. If still red, **stop**: leave the
     PR open, comment on it (post-PR-comment op, same § Forge) naming the
     failing job and why it looks unrelated, and report to the operator.
     Never merge over a red check.
4. **Green?** Re-assert the docs-only envelope on the final diff, then merge
   through the **merge-PR op** (`MATERIA.md` § Version control § Forge), using the
   `<strategy>` from that section's **Merge strategy** knob when it names a
   concrete value — no merge-strategy row (or `per-skill default`) → this skill's
   default `squash`:

   ```bash
   gh pr merge <n> --squash --delete-branch
   ```

   If the merge is rejected by branch protection (required review), fall back
   to the distinct **auto-merge op** (twin `enable_pr_auto_merge`, same
   § Forge) — at the same resolved `<strategy>` as the direct merge (the
   § Forge Merge-strategy knob when concrete, else librarian's default
   `squash`) — and report the PR URL; the merge then completes on approval:

   ```bash
   gh pr merge <n> --auto --<strategy>
   ```

   `--no-merge` runs stop here either way and report the green PR URL.

If the loop exhausts 3 rounds without merging, stop, leave the PR open with a
comment summarizing the state, and report to the operator.

### 7. Close

Print the closing report: fixes landed, skips, needs-human notes, deferred
remainder, PR URL + merge state. End the turn.

## The docs-only envelope (binding)

Before **every push** and again **immediately before merge**, assert that
`git diff <baseline>...HEAD --name-only` matches only:

```
CLAUDE.md
README.md
MATERIA.md                (sweepable — but touching it forfeits auto-merge)
docs/*.md                 (root files)
docs/resources/**
docs/standards/**
docs/_templates/**
```

Anything else in the diff — any source or config file, anything under
`.claude/`, `docs/specs/`, `docs/bugs/`, `docs/epics/`, `docs/research/` —
means the run has escaped its envelope: **revert the offending change and if
the fix genuinely requires it, drop that fix with a needs-human note.** The
auto-merge privilege exists only inside this envelope.

**Scale guard (mechanical, same assertion points).** The envelope constrains
file *kind*; this constrains *magnitude*. Compute
`git diff <baseline>...HEAD --numstat` and use the **deleted-lines column**
(insertions never offset deletions — a balanced rewrite is still a rewrite),
plus `git diff <baseline>...HEAD --name-status --diff-filter=D` for whole-file
deletions (numstat alone can't distinguish them).
If the deletion filter reports **any file**, numstat shows a **binary
entry** (`-`), or the diff deletes
more than **50 lines from any single file**, or deletes more than **150
lines in total**, the run keeps its PR but **forfeits auto-merge** — report
the PR URL and stop, exactly as a `--no-merge` run would. Whole-doc removals
and large rewrites are human decisions; a drift sweep that big is a signal,
not a chore.

**MATERIA.md forfeit (same mechanism).** A diff that touches `MATERIA.md`
is envelope-legal but **never auto-merges** — its § Gate and § Tiers are
enforcement configuration, not prose; a human reviews every change to them.

## Scope (what this skill does NOT do)

- **NEVER edits product code, tests, CI config, or skills** — even to "fix"
  CI. A CI failure that demands a non-docs change ends the run (§ Procedure 6).
- **NEVER edits the historical trees** (`docs/specs/**`, `docs/bugs/**`,
  `docs/epics/**`, `docs/research/**`).
- **Writes no queue entries** — suspected code bugs become needs-human notes
  in the PR body, not `docs/bugs/_reports/` files. If a note warrants a
  report, the operator runs `/materia:report-bug` afterward.
- **Invents no docs.** A missing resource doc for a new entity is a
  needs-human note — authoring a doc from scratch needs intent the librarian
  doesn't have (that's `docs-sync`'s job inside a feature's own run).
- **Never merges over a red or skipped check**, and never pushes to the trunk
  directly.

## Rules

- **Code is the oracle for descriptive text; nothing is the oracle for
  normative text.** Fix descriptions to match reality; surface (don't touch)
  normative conflicts.
- **Ground every fix** in an observable oracle named in the PR body; a fix
  whose truth can't be demonstrated from the tree is a skip.
- **Conservative by construction** — there is no checkpoint, so when in doubt,
  skip and note. A wrong "fix" in an auto-merged PR costs more than a missed
  one.
- **Every edit follows `docs/standards/docs.md`** — a librarian pass must
  never itself introduce narration, duplication, or cell bloat.
- **Idempotent + schedulable** — a run against undrifted docs is a clean
  no-op; safe to run on a cron (`/schedule`) or ad hoc.
- **One PR per run**; an interrupted run is re-invoked fresh (a stray
  pre-push branch is deleted or pushed manually by the operator).
