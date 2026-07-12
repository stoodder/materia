---
name: design-feasibility
description: Grounded buildability of the design against repo reality — catches at design time what would otherwise bounce from architecture.
---

# design-feasibility — grounded buildability of the design

## What it checks

Whether `design.md` is actually buildable, so infeasibility surfaces at
design time instead of bouncing back from architecture. Findings use category
`design-feasibility`.

- Each screen, flow, and assertion is buildable with the repo's actual
  components, data model, API surface, and standards, without contradicting
  `spec.md` or the design's own stated intent.
- Demands with no plausible implementation path are flagged — this is the
  same infeasibility bar architecture's bounce uses: infeasibility, not
  preference. "I would lay it out differently" is never a finding here.
- Reuse the design silently assumes but the repo does not actually have is
  flagged.

## How to run it

Run inline as an Agent. Read `spec.md` and `design.md`, then ground-truth
each claim against the repo's docs read order (`CLAUDE.md` → `docs/README.md`
→ the relevant standards/resource docs) and targeted greps of the code. Every
infeasibility finding must carry the concrete constraint that blocks it (a
file or doc citation as evidence), mirroring the what/why/what-change bar
architecture uses for its own bounce.

## Gate rationale

Same condition as its sibling angle, design-coherence: relevant only when the
run produced a design artifact for a design-bearing (UI) surface, reviewed
once before the human design gate sees it.
