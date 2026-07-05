# Docs authoring

> These docs are agent context: describe the present state only, give every
> fact exactly one home, and make every sentence earn its tokens.

## Rule

- **Write for an agent's context window.** A doc's job is to let a reader
  decide in seconds whether it applies to their change and, when it does, hand
  them the shape and the file list. Front-load the load-bearing facts; cut
  hedges, pleasantries, and anything derivable from the linked code.
- **Present state only.** Describe the code as it **is**. Never narrate how it
  got that way — no `renamed from`, `previously`, `the old X was removed`,
  `(modified)`, or `new —` markers, no diff-bounding notes (`left untouched`),
  no pipeline-run residue (`LOCKED per the spec`). Git history and
  `docs/specs/**` own the past; a doc that narrates it goes stale twice.
- **One home per fact.** Each fact lives in exactly one doc; every other doc
  links to that home instead of restating it. The ownership map below says
  which doc owns which kind of fact.
- **Tables index, bullets explain.** A table cell holds a name plus a role of
  one–two short sentences. Anything longer moves to a bullet list or subsection
  below the table; the cell stays a pointer. `check:docs` fails any line over
  600 characters as a mechanical backstop.
- **Glossary entries are one line.** One crisp sentence plus the Detail link;
  the linked doc owns the depth. The table stays alphabetical (checked).
- **Size discipline.** A resource doc drifting past ~300 lines is usually
  restating a standard, keeping prose in table cells, or hosting a fact that
  belongs elsewhere. Compress before splitting; split before exceeding.
- **Mechanically checked.** `node scripts/check-docs.mjs` enforces the checkable
  subset: links and `#anchor` fragments resolve, no change-narration phrases,
  no over-long lines, the glossary is alphabetical, no duplicated long lines
  (copy-paste drift). CI runs it on every PR.

## Ownership map — where a fact lives

| Kind of fact | Home |
|---|---|
| An entity's schema, wire shapes, routes, client API, UI, invariants, gotchas, canonical files | `resources/<entity>.md` |
| A cross-cutting convention (how we build anything) | the matching `standards/*.md` |
| The route + page inventory | [surface-map.md](../surface-map.md) — an index: one row per route/page, detail stays in the resource doc |
| A term definition | [glossary.md](../glossary.md) — one line + Detail link |
| Definition of Done, touch-X→update-Y map | [contributing.md](../contributing.md) |
| The always-loaded rules-in-brief | `CLAUDE.md` — one-line summaries that link to the standards |

## Why

Agents load these docs into a bounded context window before every change.
History narration, restated standards, and paragraph-length table cells burn
that budget without adding decision power — and each duplicated fact is a
future contradiction, since only one copy gets updated. Docs written by the
pipeline (`materia-docs-sync` runs after every feature) accrete naturally in
change-shaped increments; this standard plus the mechanical checks are the
counter-pressure that keeps them state-shaped.

## How

| ✓ Do | ✗ Don't |
|---|---|
| "`startDate` is cosmetic — it drives no computation." | "`startDate` (added in the schedule pass) replaces the old auto-advance…" |
| Cell: "`pages/schedule.ext` — the schedule page; details below." + bullets under the table | a 1,500-character single cell narrating the whole page |
| "See [api-layer.md](api-layer.md) § cache keys." | restating the cache-key rules inside a resource doc |
| Glossary: one sentence + Detail link | a five-sentence glossary mini-doc |
| State the invariant: "the algorithm is fixed; change it only via a spec" | `LOCKED per spec 2026-06-27-eb9kr3 § TDEE calculation` |

When editing an existing doc (including a `materia-docs-sync` pass): fold the change
into the current-state description — never append a "now it also…" delta on
top of the old text. If the edit makes a section read like a change log,
rewrite the section.

## Where it lives

- Every file under `docs/` root, `docs/resources/`, `docs/standards/`, and
  `docs/_templates/`, plus `CLAUDE.md`.
- Enforcement: `scripts/check-docs.mjs` (`node scripts/check-docs.mjs`; the `docs` CI
  job).

## Related

- [../README.md](../README.md) — read order + doc index
- [../contributing.md](../contributing.md) — Definition of Done, touch-X→update-Y map
- [architecture.md](architecture.md) — the same one-home discipline, applied to code
- [skills.md](skills.md) — the pipeline stages (`materia-docs-sync`, `materia-docs-audit`) that write these docs must follow this standard
