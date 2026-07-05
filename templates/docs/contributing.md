# Contributing & Definition of Done

> Every change keeps the code **and** its docs true in the same commit. Docs
> describe the code as it **is**, not as it was or as you wish it were. A change
> that leaves a doc lying about the code is not done — fixing the doc is part of
> the change, not a follow-up.

## Definition of Done

A change is "done" only when every box is checked.

- [ ] `pnpm lint` passes (ESLint + Prettier; `pnpm run lint:fix` auto-fixes).
- [ ] `pnpm exec nuxt typecheck` is clean.
- [ ] `pnpm test` is green (the sibling `**/*.spec.ts` suite). CI runs all on
      every PR — see [standards/workflow.md](standards/workflow.md) §Branch, CI & deploy.
- [ ] Follows the standards. You read the relevant tiers in the order set by
      [README.md](README.md) §Read order before touching code, and the change
      obeys them ([standards/architecture.md](standards/architecture.md) and the
      `standards/*.md` your change falls under).
- [ ] **Barrels updated** for any new exports — `models/`, `contracts/`,
      `enums/`, `types/` only. **No** `index.ts` under `composables/**` or
      `server/utils/` (Nuxt auto-import flags it as a duplicate).
- [ ] New or changed source has its **sibling `.spec.ts`**, one per module — see
      [standards/testing.md](standards/testing.md).
- [ ] **Docs updated in the same change** — see the touch-X→update-Y map below.
- [ ] Branched off `main`; commit messages are clear and scoped. Open a PR
      **only when asked**.

## Keep the docs true — touch X → update Y

Find the row(s) your change matches; update **every** doc listed before the
change is done. When in doubt, the resource doc for the entity is almost always
in scope.

| You touched… | Update these docs |
|---|---|
| A Prisma model or a migration (`schema.prisma`, `prisma/migrations/**`) | the entity's `resources/<entity>.md` + [standards/data-and-loads.md](standards/data-and-loads.md) |
| Seeding or load-derivation (`prisma/seed*`, `server/utils/computeLoad.ts`, `LoadRule`) | the affected `resources/<entity>.md` + [standards/data-and-loads.md](standards/data-and-loads.md) |
| A backend model (`models/Xxx.ts`) or a route contract (`contracts/Xxx.ts`) | the entity's `resources/<entity>.md` + [standards/contracts-and-models.md](standards/contracts-and-models.md) |
| A Nitro route (`server/api/**`) | the entity's `resources/<entity>.md` + [standards/server-routes.md](standards/server-routes.md) + `surface-map.md` + (if the route shape is novel) [standards/workflow.md](standards/workflow.md) |
| A query or mutation composable (`composables/api/**`) | the entity's `resources/<entity>.md` + [standards/api-layer.md](standards/api-layer.md) |
| UI — a page, a component, or a presentation composable (`pages/**`, `components/**`, `composables/ui/**`) | the entity's `resources/<entity>.md` + [standards/ui-components.md](standards/ui-components.md) |
| A type or enum (`types/**`, `enums/**`) | [standards/types-enums.md](standards/types-enums.md) (+ the entity's `resources/<entity>.md` if it changes a wire shape) |
| A convention / rule (how we build anything) | the relevant `standards/*.md` **and** `CLAUDE.md` (the always-loaded copy must agree) |
| A Claude Code skill (`.claude/skills/**/SKILL.md`) — added, renamed, retired, or its role/model/inputs changed | [standards/skills.md](standards/skills.md) **and** every registration surface it lists (README §Shipping changes graph + tables, `CLAUDE.md` pipeline paragraph, `docs/specs/README.md`, and — for a producer — `docs/specs/_proposed/README.md`) |
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
   example first — [resources/week.md](resources/week.md) for a resource,
   [standards/architecture.md](standards/architecture.md) for a standard.
3. **Register it** — add a row to the matching index table in
   [README.md](README.md) (Standards or Resources).
4. **Cross-link** — add it to the **Related** section of every doc it relates
   to, and link back from it.
5. **Run the docs checks** (below) and confirm they exit `0`.

## Docs checks (links + style)

A committed, deterministic script (`scripts/check-docs.mjs` — pure Node, no
network, no AI) enforces three layers:

1. **Links** (`CLAUDE.md` + all of `docs/**` + `.claude/skills/**`): every
   relative Markdown link resolves to a real file. External (`http(s)://`,
   `mailto:`) links are skipped, as is link syntax inside code fences or
   inline code (backtick a `[text](path)` example to exempt it).
2. **Anchors** (the agent-context docs + `.claude/skills/**`): every
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
node scripts/check-docs.mjs
```

CI runs it on every PR (the `docs` job in `.github/workflows/ci.yml`), so a
broken cross-link or a style regression fails the build.

## Related

- [README.md](README.md) — read order, doc index, "keep these docs true"
- [standards/workflow.md](standards/workflow.md) — route recipe, commands, CI/deploy
- [standards/testing.md](standards/testing.md) — sibling specs, one per module
- [standards/architecture.md](standards/architecture.md) — folder rules, barrels, layering
