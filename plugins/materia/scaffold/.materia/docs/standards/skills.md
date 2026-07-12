# Skills (Claude Code) — authoring & documentation

> A skill is a documented, discoverable unit of agent behavior; adding or
> changing one is not done until its `SKILL.md` **and** the harness docs that
> advertise it are true in the same change.

## Rule

- **One folder per skill, inside the `materia` plugin:** `skills/<name>/SKILL.md`,
  installed at `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` — cache-resident,
  not part of this repo. The frontmatter `name:` MUST equal the folder name
  (mirrors the repo's one-export-per-file, filename = export ethos — see
  [architecture.md](architecture.md)). This convention describes how the
  pipeline's own skills are authored upstream in the plugin; a project-owned
  Claude Code skill you add to this repo (unrelated to the materia pipeline)
  lives at the ordinary `.claude/skills/<name>/SKILL.md` location and can
  follow the same spine.
- **Namespace prefix — supplied by the plugin.** Skill folders and their
  frontmatter `name:` are **bare** (`ship-spec`, `design`, `init`) — they
  carry no `materia-` prefix. The `materia` plugin auto-namespaces every skill
  at invocation, so a skill is always called `/materia:<name>` (e.g.
  `/materia:ship-spec`); that `materia:` namespace is what keeps generic roles
  (`design`, `architecture`, `init`, `finalize`) from colliding with user
  skills, other plugins' skills, or Claude Code built-ins. New skills follow
  suit: bare folder, bare `name:`, invoked under `/materia:`. In prose, a bare
  unbackticked name (`ship-spec`, `design`) refers to the *pipeline or stage
  concept*; the routable identity is `/materia:<name>`. Run-artifact strings —
  stage ids, retro `Stage:` values, STATUS note strings, commit-message
  prefixes, queue `source:` keys, and branch names — stay bare (they are run
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
  `MATERIA.md` § Model set does not list coerces to the row's **Fallback
  Model** — the Default row's when the skill has no row of its own (§ Coercion).
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
5. **Check environment parity** — every `gh` call routes through `MATERIA.md`
   § Version control § Forge, which names each operation's GitHub-MCP twin and
   the `none`/manual fallback; every reviewer/implementer brief carries the
   inline-only/no-nested-spawn rule.
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
granting autonomy. Its semantics live entirely in `ship-spec`: posture `on`
auto-accepts the run's operator checkpoints (intake defaults, non-blocking
judgement calls). After finalize opens the PR the orchestrator **always**
watches CI, fixes failures, and resolves merge conflicts — surfacing the PR at
green for review; `--auto` **additionally merges once green** — see
`ship-spec/SKILL.md` § Autopilot and § PR watch. Every other skill accepts
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

### The `--approve-design` argument (ship-spec design gate)

Same parsing contract as `--auto`: presence-only, leading-dash
normalization, fail-open (any near-miss the normalization does not cover is
NOT PRESENT — never a parse error, and never granting the bypass).

Semantics live entirely in `ship-spec`: the flag **arms** a one-shot
auto-approval of the design gate — `status: auto-approved, by: auto,
reason: "--approve-design on invocation"` — consumed at the first gate
arrival after arming, then spent. The arming is recorded durably in
`STATUS.md` § Notes at stake (`design-gate: auto-approve armed
(--approve-design)`), rewritten to `design-gate: auto-approve consumed
(--approve-design)` at consumption — see `ship-spec/SKILL.md` § Design gate
for the full mechanics.

Contrast with `--auto`: `--auto` is a sticky per-run posture recorded in
`STATUS.md` § Autopilot posture; `--approve-design` is armed-then-consumed —
it never persists past one gate and never upgrades a later run. Its niche is
the non-autopilot run: skip the human round on one spec without granting
end-to-end autonomy. Under `--auto` it is redundant (the gate auto-approves
anyway); passing both is legal and changes nothing.

### Skill kinds

| Kind | Runs in | Tier | Examples |
|---|---|---|---|
| **Orchestrator** | operator session | none (dispatches others) | `ship-spec`, `fix-bug`, `triage-retros` |
| **Sub-skill** | a fresh-context subagent the orchestrator spawns | its row in `MATERIA.md` § Skill routing | `intake-spec`, `design`, `ui-test-plan`, `architecture`, `plan-tasks`, `implement-task`, `finalize`, `docs-sync`, `docs-audit`, `reproduce-bug`, `bug-analysis`, `ui-review` |
| **Producer** | operator session | none | `propose-spec`, `propose-epic`, `report-bug`, `triage-retros` — each writes into a queue under that queue's contract (`.materia/docs/specs/_proposed/` for spec proposals; `.materia/docs/bugs/_reports/` for bug reports) with a distinct `source:` key. `triage-retros` writes into **both** queues in one run, under `source: retro-triage` |
| **Maintainer** | operator session (or scheduled) | none | `librarian` (living docs), `janitor` (code vs `.materia/docs/standards/`), and the UI maintainers `curator` (visuals) / `concierge` (experience) — each fixes bounded drift directly, files oversized findings as queue entries, notes the rest, opens one PR after pre-PR review rounds (§ Maintainer lifecycle). Only the librarian **auto-merges**: the standing exception to the "no auto-merge" invariant, behind its docs-only envelope + green CI, forfeited on any forfeit-tripping run (§ The docs-only envelope); the janitor and the UI maintainers stop for review. `--auto` is a per-run exception (§ The `--auto` argument). |

A producer additionally MUST conform to the queue's frontmatter/filename
contract and register its `source` key — see § Registration surfaces. A
**maintainer** that files an oversized finding as a queue entry
(§ Maintainer lifecycle) does the same for that write: the same
frontmatter/filename contract and the same `source`-key registration.

**Dual-mode exception:** `reconcile-epic` is a producer-lifecycle skill when
run standalone but a routed sub-skill when `ship-spec`'s epic gate
spawns it in pipeline mode (see its SKILL.md § Pipeline mode) — its pipeline-mode
tier comes from its `MATERIA.md` § Skill routing row, applied only in that mode.

### Producer lifecycle — the shared contract

Every producer follows one lifecycle; each SKILL.md names its checkpoint and
branch timing and points here instead of restating the machinery. Skill-specific
content (what it discovers, how it triages, its file format) stays in the
skill.

**Checkpoint mode — interactive.** `report-bug`, `propose-spec`, `propose-epic`,
`reconcile-epic` standalone, and `triage-retros` all draft everything
in-memory, present one confirmation block, then pause. Reply verbs, with
exactly these semantics: `approve` (write + ship), `edit: <feedback>`
(adjust all drafts, re-present), `edit <id>: <feedback>` (adjust one),
`drop <id>` (remove one from the batch), `cancel` (exit cleanly — nothing
written, and if a branch was already created, switch to the trunk branch
(`MATERIA.md` § Version control) and delete it). Fold-and-re-present loops
until `approve`; usually one round — on round 5+ prefer a fresh re-draft
over incremental edits. Silence is fine; nothing lands until `approve`.

**Branch timing — branch-at-approve.** The whole draft (Q&A, or
`triage-retros`'s harvest + synthesis) is in-memory; the branch is created only
on `approve`, so an abandoned run leaves no trace. If `git pull` is blocked by
local uncommitted changes, halt and surface the conflict; if the branch name
already exists locally (same-day rerun), append a short hex suffix
(`openssl rand -hex 2`).

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
  `.materia/docs/specs/_proposed/README.md` § Kebab-slug derivation; never invent a
  variant.
- **Shell-boundary hygiene** — frontmatter and artifact fields are data,
  never trusted shell input. Consumers validate `id` against
  `^[a-z0-9]{4,8}$` at discovery (non-conforming → drop with a warning);
  paths derived from fields are pattern-checked against their queue's
  folder/filename contract (no `..`, confined to the queue dir) and quoted
  before any `git rm`/`git mv`; free-text fields (`title`) reach the open-PR
  op's `gh` path (`gh pr create` — `MATERIA.md` § Version control § Forge)
  only via `--body-file` or after stripping `"`, backticks, and `$(`. The
  kebab-slug algorithm covers slugs/branches; this rule covers everything
  else that touches a shell.
- **Consume-by-rename** — a consumed source is `git mv`'d to its
  `.processed.md` name with a one-line `processed_on: <YYYY-MM-DD>` footer,
  in the same commit as the entries it produced.
- **Link integrity on new files** — before committing, run
  `sh .materia/scripts/check-docs.sh` and fix any link the *new* files introduce
  (pre-existing debt on the trunk (`MATERIA.md` § Version control) is not this
  run's job). If `check:docs` isn't
  runnable, grep the new files for `](../` and `](./` and verify each target
  manually.
- **One PR per run, no auto-merge.** PR body carries the rendered entries
  inline (reviewers read without fetching) plus the dropped/skipped list
  with one-line rationales — nothing is silently discarded. The body's last
  element is the Materia sigil (§ PR attribution — the Materia sigil).
- **PR tooling** — opening the PR routes through `MATERIA.md`
  § Version control § Forge (open-PR op), which owns the `gh` recipe, its
  GitHub-MCP twin, and the `none`/manual fallback.
- **No session survival** — an interrupted run is re-invoked fresh; a stray
  pre-push branch is deleted or pushed manually by the operator.

### Maintainer lifecycle — the shared contract

Every **maintainer** (§ Skill kinds) follows one lifecycle; each SKILL.md
points here for the shared machinery and states only its skill-specific
content (what it sweeps, its judgment basis, its verify shape, its merge
posture). Maintainers come in kinds — a **code** maintainer, a **docs**
maintainer, and **UI** maintainers — and the spine below is written so every
kind reads alike; where a step differs by kind it says so.

The spine, in order:

1. **Preflight** — `git checkout <trunk> && git pull <remote> <trunk>`
   (`<trunk>`/`<remote>` per `MATERIA.md` § Version control; halt and surface
   if local changes block the pull). Confirm the forge is reachable
   (`MATERIA.md` § Version control § Forge; skipped when the forge is `none`)
   and that the maintainer's verify tooling is runnable — the relevant rows of
   `MATERIA.md` § Gate for a code/docs maintainer, the live app for a UI
   maintainer. Read the standards the sweep judges against, **both live
   queues**, and the recent merge log (for dedup).
2. **Sweep** — scan the maintainer's surface for drift against its standards.
   A finding already covered by a pending queue entry, a recent merge, or a
   sibling maintainer's open sweep PR is dropped naming the overlap.
3. **Classify** each finding into exactly one of:
   - **Bounded fix** — behavior-preserving and small enough to apply and
     verify in this run → fix directly.
   - **Oversized** — too large or too behavioral to fix inline → a **queue
     entry** filed in the same PR (§ Oversized findings, below).
   - **Ambiguous / unverifiable** → a **needs-human note** in the PR body,
     never guessed at.
4. **Branch** — `git checkout -b <skill>/sweep-<YYYY-MM-DD>` (append a short
   hex suffix on a same-day rerun).
5. **Fix** — apply the bounded fixes in small scoped commits
   (`<skill>: <what> (<rule it violated>)`), each carrying the doc updates the
   touch-X→update-Y map (`.materia/docs/contributing.md`) demands; write any
   queue entries (§ Oversized findings) in their own commits. One writer: the
   parent is the sole committer (a large mechanical cluster may be delegated to
   a single implementer subagent, never two writers at once).
6. **Verify** — re-establish that the diff is sound, by the maintainer's kind:
   a **code** maintainer runs the full local gate (`MATERIA.md` § Gate); a
   **docs** maintainer runs the docs gate; a **UI** maintainer re-drives each
   affected surface and captures the result **and** still runs the full local
   gate (re-capture is the primary evidence, not a substitute for the gate). A
   fix that can't be made sound is reverted and demoted to a needs-human note.
7. **Pre-PR review rounds** — before the PR exists, harden the diff with
   fresh-context adversarial reviewer(s) (§ Pre-PR review rounds, below).
8. **One PR** — push the branch and open exactly one PR (open-PR op,
   `MATERIA.md` § Version control § Forge). The body lists every fix (with the
   rule that proved the drift), every skip, every queue entry filed, every
   needs-human note, and the deferred remainder, and closes with the Materia
   sigil naming the casting skill (§ PR attribution — the Materia sigil).
9. **Ride CI to green** — the post-PR resolution loop, **bounded at 3 rounds**:
   resolve conflicts by **merge, never rebase, never force-push**; watch CI;
   fix a diff-caused failure on the branch and re-verify; re-run an unrelated
   failure once, else stop with a comment. This loop is **distinct from the
   pre-PR review rounds** (step 7) — that one hardens the diff before the PR
   exists; this one carries the open PR to green — and the two are separately
   bounded at 3 rounds each.
10. **Merge posture** — per skill: most maintainers stop at a green PR for
    human review (the same terminal shape as a `ship-spec` `finalize`); the
    librarian alone auto-merges behind its mechanical docs-only envelope, and
    forfeits that privilege on any run that trips a forfeit (its § The
    docs-only envelope).

A run with **no fixes and no queue entries** planned exits clean at classify —
print the zero-drift report (including any notes) and end the turn: no branch,
no PR, no review rounds. A run that plans only queue entries (no direct fixes)
still branches and opens a PR to carry them.

#### Pre-PR review rounds

On a non-trivial diff, before the PR is opened, spawn
fresh-context adversarial reviewer(s) at the skill's `<skill>: reviewer`
routing row (`MATERIA.md` § Tiers § Skill routing) on the sweep diff; fold
their findings and re-verify (step 6) between rounds; **bounded at 3 rounds** to
convergence (no material `Blocker`/`Major` left). The gate is the diff's size:
a run with nothing to review skips the rounds entirely (there is no branch or
PR), and a run whose whole diff is one trivially small mechanical cluster may
converge in a single round. A contested fix still unresolved after 3 rounds is
dropped to a needs-human note and the rest proceeds. These rounds are separate
from — and run before — the post-PR ride-to-green loop.

#### Oversized findings — queue entries in the same PR

A finding too large or
too behavioral to fix inline does not vanish into a note: it becomes a **queue
entry committed in the same sweep PR** — a proposed spec under the
`.materia/docs/specs/_proposed/` contract, or a bug report under the
`.materia/docs/bugs/_reports/` contract — carrying `source: <skill>` and
following that queue's frontmatter, filename/folder, and id-minting rules (the
queue READMEs are the one home for those rules; don't restate them). The
maintainer's `source` key is registered in the target queue's producers table
(§ Registration surfaces), exactly as a producer's is — an authoring-time
registration made once when the skill gains the capability, never a per-run
edit by the sweep itself. **Librarian exception
(binding):** the librarian files **proposed specs only** — a normative
code-vs-doc conflict stays a needs-human PR-body note, never a bug report (its
"nothing is the oracle for normative text" rule is unchanged); doc work too
large to fix inline is its one queue-entry path.

The queue-entry write is drawn precisely: a maintainer may create **new files
under `.materia/docs/specs/_proposed/`** and **new report folders under
`.materia/docs/bugs/_reports/`** only. Editing or removing any existing
historical artifact under `.materia/docs/specs/**`, `.materia/docs/bugs/**`,
`.materia/docs/epics/**`, or `.materia/docs/research/**` stays forbidden — the
carve-out authorizes new queue entries and nothing else.

#### UI maintainers — the live-app envelope

A **UI maintainer** (`curator`, `concierge`) sweeps the **running app** rather
than the tree, so it carries machinery the code/docs maintainers do not:
provisioning the Eyes toolchain, driving surfaces, and re-capturing after each
fix. That machinery lives here **once**; both UI maintainers cite this
subsection and add only their judgment basis and skill-specific tables. The
spine above still holds; this subsection refines the kind-specific steps and is
the one home for all shared UI-maintainer mechanics.

- **UI self-gate — first action, before any liveness probe.** Read
  `MATERIA.md` § Surface gates § UI-affecting. If it is `none` — a repo with no
  user-facing surface (`MATERIA.md` § Eyes is `none` too) — print one line and
  end cleanly, writing nothing and starting nothing. This runs **before** the
  liveness probe so a no-UI repo never autostarts a dev stack. (A UI maintainer
  is operator-invoked, so this gate is its outermost guard — nothing upstream
  has filtered by UI.)
- **Liveness probe + autostart (interactive or `--yes` runs only).** Probe the
  dev URL (`MATERIA.md` § Run it) for liveness. If it is already up, continue.
  Autostart is an operator-visible machine-state change, so a non-interactive
  run (Auto Mode / scheduled, no `--yes`) with a down app takes the clean
  remediation exit instead. On an interactive (or `--yes`) run, **record every
  service and process the run starts** (for teardown), bring the app up via the
  first path that applies — the § Run it recipe (preferred), else the § Eyes
  provisioning recipe plus § Environment preflight — and re-probe on a bounded
  wait (~120s). If neither path makes it reachable, first tear down anything the
  attempt started, then print the § Run it remediation step and exit cleanly
  without writing anything.
- **Eyes provisioning is always step 1 of provisioning** (`MATERIA.md` § Eyes)
  — never skipped even when the environment looks provisioned (the recipe is
  idempotent). **Export the service env block the recipe names in the same
  command as the drive** (shell state does not persist between tool calls), and
  **authenticate** with the dev credentials (`MATERIA.md` § Run it) to reach
  authenticated surfaces (skip when the app has no auth).
- **Canonical-viewport drive + capture.** Visit every surface in
  `.materia/docs/surface-map.md` (§ Pages for a web app; § Commands for a
  CLI/TUI) **in map order**, at the canonical viewport (`MATERIA.md` § Eyes).
  Per surface take a **capture and a structural snapshot** in the formats
  § Eyes defines (a browser toolchain writes a PNG capture + an HTML snapshot).
  A surface that errors, fails to render, or fails to capture is **noted and
  skipped** — record it and continue to the next; the drive never aborts.
- **The presentation-layer edit envelope (binding).** A UI maintainer's fixes
  touch the **presentation layer only** — markup structure, styles, design
  tokens, component usage and **presentational** props (a prop that gates
  behavior or data flow is out of envelope), and static display copy. It
  **never** edits logic, data derivation, event handlers, schema, or wire
  shapes. Anything a fix would need beyond that boundary is **oversized** (a
  queue entry, § Oversized findings) or a needs-human note — the same "note,
  don't fix" line the other maintainers draw, drawn here at the presentation
  boundary.
- **Sibling routing — a drop is a note, never a discard.** When a finding
  belongs to the sibling UI maintainer's territory, "drop" means a
  **named-overlap note in the PR body** — never a silent discard. And the
  routing carries an observability exception: a finding owned by the sibling
  but observable **only in this skill's own drive** (a token or spacing defect
  that manifests only in an error/disabled state or mid-flow, which a
  default-render drive never renders) is **not** dropped — the skill that saw
  it surfaces it itself, as a needs-human note or a queue entry naming the
  owner, because the owner's sweep will never observe it.
- **Re-capture verification (binding — the UI verify step).** This is the
  heart of the spine's step-6 verify for a UI maintainer — run alongside the
  full local gate (`MATERIA.md` § Gate), which still must pass — and it is
  **primary over the diff-review rounds**. After each fix, **re-drive the
  affected surface and capture it again**; the before/after capture pairs ride
  the PR — committed under the sweep branch in the run's capture folder,
  `.materia/captures/<skill>-sweep-<YYYY-MM-DD>/` (a committed run output
  outside the docs trees, linked from the PR body; the operator may delete it
  once the PR is decided) — so the human gate judges **observed output**, not
  the diff alone. A fix whose re-capture does not show the intended change (or
  shows a regression) is reverted and demoted to a needs-human note.
- **Instability degrade.** If provisioning fails or the § Eyes drive exits with
  a signature `MATERIA.md` § Eyes names as known environment instability (not a
  product bug), print a short note, tear down anything the run started, and stop
  clean — **never crash the operator's session.**
- **Teardown what the run started** (its own command, never chained with
  follow-up work). Stop exactly the processes/services the run recorded at
  autostart/provisioning (the backgrounded dev server, containers this run
  launched) and nothing that pre-existed.

### PR attribution — the Materia sigil

Every PR any Materia skill opens closes its body with the **sigil** — the
harness's attribution footer. It is always the last element of the PR body,
after a horizontal rule, with the casting skill's name substituted:

```markdown
---

🔮 Forged with [Materia](https://github.com/stoodder/materia) · cast by `<skill>` · *every run feeds the backlog*
```

- `<skill>` = the bare name of the skill that opened the PR (`finalize` names
  the orchestrator that drove it instead — `ship-spec` or
  `fix-bug` — since finalize ships on their behalf).
- One sigil per PR, always last — CI-fix pushes, remediation rounds, and PR
  body edits never duplicate or reposition it.
- The sigil is attribution, not content: skills never cite it, and reviewers
  can ignore it. Keep the line's shape stable so it stays greppable
  (`Forged with [Materia]`).
- The "feeds the backlog" clause is literal: each run leaves a `retro.md`, and
  `triage-retros` triages the batch into proposed specs and bug reports that it
  authors directly into `.materia/docs/specs/_proposed/` and `.materia/docs/bugs/_reports/`
  (`source: retro-triage`), reaching the project's backlog in one PR.

### Registration surfaces — update in the same change

When a skill is **added, renamed, retired, or has its role/model/inputs
changed**, update every surface that applies. This is the harness's
touch-X→update-Y map:

| Surface | Update when… |
|---|---|
| The repo's skill-roster surface — `CLAUDE.md`'s pipeline paragraph and, when the repo keeps one, a README flow graph/tables | any skill is added / renamed / retired, or its model or role changes |
| [`CLAUDE.md`](../../../CLAUDE.md) — the spec-to-ship pipeline paragraph | the pipeline's shape or the producer count changes |
| [`.materia/docs/specs/README.md`](../specs/README.md) — pipeline / closing-loop / producers tables | a stage, sibling, or producer skill changes |
| The **target queue's** producers table + `source` key (e.g. [`.materia/docs/specs/_proposed/README.md`](../specs/_proposed/README.md) for spec proposals, [`.materia/docs/bugs/_reports/README.md`](../bugs/_reports/README.md) for bug reports); the epic family additionally keeps [`.materia/docs/epics/README.md`](../epics/README.md) true | a **producer** skill is added or its source key changes, **or** a **maintainer** begins filing oversized findings into a queue (§ Maintainer lifecycle) — it registers its `source` key here too |
| The skill's row in `MATERIA.md` § Skill routing (and § Model set when the model catalog changes) | a sub-skill's model/effort changes |
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
ordering) lives in `ship-spec/SKILL.md` § Retrospective capture.
This section states the invariant; that file carries the implementation detail.

## Where it lives

- `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` — every pipeline skill
  (installed by the `materia` plugin; cache-resident, not part of this repo).
  A project-owned skill of your own lives at `.claude/skills/<name>/SKILL.md`
  instead.
- `MATERIA.md` § Tiers — the single source of truth for `<model>/<effort>`:
  its § Model set catalog (the models this repo can spawn) and
  its § Skill routing table (the per-skill / per-role assignment).
- The registration surfaces listed above — how skills are advertised.

## Related

- [../specs/README.md](../specs/README.md) — the spec-to-ship pipeline overview.
- [../specs/_proposed/README.md](../specs/_proposed/README.md) — the shared
  proposed-specs queue contract (the producer/consumer interface).
- [../contributing.md](../contributing.md) — Definition of Done + the code-side
  touch-X→update-Y map this mirrors.
- [architecture.md](architecture.md) — the one-folder/one-export ethos skills follow.
