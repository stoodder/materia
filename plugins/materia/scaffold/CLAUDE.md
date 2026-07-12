# CLAUDE.md

<!-- init: fill every {{slot}} from the interview + generated standards, then
     delete these comments. Keep this file lean — depth lives in .materia/docs/. -->

The always-loaded guide. Keep it lean — depth lives in `.materia/docs/`. Read this,
then follow the context protocol below **before writing anything**.

## What this is

{{two or three sentences: what the app is, who it's for, where it runs
(local + prod). Mirrors MATERIA.md § Identity but written for a working
agent's orientation.}}

Product depth — goals, audience, market, design feel & taste, voice,
principles: [.materia/docs/product.md](.materia/docs/product.md).

## Context protocol — build context in this order, every time

1. **This file** — the rules in brief + the map below. (You're here.)
2. **[`.materia/docs/README.md`](.materia/docs/README.md)** — the router. Pick the standards +
   resource docs that match your change.
3. **`.materia/docs/standards/*` + `.materia/docs/resources/*`** — read the relevant ones
   **before touching code**. Each resource doc ends with the exact code files
   it covers.
4. **The code** — open those files last, now that you know the shape and the
   standards they must follow.

Never skip a tier. The docs exist so you **reuse existing resources instead
of reinventing them** and account for the standards. When you change code,
update the matching doc in the same change — docs describe the code as it is.

## Stack

{{one paragraph, the MATERIA.md § Stack content in prose. Stack mechanics
(commands, preflight, gates) live in MATERIA.md — link, don't restate.}}

Stack-specific pipeline mechanics (gate commands, environment preflight,
surface gates, eyes): [MATERIA.md](MATERIA.md).

## Run it

```bash
{{the MATERIA.md § Run it command}}
```

Commands + deploy: [.materia/docs/standards/workflow.md](.materia/docs/standards/workflow.md).

## Folder map (kind-pure — one kind of thing per folder)

```
{{one line per folder: path, then what single kind of thing lives there.
End with:
.materia/docs/ ← the context map; start at .materia/docs/README.md}}
```

## Non-negotiables (depth behind each link)

<!-- init: generate one bullet per stack-specific standard you write into
     .materia/docs/standards/, each linking to its doc. Always keep the final two
     universal bullets. -->

{{stack-specific one-liners → .materia/docs/standards/*.md}}

- **Comments** — only when *why* is non-obvious; never narrate what the code
  does.
- **Docs** — docs are agent context: present-state only (no change narration),
  one home per fact, short table cells; `check:docs` enforces the checkable
  subset; `/materia:librarian` sweeps and fixes accumulated drift on demand or on a
  schedule. → [docs](.materia/docs/standards/docs.md)

## Resources (one doc per entity — read the one you're touching)

{{list the resource docs as they come to exist — /materia:init seeds this empty;
docs-sync adds entries as the app grows}} — all under
[.materia/docs/resources/](.materia/docs/resources/).

Reference: [glossary](.materia/docs/glossary.md) · [surface-map](.materia/docs/surface-map.md).

**Building or fixing via the pipelines?** Two orchestrators, two queues, and a
retro-triage loop that feeds the backlog — the full map (stage chains,
producer/consumer tables, flow graphs) lives at
[.materia/docs/specs/README.md](.materia/docs/specs/README.md); read that, not this paragraph,
for the details.

- `/materia:ship-spec` builds a feature end-to-end from the proposed-specs queue
  ([.materia/docs/specs/_proposed/](.materia/docs/specs/_proposed/README.md)); `/materia:fix-bug`
  drives a bug report from the bug queue
  ([.materia/docs/bugs/_reports/](.materia/docs/bugs/_reports/README.md)) to a RED→GREEN TDD
  fix. On an interactive, design-bearing (UI) run, `/materia:ship-spec` pauses
  at a design gate for your approval before continuing (`--auto` runs don't
  pause there). Both are resumable and open exactly one PR. With `--auto`
  (autopilot), `/materia:ship-spec` also rides that PR to green — fixing CI,
  resolving merge conflicts — and merges it.
- **Producers** fill the queues; **maintainers** (`/materia:janitor`, `/materia:librarian`)
  fix drift directly instead of filing queue entries — the roster and shared
  lifecycle live in [skills](.materia/docs/standards/skills.md).
- **Epics** ([.materia/docs/epics/](.materia/docs/epics/README.md)) group multiple specs under
  one researched initiative with a dependency graph.
- Every run leaves a `retro.md`; `/materia:triage-retros` clusters that signal
  and authors it directly into the project's backlog — proposed specs into
  [.materia/docs/specs/_proposed/](.materia/docs/specs/_proposed/README.md) and bug reports into
  [.materia/docs/bugs/_reports/](.materia/docs/bugs/_reports/README.md) (`source: retro-triage`) —
  in one PR. Authoring or changing any skill → [skills](.materia/docs/standards/skills.md).

## Before you finish

The full gate (every non-`none` row of [MATERIA.md](MATERIA.md) § Gate) must
pass locally — CI runs the same checks on every PR.
{{known gate gotchas + their one-line fixes, from MATERIA.md § Environment
preflight}}
Definition of Done + which docs to update:
[.materia/docs/contributing.md](.materia/docs/contributing.md).
