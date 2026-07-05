---
name: materia-design
description: From a feature spec, produce a UX design doc (user flows, screens, and their loading/empty/error/ready states) at docs/specs/<dated-slug>/design.md (where <dated-slug> is the timestamped folder name minted at intake, e.g. 2026-06-13-142530-ab24f9-csv-export). Stage 2 of the ship-spec pipeline (UI-gated — spawned only when the feature ships UI; skipped and recorded on non-UI runs); usable standalone after a spec exists.
---

# materia-design — UX flows & screens from a spec

Turn `spec.md` into a concrete `design.md` that lands inside the product's
taste (`docs/product.md`). Runs as a subagent in
`materia-ship-spec`; usable standalone after a spec exists.

**UI-gated.** This stage designs screens; a feature that ships no UI has
nothing for it to design. The orchestrator evaluates the UI-surface gate's
predictive form after intake (`materia-ship-spec/SKILL.md` § Review — § UI-surface
gate) and skips this stage on non-UI runs — `materia-architecture` then works from
`spec.md` alone, including the operator-surface enumeration for non-product
features (its § Non-product features).

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

- `docs/specs/<dated-slug>/design.md` — `STATUS.md` updated, committed and pushed.

## Recommended tier

`sonnet/high` — see `MATERIA.md` § Tiers for the model and effort definitions. UX design from a spec calls for careful reasoning to define flows and states across all screen surfaces.

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`.claude/skills/materia-ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

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
   viewport (`MATERIA.md` § Eyes), optimistic feedback
   save feedback, debounce — per the repo's UI and API-layer standards.

6. **Cohesion anchors.** For each new or changed screen, pick the **1–3
   existing screens most similar in role** (list page, detail page,
   sheet/modal, home card) and record them in a `## Cohesion anchors` section
   of `design.md`: the anchor screen(s) plus the concrete patterns the new
   screen must match — surface-tone ladder rungs, spacing/typography scale,
   header/nav idiom, card/list/sheet components, empty/error treatments. This
   section is **binding downstream**: implementers reuse the anchors'
   components and presentation hooks instead of inventing near-duplicate
   patterns, and `materia-ui-review` captures the anchor screens for a side-by-side
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
   the entry exists so `materia-plan-tasks` (or the operator) can flip it later
   without re-running design. Reserve clarifying questions for choices
   that genuinely change scope or block downstream stages.

8. **Persist:** tick stage 2 in `STATUS.md` and set `Next: architecture`; commit
   + push. **Orchestrator-lane exception:** when spawned by `materia-ship-spec`/`materia-fix-bug`, do **not** tick `STATUS.md` or commit it — the orchestrator owns both (see `materia-ship-spec/SKILL.md` § STATUS.md ownership (orchestrator lane)); write only your own artifact.

## Done when

- Every spec story has a flow; every screen defines all four states.
- Every new/changed screen names its anchor screen(s) in `## Cohesion anchors`.
- Reused vs new components are listed.
- No design decision needed by the architecture stage is left ambiguous.
- `STATUS.md` updated; design committed + pushed.

## Scope

This skill does **not**:

- **Do technical planning.** Mapping the feature onto existing resources, the
  data model, the API surface, and the blast-radius/edit-set discovery greps
  all belong to `materia-architecture` (its § Procedure steps 2 and 6). `design.md`
  is a UX artifact — screens, flows, states, cohesion — and stops there;
  overlap between the two documents is drift, not thoroughness.
- **Run for non-UI features.** A Claude Code skill, a CLI helper, a refactor —
  the orchestrator's UI gate skips this stage, and `materia-architecture` § Non-product
  features carries the operator-facing phase/output enumeration instead. A
  standalone caller should apply the same judgement: no screens, no design
  stage.
