# Skills (Claude Code) — authoring & documentation

> A skill is a documented, discoverable unit of agent behavior; adding or
> changing one is not done until its `SKILL.md` **and** the harness docs that
> advertise it are true in the same change.

## Rule

- **One folder per skill:** `.claude/skills/<name>/SKILL.md`. The frontmatter
  `name:` MUST equal the folder name (mirrors the repo's one-export-per-file,
  filename = export ethos — see [architecture.md](architecture.md)).
- **Namespace prefix.** Every harness skill is named `materia-<role>`
  (folder + frontmatter + invocation), so generic roles (`design`,
  `architecture`, `init`, `finalize`) can't collide with user skills, plugin
  skills, or Claude Code built-ins. New skills follow the prefix. In prose,
  a bare unbackticked name (`ship-spec`, `design`) refers to the *pipeline or
  stage concept*; the routable skill identity always carries the prefix —
  stage ids, retro `Stage:` values, STATUS note strings, commit-message
  prefixes, queue `source:` keys, and branch names stay bare (they are run
  artifacts, not routing).
- **`description:` is the routing surface.** It is what the harness reads to
  decide relevance, so write it for a cold agent: what the skill does, what it
  consumes/produces, and when to reach for it. Lead with the trigger.
- **Follow the house spine** (see § SKILL.md anatomy). A reader should be able to
  find _what it does_, _inputs/outputs_, _the procedure_, _what it deliberately
  does NOT do_, and _the rules_ in the same places every time.
- **Tiers are assigned centrally — skills carry none.** A **sub-skill**
  (dispatched by an orchestrator) gets its `<model>/<effort>` tier from a row
  keyed on its skill name in `MATERIA.md` § Skill routing — the single source
  of truth. Skill bodies declare no tier of their own; the routing table (plus
  its § Model set catalog, § Fallback backstop, and § Effort set map) is where
  a unit's model and effort live. An **orchestrator/producer** runs in the
  operator's session and is unrouted (no spawn tier). A model that
  `MATERIA.md` § Model set lists as `opt-in` (or does not list at all) coerces
  to the row's **Fallback Model** — the Default row's when the skill has no row
  of its own — unless the operator has enabled it (§ Coercion); availability is
  durable repo config, not a per-run flag.
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
| `## Procedure` (numbered steps) | every skill | the actual algorithm |
| `## Scope` ("what this skill does NOT do") | every skill | the guardrails — prevents overreach |
| `## Rules` | most skills | invariants the procedure must hold |
| `## Standalone use` | sub-skills | how to run it outside its orchestrator |

**Progressive disclosure for long skills:** when a SKILL.md outgrows a single
comfortable read, keep an always-read core (the spine above) and move
phase-scoped detail into `resources/*.md` files that the procedure names at
the phase that needs them (precedent: `materia-ship-spec/resources/spawn-contract.md`,
`materia-triage-retros/resources/`). Contract text that other skills parse remains a
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
6. **Keep tiers out of the body** — routing lives in `MATERIA.md`
   § Skill routing (assignment) and § Model set (the catalog); a skill body
   names no tier and never pins a dated model name.
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
granting autonomy. Its semantics live entirely in `materia-ship-spec`: posture `on`
auto-accepts the run's operator checkpoints (intake defaults, non-blocking
judgement calls), and after finalize opens the PR the orchestrator watches
CI, fixes failures, resolves merge conflicts, and **merges once green** — see
`materia-ship-spec/SKILL.md` § Autopilot and § Merge watch. Every other skill accepts
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
| **Orchestrator** | operator session | none (dispatches others) | `materia-ship-spec`, `materia-triage-retros` |
| **Sub-skill** | a fresh-context subagent the orchestrator spawns | its row in `MATERIA.md` § Skill routing | `materia-intake-spec`, `materia-design`, `materia-architecture`, `materia-plan-tasks`, `materia-implement-task`, `materia-finalize`, `materia-docs-sync`, `materia-docs-audit` |
| **Producer** | operator session | none | `materia-propose-spec`, `materia-propose-epic`, `materia-suggestions-to-specs`, `materia-report-bug`, `materia-bugs-to-reports`, `materia-ui-inspection` — each writes into a queue under that queue's contract (`docs/specs/_proposed/` for spec proposals; `docs/bugs/_reports/` for bug reports) with a distinct `source:` key |
| **Maintainer** | operator session (or scheduled) | none | `materia-librarian` (sweeps the living docs) and `materia-janitor` (sweeps the code against `docs/standards/`) — each fixes drift directly and opens one PR instead of filing queue entries. Only the librarian **auto-merges its own PR**: a standing exception to the "no auto-merge" invariant, valid only behind a mechanical diff envelope + green CI (its § The docs-only envelope); the janitor's diff is product code, so it stops for human review. Per-run exception: `--auto` (§ The `--auto` argument). |

A producer additionally MUST conform to the queue's frontmatter/filename
contract and register its `source` key — see § Registration surfaces.

**Dual-mode exception:** `materia-reconcile-epic` is a producer-lifecycle skill when
run standalone but a routed sub-skill when `materia-ship-spec`'s epic gate
spawns it in pipeline mode (see its SKILL.md § Pipeline mode) — its pipeline-mode
tier comes from its `MATERIA.md` § Skill routing row, applied only in that mode.

### Producer lifecycle — the shared contract

Every producer follows one lifecycle; each SKILL.md states its two mode
choices and points here instead of restating the machinery. Skill-specific
content (what it discovers, how it triages, its file format) stays in the
skill.

**Checkpoint mode** — one of:

- **Interactive** (`materia-report-bug`, `materia-propose-spec`, `materia-propose-epic`,
  `materia-reconcile-epic` standalone, `materia-suggestions-to-specs`,
  `materia-bugs-to-reports`): draft everything
  in-memory, present one confirmation block, then pause. Reply verbs, with
  exactly these semantics: `approve` (write + ship), `edit: <feedback>`
  (adjust all drafts, re-present), `edit <id>: <feedback>` (adjust one),
  `drop <id>` (remove one from the batch), `cancel` (exit cleanly — nothing
  written, and if a branch was already created, switch to `main` and delete
  it). Fold-and-re-present loops until `approve`; usually one round — on
  round 5+ prefer a fresh re-draft over incremental edits. Silence is fine;
  nothing lands until `approve`.
- **Autonomous** (`materia-ui-inspection`): no mid-run checkpoint —
  the PR is the operator's review gate, so triage MUST be conservative (when
  in doubt, drop and list it; a false entry costs more than a missed one).

**Branch timing** — one of:

- **Branch-at-discovery** (queue consumers — `materia-suggestions-to-specs`,
  `materia-bugs-to-reports`): once work is found,
  `git checkout main && git pull` then branch; the branch holds **zero
  diffs** until approve.
- **Branch-at-approve** (Q&A producers — `materia-report-bug`, `materia-propose-spec`,
  `materia-propose-epic`, `materia-reconcile-epic` standalone): the
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
- **Shell-boundary hygiene** — frontmatter and artifact fields are data,
  never trusted shell input. Consumers validate `id` against
  `^[a-z0-9]{4,8}$` at discovery (non-conforming → drop with a warning);
  paths derived from fields are pattern-checked against their queue's
  folder/filename contract (no `..`, confined to the queue dir) and quoted
  before any `git rm`/`git mv`; free-text fields (`title`) reach `gh pr
  create` only via `--body-file` or after stripping `"`, backticks, and
  `$(`. The kebab-slug algorithm covers slugs/branches; this rule covers
  everything else that touches a shell.
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
  with one-line rationales — nothing is silently discarded. The body's last
  element is the Materia sigil (§ PR attribution — the Materia sigil).
- **PR tooling** — `gh pr create` locally; in the remote execution
  environment there is **no `gh` CLI** — open the PR via the GitHub MCP
  `create_pull_request` tool (same title/body). Both paths produce the same
  PR.
- **No session survival** — an interrupted run is re-invoked fresh; a stray
  pre-push branch is deleted or pushed manually by the operator.

### PR attribution — the Materia sigil

Every PR any Materia skill opens closes its body with the **sigil** — the
harness's attribution footer. It is always the last element of the PR body,
after a horizontal rule, with the casting skill's name substituted:

```markdown
---

🔮 Forged with [Materia](https://github.com/stoodder/materia) · cast by `materia-<skill>` · *every run feeds the backlog*
```

- `materia-<skill>` = the skill that opened the PR (`materia-finalize` names
  the orchestrator that drove it instead — `materia-ship-spec` or
  `materia-fix-bug` — since finalize ships on their behalf).
- One sigil per PR, always last — CI-fix pushes, remediation rounds, and PR
  body edits never duplicate or reposition it.
- The sigil is attribution, not content: skills never cite it, and reviewers
  can ignore it. Keep the line's shape stable so it stays greppable
  (`Forged with [Materia]`).
- The "feeds the backlog" clause is literal: each run leaves a `retro.md`, and
  `materia-triage-retros` triages the batch into product suggestions and bug
  reports that reach the project's backlog via `materia-suggestions-to-specs`
  and `materia-bugs-to-reports`.

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
| The skill's row in `MATERIA.md` § Skill routing (and § Model set when the catalog or availability changes) | a sub-skill's model/effort changes |
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
ordering) lives in `materia-ship-spec/SKILL.md` § Retrospective capture.
This section states the invariant; that file carries the implementation detail.

## Where it lives

- `.claude/skills/<name>/SKILL.md` — every skill.
- `MATERIA.md` § Tiers — the single source of truth for `<model>/<effort>`:
  its § Model set catalog (the models this repo can spawn + availability) and
  its § Skill routing table (the per-skill / per-role assignment).
- The registration surfaces listed above — how skills are advertised.

## Related

- [../specs/README.md](../specs/README.md) — the spec-to-ship pipeline overview.
- [../specs/_proposed/README.md](../specs/_proposed/README.md) — the shared
  proposed-specs queue contract (the producer/consumer interface).
- [../contributing.md](../contributing.md) — Definition of Done + the code-side
  touch-X→update-Y map this mirrors.
- [architecture.md](architecture.md) — the one-folder/one-export ethos skills follow.
