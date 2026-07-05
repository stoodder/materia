---
name: init
description: Materialize the Materia harness into this repo. Interviews the engineer about what they're building (brainstorm survey → tech-stack selection → capability probes), then writes MATERIA.md + CLAUDE.md, generates the stack-specific standards docs, copies the pipeline skills and docs skeleton into place (pruning what the stack can't use), and seeds docs/specs/_proposed/ with a bootstrap epic so the pipeline's own first /ship-spec run scaffolds the app. Run once on a fresh repo created from the Materia template; idempotent to re-run before the first bootstrap spec ships.
---

# init — materialize Materia into this repo

The only live skill in the Materia template. One conversation takes the
engineer from a blank repo to a fully wired, stack-tailored spec-to-ship
pipeline — then hands the actual app scaffolding to the pipeline itself as its
first epic, so the harness dogfoods from commit one.

Everything init writes comes from `templates/` — the canonical, battle-tested
sources. **Init fills slots; it does not redraft contracts.** The queue
frontmatter contracts, producer lifecycle, RED gate, sole-writer retro rule,
and tier vocabulary ship verbatim; only the `{{slots}}` and the stack-specific
standards docs are authored fresh, from the survey.

## Inputs

- `templates/MATERIA.md`, `templates/CLAUDE.md` — the slotted companion-doc
  and guide templates.
- `templates/skills/**` — the canonical pipeline skills.
- `templates/docs/**` — the docs-system skeleton (contracts, `_templates/`,
  canonical standards, stubs).
- `templates/scripts/check-docs.mjs` — the portable docs checker.
- The engineer, interactively — this is the most interactive skill in the
  harness; everything downstream runs autonomously *because* this survey
  resolved the ambiguity up front.

## Outputs

All committed to `main` (init is the bootstrap exception to branch-and-PR
discipline — there is nothing to diff against yet):

- `MATERIA.md` (repo root) — every section filled, `none` where a capability
  is absent, `## Pruned skills` recording what was left out and why.
- `CLAUDE.md` (repo root) — the always-loaded guide, slots filled.
- `docs/**` — the skeleton, plus the generated stack-specific standards.
- `.claude/skills/**` — the pipeline skills, minus pruned ones.
- `scripts/check-docs.mjs`.
- `docs/epics/<dated-slug>/` + 2–N member proposals in
  `docs/specs/_proposed/` — the **bootstrap epic** (see Phase 6).
- `README.md` rewritten for the app; `templates/` and `.claude/skills/init/`
  removed (their content now lives in its materialized locations; git history
  keeps the originals).

## Procedure

### Phase 1 — Brainstorm: what are you building?

Open free-form. Ask the engineer to describe the app in their own words, then
probe until you can write one crisp sentence for `MATERIA.md` § Identity plus
a short paragraph for `CLAUDE.md` § What this is. Resolve at minimum:

- What the app does and for whom (single-user tool? multi-tenant SaaS? CLI?
  API-only service?).
- The usage context that should color every future spec (device, environment,
  cadence — the analogue of "on a phone, mid-workout").
- The 3–5 core domain entities the engineer already knows about (these seed
  the glossary and the first resource docs when the bootstrap epic ships).
- Deploy intent (local-only, a PaaS, containers, serverless) — shapes the
  workflow standard and CI spec.

Use `AskUserQuestion` for discrete choices when available; otherwise plain
conversational turns. This phase is a conversation, not a form — follow the
interesting threads, then summarize back what you heard and confirm.

### Phase 2 — Stack selection

Recommend a stack **grounded in Phase 1**, not a menu of everything. Present
2–3 coherent options (framework + language + persistence + styling + test
runners + package manager), each with a one-line rationale tied to what
they're building, and a clear recommendation. The engineer may also name
their stack outright — never argue them out of a stack they know.

Resolve, concretely enough to write `MATERIA.md` § Stack, § Run it, and
§ Gate:

- Language(s) + framework(s) + package manager.
- Persistence + ORM/driver (or none).
- Test runners: unit/integration, and e2e (or none).
- The dev-run recipe (command, URL/port, dev credentials if any).
- The intended gate commands (`lint` · `typecheck` · `test` · `test:e2e`).
  These may not exist yet — the bootstrap epic creates them; write the
  *intended* commands into § Gate.

### Phase 3 — Capability probes

Each probe maps to a `MATERIA.md` section and a prune decision:

| Probe | Section | Prunes when absent |
|---|---|---|
| Does it have a user-facing UI? | § Surface gates § UI-affecting, § Eyes | `design`, `ui-test-plan`, `ui-review`, `ui-inspection` |
| How will agents *see* it? (browser automation — Playwright is the default for web — TUI capture, screenshot tooling) | § Eyes | — |
| Does it persist data? | § Surface gates § Data-affecting, § Data layer | the data-safety review angle (recorded in § Data layer as `none`) |
| Any extra review angles the domain demands (a11y, perf budgets, compliance)? | § Review angles | — |
| Anything unusual about cold-start (runtime versions, codegen, services)? | § Environment preflight | — |
| Which models are available for spawn routing, and is any premium tier opt-in? (Sensible default: haiku/sonnet/opus as `default`, the premium tier as `opt-in`; the fallback pair.) | § Tiers | — (a declared model outside the set coerces to the fallback) |

Skills that are never pruned: the two orchestrators, all pipeline mid-stages,
`propose-spec`, `propose-epic`, `reconcile-epic`, `report-bug`,
`suggestions-to-specs`, `bugs-to-reports`, `triage-retros`,
`apply-pipeline-improvements`, `janitor`, `librarian`.

### Phase 4 — Confirmation checkpoint

Draft everything in-memory and present one confirmation block: the § Identity
sentence, the stack, the § Gate table, the surface-gate patterns, the Eyes
choice, the § Tiers model set (availability + fallback), the prune list with
reasons, and the bootstrap epic's proposed member specs (titles +
one-liners). Reply verbs, with producer-lifecycle semantics
(`docs/standards/skills.md` § Producer lifecycle once materialized):
`approve` · `edit: <feedback>` · `cancel`. Nothing is written until
`approve`.

### Phase 5 — Materialize

On approve, in this order:

1. **Copy the skeleton:** `templates/docs/**` → `docs/`;
   `templates/scripts/check-docs.mjs` → `scripts/`; `templates/skills/**` →
   `.claude/skills/` **minus the pruned skills**.
2. **Write `MATERIA.md`** from `templates/MATERIA.md`: fill every slot,
   mark absent capabilities `none`, fill `## Pruned skills`, delete the
   `<!-- init: … -->` comments.
3. **Write `CLAUDE.md`** from `templates/CLAUDE.md`: same treatment. The
   folder map documents the *intended* layout the bootstrap epic will create.
4. **Generate the stack-specific standards** under `docs/standards/`, using
   `docs/_templates/standard.md`'s spine (Rule / Why / How / Where it lives /
   Related):
   - **Always:** `architecture.md` (folder rules, layering, naming — the
     kind-purity and one-export-per-file ethos adapted to the stack),
     `testing.md` (test kinds, locations, conventions; § End-to-end section
     when e2e exists), `workflow.md` (branch discipline, commands, CI shape,
     deploy) — these three are referenced by name from the pipeline skills.
   - **Per stack:** one standard per product layer the stack actually has
     (data, server routes, API/client-state layer, contracts/models,
     types/enums), each stating the conventions the survey settled.
   - **UI repos:** `ui-components.md` + `visual-language.md` seeds — thin at
     init (the design language barely exists yet); they grow via `docs-sync`.
   - Register every generated standard as a row in `docs/README.md`
     § Standards and in `docs/contributing.md`'s touch-map slot.
5. **Fill the remaining doc slots:** `docs/README.md`, `docs/contributing.md`
   (DoD + touch-map rows), `docs/glossary.md` (seed the Phase 1 entities).
6. **Rewrite `README.md`** for the app: name, one-liner, run-it, a short
   "how changes ship here" section pointing at `docs/specs/README.md` and
   the skill roster.
7. **Remove `templates/` and `.claude/skills/init/`** — everything now lives
   in its materialized location; git history keeps the originals. (Skip this
   step if the engineer asked to keep them at the checkpoint.)
8. **Self-check:** run `node scripts/check-docs.mjs` and fix every failure it
   reports — init must hand over a green docs gate. Grep the materialized
   tree for any surviving `{{` slot marker or `<!-- init:` comment; zero is
   the exit criterion.
9. **Commit** in logical chunks (skeleton · MATERIA/CLAUDE · standards ·
   README/cleanup) directly to `main`, and push if a remote exists.

### Phase 6 — Seed the bootstrap epic

Write the app's first epic per the `docs/epics/README.md` contract —
`epic.md` (+ a brief `research.md` when Phase 2 involved real trade-off
research) — and 2–N member proposals into `docs/specs/_proposed/` with
`source: epic`, `epic: <epic-id>`, and a `depends_on` graph. Shape the
members as genuinely single-shippable units; the typical decomposition:

- **S1 — App skeleton + local gate:** framework init, folder layout per
  `docs/standards/architecture.md`, every § Gate row real and green, the
  § Run it recipe working.
- **S2 — CI:** the full gate + `check:docs` on every PR (per
  `docs/standards/workflow.md`).
- **S3 (UI repos) — Eyes provisioning + first e2e:** the § Eyes provisioning
  recipe as a real script, one smoke e2e, the `test:e2e` gate row live.
- **S4+ —** the first thin vertical slice of the actual product, per Phase 1.

Commit the epic + members to `main` (still bootstrap), then hand off: tell
the engineer to run `/ship-spec` (or `/ship-spec --auto`) — from this point
every change flows through the pipeline and lands via PR.

### Phase 7 — Report

Close with: what was materialized (counts: skills copied, skills pruned,
standards generated), the MATERIA.md sections marked `none`, the bootstrap
epic's member list with the recommended shipping order, and the one-line
next step (`/ship-spec`).

## Idempotency & re-runs

Re-running init **before any bootstrap spec has shipped** is safe: it
re-enters the survey with the previous `MATERIA.md` answers as defaults and
rewrites the materialized files wholesale. After the pipeline has started
shipping, init refuses to run wholesale (the repo is now the pipeline's to
evolve) and instead points at the right tool: `MATERIA.md` edits for stack
changes, `/propose-spec` for new capabilities, re-copying a single pruned
skill from git history (`git show`) when a capability arrives later.

## Scope

- Does **not** scaffold the app itself — that is the bootstrap epic's job,
  built by `/ship-spec` under review, gates, and docs discipline.
- Does **not** redraft the contracts in `templates/` — slots only.
- Does **not** create a GitHub repo, configure branch protection, or touch
  anything outside this repo.

## Rules

- Nothing is written before the Phase 4 `approve`.
- Every `MATERIA.md` section heading ships exactly as the template spells it
  — the pipeline skills reference them by name.
- A capability the engineer doesn't have is `none` + a prune, never a guessed
  placeholder command that will fail downstream.
- The self-check (green `check:docs`, zero `{{` markers) gates the final
  commit — init never hands over a repo that fails its own docs gate.
