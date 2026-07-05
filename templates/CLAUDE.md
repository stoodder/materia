# CLAUDE.md

<!-- init: fill every {{slot}} from the survey + generated standards, then
     delete these comments. Keep this file lean — depth lives in docs/. -->

The always-loaded guide. Keep it lean — depth lives in `docs/`. Read this,
then follow the context protocol below **before writing anything**.

## What this is

{{two or three sentences: what the app is, who it's for, where it runs
(local + prod). Mirrors MATERIA.md § Identity but written for a working
agent's orientation.}}

## Context protocol — build context in this order, every time

1. **This file** — the rules in brief + the map below. (You're here.)
2. **[`docs/README.md`](docs/README.md)** — the router. Pick the standards +
   resource docs that match your change.
3. **`docs/standards/*` + `docs/resources/*`** — read the relevant ones
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

Commands + deploy: [docs/standards/workflow.md](docs/standards/workflow.md).

## Folder map (kind-pure — one kind of thing per folder)

```
{{one line per folder: path, then what single kind of thing lives there.
End with:
docs/          ← the context map; start at docs/README.md}}
```

## Non-negotiables (depth behind each link)

<!-- init: generate one bullet per stack-specific standard you write into
     docs/standards/, each linking to its doc. Always keep the final two
     universal bullets. -->

{{stack-specific one-liners → docs/standards/*.md}}

- **Comments** — only when *why* is non-obvious; never narrate what the code
  does.
- **Docs** — docs are agent context: present-state only (no change narration),
  one home per fact, short table cells; `check:docs` enforces the checkable
  subset; `/materia-librarian` sweeps and fixes accumulated drift on demand or on a
  schedule. → [docs](docs/standards/docs.md)

## Resources (one doc per entity — read the one you're touching)

{{list the resource docs as they come to exist — /materia-init seeds this empty;
docs-sync adds entries as the app grows}} — all under
[docs/resources/](docs/resources/).

Reference: [glossary](docs/glossary.md) · [surface-map](docs/surface-map.md).

**Building or fixing via the pipelines?** Two orchestrators, two queues, one
self-improvement loop — the full map (stage chains, producer/consumer tables,
flow graphs) lives at [docs/specs/README.md](docs/specs/README.md); read
that, not this paragraph, for the details.

- `/materia-ship-spec` builds a feature end-to-end from the proposed-specs queue
  ([docs/specs/_proposed/](docs/specs/_proposed/README.md)); `/materia-fix-bug`
  drives a bug report from the bug queue
  ([docs/bugs/_reports/](docs/bugs/_reports/README.md)) to a RED→GREEN TDD
  fix. Both are resumable and open exactly one PR. With `--auto` (autopilot),
  `/materia-ship-spec` also rides that PR to green — fixing CI, resolving merge
  conflicts — and merges it.
- **Producers** fill the queues; **maintainers** (`/materia-janitor`, `/materia-librarian`)
  fix drift directly instead of filing queue entries — the roster and shared
  lifecycle live in [skills](docs/standards/skills.md).
- **Epics** ([docs/epics/](docs/epics/README.md)) group multiple specs under
  one researched initiative with a dependency graph.
- Every run leaves a `retro.md`; `/materia-triage-retros` triages retros three ways
  (pipeline findings / product suggestions / bugs) and
  `/materia-apply-pipeline-improvements` applies the plan back into the skills — the
  pipeline improves itself. Authoring or changing any skill →
  [skills](docs/standards/skills.md).

## Before you finish

The full gate (every non-`none` row of [MATERIA.md](MATERIA.md) § Gate) must
pass locally — CI runs the same checks on every PR.
{{known gate gotchas + their one-line fixes, from MATERIA.md § Environment
preflight}}
Definition of Done + which docs to update:
[docs/contributing.md](docs/contributing.md).
