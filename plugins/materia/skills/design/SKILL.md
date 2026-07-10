---
name: design
description: From a feature spec, produce a UX design doc (user flows, screens, and their loading/empty/error/ready states) at docs/specs/<dated-slug>/design.md (where <dated-slug> is the timestamped folder name minted at intake, e.g. 2026-06-13-142530-ab24f9-csv-export). Stage 2 of the ship-spec pipeline (UI-gated — spawned only when the feature ships UI; skipped and recorded on non-UI runs); usable standalone after a spec exists.
---

# design — UX flows & screens from a spec

Turn `spec.md` into a concrete `design.md` that lands inside the product's
taste (`docs/product.md`). Runs as a subagent in
`ship-spec`; usable standalone after a spec exists.

**UI-gated.** This stage designs screens; a feature that ships no UI has
nothing for it to design. The orchestrator evaluates the UI-surface gate's
predictive form (`ship-spec/SKILL.md` § Review — § UI-surface gate — that
gate owns the timing and resolution) and skips this stage on non-UI runs —
`architecture` then works from `spec.md` alone, including the
operator-surface enumeration for non-product features (its § Non-product
features).

## Inputs

- `docs/specs/<dated-slug>/spec.md`; `docs/product.md` (§ Design feel &
  taste + § Voice & tone — the taste oracle every screen must land inside);
  `docs/standards/ui-components.md`; `docs/standards/visual-language.md`
  (the binding visual rules); relevant resource docs for screens you'll
  touch.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/design.md` — plus, standalone lane only,
  `STATUS.md` updated, committed and pushed (orchestrator lane: body only —
  see step 8).

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

0. **UI self-gate (no-op in the orchestrated lane).** Before anything else, read
   `MATERIA.md` § Surface gates § UI-affecting. If it is `none` — this repo ships
   no user-facing surface (`MATERIA.md` § Eyes is `none` too) — there is nothing
   here to design: print one line —
   `design: skipped (no UI surface — § UI-affecting is none)` — and end
   cleanly, writing nothing. This gate is a no-op in the orchestrated lane:
   `ship-spec` only spawns this stage on a UI-affecting diff, so the check
   passes and the procedure below runs.

1. **Read** `docs/specs/<dated-slug>/spec.md`, `docs/specs/_templates/design.md`,
   `docs/product.md` (§ Design feel & taste, § Voice & tone, § Product
   principles — the judgement baseline), `docs/standards/ui-components.md`
   (conventions), `docs/standards/visual-language.md` (the binding visual
   rules), and `docs/glossary.md`. Skim related resource docs for screens
   you'll touch.

2. **Flows.** For each user story, write the step-by-step path the user takes
   (entry → actions → outcome), grounded in the usage context from
   `docs/product.md` § Audience & market.

3. **Screens & states.** For every screen/route, define purpose, key elements,
   and **all four states**: loading, empty, error, ready — matching the existing
   repo's loading/empty/error component conventions (its UI standard names
   them). Don't leave a
   state undefined.

4. **Components.** Identify what's **reused** from `components/` vs **new**. New
   reusable patterns → `components/`; derived strings/classes/tones → a
   presentation hook per the repo's UI standard (never inline UI logic in
   models/contracts).

5. **Interaction notes.** Target sizes, reach/ergonomics at the canonical
   viewport (`MATERIA.md` § Eyes), optimistic save feedback, debounce —
   per the repo's UI and API-layer standards.

6. **Cohesion anchors.** For each new or changed screen, pick the **1–3
   existing screens most similar in role** (list page, detail page,
   sheet/modal, home card) and record them in a `## Cohesion anchors` section
   of `design.md`: the anchor screen(s) plus the concrete patterns the new
   screen must match — surface-tone ladder rungs, spacing/typography scale,
   header/nav idiom, card/list/sheet components, empty/error treatments. This
   section is **binding downstream**: implementers reuse the anchors'
   components and presentation hooks instead of inventing near-duplicate
   patterns, and `ui-review` captures the anchor screens for a side-by-side
   cohesion comparison. The failure mode this closes: a screen that satisfies
   every token rule *in isolation* but still reads as foreign next to its
   siblings — per-screen correctness doesn't compose into app-level cohesion
   unless the anchors make it checkable.

7. **Write** `docs/specs/<dated-slug>/design.md`. Flag any genuinely open design
   question, but resolve everything that affects architecture now.

   **Auto Mode allowance for non-blocking judgement calls.** Small design
   judgement calls — choices that don't affect architecture and that the
   operator could reasonably flip later (e.g. delete a legacy palette key
   vs alias it; adopt the repo's existing error-state component on a
   page that previously had an ad-hoc error block; remove a subline
   alongside a wordmark rebrand) — are **made here**, with a one-bullet
   "Open design questions — non-blocking" entry in `design.md` naming
   the call AND the alternative. Do not ask the operator at design time;
   the entry exists so `plan-tasks` (or the operator) can flip it later
   without re-running design. Reserve clarifying questions for choices
   that genuinely change scope or block downstream stages.

8. **Persist.**

   **Sole-writer split.** The design stage owns the `design.md` **body and
   `## Feedback log`** — the log is design content (round number, what was
   asked, what changed), appended on the first gate revision round (the loop is
   defined in `ship-spec/SKILL.md` § Design gate). The **approval block is
   orchestrator-owned** (the standalone-lane exception below is the sole place
   this skill writes it). The operator hand-editing the body is a blessed
   feedback channel, never a sole-writer violation. On a gate revision round
   (re-spawned by `ship-spec` with feedback) produce a new body and append the
   round to `## Feedback log` — still never touch the approval block in that
   lane.

   **Orchestrator lane (spawned by `ship-spec`/`fix-bug`):** do **not** tick
   `STATUS.md`, do **not** commit it, and do **not** touch the approval block —
   the orchestrator owns `STATUS.md`, the design row, `Next:`, and the whole
   approval block (`ship-spec/SKILL.md` § STATUS.md ownership (orchestrator
   lane); § Design gate). Write only your own artifact (the `design.md` body).
   Unchanged from before the gate existed.

   **Standalone lane (operator-invoked directly, not a spawn):** this is the
   **sole standalone-lane exception** to the approval block's orchestrator
   ownership (`ship-spec/SKILL.md` § Design gate — Sole-writer split) — here the
   skill writes the initial approval block itself. Resolve the gate for this
   run, then persist:

   - **Resolve the gate** — consult, in order: a captured
     `design-gate: <on|off> (proposal frontmatter)` line in `STATUS.md`
     § Notes (present when `ship-spec` staked this folder from a proposal
     declaring `design_gate:`), then `MATERIA.md` § Design tool's Design gate
     default (absent section or knob → on). The invocation-flag rung
     (`--approve-design`) cannot apply in this lane.
   - **No `STATUS.md` at all** — a hand-created spec folder may have none: seed
     one from `docs/specs/_templates/status.md` — fill `Slug:` (the folder
     name), leave `Branch:` at the template placeholder (`ship-spec`'s resume
     backfills it on any route, gate pending or already auto-approved —
     § Design gate — Standalone-first lane and § Resume step 3's
     placeholder-branch guard), leave `## Provenance` ad-hoc (`—`) — rather
     than failing or writing `Next:` into a file that doesn't exist.
   - **Gate ON** → write the approval block into `design.md` frontmatter
     (`status: pending`, `rounds: 0`, no hash — the very top of the file,
     ordinary YAML frontmatter), tick stage 2, set
     `Next: design-approval (awaiting operator)`, append
     `design-gate: awaiting approval` to `STATUS.md` § Notes, commit + push. A
     later `/materia:ship-spec <slug>` resume then routes to the gate (its
     Resume step 0) instead of silently building an unapproved design.
   - **Gate OFF** → stamp `status: auto-approved, by: auto, at: <ISO-8601>,
     reason: <the deciding knob's reason string>` — the reason is
     `proposal frontmatter design_gate: off` or `MATERIA.md gate: off` — compute
     and write `design_hash` per the single normative recipe in
     `ship-spec/SKILL.md` § Design gate (body-only — that section is the only
     definition), tick stage 2, set `Next: architecture`, append
     `design-gate: auto-approved (<full reason string>)` to `STATUS.md`
     § Notes, commit + push — today's behavior plus the recorded decision.
   - **The persist commit** — either resolution — carries the gate-marker
     subject prefix `design-gate(<dated-slug>):` (`ship-spec/SKILL.md`
     § Design gate — Gate commits), keeping the pending-edit-detection baseline
     uniform (diff against the most recent gate-marked commit; no
     unmarked-commit fallback needed).

   This standalone seed/write runs in the **operator-invoked** lane, not a
   spawn — the spawn-contract's `STATUS.md` monopoly (Block 1) binds spawned
   subagents and is not contradicted here, so no new carve-out is needed there.

## Done when

- Every spec story has a flow; every screen defines all four states.
- Every new/changed screen names its anchor screen(s) in `## Cohesion anchors`.
- Reused vs new components are listed.
- No design decision needed by the architecture stage is left ambiguous.
- Orchestrator lane: only the `design.md` body is written — the orchestrator
  ticks `STATUS.md`, sets `Next:`, and owns the approval block. Standalone lane:
  `STATUS.md` ticked with the approval block written and `Next:` set —
  `design-approval (awaiting operator)` when the gate is on, `architecture` when
  off (auto-approved, `design_hash` computed) — design committed + pushed.

## Scope

This skill does **not**:

- **Do technical planning.** Mapping the feature onto existing resources, the
  data model, the API surface, and the blast-radius/edit-set discovery greps
  all belong to `architecture` (its § Procedure steps 2 and 6). `design.md`
  is a UX artifact — screens, flows, states, cohesion — and stops there;
  overlap between the two documents is drift, not thoroughness.
- **Run for non-UI features.** A Claude Code skill, a CLI helper, a refactor —
  the orchestrator's UI gate skips this stage, and `architecture` § Non-product
  features carries the operator-facing phase/output enumeration instead. A
  standalone invocation **enforces** the same outcome: the § Procedure step 0 UI
  self-gate exits on a repo whose `MATERIA.md` § Surface gates § UI-affecting is
  `none` (no screens, no design stage) — it does not merely advise.
