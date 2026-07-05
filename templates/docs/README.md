# Docs — agent context map

<!-- init: fill the {{slots}}, add one Standards row per generated standard
     and leave the Resources table empty (it grows with the app), then delete
     these comments. The five standards marked "canonical" below are
     referenced by name from the pipeline skills — always generate them. -->

These docs exist to **build an agent's working context before it touches code**.
They are written for progressive disclosure: load the small thing that points at
the next small thing, and only read code once you know which files matter.

## Read order (always)

1. **`CLAUDE.md`** (repo root) — the always-loaded rules + this map. Start there.
2. **`docs/README.md`** (this file) — pick the standards and resources relevant
   to your change from the tables below.
3. **`docs/standards/*`** + **`docs/resources/*`** — read only the ones that
   apply. Each resource doc ends with a **Canonical files** list.
4. **The code** — open the files a doc named, now that you know the shape and the
   standards they must follow.

Do not skip a tier. The docs tell you what already exists so you reuse it
instead of reinventing it.

**Read only what your change touches** — the resource doc(s) for the entities
involved plus the standards those docs link, not the whole tree. Each resource
doc's **Canonical files** and **Related** sections bound your reading. New to the
domain? Skim [glossary.md](glossary.md). Need a route or
page fast? [surface-map.md](surface-map.md).

> Keep these docs true. If you change code in a way that changes what a doc
> says, update the doc in the same change — docs describe the code as it is, not
> as it was. Before you call a change done, read **[contributing.md](contributing.md)**
> (Definition of Done + which docs to update).

## Standards (cross-cutting "how we build")

| Doc | Read when you are… |
|---|---|
| [standards/architecture.md](standards/architecture.md) *(canonical)* | adding/moving any file — folder rules, layering, naming |
| [standards/testing.md](standards/testing.md) *(canonical)* | writing any test — the test kinds, their locations, and conventions |
| [standards/workflow.md](standards/workflow.md) *(canonical)* | building a change end-to-end, branching, deploy/CI, commands |
| {{one row per additional generated standard — request-lifecycle, layer standards (data, server routes, API layer, contracts), UI standards (ui-components, visual-language), types/enums, …}} | {{…}} |
| [standards/skills.md](standards/skills.md) *(canonical)* | authoring or changing a Claude Code skill (`.claude/skills/**`) — SKILL.md anatomy, tiers, registration surfaces |
| [standards/docs.md](standards/docs.md) *(canonical)* | writing or editing any doc here — present-state only, one home per fact, cell/size budgets, what `check:docs` enforces |

## Resources (one per domain entity)

Each maps to a persistence model (or a derived read path) and documents its
model, contracts, routes, client API, UI, rules, and canonical files. This
table starts empty and grows as the app grows — `materia-docs-sync` and
`contributing.md` § Adding a new doc keep it registered.

| Doc | Entity |
|---|---|

## Reference & process

| Doc | What |
|---|---|
| [product.md](product.md) | the product brief — name, audience & market, design feel & taste, voice, product principles; the taste oracle intake/design read |
| [glossary.md](glossary.md) | domain + codebase terms, one line each |
| [surface-map.md](surface-map.md) | every HTTP route + every page, in one table |
| [contributing.md](contributing.md) | **read before calling a change done** — Definition of Done, doc-update map, how to add a doc |
| [specs/README.md](specs/README.md) | the spec-to-ship pipeline (`.claude/skills/`) + per-feature spec/design/architecture/task artifacts |
| [epics/README.md](epics/README.md) | epics — multi-spec initiatives: the `epic.md`/`research.md` contract, epic↔member linkage, and the `materia-propose-epic`/`materia-reconcile-epic` lifecycle |
| [bugs/README.md](bugs/README.md) | the bug-report queue — producers, consumer (`/materia-fix-bug`), and per-run folder schema |
| [research/README.md](research/README.md) | durable research notes (external practice + agent research) that inform product and pipeline decisions; cited by proposals via `source_refs` |
| [../MATERIA.md](../MATERIA.md) | the stack adaptation surface — gate commands, run recipe, preflight, surface gates, eyes |

## Authoring a doc

Copy a stub and fill it in — [_templates/resource.md](_templates/resource.md) or
[_templates/standard.md](_templates/standard.md). Then follow the full flow
(add a row to the index table above, cross-link, run the link check) in
[contributing.md](contributing.md).

Keep docs concise and skimmable: prefer a table or a short example over prose, and
**link rather than duplicate — each fact lives in exactly one doc.** The full
authoring rules (present-state only, cell/size budgets, what `check:docs`
enforces) live in [standards/docs.md](standards/docs.md).
