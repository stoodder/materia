# Skills (Claude Code) — authoring & documentation

> A skill is a documented, discoverable unit of agent behavior; adding or
> changing one is not done until its `SKILL.md` **and** the harness docs that
> advertise it are true in the same change.

## Rule

- **One folder per skill:** `.claude/skills/<name>/SKILL.md`. The frontmatter
  `name:` MUST equal the folder name (mirrors the repo's one-export-per-file,
  filename = export ethos — see [architecture.md](architecture.md)).
- **`description:` is the routing surface.** It is what the harness reads to
  decide relevance, so write it for a cold agent: what the skill does, what it
  consumes/produces, and when to reach for it. Lead with the trigger.
- **Follow the house spine** (see § SKILL.md anatomy). A reader should be able to
  find _what it does_, _inputs/outputs_, _the procedure_, _what it deliberately
  does NOT do_, and _the rules_ in the same places every time.
- **Declare the tier where one applies.** A **sub-skill** (dispatched by an
  orchestrator) carries a `## Recommended tier` line in `<model>/<effort>`
  notation from the single source of truth, `MATERIA.md` § Tiers (the model
  set, availability, fallback, and effort→guidance map all live there).
  An **orchestrator/producer** runs in the operator's session and declares no
  tier. A declared model that `MATERIA.md` § Tiers lists as `opt-in` (or does
  not list at all) coerces to the fallback unless the operator has enabled
  it — availability is durable repo config, not a per-run flag.
- **Keep state in the diff** where the skill's nature allows — prefer a
  reviewable PR/working-tree diff over a side audit folder; say so under Scope.
- **A skill change is not done until its registration surfaces are updated**
  in the same change (see § Registration surfaces). This is the repo's
  "keep the docs true" rule ([../contributing.md](../contributing.md)) applied
  to the harness itself.

## Why

Skills _are_ the harness's behavior. An undocumented or mis-registered skill is
invisible to the next agent (bad `description` → never routed to) or actively
misleading (the roster tables disagree with what the skills do). The
frontmatter `description` is how the harness routes; the pipeline README's
graph and tables are how a human or agent discovers how the pieces fit. Both
must track reality or the pipeline silently rots.

## How

### SKILL.md anatomy

The common spine across this repo's skills — match it so skills read alike:

| Section | Required for | Purpose |
|---|---|---|
| `---` frontmatter (`name`, `description`) | every skill | identity + routing |
| Intro paragraph | every skill | one-breath "what this is" + where it sits in the loop |
| `## Inputs` / `## Outputs` (or an Inputs/Outputs table) | every skill | the contract — what it reads, what it leaves behind; if the skill produces a committed artifact (a file written to the branch), document it in `## Outputs`; a producing stage's `_templates/` stub is part of that artifact contract and must be kept in sync whenever the artifact's shape changes |
| `## Recommended tier` | **sub-skills only** | `<model>/<effort>` per `MATERIA.md` § Tiers |
| `## Procedure` (numbered steps) | every skill | the actual algorithm |
| `## Scope` ("what this skill does NOT do") | every skill | the guardrails — prevents overreach |
| `## Rules` | most skills | invariants the procedure must hold |
| `## Standalone use` | sub-skills | how to run it outside its orchestrator |

**Progressive disclosure for long skills:** when a SKILL.md outgrows a single
comfortable read, keep an always-read core (the spine above) and move
phase-scoped detail into `resources/*.md` files that the procedure names at
the phase that needs them (precedent: `ship-spec/resources/spawn-contract.md`,
`triage-retros/resources/`). Contract text that other skills parse remains a
protected contract wherever it lives — moving it between files means updating
every consumer's pointer in the same change.

**The adaptation playbook** (applied across the 2026-07-01 Opus 4.8 passes;
reuse it when reworking any skill):

1. **Measure** — line/token weight and how many times a run re-reads the file
   (resume gates, checkpoints).
2. **Classify each section** as *contract* (parse anchors, artifact shapes,
   halt/resume semantics — keep verbatim), *procedure* (compress to steps),
   *rationale* (extract to design-notes), or *duplication* (extract to a
   shared resource and point every copy at it).
3. **Split for progressive disclosure** (above) where a single read doesn't
   fit.
4. **Reinvest in verification** where retro evidence shows drift: validate
   references at write time, fail-fast at read time, retry transient
   sub-agent failures once.
5. **Check environment parity** — every `gh` call needs its GitHub-MCP twin;
   every reviewer/implementer brief carries the inline-only/no-nested-spawn
   rule.
6. **Keep tiers generic** — `<model>/<effort>` per `MATERIA.md` § Tiers;
   never pin a dated model name in a skill body.
7. **Update registration surfaces in the same change**, flagging moved
   protected-contract text loudly.

### The `--auto` argument (ship-spec autopilot)

`--auto` is a presence-only argument with fail-open parsing: before matching,
normalize the *leading* dash run of each argument token — replace any leading
run of hyphen-minus (U+002D), en dash (U+2013), or em dash (U+2014)
characters, in any repetition or mixture, with exactly two hyphen-minus
characters — then compare against the literal `--auto`. Any near-miss the
normalization does not cover (wrong case, single dash, typo) is treated as
NOT PRESENT; posture stays `off` — every ambiguity resolves toward *not*
granting autonomy. Its semantics live entirely in `ship-spec`: posture `on`
auto-accepts the run's operator checkpoints (intake defaults, non-blocking
judgement calls), and after finalize opens the PR the orchestrator watches
CI, fixes failures, resolves merge conflicts, and **merges once green** — see
`ship-spec/SKILL.md` § Autopilot and § Merge watch. Every other skill accepts
the flag syntactically as a documented no-op.

The posture persists in `STATUS.md` § Autopilot posture so a resumed run
keeps it; an explicit `--auto` at resume upgrades `off → on`, and nothing
downgrades implicitly. Blockers, loop bounds, and gates are unchanged —
autopilot removes waits, not safety.

An autopilot merge is the **second sanctioned exception** to the
"no auto-merge" invariant (§ Skill kinds): unlike the librarian's standing
mechanical-envelope privilege, it is granted per run by the operator's
explicit flag, and it merges only a green, mergeable PR with no unresolved
human comments and no `Blocker`.

### Skill kinds

| Kind | Runs in | Tier | Examples |
|---|---|---|---|
| **Orchestrator** | operator session | none (dispatches others) | `ship-spec`, `triage-retros`, `apply-pipeline-improvements` |
| **Sub-skill** | a fresh-context subagent the orchestrator spawns | `## Recommended tier` | `intake-spec`, `design`, `architecture`, `plan-tasks`, `implement-task`, `finalize`, `docs-sync`, `docs-audit` |
| **Producer** | operator session | none | `propose-spec`, `propose-epic`, `suggestions-to-specs`, `report-bug`, `bugs-to-reports`, `ui-inspection` — each writes into a queue under that queue's contract (`docs/specs/_proposed/` for spec proposals; `docs/bugs/_reports/` for bug reports) with a distinct `source:` key |
| **Maintainer** | operator session (or scheduled) | none | `librarian` (sweeps the living docs) and `janitor` (sweeps the code against `docs/standards/`) — each fixes drift directly and opens one PR instead of filing queue entries. Only the librarian **auto-merges its own PR**: a standing exception to the "no auto-merge" invariant, valid only behind a mechanical diff envelope + green CI (its § The docs-only envelope); the janitor's diff is product code, so it stops for human review. Per-run exception: `--auto` (§ The `--auto` argument). |

A producer additionally MUST conform to the queue's frontmatter/filename
contract and register its `source` key — see § Registration surfaces.

**Dual-mode exception:** `reconcile-epic` is a producer-lifecycle skill when
run standalone but a tier-carrying sub-skill when `ship-spec`'s epic gate
spawns it in pipeline mode (see its SKILL.md § Pipeline mode) — it declares a
`## Recommended tier` for that mode only.

### Producer lifecycle — the shared contract

Every producer follows one lifecycle; each SKILL.md states its two mode
choices and points here instead of restating the machinery. Skill-specific
content (what it discovers, how it triages, its file format) stays in the
skill.

**Checkpoint mode** — one of:

- **Interactive** (`report-bug`, `propose-spec`, `propose-epic`,
  `reconcile-epic` standalone, `suggestions-to-specs`,
  `bugs-to-reports`): draft everything
  in-memory, present one confirmation block, then pause. Reply verbs, with
  exactly these semantics: `approve` (write + ship), `edit: <feedback>`
  (adjust all drafts, re-present), `edit <id>: <feedback>` (adjust one),
  `drop <id>` (remove one from the batch), `cancel` (exit cleanly — nothing
  written, and if a branch was already created, switch to `main` and delete
  it). Fold-and-re-present loops until `approve`; usually one round — on
  round 5+ prefer a fresh re-draft over incremental edits. Silence is fine;
  nothing lands until `approve`.
- **Autonomous** (`ui-inspection`): no mid-run checkpoint —
  the PR is the operator's review gate, so triage MUST be conservative (when
  in doubt, drop and list it; a false entry costs more than a missed one).

**Branch timing** — one of:

- **Branch-at-discovery** (queue consumers — `suggestions-to-specs`,
  `bugs-to-reports`): once work is found,
  `git checkout main && git pull` then branch; the branch holds **zero
  diffs** until approve.
- **Branch-at-approve** (Q&A producers — `report-bug`, `propose-spec`,
  `propose-epic`, `reconcile-epic` standalone): the
  whole Q&A is in-memory; the branch is created only on `approve`, so an
  abandoned conversation leaves no trace.

Either way: if `git pull` is blocked by local uncommitted changes, halt and
surface the conflict; if the branch name already exists locally (same-day
rerun), append a short hex suffix (`openssl rand -hex 2`).

**Invariants (all producers):**

- **Zero-work exit** — nothing to do → print why and end the turn; no
  branch, no files, no PR.
- **Id minting** — `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (a
  fresh 6-char base36 token; the single canonical command). The filename/
  folder timestamp prefix is minted alongside it:
  `date -u +%Y-%m-%d-%H%M%S` (UTC, to the second — creation order is the
  sort order). Never reuse an
  id on disk in either queue or visible in the recent merge log. On a
  filename/folder collision, regenerate once and retry; a second collision
  halts with the colliding path.
- **Slug** — the normative kebab-slug algorithm in
  `docs/specs/_proposed/README.md` § Kebab-slug derivation; never invent a
  variant.
- **Consume-by-rename** — a consumed source is `git mv`'d to its
  `.processed.md` name with a one-line `processed_on: <YYYY-MM-DD>` footer,
  in the same commit as the entries it produced.
- **Link integrity on new files** — before committing, run
  `node scripts/check-docs.mjs` and fix any link the *new* files introduce
  (pre-existing debt on `main` is not this run's job). If `check:docs` isn't
  runnable, grep the new files for `](../` and `](./` and verify each target
  manually.
- **One PR per run, no auto-merge.** PR body carries the rendered entries
  inline (reviewers read without fetching) plus the dropped/skipped list
  with one-line rationales — nothing is silently discarded.
- **PR tooling** — `gh pr create` locally; in the remote execution
  environment there is **no `gh` CLI** — open the PR via the GitHub MCP
  `create_pull_request` tool (same title/body). Both paths produce the same
  PR.
- **No session survival** — an interrupted run is re-invoked fresh; a stray
  pre-push branch is deleted or pushed manually by the operator.

### Registration surfaces — update in the same change

When a skill is **added, renamed, retired, or has its role/model/inputs
changed**, update every surface that applies. This is the harness's
touch-X→update-Y map:

| Surface | Update when… |
|---|---|
| The repo's skill-roster surface — `CLAUDE.md`'s pipeline paragraph and, when the repo keeps one, a README flow graph/tables | any skill is added / renamed / retired, or its model or role changes |
| [`CLAUDE.md`](../../CLAUDE.md) — the spec-to-ship pipeline paragraph | the pipeline's shape or the producer count changes |
| [`docs/specs/README.md`](../specs/README.md) — pipeline / closing-loop / producers tables | a stage, sibling, or producer skill changes |
| The **target queue's** producers table + `source` key (e.g. [`docs/specs/_proposed/README.md`](../specs/_proposed/README.md) for spec proposals, [`docs/bugs/_reports/README.md`](../bugs/_reports/README.md) for bug reports); the epic family additionally keeps [`docs/epics/README.md`](../epics/README.md) true | a **producer** skill is added or its source key changes |
| The skill's `## Recommended tier` + `MATERIA.md` § Tiers (when the model set or availability changes) | a sub-skill's model/effort changes |
| This standard (including `### Retro touchpoint contract` below) | the authoring convention itself changes, **including** any change to the retro touchpoint sole-writer invariant or the ` ```retro ` fenced-block contract |

### Retro touchpoint contract

Every retro-producing skill obeys the **orchestrator sole-writer invariant**:

- **The orchestrator is the sole writer of `retro.md`.** No subagent in any
  stage writes to or commits `retro.md` directly.
- **Every subagent returns its retro entry** in a ` ```retro ` fenced block
  (opening fence exactly ` ```retro `; closing fence a bare ` ``` ` on its own
  line) as the final element of its report.
- **The orchestrator parses, numbers, appends, and flushes** — it extracts the
  entry from the fenced block, assigns the next sequence number, appends to
  `retro.md`, and commits once per batch (for parallel tasks, after all returns
  are collected).

Example of the fenced-block shape a subagent emits:

````
```retro
## Entry N — implement-task:T3 — 2026-06-25T15:00:00Z

- **Stage:** implement-task:T3
- **Outcome:** ok
- **Subagent return:** ok

### What went well
- ...

### What could be improved
- ...

### Unexpected
- ...

### Other signals
- ...
```
````

The normative algorithm (extraction rules, edge-case table, parallel-batch
ordering) lives in
[`ship-spec/SKILL.md` § Retrospective capture](../../.claude/skills/ship-spec/SKILL.md#retrospective-capture-per-run-retromd).
This section states the invariant; that file carries the implementation detail.

## Where it lives

- `.claude/skills/<name>/SKILL.md` — every skill.
- `MATERIA.md` § Tiers — the tier vocabulary (single
  source of truth for `<model>/<effort>`).
- The registration surfaces listed above — how skills are advertised.

## Related

- [../specs/README.md](../specs/README.md) — the spec-to-ship pipeline overview.
- [../specs/_proposed/README.md](../specs/_proposed/README.md) — the shared
  proposed-specs queue contract (the producer/consumer interface).
- [../contributing.md](../contributing.md) — Definition of Done + the code-side
  touch-X→update-Y map this mirrors.
- [architecture.md](architecture.md) — the one-folder/one-export ethos skills follow.
