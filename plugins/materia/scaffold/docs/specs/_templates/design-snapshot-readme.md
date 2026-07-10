<!-- Filled by the design stage when it commits a static canvas snapshot to
     docs/specs/<dated-slug>/design/ (see MATERIA.md § Design tool's `export`
     and `export: via-read` capabilities). Audience: a human skimming this
     design/ directory, and — once built, a future release — an automated
     conformance-diff tool that compares this snapshot against the built app.
     Never write a live bracket-then-paren markdown link anywhere in this
     file; describe cross-references with an arrow instead
     (text → path) — this rule binds everything under docs/specs/**, which
     is where the filled-in copy of this file lives. -->
# Design snapshot — read this before comparing anything

This directory is a static export of the canvas this spec's design was
authored on, captured alongside design.md in this same run folder (sibling
file, same directory).

## Not a pixel-diff baseline

<!-- State plainly: do not wire pixelmatch (or any pixel-diff tool) between
     this snapshot and the running app. Canvas copy and data are design-
     fiction — placeholder text, invented numbers, stock imagery — never
     production values, and a perfect implementation will still show huge
     pixel deltas because the *content* was never meant to match. Fonts
     rendered here are faithful only where MATERIA.md § Design tool's
     `tokens` capability actually reached the canvas for this run; when it
     didn't, treat rendered fonts as the canvas tool's own defaults, not a
     signal. -->

## Fabrication contract

<!-- The load-bearing section. A later automated conformance-diff tool reads
     these three category names verbatim — do not paraphrase them. -->

- **fabricated** — text content and data on the canvas. Never comparable;
  never diff these against the built app's copy or data.
- **faithful** — token-derived properties: color, spacing, and radius CSS
  custom properties, and font-family *iff* MATERIA.md § Design tool's
  `tokens` capability actually reached the canvas for this run. These ARE
  comparable between snapshot and built app.
- **semantic structure** — landmarks, headings, roles (`<nav>`, `<main>`,
  and similar). Verified on first export, not asserted up front: canvas
  exports are frequently absolutely-positioned `<div>` soup with no real
  semantic HTML, so check the actual exported markup before recording this.

`semantic-structure: {{yes | no}}`

<!-- Record `no` honestly when the export lacks real landmark/heading
     elements. A later conformance checker reads this line and, on `no`,
     skips structural comparison entirely rather than manufacturing false
     "structure mismatch" findings against a perfectly good implementation.
     Only record `yes` when the exported markup genuinely carries
     landmarks/headings/roles, not merely because the design looks
     structured on screen. -->

## `export: via-read` honesty clause

<!-- Fill in only when this run's adapter has no native filesystem export
     and this snapshot was instead reconstructed from a `read` capability
     (MATERIA.md § Design tool's `export: via-read` convention). Delete this
     section when the adapter is a native exporter.

     State explicitly which of the three fabrication-contract properties
     above the reconstruction actually preserves — fabricated, faithful,
     semantic structure — and which it does not. Never
     overclaim fidelity a reconstruction doesn't actually have: a read-based
     rebuild may drop token wiring, flatten structure to divs, or otherwise
     lose ground relative to a native export. Say so plainly rather than
     letting the fabrication-contract section above stand unqualified. -->

This snapshot is a reconstruction (`export: via-read`), not a native export.
Preserved: {{which of fabricated / faithful / semantic structure survived the
reconstruction}}. Not preserved: {{which did not, and why}}.
