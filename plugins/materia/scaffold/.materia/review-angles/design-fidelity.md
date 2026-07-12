---
name: design-fidelity
description: Pairing fidelity of the design's halves — the visual half matches design.md, and the committed snapshot is self-contained and honest.
---

# design-fidelity — the paired artifact's halves agree

## What it checks

That the design's two halves — the visual canvas and the descriptive
`design.md` — agree with each other, and that any committed snapshot can be
trusted on its own. Findings use category `design-fidelity`.

- **Pairing consistency** — every screen, state, and flow `design.md` names
  (the four canonical states, or their recorded n/a, included) is visually
  present on the visual half; the cohesion-anchor patterns `design.md` names
  are plausibly honored there; nothing substantive on the visual half is
  missing from the descriptive half's coverage. This is not a transcription
  demand — `design.md` is context the canvas cannot say, never a
  re-rendering of it (the paired-artifact doctrine). The bar is that the
  halves have not forked, not that one restates the other.
- **Committed-snapshot integrity** — when `.materia/docs/specs/<dated-slug>/design/`
  exists: it is self-contained per the directory contract — opening
  `index.html` straight from disk renders correctly, assets co-located or
  inlined, no network fetches; `README.md` is present per the snapshot-readme
  template; the README's `semantic-structure` line — and, on a reconstructed
  snapshot, its fabrication-contract honesty clause — are consistent with the
  actual exported markup, verified against the files, not trusted from the
  README's own claim.

## Seam with the sibling angles

Vs `design-conformance`: that angle runs post-implementation, the built app
against the approved design; this angle runs pre-gate, the design's own
halves against each other.

Vs `design-coherence`: coherence owns `design.md`'s internal completeness —
does the text name all four states, are the anchors apt. Fidelity owns
visual presence of what `design.md` declares — a different question, asked
of the same document.

## How to run it

Run inline as an Agent. The committed snapshot is the primary visual
artifact when one exists; what other visual evidence you have is stated in
your brief per the visibility rules in `ship-spec/SKILL.md` § Stage reviews
(design & architecture) — § Design-stage review — a direct canvas read, an orchestrator-inlined
canvas read-back, or the snapshot alone. Walk mandate 1 from `design.md`'s
own screen/state/flow lists against the visual evidence you were given.
Verify mandate 2 by opening the snapshot's files and reading the actual
exported markup yourself. Every finding carries its evidence — the
screen/state and what diverges, or the snapshot file and what breaks.

## Gate rationale

Relevant only when the run produced a design artifact for a design-bearing
(UI) surface and a visual half actually exists to compare against — a canvas
or a committed snapshot. On a repo-side design with neither, the orchestrator
skips this angle and records it: its two sibling design angles already cover
the descriptive half on their own. Reviewed once, pre-gate, like its
siblings.
