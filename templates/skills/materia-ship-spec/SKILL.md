---
name: materia-ship-spec
description: Run the full spec-to-PR pipeline for a new product spec or feature request — intake → design → architecture → task breakdown → autonomous implementation → post-implementation multi-angle review → lint/typecheck/test gate → docs → pull request. Supports `--auto` (autopilot): operator checkpoints accept grounded defaults, and after the PR opens the orchestrator watches CI, fixes failures, resolves merge conflicts, and merges once green. Captures a per-run retrospective (`retro.md`) at each touchpoint so a downstream skill can aggregate them into pipeline improvements. Resumable across sessions. Use when the user hands over a product spec or feature to build end-to-end.
---

# materia-ship-spec — the spec-to-ship orchestrator

Drives a feature from a raw spec to an open PR by running each stage **as its own
subagent** (clean, scoped context), persisting an artifact per stage so the run
is **resumable across sessions**. Mostly autonomous: clarifying questions happen
once during intake; otherwise it runs to a finished PR for human review.

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
`materia-intake-spec` for the full rule). Example:
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
3. Otherwise continue from there.
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
  CI-fix ≤3), skips a gate (e2e-coverage, screenshot-presence, epic,
  UI-surface, data-surface), force-pushes, or **merges under bootstrap
  grace** (§ Merge watch step 6 — graced CI is not green CI). Autopilot
  removes **waits**, not safety.

## Proposal selection (the run's entry point)

Every fresh invocation begins here (after the Resume gate has ruled out an
in-flight run). The shared intake surface at
[`docs/specs/_proposed/`](../../../docs/specs/_proposed/README.md) is the
default source; the freeform-spec path is the **ad-hoc fallback**.

### Inputs to dispatch on

| Input shape | Behavior |
|---|---|
| `/materia-ship-spec` (no args) | Enter the **menu** — list pending proposals and ask the operator to pick. |
| `/materia-ship-spec <id>` matching a frontmatter id under `docs/specs/_proposed/*.md` | Skip the menu, resolve to that proposal, advance. `Proposed-id-selection: named-arg` in STATUS.md. |
| `/materia-ship-spec <slug>` matching a Resume case | Handled by the Resume gate; never reaches selection. |
| `/materia-ship-spec` with a body of raw spec text | **Ad-hoc fallback** — treat the text as today's freeform spec. `Provenance` block filled with `—` so `materia-finalize` skips the dequeue. |

Precedence on ambiguity: an explicit `<id>` arg wins over any trailing text.

### Discovery

`git ls-files 'docs/specs/_proposed/*.md'` — top-level files only
(underscore-prefixed subdirectories are producer bookkeeping), **excluding
`README.md`**. Parse each frontmatter (§ Frontmatter parser) and validate
required fields (`id`, `title`, `source`, `date`, `status: proposed`;
`schema_version` informational). **Validate `id` against `^[a-z0-9]{4,8}$`**
— ids are interpolated into branch names, commit messages, and STATUS
fields, so a non-conforming one is dropped like a parse failure, never
"cleaned up". Drop files whose parse failed or whose
`status` isn't `proposed`, with a one-line warning each so the operator sees
why a file was skipped.

**In-flight pickup:** before printing the menu, scan `docs/specs/*-*/STATUS.md`
for `Proposed-id:` lines matching any pending proposal's `id`; mark those
proposals **`(in flight — docs/specs/<dated-slug>/)`** in the menu — picking
one re-enters the Resume gate rather than starting a parallel run.

**Empty queue** (zero pending unclaimed proposals AND no ad-hoc text): exit
cleanly — no branch, no files — telling the operator their options
(`/materia-suggestions-to-specs`, hand-write a proposal per
`docs/specs/_proposed/README.md`, or re-invoke with a freeform spec). End the
turn.

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
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md) to
`frontmatter.title` — it is **normative**; producers and this consumer must
agree on filenames.

### Mint the `<dated-slug>` and stake the claim

Proposal path only (the ad-hoc fallback defers minting to `materia-intake-spec`, which
fills the `## Provenance` block with `—`):

1. Mint `<dated-slug>` per `materia-intake-spec`'s rule.
2. Create branch `<type>/<slug>` off latest `main` (bare feature slug;
   `<type>` defaults to `feat`).
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
5. Commit: `ship-spec(intake): claim proposal <id> for spec <dated-slug>`
6. Push.

**Ad-hoc path — a distinct case, not covered by the numbered steps above:**
the ad-hoc fallback defers minting to `materia-intake-spec`, which seeds `STATUS.md`
straight from the template — a template whose `## Autopilot posture` defaults
to `off`. `materia-intake-spec` carries no posture-write logic of its own; the
orchestrator sets `## Autopilot posture` to `on` on its own first post-intake
`STATUS.md` commit when the invocation carried `--auto`.

### Spawn intake

In both paths the **input** to `materia-intake-spec` is the spec body (stripped
proposal body or freeform text). The proposal path additionally signals
`pre-created-folder: docs/specs/<dated-slug>/` so intake writes `spec.md` into
the existing folder and leaves the provenance lines read-only.

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
[`docs/specs/_templates/status.md` § Stages](../../../docs/specs/_templates/status.md).
`materia-design` (logical stage 2) and `materia-ui-test-plan` (logical stage 3) are
**UI-gated**: spawned only when the run is UI-affecting (§ Review —
§ UI-surface gate, **predictive form** — evaluated once after intake, one
decision covering both stages); on a non-UI run both are skipped and the
decisions recorded in `STATUS.md`, and `materia-architecture` works from `spec.md`
alone. `materia-reconcile-epic` is **epic-gated**: a
no-checkbox interstitial between docs-audit and finalize, spawned only when
the run's proposal is an epic member (§ Epic gate — reconcile-epic); on a
non-epic run it is skipped and the decision recorded in `STATUS.md`.

1. **intake** (`materia-intake-spec`) → `spec.md`. The only place to ask the human
   clarifying questions. Input per § Proposal selection — a proposal body
   (folder pre-staked) or ad-hoc freeform text (intake mints the folder).
2. **design** (`materia-design`) → `design.md` (**UI-gated** — the design stage is a
   UX artifact; a feature that ships no UI has nothing for it to design, and
   its technical planning belongs to `materia-architecture`).
3. **ui-test-plan** (`materia-ui-test-plan`) → `ui-test-plan.md` (**UI-gated**). Reads
   `spec.md` + `design.md`, enumerates the UI flows worth guarding;
   `materia-plan-tasks` consumes it to derive the e2e-authoring task.
4. **architecture** (`materia-architecture`) → `architecture.md` (docs read order;
   reuse existing resources; on a non-UI run it also owns the operator-surface
   enumeration `materia-design` would otherwise carry — see
   `materia-architecture/SKILL.md` § Non-product features).
5. **plan-tasks** (`materia-plan-tasks`) → `tasks.md` (dependency-ordered; each task
   tagged with a docs-scope floor and a `Model/effort` tier).
6. **implement** (`materia-implement-task`, once per task, dependency order;
   independent tasks in parallel). Each task commits its own work and ticks
   `tasks.md`. **No per-task adversarial review** — implementers build to the
   standards and leave the local gate green. Tasks add themselves to
   `behavior-deferred:` when any AC is user-visible.
7. **review** (orchestrator-spawned, post-implementation). After every task in
   `tasks.md` is `[x]`, spawn the multi-angle adversarial review **once** over
   the cumulative branch diff, then loop on findings until clean. See § Review.
8. **docs-sync** (`materia-docs-sync`) → edit pass: touch-X→update-Y matrix,
   intent-oracle rules, cross-cutting doc updates; commits doc edits.
9. **docs-audit** (`materia-docs-audit`) → verify pass; returns HIGH/MEDIUM/LOW or a
   clean verdict. **Orchestrator-managed loop:** on HIGH/MEDIUM findings,
   re-spawn `materia-docs-sync` with findings appended, then re-spawn `materia-docs-audit`;
   **bound ≤2 rounds**; on non-convergence write `Blocker` and stop. *(This is
   the authoritative statement of the loop: `clean` → finalize; `has-findings`
   (round < 2) → re-spawn docs-sync; `non-convergence-blocker` (round 2
   exhausted) → Blocker.)*
10. **finalize** (`materia-finalize`) → behavior re-check, gate, dequeue, PR;
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
  `materia-finalize`.
- **Negative:** record `reconcile-epic: skipped (non-epic)` in `STATUS.md`
  § Notes and continue to finalize. No retro touchpoint for a skipped gate.
- **Positive:** spawn `materia-reconcile-epic` in **pipeline mode** (its row
  in `MATERIA.md` § Tiers § Skill routing; spawn-contract Blocks 1 + 2),
  passing: the
  `<dated-slug>`, the `Epic-id`, and the pipeline-mode input line from
  `materia-reconcile-epic/SKILL.md` § Pipeline mode. The stage edits the epic folder
  under `docs/epics/` and the epic's still-pending member proposals under
  `docs/specs/_proposed/`, committing on the run's branch — no branch, PR, or
  operator checkpoint of its own (the run's PR is the review gate; the stage
  cascades conservatively and surfaces anything uncertain as notes for the PR
  body). Then record
  `reconcile-epic: ran (epic <id> synced; <n> pending members cascaded)` in
  § Notes and run the retro touchpoint.
- **Failure (degrade, don't block):** retry a crashed/empty return once; on
  a second failure record
  `reconcile-epic: failed — run /materia-reconcile-epic <epic-id> standalone after
  merge` in § Notes, instruct finalize to carry the same line into the PR
  body, and continue — a missed epic sync is recoverable by the standalone
  skill; a blocked member PR is worse.
- **Consistency:** the stage marks this run's member `shipped` in the epic's
  table because the edit only lands if this run's PR merges — merge makes it
  true; a closed PR lands neither the member nor the sync.

## Intake hand-off (`partial` outcome)

`materia-intake-spec` returns one of two outcomes:

- **`ok`** — intake asked the clarifying questions via `AskUserQuestion` and
  the operator answered. Proceed directly to `materia-design`.
- **`partial`** — `AskUserQuestion` was unavailable (the common case for a
  spawned intake), so intake ran in Auto Mode: it baked grounded defaults into
  `spec.md` and surfaced every default + alternative under "Open questions".
  **Operator confirmation is required before spawning `materia-design`.**

On `partial`, the orchestrator: (1) reads `spec.md`'s "Open questions";
(2) surfaces every question to the human — `AskUserQuestion` if available,
otherwise an end-of-turn prompt listing every default + alternative — and does
not spawn `materia-design` until the operator has had the chance to flip any default;
(3) folds the answers back into `spec.md` (removing resolved bullets);
(4) commits + pushes before spawning `materia-design`. Defaults baked in Auto Mode are
*always* surfaced before downstream stages build on them.

**Autopilot exception.** On an autopilot run (§ Autopilot) the orchestrator
does not pause on `partial`: it accepts intake's baked defaults as-is, records
`autopilot: intake defaults accepted without operator checkpoint (see spec.md
§ Open questions)` in `STATUS.md` § Notes, and proceeds to the next stage. The
"Open questions" section stays in `spec.md` as the audit record of what was
assumed — the PR reviewer reads it there.

## Tier routing

Every `Agent` spawn (stage, task, reviewer) is dispatched at a declared
model + effort tier. Vocabulary, model availability, fallback, and coercion:
`MATERIA.md` § Tiers. At each spawn point:

1. **Read** the unit's tier — stage/sub-skill → its row in `MATERIA.md`
   § Tiers § Skill routing (the **Default** row if unlisted); task → its
   `Model/effort` field in `tasks.md` (dynamic; drawn from § Model set; an
   **absent** field takes the § Skill routing **Default** row, `opus/high`, not
   the `materia-implement-task` row); a **canonical** review angle → its
   `ship-spec: review/<angle>` row in § Skill routing; a **repo-specific**
   review angle (appended from `MATERIA.md` § Review angles) → its own `Tier`
   column in that table, the one class of spawned unit not routed through
   § Skill routing; the review-loop tiebreaker → its `ship-spec:
   review/tiebreaker` row. An explicit operator override wins; record
   `tier-override: <unit> <artifact-value> → <operator-value>`.
2. **Resolve availability** against `MATERIA.md` § Tiers § Model set: a
   `default` model resolves as declared; an `opt-in` model resolves only when
   the operator has enabled it (a per-run instruction recorded in `STATUS.md`
   § Notes, or the availability cell flipped to `default`), otherwise coerce
   to the fallback with `tier-fallback: <unit> <tier> → <fallback> (not
   enabled)`; a model absent from the table coerces the same way (reason
   `not in model set`).
3. **Map** `<model>/<effort>` → `(model, effortSentence)` per `MATERIA.md`
   § Tiers § Effort set.
4. **Spawn** `Agent(..., model: <model>)` with the effort sentence prepended
   to the prompt. Record the resolved tier per spawn for the retro.

**Fallback:** a resolved model that is malformed / not-enabled / out-of-table /
`Agent`-rejected coerces to the unit's own **Fallback Model** — the
`Fallback Model` column of its row in `MATERIA.md` § Tiers § Skill routing
(the **Default** row's fallback for a unit with no row of its own), run at the
unit's own effort — per `MATERIA.md` § Tiers § Fallback, with the standard
one-line note. (A wholly **absent** per-task `Model/effort` field is not a
coercion — it takes the Default row directly, per step 1.) An `Agent` call that
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
preflight — see `materia-finalize/SKILL.md` § Procedure's docs/skills-only gate
profile.

## STATUS.md ownership (orchestrator lane)

Every stage skill's persist step ticks `STATUS.md` and commits **by default** —
that is the contract for standalone use. **When a stage runs in the
orchestrator lane** (spawned by `materia-ship-spec`), that default is **superseded**:
the orchestrator owns `STATUS.md` and the run's commits; the spawned stage must
**not** touch `STATUS.md` or commit it. The orchestrator ticks the stage row,
sets `Next`, and commits + pushes after the stage returns. This precedence is
part of `spawn-contract.md` Block 1 — pass it into every spawn. In particular
it **supersedes `materia-implement-task/SKILL.md` Procedure step 6's default
`STATUS.md` tick** — a spawned implementer ticks only its own `tasks.md` AC
boxes and leaves `STATUS.md` (and `retro.md`) to the orchestrator.

## Fresh-context reviewer spawning

In this environment, subagents **cannot spawn further subagents**. Any
fresh-context reviewer this pipeline mandates is therefore
**orchestrator-spawned**, never subagent-spawned:

- **Post-implementation review reviewers** — spawned by `materia-ship-spec` after
  every task is `[x]`, over the cumulative branch diff. Implementers do not
  run review inside `materia-implement-task`. See § Review.
- **`materia-docs-sync` edit-pass subagent** — spawned by `materia-ship-spec` after the review
  loop exits clean.
- **`materia-docs-audit` verify-pass subagent** — spawned by `materia-ship-spec` after each
  `materia-docs-sync` round. **Never spawned by `materia-docs-sync` itself** — the
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
  fresh `materia-implement-task` over the same task is idempotent against an
  already-committed partial).
- **Implementers must not self-fan-out** — enforced in
  `materia-implement-task/SKILL.md`; a delegating implementer is itself a stall risk.
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

After every task in `tasks.md` is `[x]`, before `materia-finalize`. Compute the
baseline against **`origin/main`, not local `main`** (a stale local `main`
yields a phantom diff):
`git fetch origin main && git merge-base HEAD origin/main`, review over
`git diff <baseline>...HEAD`.

### Reviewer fan-out

Spawn these as a single message, one `Agent` call per angle, each at its tier
resolved through § Tier routing with `spawn-contract.md` Blocks 1 + 3. Each
angle's tier is the matching `ship-spec: review/<angle>` row in `MATERIA.md`
§ Tiers § Skill routing (angle slugs `correctness`, `security`,
`spec-adherence`, `behavior`, `ui`, `data-safety`). One conditional override:
on the markdown-only exemption path the spec-adherence angle drops to a reduced
tier — the **Markdown-only exemption** paragraph below carries the binding
value.

| # | Angle | How |
|---|---|---|
| 1 | Correctness + simplicity + test-coverage | invoke the `code-review` skill if the session provides it; otherwise run the same angle inline (covers test coverage in practice). Explicit sub-mandates: **test quality** (a test that asserts nothing, or mocks the unit under test, is a finding), plus the repo-specific correctness invariants named in `MATERIA.md` § Review angles and the standards docs the tasks cite |
| 2 | Security | invoke the `security-review` skill if the session provides it; otherwise run the same angle inline |
| 3 | Spec-adherence + regression/blast-radius | Agent: verifies each AC literally across `tasks.md`, flags AC bullets that under-cover `spec.md`, identifies callers/dependents of changed exports, and checks regression by reading the pre-branch state via `git show <baseline>:<path>` |
| 4 | Behavior | invoke the `verify` skill over the merged branch — covers every task in `behavior-deferred:` and any user-visible AC across the diff |
| 5 | UI (UI-gated) | invoke the `materia-ui-review` skill — an Eyes pass (`MATERIA.md` § Eyes: toolchain + canonical viewport) judged against the repo's visual standards docs **plus the cross-screen cohesion comparison** against the sibling screens named in `design.md` § Cohesion anchors. **Spawned only when the diff is UI-affecting** per § UI-surface gate; its committed `ui-proof/` screenshots are a mandatory deliverable checked by § Screenshot-presence check |
| 6 | Data-safety (data-gated) | Agent: reviews the data-layer diff for **destructive migration operations** against existing data (dropped/narrowed columns, table drops), **seed idempotency** (re-seeding preserves user-entered values), **unique indexes backing every upsert**, and the repo-specific invariants in `MATERIA.md` § Data layer. **Spawned only when the diff is data-affecting** per § Data-surface gate |

**Skill availability.** Only `materia-ui-review` ships under `.claude/skills/`;
`code-review` and `security-review` are harness-provided and may be absent
from a given session. When a named skill is unavailable, running that angle
inline is the documented procedure — not a deviation to record.

**Repo-specific angles (`MATERIA.md` § Review angles).** After the standard
rows, append **one reviewer per row** of `MATERIA.md` § Review angles (none
when that section is `none`). Evaluate each row's Gate column the way the
UI/data gates are evaluated — over the cumulative diff, decision recorded in
`STATUS.md` (`<angle>-review: skipped (<reason>)` on a negative). Spawn at
the row's Tier (§ Tier routing) with spawn-contract Blocks 1 + 3, briefing
the reviewer with the row's "What it checks" text plus the standards docs it
names. Findings use `category: "<angle>"` (kebab-case row name) and flow
through the same remediation loop, severity rubric, convergence check, and
session-limit fallback as every standard angle. The markdown-only exemption
and trivial-diff collapse apply to these angles too.

**Orchestrator-lane review angles.** The behavior (#4) and ui-review (#5)
angles MAY run inline in the orchestrator lane when they require a long-lived
server stack (database + Eyes toolchain + dev server), mirroring § Orchestrator
behavioral-verify lane — a standing contract, not a per-run deviation. The
orchestrator records the lane decision and the fresh-context deviation in
`STATUS.md`, the review retro entry, and the PR body.

**Markdown-only exemption.** If the cumulative diff contains no source-code
changes (no changed file outside markdown/docs) and no test additions, skip
the correctness / security / behavior reviewers — the spec-adherence reviewer
runs alone, **spawned at `haiku/low`** (this path's binding tier; the
`ship-spec: review/spec-adherence` row in `MATERIA.md` § Tiers § Skill routing
records the drop). (The data-safety angle still runs when its own gate is
positive — a seed-data-only diff can be markdown-exempt but data-affecting.)

**Trivial-diff threshold.** When the diff *does* touch source but is trivially
small — roughly **≤ 10 changed lines**, pure presentation/mechanical (copy
tweak, class change, constant rename), no new control flow, no new
exported surface, no test additions — collapse the fan-out to the
**spec-adherence angle alone**. If in any doubt, run the full fan-out; record
the collapse decision (and line count) in `STATUS.md`.

### UI-surface gate

The **single canonical definition** of "UI-affecting" — the positive
predicate that gates the `materia-design` + `materia-ui-test-plan` stages and the `materia-ui-review`
angle (sibling to the Markdown-only exemption, which is the inverse
predicate). The sub-skills reference this gate **by section name**; nothing
re-states the pattern list.

A diff is **UI-affecting** when `git diff <baseline>...HEAD --name-only`
matches the UI-affecting pattern list in `MATERIA.md` § Surface gates
(§ UI-affecting). When that section is `none`, every UI-gate decision in
this pipeline is negative by definition.

**Two evaluation forms.** Post-implementation evaluations (the review
fan-out, finalize's e2e-coverage and UI-proof gates) use the diff predicate
above literally. Pre-implementation evaluations — the `materia-design` and
`materia-ui-test-plan` stage gates, which run before any product diff exists — use
the **predictive form**: would the feature described in `spec.md` add or
change any screen, page, component, or `composables/ui/` hook such that the
eventual diff matches the patterns above? Evaluate the predictive form
**once, after intake** — one decision gating both stages. When in doubt,
treat the run as UI-affecting: a wasted design pass is cheaper than an
undesigned UI change.

The **orchestrator** evaluates this gate — the predictive form after intake
(gating `materia-design` + `materia-ui-test-plan`) and the diff form again **before the
review fan-out** (over the cumulative diff) — and records each decision in
`STATUS.md`. On a non-UI run it skips `materia-design` and `materia-ui-test-plan` and omits
the `materia-ui-review` angle, noting `design: skipped (non-UI — <reason>)`,
`ui-test-plan: skipped (non-UI — <reason>)`, and
`ui-review: skipped (non-UI — <reason>)`. When positive, `materia-ui-review`'s
findings flow through the same remediation loop and re-spawn across the
≤3-round bound; non-convergence writes a `Blocker` exactly as § Loop on
findings prescribes.

### Data-surface gate

The positive predicate that gates the data-safety angle (#6). A diff is
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
deliverable**, not a best-effort by-product of `materia-ui-review`. After the
`materia-ui-review` angle returns (each round it ran), the orchestrator verifies that
`docs/specs/<dated-slug>/ui-proof/` contains at least one committed PNG.

- **PNGs present** → note `ui-proof: <n> screenshots committed` in
  `STATUS.md` § Notes and continue.
- **Empty, with a recorded reason** (the exact eyes-instability line, or a
  `ui-proof: capture failed — <reason>` note written by `materia-ui-review`) →
  continue; finalize renders the degraded note from that reason.
- **Empty, with NO recorded reason** → treat as a reviewer contract
  violation, not a degrade: run a **recapture in the orchestrator lane**
  (provision per `resources/env-preflight.md`, drive the changed screens, capture
  at minimum each changed screen's ready state, commit to `ui-proof/` with
  the same `<flow>-<state>.png` naming). Only if the recapture itself fails
  may the run proceed — and then only after writing
  `ui-proof: capture failed — <reason>` to `STATUS.md` § Notes, because
  `materia-finalize` **blocks** on an empty `ui-proof/` that has no recorded reason
  (see `materia-finalize/SKILL.md` § Procedure step 4).

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
  "category": "correctness" | "security" | "spec-adherence" | "regression" | "behavior" | "coverage" | "simplicity" | "ui" | "data-safety" | "<repo-specific angle>",  // kebab-case row name from MATERIA.md § Review angles
  "recommendation": "revert" | "modify" | "keep_with_concern",
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

1. Aggregate findings across angles, deduping by `<file>:<line_start>`.

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
   retro entry, and proceed to `materia-docs-sync`/`materia-finalize` without another round.

3. For each non-dismissed HIGH/MEDIUM, decide **inline-fix** (small scoped
   change the orchestrator applies directly — lands as a single `review-fix:`
   commit) vs **remediation task** (anything larger — appended to `tasks.md`
   and routed through a fresh `materia-implement-task` subagent).

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
the orchestrator continues in its own lane after finalize returns:

1. **Flush the run record first.** Append the orchestrator self-review retro
   entry, set `Next: merge (autopilot)` in `STATUS.md`, note
   `auto-merge: watching PR #<n>` in § Notes, commit + push. The branch must
   carry the complete run record **before** any merge — nothing can land in
   the spec folder afterward without a new PR.
2. **Watch the PR.** Poll `gh pr checks <n>` and
   `gh pr view <n> --json mergeable,mergeStateStatus` in the foreground with
   explicit exit-code capture (GitHub MCP equivalents in the remote
   environment). Between polls, wait on the CI's actual cadence rather than
   spinning.
3. **CI failure** → read the failing job's log, fix on the branch, commit +
   push, re-watch. **≤3 fix rounds**; non-convergence →
   `Blocker: auto-merge — CI would not converge after 3 fix rounds
   (<failing check>)`, no merge, surface to the human.
4. **Merge conflict** (`mergeable: CONFLICTING`) → merge `origin/main` into
   the branch — **never rebase, never force-push** — resolve (the
   `docs/specs/README.md` Index table is the recurring trivial conflict:
   keep both rows, per `materia-finalize/SKILL.md`), re-run the local gate, push,
   re-watch. A conflict in product code this run didn't author gets a
   conservative resolution; if the safe resolution isn't obvious, write a
   `Blocker` instead of guessing.
5. **Merge.** When every check is green, the PR is mergeable, and no human
   has left review comments on it: `gh pr merge <n> --merge --delete-branch`
   (a merge commit — matches this repo's history). Report the merge SHA to
   the operator in the final turn message.
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

## Course corrections (mid-pipeline)

When a downstream stage exposes a decision an earlier stage got wrong, apply
the fix in place and re-flow the artifacts **asymmetrically**:

- **`spec.md` and `tasks.md` re-flow to reflect final reality** — they are the
  binding intent oracles for `materia-docs-sync` and the reviewers; drift between them
  and shipped code becomes a finding.
- **`design.md` and `architecture.md` get a course-correction banner** if
  their prose lags — a short blockquote naming the decision flip, the reason,
  and the artifact that now carries the binding decision. Don't rewrite the
  historical prose; the banner cordons it off so intent-oracle passes don't
  flag stale-prose false positives.
- **`retro.md` carries the original-decision story** — the entry where the
  wrong decision landed records what was decided and why; the entry where the
  correction landed records the flip and the fix.

## Retrospective capture (per-run `retro.md`)

This pipeline keeps a per-run retrospective at
`docs/specs/<dated-slug>/retro.md`. The orchestrator owns it end-to-end —
stages just respond when asked. The retro is the raw data `materia-triage-retros`
later consumes to propose improvements to this pipeline.

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

After every first-level subagent (`intake`, `materia-design`, `materia-architecture`,
`materia-plan-tasks`, each `materia-implement-task`, `materia-docs-sync` per round, `materia-docs-audit` per
round, `materia-reconcile-epic` when the epic gate ran it, `materia-finalize`), the
orchestrator:

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

When a batch of independent `materia-implement-task` subagents runs in parallel
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

- **Stage:** <intake | design | architecture | plan-tasks | implement-task:T<n> | docs-sync | docs-audit | reconcile-epic | finalize>
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

After `materia-finalize` returns — or when the run ends for any other reason — the
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
— `materia-triage-retros` aggregates them and `materia-apply-pipeline-improvements` applies
the resulting plan.

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
