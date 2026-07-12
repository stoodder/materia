---
name: design-coherence
description: Completeness and internal coherence of the design artifact before the human gate — flows, states, assertions, cohesion, taste.
---

# design-coherence — design artifact completeness + coherence

## What it checks

That `design.md` is complete and internally coherent before a human ever sees
it. Findings use category `design-coherence`.

- Every `spec.md` story has a corresponding flow.
- Every screen records its hierarchy and the four canonical states
  (loading/empty/error/ready), or an explicit n/a with a stated reason.
- `## Assertions` lines are one-line, imperative, and falsifiable against a
  rendered screen; each is correctly split static (checkable from a capture)
  vs runtime (belongs to the e2e lane, not a static check).
- `## Cohesion anchors` names 1–3 apt existing screens for each new or
  changed screen.
- Taste alignment with `.materia/docs/product.md` (§ Design feel & taste, § Voice &
  tone).
- Scope purity — no technical-planning creep (data-model or API mapping
  belongs to architecture, not design).

## How to run it

Run inline as an Agent. Read `.materia/docs/specs/<dated-slug>/spec.md`,
`.materia/docs/specs/<dated-slug>/design.md`, `.materia/docs/product.md`, and the repo's UI
standards. Verify each mandate above literally against `design.md`. Report
findings against `design.md`'s own sections/lines.

## Gate rationale

Relevant only when the run produced a design artifact for a design-bearing
(UI) surface — reviewed once, right after first authoring, before the human
design gate sees it.
