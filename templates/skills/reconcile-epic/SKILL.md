---
name: reconcile-epic
description: Sync an epic in docs/epics/ with shipped reality — reads the as-built spec folders of shipped members, updates the epic (member statuses, decisions, dependency graph, change log), and cascades any invalidated content into the epic's remaining pending member proposals in docs/specs/_proposed/. Dual-mode. Pipeline mode — ship-spec spawns it automatically between docs-audit and finalize whenever the proposal being shipped carries an epic key (the epic gate), so the sync + cascades ride the member's own PR. Standalone mode — run it anytime as a backstop or for an epic status board; idempotent, exits clean when nothing changed, one PR per run when there is anything to write. Reports which members are unblocked and ready to ship next.
---

# reconcile-epic — cascade shipped reality back through an epic

The maintainer half of the epic family
([`propose-epic`](../propose-epic/SKILL.md) is the creator half). Epics are
plans made before any member ships; each `ship-spec` run then produces
as-built truth that can drift from the plan — renamed identifiers, changed
contracts, descoped stories, decisions overturned at intake or review. This
skill closes that gap in **both directions of the epic's bi-directional
links**: shipped member → epic (statuses, decisions, change log), and epic →
pending siblings (cascade edits into the queued proposals that stand on the
changed ground).

The skill is **dual-mode**:

- **Pipeline mode** — spawned by `ship-spec` between docs-audit and finalize
  whenever the run's proposal is an epic member (the § Epic gate in
  `ship-spec/SKILL.md`). The sync + cascades commit on the run's existing
  branch and ride the member's own PR. This is the normal path — every
  member shipped through the pipeline reconciles its epic automatically.
- **Standalone mode** — invoked by the operator as `/reconcile-epic`. The
  backstop and status board: for drift from work that bypassed the pipeline
  (manual changes, `fix-bug` runs touching epic ground, a run whose epic
  gate failed and degraded), for retiring members/epics, or just to see
  what's unblocked. **Lifecycle:** interactive checkpoint · branch-at-approve
  — per the shared producer contract at `docs/standards/skills.md`
  § Producer lifecycle. All analysis is in-memory; nothing touches the repo
  until `approve`. Idempotent: a run that finds no drift and no status
  change is a zero-work exit, so running it "too often" is safe.

Read [`docs/epics/README.md`](../../../docs/epics/README.md) (the epic
contract — especially § Who writes what, which sanctions this skill's edits
to queued proposals) and
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
before changing this skill.

## Recommended tier

`sonnet/high` (pipeline mode; standalone mode runs in the operator's session
and declares no tier). Cascade edits silently become a future `ship-spec`
run's input — reason carefully before editing a pending proposal.

## Inputs / Outputs

| | |
|---|---|
| **Inputs** | An epic `id` (or no args → menu of `active` epics); the epic's `epic.md`; its pending member proposals in `docs/specs/_proposed/`; the spec folders of shipped/in-flight members (resolved via `STATUS.md` `Proposed-id:`), including their `spec.md` and `retro.md`. |
| **Outputs** | One PR (when there is work): updated `epic.md` (statuses, `Shipped as` paths, decision revisions, change-log entry, possibly `status:` flip) + cascade edits to pending member proposals. Always: a printed member-status board with the ready-to-ship-next list. |

## Procedure

### 1. Resolve the epic

| Input shape | Behavior |
|---|---|
| `/reconcile-epic <id>` matching a `docs/epics/*/epic.md` frontmatter id | Advance with that epic. |
| `/reconcile-epic` (no args) | List `status: active` epics (id · title · members shipped/total) and ask the operator to pick; no active epics → print that and end the turn. |
| `<id>` matches nothing | Print the id and the available epic ids; end the turn. |

Resolve by frontmatter `id`, never by folder name.

### 2. Observe every member's actual state

For each row in the epic's `## Member specs` table, determine the observed
state:

- **pending** — a top-level `docs/specs/_proposed/*.md` file carries that
  proposal `id` in frontmatter.
- **in-flight / shipped** — some `docs/specs/*/STATUS.md` carries
  `Proposed-id: <id>`; read that folder's `STATUS.md` to tell in-flight
  (stages incomplete, no merged PR) from shipped.
- **gone** — neither; the proposal was deleted (rejected) or the folder was
  removed. Flag it — this needs the operator's call (mark `dropped` or
  investigate), never a silent table edit.

### 3. Diff shipped reality against the plan

For each member whose observed state is `shipped` but whose table row says
otherwise (the **newly shipped** set), read the as-built spec folder —
`spec.md` (the truth of what was agreed at intake), `retro.md`, and the
merged PR title/summary when `STATUS.md` records it — and collect drift
against the epic:

- **Decision drift** — an `## Decisions` entry the shipped work contradicts.
- **Ground drift** — identifiers, routes, models, components, or contracts a
  pending sibling's body names that the shipped member renamed, reshaped, or
  never built.
- **Scope drift** — stories the epic assigned to this member that were
  descoped (do they move to a pending sibling, or drop?), or shipped extras
  that make part of a pending sibling redundant.

In-flight members contribute status updates only — their content isn't
final, so nothing cascades from them.

### 4. Draft the reconciliation (in-memory)

- **`epic.md`:** member table updates (Status + `Shipped as` paths);
  decision revisions (strike-and-replace per the epic contract, never silent
  deletion); a dated `## Change log` entry summarizing the run; the
  dependency graph + ship-order paragraph if edges changed; `status:` flip
  to `shipped` when every member is terminal (or `abandoned` only on
  explicit operator instruction).
- **Pending member proposals:** for each drift item that **factually
  invalidates** queued content, edit that proposal's body (and `depends_on`
  if the graph changed). Conservative bar: renamed identifiers, changed
  contracts, moved/dropped scope — yes; restyling prose that is still true —
  no. Refresh each touched proposal's `## Epic context` section in the same
  edit. Never change a pending proposal's `id`, `date`, `source`, or
  filename.
- **Ready-next list:** members whose `depends_on` are all shipped, in
  ship-order.

### 5. Checkpoint

Nothing to write (no status change, no drift)? Print the member-status board
+ ready-next list and end the turn — zero-work exit, no branch, no PR.

Otherwise present one confirmation block: the member-status board (planned →
observed per member); each epic edit; each cascade edit as a per-proposal
summary of concrete changes with the drift item that forced it; the
ready-next list. Reply verbs per the lifecycle: `approve` · `edit: <feedback>`
· `edit <id>: <feedback>` · `drop <id>` (skip that proposal's cascade this
run) · `cancel`. End the turn; fold-and-re-present until `approve`.

### 6. Branch, write, commit, push, open PR

On `approve`:

1. `git checkout main && git pull`, then
   `git checkout -b epic/reconcile-<epic-id>` (dirty-pull + same-day
   collision handling per the lifecycle).
2. Apply the epic edits and the cascade edits.
3. Verify link integrity per the lifecycle invariant, then commit — epic
   update and proposal cascades may share one commit or split into two;
   message prefix `reconcile-epic:`.
4. Push and open the PR (lifecycle tooling rules). Title:
   `epic reconcile: <epic title> after <shipped member slug(s)>`. Body: the
   member-status board, each cascade edit with its one-line drift rationale,
   the skipped/no-change list, and the ready-next line ("Next up:
   `/ship-spec <id>` …").

Print the closing report (board, PR URL, ready-next list) and end the turn.

## Pipeline mode (spawned by ship-spec)

The § Epic gate spawns this skill with the input line
`pipeline-mode: docs/specs/<dated-slug>/ · epic: <epic-id>`. The procedure
above applies with these deltas:

- **Step 1 is skipped** — the epic id is given; resolve it directly (an id
  that matches no `docs/epics/*/epic.md` is returned as a failure, never
  guessed around).
- **The current run's member counts as shipped.** The spec folder named by
  `pipeline-mode:` is the member being shipped right now: mark its table row
  `shipped` with `Shipped as: docs/specs/<dated-slug>/`, even though its
  proposal file still sits in the queue (finalize dequeues it later in the
  same PR) and the PR is not yet merged (the edit only lands if it merges —
  see the gate's consistency note). Its as-built truth is the folder's
  `spec.md` + the branch's cumulative diff.
- **No checkpoint, no branch, no PR** (steps 5–6 are replaced): commit the
  epic edits + cascade edits directly on the run's existing branch, message
  prefix `ship-spec(reconcile-epic):`. The run's PR is the review gate, so
  cascade **extra**-conservatively: when a cascade is uncertain, leave the
  proposal untouched and record the question in the report instead.
- **Orchestrator-lane rules apply** (spawn-contract Block 1): never touch
  `STATUS.md` or `retro.md`; return the report inline, ending with the
  ` ```retro ` block. The report carries: the member-status board, each
  cascade edit + one-line drift rationale, unresolved questions for the PR
  body, and the ready-next list (finalize surfaces these in the PR).
- **Zero-drift is still a valid outcome** — commit nothing except the epic's
  member-table status update + change-log entry (those always change: this
  run ships a member).

## Scope (what this skill does NOT do)

- Does NOT ship, build, or fix anything — it edits planning artifacts only.
- Does NOT touch shipped spec folders, `STATUS.md` files, or anything under
  `docs/specs/<dated-slug>/` — as-built artifacts are read-only history.
- Does NOT touch proposals whose `epic:` key names a different epic or is
  absent — other producers' files stay untouched, per the epic contract's
  § Who writes what.
- Does NOT create new member proposals. Shipped reality revealing a missing
  member is a finding to surface at the checkpoint, with a pointer to
  `/propose-spec` (or a follow-up `/propose-epic` amendment PR by hand).
- Does NOT enforce ship order — it reports what's unblocked; the operator
  chooses.

## Rules

- **Read states, don't trust the table.** The `## Member specs` table is the
  claim; `_proposed/` files and `STATUS.md` `Proposed-id:` matches are the
  evidence. Every run re-observes before editing.
- **Cascade conservatively.** Only factual invalidation edits a pending
  proposal; when in doubt, surface the question at the checkpoint instead of
  editing. A wrong cascade silently corrupts a future `ship-spec` run's
  input.
- **Identity is immutable** — pending proposals keep `id`, `date`, `source`,
  and filename; the epic keeps its `id` and folder name, whatever else
  changes.
- **History is append-only** — decisions are struck-and-replaced, the change
  log only grows, and every run that writes anything leaves exactly one new
  change-log entry.
- **One epic per run.** Multiple epics needing reconciliation → separate
  runs, separate PRs. (A proposal carries at most one `epic:` key, so
  pipeline mode never faces this.)
- **Standalone mode always ends in a PR** when anything is written, per the
  lifecycle — never stop at a pushed branch. Pipeline mode never opens one —
  its edits ride the ship-spec run's PR.
