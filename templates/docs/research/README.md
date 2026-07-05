# Research notes

Durable research artifacts that inform product and pipeline decisions. Each note
captures **why** we believe a direction is worth taking — the external evidence,
with citations — so a later reader (or a spec proposal) can trace a decision back
to its sources.

These are **reference docs, not a queue.** Unlike `docs/specs/_proposed/` (a
transient intake surface that trends toward empty) and
`docs/specs/_improvements/` (per-batch retro triage), research notes are kept as
a standing corpus. A proposal drafted from a note cites it via `source_refs`.

| Doc | What |
|---|---|
| [2026-06-29-pipeline-improvement-research.md](2026-06-29-pipeline-improvement-research.md) | External practice + agent research (2024–2026) on improving the `ship-spec` pipeline; 24 adversarially-verified claims mapped to the six pipeline dimensions. Source for the `uk5oqz` / `q590ho` / `kjmf9u` proposals. |
| [2026-07-03-ux-refinement-audit.md](2026-07-03-ux-refinement-audit.md) | Playwright-grounded UX audit of every page at Pixel-5 (sheets, pull-to-refresh, workout-screen density, list clutter); the problem statements, design principles, and pass plan behind the `feat/ux-refinement-pass` branch. |
| [2026-07-04-ux-product-refinement-audit.md](2026-07-04-ux-product-refinement-audit.md) | Second-generation product-experience audit (workout-wall density, home briefing, weeks orientation, body-background token drift, completion moments); the design direction and pass plan behind the second UX refinement pass. |

## Authoring a note

Name it `<YYYY-MM-DD>-<slug>.md`. Lead with what the note is for and how the
evidence was gathered (method + source quality), then organize findings so a
reader can act on them. Cite primary sources (papers, official docs, engineering
blogs) over listicles; prefer bare URLs or `<url>` over markdown links so the
doc link-check stays focused on in-repo paths. Add a row to the table above and
run `node scripts/check-docs.mjs`.
