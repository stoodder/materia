---
name: librarian
description: "Periodic maintenance sweep of the living docs (docs root + resources/ + standards/ + _templates/, CLAUDE.md, README.md) — seeks out drift against the codebase and the docs-authoring standard, fixes bounded drift directly, files oversized doc work as a proposed spec (`source: librarian`) in the same PR, opens one docs-only PR, hardens it with a pre-PR adversarial review, rides it to green (resolving merge conflicts and CI failures as they come up), and auto-merges — unless the run trips a forfeit (a queue entry written, MATERIA.md touched, or a large/deleting diff), which keeps the green PR for human review. The docs counterpart to `/materia:janitor`: the janitor sweeps the code, the librarian sweeps the docs; both land their own bounded fixes, but only the librarian auto-merges (its diff is mechanically docs-only). Fully autonomous; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule when the docs should be re-trued against reality."
---

# librarian — docs-drift sweep that lands its own fix

A single-shot, operator-run (or scheduled) maintenance skill that sweeps the
**living docs** for drift against the code and against
`.materia/docs/standards/docs.md`, applies the bounded fixes directly, and
drives one docs-only PR all the way to merge. It is the docs counterpart to
`/materia:janitor` — the janitor sweeps the code, the librarian sweeps the
docs. Both follow the shared maintainer lifecycle
(`.materia/docs/standards/skills.md` § Maintainer lifecycle) — fix bounded
drift in place, file an oversized finding as a queue entry, note the ambiguous
rest — but the librarian's docs-only diff is cheap and mechanically bounded, so
it alone verifies and merges its own PR. This file states only what is
librarian-specific and cites that section for the shared machinery.

**Deliberate divergence from the other maintainers:** this skill
**auto-merges its own PR**. That is safe only because its diff is mechanically
confined to docs (see § The docs-only envelope) and gated by CI; the moment
anything outside the envelope would need to change, the librarian stops
instead. Its one queue-entry path is narrow — **proposed specs only**
(`source: librarian`), for doc work too large to fix inline; a normative
code-vs-doc conflict stays a needs-human note, never a bug report (its "nothing
is the oracle for normative text" rule, § Rules, is unchanged) — and any run
that files one **forfeits auto-merge** (§ The docs-only envelope). It is NOT a
pipeline stage (no tier; runs in the operator's session), and never touches
product code.

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

- The living docs: `.materia/docs/*.md` (root), `.materia/docs/resources/`, `.materia/docs/standards/`,
  `.materia/docs/_templates/`, plus `CLAUDE.md`, `README.md`, and `MATERIA.md`
  (swept for drift like any living doc — but any diff touching it downgrades
  the run to no-auto-merge; see § The docs-only envelope).
- The codebase as the oracle: `git ls-files`, the source folders the
  standards docs name (routes, pages, schema, shared modules). The Materia
  skills themselves are cache-resident plugin files, not tracked in this repo,
  so they are outside the sweep.
- `.materia/docs/standards/docs.md` (the authoring standard) and
  `.materia/docs/contributing.md` (the touch-X→update-Y map, read in reverse: which
  code would have demanded which doc).
- the `check:docs` gate — its command in `MATERIA.md § Gate` (the mechanical gate).

**Not inputs, never edited:** the historical trees `.materia/docs/specs/**`,
`.materia/docs/bugs/**`, `.materia/docs/epics/**`, `.materia/docs/research/**` —
historical run artifacts, exempt by the same rule that exempts them from
`check:docs` style checks. The one carve-out is a **new** file under
`.materia/docs/specs/_proposed/` when the run files an oversized finding as a
proposed spec (§ The docs-only envelope; `.materia/docs/standards/skills.md`
§ Maintainer lifecycle § Oversized findings) — a creation, never an edit or
removal of an existing artifact.

## Outputs

- One squash-merged PR (branch `librarian/sweep-<YYYY-MM-DD>`) containing only
  docs edits — or an **unmerged** green PR when any auto-merge forfeit applies
  (§ The docs-only envelope § Auto-merge forfeits: a queue entry written,
  MATERIA.md touched, or a large/deleting diff) — with the PR body listing every
  fix, every **skipped** ambiguous finding with a one-line rationale, every
  **proposed spec** filed for oversized doc work, and any **needs-human** notes
  (suspected code bugs surfaced by normative doc statements — surfaced, not
  acted on).
- Zero-drift run: a short "nothing to fix" report; no branch, no PR.
- `--dry-run`: the drift plan printed to the session; no other output.

## Procedure

### 1. Preflight

`git checkout <trunk> && git pull <remote> <trunk>` (halt and surface if
blocked by local changes; `<trunk>`/`<remote>` per `MATERIA.md` § Version
control). Confirm the forge is reachable — `gh auth status` when `gh` is on
PATH, else that the GitHub-MCP twin tooling responds, and skip the check
entirely when the forge is `none` (`MATERIA.md` § Version control § Forge).
Verify that the `check:docs` gate command (`MATERIA.md § Gate`) is runnable — apply
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` (and
`MATERIA.md` § Environment preflight) recipes if not.
Read `.materia/docs/standards/docs.md` and the doc indexes into context.

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
   - `.materia/docs/surface-map.md` surfaces ⇄ their sources (routes ⇄ handlers and
     pages ⇄ page files on a web stack; commands ⇄ command modules, exports ⇄
     public modules on others — the map's own table shape says which).
   - `.materia/docs/README.md` Resources/Standards index tables ⇄ the files in
     `.materia/docs/resources/` / `.materia/docs/standards/`.
   - schema models ⇄ resource docs (a model with no doc is a
     needs-human note, not a doc the librarian invents; a doc for a dropped
     model is drift to fix).
3. **Claim accuracy (sampled).** Verify the cheaply-checkable claims —
   closed-set member lists vs their source enums/constants, surface
   names/paths vs their source files, exemption/allowlist claims vs the call
   sites that enforce them (derive the concrete pairs from this repo's
   standards docs). Sample broadly across
   docs rather than exhaustively within one.
4. **Authoring-standard conformance.** The `.materia/docs/standards/docs.md` rules the
   mechanical checker can't express: delta-appended prose ("now also
   supports…", change-log-shaped sections), facts duplicated across docs
   instead of linked to their one home, table-cell bloat, multi-sentence
   glossary entries. Fix by rewriting to present-state.
5. **Mechanical gate.** Run the `check:docs` gate (`MATERIA.md § Gate`); any failure on the trunk is a
   finding to fix (narration phrases, over-long lines, duplicate lines,
   glossary order, broken links, unresolvable `#anchor` fragments).

### 3. Classify & plan

For each finding, decide the fix direction using **code as the oracle**:

| Doc statement kind | Code disagrees | Action |
|---|---|---|
| Descriptive (what exists, where it lives, what it's called) | yes | **Fix the doc** to match code. |
| Normative ("must", "never", an invariant, a wire shape) | yes | **Do NOT fix either side.** Record a needs-human note in the PR body — the code may be the regression. |
| Ambiguous / can't verify cheaply | — | **Skip** with a one-line rationale in the PR body. |

A descriptive fix too large to apply and verify inline — a doc that needs
wholesale restructuring, or a batch of interlinked doc changes that is really a
work item — is **oversized**: file it as a **proposed spec**
(`source: librarian`) committed in the same PR (§ The docs-only envelope;
`.materia/docs/standards/skills.md` § Maintainer lifecycle § Oversized findings)
rather than attempting it in a sweep. This is the librarian's **only**
queue-entry path — a normative conflict is still a note, never a bug report —
and any run that files one forfeits auto-merge.

Cap the run at roughly **20 coherent fixes** (one root cause = one fix, even
across files); prioritize by leverage (CLAUDE.md and index/inventory drift
first, prose accuracy second, conformance polish last) and list what was
deferred so the next run picks it up. Zero fixes **and zero queue entries**
planned → print the zero-drift report and exit — no branch, no PR. `--dry-run`
→ print the full plan (fixes, skips, proposed specs, needs-human notes) and
exit.

### 4. Fix

```bash
git checkout -b librarian/sweep-<YYYY-MM-DD>   # hex-suffix on same-day rerun
```

Apply the fixes, writing every edit to `.materia/docs/standards/docs.md` (fold into
present-state, one home per fact, cells stay short, glossary one-liners at
alphabetical position). Commit in small scoped commits
(`librarian: <what> (<why it was drift>)`).

An oversized doc finding is written here as a **new** proposed-spec file under
`.materia/docs/specs/_proposed/`, conforming to that queue's
frontmatter/filename contract and id-minting rules (`source: librarian`), in
its own commit (`librarian: file <id> (oversized doc work)`). This is the only
non-docs write the librarian makes, and it forfeits auto-merge (§ The docs-only
envelope).

### 5. Gate locally

```bash
<check:docs — MATERIA.md § Gate> && <lint — MATERIA.md § Gate>   # links/style + formatting over the .md diff
git diff <baseline>...HEAD --name-only     # § The docs-only envelope — assert now
```

### 6. Pre-PR review rounds

Before opening the PR, harden the sweep diff with fresh-context adversarial
reviewer(s) spawned at the `librarian: reviewer` row (`MATERIA.md` § Tiers
§ Skill routing), running the bounded loop in
`.materia/docs/standards/skills.md` § Maintainer lifecycle § Pre-PR review
rounds: **≤3 rounds** to convergence (no material `Blocker`/`Major`), findings
folded and re-gated (§ 5) between rounds. A trivially small single-cluster diff
may converge in one round; a contested fix still unresolved after 3 rounds is
dropped to a needs-human note and the rest proceeds. These rounds are distinct
from the post-PR ride-to-green loop (§ 8).

### 7. Open the PR

```bash
git push -u <remote> librarian/sweep-<YYYY-MM-DD>
# open the PR — MATERIA.md § Version control § Forge (open-PR op)
gh pr create --title "librarian: docs-drift sweep <YYYY-MM-DD>" --body "<body>"
```

The `<body>` closes with the Materia sigil naming `librarian` as the
caster (`.materia/docs/standards/skills.md` § PR attribution — the Materia sigil).

The PR body carries: the fix list (one line each, with the oracle that proved
the drift), the skipped list with rationales, every proposed spec filed for
oversized doc work (with its `id`), the needs-human notes, and the deferred
remainder.

### 8. Ride the PR to green — the resolution loop

Repeat until merged, **bounded at 3 rounds**:

1. **Conflicts?** If GitHub reports the branch un-mergeable:
   `git fetch <remote> <trunk> && git merge <baseline>` — **merge, never
   rebase, never force-push** (the same rule as ship-spec's § PR watch; the
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
4. **Green?** Re-assert the docs-only envelope **and the auto-merge forfeits**
   (§ The docs-only envelope) on the final diff. If any forfeit applies — a
   queue entry written, `MATERIA.md` touched, or a large/deleting diff — stop
   and report the green PR URL, exactly as a `--no-merge` run would. Otherwise
   merge through the **merge-PR op** (`MATERIA.md` § Version control § Forge), using the
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

### 9. Close

Print the closing report: fixes landed, proposed specs filed, skips,
needs-human notes, deferred remainder, PR URL + merge state. End the turn.

## The docs-only envelope (binding)

Before **every push** and again **immediately before merge**, assert that
`git diff <baseline>...HEAD --name-only` matches only:

```
CLAUDE.md
README.md
MATERIA.md                         (sweepable — but touching it forfeits auto-merge)
.materia/docs/*.md                 (root files)
.materia/docs/resources/**
.materia/docs/standards/**
.materia/docs/_templates/**
.materia/docs/specs/_proposed/*.md (NEW files only — an oversized-finding queue entry; forfeits auto-merge)
```

A path under `.materia/docs/specs/_proposed/` is envelope-legal **only when it
is a file addition** (`git diff <baseline>...HEAD --name-status` shows `A` for
it) — a modification or deletion of any existing `specs/` file is out. Anything
else in the diff — any source or config file, anything under `.claude/`,
`.materia/docs/bugs/`, `.materia/docs/epics/`, `.materia/docs/research/`, or any
**edit to an existing file** under `.materia/docs/specs/` — means the run has
escaped its envelope: **revert the offending change and if the fix genuinely
requires it, drop that fix with a needs-human note.** The auto-merge privilege
exists only inside this envelope.

### Auto-merge forfeits (one mechanism)

The auto-merge privilege is **standing** but conditional: inside the envelope
above, a clean docs-only sweep auto-merges. **Any one** of the following
forfeits it — the run **keeps its green PR but does not auto-merge**, reporting
the PR URL and stopping exactly as a `--no-merge` run would. All are checked at
the **same assertion points** (before every push, and again immediately before
merge); any combination still yields the single outcome of an unmerged green PR
reported to the operator:

- **Scale guard.** Compute `git diff <baseline>...HEAD --numstat` and use the
  **deleted-lines column** (insertions never offset deletions — a balanced
  rewrite is still a rewrite), plus
  `git diff <baseline>...HEAD --name-status --diff-filter=D` for whole-file
  deletions (numstat alone can't distinguish them). Forfeit if the deletion
  filter reports **any file**, numstat shows a **binary entry** (`-`), the diff
  deletes more than **50 lines from any single file**, or deletes more than
  **150 lines in total**. Whole-doc removals and large rewrites are human
  decisions; a drift sweep that big is a signal, not a chore.
- **MATERIA.md touched.** A diff that touches `MATERIA.md` is envelope-legal
  but never auto-merges — its § Gate and § Tiers are enforcement
  configuration, not prose; a human reviews every change to them.
- **Queue entry written.** A run that files an oversized finding — a **new**
  proposed spec under `.materia/docs/specs/_proposed/` (`source: librarian`;
  `.materia/docs/standards/skills.md` § Maintainer lifecycle § Oversized
  findings) — keeps its PR for human review; a queued proposal is a product
  decision, not a docs chore.

## Scope (what this skill does NOT do)

- **NEVER edits product code, tests, CI config, or skills** — even to "fix"
  CI. A CI failure that demands a non-docs change ends the run (§ Procedure 8).
- **NEVER edits or removes an existing artifact in the historical trees**
  (`.materia/docs/specs/**`, `.materia/docs/bugs/**`, `.materia/docs/epics/**`,
  `.materia/docs/research/**`) — the sole carve-out is creating a **new**
  `_proposed/` proposed spec for an oversized finding (§ The docs-only envelope).
- **Writes no bug reports** — a suspected code bug or normative code-vs-doc
  conflict becomes a needs-human note in the PR body, never a
  `.materia/docs/bugs/_reports/` file (nothing is the oracle for normative
  text, § Rules). Oversized *doc* work is the librarian's only queue entry, and
  only as a **proposed spec** (§ The docs-only envelope § Auto-merge forfeits);
  if a note warrants a bug report, the operator runs `/materia:report-bug`
  afterward.
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
- **Every edit follows `.materia/docs/standards/docs.md`** — a librarian pass must
  never itself introduce narration, duplication, or cell bloat.
- **Idempotent + schedulable** — a run against undrifted docs is a clean
  no-op; safe to run on a cron (`/schedule`) or ad hoc.
- **One PR per run**; an interrupted run is re-invoked fresh (a stray
  pre-push branch is deleted or pushed manually by the operator).
