# MATERIA.md — the stack adaptation surface

<!-- init: this file is written once by /materia:init from the survey answers and
     maintained thereafter like any other doc (librarian sweeps it; docs-sync
     updates it when the stack changes). Replace every {{slot}} and delete
     these comments. Every section heading below is a stable anchor that the
     pipeline skills reference by name — NEVER rename a section without
     updating every skill that cites it (grep for "MATERIA.md §"). -->

The companion document to `CLAUDE.md`. Everything **stack-specific** the
pipeline needs lives here, in named sections; the pipeline skills (installed
globally with the `materia` plugin) are stack-agnostic and reference this file
by section (e.g. `MATERIA.md § Gate`). One home per fact: skills never restate
what a section owns.

**The `none` convention.** A section marked `none` means this repo has no
such capability. A skill or pipeline stage whose procedure depends on a
`none` section is inapplicable here: the skill **self-gates** at runtime (it
prints one line and ends cleanly) or the orchestrator **skips and records** the
stage — never blocks. Skills install globally with the `materia` plugin, so an
inapplicable one is present-but-inert, not absent.

## Identity

- **App:** {{app name}}
- **What it is:** {{one sentence — what this delivers and for whom}}

## Stack

{{language(s) · framework(s) · package manager · database/ORM · styling ·
test runners · deploy target — one line each, the way an engineer would say
it. Depth belongs in docs/standards/*, not here.}}

## Run it

```bash
{{the one command (or short recipe) that brings the app up locally for
development, with the URL/port and any credentials a driver needs}}
```

## Gate

The named checks every skill refers to. Skills use the **canonical names**
in the left column; this table maps each to this repo's real command. A
check this repo doesn't have is marked `none` (skills skip it and record
the skip).

| Canonical name | Command | Notes |
|---|---|---|
| `lint` | {{e.g. pnpm lint}} | {{auto-fix variant if any}} |
| `typecheck` | {{command or none}} | |
| `test` | {{unit/integration suite command}} | |
| `test:e2e` | {{browser/e2e suite command, or none}} | |
| `check:docs` | {{e.g. sh .materia/scripts/check-docs.sh}} | ships with materia; portable |

**The full gate** (what `finalize` and CI run): every non-`none` row above,
in table order, all green.

**Bootstrap grace.** Until the bootstrap epic's gate spec merges, the
commands above are *intended*, not yet real. While the marker line below is
present, any skill running a gate treats a row whose command does not exist
as **skip + record** (`gate-grace: <row> skipped (bootstrap grace)`), never a
Blocker — except `check:docs`, which ships with the harness and is always
binding. The spec that creates the gates carries "every § Gate row real and
green" as acceptance criteria and **deletes the marker line in the same PR**;
after that, a missing command is a failure like any other.

{{Bootstrap grace: active until <S1 proposal id> merges. — /materia:init
writes this line; the gate spec removes it. Delete the whole Bootstrap-grace
paragraph AND this line once the gates are real, or immediately if the gate
commands already exist at init time.}}

## Environment preflight

The cold-start recipes a fresh session runs before dispatching any
code-touching work, so subagents inherit a green baseline instead of each
rediscovering the gaps. Single source for every environment recipe.

{{runtime version + how to select it · dependency install · codegen steps
(ORM client generation etc.) · database provisioning/reset · browser/driver
provisioning · known cold-start failure signatures and their one-line fixes.
Delete this section's body and write `none` if a bare checkout is already
runnable.}}

## Surface gates

File patterns that classify a diff, evaluated with
`git diff <baseline>...HEAD --name-only` (`<baseline>` is defined in
§ Version control). These drive which pipeline stages and review angles run.

### UI-affecting

A diff is **UI-affecting** when any changed path matches:

{{pattern list, e.g. `*.vue` · `pages/**` · `components/**` · asset dirs ·
styling config — or `none` for a repo with no user-facing surface}}

### Data-affecting

A diff is **data-affecting** when any changed path matches:

{{pattern list, e.g. schema files · migration dirs · seed files · load/derivation
utilities — or `none` for a repo with no persistence layer}}

## Version control

How skills name the branch, remote, and forge they sync, branch off, diff, and
open PRs against. Skills resolve these from here rather than carrying them
hardcoded. The defaults ship as the values below (an operator overrides them in
place, like § Skill routing) and suit a GitHub repo on `main`/`origin`. Trunk,
remote, and the forge (§ Forge) are three independent knobs — a repo that
differs on one leaves the others alone.

- **Trunk branch** — `main`. The integration branch skills sync, branch off, and
  diff against. (A repo on `master`/`develop` sets it here.)
- **Remote** — `origin`. The git remote skills fetch, push, and name in the
  baseline. (A fork workflow on `upstream` sets it here.)
- **Baseline** — `<baseline>` **is** the ref `<remote>/<trunk>` (default
  `origin/main`): the review/diff base skills diff as `git diff <baseline>...HEAD`.
  Run `git fetch <remote> <trunk>` first so the base isn't stale-local; the
  three-dot diff resolves the merge-base against `HEAD` for you (no separate
  `git merge-base` step needed). This is the defined home for the `<baseline>`
  placeholder used across the pipeline (ship-spec, spawn-contract, § Surface
  gates, spec-adherence.md).

`/materia:init` (bootstrap) operates on the repo's **existing default branch** —
it *writes* this section, so it does not read it (the single exception).

### Forge

The PR/CI operations and the tool that runs them. Default: GitHub's `gh` CLI.
Each `gh` operation carries a **GitHub-MCP twin** — the named GitHub MCP tool a
`gh`-less environment calls in its place (the remote execution environment has
no `gh`): a skill runs the `gh` recipe when `gh` is on PATH, the MCP twin
otherwise. **Automated forge operations support GitHub only** — the `gh` CLI and
its GitHub-MCP twins. On any other forge (GitLab, Bitbucket, Gitea, …) set this
to `none`: the spec-to-ship pipeline still runs end to end, but the PR/CI/merge
operations degrade to the manual `none` convention below.

- **Merge strategy** — `per-skill default`. How every self-merging skill merges
  its PR. Values: `squash` · `merge` · `rebase` · `per-skill default`. Set to a
  **concrete** value (`squash`/`merge`/`rebase`) and it governs *every*
  self-merging skill, **overriding each skill's own default** — so a squash-only
  / linear-history repo names `squash` here once and the whole pipeline complies.
  Left at `per-skill default` — **or the line absent entirely**, as in a
  MATERIA.md installed before this knob existed — each skill keeps its own default
  (ship-spec `merge`, librarian `squash`), so an older companion doc without this
  line keeps working unchanged. This is the home for the `<strategy>` the
  operations table below routes.

`none` = no forge. Per the `none` convention (self-gate / skip-and-record),
PR-opening skills self-gate to **manual** (print the drafted title/body + branch
for the operator) and self-merging skills stop at "pushed — open/merge
manually". Never block.

| Operation | `gh` recipe (default) | GitHub-MCP twin | `none` (manual) |
|---|---|---|---|
| open PR | `gh pr create --title … --body-file …` | `create_pull_request` | print title/body + branch; operator opens |
| PR status / mergeability | `gh pr checks <n>` · `gh pr view <n> --json …` | `pull_request_read` | operator reports CI/mergeability |
| CI logs | `gh run view <id> --log-failed` | `get_job_logs` | operator supplies the failing log |
| re-run CI | `gh run rerun <id> --failed` | *(no exact twin — degrade)* | operator re-runs |
| merge PR | `gh pr merge <n> --<strategy> --delete-branch` | `merge_pull_request` | operator merges after review |
| merge PR (auto, branch protection) | `gh pr merge <n> --auto --<strategy>` | `enable_pr_auto_merge` | operator enables auto-merge |
| post PR comment | `gh pr comment <n> --body …` | `add_issue_comment` | operator posts the note |

- **re-run CI has no exact MCP twin.** `actions_run_trigger` dispatches a *new*
  workflow, not a re-run of the failed jobs — so in a `gh`-less environment the
  one-shot rerun **degrades**: skip it and surface to the operator, never assert
  parity.
- **auto-merge is a distinct operation**, twin `enable_pr_auto_merge` (not
  `merge_pull_request`).

## Eyes

How an agent **sees** the running app to design against, review, and verify
UI work — the toolchain behind `design`, `ui-test-plan`, `ui-review`,
`ui-inspection`, and behavioral verification. `none` if § Surface gates
§ UI-affecting is `none`.

- **Toolchain:** {{e.g. Playwright (Chromium) · a TUI snapshot harness ·
  screenshot tooling}}
- **Provisioning:** {{the idempotent script/recipe that installs the driver
  and stands up the app + fixtures for a run}}
- **Viewport / surface:** {{the canonical viewport or terminal size all
  captures use, e.g. Pixel-5 390×844}}
- **Capture:** {{how to take a screenshot/snapshot and where proofs land —
  keep the `docs/specs/<dated-slug>/ui-proof/` convention}}

## Design tool

The external design tool the pipeline authors designs on, over MCP — and the
capability contract that decides what the design-related stages can do here.
Skills gate on the **capability list below, never on tool identity**, and
reference this section by name. Distinct from § Eyes: § Eyes is how an agent
sees the *running app*; this section is where the *design itself* is authored
and read. `none` means no external design tool is connected — a first-class
value per the `none` convention, independent of § Surface gates § UI-affecting
(a UI repo may author designs repo-side). A MATERIA.md predating this section
reads as `none` — skills that consume this section treat absence and `none` as
the same value.

- **Tool:** {{`claude-design` (recommended adapter) · `figma` · `penpot` ·
  `paper` · `figma-context` · another adapter — or `none`}}
- **MCP setup:** {{the connect command plus any one-time grant, e.g.
  `claude mcp add --scope user --transport http claude-design
  https://api.anthropic.com/v1/design/mcp`, then `/design consent` once — or
  `none`}}
- **Capabilities:** {{the subset of `author · read · export · tokens ·
  reference` this adapter has (meanings below; write `export: via-read` when
  snapshots are reconstructed from reads) — or `none`}}
- **Reachable from:** {{where this adapter's MCP surface is callable —
  record what you verified for this repo's client and config, not an
  assumption. Example (claude-design, user-scope HTTP server, verified
  2026-07-09): tools load at session start, so a session configured — and
  consent granted — before launch has them in the operator lane, inside
  spawned subagents, and in headless child sessions alike, while a session
  started before setup sees nothing. Other scopes, transports, or clients
  may differ — verify, don't assume. Note any local-endpoint constraint
  (e.g. `paper` needs its desktop app running) — or `none`.}}
- **Design project(s):** {{the durable reference(s) to this repo's design
  project — project id / file key / URL, durable per the `reference` meaning
  below — or `-` until the first run mints one}}
- **Design gate:** {{on | off — default on}} — the human review gate after the
  design stage (normative home: ship-spec/SKILL.md § Design gate). Precedence:
  invocation flag (`--approve-design`) > proposal frontmatter (`design_gate:`)
  > this default. `--auto` is not a knob in this chain — it is autopilot
  posture; the gate auto-approves with a recorded stamp regardless of this
  setting. § Design tool `none` does not turn the gate off by itself — a repo
  can review `design.md` as text; the gate-off knob is this chain, not the
  adapter.
- **Authoring budget:** price this before you configure an adapter. Canvas
  authoring is the token-expensive step of the pipeline — one reported Claude
  Design session consumed more than half a weekly Pro allotment. With the
  design gate's revision bound, a single spec authors on the canvas up to **4
  times total**: the initial authoring plus up to 3 revision rounds. Rounds are
  counted by `approval.rounds` across **all** channels — the revise verb, an
  operator hand-edit, a detected direct canvas edit, an architecture-requested
  revision — of which at most 2 may be architecture-requested (their own ≤2
  bound). Those bounces count *inside* the 3, not on top of it. The normative
  counting mechanics live in ship-spec/SKILL.md § Design gate; this is the cost
  posture you budget against, not a restatement.

**Capability meanings** — the contract skills gate on:

- `author` — the pipeline can create and modify designs on the tool's canvas
  over MCP. What makes canvas-side authoring — the primary lane — possible.
- `read` — the pipeline can read canvas state back richly enough to re-derive
  the descriptive design doc after a human edited the canvas directly. What
  makes direct-on-canvas edits a syncable feedback channel.
- `export` — the tool can emit the canvas as static HTML/CSS/assets to a
  filesystem path; what makes a committed snapshot possible. A tool that
  cannot export but can `read` is marked `export: via-read` — the snapshot is
  reconstructed from reads, at the cost the adapter note records.
- `tokens` — the tool returns the project's design system in machine-readable
  form (CSS custom properties or equivalent).
- `reference` — the tool returns a durable pointer (project id, file key,
  node id, URL) to the design it authored. Load-bearing twice under canvas
  authoring: it is the human's review link, and it is recorded as part of
  what was approved. Durable means never a short-lived preview/session
  link — some adapters embed access tokens in preview URLs; record only the
  stable pointer.

**Degradation** — self-gate / skip-and-record, never block (the same way
§ Version control § Forge degrades to manual on `none`):

- No `author` → **repo-side authoring**: the design stage writes `design.md`
  directly; the design gate reviews the tool's `reference` URL when one
  exists, or `design.md` as text; no canvas round-trip. A supported lane, not
  an error — how read-only adapters participate.
- No `read` → direct-on-canvas edits cannot be synced back: the canvas
  feedback channel says so at gate time and routes canvas edits through
  described feedback instead. Not an error.
- No `export`, and no `read` to reconstruct from → the committed pair is
  `design.md` + `reference` only: no snapshot, and the design-conformance
  check degrades per its own ladder.
- No `tokens` → design-conformance falls back to structural assertions only,
  and says so.
- `none` → only the tool-dependent pieces disappear: no canvas authoring, no
  committed snapshot, no deterministic canvas-vs-built diff; design review
  degrades to `design.md` as text. `none` does **not** disable the design
  stage itself (§ Surface gates § UI-affecting owns that gate), the design
  doc's assertions requirement, or the human design gate — those are
  tool-independent and apply to a `none` repo with a UI.

**Canvas-change detection** — the gate-arrival sync asks "did the canvas change
since the last gate commit?"; an adapter's entry records how it answers, in
preference order:

1. a canvas state/version identifier when the tool exposes one — the cheap,
   exact signal (claude-design: per-file etags).
2. otherwise, a canvas read-back plus a canonicalized re-export compared against
   the last committed versions — the adapter note must record whether its export
   is deterministic enough for this comparison to mean anything.
3. neither → record `canvas-change-detection: none`. Its consequence is defined
   normatively in ship-spec/SKILL.md § Design gate: every `read`-capable gate
   arrival that re-presents counts one revision round unconditionally, with the
   terminal stamping arrival (the approval that ends the gate, auto-approvals
   included) carved out.

**Post-approval drift** — once the design gate stamps approval, the committed
pair (`design.md`, plus the committed snapshot when one exists) is the frozen
build contract. Architecture, implementation, and review build from that repo
record, never from the live canvas; sketching on the canvas after approval does
not move the pipeline. Expect someone to keep drawing past the gate — the
pipeline does not follow it there.

<!-- init: known-adapter catalog (verified 2026-07-09; interview source material —
     re-verify cells marked beta at interview time; deleted on materialization
     like every init comment):

| Tool | MCP endpoint / package | author | read | export | tokens | reference |
|---|---|---|---|---|---|---|
| claude-design (recommended) | claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp + one-time /design consent | yes | yes | via-read | yes | yes |
| figma | remote server https://mcp.figma.com/mcp | beta | yes | no | yes (get_variable_defs) | yes |
| penpot | penpot/penpot-mcp (official, self-hostable) | yes | yes | partial (assets; HTML/CSS via generation) | yes (CSS) | yes |
| figma-context | GLips/Figma-Context-MCP (community) | no | yes | assets only | partial | yes |
| paper | paper.design desktop app, local http://127.0.0.1:29979/mcp | yes | yes | via-read | yes | yes |
| none | — | no | no | no | no | no |

- claude-design: author/read verified live 2026-07-09 (create_project → write_files →
  read_file round-trip). Per-file etags change on every write and serve as the canvas
  state/version identifier; if_match catches concurrent canvas edits. No filesystem-export
  tool → export: via-read (read_file pages at 256 KiB/call; render_preview returns a
  short-lived serve_url for browser-tooling screenshots — NEVER persist serve_url, it embeds
  a project-scoped token; the durable open_url is the only link to record). Tokens via
  design systems (list_design_systems, get_claude_design_prompt, /design-sync).
- figma: write-to-canvas (use_figma) is beta — free today, stated to become usage-based
  paid; write tools require Full/Dev seats on paid plans. No canvas→HTML export.
- penpot: the official MCP supports creation and modification of design elements (not
  read-only); token values come back as CSS.
- figma-context: two tools (get_figma_data, download_figma_images) — read plus
  image-asset download only.
- paper: code-native canvas (real HTML/CSS); needs the desktop app running locally;
  free tier ~100 MCP calls/week.
-->

## Data layer

What the data-safety review angle checks beyond the generic rubric
(destructive migrations, seed idempotency, unique indexes behind upserts,
type casts at the storage boundary). `none` if § Surface gates
§ Data-affecting is `none`.

{{repo-specific data invariants worth a reviewer's attention — e.g. "re-seeding
must preserve user-entered values", "all writes go through the ORM, never raw
SQL", transaction rules}}

## Tiers

The single source of truth for model/effort routing. **Skills no longer carry
their own tier** — a spawned unit's assignment is resolved here, from one of
two tables:

- **§ Model set** — the catalog of models this repo can spawn, with their
  *preferred usage*. Dynamic assigners (the per-task
  `Model/effort` field `plan-tasks` writes into `tasks.md`, the
  per-question research tiers `propose-epic` picks) choose from this
  menu per unit.
- **§ Skill routing** — the per-unit assignment. Each spawned sub-skill or
  internal sub-agent role resolves to a row (`Model`, `Effort`, `Fallback
  Model`), or to the **Default** row when it has none. Coverage is by role, not
  by skill dir: a `<skill>: <role>` row covers that role, not its parent, and a
  skill that only runs in the operator session is rowless **by design** (listed
  as such in § Skill routing). Review angles are the exception — they carry
  their tier in the § Review angles registry, not here.
  Two further dynamic assigners are also exceptions to a fixed row:
  `propose-epic: research` has a row marked as picking from § Model set rather
  than a fixed pair, and the per-task spawns `plan-tasks` emits carry their
  tier in a `tasks.md` field rather than a row (see § Skill routing).

**A documented exception to central routing:** every review angle — canonical
and repo-specific alike — carries its `Tier` in the § Review angles registry,
not § Skill routing. The canonical set ships pre-filled there and repo-specific
angles are appended, so the whole set lives beside its file library in one
registry.

One representation everywhere: the token pair **`<model>/<effort>`**
(e.g. `sonnet/medium`), where `<model>` is a § Model set name and `<effort>` a
§ Effort set level.

### Model set

The models available for spawn routing in this repo and what each is for. This
is the menu a dynamic assigner picks from — every model listed here is
available.

| Model | Preferred usage |
|---|---|
| `haiku` | cheap / mechanical units — markdown-only, bookkeeping, single-doc edits |
| `sonnet` | standard vertical slices, systematic synthesis, most implementation and review |
| `opus` | gnarly / cross-cutting / high-risk units; the default fallback model |
| `fable` | the highest-judgement units — architecture, interactive intake, qualitative visual review; billed per-token. Listed but assigned nowhere by default; an operator opts in by assigning it in § Skill routing (or a `tasks.md` field). |

- A model **not in this table at all** coerces to the unit's Fallback Model
  (see § Coercion) — the § Skill routing table names canonical models this repo
  may not carry; that is expected, not an error.

### Skill routing

The model/effort assignment for the units the pipeline spawns. This table
**ships verbatim** (it is not stack-specific — only § Model set is).
Resolution reads the unit's row; a spawned unit with no row uses the
**Default** row — **except** a review angle (canonical or repo-specific), which
is not routed here at all (it carries its own `Tier` column in § Review angles;
see the § Tiers intro). One row (`propose-epic: research`) describes a
*dynamic-assigner role*, model `per-question (§ Model set)` rather than a fixed
pair. A second dynamic-assigner role — the per-task spawns `plan-tasks`
emits — has **no row**: each carries its own `Model/effort` field in `tasks.md`,
and the executing `implement-task` runs at that field, not at its own
row. The **Fallback Model** column names what a unit degrades to when its
`Model` is unavailable; the degradation rules (Fallback Model, effort, and the
per-task-field cases) live in § Fallback.

**Coverage, not partition.** A `<skill>: <role>` row accounts for that
**internal role only**, never its parent skill dir. A skill's parent dir is
accounted for by **either** a plain § Skill routing row **or** an entry in the
**Operator-session skills (rowless by design)** list below — never both. So the
four orchestrator parents that also spawn a routed role (`janitor`, `ship-spec`,
`propose-epic`, `triage-retros`) appear in **both** forms — a role row for the
spawned unit and the operator-session list for the parent — which is coverage,
not duplication. `reconcile-epic` is not in that list: its own plain row (whose
Notes cell records the standalone operator-session mode) is its accounting.

| Skill / role | Model | Effort | Fallback Model | Notes |
|---|---|---|---|---|
| **Default** (any unlisted spawned unit) | `opus` | `high` | `opus` | the backstop when a unit has no row of its own |
| `intake-spec` | `opus` | `high` | `opus` | interactive intake; resolve spec ambiguities before the autonomous stages run |
| `architecture` | `opus` | `high` | `opus` | highest-stakes planning; grounds the plan in existing resources and reuse |
| `design` | `sonnet` | `high` | `opus` | UX flows + states across every screen surface |
| `plan-tasks` | `sonnet` | `medium` | `opus` | systematic decomposition; per-task tiers it emits are dynamic (§ Model set) |
| `implement-task` | `sonnet` | `medium` | `opus` | standalone backstop — a task's own `Model/effort` in `tasks.md` overrides this row; an *absent or malformed* field takes the **Default** row (`opus/high`), not this one |
| `reproduce-bug` | `sonnet` | `high` | `opus` | find the right test surface; land a genuine RED |
| `bug-analysis` | `opus` | `medium` | `opus` | synthesis of `reproduction.md` + the report into a thin output |
| `docs-sync` | `sonnet` | `medium` | `opus` | systematic doc↔intent synthesis, bounded scope |
| `docs-audit` | `sonnet` | `medium` | `opus` | five well-defined properties over bounded inputs |
| `finalize` | `sonnet` | `high` | `opus` | orchestrates gate + PR; a clean handoff |
| `reconcile-epic` | `sonnet` | `high` | `opus` | **pipeline mode only** — standalone mode runs in the operator session (no spawn); cascade edits feed a future `ship-spec` run, so reason carefully |
| `ui-test-plan` | `sonnet` | `medium` | `opus` | enumerate flows worth guarding from a resolved design |
| `ui-review` | `opus` | `high` | `opus` | qualitative cross-screen cohesion judgement; UI-gated. Governs standalone invocation of the skill; the ship-spec ui-angle spawn resolves via the **`ui` row in § Review angles** instead — the validator pins this row's model/effort equal to that registry Tier, so keep them in sync |
| `ship-spec: review/tiebreaker` | `opus` | `high` | `opus` | resolves conflicting review recommendations |
| `triage-retros: sub-agent` | `sonnet` | `low` | `opus` | mechanical parse + quote of one retro into an insight envelope; the clustering/drafting reasoning stays in the parent |
| `janitor: scan` | `sonnet` | `low` | `opus` | read-only standards-drift scan fan-out; findings-only, mechanical pattern-match (mirrors `triage-retros: sub-agent`) |
| `janitor: implementer` | `sonnet` | `medium` | `opus` | optional single subagent for a large mechanical cluster; the parent stays sole committer (mirrors `implement-task`) |
| `propose-epic: research` | per-question (§ Model set) | per-question | `opus` | one subagent per question; model+effort picked together per § Model set (default / ceiling defined in the skill body) |

#### Operator-session skills (rowless by design)

These skills run in the operator's own session and are never spawned as a
sub-unit, so they carry no § Skill routing row; each is listed here so a rowless
parent reads as intentional, not missing:

- `init` — runs in the operator's session (materializes the harness); never spawned, so no row.
- `propose-spec` — operator-session producer; drafts a proposed-spec, no spawn.
- `report-bug` — operator-session producer; drafts a bug report, no spawn.
- `librarian` — operator-session docs maintainer; sweeps and fixes docs in place, no spawn.
- `ui-inspection` — operator-session; inspects the running app and files one report, no spawn.
- `doctor` — operator-session; non-destructive health check that runs the deterministic inspector and reports, no spawn.
- `migrate` — operator-session; plan-first project upgrade that runs the deterministic engine (plans by default, applies only safe migrations on `--apply`), no spawn.
- `ship-spec` — orchestrator parent; runs in the operator session and spawns its stages (each stage has its own row); the parent itself has no row.
- `fix-bug` — orchestrator parent; same rationale as `ship-spec`.
- `propose-epic` — orchestrator parent; its research fan-out has the `propose-epic: research` row, but the parent itself is rowless.
- `janitor` — orchestrator parent; its scan/implementer roles now have rows (`janitor: scan`, `janitor: implementer`), but the parent itself is rowless.
- `triage-retros` — orchestrator parent; its `triage-retros: sub-agent` role has a row, but the parent itself is rowless.

### Fallback

The single home for how a unit degrades when its assigned model can't be spawned.

When a unit's **model** is unavailable — out-of-table or
`Agent`-rejected — it degrades to the **Fallback Model** named in
its § Skill routing row (a unit with no row, and a § Review angle, use the
**Default** row's **`opus`**), run at the unit's **own effort** (effort
describes the work, not the model).

**Absent or malformed tier values.** A per-task `Model/effort` field in
`tasks.md`, or a § Review angle `Tier` cell, that is absent or
malformed in *either* token takes the **Default** row (`opus/high`) — **not**
the `implement-task` row. A malformed value is treated exactly like an
absent one, so a botched value never runs at lower effort than an omitted one.

**The anchor is protected.** The Default row's Fallback Model MUST stay a
model listed in § Model set — do not remove its § Model set row. If a unit's
Fallback Model is somehow itself unavailable, the run does
**not** loop: spawn at the harness default model and record `tier-fallback:
<unit> … → harness-default (fallback anchor unavailable)`. The fallback never
blocks a run.

### Effort set

`low · medium · high · xhigh` — advisory-only; never an `Agent` parameter.
The matching guidance sentence is injected into the spawn prompt verbatim:

| effort | Guidance sentence injected into the spawn prompt |
|---|---|
| `low` | "Run this at low reasoning effort — it's mechanical; don't over-deliberate." |
| `medium` | "Run this at medium reasoning effort." |
| `high` | "Run this at high reasoning effort — reason carefully before acting." |
| `xhigh` | "Run this at maximum reasoning effort — this is the highest-stakes unit; be exhaustive." |

### Coercion

When a unit's assigned model is **unavailable** — out-of-table or
`Agent`-rejected — coerce to the unit's **Fallback Model** (its
§ Skill routing row, or the Default row) and record a one-line note:

```
tier-fallback: <unit> … → <fallback> (<reason>)
```

An **absent or malformed** tier *value* (a per-task `Model/effort` field, or a
§ Review angle `Tier` cell) is not a coercion — it takes the
**Default** row (`opus/high`) directly, per § Fallback.

Coercion **terminates**: it applies once to reach the Fallback Model, and if
even that model is unavailable it falls to the harness default per § Fallback —
it never re-coerces in a loop. Never block the run for a bad tier value.

## Review angles

The single registry of every review angle the `ship-spec` § Review fan-out
runs. Each angle's **definition** — what it checks and how to run it — lives in
its file at `.materia/review-angles/<File>` (materialized by /materia:init; see
that directory's `README.md` for the file schema and how to add an angle). This
table owns the File → Gate → Tier mapping; the angle file itself carries only
`name`, `description`, and body.

The six canonical rows ship **pre-filled** and are **not** stack-specific —
they ship verbatim, like § Skill routing. Repo-specific angles (a11y, perf
budgets, compliance) are appended as additional rows by /materia:init or the
operator; by default there are none beyond the canonical six.

**Gate** is when the angle runs: `always` (every run, subject to ship-spec's
markdown-only exemption and trivial-diff collapse), `ui-affecting`,
`data-affecting`, or a repo-specific predicate phrase. `ui-affecting` and
`data-affecting` are evaluated exactly as ship-spec's UI/Data-surface gates —
over the cumulative diff, per `MATERIA.md § Surface gates`.

**Tier** is a `<model>/<effort>` pair resolved like any other (model drawn from
§ Model set; § Effort set for the guidance sentence). These angles carry no
`Fallback Model` of their own — a `Tier` that coerces falls to the § Skill
routing **Default** row (`opus`), per § Coercion.

| Angle | File | Gate | Tier |
|---|---|---|---|
| `correctness` | `correctness.md` | `always` | `opus/high` |
| `security` | `security.md` | `always` | `sonnet/high` |
| `spec-adherence` | `spec-adherence.md` | `always` | `sonnet/medium` |
| `behavior` | `behavior.md` | `always` | `sonnet/medium` |
| `ui` | `ui.md` | `ui-affecting` | `opus/high` |
| `data-safety` | `data-safety.md` | `data-affecting` | `sonnet/high` |

Repo-specific angles go in additional rows below the canonical six.

The `spec-adherence` angle drops to `haiku/low` on ship-spec's markdown-only
exemption path (binding rule stated in `ship-spec` § Review).

## Adapting to your repo

Most stack specifics are captured by the slots above. Three portability
assumptions the pipeline depends on are recorded here so a repo that breaks one
adapts deliberately, not by surprise — the first has a config home in
§ Version control; the other two are properties of the harness with no slot:

- **Default branch, remote & forge.** The trunk branch, the remote, the baseline
  diff, and the forge/PR flow — PR-opening, CI, and merge — resolve from
  § Version control (and § Version control § Forge). A repo that differs on any of
  these edits that section, **not** the skills. (The merge *strategy* resolves
  from the § Forge **Merge strategy** knob when it names a concrete value;
  left at `per-skill default` or absent, each skill falls back to its own default
  — librarian `squash`, ship-spec `merge`.)
- **`check:docs` needs POSIX `sh`+`awk`.** The one unconditionally-binding gate
  (§ Gate) ships as `sh .materia/scripts/check-docs.sh`. It travels with the harness and
  needs only a **POSIX shell and `awk`** — present on essentially any Unix
  (Linux, macOS, BSD) and in Alpine/distroless images (busybox), with nothing to
  install, so a Rust/Go/Python project needs no extra runtime; native Windows
  runs it via WSL or Git Bash. The docs contract it enforces is runtime-agnostic;
  only the implementation is POSIX sh+awk.
- **One MATERIA.md = one adaptation surface.** § Gate, § Run it, and the baseline
  in § Surface gates describe a **single package** over the whole tree. The
  supported way to serve a polyglot monorepo is **one MATERIA.md at the repo
  root** whose § Gate commands are **umbrella scripts that dispatch across
  packages** — the pipeline stays whole-tree and every package's gate still runs.
  Per-package MATERIA.md files do **not** scope classification: § Surface gates,
  the review angles, and finalize all evaluate the **whole-tree** diff, and
  `.materia/project.json` plus the trunk/PR flow are **repo-global** — so a
  MATERIA.md dropped in a package subdir cannot narrow what a run classifies or
  diffs. A per-package § Surface gates pathspec that would scope classification is
  **future work, not a present capability**.
