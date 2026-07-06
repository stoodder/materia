---
name: materia-init
description: Materialize the Materia harness into this repo. Interviews the engineer about what they're building (brainstorm survey → product identity & taste → tech-stack selection → capability probes), then writes MATERIA.md + CLAUDE.md + the docs/product.md product brief, generates the stack-specific standards docs, copies the pipeline skills and docs skeleton into place (pruning what the stack can't use), and seeds docs/specs/_proposed/ with a bootstrap epic so the pipeline's own first /materia-ship-spec run scaffolds the app. Run once on a fresh repo created from the Materia template; idempotent to re-run before the first bootstrap spec ships.
---

# materia-init — materialize Materia into this repo

The only live skill in the Materia template. One conversation takes the
engineer from a blank repo to a fully wired, stack-tailored spec-to-ship
pipeline — then hands the actual app scaffolding to the pipeline itself as its
first epic, so the harness dogfoods from commit one.

Everything init writes comes from `templates/` — the canonical, battle-tested
sources. **Init fills slots; it does not redraft contracts.** The queue
frontmatter contracts, producer lifecycle, RED gate, sole-writer retro rule,
and the tier machinery ship verbatim. The tier machinery includes
`MATERIA.md` § Skill routing — the per-skill / per-role model/effort
assignments (including their `opus` fallbacks), which are not stack-specific
and ship exactly as written, like the § Effort set
and § Coercion. Only the `{{slots}}` (among them § Model set availability) and
the stack-specific standards docs are authored fresh, from the survey.

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
- `docs/**` — the skeleton, the filled `docs/product.md` product brief, plus
  the generated stack-specific standards.
- `.claude/skills/**` — the pipeline skills, minus pruned ones.
- `scripts/check-docs.mjs`.
- `docs/epics/<dated-slug>/` + 2–N member proposals in
  `docs/specs/_proposed/` — the **bootstrap epic** (see Phase 7).
- `README.md` rewritten for the app; `templates/` and `.claude/skills/materia-init/`
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
- The **surface vocabulary** — how the outside world reaches the app: HTTP
  routes + pages, CLI commands, a public API/exports, events. This drives
  `docs/surface-map.md`'s table shape, the resource-doc template's layer
  sections, and which docs-router phrasings apply.
- Deploy intent (local-only, a PaaS, containers, serverless) — shapes the
  workflow standard and CI spec.

Product depth (name, market, taste) gets its own pass next — don't rush it
here; Phase 1 establishes *what*, Phase 2 establishes *for whom and how it
should feel*.

Use `AskUserQuestion` for discrete choices when available; otherwise plain
conversational turns. This phase is a conversation, not a form — follow the
interesting threads, then summarize back what you heard and confirm.

### Phase 2 — Product identity & taste

The questions engineers skip and then pay for in bland, incoherent features.
Everything lands in `docs/product.md` (the product brief — the pipeline's
taste and audience oracle); nothing here is throwaway color. Probe until
every brief section has a real answer:

- **Name & positioning** — the product's name (or working name), and the
  one-sentence way it should be described next to its alternatives.
- **Audience & market** — the primary user as a singular persona (role,
  context, sophistication); the market/space and the 2–3 adjacent or
  competing products; what this one deliberately does differently; who and
  what it is explicitly *not* for.
- **Design feel & taste** — five adjectives for how it should feel; 2–4
  taste-reference products with *what* to borrow from each (spacing, motion,
  density, color courage) and one anti-reference; palette direction,
  light/dark stance, typography vibe; how expressive motion should be.
- **Voice & tone** — how the product talks: terse or chatty, playful or
  neutral, error-message temperament; words it always/never uses.
- **Product principles** — 3–5 opinionated tie-breakers that settle feature
  debates before they start ("speed of capture beats completeness").

Offer grounded suggestions rather than blank questions — propose a feel and
taste references inferred from Phase 1 and let the engineer react; a
concrete wrong guess draws out taste faster than an open prompt. On repos
with no user-facing UI, compress to name, positioning, audience, voice
(CLI/API output has tone too), and principles — skip visual taste.

### Phase 3 — Stack selection

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
  *intended* commands into § Gate **plus its Bootstrap-grace marker line**
  (the gate spec's proposal id is minted in Phase 7 — write the marker now,
  patch the id there) so pre-bootstrap runs skip-and-record missing commands
  instead of blocking. Skip the marker only when the commands already exist
  at init time.

### Phase 4 — Capability probes

Each probe maps to a `MATERIA.md` section and a prune decision:

| Probe | Section | Prunes when absent |
|---|---|---|
| Does it have a user-facing UI? | § Surface gates § UI-affecting, § Eyes | `materia-design`, `materia-ui-test-plan`, `materia-ui-review`, `materia-ui-inspection` |
| How will agents *see* it? (browser automation — Playwright is the default for web — TUI capture, screenshot tooling) | § Eyes | — |
| Does it persist data? | § Surface gates § Data-affecting, § Data layer | the data-safety review angle (recorded in § Data layer as `none`) |
| Any extra review angles the domain demands (a11y, perf budgets, compliance)? | § Review angles | — |
| Anything unusual about cold-start (runtime versions, codegen, services)? | § Environment preflight | — |
| Which models are available for spawn routing, and is any premium tier opt-in? (Sensible default: haiku/sonnet/opus as `default`, the premium tier as `opt-in`.) This fills § Model set availability only — the per-skill § Skill routing assignments and their fixed `opus` fallbacks are **not** surveyed; they ship verbatim. | § Model set | — (a declared model outside the set coerces to the fallback) |

Skills that are never pruned: the two orchestrators, all pipeline mid-stages,
`materia-propose-spec`, `materia-propose-epic`, `materia-reconcile-epic`, `materia-report-bug`,
`materia-suggestions-to-specs`, `materia-bugs-to-reports`, `materia-triage-retros`,
`materia-apply-pipeline-improvements`, `materia-janitor`, `materia-librarian`.

### Phase 5 — Confirmation checkpoint

Draft everything in-memory and present one confirmation block: the § Identity
sentence, the product brief's spine (name/positioning · audience · the five
feel adjectives · taste references · principles), the stack, the § Gate
table, the surface-gate patterns, the Eyes choice, the § Model set availability
(the § Skill routing assignments and their fallbacks ship verbatim — not
surveyed),
the prune list with reasons, and the bootstrap
epic's proposed member specs (titles + one-liners). Reply verbs, with producer-lifecycle semantics
(`docs/standards/skills.md` § Producer lifecycle once materialized):
`approve` · `edit: <feedback>` · `cancel`. Nothing is written until
`approve`.

### Phase 6 — Materialize

On approve, in this order:

1. **Copy the skeleton:** `templates/docs/**` → `docs/`;
   `templates/scripts/check-docs.mjs` → `scripts/`; `templates/skills/**` →
   `.claude/skills/` **minus the pruned skills**. Pruning a **producer**
   additionally deletes its row from the target queue's producers table
   (`docs/specs/_proposed/README.md` / `docs/bugs/_reports/README.md`) and
   scrubs it from every other registration surface — linked or prose
   (`docs/standards/skills.md`'s kind/lifecycle rosters name producers in
   backticks) — a pruned skill must never stay advertised (a dangling link
   fails the self-check; a prose mention survives it, so sweep deliberately).
2. **Prune the doc skeleton to the stack:** adapt `docs/surface-map.md`'s
   tables to the surface vocabulary, and prune/rename
   `docs/_templates/resource.md`'s layer sections to the layers this stack
   actually has (delete Data model on persistence-less repos, Client API /
   UI on repos without them) — per that template's own init comment.
3. **Write `MATERIA.md`** from `templates/MATERIA.md`: fill every slot,
   mark absent capabilities `none`, fill `## Pruned skills`, delete the
   `<!-- init: … -->` comments.
4. **Write `CLAUDE.md`** from `templates/CLAUDE.md`: same treatment. The
   folder map documents the *intended* layout the bootstrap epic will create.
5. **Generate the stack-specific standards** under `docs/standards/`, using
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
     init (the design language barely exists yet); they grow via `materia-docs-sync`.
   - Register every generated standard as a row in `docs/README.md`
     § Standards and in `docs/contributing.md`'s touch-map slot.
6. **Write `docs/product.md`** from `templates/docs/product.md`: every
   section filled from Phase 2, opinionated, `{{slots}}` gone. When the repo
   ships UI, derive the `visual-language.md` seed from its § Design feel &
   taste (palette direction, density, motion stance) so the two never start
   contradictory.
7. **Fill the remaining doc slots:** `docs/README.md`, `docs/contributing.md`
   (DoD + touch-map rows), `docs/glossary.md` (seed the Phase 1 entities +
   the § Voice & tone vocabulary), and delete `docs/surface-map.md`'s init
   comment (its tables were already adapted in step 2). Extend `.claude/settings.json`
   `permissions.allow` (shipped with the template — routine git/gh/docs-check
   commands) with this stack's own routine commands: the § Gate rows, the
   § Run it recipe, the package manager, and the § Eyes provisioning script.
   Rules: **keep the shipped `deny` block intact**; never add merge, delete,
   or deploy commands (those stay prompted); prefer allowlisting the literal
   gate commands over a bare script path (a script's contents are mutable
   trust — any later PR can change what an allowlisted path executes); and
   add stack-specific `deny` rules for destructive stack commands the survey
   surfaced (database drop/reset, `compose down -v`-style teardowns).
8. **Rewrite `README.md`** for the app: name, one-liner, run-it, a short
   "how changes ship here" section pointing at `docs/specs/README.md` and
   the skill roster.
9. **Remove `templates/` and `.claude/skills/materia-init/`** — everything now lives
   in its materialized location; git history keeps the originals. (Skip this
   step if the engineer asked to keep them at the checkpoint.)
10. **Interim check:** run `node scripts/check-docs.mjs` and fix every failure
   it reports. This is the *interim* pass — the **binding** self-check runs at
   the end of Phase 7, after the bootstrap epic exists, so the green-gate
   guarantee covers everything init writes.
11. **Commit** in logical chunks (skeleton · MATERIA/CLAUDE · product brief ·
    standards · README/cleanup) directly to `main`, and push if a remote
    exists — **as bare `git push`** (or `git push -u origin HEAD` on first
    push). The shipped deny rules block explicit `git push origin main`
    spellings for the pipeline's sake; init's direct-to-main bootstrap is
    sanctioned, and the bare form is how it's expressed.

### Phase 7 — Seed the bootstrap epic

Write the app's first epic per the `docs/epics/README.md` contract —
`epic.md` (+ a brief `research.md` when Phase 3 involved real trade-off
research; **if you skip `research.md`, also remove `epic.md`'s templated
link to it**) — and 2–N member proposals into `docs/specs/_proposed/` with
`source: epic`, `epic: <epic-id>`, and a `depends_on` graph. **Link hygiene:**
in **member-proposal bodies**, write any reference to another repo file in
backtick/arrow form (`` text → path ``), never as a live markdown link —
proposal bodies are copied into differently-nested spec folders later, and a
live relative link is wrong in at least one location. (Same-folder sibling
links inside the epic folder — `epic.md → research.md` per the epic
contract's own template — are fine; epic folders are permanent and never
re-nested.) Mint every member's `id`
**first**, then **patch the `MATERIA.md` § Gate Bootstrap-grace marker with
S1's real proposal id** (Phase 6 wrote the marker with the id pending — a
marker still reading `<S1 proposal id>` after this step is a defect the
final self-check must catch). Shape the members as genuinely
single-shippable units; the typical decomposition:

- **S1 — App skeleton + local gate:** framework init, folder layout per
  `docs/standards/architecture.md`, every § Gate row real and green, the
  § Run it recipe working, and the `MATERIA.md` § Gate Bootstrap-grace
  marker (and its paragraph) deleted in the same PR — each of these an
  explicit acceptance criterion.
- **S2 — CI:** the full gate + `check:docs` on every PR (per
  `docs/standards/workflow.md`).
- **S3 (UI repos) — Eyes provisioning + first e2e:** the § Eyes provisioning
  recipe as a real script, one smoke e2e, the `test:e2e` gate row live.
- **S4+ —** the first thin vertical slice of the actual product, per
  Phase 1 — shaped by the brief's § Product principles.

**Final self-check (binding):** re-run `node scripts/check-docs.mjs` over
the full tree — now including the epic + proposals — and fix every failure;
then grep for any surviving `{{` slot marker, `<!-- init:` / `<!-- template:`
comment, or **unfilled init-obligation placeholder** (`<S1 proposal id>`,
`<epic-id>` — the specific tokens init was meant to substitute). Notation in
code fences or inline backticks (`<model>/<effort>`, `<row>`, `<dated-slug>`)
is retained documentation, not a placeholder — never "fix" it. Zero on all
three is the exit criterion; init never hands over a repo that fails its own
docs gate.

Commit the epic + members to `main` (still bootstrap), then hand off: tell
the engineer to run `/materia-ship-spec` (or `/materia-ship-spec --auto`) — from this point
every change flows through the pipeline and lands via PR.

### Phase 8 — Report

Close with: what was materialized (counts: skills copied, skills pruned,
standards generated, the product brief), the MATERIA.md sections marked
`none`, the bootstrap
epic's member list with the recommended shipping order, and the one-line
next step (`/materia-ship-spec`).

## Idempotency & re-runs

Re-running init **before any bootstrap spec has shipped** is safe: it
re-enters the survey with the previous `MATERIA.md` answers as defaults and
rewrites the materialized files wholesale. (After the default Phase 6
self-removal, first restore the inputs from history —
`git checkout <pre-init-sha> -- templates/ .claude/skills/materia-init/` —
then re-invoke; § Idempotency assumes that restore.) After the pipeline has started
shipping, init refuses to run wholesale (the repo is now the pipeline's to
evolve) and instead points at the right tool: `MATERIA.md` edits for stack
changes, `/materia-propose-spec` for new capabilities, re-copying a single pruned
skill from git history (`git show`) when a capability arrives later.

## Scope

- Does **not** scaffold the app itself — that is the bootstrap epic's job,
  built by `/materia-ship-spec` under review, gates, and docs discipline.
- Does **not** redraft the contracts in `templates/` — slots only.
- Does **not** create a GitHub repo, configure branch protection, or touch
  anything outside this repo.

## Rules

- Nothing is written before the Phase 5 `approve`.
- Every `MATERIA.md` section heading ships exactly as the template spells it
  — the pipeline skills reference them by name.
- A capability the engineer doesn't have is `none` + a prune, never a guessed
  placeholder command that will fail downstream.
- The self-check (green `check:docs`, zero `{{` markers) gates the final
  commit — init never hands over a repo that fails its own docs gate.
