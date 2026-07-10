---
name: ui
description: UI cohesion review — an Eyes pass plus cross-screen cohesion comparison (UI-gated).
---

# ui — UI cohesion review angle

## What it checks

UI cohesion across the cumulative diff:

- An Eyes pass (`MATERIA.md § Eyes`: toolchain + canonical viewport) judged
  against the repo's visual standards docs.
- The cross-screen cohesion comparison against the sibling screens named in
  `design.md § Cohesion anchors`.

Committed `ui-proof/` screenshots are a mandatory deliverable of this angle.

This angle is relevant only when the diff changes user-facing surfaces.

**Seam with `design-conformance`.** This angle judges qualitative cohesion and taste;
`design-conformance` verifies the built screens against the staged design's assertions and the
deterministic conformance findings — a contract, not taste. A finding that could belong to both
goes to `design-conformance` (the sharper category); neither angle restates the other's rubric.

## How to run it

Invoke the `ui-review` skill.

`ui-review` ships with the Materia plugin, so it is always available.
