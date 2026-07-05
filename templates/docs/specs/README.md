# Specs & the spec-to-ship pipeline

Each feature gets its own **timestamped folder** here, named

```
docs/specs/<yyyy-mm-dd>-<rand>-<slug>/
```

— today's date, a fresh 6-character base36 token (e.g. `ab24f9`), and a
short kebab-case feature slug. Example:
`docs/specs/2026-06-13-ab24f9-lift-feeling/`. This makes every spec folder
globally unique and chronologically sortable, even when two features share a
slug. The bare `<slug>` is still used for the branch name (e.g. `lift-feeling`);
the full dated form is used everywhere a path is written.

Each folder holds the artifacts the pipeline produces, in order:

```
docs/specs/<yyyy-mm-dd>-<rand>-<slug>/
  STATUS.md        ← resumable pipeline state (stages done, next stage/task, blocker, PR, ## Provenance block)
  spec.md          ← what & why (problem, users, acceptance criteria)
  design.md        ← UX flows, screens, states (UI-gated — absent on non-UI runs)
  architecture.md  ← technical plan, grounded in docs/ (reuses existing resources)
  tasks.md         ← dependency-ordered tasks with acceptance criteria
  retro.md         ← per-run retrospective; appended after each stage + orchestrator self-review (see ship-spec skill)
```

Templates live in [`_templates/`](_templates/). They're filled in by the
pipeline skills (`.claude/skills/`), but you can write any of them by hand too.

**Where a run starts.** `ship-spec`'s entry point is the proposed-specs
queue at [`_proposed/`](_proposed/README.md) (see § Proposed specs below).
On a fresh invocation, `ship-spec` lists pending proposals; the operator
picks one by `id`. The selected proposal's body becomes the spec input,
and `finalize` includes the proposal's `git rm` in the same PR — closing
the queue → ship loop. An **ad-hoc** fallback path remains: the operator
can paste a freeform spec instead of picking from the queue, in which case
the `## Provenance` block is filled with `—` and no dequeue happens.

## The pipeline (`.claude/skills/`)

Stage skills, chained by the `ship-spec` orchestrator. Configured to run **mostly
autonomously**: clarifying questions are asked once during intake, then it runs
through to a finished PR for you to review. Invoking with `--auto` (autopilot)
goes further: checkpoints accept grounded defaults, and after the PR opens the
orchestrator watches CI, fixes failures, resolves merge conflicts, and merges
once green — see the ship-spec skill's Autopilot + Merge watch sections.

| Stage | Skill | Produces |
|---|---|---|
| 1. Intake | `intake-spec` | `spec.md` (asks clarifying questions) |
| 2. Design | `design` | `design.md` (UI-gated; skipped+recorded if non-UI) |
| 3. UI-test-plan | `ui-test-plan` | `ui-test-plan.md` (UI-gated; skipped+recorded if non-UI) |
| 4. Architecture | `architecture` | `architecture.md` (reads `docs/`, reuses resources; on non-UI runs also carries the operator-surface enumeration design would) |
| 5. Plan | `plan-tasks` | `tasks.md` |
| 6. Implement | `implement-task` | code + tests per task (no per-task review — see row 7) |
| 7. Review | — (orchestrator-spawned review fan-out) | correctness · security · spec-adherence+regression · behavior · ui (UI-gated) · data-safety (data-gated); remediation tasks loop back; UI runs must land committed `ui-proof/` screenshots (screenshot-presence check) |
| 8. docs-sync | `docs-sync` | doc edits committed (cross-cutting docs reconciled under intent-oracle rules) |
| 9. docs-audit | `docs-audit` | HIGH/MEDIUM/LOW findings or clean verdict; loop back to docs-sync on HIGH/MEDIUM |
| 9½. reconcile-epic | `reconcile-epic` | **epic-gated** (spawned only when the proposal carries an `epic:` key; skipped+recorded otherwise): syncs the member's epic under [`docs/epics/`](../epics/README.md) and cascades invalidated content into its pending sibling proposals — the edits ride this run's PR |
| 10. Finalize | `finalize` | re-runs `verify` for `behavior-deferred` tasks, then the gate (lint + typecheck + tests + `check:docs`), PR opened |
| — Orchestrate | `ship-spec` | runs 1→10 (and, on `--auto` runs, the post-finalize merge watch: CI fixes → conflict resolution → merge on green) |

The pipeline **builds on this repo's docs system**: the architecture stage uses
the progressive-disclosure read order ([../README.md](../README.md)), the
implement stage follows the standards + Definition of Done
([../contributing.md](../contributing.md)), and finalize runs the same gates CI
does.

## Closing the loop — `triage-retros` + `apply-pipeline-improvements` (sibling skills)

Two separate, manually-invoked skills consume the `retro.md` files that
ship-spec captures and fold their signal back into the pipeline skills
themselves. They are **not** pipeline stages — they run after a stretch of
ship-spec runs. The loop is split in two so plan-drafting and plan-execution are
decoupled (and so the executor runs disjoint from `suggestions-to-specs`):

| Skill | Produces |
|---|---|
| `triage-retros` (planner) | `docs/specs/_improvements/<dated-slug>/pipeline-improvements.md` (+ sibling `product-suggestions.md` for codebase/product improvements; + always-emitted `pipeline-health.md` rollup that accumulates as corpus and is never consumed; + `bug-reports.md` gather hand-off when bugs were found — `bugs-to-reports` files them); renames each consumed `retro.md` → `retro.processed.md` across both `docs/specs/**/` and `docs/bugs/**/`; opens exactly one PR (no auto-merge). Performs three-way triage on retro signal (pipeline findings / product improvements / bugs). It **stops at the artifacts**. |
| `bugs-to-reports` (bug-queue producer) | Reads gathered `bug-reports.md` hand-offs from `docs/specs/_improvements/**/`; drafts conformant 13-section bug-report files; on approve writes them into `docs/bugs/_reports/` and renames each consumed `bug-reports.md` → `bug-reports.processed.md`; opens one PR per run (no auto-merge). |
| `apply-pipeline-improvements` (executor) | Globs unprocessed `pipeline-improvements.md` files, builds a dimension-tagged candidate set from each plan's `## Actions`, runs a keep–supersede–conflict Pareto selection pass (surfacing conflicts to the operator before any edits land), applies the selected deltas to the pipeline skills (fresh-context-reviewed), opens one PR per plan (no auto-merge), and renames the consumed plan → `pipeline-improvements.processed.md` in the same PR. Idempotent via the rename. |

The improvements tree (`docs/specs/_improvements/`) is a sibling to feature
spec folders and `_templates/`; its `README.md` is seeded by the first run of
the planner (no infrastructure pre-commit). See
[../../.claude/skills/triage-retros/SKILL.md](../../.claude/skills/triage-retros/SKILL.md)
(planner) and
[../../.claude/skills/apply-pipeline-improvements/SKILL.md](../../.claude/skills/apply-pipeline-improvements/SKILL.md)
(executor) for the full procedures.

## Bug reports — sibling queue

A separate `docs/bugs/` tree (queue at [`docs/bugs/_reports/`](../bugs/_reports/README.md),
overview at [`docs/bugs/README.md`](../bugs/README.md)) mirrors this one for
bug reports. Producers that write into the queue: `/report-bug` (operator-described bugs),
`/bugs-to-reports` (files the gathered `bug-reports.md` hand-offs that `triage-retros`
emits), `/exception-triage` (triages the Sentry inbox and writes conformant reports for
issues the operator approves), and `/ui-inspection` (drives the live app
across the full surface-map and files one consolidated checklist bug report).
`/fix-bug` is the consumer that drives a report through reproduce-bug (RED gate)
→ bug-analysis → plan-tasks → implement → review → docs-sync ⇄ docs-audit →
finalize (dequeue), opening one PR at terminal state.

## Proposed specs — the shared intake queue (`suggestions-to-specs`, `propose-spec`, and future producers)

[`docs/specs/_proposed/`](_proposed/README.md) is a **shared intake surface**
where proposed specs from any source land for operator review. It is a
**transient queue** — files at the top level are pending proposals; once a
proposal is reviewed it reaches a terminal state (run through `ship-spec`, or
deleted as rejected) and is removed from the directory. The directory should
trend toward empty.

The frontmatter contract (`id`, `source`, `source_refs`, `title`, `date`,
`status: proposed`) and the filename pattern
(`<YYYY-MM-DD>-<id>-<slug>.md`, matching the `<yyyy-mm-dd>-<rand>-<slug>`
shape used by spec and improvement folders) are documented in
[`_proposed/README.md`](_proposed/README.md). Any producer that drops a file
there MUST conform; any consumer that reads from there MAY rely on it.

| Skill | Source key | Produces |
|---|---|---|
| `suggestions-to-specs` | `retro-suggestions` | Drafts proposed specs from `docs/specs/_improvements/**/product-suggestions.md`, presents them for approval, then on approve writes the file(s), renames each consumed `product-suggestions.md` → `product-suggestions.processed.md`, and opens a single PR (no auto-merge). |
| `propose-spec` | `user-proposed` | Drafts proposed specs from the user's raw idea via in-conversation Q&A; splits sprawling ideas into separate single-shippable-unit proposals. Q&A is in-memory; on approve it branches, writes the file(s), commits, and opens a PR. |
| `logs-to-specs` | `log-triage` | Triages the running app's container logs (`docker compose logs`) into bug proposals — cross-checking each log signature against the working tree to filter stale-cache noise — and snapshots the supporting log excerpts under `_proposed/_log-triage/` for durable provenance. Fully autonomous: writes proposals and opens one PR (the review gate). |
| `propose-epic` | `epic` | Develops the operator's large multi-spec idea into an epic under [`docs/epics/`](../epics/README.md) (iterative brainstorm Q&A + a parallel low-tier web-research fan-out), then decomposes it into 2–N member proposals wired by a `depends_on` dependency graph — epic folder + members land in one PR. When a member is later shipped, `ship-spec`'s epic gate spawns the sibling `reconcile-epic` skill (pipeline mode) to sync the epic from as-built reality and cascade changes into the remaining pending members inside the member's own PR; standalone `/reconcile-epic` is the backstop. |

See [../../.claude/skills/suggestions-to-specs/SKILL.md](../../.claude/skills/suggestions-to-specs/SKILL.md),
[../../.claude/skills/propose-spec/SKILL.md](../../.claude/skills/propose-spec/SKILL.md),
[../../.claude/skills/logs-to-specs/SKILL.md](../../.claude/skills/logs-to-specs/SKILL.md),
and [../../.claude/skills/propose-epic/SKILL.md](../../.claude/skills/propose-epic/SKILL.md)
for the full procedures. Epics themselves (the parent initiative documents,
their member-linkage contract, and the `reconcile-epic` cascade lifecycle)
live in the sibling tree at [`docs/epics/`](../epics/README.md). New producers (market-research, user-feedback, etc.)
add themselves to the table in [`_proposed/README.md`](_proposed/README.md), and
follow the skill-authoring conventions in
[../standards/skills.md](../standards/skills.md).

## Resumable, run by subagents

- **Every stage runs as its own subagent** with only its inputs (the prior
  artifacts) in context — `ship-spec` spawns them. Each skill declares its
  **Inputs / Outputs**. Independent implementation tasks run as parallel,
  worktree-isolated subagents.
- **Reviewers, `docs-sync`, and `docs-audit` all run as fresh-context subagents spawned by the orchestrator.** The review angles run once, post-implementation, over the cumulative branch diff — each angle its own subagent (no anchoring on the implementers' reasoning). `docs-sync` (edit) and `docs-audit` (verify) are sibling stages between review and finalize. Each receives only its declared inputs (diff + AC + named docs + `spec.md`) — never the producing agent's commit messages, `STATUS.md`, or other reviewers' outputs.
- **Every stage commits + pushes** its artifact and updates `STATUS.md` as it
  finishes, so a fresh session can pull and continue.
- **Resume:** re-invoking `ship-spec` reads `STATUS.md`, finds the first
  incomplete stage/task, and continues — it never restarts.
- **Guardrails:** an autonomous loop (a task's review, or the finalize gate) is
  bounded to ~3 rounds; it exits early when findings converge (a LOW-only round,
  or HIGH/MEDIUM already dismissed) before reaching the bound. If it can't
  converge it writes a `Blocker` into `STATUS.md` and stops for a human, rather
  than spinning. Clearing the blocker makes the run resumable again.

## Index

| Slug | Feature | Stage |
|---|---|---|
| [lift-feeling](2026-06-13-230ee-lift-feeling/spec.md) | One "How did it feel?" per lift per workout (replaces per-set) | intake ✓ · design ✓ · architecture ✓ → plan-tasks |
| [improve-pipeline](2026-06-14-e4a97-improve-pipeline/spec.md) | Manually-triggered skill that consumes unprocessed `retro.md` files, synthesizes an improvement plan, and ships pipeline-skill edits as one PR | intake ✓ → design |
| [gymii-rebrand](2026-06-14-3b4d3-gymii-rebrand/spec.md) | Rebrand GymCycle → Gymii: green primary + warm-orange accent palette, paper-clean visual language (negative-space separation, no hard borders) | intake ✓ → design |
| [normalize-hex-casing-across-visual-surfaces](2026-06-14-6d556-normalize-hex-casing-across-visual-surfaces/spec.md) | Pick a hex-case convention, fix current drift in `manifest.webmanifest`, document the rule in `visual-language.md` | intake ✓ → design |
| [add-and-remove-days](2026-06-14-80b05-add-and-remove-days/spec.md) | Add or remove a session day in any week (Mon–Sun), without editing the seed; widens `WeekDay` and retires the seed's stray-day cleanup | intake ✓ → design |
| [add-and-remove-weeks](2026-06-14-c1cd0-add-and-remove-weeks/spec.md) | Append a new week to the cycle (with optional copy-from) or remove one with contiguous renumber; relaxes `WeekTemplate.id === weekNumber` and preserves user weeks across re-seeds | intake ✓ → design |
| [per-stage-model-and-effort-routing](2026-06-16-71891-per-stage-model-and-effort-routing/spec.md) | Let each ship-spec stage, task, and reviewer declare a recommended model + effort so the orchestrator routes each unit to the cheapest tier that does the job, with a safe fallback | intake ✓ → design |
| [human-readable-resource-names](2026-06-16-c8a00-human-readable-resource-names/spec.md) | Rename domain resources to human-readable names (`SessionTemplate` → `Workout`, `SetTemplate` → `Movement`, etc.) across all layers including DB tables, routes, cache keys, and docs | intake ✓ → design |
| [edit-movements-on-a-day](2026-06-16-a9ace-edit-movements-on-a-day/spec.md) | Add, edit, and remove individual movements (sets) inside a day's plan on `/workout/:id` | intake ✓ → design |
| [movement-library-reusable-exercise-templates](2026-06-17-3f0db-movement-library-reusable-exercise-templates/spec.md) | Seeded, user-editable library of movement templates; prefill the add-movement flow from a catalog | intake ✓ → design |
| [remove-cycles-ongoing-weeks-and-workouts](2026-06-17-fb0f7-remove-cycles-ongoing-weeks-and-workouts/spec.md) | Drop the fixed "cycle" framing; treat the app as an open-ended inventory of weeks and workouts with a forward-looking home preview and optional cosmetic start date per week | intake ✓ → design |
| [report-bug-producer-bug-report-queue](2026-06-18-677d2-report-bug-producer-bug-report-queue/spec.md) | `/report-bug` producer skill + `docs/bugs/` queue tree: capture a reproducible bug report in one turn, mirroring `/propose-spec` + `docs/specs/_proposed/` | intake ✓ → design |
| [fix-bug-tdd-orchestrator-pipeline](2026-06-18-4949f-fix-bug-tdd-orchestrator-pipeline/spec.md) | `/fix-bug` orchestrator + `reproduce-bug` sub-skill: TDD pipeline that drives a bug report from `docs/bugs/_reports/` to a merged fix, reusing `plan-tasks` → `implement-task` → review → `docs-sync` ⇄ `docs-audit` → finalize | intake ✓ → design |
| [bug-signal-triage-in-improve-pipeline](2026-06-18-0aa27-bug-signal-triage-in-improve-pipeline/spec.md) | Teach `improve-pipeline` to triage retro signal three ways (pipeline / improvement / bug), emit `bug-reports.md`, file bugs directly into `docs/bugs/_reports/`, and widen the retro glob to harvest bug-run retros | intake ✓ → design |
| [standalone-docs-sync-stage-before-finalize](2026-06-18-8906c-standalone-docs-sync-stage-before-finalize/spec.md) | Promote docs reconciliation into self-contained `docs-sync` ⇄ `docs-audit` sibling pipeline stages, running after review and before finalize in both `ship-spec` and `/fix-bug` | intake ✓ → design |
| [bug-reports-companion-skill-file-gathered](2026-06-18-f33ca-bug-reports-companion-skill-file-gathered/spec.md) | New `bugs-to-reports` producer skill: globs gathered `bug-reports.md` hand-offs, drafts conformant reports into `docs/bugs/_reports/`, renames consumed sources — splitting `improve-pipeline`'s direct bug-filing into a clean gather → file lifecycle | intake ✓ → design |
| [playwright-end-to-end-ui-testing](2026-06-18-7175f-playwright-end-to-end-ui-testing/spec.md) | Stand up Playwright as a second test kind: smoke + regression suite over real browser, local dev server, mobile viewport; extends `reproduce-bug` to browser-level RED tests | intake ✓ → design |
| [backfill-playwright-e2e-regression-coverage](2026-06-18-441e5-backfill-playwright-e2e-regression-coverage/spec.md) | Extend Playwright to cover remaining user flows (workout run, week/exercise/set CRUD, strength, progress, logout) against a dedicated ephemeral e2e DB | intake ✓ → design |
| [six-char-base36-ids-for-pipeline](2026-06-19-93671-six-char-base36-ids-for-pipeline/spec.md) | Widen pipeline `<rand>`/`id` token from 5-char hex to 6-char base36 everywhere it is minted or documented | intake ✓ → design |
| [surface-movement-library-in-navigation](2026-06-19-448a9-surface-movement-library-in-navigation/spec.md) | Add a "Movement library" nav entry linking to `/exercises` so the movement library is reachable in one tap | implement ✓ → docs-sync |
| [integrate-external-exception-tracking-frontend-backend](2026-06-19-d388d-integrate-external-exception-tracking-frontend-backend/spec.md) | Wire Sentry into the Nuxt client and Nitro server so unhandled errors land in a durable, triageable inbox | intake ✓ → design |
| [exception-tracker-inbox-triage-skill](2026-06-19-e3200-exception-tracker-inbox-triage-skill/spec.md) | Producer skill that fetches unresolved Sentry issues and triages each to ignore (mark ignored) or ingest (conformant bug report in `docs/bugs/_reports/`), cleaning the inbox in the same pass | intake ✓ → design |
| [run-the-existing-playwright-e2e-suite](2026-06-25-y21jq7-run-the-existing-playwright-e2e-suite/spec.md) | Fix ESM `__dirname` crash + session-secret-too-short in the e2e runner; add idempotent no-Docker provisioning (Postgres + Chromium) via SessionStart hook; verify a no-Docker browser run goes green | implement ✓ → docs-sync |
| [orchestrator-owned-retro-md-writes](2026-06-25-we63n8-orchestrator-owned-retro-md-writes/spec.md) | Make the orchestrator the sole writer of each run's `retro.md` so subagents only report their entry back — unblocking parallel `implement-task` execution and removing a retro-corruption class | intake ✓ → design |
| [playwright-ui-review-loop-builds-e2e](2026-06-26-tgrveq-playwright-ui-review-loop-builds-e2e/spec.md) | Add an optional, UI-gated Playwright review loop to the ship-spec review stage so Claude can "see" a UI change, iterate on layout/interaction defects, and turn a per-feature test plan into committed e2e specs that grow the regression library | intake ✓ → design |
| [rename-improve-pipeline-to-triage-retros](2026-06-26-hwcp8n-rename-improve-pipeline-to-triage-retros/spec.md) | Rename `improve-pipeline` → `triage-retros`, fan retro processing out across sub-agents, rename two output artifacts, and add a `pipeline-health.md` rollup | intake ✓ → design |
| [standards-drift-janitor-producer-skill](2026-06-26-w6fgdt-standards-drift-janitor-producer-skill/spec.md) | Run-on-demand `janitor` producer skill that statically scans the codebase for standards drift and files bounded spec proposals and bug reports across both queues | intake ✓ → design |
| [ui-ux-inspection-producer-skill](2026-06-26-ursjj0-ui-ux-inspection-producer-skill/spec.md) | Run-on-demand producer skill that drives the live app in a browser across the full surface-map, observes UI/UX issues, and files one consolidated checklist-style bug report | intake ✓ → design |
| [backfill-e2e-ui-test-coverage-baseline](2026-06-26-s0u4h0-backfill-e2e-ui-test-coverage-baseline/spec.md) | Close the gaps in the Playwright e2e suite (`/notes` + `/week/:week` detail) so every page in the surface-map is guarded, establishing a known-complete baseline | finalize ✓ → PR #80 |
| [folder-per-report-bug-report-queue](2026-06-26-12bmy2-folder-per-report-bug-report-queue/spec.md) | Restructure `docs/bugs/_reports/` from flat files + a `_ui-inspection` sidecar into one folder per report (`<dated-slug>/report.md` + evidence beside it); rewrite the contract, all five producers, the `fix-bug` consumer, and migrate the existing queue | finalize ✓ → PR #86 |
| [reconcile-stale-documentation-references-across-resource](2026-06-26-6so85m-reconcile-stale-documentation-references-across-resource/spec.md) | Fix stale `pages/session/[id].vue` refs in three live docs, add `LiftFeelingSelect` to the UI component catalog, and correct the contradictory filename example in `_proposed/README.md` | intake ✓ → design |
| [reconcile-server-routes-auth-exemption-list](2026-06-26-l0t142-reconcile-server-routes-auth-exemption-list/spec.md) | Correct `docs/standards/server-routes.md` so its auth-exemption list matches the code (`me` + `logout` are also exempt) and agrees with `docs/resources/auth.md` | finalize ✓ → PR #85 |
| [daily-weight-calorie-tdee-tracking](2026-06-27-eb9kr3-daily-weight-calorie-tdee-tracking/spec.md) | Log one body weight + one calorie figure per day (`DailyEntry`), with home + listing quick-entry, and a dashboard surfacing an adaptive TDEE derived from recency-weighted trend-weight differencing | intake ✓ → design |
| [add-failed-state-to-usesavestatus-channel](2026-06-27-4eed48-add-failed-state-to-usesavestatus-channel/spec.md) | Extend `useSaveStatus` from `'saving' \| 'saved'` to `'saving' \| 'saved' \| 'failed'` so consumer pages read failure state from the shared channel instead of latching local refs | finalize ✓ → PR #95 |
| [namespace-usesavestatus-edit-keys-per-resource](2026-06-27-iupr93-namespace-usesavestatus-edit-keys-per-resource/spec.md) | Re-namespace `useSaveStatus` editKeys by owning resource (`weeks-<n>`, `progress-<n>`) so per-key staleness guards in distinct mutation composables don't share a generation counter | finalize ✓ → PR #94 |
| [capture-ui-screenshots-as-pr-proof](2026-06-27-2ce6vs-capture-ui-screenshots-as-pr-proof/spec.md) | Persist `ui-review`'s Playwright screenshots to `docs/specs/<dated-slug>/ui-proof/` and embed them in the PR body as visual proof for UI-affecting features | intake ✓ → design |
| [codify-prisma-p2002-and-transaction-recipe](2026-06-27-cv7hqy-codify-prisma-p2002-and-transaction-recipe/spec.md) | Name the `'P2002'` magic string as a constant and document the array-vs-callback `$transaction` rule in `data-and-loads.md` | finalize ✓ → PR #91 |
| [shared-ispositiveinteger-and-isweekday-helpers](2026-06-27-pn746d-shared-ispositiveinteger-and-isweekday-helpers/spec.md) | Extract the positive-integer and WeekDay-membership guards repeated across contract `isValid()` methods into named helpers so future contracts don't reinvent them | finalize ✓ → PR #92 |
| [remove-dead-runtime-config-public-app](2026-06-27-hhbxys-remove-dead-runtime-config-public-app/spec.md) | Remove the unused `runtimeConfig.public.appName` key so the public runtime surface only carries fields the app actually reads | finalize ✓ → PR #90 |
| [hamburger-menu-navigation-drawer](2026-06-28-epumop-hamburger-menu-navigation-drawer/spec.md) | Replace the cramped top nav + "⋯" overflow with a left-sliding hamburger drawer listing every destination (Lucide icons via `@nuxt/icon`), active-route styling, and a centered Gymii wordmark | intake ✓ → design |
| [side-nav-reordering-add-action-placement](2026-06-28-tlhc4r-side-nav-reordering-add-action-placement/spec.md) | Reorder the navigation drawer most-used-first, lift add affordances to the top of `/exercises` and `/weeks`, and fix daily-log weight/calorie input overflow on narrow phones | intake ✓ → design |
| [teal-orange-palette-refresh](2026-06-28-ez8pl8-teal-orange-palette-refresh/spec.md) | Shift brand-primary from emerald green to spring/sea-green teal (rename `gymii.green.*` → `gymii.teal.*`), lighten the navy ink surface ladder to neutral charcoal, keep orange accent unchanged | finalize ✓ → PR open |
| [home-health-metric-graphs](2026-06-29-cicmoi-home-health-metric-graphs/spec.md) | Chart on the home screen for body-weight and calorie progress over time (Phase 1), with smoothed averages emphasised over noisy daily points and a 30d/90d/All window switcher | intake ✓ → design |
| [consistent-add-edit-and-remove-flows](2026-06-29-24807a-consistent-add-edit-and-remove-flows/spec.md) | Unify every add/edit/remove surface onto one shared overlay primitive (`BaseSheet` + `BaseConfirm`) with consistent scrim, focus trap, Escape-to-close, and a single Cancel + CTA footer recipe | intake ✓ → design |
| [home-page-tweaks-drop-up-next](2026-06-30-24evd7-home-page-tweaks-drop-up-next/spec.md) | Remove "Up next" preview from home screen, stack daily-log inputs vertically, make Calories metric tab highlight teal like the other tabs | finalize ✓ → PR open |
| [pareto-frontier-pipeline-self-improvement](2026-06-30-9onmlj-pareto-frontier-pipeline-self-improvement/spec.md) | Make the `triage-retros` → `apply-pipeline-improvements` self-improvement loop drift-resistant by adopting the GEPA/ACE pattern — candidate-set Pareto selection, dimension-tagged deltas, and explicit conflict surfacing | intake ✓ → design |
| [convergence-checked-review-remediation-loop](2026-06-30-vt5g53-convergence-checked-review-remediation-loop/spec.md) | Add a convergence predicate to the `ship-spec` review remediation loop so it exits early when findings stabilize, instead of always running toward the fixed ≤3-round cap | intake ✓ → design |
| [generalize-the-tracker-drop-program-specific](2026-06-30-ontys3-generalize-the-tracker-drop-program-specific/spec.md) | Strip CrossFit-program scaffolding (read-only Notes, CrossFit check-in fields, fixed Phase enum, program-specific vocabulary) so the app reads as a general gym tracker | intake ✓ → design |
| [weight-goals-with-calorie-targets](2026-07-01-z4gmlm-weight-goals-with-calorie-targets/spec.md) | Set an active weight goal + aggressiveness tier; derive a recommended daily calorie target and projected achievement date from TDEE/trend, surfaced on the home screen and home charts | finalize ✓ → PR open |
| [templates-for-artifact-producing-pipeline-stages](2026-07-01-86ztaq-templates-for-artifact-producing-pipeline-stages/spec.md) | Add fill-in `_templates/` stubs for the artifact-producing stages that lack one — `ui-test-plan.md` under `docs/specs/_templates/`, and a new `docs/specs/_improvements/_templates/` set for `triage-retros`'s four outputs | docs-audit ✓ → finalize |
| [long-term-training-intention](2026-07-01-37zgv1-long-term-training-intention/spec.md) | Add a nullable free-text `intention` field to the active `WeightGoal` — edited in `GoalSheet.vue` alongside the goal, surfaced as a quoted reminder on the home Goal card via the existing `goal-view` read, no new route/query | implement ✓ → docs-sync |
| [daily-progress-photos](2026-07-02-9s5prt-daily-progress-photos/spec.md) | Optional front/back/left/right progress photos per calendar day, stored as `Bytes` in Postgres (no external service) so they survive Heroku's ephemeral filesystem | finalize ✓ → PR open |
| [repair-rotted-e2e-specs-and-gate](2026-07-02-2jq4pl-repair-rotted-e2e-specs-and-gate/spec.md) | Fix the ~24 rotted Playwright e2e failures (nav-shell strict-mode, auth-state drift, save-status testid drift) and add a `pnpm test:e2e` CI gate so the suite can't silently re-rot | implement ✓ → docs-sync |
| [first-time-setup-onboarding](2026-07-03-xxlegw-first-time-setup-onboarding/spec.md) | First-run wizard that captures the operator's name, lets them set their own PIN (retiring `APP_PIN` as the login credential), and seeds starting maxes, weight/calories, and first weight goal into a new `UserProfile` resource | implement ✓ → docs-sync |
| [ui-consistency-visual-standards-codification](2026-07-03-xnhyqs-ui-consistency-visual-standards-codification/spec.md) | Binding action-tier ladder, legible disabled CTAs, jargon-free display copy, nav-label/H1 alignment, and a layout-overflow e2e guard — codified into the visual-language/ui-components/testing standards docs | implement ✓ → docs-sync |
| [consolidate-progress-into-daily-log](2026-07-03-262vn1-consolidate-progress-into-daily-log/spec.md) | Retire the weekly `ProgressEntry` check-in; fold Sleep quality, Energy, Notes (carried over) plus new Steps and HRV into the daily log at `/daily`, logging-only | implement ✓ → docs-sync |
| [fast-add-edit-of-movements-in-a-workout](2026-07-04-mavbue-fast-add-edit-of-movements-in/spec.md) | Multi-set movement add, "+1 set" quick action, block-aware add affordances, movement-level (all-sets) editing, and one-action movement swap on `/workout/:id` | implement ✓ → docs-sync |
| [fable-tier-re-analyze-model-routing](2026-07-04-4crr07-fable-tier-re-analyze-model-routing/spec.md) | Un-reserve the `fable` model tier in `tiers.md`, re-analyze which units across every skill warrant it, and gate resolution on a universal `--with-fable` flag so its per-token cost is never incurred by default | implement ✓ → docs-sync |
| [movement-pager-within-workout-blocks](2026-07-04-fs16v0-movement-pager-within-workout-blocks/spec.md) | One-round-at-a-time pager within each multi-movement block on `/workout/:id`: left/right arrows, a `Round 2 / 3` indicator, per-block position state, all existing per-set actions preserved | implement ✓ → docs-sync |
| [home-screen-greeting-and-daily-tip](2026-07-04-vqorlw-home-screen-greeting-and-daily-tip/spec.md) | Replace the static `Today` heading with a day-stable personal greeting + a daily coaching tip (two `constants/` pools of ≥31, date-stable selection in a `composables/ui/` hook, reusing `useProfileQuery`), and widen the home-card `gap-5` rhythm — client-only, no new route/table | finalize ✓ → PR #159 |
| [movement-picker-library-upgrades](2026-07-04-cjrg88-movement-picker-library-upgrades/spec.md) | Type-to-filter search, category-chip filters, recency-first ordering, and create-from-search in `ExercisePicker` + `/exercises` — no new persistence | implement ✓ → docs-sync |
| [ui-and-visual-cleanup-pass](2026-07-04-8x4oe2-ui-and-visual-cleanup-pass/spec.md) | Batch mobile UI/visual fixes: bigger header logo, Weeks→Schedule rename, reordered/named nav drawer, Maxes metric churn (drop 3, add 2, repurpose pull_up), daily-log entry delete + blurred in-More photos, empty-chart message, non-shifting overflow menu | docs-audit ✓ → finalize |
