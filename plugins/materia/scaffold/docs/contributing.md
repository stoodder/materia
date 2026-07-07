# Contributing & Definition of Done

<!-- init: fill every {{slot}} from the generated standards set, then delete
     these comments. Keep the universal rows and sections verbatim. -->

> Every change keeps the code **and** its docs true in the same commit. Docs
> describe the code as it **is**, not as it was or as you wish it were. A change
> that leaves a doc lying about the code is not done — fixing the doc is part of
> the change, not a follow-up.

## Definition of Done

A change is "done" only when every box is checked.

- [ ] Every non-`none` gate row in [MATERIA.md](../MATERIA.md) § Gate passes
      (`lint` · `typecheck` · `test` · `check:docs`). CI runs the same checks
      on every PR — see [standards/workflow.md](standards/workflow.md).
- [ ] Follows the standards. You read the relevant tiers in the order set by
      [README.md](README.md) §Read order before touching code, and the change
      obeys them ([standards/architecture.md](standards/architecture.md) and the
      `standards/*.md` your change falls under).
- [ ] {{stack-specific structural checks — e.g. barrels/index files updated for
      new exports, codegen re-run after schema changes}}
- [ ] New or changed source has its tests, per
      [standards/testing.md](standards/testing.md).
- [ ] **Docs updated in the same change** — see the touch-X→update-Y map below.
- [ ] Branched off the trunk (`MATERIA.md` § Version control); commit
      messages are clear and scoped. Open a PR **only when asked**.

## Keep the docs true — touch X → update Y

Find the row(s) your change matches; update **every** doc listed before the
change is done. When in doubt, the resource doc for the entity is almost always
in scope.

| You touched… | Update these docs |
|---|---|
| {{one row per stack layer — schema/migrations, seeds, server routes, client
  state, UI, types — each pointing at the entity's `resources/<entity>.md`
  plus the matching `standards/*.md`; server-route rows also update
  `surface-map.md`}} | {{…}} |
| A convention / rule (how we build anything) | the relevant `standards/*.md` **and** `CLAUDE.md` (the always-loaded copy must agree) |
| The stack itself (gate commands, run recipe, preflight, surface gates, eyes) | [MATERIA.md](../MATERIA.md) — the pipeline reads it by section |
| A Claude Code skill this repo owns (`.claude/skills/**/SKILL.md`, distinct from the `materia` plugin's own pipeline skills, which are installed and versioned upstream) — added, renamed, retired, or its role/model/inputs changed | [standards/skills.md](standards/skills.md) **and** every registration surface it lists (`CLAUDE.md` pipeline paragraph, `docs/specs/README.md`, and — for a producer — the target queue's README) |
| A new domain term | `glossary.md` |
| Any doc under `docs/` root, `resources/`, `standards/`, or `_templates/` | follow [standards/docs.md](standards/docs.md) — present-state only, one home per fact, cell/size budgets |

`surface-map.md` and `glossary.md` are docs/-root siblings (alongside
[README.md](README.md)). If a row points at one that does not exist yet, create
it per **Adding a new doc** below as part of the same change.

## Adding a new doc

1. **Copy the right template:**
   - new entity → [_templates/resource.md](_templates/resource.md) → `resources/<entity>.md`
   - new cross-cutting rule → [_templates/standard.md](_templates/standard.md) → `standards/<topic>.md`
2. **Fill it in**, mirroring the template headings exactly. Read a finished
   example first when one exists.
3. **Register it** — add a row to the matching index table in
   [README.md](README.md) (Standards or Resources).
4. **Cross-link** — add it to the **Related** section of every doc it relates
   to, and link back from it.
5. **Run the docs checks** (below) and confirm they exit `0`.

## Docs checks (links + style)

A committed, deterministic script (`scripts/check-docs.sh` — portable POSIX
`sh`+`awk`, no network, no AI) enforces three layers:

1. **Links** (`CLAUDE.md` + all of `docs/**`): every
   relative Markdown link resolves to a real file. External (`http(s)://`,
   `mailto:`) links are skipped, as is link syntax inside code fences or
   inline code (backtick a `[text](path)` example to exempt it).
2. **Anchors** (the agent-context docs): every
   `#fragment` in a relative link resolves to a real heading in the target
   file (GitHub-style slugs, dash-run-normalized).
3. **Style** (`CLAUDE.md` + `docs/` root + `resources/` + `standards/` +
   `_templates/` only — the agent-context docs governed by
   [standards/docs.md](standards/docs.md)): no change-narration phrases
   (matched across line wraps; inline code is exempt), no lines over 600
   chars (mega table cells), no duplicated long lines, and the glossary table
   stays alphabetical.

Run it from the repo root; it exits non-zero and lists every failure:

```bash
sh scripts/check-docs.sh
```

CI runs it on every PR, so a broken cross-link or a style regression fails
the build.

## Related

- [README.md](README.md) — read order, doc index, "keep these docs true"
- [standards/workflow.md](standards/workflow.md) — commands, CI/deploy
- [standards/testing.md](standards/testing.md) — the test conventions
- [standards/architecture.md](standards/architecture.md) — folder rules, layering
