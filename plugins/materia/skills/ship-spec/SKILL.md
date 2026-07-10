---
name: ship-spec
description: "Run the full spec-to-PR pipeline for a new product spec or feature request — intake → design → architecture → task breakdown → autonomous implementation → post-implementation multi-angle review → lint/typecheck/test gate → docs → pull request. Supports `--auto` (autopilot): operator checkpoints accept grounded defaults, and after the PR opens the orchestrator watches CI, fixes failures, resolves merge conflicts, and merges once green. Captures a per-run retrospective (`retro.md`) at each touchpoint so a downstream skill can aggregate them into pipeline improvements. Resumable across sessions. Interactive design-bearing runs pause at the human design gate (`--approve-design` or `--auto` skips it). Use when the user hands over a product spec or feature to build end-to-end."
---

# ship-spec — the spec-to-ship orchestrator

Drives a feature from a raw spec to an open PR by running each stage **as its own
subagent** (clean, scoped context), persisting an artifact per stage so the run
is **resumable across sessions**. Mostly autonomous: clarifying questions happen
once during intake; an interactive, design-bearing (UI) run also pauses at the
human design gate after the design stage (§ Design gate) — `--auto`
(autopilot) and `--approve-design` runs don't pause there — then it runs to a
finished PR for human review.

Read `docs/specs/README.md` and `docs/README.md` first. Shared resources this
skill leans on (read at the phase that needs them):

- `MATERIA.md` § Tiers — the tier vocabulary, model availability, fallback,
  and effort→guidance-sentence map.
- [`resources/spawn-contract.md`](resources/spawn-contract.md) — the verbatim
  standing rules injected into every spawn prompt (per spawn kind).
- [`resources/env-preflight.md`](resources/env-preflight.md) — the cold-start
  *procedure*; the repo-specific recipes live in `MATERIA.md` § Environment
  preflight.

## Each stage runs as a subagent

Spawn every stage with the Agent tool — pass it **only its inputs** (the prior
artifacts + the stage skill), not the whole conversation, plus the standing
rules from `resources/spawn-contract.md` (Block 1 always; Block 2 for
stages/tasks; Block 3 for reviewers). Each stage skill declares its own
**Inputs / Outputs**. After a stage subagent returns, verify it wrote its
artifact and committed; if not, fix before continuing. Independent
implementation tasks may run as **parallel worktree-isolated subagents**
(`isolation: "worktree"`). Worktree spawns must carry the **run-branch tip**:
before dispatching each worktree-isolated task, ensure the worktree is at the
run branch's HEAD (merge the run branch into the worktree, or cut the worktree
from HEAD) — a worktree provisioned at the merge-base is missing
`spec.md`/`design.md`/`architecture.md`/`tasks.md`, and each implementer then
pays a discovery-and-recovery pass before task work can start.

## Spec folder naming

Every spec lives at `docs/specs/<dated-slug>/`, where `<dated-slug>` is

```
<yyyy-mm-dd-hhmmss>-<rand>-<slug>
```

— the UTC creation timestamp (to the second), a fresh 6-char base36 token,
and a short kebab slug (see
`intake-spec` for the full rule). Example:
`docs/specs/2026-06-13-142530-ab24f9-csv-export/`. Use the full dated form in every
path you write or read; the bare `<slug>` is only the human-readable suffix.

## Resume (run this first, every time)

If the user names a feature (e.g. `csv-export`) or a proposal id (e.g.
`a91c2f`) and a matching in-flight spec folder exists, **resume — do not
restart**.

**Match precedence** (first match wins):

1. **`Proposed-id` match** — if any `docs/specs/*-<slug>/STATUS.md` carries
   `Proposed-id: <id>` matching the user's input (interpreted as an id), and
   `Proposed-spec:` still points at an existing file under
   `docs/specs/_proposed/`, resume that folder. The id match is the canonical
   resume key — it survives slug collisions.
2. **Slug suffix match** — match by the kebab `<slug>` suffix of the spec
   folder (the timestamp+rand prefix can be anything). If multiple folders share a
   suffix, prefer the newest by timestamp prefix.

Then:

1. Read its `STATUS.md`. Find the first unchecked stage (and within implement,
   the first task in `tasks.md` not `[x]`).
2. If `Blocker` is set, surface it to the human and stop until resolved.
   **Sole exception** (scoped by **prefix match** to
   `design-gate revision bound exhausted (rounds=3)` — so the architecture-bounce
   cause appended after that prefix is covered too, while every other Blocker
   stays exact-match): when the Blocker **begins with**
   `design-gate revision bound exhausted (rounds=3)` **and** the operator's
   message carries `approve` or `abandon`, treat the reply as resolving the
   Blocker — clear it and route the verb through step 0's gate check below
   (§ Design gate — revision bound carve-out). A further `revise` does not
   resolve it.

0. **The design-gate check** (§ Design gate) — numbered **step 0** because it
   is evaluated **before** the first-unchecked-stage scan acts (step 3), yet it
   runs **after** the folder match and **after** the `Blocker:` hard-stop
   (step 2) — a set Blocker always wins; step 0 never routes around it except
   via step 2's own scoped exhaustion-Blocker carve-out. It
   fires only when `design.md` **exists**, carries an `approval:` block, **and**
   the run has **not** advanced past the gate (§ Design gate — advanced-past
   predicate). No block = a pre-gate run → skip this step; today's behavior.

   **Canvas detection runs first (read-capable adapters).** Before the
   body-diff/verb classification below acts on any `pending` route, if
   `MATERIA.md § Design tool` records a `read`-capable adapter, run the
   § Gate-arrival sync detection against the committed `canvas:` baseline.
   **Pinned order for the whole arrival:** detection → sync-unit dispatch (if
   the canvas changed) → the body-diff/verb handling below → **at most one**
   `rounds` increment for the whole arrival → commits (sync outputs and the
   increment ride gate-marked commits — no double-commit, no double-count). A
   **detected** canvas change (detection options 1–2) makes the arrival a
   **revision round** — dispatch the sync unit, fold it into the single
   increment, write the one `## Feedback log` entry — **even when the body is
   clean and the message carries no verb**; the normal presentation then
   follows. Under detection option 3 (`canvas-change-detection: none`) there is
   no signal to detect — that mode's unconditional round-count is stated at the
   bare-re-present clause below. An arrival whose **resolution is terminal** —
   the `approve` verb, an armed `--approve-design`, or an autopilot
   auto-approval (§ Gate-arrival sync's universal terminal carve-out) — instead
   follows § Gate-arrival sync's Approval = sync-then-freeze flow: detection
   and any sync still run, but the stamping arrival is **not** a counted round.

   Route on the block:
   - `approved`/`auto-approved` **and** `design_hash` matches the current body
     → clear the waiting state, set `Next:` to the next stage, continue as
     today. (Before advancing past the gate on **any** route: if `Branch:` is
     still the template placeholder, provision the run branch first —
     § Design gate — Standalone-first lane.)
   - `pending`, body **clean** vs the last gate-marked commit, no verb in the
     operator's message → re-present; do **not** increment `rounds` (a
     re-present alone is not a revision round). **Override — detection option 3**
     (`canvas-change-detection: none`, `read`-capable adapter): a re-presenting
     resume counts **one round unconditionally** and dispatches the sync unit as
     any revision round does (§ Gate-arrival sync — detection option 3) — an
     explicit override of the "do not increment" clause just above, scoped to
     `read`-capable/detection-none adapters only; the terminal stamping arrival
     stays carved out.
   - `pending`, body **clean**, verb **present** → resolve the verb per
     § Design gate — the gate is ternary (an explicit verb is acted on, never
     answered with another re-present).
   - `pending`, body **edited** — the verb decides: `approve` → commit the edit
     (path-scoped, gate feedback), then stamp **that** body (an explicit verb is
     never downgraded to "feedback noted, approve again"); no verb or `revise` →
     commit as feedback, **increment `rounds`** (counts against ≤3), re-present
     against the current body.
   - `pending` + `rounds` ≥ 3 + another revision → the exhaustion Blocker
     (§ Design gate — revision bound).
   - `abandoned` → re-present with an explicit note (abandoned on `<date>`); the
     operator may re-open (routes to revise), approve after all, or leave (end
     the turn again). Parked, not locked. **Re-open resets the state first**:
     set the block back to `status: pending`, set
     `Next: design-approval (awaiting operator)`, and append
     `design-gate: re-opened (<date>)` to § Notes (superseding the abandoned
     line) — *then* run the revise steps. Without the reset, the block,
     `Next:`, and § Notes would keep reporting "abandoned" through a live
     revision round, and a mid-round resume would re-offer the abandoned menu
     (and double-count `rounds`).
   - `approved` + hash **MISMATCH** → the approved design is not the design on
     disk; route to **revise** with the diff as implicit feedback (this is why
     `design_hash` exists).
   - Malformed/unknown block (bad `status` value; `approved` with no hash) →
     treat as `pending`, re-present noting the malformation — never fall through
     unrouted.

3. Otherwise continue from there. **Placeholder-branch guard (any route, gate
   or not):** if `Branch:` is still the template placeholder — a
   standalone-produced folder, including one whose gate already auto-approved
   at persist time — provision the run branch off current HEAD and backfill
   `Branch:` first (§ Design gate — Standalone-first lane).
4. If `retro.md` already exists in the folder, **open and append** — never
   restart it. If header `status:` is `blocked`, set it back to `running` once
   the blocker is cleared. See § Retrospective capture.
5. Read `## Autopilot posture` (missing block → `off`) and carry it forward.
   An **explicit `--auto` on the resuming invocation upgrades `off → on`**
   (record the upgrade in § Notes) — it is a deliberate operator action, not
   command-line noise. Absence of the flag never downgrades `on → off`; only
   an explicit operator instruction recorded in § Notes does. See § Autopilot
   (`--auto`).

Fresh feature: run **§ Proposal selection** first — the run's entry point is
the proposed-specs queue at `docs/specs/_proposed/`. Selection chooses one
proposal (or accepts an explicit ad-hoc spec); ship-spec then mints the
dated-slug, creates `STATUS.md` with the proposal's provenance, commits +
pushes, and only then spawns intake with the proposal body. The branch name
uses the bare `<slug>`; the spec folder uses the full `<dated-slug>`.

## Autopilot (`--auto`)

`--auto` is a presence-only invocation argument with leading-dash
normalization and fail-open parsing (near-misses are treated as NOT PRESENT;
posture stays `off` — the normalization rule lives in
`docs/standards/skills.md` § The `--auto` argument). It is the operator's **per-run grant of end-to-end
autonomy**: run the pipeline on grounded defaults, open the PR, ride it to
green, and **merge it** — without pausing at the operator checkpoints.

Not to be confused with **Auto Mode** (intake's `AskUserQuestion`-unavailable
path, which bakes defaults and then *pauses for confirmation*): autopilot is
the operator saying up front "don't wait for me."

- **Posture.** Written once at run start into `STATUS.md` § Autopilot posture
  (`on` / `off`; a missing block or a pre-feature `STATUS.md` → `off`). The
  Resume gate carries it forward (§ Resume step 5): an explicit `--auto` at
  resume upgrades `off → on`; nothing downgrades implicitly.
- **What changes when `on`:**
  - **Proposal selection** — a named `<id>` behaves as usual; a bare autopilot
    invocation auto-picks only when **exactly one** pending unclaimed proposal
    exists (`Proposed-id-selection: autopilot`). With several pending, the
    menu still runs — *what to build* stays an operator decision; autopilot
    only automates *how it ships*.
  - **Intake `partial`** — no operator pause; see § Intake hand-off.
  - **Design gate** — no pause; the orchestrator runs the same gate arrival and
    stamps `status: auto-approved, by: auto, reason: "--auto autopilot run"`
    (hash computed as always), notes
    `design-gate: auto-approved (--auto autopilot run)` in § Notes, and proceeds
    in the same invocation (§ Design gate). Same shape as the intake-`partial`
    exception: no pause, the
    documented default (approval) recorded, audit trail in the artifact.
  - **Every other operator-optional pause** (non-blocking design calls,
    default confirmations) resolves to the documented default, recorded in
    `STATUS.md` § Notes and the retro entry that made the call.
  - **After finalize** — § Merge watch runs, through to the merge.
  - **PR transparency** — instruct finalize (spawn prompt) to append one line
    to the PR body (above the closing Materia sigil, which stays last):
    `> Autopilot run (--auto): operator checkpoints
    auto-accepted; this PR auto-merges once CI is green.`
- **What does NOT change:** Blockers still stop the run. Autopilot never
  overrides a `Blocker`, widens a loop bound (review ≤3, docs ≤2, gate ≤3,
  design-gate ≤3, architecture-bounce ≤2, CI-fix ≤3), skips a gate (e2e-coverage, screenshot-presence,
  epic, UI-surface, data-surface), force-pushes, or **merges under bootstrap
  grace** (§ Merge watch step 6 — graced CI is not green CI). Autopilot also
  **never un-abandons a parked design** — resuming an `abandoned` gate is an
  operator decision even under `--auto`; record the refusal and stop cleanly.
  Autopilot removes **waits**, not safety.

## Proposal selection (the run's entry point)

Every fresh invocation begins here (after the Resume gate has ruled out an
in-flight run). The shared intake surface at
`docs/specs/_proposed/` (`docs/specs/_proposed/README.md`) is the
default source; the freeform-spec path is the **ad-hoc fallback**.

### Inputs to dispatch on

| Input shape | Behavior |
|---|---|
| `/materia:ship-spec` (no args) | Enter the **menu** — list pending proposals and ask the operator to pick. |
| `/materia:ship-spec <id>` matching a frontmatter id under `docs/specs/_proposed/*.md` | Skip the menu, resolve to that proposal, advance. `Proposed-id-selection: named-arg` in STATUS.md. |
| `/materia:ship-spec <slug>` matching a Resume case | Handled by the Resume gate; never reaches selection. |
| `/materia:ship-spec` with a body of raw spec text | **Ad-hoc fallback** — treat the text as today's freeform spec. `Provenance` block filled with `—` so `finalize` skips the dequeue. |

Precedence on ambiguity: an explicit `<id>` arg wins over any trailing text.

### Discovery

`git ls-files 'docs/specs/_proposed/*.md'` — top-level files only
(underscore-prefixed subdirectories are producer bookkeeping), **excluding
`README.md`**. Parse each frontmatter (§ Frontmatter parser) and validate
required fields (`id`, `title`, `source`, `date`, `status: proposed`;
`schema_version` informational; `surfaces` optional/informational —
consulted at stake per § Mint the `<dated-slug>` step 4, never required). **Validate `id` against `^[a-z0-9]{4,8}$`**
— ids are interpolated into branch names, commit messages, and STATUS
fields, so a non-conforming one is dropped like a parse failure, never
"cleaned up". Drop files whose parse failed or whose
`status` isn't `proposed`, with a one-line warning each so the operator sees
why a file was skipped.

**In-flight pickup:** before printing the menu, scan `docs/specs/*-*/STATUS.md`
for `Proposed-id:` lines matching any pending proposal's `id`; mark those
proposals **`(in flight — docs/specs/<dated-slug>/)`** in the menu — picking
one re-enters the Resume gate rather than starting a parallel run. When the
claimed run's `Next:` is `design-abandoned (parked)`, annotate the entry
**`(parked — abandoned design)`** instead of the plain in-flight annotation;
picking it re-enters the design gate (re-open — § Design gate). Deleting the
spec folder is the operator's manual release path.

**Empty queue** (zero pending unclaimed proposals AND no ad-hoc text): exit
cleanly — no branch, no files — telling the operator their options
(`/materia:triage-retros` to mine retros into proposals, `/materia:propose-spec`
or hand-write a proposal per `docs/specs/_proposed/README.md`, or re-invoke with
a freeform spec). End the turn.

### Present the menu

**Autopilot single-proposal pick:** when the run is autopilot (§ Autopilot)
and exactly one pending unclaimed proposal exists, skip the menu and select
it (`Proposed-id-selection: autopilot`). With more than one pending, fall
through to the menu below — choosing *what* to build stays with the operator.

- **AskUserQuestion available AND ≤4 unclaimed proposals:** build options
  `<id> — <title>` / `<source> · <date>`; "Other" lets the operator type an
  id. After the pick, `Proposed-id-selection: manual`.
- **>4 proposals OR AskUserQuestion not in the deferred-tool list (Auto
  Mode):** print the list as text — one entry per proposal
  (`<id>  <title>` + `<source> · <date>`, with the in-flight annotation where
  it applies), closing with "Reply with an `<id>` to run that proposal, or
  paste a freeform spec to use the ad-hoc fallback. (No timeout — the run
  pauses until you reply.)" — then end the turn with the marker sentence:

> Awaiting operator selection at the proposal menu. The next message in this thread will resume the run.

When the paused invocation carried `--approve-design`, append one line to the
marker: the arm did not survive this pause (it is durable only from stake —
§ Design gate — `--approve-design`); re-pass the flag with the selection to
keep the bypass.

The next invocation re-runs the Resume gate (no in-flight folder yet) and
re-enters this section, parsing the reply as an `<id>` or ad-hoc text. Under
Auto Mode, set `Proposed-id-selection: auto-deferred` when the pick lands —
defaults are never baked silently.

### Resolve the selection

Scan all frontmatter blocks under `docs/specs/_proposed/*.md`. **Match by
`id` only, never by filename.** Zero matches → halt with
`Unknown proposal id: <id>` and end the turn. Multiple files sharing an id
(contract violation) → halt with the duplicate paths.

### Frontmatter parser

Produce `{ frontmatter, body }` deterministically: read as UTF-8, strip a
leading BOM, skip leading blank lines; the next line MUST be `---`
(line-anchored) or halt `Frontmatter unreadable: no opening --- delimiter at
<path>`; read to the next line-anchored `---` (EOF without it → halt
`… no closing --- delimiter …`); parse the block as simple `key: value` YAML;
the body is everything after the closer (subsequent `---` lines are body
verbatim — line-anchored matching means a body containing `---` is never
mis-parsed).

### Derive the feature slug

Apply the `## Kebab-slug derivation` algorithm from
`docs/specs/_proposed/README.md` to
`frontmatter.title` — it is **normative**; producers and this consumer must
agree on filenames.

### Mint the `<dated-slug>` and stake the claim

Proposal path only (the ad-hoc fallback defers minting to `intake-spec`, which
fills the `## Provenance` block with `—`):

1. Mint `<dated-slug>` per `intake-spec`'s rule.
2. Create branch `<type>/<slug>` off latest `<trunk>` (the trunk branch per
   `MATERIA.md` § Version control; bare feature slug, `<type>` defaults to
   `feat`).
3. `mkdir docs/specs/<dated-slug>/`.
4. Seed `STATUS.md` from `docs/specs/_templates/status.md`, filling `Slug:`,
   `Branch:`, `Updated:`, and the `## Provenance` block: `Proposed-id:` ←
   `frontmatter.id` · `Proposed-spec:` ← `docs/specs/_proposed/<filename>` ·
   `Proposed-source:` ← `frontmatter.source` · `Proposed-source-refs:` ←
   `frontmatter.source_refs[]` joined by `,` · `Proposed-id-selection:` ←
   `manual | named-arg | auto-deferred` · `Epic-id:` ← `frontmatter.epic`
   when present — validated against `^[a-z0-9]{4,8}$` first, like every
   consumed id (a non-conforming value halts the stake naming the offending
   key) — else `—` (this sets the § Epic gate). Additionally fill
   `## Autopilot posture` at this same moment: `on` if the invocation carried
   `--auto` (post dash-normalization per `docs/standards/skills.md` § The
   `--auto` argument), else `off`.

   **Capture `surfaces:` at stake (the declared path of the § UI-surface
   gate).** When `frontmatter.surfaces` is present, write the `Surfaces:`
   § Notes line now (convention: `docs/specs/_templates/status.md` § Notes).
   The § Frontmatter parser is simple `key: value`, so `surfaces: [ui]`
   arrives as the raw string `[ui]` — interpret the flow-list tokens (`ui`,
   `data`) yourself, and keep the **key-absent** case (no `surfaces:` key →
   "unknown"; write no `Surfaces:` line, or `—`) strictly distinct from the
   literal **`[]`** case (declared "none" → write `Surfaces: []`); never
   collapse one into the other (semantics per `docs/specs/_proposed/README.md`
   § Field roles → `surfaces`). A present value is **authoritative and
   short-circuits before intake**: also record the declared-path decision
   `ui-surface (predictive): <positive|negative> (declared surfaces: […])` —
   positive iff the declared set includes a design-bearing surface (§ Review
   — § UI-surface gate) — so intake is signalled not to ask (§ Spawn intake).
   With no `surfaces:` key, leave the line absent (routing resolution through
   intake). On the ad-hoc path there is no frontmatter, so `Surfaces:`
   defaults to absent (`—`).

   **Capture `design_gate:` at stake (the gate-off knob's frontmatter rung).**
   When the proposal frontmatter declares `design_gate:`, append the pinned
   `design-gate: <on|off> (proposal frontmatter)` line to § Notes now — durable
   through dequeue, like `Surfaces:` (semantics: `docs/specs/_proposed/README.md`
   § Field roles → `design_gate`; consumed at gate arrival per § Design gate).
   Absent key → write no line (fall through the precedence chain).

   **Record the `--approve-design` arm at stake.** When the invocation carried
   `--approve-design` (§ `--approve-design`; contract in
   `docs/standards/skills.md`), append
   `design-gate: auto-approve armed (--approve-design)` to § Notes here — stake
   is the earliest durable moment (a pre-stake proposal-menu pause cannot
   persist the arm).
5. Commit: `ship-spec(intake): claim proposal <id> for spec <dated-slug>`
6. Push.

**Ad-hoc path — a distinct case, not covered by the numbered steps above:**
the ad-hoc fallback defers minting to `intake-spec`, which seeds `STATUS.md`
straight from the template — a template whose `## Autopilot posture` defaults
to `off`. `intake-spec` carries no posture-write logic of its own; the
orchestrator sets `## Autopilot posture` to `on` on its own first post-intake
`STATUS.md` commit when the invocation carried `--auto`.

### Spawn intake

In both paths the **input** to `intake-spec` is the spec body (stripped
proposal body or freeform text). The proposal path additionally signals
`pre-created-folder: docs/specs/<dated-slug>/` so intake writes `spec.md` into
the existing folder and leaves the provenance lines read-only.

Also pass a **`surfaces:` spawn signal** (modeled on `pre-created-folder:`):
the declared value when the proposal frontmatter carried one (e.g.
`surfaces: [ui]`), otherwise `surfaces: absent`. A declared value tells
intake **not** to ask "does this ship UI?" — the resolution is already
settled upstream (§ UI-surface gate, declared path). `absent` (proposal that
omitted the key, or the ad-hoc path) routes intake into its own resolution
(§ Intake hand-off; `intake-spec/SKILL.md` § Procedure step 4).

### Failure semantics — proposal path

- **Session dies after selection, before the stake commit:** nothing on disk;
  the next invocation re-enters selection and the operator re-picks
  (idempotent).
- **Stake landed, intake died before `spec.md`:** the Resume gate's id-match
  finds the folder; resume intake against it.
- **Proposal mutated mid-run:** `spec.md` reflects the snapshot at selection;
  finalize's `git rm` removes whatever the file is then. Mid-run edits don't
  propagate.
- **Proposal manually deleted mid-run:** finalize's staged `git rm` skips
  gracefully; the PR body notes it. The run continues.

## Pipeline

Run in order, each as a subagent; **commit + push after each completes** so a
new session can resume from the remote. After every first-level stage, run the
**retrospective touchpoint** (§ Retrospective capture). Before each spawn,
resolve the tier and pass it as the `model` override (§ Tier routing), and
assemble the spawn prompt from `resources/spawn-contract.md` — its Block 1
carries the standing authoring rule (never write a live `[text](path)` link to
a non-resolving path, even in backticks; use arrow form) that has repeatedly
broken `check:docs` from inside `docs/specs/**`.

The numbered list below uses the **logical-stage scale** (review is stage 7,
finalize is stage 10); `STATUS.md` checkboxes use the **STATUS-checkbox scale**
(review has no checkbox, finalize is row 9) — see
`docs/specs/_templates/status.md` § Stages.
`design` (logical stage 2) and `ui-test-plan` (logical stage 3) are
**UI-gated**: spawned only when the run is UI-affecting (§ Review —
§ UI-surface gate, **predictive form** — one per-run decision covering both
stages, resolved per that section's resolution order); on a non-UI run both
are skipped and the decisions recorded in `STATUS.md`, and `architecture`
works from `spec.md` alone. `reconcile-epic` is **epic-gated**: a
no-checkbox interstitial between docs-audit and finalize, spawned only when
the run's proposal is an epic member (§ Epic gate — reconcile-epic); on a
non-epic run it is skipped and the decision recorded in `STATUS.md`.

1. **intake** (`intake-spec`) → `spec.md`. The only place to ask the human
   clarifying questions. Input per § Proposal selection — a proposal body
   (folder pre-staked) or ad-hoc freeform text (intake mints the folder).
2. **design** (`design`) → `design.md` (**UI-gated** — the design stage is a
   UX artifact; a feature that ships no UI has nothing for it to design, and
   its technical planning belongs to `architecture`).

   On an **interactive** design-bearing run, the **design gate** (§ Design
   gate) pauses the run here — after design commits, before `ui-test-plan` — by
   ending the turn: the third pause-by-ending-turn checkpoint (proposal menu,
   intake `partial`, design gate). Autopilot and gate-off runs do **not** pause
   (they stamp a recorded auto-approval and continue). § Design gate is the
   normative home.
3. **ui-test-plan** (`ui-test-plan`) → `ui-test-plan.md` (**UI-gated**). Reads
   `spec.md` + `design.md`, enumerates the UI flows worth guarding;
   `plan-tasks` consumes it to derive the e2e-authoring task.
4. **architecture** (`architecture`) → `architecture.md` (docs read order;
   reuse existing resources; on a non-UI run it also owns the operator-surface
   enumeration `design` would otherwise carry — see
   `architecture/SKILL.md` § Non-product features).
5. **plan-tasks** (`plan-tasks`) → `tasks.md` (dependency-ordered; each task
   tagged with a docs-scope floor and a `Model/effort` tier).
6. **implement** (`implement-task`, once per task, dependency order;
   independent tasks in parallel). Each task commits its own work and ticks
   `tasks.md`. **No per-task adversarial review** — implementers build to the
   standards and leave the local gate green. Tasks add themselves to
   `behavior-deferred:` when any AC is user-visible.
7. **review** (orchestrator-spawned, post-implementation). After every task in
   `tasks.md` is `[x]`, spawn the multi-angle adversarial review **once** over
   the cumulative branch diff, then loop on findings until clean. See § Review.
8. **docs-sync** (`docs-sync`) → edit pass: touch-X→update-Y matrix,
   intent-oracle rules, cross-cutting doc updates; commits doc edits.
9. **docs-audit** (`docs-audit`) → verify pass; returns HIGH/MEDIUM/LOW or a
   clean verdict. **Orchestrator-managed loop:** on HIGH/MEDIUM findings,
   re-spawn `docs-sync` with findings appended, then re-spawn `docs-audit`;
   **bound ≤2 rounds**; on non-convergence write `Blocker` and stop. *(This is
   the authoritative statement of the loop: `clean` → finalize; `has-findings`
   (round < 2) → re-spawn docs-sync; `non-convergence-blocker` (round 2
   exhausted) → Blocker.)*
10. **finalize** (`finalize`) → behavior re-check, gate, dequeue, PR;
    `check:docs` guaranteed satisfied by the preceding doc loop.

After finalize, an **autopilot run only** continues into § Merge watch
(autopilot) — a no-checkbox orchestrator-lane phase, like `review` and the
epic gate; a non-autopilot run ends at the open PR as always.

After each stage/task: update `STATUS.md` (tick the stage, set `Next`), then
commit + push.

### Epic gate — reconcile-epic (between stages 9 and 10)

When the run's proposal is a member of an epic
(see `docs/epics/README.md`), the epic must be synced — and its remaining
pending members cascaded — **in the same PR that ships this member**, so the
epic record and the queue never drift from what actually merged.

- **Predicate:** `STATUS.md` `## Provenance` carries a non-`—` `Epic-id:`
  (set at stake time from the proposal's `epic:` frontmatter key; ad-hoc runs
  and non-epic proposals are always `—`).
- **When:** evaluated once, after docs-audit exits clean and before spawning
  `finalize`.
- **Negative:** record `reconcile-epic: skipped (non-epic)` in `STATUS.md`
  § Notes and continue to finalize. No retro touchpoint for a skipped gate.
- **Positive:** spawn `reconcile-epic` in **pipeline mode** (its row
  in `MATERIA.md` § Tiers § Skill routing; spawn-contract Blocks 1 + 2),
  passing: the
  `<dated-slug>`, the `Epic-id`, and the pipeline-mode input line from
  `reconcile-epic/SKILL.md` § Pipeline mode. The stage edits the epic folder
  under `docs/epics/` and the epic's still-pending member proposals under
  `docs/specs/_proposed/`, committing on the run's branch — no branch, PR, or
  operator checkpoint of its own (the run's PR is the review gate; the stage
  cascades conservatively and surfaces anything uncertain as notes for the PR
  body). Then record
  `reconcile-epic: ran (epic <id> synced; <n> pending members cascaded)` in
  § Notes and run the retro touchpoint.
- **Failure (degrade, don't block):** retry a crashed/empty return once; on
  a second failure record
  `reconcile-epic: failed — run /materia:reconcile-epic <epic-id> standalone after
  merge` in § Notes, instruct finalize to carry the same line into the PR
  body, and continue — a missed epic sync is recoverable by the standalone
  skill; a blocked member PR is worse.
- **Consistency:** the stage marks this run's member `shipped` in the epic's
  table because the edit only lands if this run's PR merges — merge makes it
  true; a closed PR lands neither the member nor the sync.

## Intake hand-off

`intake-spec` returns one of two outcomes. Both may carry the **surfaces
resolution** the orchestrator must record (§ UI-surface gate, paths 2–4) —
but only on the **absent** paths: when the run took the **declared** path
(path 1 — `surfaces:` was in the proposal frontmatter and captured at stake),
the two § Notes lines are already written and intake was signalled not to
ask, so nothing below adds them.

- **`ok`** — intake asked the clarifying questions via `AskUserQuestion` and
  the operator answered. If surfaces resolution ran through intake (the spawn
  signal was `surfaces: absent`), intake's return carries a pinned line of
  exactly this shape as the last part of its report:

  ```
  Resolved surfaces: [ui]        # [ui] if it ships UI, else []
  ```

  Parse it and write the two § Notes lines — `Surfaces: […]` and
  `ui-surface (predictive): <positive|negative> (resolved surfaces: […])`,
  positive iff the resolved set includes a design-bearing surface (§ Review —
  § UI-surface gate). Then proceed to `design`.
- **`partial`** — `AskUserQuestion` was unavailable (the common case for a
  spawned intake), so intake ran in Auto Mode: it baked grounded defaults into
  `spec.md` and surfaced every default + alternative under "Open questions" —
  **including the baked `surfaces` prediction** (one bullet: the assumption +
  the flip) when the spawn signal was `surfaces: absent`.
  **Operator confirmation is required before spawning `design`.**

On `partial`, the orchestrator: (1) reads `spec.md`'s "Open questions";
(2) surfaces every question to the human — `AskUserQuestion` if available,
otherwise an end-of-turn prompt listing every default + alternative — and does
not spawn `design` until the operator has had the chance to flip any default
(**the surfaces assumption included, before `design` spawns**);
(3) folds the answers back into `spec.md` (removing resolved bullets);
(4) writes the two § Notes lines from the post-checkpoint resolution
(`Surfaces: […]` and
`ui-surface (predictive): <positive|negative> (resolved surfaces: […])`),
then commits + pushes before spawning `design`. Defaults baked in Auto Mode
are *always* surfaced before downstream stages build on them.

**Autopilot exception.** On an autopilot run (§ Autopilot) the orchestrator
does not pause on `partial`: it accepts intake's baked defaults as-is (**the
baked `surfaces` prediction included**), records
`autopilot: intake defaults accepted without operator checkpoint (see spec.md
§ Open questions)` in `STATUS.md` § Notes, writes the two § Notes lines from
the baked resolution (parenthetical reads `resolved`), and proceeds to the
next stage. The "Open questions" section stays in `spec.md` as the audit
record of what was assumed — the PR reviewer reads it there.

## Design gate (after the design stage)

The human design-review gate that runs after the `design` stage returns
`design.md` on an **interactive, design-bearing** run — the third
pause-by-ending-turn checkpoint (after the proposal menu and intake `partial`).
This section is the **normative home** for the whole mechanism; the status
template, `MATERIA.md` § Design tool, `docs/specs/_proposed/README.md`
(`design_gate:` field), and `docs/standards/skills.md` § The `--approve-design`
argument reference it.

### Gate resolution (the gate-off chain)

Resolve the chain, **first hit wins**:

1. `--approve-design` armed (§ `--approve-design`) → an auto-approval applies.
2. a captured `design-gate: <on|off> (proposal frontmatter)` § Notes line.
3. `MATERIA.md` § Design tool Design gate default (absent section or knob → `on`).

`--auto` is **not** in this chain — autopilot posture auto-approves separately
(§ Autopilot). § Design tool `none` does **not** skip the gate (the text rung
of the ladder covers a no-tool repo); the gate-off knob is this chain, not the
adapter.

### Gate arrival (interactive, design-bearing run)

After `design` returns `design.md`:

1. Resolve the chain above (`--auto` posture is handled in § Autopilot).
2. **Gate ON and no auto-approval applies** — write the approval block into
   `design.md` frontmatter (`status: pending`, `rounds: 0`, no hash — the
   design stage never touches the block), tick the design stage row, set
   `Next: design-approval (awaiting operator)` (a waiting state, **not** a
   Blocker), append `design-gate: awaiting approval` to § Notes, **then**
   commit (`design.md` + `STATUS.md` + `design/` together — the `design/`
   snapshot **only when one was produced this arrival**, already exported by
   the design stage or the orchestrator as part of its own persist step per
   `design/SKILL.md`'s mechanics — one commit) with the gate-marker subject
   (§ Gate commits), and push — never leave the STATUS.md edits uncommitted
   behind a design.md-only commit. This commit-together rule is stated once
   here and inherited by the auto-approve stamp path (step 3, "run the same
   arrival steps"). Present
   the design (§ Presentation — including, with no `read`, the every-time
   notice that direct canvas edits cannot be seen), print the three verbs, and
   **end the turn** with the marker sentence:

   > Awaiting design approval for `<dated-slug>`. The next message in this thread — or a fresh `/materia:ship-spec <slug>` invocation — will resume the run.

   The paused invocation opens **no PR** — one PR still, from the invocation
   that completes the run.
3. **Gate resolves OFF, or an auto-approval applies** — run the same arrival
   steps but stamp `status: auto-approved, by: auto, at: <ISO-8601>,
   reason: <the deciding knob's reason string>, design_hash: <computed>`,
   append `design-gate: auto-approved (<full reason string>)` to § Notes (the
   parenthetical is the full reason string verbatim), and **proceed to the next
   stage in the same invocation — no pause**. No-approval is a recorded
   decision, never a missing step.

Reason strings by knob: `--approve-design on invocation` · `--auto autopilot
run` · `proposal frontmatter design_gate: off` · `MATERIA.md gate: off`.

### The gate is ternary — approve / revise / abandon

Via `AskUserQuestion` when available, else parsed reply text (mirror the
proposal menu's degradation):

- **approve** → compute `design_hash`, write `status: approved,
  by: <operator handle>, at:`, commit (gate marker), clear the waiting state
  (set `Next:` to the next stage — `ui-test-plan` on UI runs), proceed.
- **revise** → operator supplies feedback; increment `approval.rounds` and
  commit it; re-spawn the design stage with `design.md` + the feedback (the
  stage produces a new body and appends the round to `## Feedback log` — round
  number, what was asked, what changed); re-present; end the turn again.
  Feedback that arrived on **any** surface goes into `## Feedback log` — never
  build the channel on design-tool inline comments (documented persistence
  issues; a channel that drops feedback is worse than none).
- **abandon** → set `status: abandoned` (no hash),
  `Next: design-abandoned (parked)`, append `design-gate: abandoned (<date>)`
  to § Notes, commit, end the turn. **No Blocker** — parked is a decision, not
  a problem; do **not** delete `design.md`. An existing `design/` snapshot is
  likewise left **as-is** on abandon — like `design.md`, it is neither deleted
  nor re-exported.

**The canvas is a fourth door into revision — not a fourth verb.** With a
`read`-capable adapter (`MATERIA.md § Design tool`), the human may edit the
design directly in the tool's UI **instead of — or as well as — replying with
feedback**. A **detected** canvas change on a **non-terminal** gate arrival is a
revision round: it increments `approval.rounds` and counts against the ≤3 bound
**exactly like the revise verb and a hand-edit re-present** (the counter was
built for channels — this is the channel it anticipated), and it routes through
§ Gate-arrival sync, which owns the detection and the one-increment-per-arrival
clamp. **Without `read`** the pipeline cannot see a canvas edit: at present
time, **every time**, the gate says so (§ Presentation) and takes the human's
canvas edits as **described feedback** instead — never reading a canvas it
cannot sync, never silently presenting a descriptive half that may lag the
canvas.

**Hand-edit visual intent reaches the canvas on the revise path.** Where the
operator's hand-edit to the body (a blessed feedback channel — § Sole-writer
split carve-out 1) expresses **visual intent**, the design stage applies it onto
the canvas during the revision that consumes it — the rule lives in
`design/SKILL.md` § Procedure step 9 (the revise path), not restated here. At an
**approve** there is **no re-authoring**: the edited-body rule already in this
section governs (§ Sole-writer split carve-out 1 for the feedback commit,
§ Resume step 0's edited-body verb rule for the stamp).

### Revision bound — `design-gate ≤3`

Counted by `approval.rounds` — the durable counter the orchestrator increments
and commits on **every** revision, whatever the channel (the revise verb, a
hand-edit re-present, a detected canvas edit, and an **architecture bounce**
(§ Architecture bounce) are the same loop through different doors; design the
counter for channels). At `rounds` ≥ 3, a further
revision request → write
`Blocker: design-gate revision bound exhausted (rounds=3)` and end the turn.
The bound limits **revisions, not decisions**:
when surfacing this Blocker, name approve/abandon as the legal in-thread
resolutions — such a reply clears the Blocker and routes through the gate
normally (this carve-out is scoped to this Blocker string by **prefix match** —
`design-gate revision bound exhausted (rounds=3)`, so the architecture-bounce
cause appended after that prefix still resolves in-thread while every other
Blocker stays exact-match — and its resume-side wiring lives at § Resume step 2's
sole exception).

### `design_hash` — the single normative definition

SHA-256 over **every byte after the closing `---` line of the leading
frontmatter block** — the markdown body only; **all** frontmatter excluded
(future frontmatter keys must never perturb the hash). Recipe (prose, not a
shipped script): strip the leading frontmatter block (first line `---` through
the next `---` line, inclusive, newline included), pipe the rest to
`shasum -a 256`. Only the `approved` and `auto-approved` stamps compute and
write it — **every time**; `pending` and `abandoned` blocks carry no hash.

### Gate commits

Every gate commit (pending write, feedback commit, rounds increment, canvas
sync + `canvas:` refresh, stamp, abandon) uses the subject prefix
`design-gate(<dated-slug>):`.
**Pending-edit detection** = `git diff` of `design.md` against the **most
recent gate-marked commit touching it** — never "most recent commit touching
the file" (an operator who hand-commits would zero that diff and evade the
rounds counter). The standalone design skill's persist commit also carries the
marker (see `design/SKILL.md`), so the baseline is uniform.

### Clean-tree stamping precondition (new behavior — no precedent claimed)

At the moment of stamping approval/auto-approval, if the working tree is dirty
in paths **other than the gate's own artifacts** — `design.md` and
`docs/specs/<dated-slug>/design/` — **refuse the stamp and say why; do not
stash**. A dirty `design.md` is operator revision content (verb rules); a dirty
`design/` is the sync/export output. Evaluate this **after** the
path-scoped feedback commit (if any) and **before** the orchestrator's own
`STATUS.md`/stamp writes (its own pending STATUS edit must not false-trip the
check).

### Sole-writer split

`design.md` body + `## Feedback log` = design stage; approval block =
orchestrator (standalone-lane exception: the standalone design skill writes the
initial pending block — see `design/SKILL.md`); `STATUS.md` = orchestrator, as
always. Two carve-outs:

1. **The operator outranks sole-writer** — a hand-edited `design.md` is a
   blessed feedback channel. On a pending re-present with a hand-edited body the
   orchestrator commits the edit (path-scoped, gate marker, marked as gate
   feedback) — bookkeeping of the operator's words, not an authorship claim.
2. **Post-approval orchestrator-written banners** (§ Course corrections; future
   design-debt banners) are legal body writes under the frozen-audit-record
   scoping below.

### Gate-arrival sync (canvas ↔ design.md)

**Every gate arrival on the canvas lane with a `read`-capable adapter**
(`MATERIA.md § Design tool` — an `author`-lane run; a repo-side run has no
canvas to sync) opens by asking: **did the canvas change since the last gate
commit?**
This holds for all four arrivals — a re-present, the approve verb, an armed
`--approve-design` auto-approval, an autopilot auto-approval. **Abandon is
explicitly not a fifth arrival this section covers:** a canvas edit made
immediately before abandoning is neither synced nor exported — it becomes
visible only if the run is later revived through a revise, which re-arms the
gate through the normal channels. On an autopilot
run the answer is almost always **no** — the design stage just authored the
canvas and nobody paused to touch it — so the sync collapses to the stamp; the
**uniformity** is the point here, not the work.

**Detection — the adapter's recorded means, in preference order** (the
canvas-change-detection convention of `MATERIA.md § Design tool`):

1. **Canvas state/version identifier** — compare the committed `canvas.version`
   frontmatter baseline against the current canvas (claude-design: per-file
   etags). The cheap, exact signal.
2. **No identifier** → a canvas **read-back plus a canonicalized re-export**,
   compared against the last committed versions (the adapter note records
   whether its export is deterministic enough for the comparison to mean
   anything).
3. **Neither** (`canvas-change-detection: none`) → every `read`-capable gate
   arrival that **re-presents** counts one round, **unconditionally** —
   conservative, but it preserves the ≤3 bound: an undetectable channel must
   never become an uncounted lane.

**Terminal stamping arrivals are carved out — universally, in every detection
mode.** An arrival whose resolution **ends the gate** — the approve verb, an
armed `--approve-design` auto-approval, an autopilot auto-approval — **never
counts a round**: there is no further authoring round for the bound to cap, and
a stamped gate presents nothing further to iterate on, so the uncounted lane
does not reopen. The sync unit **still runs** — a last-minute canvas edit is
still synced and honestly logged in `## Feedback log`; it just isn't a round.
Universal across detection modes, option 3 included: its "every re-presenting
arrival counts" yields to this carve-out for the stamping arrival.

**Actor split.** Canvas I/O follows the lane split in `design/SKILL.md`
§ Canvas authoring & the paired artifact (who holds the MCP connection). The
descriptive-half re-derivation is **design-stage work, spawned**: the
orchestrator dispatches the design skill in **sync mode** (`design/SKILL.md`
§ Sync mode — inputs: the serialized canvas read-back + the current `design.md`;
outputs: the updated canvas-owned sections + that round's `## Feedback log`
entry). The orchestrator **never authors body content** — the § Sole-writer
split holds at every gate arrival. The orchestrator **increments `rounds`**, **at
most once per gate arrival** however many channels fired: a canvas edit + a
hand-edit + the revise verb in one arrival is **one** round and **one**
`## Feedback log` entry covering all of it, and the sync unit writes that entry.

The **same split governs the snapshot export/re-export exactly as it governs the
body** (`design/SKILL.md` § Canvas authoring & the paired artifact's "and export
alike" rule): when MCP is reachable inside the spawned sync unit, that unit
performs the re-export itself alongside its body re-derivation; when MCP is
operator-session-only, the **orchestrator** performs the re-export itself
alongside its own canvas read-back — the same actor already doing the body
re-derivation in that world. This is the paragraph `design/SKILL.md` § Sync mode
forward-references as the normative home for the operator-only-MCP re-export
duty. The **first-authoring export** (design/SKILL.md step 9, not sync mode)
follows the identical assignment: when MCP is operator-session-only, the
orchestrator — which already executes the design stage's canvas-authoring
plan onto the canvas over MCP in that world (`design/SKILL.md` § Canvas
authoring & the paired artifact — "The lane split") — performs that first
export itself too, immediately after authoring, before the gate-arrival
commit-together step (§ Gate arrival) runs.

**Precedence.** Operator hand-edits to the body are **authoritative** for the
sections they touch; the sync unit re-derives **only** canvas-owned content and
never overwrites operator-authored descriptive edits (`design/SKILL.md`
§ Sync mode pins the canvas-owned boundary).

**Approval = sync, then freeze.** When the arrival's resolution is a **stamp**:
run detection; if the canvas changed (per the detection preference order
defined earlier in this section), the sync unit re-derives the canvas-owned
sections (and, when the adapter can `export`/reconstruct, also re-derives the
committed snapshot at `docs/specs/<dated-slug>/design/` — same actor as the body
re-derivation (§ Actor split), riding the **same** terminal carve-out that
already governs the body-only case, never a new countable event) with its
outputs committed **before** the stamp commit — **not** a counted round (the
terminal carve-out above) — **then** the orchestrator stamps, `design_hash`
computed over the **now-current** body. If nothing changed, approve is just
commit-any-body-edit + stamp, exactly as § The gate is ternary and § Resume
step 0 already prescribe. Under **`read: no`** the read-back clause vanishes
entirely — the body is already current (the stage kept it so while authoring;
there is nothing to read back), so approval stamps **without a canvas read** (the
snapshot re-export applies only where the adapter can `export`/reconstruct).
After the stamp the repo record is **frozen**: post-approval canvas drift does **not**
change the build contract — the post-approval-drift statement in `MATERIA.md
§ Design tool` gives the operator-facing half (expect someone to keep sketching);
the pipeline-facing half is that the gate built the contract from the committed
pair and never re-reads the canvas afterward.

**The `canvas:` baseline.** The `canvas:` frontmatter keys (`reference` /
`version`, the design template's frontmatter contract) are refreshed by the
canvas-I/O owner in **every gate commit**, so the next arrival's detection has a
current baseline to diff against. The sync unit's body writes and the
`canvas:`-key refreshes ride the gate-marked commit like every gate commit
(§ Gate commits).

### Architecture bounce (design-revision-requested)

The `architecture` stage may find the approved design **infeasible** — buildable
only by contradicting `spec.md` or the design's own intent (`architecture/SKILL.md`
§ When the approved design is infeasible). Rather than write an `architecture.md`
that quietly deviates, it returns outcome `design-revision-requested` with a
concrete reason; the orchestrator intercepts that return (§ Architecture hand-off)
and routes the reason back through this gate as a **revision — the bounce**. The
bounce is one of the revision channels this gate's bound counts (revise verb ·
hand-edit re-present · detected canvas edit · **architecture bounce** — § Revision
bound), with these mechanics:

- **One increment at dispatch.** Incrementing `approval.rounds` by one is this
  arrival's single increment (the one-per-arrival clamp — the bounce *is* the
  arrival). Re-spawn the `design` stage as a **full revision** (never sync mode —
  the design body changes), passing the reason as the feedback: the stage
  produces a new body and appends the round to `## Feedback log` (round number,
  the reason recorded as what-was-asked, **attributed to architecture**), and —
  canvas lane — re-authors the canvas per the lane split (`design/SKILL.md`
  § Canvas authoring & the paired artifact). The revision commit refreshes the
  `canvas:` version baseline (§ Gate-arrival sync — The `canvas:` baseline) so the
  **next** gate arrival's detection sees no *additional* change — no double-count.
- **The bounce re-arms the gate.** Reset the approval block to a bare
  `status: pending` carrying only the incremented `rounds` — the superseded
  `by:` / `at:` / `design_hash` fields are **dropped** (a pending block never
  carries approval-era fields — § `design_hash`; supersession is recorded in the
  `## Feedback log` entry and the § Notes line, never in the block). Set
  `Next: design-approval (awaiting operator)`, append the § Notes line
  `design-revision (architecture): <reason> (bounce <n>/2)` (short-form reason;
  convention in `docs/specs/_templates/status.md` § Notes), and commit with the
  gate marker (§ Gate commits). The re-presented design then routes through this
  gate **normally** (§ Gate arrival · § The gate is ternary): the human sees what
  architecture forced. On an autopilot run the re-armed arrival auto-resolves per
  § Autopilot's gate rules; the § Notes line still lands as the audit record.
- **Bounce bound — ≤2 per run.** Count the existing
  `design-revision (architecture):` § Notes lines (durable and **resumable** — the
  count is read from § Notes, never held in memory, so it survives across
  sessions). A **third** `design-revision-requested` →
  write `Blocker: architecture design-revision bound exhausted (bounces=2)` and
  end the turn.
- **Exhaustion precedence.** A bounce is capped by **both** bounds — its own ≤2
  and the gate's ≤3. A bounce arriving when `approval.rounds` is already 3 cannot
  dispatch a revision — no design re-spawn, **no increment** — but it must still
  put the run where its resolution can be acted on: **re-arm the gate without
  incrementing** — reset the block to bare `status: pending` (`rounds` unchanged
  at 3), set `Next: design-approval (awaiting operator)`, append the § Notes
  bounce line (the attempt is real architecture signal and consumes a bounce
  slot), gate-marked commit — then write the rounds Blocker carrying the real
  cause —
  `Blocker: design-gate revision bound exhausted (rounds=3) — architecture reports design infeasible: <reason>`
  — and end the turn. The approve/abandon carve-out applies to this combined
  string — covered by the § Revision bound prefix match (and § Resume step 2's
  sole exception), which keys on the
  `design-gate revision bound exhausted (rounds=3)` prefix — and because the
  gate is re-armed, the cleared verb genuinely routes through Resume step 0
  (the `Next:`-normative predicate reads the run as **not** advanced): `approve`
  stamps the design with architecture's objection on record and re-runs
  architecture as the operator's informed call; `abandon` parks it. Without the
  re-arm the carve-out would clear the Blocker into a step 0 that never fires —
  the bounce-bound check (≤2, above) runs **first**, so a third
  `design-revision-requested` still hard-stops at `bounces=2` rather than
  cycling this path.

### Presentation — a capability ladder

Every rung is real today; the gate itself never changes across adapter
configurations:

1. **Canvas link** (**live** — adapters with `reference`). The canvas
   `reference` URL — the durable pointer (`MATERIA.md § Design tool`) — is the
   **top rung and the primary surface the human reviews in**: a real visual
   design, not `design.md` prose. It satisfies the binding constraint below by
   nature — a cloud canvas is reviewable after the turn ends, no process to
   kill. Print the committed pair's paths (`design.md`, plus the committed
   snapshot when one was exported) **alongside** it: the review link on top, the
   repo record beneath.
2. **Committed snapshot** (adapters with `export` or `read`-reconstruction).
   When a `design/` snapshot was committed for this run, print a one-line
   serve command (e.g. `npx serve docs/specs/<dated-slug>/design`) — the
   path itself is already printed by rung 1 when rung 1 applies (its own
   instruction above already names the snapshot path), so don't print it
   twice. When rung 1 (the canvas link) is unavailable, print the path here
   instead, since **rung 2 becomes the primary reviewable surface**. The
   skill **starts no server itself** — it prints the command and the
   operator runs it if they want a proper HTTP origin instead of opening
   `index.html` straight from disk.
3. **Text (always)** — `design.md` itself, the floor every configuration has;
   with no `reference` link and no snapshot, say plainly that no visual render
   is available yet.

**No `read` — say it at present time, every time.** With a connected adapter
that lacks `read` (`MATERIA.md § Design tool`), print the notice that **direct
canvas edits cannot be seen**: the descriptive half may lag the canvas, so the
human's canvas edits are taken as described feedback (§ The gate is ternary, the
canvas channel), never read off a canvas the pipeline cannot sync. Never present
a descriptive half that may silently lag the canvas.

Binding constraint for every rung, now and future: whatever is presented must
be reviewable **after the turn ends** — the pause kills any process this
invocation started; a cloud URL or a committed file qualifies, a localhost
process does not.

### Non-design specs are unchanged

When the run's surfaces exclude design-bearing surfaces (§ Review — § UI-surface
gate, predictive form negative) or `MATERIA.md` § Surface gates § UI-affecting
is `none`, ship-spec runs end to end in one invocation exactly as today — no
gate, no pause. § Design tool `none` does **not** skip the gate by itself (the
text rung covers a no-tool repo); the gate-off knob is the precedence chain,
not the adapter.

### Advanced-past-the-gate predicate (pinned)

The run has advanced past the gate **iff `Next:` names a stage beyond the
gate** — that is, `Next:` is neither `design-approval (awaiting operator)` nor
`design-abandoned (parked)`. This `Next:`-based test is the **normative** one.
The ticked-rows form ("any stage row after design is ticked") is **no longer
equivalent** to it: an architecture bounce (§ Architecture bounce) can re-arm a
**mid-run** gate — resetting the block to `pending` and `Next:` to
`design-approval (awaiting operator)` — while the post-design rows (`ui-test-plan`,
`architecture`) are **already ticked**, so a ticked-row scan would walk right past
a legitimately re-opened gate. Key on `Next:`, never on the ticked rows, and
**never** on `status: approved` alone. Once past — `Next:` beyond the gate — the
approval block, hash included, is a **frozen audit record**: Resume step 0 no
longer routes on it; later body writes (course-correction banners, future debt
banners) are expected and legitimate and must **never** bounce a reviewed run
back to the gate, because they never reset `Next:` or the block — the hash
answers "what did the human approve," not "has the file changed since."

### Standalone-first lane

A folder produced by the **standalone** design skill (no stake — `Branch:`
still the template placeholder), whether its block is still `pending` or was
already auto-approved at persist time (gate-off lane): before advancing —
past the gate, or past resume when the gate never fires (§ Resume step 3's
placeholder-branch guard) — **provision the run branch off current HEAD**
(where the standalone commits live — **NOT** off trunk; trunk would strand
`design.md`/`STATUS.md`), named `<type>/<slug>` per the naming convention,
and backfill `Branch:`.

### `--approve-design`

The argument contract lives in `docs/standards/skills.md`
§ The `--approve-design` argument (restated here only gate-side). At
invocation, record `design-gate: auto-approve armed (--approve-design)` in
§ Notes at the **earliest durable moment = stake** (an invocation pausing at
the proposal menu pre-stake cannot persist the arm — the menu's marker text
must say the arm did not survive; a same-turn selection carries it through
in-context to stake). Consumed at the **first gate arrival after arming** —
same steps as the approve verb (a hand-edited pending body → path-scoped
feedback commit first, then the stamp, reason `--approve-design on
invocation`) — then rewrite the armed line to
`design-gate: auto-approve consumed (--approve-design)`. Arming never overrides
the rounds bound or a set Blocker. Redundant-but-legal under `--auto`.

## Architecture hand-off

`architecture` (stage 4) returns one of two outcomes — mirroring how § Intake
hand-off intercepts intake's `partial`:

- **`ok`** — `architecture.md` is written and committed; continue to `plan-tasks`
  (stage 5) as always.
- **`design-revision-requested`** — on a UI run, architecture found the
  **approved** design infeasible: it cannot be built without contradicting
  `spec.md` or the design's own intent, so it returned a concrete reason
  (what is infeasible · why · what change would make it feasible —
  `architecture/SKILL.md` § When the approved design is infeasible) instead of
  writing an `architecture.md` that quietly deviates. **No `architecture.md`
  landed this pass.**

**The orchestrator intercepts `design-revision-requested`** and routes the reason
back through the design gate as a **revision — the bounce**: re-spawn `design`
with the reason as feedback, re-arm the gate, re-present it, and re-run
`architecture` only once the revised design is re-approved — all under the
mechanics and the **≤2 bounce bound** pinned in § Design gate — Architecture
bounce (which also enforces the gate's own ≤3 revision bound and the exhaustion
precedence between the two). This is the **active** half of § Course corrections:
a design contradiction caught while the design stage can still be re-run is
revised-and-re-approved, not banner-cordoned.

## Tier routing

Every `Agent` spawn (stage, task, reviewer) is dispatched at a declared
model + effort tier. Vocabulary, model availability, fallback, and coercion:
`MATERIA.md` § Tiers. At each spawn point:

1. **Read** the unit's tier — stage/sub-skill → its row in `MATERIA.md`
   § Tiers § Skill routing (the **Default** row if unlisted); task → its
   `Model/effort` field in `tasks.md` (dynamic; drawn from § Model set; an
   **absent or malformed** field takes the § Skill routing **Default** row,
   `opus/high`, not the `implement-task` row — see § Tiers § Fallback);
   a review angle (canonical or repo-specific) → the `Tier`
   column of its row in `MATERIA.md` § Review angles — no review angle has a
   § Skill routing row; the review-loop tiebreaker → its `ship-spec:
   review/tiebreaker` row. An explicit operator override wins; record
   `tier-override: <unit> <artifact-value> → <operator-value>`.
2. **Resolve availability** against `MATERIA.md` § Tiers § Model set: a model
   listed there resolves as declared; a model absent from the table coerces to
   the fallback with `tier-fallback: <unit> <tier> → <fallback> (not in model
   set)`.
3. **Map** `<model>/<effort>` → `(model, effortSentence)` per `MATERIA.md`
   § Tiers § Effort set.
4. **Spawn** `Agent(..., model: <model>)` with the effort sentence prepended
   to the prompt. Record the resolved tier per spawn for the retro.

**Fallback:** a resolved model that is out-of-table /
`Agent`-rejected coerces to the unit's own **Fallback Model** — the
`Fallback Model` column of its row in `MATERIA.md` § Tiers § Skill routing
(the **Default** row's fallback for a unit with no row of its own), run at the
unit's own effort — per `MATERIA.md` § Tiers § Fallback, with the standard
one-line note. (An **absent or malformed** per-task `Model/effort` field is not
a coercion — it takes the Default row directly, per step 1 and § Tiers
§ Fallback.) An `Agent` call that
rejects or errors on an available model coerces that spawn the same way (reason
`<model> unreachable`) — never block or pause the run waiting for a model to
come back. The fallback never blocks the run, and never loops (§ Tiers
§ Coercion terminates at the harness default).

## Session-start environment preflight

Before dispatching any code-touching stage, run the **one-time session
preflight** from [`resources/env-preflight.md`](resources/env-preflight.md)
(runtime → deps → codegen → services) so implement/review subagents inherit a
green baseline instead of each rediscovering the cold-start gap — historically
the single biggest slice of wall-clock. The concrete recipes and known
failure signatures live in `MATERIA.md` § Environment preflight. Surface any
preflight failure once, up front. A markdown/docs-only run may skip the
preflight — see `finalize/SKILL.md` § Procedure's docs/skills-only gate
profile.

## STATUS.md ownership (orchestrator lane)

Every stage skill's persist step ticks `STATUS.md` and commits **by default** —
that is the contract for standalone use. **When a stage runs in the
orchestrator lane** (spawned by `ship-spec`), that default is **superseded**:
the orchestrator owns `STATUS.md` and the run's commits; the spawned stage must
**not** touch `STATUS.md` or commit it. The orchestrator ticks the stage row,
sets `Next`, and commits + pushes after the stage returns. This precedence is
part of `spawn-contract.md` Block 1 — pass it into every spawn. In particular
it **supersedes `implement-task/SKILL.md` Procedure step 6's default
`STATUS.md` tick** — a spawned implementer ticks only its own `tasks.md` AC
boxes and leaves `STATUS.md` (and `retro.md`) to the orchestrator.

**Spawned-stage Blocker hand-off (generic).** A spawned stage never touches
`STATUS.md` in the orchestrator lane, so carrying a `Blocker:` line back in its
**return payload** is how it reaches the human. When a spawned stage's return
carries an explicit `Blocker: <text>` line — it hit a hard stop it cannot
resolve in its own lane (e.g. `design/SKILL.md` step 9's git-ignored-snapshot-
path guard, which already specifies this exact format; any other stage-level
hard stop that wants this hand-off, such as step 7's failed-assertions rule,
must likewise return a concrete `Blocker: <text>` line rather than a bare
failure) — the orchestrator writes
that line **verbatim** to `STATUS.md`, commits, and surfaces it to the human,
**ending the turn** exactly as any other Blocker arrival does (§ Resume step 2
hard-stops on it on the next session). This is the single receiving-end
mechanism for **every** spawned-stage Blocker — no bespoke per-case wiring, and
no new Blocker vocabulary beyond what the producing stage already specifies.

**Creation-only carve-out (ad-hoc intake).** On the ad-hoc path (§ Proposal
selection — Ad-hoc path) the orchestrator has not pre-created the folder, so
`intake-spec` seeds + commits the initial `STATUS.md` at mint. That is the sole
spawned-stage `STATUS.md` write, and it is **creation, not ticking** — intake
still never ticks a stage row; the orchestrator ticks stage 1 after intake
returns. The ticking monopoly is unchanged.

## Fresh-context reviewer spawning

In this environment, subagents **cannot spawn further subagents**. Any
fresh-context reviewer this pipeline mandates is therefore
**orchestrator-spawned**, never subagent-spawned:

- **Post-implementation review reviewers** — spawned by `ship-spec` after
  every task is `[x]`, over the cumulative branch diff. Implementers do not
  run review inside `implement-task`. See § Review.
- **`docs-sync` edit-pass subagent** — spawned by `ship-spec` after the review
  loop exits clean.
- **`docs-audit` verify-pass subagent** — spawned by `ship-spec` after each
  `docs-sync` round. **Never spawned by `docs-sync` itself** — the
  orchestrator owns the loop.

## Orchestrator behavioral-verify lane

Some tasks can only be verified **behaviorally**, against long-lived servers
(a database, the Eyes toolchain, a live dev server — `MATERIA.md` § Run it +
§ Eyes). That verification cannot live in a fresh-context subagent — long-lived servers make a backgrounded subagent stall
and go quiet (§ Subagent liveness). So this is a **named, first-class lane**:
when a task's only real safety net is behavioral and needs a long-lived
server, the **orchestrator runs the behavioral verification itself** (stand up
the stack, drive the app / `verify` flow, tear it down). Record in `STATUS.md`
that the check ran in the orchestrator lane and what it covered.

**Run it in the foreground with explicit exit-code capture — not
`nohup … &`.** A backgrounded launcher returns immediately and produces a
misleading "exit 0" notification that reports the *launcher* finishing, not
the e2e run (e.g. `<test:e2e command>; echo "exit=$?"` — the command from
`MATERIA.md` § Gate). Two further notes: **check e2e response-stub shapes
against the real wire types** — a stub of the wrong shape silently stalls a
page in loading until this lane catches it; and **CI also gates e2e** when
the repo has a non-`none` `test:e2e` row (`MATERIA.md` § Gate), so this lane
is the earlier, pre-PR signal that keeps red e2e from reaching CI, not the
only guard.

Two capture-hygiene rules, learned the hard way: **reset the capture
fixtures first** — truncate or reseed the feature's tables before UI-proof
screenshots so the empty-state captures are truthful (never assume a clean
dev DB); and **never chain teardown with follow-up work in one shell
command** — a `pkill` signal kills the shell before the follow-up runs, so
issue teardown as its own command.

## Subagent liveness (long-running spawns)

A backgrounded subagent that stalls emits no signal. The orchestrator must not
wait indefinitely:

- **Poll liveness, don't block** — e.g. transcript mtime advancing vs the wall
  clock, or the expected commit not landing well past a reasonable budget. A
  stale spawn is presumed **stalled**.
- **Treat a stall as a resumable failure:** record it in `STATUS.md` under the
  task's row, recover any work already committed, re-dispatch the remainder (a
  fresh `implement-task` over the same task is idempotent against an
  already-committed partial).
- **Implementers must not self-fan-out** — enforced in
  `implement-task/SKILL.md`; a delegating implementer is itself a stall risk.
- **Wait for the explicit completion notification before acting on a tree.**
  Edits-look-done is not done — **only the completion notification is a
  reliable done-signal**. Never commit, kill processes under, or otherwise act
  on a presumed-stalled subagent's tree: a legitimately long task (e.g. an
  e2e-iteration loop with repeated dev-server boots) looks identical to a
  stall from the outside, and acting on it mid-flight kills live work and
  forces the subagent to churn through recovery. Distinguish a true stall
  (stale transcript well past budget) from a spawn in final wrap-up; when in
  doubt, wait longer.
- **Hoist long-lived dev-server/e2e work to the orchestrator lane** — never
  run it inside an implement/review subagent, where its runtime reads as a
  stall from the outside and its processes are exposed to a mistaken kill
  (mirroring § Orchestrator behavioral-verify lane).
- **Expect-and-ignore stop-hook fires on in-flight WIP** — a long serial
  implement loop always has a dirty tree in flight; these fires are structural
  noise, not a recovery signal.

## Review (post-implementation)

Adversarial review runs once after the implement loop completes — not per
task — minimizing total fan-out and giving every reviewer the full cumulative
context.

### When the review pass runs

After every task in `tasks.md` is `[x]`, before `finalize`. Resolve the
baseline from `MATERIA.md` § Version control: `git fetch <remote> <trunk>`
first so the base is fresh, then review over `git diff <baseline>...HEAD`
(**diff against `<baseline>` — the ref `<remote>/<trunk>` — not a stale local
`<trunk>`, which yields a phantom diff**). The three-dot diff resolves the
merge-base against `HEAD` for you, so no separate `git merge-base` step is
needed — the review still sees the branch's own changes against the
up-to-date base.

### Reviewer fan-out

Spawn reviewers as a **single message**, one `Agent` call per **applicable**
angle. **Iterate the `MATERIA.md` § Review angles registry** — the canonical
six ship pre-filled and any repo-specific rows append below, iterated the same
way (one reviewer per applicable row; there is no separate "repo-specific
angles" step). For each row:

1. **Evaluate its Gate over the cumulative diff.** `always` → unconditional;
   `ui-affecting` → per § UI-surface gate; `data-affecting` → per § Data-surface
   gate; a repo-specific predicate → as the row states. Record every negative
   decision in `STATUS.md` (`<angle>-review: skipped (<reason>)`), exactly as
   the UI/data gates already do.

2. **For each positive angle**, load its definition from the row's `File` at
   `.materia/review-angles/<File>`, and spawn a reviewer at the row's **Tier**
   (resolved through § Tier routing; availability per `MATERIA.md` § Tiers
   § Model set), passing `spawn-contract.md` Blocks 1 + 3 **plus the angle
   file's body** as the review brief. The body states what to check and which
   skill to invoke (`code-review` / `security-review` / `verify` / `ui-review`)
   or the inline procedure. Findings use `category: "<angle-name>"` (the row's
   kebab `name`) and flow through the same remediation loop, severity rubric,
   convergence check, and session-limit fallback as every other angle. The
   **Markdown-only exemption** and **Trivial-diff threshold** collapses apply to
   every row — repo-specific rows included — dropping an angle unless a surface
   gate of its own (`ui-affecting` / `data-affecting` / a repo-specific
   predicate) is independently positive (as `data-safety`'s can be on a
   seed-data-only diff).

On the markdown-only exemption path the `spec-adherence` angle spawns at
`haiku/low` — the **Markdown-only exemption** paragraph below carries that
binding value.

**Skill availability.** `ui-review` ships with the Materia plugin, so
it is always available; `code-review` and `security-review` are harness-provided
and may be absent from a given session. When a named skill is unavailable,
running that angle inline is the documented procedure — not a deviation to
record.

**Orchestrator-lane review angles.** The `behavior` and `ui`
angles MAY run inline in the orchestrator lane when they require a long-lived
server stack (database + Eyes toolchain + dev server), mirroring § Orchestrator
behavioral-verify lane — a standing contract, not a per-run deviation. The
orchestrator records the lane decision and the fresh-context deviation in
`STATUS.md`, the review retro entry, and the PR body.

**Markdown-only exemption.** If the cumulative diff contains no source-code
changes (no changed file outside markdown/docs) and no test additions, skip
the `correctness` / `security` / `behavior` reviewers — the `spec-adherence`
reviewer runs alone, **spawned at `haiku/low`** (this path's binding tier).
(The `data-safety` angle still runs when its own gate is positive — a
seed-data-only diff can be markdown-exempt but data-affecting.)

**Trivial-diff threshold.** When the diff *does* touch source but is trivially
small — roughly **≤ 10 changed lines**, pure presentation/mechanical (copy
tweak, class change, constant rename), no new control flow, no new
exported surface, no test additions — collapse the fan-out to the
**spec-adherence angle alone**. If in any doubt, run the full fan-out; record
the collapse decision (and line count) in `STATUS.md`.

### Missing or malformed angle file

The materialized `.materia/review-angles/` library is forkable and `check:docs`
does not scan it, so registry↔file drift in a user repo is caught only here at
runtime. A positive registry row whose `File` is absent or unreadable in
`.materia/review-angles/` must **never** silently drop the angle:

- **Record it** in `STATUS.md` (e.g. `<angle>-review: file missing — <path>`).
- **`always`-gate angle → self-verify inline** from the cumulative diff,
  mirroring § Session-limit fallback for a crashed reviewer — a deviation from
  the fresh-context guarantee, flagged explicitly in `STATUS.md`, the review
  retro entry, and the PR description.
- **Gated angle** (a non-`always` row — `ui`, `data-safety`, or a repo-specific
  predicate) → may instead **skip and record** the drop. (This is why a missing
  file is treated more leniently than § Session-limit fallback treats a *crashed*
  gated reviewer: a crash means the angle is still configured to run, but a
  missing file in a fork can mean the angle was deliberately removed there.)

### UI-surface gate

The **single canonical definition** of "UI-affecting" — the positive
predicate that gates the `design` + `ui-test-plan` stages and the `ui-review`
angle (sibling to the Markdown-only exemption, which is the inverse
predicate). The sub-skills reference this gate **by section name**; nothing
re-states the pattern list.

A diff is **UI-affecting** when `git diff <baseline>...HEAD --name-only`
matches the UI-affecting pattern list in `MATERIA.md` § Surface gates
(§ UI-affecting). When that section is `none`, every UI-gate decision in
this pipeline is negative by definition.

**Two evaluation forms.** Post-implementation evaluations (the review
fan-out, finalize's e2e-coverage and UI-proof gates) use the diff predicate
above literally. Pre-implementation evaluations — the `design` and
`ui-test-plan` stage gates, which run before any product diff exists — use
the **predictive form**: would the feature described in `spec.md` add or
change any screen, page, component, or `composables/ui/` hook such that the
eventual diff matches the patterns above? The predictive form is a **single
per-run decision gating both stages**, and it is **positive iff the run's
resolved surfaces include a design-bearing surface** (today `ui`; the
design-bearing set is defined in `docs/specs/_proposed/README.md` § Field
roles → `surfaces` — reference it, don't restate). The diff form above
remains the single canonical definition of "UI-affecting" and the
post-implementation authority; a declared/resolved value is triage input to
the predictive form only, never a redefinition of it.

**Predictive-form resolution order (one decision, four paths).** The
prediction is made **once**: intake bakes it on the Auto/autopilot paths and
the orchestrator only *records* the settled value — it never runs a second
independent inference. "Absent" is **never a hard stop**.

1. **Declared** — the proposal frontmatter carried `surfaces:`, captured to
   the `Surfaces:` § Notes line at stake (§ Mint the `<dated-slug>` — step 4).
   Authoritative and **short-circuits before intake**: resolve from the
   declared set and record both `Surfaces: […]` and
   `ui-surface (predictive): <positive|negative> (declared surfaces: […])`.
2. **Absent + interactive intake** (`AskUserQuestion` available) — intake
   asks "does this ship UI?" (the UI/design-bearing determination only — not
   the data dimension), suggested from its own prediction, and returns a
   pinned `Resolved surfaces: [ui]` (or `[]`) line in its subagent return
   (§ Intake hand-off). The orchestrator parses that line and writes
   `Surfaces: […]` and
   `ui-surface (predictive): <positive|negative> (resolved surfaces: […])`.
3. **Absent + Auto Mode** (`AskUserQuestion` unavailable, orchestrated) —
   intake bakes the predicted value into `spec.md` § Open questions (one
   bullet: the assumption + the flip) and returns `partial`; the existing
   § Intake hand-off checkpoint lets the operator flip it **before `design`
   spawns**; then the orchestrator writes the two lines (`resolved`).
4. **Absent + autopilot** — no pause (§ Autopilot): the baked prediction
   stands, recorded in `spec.md` § Open questions and the two § Notes lines
   (`resolved`).

Only when **no** declared or baked value exists (nothing on the `Surfaces:`
line and nothing baked) does the orchestrator fall back to today's bare
heuristic: **when in doubt, treat the run as UI-affecting** — a wasted design
pass is cheaper than an undesigned UI change. A recorded
`ui-surface (predictive):` decision is **honored on resume** — never
re-derived from a now-absent `Surfaces:` line and flipped. (Namesake caution:
this `surfaces:` field is unrelated to the release ledger's `Change.surfaces`
array — nothing shared but the word; see `docs/specs/_proposed/README.md`
§ Field roles → Two namesakes.)

**The absent paths (2–4) resolve only the UI dimension.** The "does this ship
UI?" question settles the **design-bearing (UI)** determination alone, so the
`resolved` `Surfaces:` value it records is `[ui]` or `[]` and makes **no** data
claim — a `resolved` `[]` means "no UI surface," *not* "no data." Data-affecting
classification stays owned by the diff-form § Data-surface gate; a `data` token
appears in `Surfaces:` only when a proposal **declared** it (path 1). So `[]`
must be read together with its `(declared|resolved)` provenance: `declared []`
is "none across the vocabulary," `resolved []` is "no UI (data unasserted)."

The **orchestrator** evaluates this gate — the predictive form (resolved per
the order above, gating `design` + `ui-test-plan`) and the diff form again
**before the review fan-out** (over the cumulative diff) — and records each
decision in `STATUS.md`. On a non-UI run it skips `design` and `ui-test-plan`
and omits the `ui-review` angle, noting `design: skipped (non-UI — <reason>)`,
`ui-test-plan: skipped (non-UI — <reason>)`, and
`ui-review: skipped (non-UI — <reason>)`. When positive, `ui-review`'s
findings flow through the same remediation loop and re-spawn across the
≤3-round bound; non-convergence writes a `Blocker` exactly as § Loop on
findings prescribes.

### Data-surface gate

The positive predicate that gates the `data-safety` angle. A diff is
**data-affecting** when `git diff <baseline>...HEAD --name-only` matches the
data-affecting pattern list in `MATERIA.md` § Surface gates
(§ Data-affecting). When that section is `none`, the angle never runs.

The orchestrator evaluates this once before the review fan-out and records
the decision in `STATUS.md`: on a negative it omits the angle, noting
`data-safety-review: skipped (non-data — <reason>)`; on a positive the
angle's findings flow through the same remediation loop as every other
angle.

### Screenshot-presence check (UI runs)

On a UI-affecting run, committed screenshots are a **mandatory review
deliverable**, not a best-effort by-product of `ui-review`. After the
`ui-review` angle returns (each round it ran), the orchestrator verifies that
`docs/specs/<dated-slug>/ui-proof/` contains at least one committed PNG.

- **PNGs present** → note `ui-proof: <n> screenshots committed` in
  `STATUS.md` § Notes and continue.
- **Empty, with a recorded reason** (the exact eyes-instability line, or a
  `ui-proof: capture failed — <reason>` note written by `ui-review`) →
  continue; finalize renders the degraded note from that reason.
- **Empty, with NO recorded reason** → treat as a reviewer contract
  violation, not a degrade: run a **recapture in the orchestrator lane**
  (provision per `resources/env-preflight.md`, drive the changed screens, capture
  at minimum each changed screen's ready state, commit to `ui-proof/` with
  the same `<flow>-<state>.png` naming). Only if the recapture itself fails
  may the run proceed — and then only after writing
  `ui-proof: capture failed — <reason>` to `STATUS.md` § Notes, because
  `finalize` **blocks** on an empty `ui-proof/` that has no recorded reason
  (see `finalize/SKILL.md` § Procedure step 4).

### Fresh-context exclusions

Every reviewer prompt carries, verbatim, `spawn-contract.md` Block 3 — the
fresh-context read/exclusion list plus the inline-only rule — and, from round
2 on, the **spec + architecture grounding** section and the
**dismissed-findings carry-forward** lines
(`dismissed-prior-round: <finding> — <why> (verified @ <sha>)`) defined there.
Reviewers re-raise the same false positive across rounds when they lack the
context that already answered it; the grounding + carry-forward are the
orchestrator's brief (fresh-context-allowed), not other reviewers' outputs.

### Structured finding schema

Every reviewer returns findings as a list of JSON-shaped records:

```
{
  "file": "path/from/repo/root.ts",
  "line_start": 42,
  "line_end": 47,
  "severity": "HIGH" | "MEDIUM" | "LOW",
  "category": "correctness" | "security" | "spec-adherence" | "regression" | "behavior" | "coverage" | "simplicity" | "ui" | "data-safety" | "design-conformance" | "<repo-specific angle>",  // category ∈ the kebab angle `name` from the MATERIA.md § Review angles registry, OR a documented sub-category (`coverage`/`simplicity` under `correctness`, `regression` under `spec-adherence`)
  "recommendation": "revert" | "modify" | "keep_with_concern",
  "classification": "design-debt" | "not-checkable",  // OPTIONAL — the design-conformance angle only; absent on every other finding. `design-debt` = correct code, stale/infeasible design (not a code fix); `not-checkable` = a runtime-behaviour assertion whose only checker is the e2e lane (informational). Both are excluded from the fix loop AND the convergence aggregate and folded into the review retro entry — never a code-fix demand (§ Loop on findings).
  "description": "<one-sentence reason>"
}
```

Persist the per-round JSON locally to
`.claude/review-logs/<dated-slug>/review-r<round>.json` (gitignored).
Diagnostic only — the repo audit trail is the aggregate summary in the
review-loop commit messages plus the `STATUS.md` notes.

### Severity rubric

- **HIGH** — must address or stop (Blocker).
- **MEDIUM** — must address OR record explicit dismissal rationale in the next
  commit message body (one line per dismissed MEDIUM, prefixed
  `dismissed-medium: <description> — <why>`).
- **LOW** — may dismiss silently; aggregate count goes in the review-loop
  commit message. Commit-message formats:
  - Convergence path: `review-r<N>: <H> HIGH, <M> MEDIUM addressed, <L> LOW noted — converged (early exit)`
  - Non-convergence round: `review-r<N>: <H> HIGH, <M> MEDIUM addressed, <L> LOW noted`
  - Blocker path: `review-r3: findings unresolved after 3 rounds — Blocker written`

### Loop on findings

1. Aggregate findings across angles, deduping by `<file>:<line_start>`. When two
   findings collide on that key, an **unclassified** finding (implementation drift, or any
   non-design-conformance angle) **wins** over a `classification`-carrying one — so a real
   fix is never masked by a co-located design-debt entry.

   **Classified design-conformance findings are pulled out here — before the convergence
   check and the fix loop.** A design-conformance finding carrying `classification:
   design-debt` or `classification: not-checkable` (§ Structured finding schema) is **not** a
   code-fix item: the code may be right and the design wrong or infeasible (`design-debt`), or
   the assertion's only checker is the e2e lane (`not-checkable`). Handle each as
   **dismissed-with-disposition** — add it to the accumulated dismissed set (keyed
   `<file>:<line_start>`, carried forward per the round-2 dismissed-findings carry-forward with
   its `classification`) so it counts toward **neither** the convergence HIGH/MEDIUM test (step 2)
   **nor** inline-fix / remediation-task routing (step 3). The **orchestrator** (sole retro
   writer) folds every classified finding into the review retro entry (§ Retrospective capture),
   surfacing the design-drift category words in the entry's bullets so `triage-retros` can
   cluster. A **material** (`HIGH`/`MEDIUM`, confirmed) `design-debt` finding additionally gets a
   `design.md` course-correction banner, written by the orchestrator per § Course corrections;
   `not-checkable` is informational only — no banner, and no backlog item by itself.

2. **Convergence check (early exit).** A round is **converged** when either
   sub-condition holds (OR logic):

   - **Sub-condition A (LOW-only round):** no HIGH and no MEDIUM among the
     round's aggregated findings (or no findings at all).
   - **Sub-condition B (subset-of-dismissed):** every HIGH/MEDIUM this round
     is already in the accumulated dismissed set from prior rounds, keyed by
     `<file>:<line_start>`. (Cannot fire at round 1 — the dismissed set is
     empty.)

   Evaluated from round 1 onward, entirely by the orchestrator from records in
   memory — no new reviewer output. When the tiebreaker runs (§ Tiebreaker),
   evaluate the predicate **after** tiebreaker resolution. Known cost: the
   line-keyed match can false-negative when a remediation shifts line numbers
   — at most one extra round.

   **When converged:** write
   `review: converged at round N (early exit — sub-condition <A|B>)` to
   `STATUS.md` (with the severity aggregate, e.g.
   `review-r2: 0 HIGH, 0 MEDIUM, 3 LOW — converged (early exit — sub-condition B)`),
   use the convergence-path commit format, note the early exit in the review
   retro entry, and proceed to `docs-sync`/`finalize` without another round.

3. For each non-dismissed HIGH/MEDIUM, decide **inline-fix** (small scoped
   change the orchestrator applies directly — lands as a single `review-fix:`
   commit) vs **remediation task** (anything larger — appended to `tasks.md`
   and routed through a fresh `implement-task` subagent).

4. Once fixes and remediation tasks are committed + pushed, **re-spawn the
   same reviewer angles** over the new cumulative diff. Bound the loop at
   **≤3 rounds**; findings remaining after round 3 → write the blocker to
   `STATUS.md` and surface to the human.

5. A round-1 pass with no HIGH/MEDIUM is simply sub-condition A — the step-2
   check handles it uniformly; there is no separate clean-exit rule.

### Session-limit fallback

If a reviewer crashes or returns empty mid-stream (session quota, sub-tool
timeout), do **not** silently skip that angle:

1. Record it in `STATUS.md` under the review row (e.g. `review-r1: behavior
   reviewer crashed mid-stream — orchestrator self-verified`).
2. The orchestrator self-verifies that angle from the cumulative diff. This is
   a deviation from the fresh-context guarantee — flag it explicitly in
   `STATUS.md`, the retro entry, and the PR description.
3. Continue the loop with the remaining angles' findings; do not re-spawn the
   crashed reviewer in the same round.

**Simultaneous-N crash (quota boundary).** When all fanned-out reviewers die
together — the signature of a global quota reset — do **not** self-verify all
N angles (that discards the entire fresh-context review at the worst moment).
Record `review-r<round>: all N reviewers crashed simultaneously (suspected
quota reset) — paused for re-spawn` in `STATUS.md`, **pause** (branch state is
durable — every task committed + pushed before review), and on resume
**degrade to sequential** spawning while quota state is unknown, so a reset
costs at most one angle.

### Tiebreaker on contradictions — fresh-context subagent

Two findings **contradict** when they share the same `file` AND overlapping
`line_start..line_end` AND incompatible `recommendation` values. Spawn a
fresh-context tiebreaker subagent with only the conflicting finding records,
the AC bullets, the diff lines in question, and the spec excerpt. Record its
choice in the review-loop commit message
(`tiebreaker: <file>:<line> — chose <recommendation> over <other>`).

**Tier:** its `ship-spec: review/tiebreaker` row in `MATERIA.md` § Tiers
§ Skill routing — resolve it through § Tier routing (availability per
`MATERIA.md` § Tiers § Model set).

## Merge watch (autopilot runs only)

On a non-autopilot run the pipeline ends where it always has: finalize opens
the PR and the human reviews and merges. On an autopilot run (§ Autopilot)
the orchestrator continues in its own lane after finalize returns (but if
`MATERIA.md` § Version control § Forge is `none`, autopilot cannot merge —
see step 7 first, before any watching):

1. **Flush the run record first.** Append the orchestrator self-review retro
   entry, set `Next: merge (autopilot)` in `STATUS.md`, note
   `auto-merge: watching PR #<n>` in § Notes, commit + push. The branch must
   carry the complete run record **before** any merge — nothing can land in
   the spec folder afterward without a new PR.
2. **Watch the PR.** Poll `gh pr checks <n>` and
   `gh pr view <n> --json mergeable,mergeStateStatus` in the foreground with
   explicit exit-code capture — the PR-status op, `MATERIA.md` § Version
   control § Forge (which routes the tool to its GitHub-MCP twin in a
   `gh`-less environment). Between polls, wait on the CI's actual cadence
   rather than spinning.
3. **CI failure** → read the failing job's log, fix on the branch, commit +
   push, re-watch. **≤3 fix rounds**; non-convergence →
   `Blocker: auto-merge — CI would not converge after 3 fix rounds
   (<failing check>)`, no merge, surface to the human.
4. **Merge conflict** (`mergeable: CONFLICTING`) → merge `<baseline>` into
   the branch — **never rebase, never force-push** — resolve (the
   `docs/specs/README.md` Index table is the recurring trivial conflict:
   keep both rows, per `finalize/SKILL.md`), re-run the local gate, push,
   re-watch. A conflict in product code this run didn't author gets a
   conservative resolution; if the safe resolution isn't obvious, write a
   `Blocker` instead of guessing.
5. **Merge.** When every check is green, the PR is mergeable, and no human
   has left review comments on it, merge through the **merge-PR op**
   (`MATERIA.md` § Version control § Forge), using the `<strategy>` from that
   section's **Merge strategy** knob when it names a concrete value — no
   merge-strategy row (or `per-skill default`) → this skill's default `merge`
   (a merge commit — matches this repo's history):

   ```bash
   gh pr merge <n> --merge --delete-branch
   ```

   Report the merge SHA to the operator in the final turn message.
6. **Never merge** over a `Blocker`, a red or pending check, or unresolved
   human PR comments — if the operator commented mid-run, stop and surface
   the comments instead. **Never merge while `MATERIA.md` § Gate carries the
   Bootstrap-grace marker** — green CI under grace can mean only `check:docs`
   ran; write `Blocker: auto-merge — bootstrap grace active (gates not yet
   real)` and surface to the human. Sole exception — verified
   **mechanically, both conditions**: this run's `STATUS.md` `Proposed-id`
   equals the proposal id named in the marker line itself, AND the PR diff
   deletes the marker while making every § Gate row real. A PR that merely
   deletes the marker line without being the named gate spec does not
   qualify. Autopilot's merge authority is exactly the
   operator's explicit `--auto` at invocation, nothing broader.
7. **No forge, no merge (`none`).** Checked before watching: this section
   exists only to poll checks and merge a PR through the forge, so when
   `MATERIA.md` § Version control § Forge is `none` there is no PR to watch
   or merge — yet `--auto` asked for one. Autopilot **cannot** merge here.
   Refuse the autopilot merge and degrade to the non-autopilot path:
   finalize has already opened/prepared the PR handoff (drafted title/body +
   branch for the operator), and the run stops there. Record why —
   `Blocker: auto-merge — no forge (§ Forge = none); nothing to watch or
   merge, PR handoff prepared for the operator` — and surface to the human.
   Never silently no-op the merge.

## Course corrections (mid-pipeline)

When a downstream stage exposes a decision an earlier stage got wrong, apply
the fix in place and re-flow the artifacts **asymmetrically**:

- **`spec.md` and `tasks.md` re-flow to reflect final reality** — they are the
  binding intent oracles for `docs-sync` and the reviewers; drift between them
  and shipped code becomes a finding.
- **`design.md` and `architecture.md` get a course-correction banner** if
  their prose lags — a short blockquote naming the decision flip, the reason,
  and the artifact that now carries the binding decision. Don't rewrite the
  historical prose; the banner cordons it off so intent-oracle passes don't
  flag stale-prose false positives. **The orchestrator writes the `design.md`
  banner** (the design stage isn't running post-approval) — a post-approval
  banner is a legal body write under § Design gate's frozen-audit-record
  scoping and **never** re-triggers the gate. A committed `design/` snapshot
  (when one exists) is frozen exactly like `design.md`'s pre-banner prose: the
  banner written into `design.md` is the reader's signal that the paired
  snapshot may now be visually stale. Course corrections **never** trigger a
  re-export — only a design-gate revision channel does (§ Gate-arrival sync);
  course corrections are post-approval and entirely outside that loop.
- **`retro.md` carries the original-decision story** — the entry where the
  wrong decision landed records what was decided and why; the entry where the
  correction landed records the flip and the fix.

**The active variant — a design bounce, not a banner.** When the downstream stage
is `architecture` and the artifact it contradicts is the **approved design**, the
correction is **not** a banner cordoning stale `design.md` prose — it routes
through the gate as an **architecture bounce** (§ Architecture hand-off; § Design
gate — Architecture bounce): architecture returns `design-revision-requested`, the
design is revised and **re-approved** rather than frozen-with-a-caveat, so the
gate the operator signs still describes what ships. This is not a parallel
mechanism — it is the same course-correction doctrine routed through the live
design stage. The banner path above still governs the cases the bounce cannot
reach: a correction discovered after the design stage can no longer be re-run
(post-implementation), or a non-design artifact. Revise-and-re-approve while the
design stage is still live; banner-cordon once it isn't.

## Retrospective capture (per-run `retro.md`)

This pipeline keeps a per-run retrospective at
`docs/specs/<dated-slug>/retro.md`. The orchestrator owns it end-to-end —
stages just respond when asked. The retro is the raw data `triage-retros`
later consumes to author project backlog items (proposed specs + bug reports).

**Sole-writer invariant:** the orchestrator is the **sole writer** of
`retro.md`. No subagent in any stage writes to or commits `retro.md` directly.
Every subagent returns its entry in a ` ```retro ` fenced block in its report;
the orchestrator parses, numbers, appends, and flushes.

### File and identity

- **Location:** `docs/specs/<dated-slug>/retro.md` (one per run, sibling to
  `spec.md` / `STATUS.md`).
- **Header (frontmatter):** `schema_version`, `slug`, `branch`, `started_at`,
  `finalized_at`, `status`. `schema_version` is informational — nothing
  hard-fails on a version difference. `status` moves through
  `running → completed | blocked | failed | aborted` and is rewritten on every
  flush so a partial file is always self-describing.
- **Created** by the orchestrator immediately after `intake` returns, seeded
  from `docs/specs/_templates/retro.md`. If intake fails partway but the
  folder exists, still create `retro.md` and record the failure as Entry 1.
- **Forward-compat:** resuming a folder that predates this feature (no
  `retro.md`) → create it at resume time and append from the resumed stage;
  note the absent earlier entries in the final self-review.
- **Commit + push** the retro update alongside each stage's `STATUS.md`
  commit so it's never local-only.

### Touchpoints

After every first-level subagent (`intake`, `design`, `ui-test-plan`,
`architecture`, `plan-tasks`, each `implement-task`, `docs-sync` per round,
`docs-audit` per round, `reconcile-epic` when the epic gate ran it,
`finalize`), the orchestrator:

1. **Asks** that subagent — via `spawn-contract.md` Block 2 in its spawn
   prompt — to return its retro entry in a ` ```retro ` fenced block as the
   final element of its report (opening fence exactly ` ```retro `, closing
   fence a bare ` ``` ` on its own line; body = the per-entry schema verbatim),
   stamped with the real wall-clock time, entry number left as the literal
   placeholder `N`. Reviewer subagents spawned for the review pass are
   summarized in the review/orchestrator entry — no separate touchpoint for
   nested units.
2. **Parses** the return for the ` ```retro ` … ` ``` ` block and **appends**
   it to `retro.md` (numbered, timestamped). Two mandatory, non-optional
   transformations on every serial append, neither dependent on subagent
   cooperation:
   - **Authoritative timestamp re-stamp:** stamp the entry's H2
     `<ISO timestamp>` with the real UTC wall-clock time at append, ignoring
     the subagent-supplied value (advisory only — subagents routinely emit the
     `…T00:00:00Z` placeholder despite the instruction). A missing re-stamp is
     a defect, not a shortcut. (Sole exception: a parallel batch, where
     § Parallel-batch ordering preserves each subagent's own timestamp by
     design.)
   - **Link scrub:** deterministically neutralize any literal
     bracket-then-paren markdown link the block carries — rewrite a `[text]`
     immediately followed by `(path)` occurrence (even inside backticks) to
     arrow/prose form (`text → path`) — so a quoted link can't re-introduce a
     `check:docs` failure inside `retro.md` (`check:docs` extracts links from
     inline code spans). Enforced here at append time, before any gate ever
     sees `retro.md`; it changes only link rendering, never the entry's
     schema, numbering, or `retro.md`/`retro.processed.md` naming.
3. **Flushes:** rewrites the header (`status`, latest timestamp), then
   commits + pushes.

### Delimiter extraction contract

Scan the subagent's returned text top-to-bottom; collect every line-anchored
` ```retro ` … ` ``` ` pair; the entry body is the text strictly between the
fences of the selected block.

**Edge-case rule table:**

| Condition | Rule | `Subagent return` field |
|---|---|---|
| Exactly one well-formed block | Use it verbatim; orchestrator replaces `N` with the assigned sequence number | `ok` |
| **Multiple ` ```retro ` blocks** | Use the **last** block (a subagent may have shown an earlier draft/example in prose; the last occurrence is the canonical final entry). Log one line in the **orchestrator's own** retro entry: "Multiple retro blocks found — used last." The chosen block is still schema-validated. | `ok` (if last block valid) / `malformed` (if last block invalid) |
| Zero blocks | Synthesize a degraded entry; all four sub-sections contain the single bullet "No retro block returned." | `empty` |
| Block found but schema-invalid (missing `## Entry`, or any required `- **Stage:**` / `- **Outcome:**` / `- **Subagent return:**` line, or any required `###` sub-section absent) | Synthesize a degraded entry; preserve the raw block verbatim under "Other signals" so nothing is discarded | `malformed` |
| Subagent crashed / no return | Synthesize a degraded entry noting the stage + crash signal (timeout, empty completion) | `crashed` |

A degraded entry is **always** written — the orchestrator never silently drops
a touchpoint. A degraded entry gets the correct `## Entry <N>` number, the
correct `<stage-id>`, the orchestrator's real wall-clock timestamp, and
`Outcome: partial` or `Outcome: failed` as appropriate.

### Parallel-batch ordering

When a batch of independent `implement-task` subagents runs in parallel
worktrees, the orchestrator:

1. **Collects all returns before appending any entry** (the batch join).
2. **Numbers in task/dependency order** — the order tasks appear in `tasks.md`,
   regardless of return order; `## Entry <N>` numbers are assigned after the
   join, starting at (last-existing-entry-number + 1).
3. **Preserves each subagent's own returned timestamp** — never re-stamps in a
   batch. An early-finishing T3 may carry an earlier timestamp than a
   higher-numbered T1 entry; expected (timestamp = when work happened; number
   = dependency-ordered append sequence).
4. **Writes a degraded entry in task order for any crashed/empty/malformed
   slot** — the batch append never has a gap.
5. **Commits once per batch flush**, not one commit per entry.

### Per-entry schema (pass this verbatim in every spawn prompt)

```markdown
## Entry <N> — <stage-id> — <ISO timestamp>

- **Stage:** <intake | design | ui-test-plan | architecture | plan-tasks | implement-task:T<n> | docs-sync | docs-audit | reconcile-epic | finalize | orchestrator (pipeline-level)>
- **Outcome:** ok | blocked | failed | partial
- **Subagent return:** ok          <!-- crashed | empty | malformed if synthesized -->

### What went well
- ...

### What could be improved
- ...

### Unexpected
- ...

### Other signals
- ...
```

What to ask each subagent to cover: **What went well** — what worked, what to
keep doing; **What could be improved** — friction, ambiguity, missing inputs,
slow steps, bad hand-offs; **Unexpected** — surprises mid-stage and how they
were handled; **Other signals** — anything else worth capturing (tool quirks,
doc gaps, schema drift, recurring patterns).

### Orchestrator self-review (final entry)

After `finalize` returns — or when the run ends for any other reason — the
orchestrator appends one final entry covering the **pipeline as a whole**: how
the stages sequenced and handed off, where the flow stalled or backtracked,
and what would make the orchestration more effective next time. Same schema,
marked `Stage: orchestrator (pipeline-level)`. Then set header
`status: completed` (or the failure status) and `finalized_at`, commit + push.

### Robustness — never silently drop a retro

Failed or partial runs are the highest-signal retros. Always flush `retro.md`
as it stands, with the failure noted:

- **Stage Blocker:** append the stage's entry with `Outcome: blocked`; defer
  the self-review until the blocker clears and the run resumes (it then covers
  the full arc). Set header `status: blocked`, commit + push, surface to the
  human.
- **Subagent crash / empty / malformed return:** write the degraded entry and
  continue the touchpoint loop; do not abandon the run.
- **Orchestrator-level error or human abort:** write a best-effort final
  pipeline-level entry capturing what's known, set header `status: failed` or
  `aborted`, commit + push if at all possible.

Because every per-stage entry is flushed when its stage completes, `retro.md`
is always a valid record of however far the run got.

### Scope

This skill only **writes** `retro.md`. It does not read or act on past retros
— `triage-retros` harvests them and authors their signal into the
project's backlog (proposed specs + bug reports).

## Guardrails (don't spin forever)

A stage or a review loop gets **a bounded number of attempts** (≈3). If it
can't converge — findings unresolved, or the finalize gate won't go green —
**stop**: write the blocker into `STATUS.md` (`Blocker:` + `Notes`), commit +
push, and surface it to the human. A paused run is fully resumable once the
blocker is cleared.

## Rules

- Keep `STATUS.md` and `tasks.md` statuses live and pushed — they are the
  resume state. Keep `retro.md` flushed + pushed after every touchpoint — it
  is the run's audit trail and the downstream aggregator's input.
- Every code change follows the standards + Definition of Done
  (`docs/contributing.md`); update docs in the same change.
- Never force-push the shared branch. Open exactly one PR (in finalize).
- If a stage contradicts the spec, stop and ask rather than guess.
