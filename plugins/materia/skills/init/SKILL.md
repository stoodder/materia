---
name: init
description: Materialize the Materia harness into this repo. Interviews the engineer through a staged eight-chapter intake (concept → goals & success → audience & market → branding → visual taste → voice & tone → tech stack → capability probes), driven by batched AskUserQuestion rounds where every non-essential question is explicitly skippable, then writes MATERIA.md + CLAUDE.md + the .materia/docs/product.md product brief, generates the stack-specific standards docs, materializes the docs skeleton, check-docs.sh, the .materia/review-angles/ review-angle library, and the .materia/project.json project-state file, and seeds .materia/docs/specs/_proposed/ with a bootstrap epic so the pipeline's own first /materia:ship-spec run scaffolds the app. Reads its sources from the plugin's bundled scaffold at ${CLAUDE_PLUGIN_ROOT}/scaffold; copies no skills into the repo (they run from the installed materia plugin) and prunes nothing. Run once on a fresh repo after installing the materia plugin; idempotent to re-run before the first bootstrap spec ships.
---

# init — materialize Materia into this repo

The per-repo scaffolder of the `materia` plugin. One conversation takes the
engineer from a blank repo to a fully wired, stack-tailored spec-to-ship
pipeline — then hands the actual app scaffolding to the pipeline itself as its
first epic, so the harness dogfoods from commit one.

The pipeline skills are **installed globally** with the `materia` plugin and
run from that read-only cache — init copies **no** skills into the repo and
prunes **nothing**. What init writes into the user repo (MATERIA.md, CLAUDE.md,
`.materia/docs/**`, `.materia/**`) it reads from the plugin's bundled scaffold
at `${CLAUDE_PLUGIN_ROOT}/scaffold/` — the canonical, battle-tested sources.
**Init fills slots; it does not redraft contracts.** The queue frontmatter
contracts, producer lifecycle, RED gate, sole-writer retro rule, and the tier
machinery ship verbatim. The tier machinery includes `MATERIA.md` § Skill
routing — the per-skill / per-role model/effort assignments (including their
`opus` fallbacks), which are not stack-specific and ship exactly as written,
like the § Effort set and § Coercion. The **review-angle library** ships
verbatim the same way: the twelve canonical `.materia/review-angles/` files
and their `MATERIA.md` § Review angles registry rows are not stack-specific —
the interview only *appends* any repo-specific angles (Chapter 8). Only the
`{{slots}}` and the stack-specific standards docs are authored fresh, from the
interview (§ Model set ships populated — the interview only trims a model the
plan can't spawn).

## Inputs

All sources are **bundled inside the installed plugin**, read via
`${CLAUDE_PLUGIN_ROOT}/scaffold/...` — a read-only cache init reads from and
never modifies. To actively open one, resolve the token in the **shell** (the
Read tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path) — e.g.
`cat "$CLAUDE_PLUGIN_ROOT/scaffold/MATERIA.md"`.

- `${CLAUDE_PLUGIN_ROOT}/scaffold/MATERIA.md`, `${CLAUDE_PLUGIN_ROOT}/scaffold/CLAUDE.md`
  — the slotted companion-doc and guide templates.
- `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/docs/**` — the docs-system skeleton (contracts,
  `_templates/`, canonical standards, stubs), including the
  `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/docs/product.md` brief template.
- `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/scripts/check-docs.sh` — the portable docs checker.
- `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/review-angles/**` — the review-angle
  library (the twelve canonical angle definitions + the directory `README.md`),
  materialized so projects can fork or extend it; the `MATERIA.md` § Review
  angles registry maps each to its File / Gate / Tier.
- `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/project.json` — the project-state
  file (artifact schema, baseline source, applied migrations, and an
  `acknowledgedChanges` array pre-filled with every change id at the
  scaffold's own schema — see `plugins/materia/release/README.md` — so a
  fresh install starts with nothing to adopt), materialized verbatim so the
  repo is tracked from init forward. Copied, not authored — init fills no slot
  in it.
- The engineer, interactively — this is the most interactive skill in the
  harness; everything downstream runs autonomously *because* this interview
  resolved the ambiguity up front.

## Outputs

All committed to the repo's default branch (init is the bootstrap exception to
branch-and-PR discipline — there is nothing to diff against yet):

- `MATERIA.md` (repo root) — every section filled, `none` where a capability
  is absent.
- `CLAUDE.md` (repo root) — the always-loaded guide, slots filled.
- `.materia/docs/**` — the skeleton, the filled `.materia/docs/product.md` product brief, plus
  the generated stack-specific standards.
- `.materia/scripts/check-docs.sh`.
- `.materia/review-angles/**` — the review-angle library (twelve canonical
  angle files + `README.md`), materialized verbatim; repo-specific angles
  append as new files + `MATERIA.md` § Review angles rows.
- `.materia/project.json` — the project-state file, materialized verbatim so the
  repo carries release/artifact tracking from init forward, including its
  pre-filled `acknowledgedChanges` array (so a freshly-inited repo's
  `/materia:doctor` starts quiet — it was born already carrying everything
  that array names).
- `.claude/settings.json` — seeded with this repo's dev permissions (Phase 3).
- `.materia/docs/epics/<dated-slug>/` + 2–N member proposals in
  `.materia/docs/specs/_proposed/` — the **bootstrap epic** (see Phase 4).
- `README.md` rewritten for the app.

init writes **nothing** into `.claude/skills/` — the pipeline skills run from
the installed `materia` plugin, not the repo — and it does **not** remove
itself (it is an installed plugin skill, not a file in the repo). Nothing under
`${CLAUDE_PLUGIN_ROOT}/scaffold/` is modified; it is read-only source.

## Procedure

### Phase 1 — The interview: eight chapters

**Open the interview with a brief welcome** — one or two lines, before
Chapter 1: what init is here to do is *slot the Materia orb into this repo* —
one conversation that equips it with the full spec-to-ship pipeline, tuned to
their stack. Note that this is the single interactive step (everything
downstream runs autonomously on what it resolves), then enter Chapter 1.

The intake is staged as **eight chapters**, each a vertical that fills in one
part of the product-and-project picture. Together they produce every input
the materialize phases need; where each chapter's answers land:

| # | Chapter | Lands in |
|---|---|---|
| 1 | Concept & description | `MATERIA.md` § Identity · `CLAUDE.md` § What this is · `.materia/docs/product.md` § Audience & market's usage-context bullet · glossary, surface-map, and workflow seeds |
| 2 | Goals & success | `.materia/docs/product.md` § Goals & success + § Product principles |
| 3 | Audience & market | `.materia/docs/product.md` § Audience & market |
| 4 | Branding & identity | `.materia/docs/product.md` § Name & positioning |
| 5 | Visual design & taste (UI repos) | `.materia/docs/product.md` § Design feel & taste |
| 6 | Voice & tone | `.materia/docs/product.md` § Voice & tone (+ glossary vocabulary) |
| 7 | Tech stack | `MATERIA.md` § Stack, § Run it, § Gate |
| 8 | Capabilities & operations | the `MATERIA.md` capability sections (probe table below) |

#### How the interview runs (mechanics, all chapters)

- **Announce each chapter** as you enter it — "Chapter 3 of 8 — Audience &
  market" plus one line on what this vertical buys the pipeline — so the
  engineer always knows where they are and how much remains.
- **`AskUserQuestion` is the primary instrument** when available: batch up to
  4 related questions per call, up to 2–3 rounds per chapter. Rounds are a
  **ceiling, not a quota** — a chapter already covered by earlier
  conversation resolves in one short round or none; never re-ask what's
  answered, never pad a round to reach 4 questions. Later rounds probe only
  what earlier answers left open. Across all eight chapters the whole
  interview should land around **20–35 questions (~8–12 rounds) total** —
  the per-chapter ceilings draw on that shared budget, they are not
  independent allowances.
- **Lead every option list with a grounded recommendation** inferred from
  everything heard so far — a concrete wrong guess draws out taste faster
  than a blank prompt. Free-form discussion between rounds is welcome;
  chapters stage the ground to cover, they are not a rigid form. A
  multi-value probe (five feel adjectives, 2–4 taste references, success
  metrics) doesn't fit four short option labels — pre-bundle it into 2–3
  named candidate combinations (e.g. three complete "vibes") and refine the
  picked bundle with free text, rather than atomizing it into one question
  per value.
- **Every non-essential question carries an explicit skip**: a
  "Skip — decide later" option (`AskUserQuestion`) or a numbered skip option
  (Auto Mode). Essential questions — marked per chapter — never offer one.
  Push for an opinion before accepting a skip (offer a guess to react to);
  the skip is an escape hatch, not the default path.
- **Recording a skip.** In the brief-bound chapters (2–6) a skipped question
  lands in `.materia/docs/product.md` as a literal
  `*Not yet decided — <what was asked>.*` line — an honest gap, never an
  invented default (the brief's init comment states the same convention).
  Chapters 7–8 are `MATERIA.md`-bound and keep that file's **binary
  conventions**: a concrete value or `none`, never free-text — a skippable
  stack/capability sub-question maps onto the existing `none`/absent
  affordance (§ Gate rows, § Design tool, § Data layer), and an answer with
  no such affordance (the Chapter 7 essentials; § Eyes on a UI repo — see
  Chapter 8) is essential precisely because nothing legal can stand in for
  it.
- **If `AskUserQuestion` is unavailable**, degrade to Auto Mode: the same
  staged chapters as plain text with numbered options, the recommended
  default marked per question.
- **Repos with no user-facing UI:** Chapter 5 is skipped entirely (record
  the skip in the Phase 2 confirmation), Chapter 4 compresses to name +
  tagline + positioning, and Chapters 2 and 6 run in full — goals,
  principles, and voice exist regardless (CLI/API output has tone too).
  A structurally inapplicable section records `*N/A — no user-facing UI.*`,
  not `Not yet decided` — the latter promises a revisit; a UI-less repo has
  nothing to revisit.

#### Chapter 1 — Concept & description (all essential)

Open free-form: ask the engineer to describe the app in their own words,
follow the interesting threads, then summarize back what you heard and
confirm. This chapter offers no skips — everything in it is mechanically
load-bearing for materialization. Resolve:

- What the app does and for whom (single-user tool? multi-tenant SaaS? CLI?
  API-only service?) — until you can write one crisp sentence for
  `MATERIA.md` § Identity plus a short paragraph for `CLAUDE.md` § What
  this is.
- The usage context that should color every future spec (device, environment,
  cadence — the analogue of "on a phone, mid-workout").
- The 3–5 core domain entities the engineer already knows about (these seed
  the glossary and the first resource docs when the bootstrap epic ships).
- The **surface vocabulary** — how the outside world reaches the app: HTTP
  routes + pages, CLI commands, a public API/exports, events. This drives
  `.materia/docs/surface-map.md`'s table shape, the resource-doc template's layer
  sections, and which docs-router phrasings apply.
- Deploy intent (local-only, a PaaS, containers, serverless) — shapes the
  workflow standard and CI spec.

Chapter 1 always **starts unstructured** — the free-form pass comes first;
then close whichever of the five resolve items it left open with a single
`AskUserQuestion` round (deploy intent and surface vocabulary are naturally
closed-set). It still obeys the shared round budget.

Product depth (goals, market, branding, taste) gets its own chapters next —
don't rush it here; Chapter 1 establishes *what*, Chapters 2–6 establish
*why, for whom, and how it should feel*.

#### Chapter 2 — Goals & success

Why it's being built and how the engineer will know it worked — the brief's
§ Goals & success. Probe: the goal behind building it (the change in the
world, or in the builder's own work, that makes it worth the effort); 2–4
success metrics concrete enough to check against in six months; the
milestone horizon that matters now (first usable cut, first external user,
launch); the business model (paid / free / OSS / personal tool, no model).
Close the chapter with **product principles** — 3–5 opinionated tie-breakers
that settle feature debates before they start ("speed of capture beats
completeness"), the brief's § Product principles; this closing round runs on
every repo, UI or not. Every question here is skippable.

#### Chapter 3 — Audience & market

The brief's § Audience & market. Probe: the primary user as a singular
persona (role, context, sophistication — a persona beats a demographic
blur); the market/space and the 2–3 adjacent or competing products; what
this one deliberately does differently; who and what it is explicitly *not*
for. Every question skippable — but a concrete persona guess grounded in
Chapter 1 usually draws a real answer faster than a blank question.

#### Chapter 4 — Branding & identity

The brief's § Name & positioning. Probe: the product's name (or working
name / codename); the tagline — the short, memorable line a landing page or
README would lead with; the positioning sentence — how it should be
described next to its alternatives, the one you'd want a stranger to
repeat; and the brand personality in a phrase or two (it feeds Chapter 5's
feel and Chapter 6's voice). Every question skippable, though the name is
worth pressing on — even a working name unblocks everything downstream.

#### Chapter 5 — Visual design & taste (UI repos only)

The brief's § Design feel & taste — the questions engineers skip and then
pay for in bland, incoherent features. Probe: five adjectives for how it
should feel; 2–4 taste-reference products with *what* to borrow from each
(spacing, motion, density, color courage) and one anti-reference; the
brand colors — named hues or exact values where they exist, plus any
existing brand assets to honor; light/dark stance; typography vibe;
density; how expressive motion should be. Every question skippable;
propose a feel and taste references inferred from Chapters 1–4 and let the
engineer react.

#### Chapter 6 — Voice & tone

The brief's § Voice & tone. Probe: how the product talks — terse or chatty,
playful or neutral, error-message temperament; the words it always/never
uses (feeds the glossary). Every question skippable. Runs on every repo —
CLI/API output has tone too.

#### Chapter 7 — Tech stack (stack, dev-run recipe, gate commands essential)

Recommend a stack **grounded in Chapters 1–2**, not a menu of everything.
Present 2–3 coherent options (framework + language + persistence + styling
+ test runners + package manager), each with a one-line rationale tied to
what they're building, and a clear recommendation. The engineer may also
name their stack outright — never argue them out of a stack they know, and
naming one bypasses the recommendation menu entirely. **The resolution
itself is not bypassable**: never offer a "Skip — decide later" option on
the stack, dev-run recipe, or gate-command questions — the chapter does not
exit until these are settled, concretely enough to write `MATERIA.md`
§ Stack, § Run it, and § Gate (essential; no legal empty value exists for
them):

- Language(s) + framework(s) + package manager.
- The dev-run recipe (command, URL/port, dev credentials if any) —
  `MATERIA.md` § Run it has **no** `none`/absent affordance, so this can
  never fall through to a skip.
- The intended gate commands (`lint` · `typecheck` · `test` · `test:e2e`).
  These may not exist yet — the bootstrap epic creates them; write the
  *intended* commands into § Gate **plus its Bootstrap-grace marker line**
  (the gate spec's proposal id is minted in Phase 4 — write the marker now,
  patch the id there) so pre-bootstrap runs skip-and-record missing commands
  instead of blocking. Skip the marker only when the commands already exist
  at init time. An individual gate row the stack genuinely lacks is marked
  `none` (§ Gate's own convention) — that is how a skippable sub-question
  here records, never free-text.

Also resolve — skippable sub-questions map onto the `none`/absent
affordance:

- Persistence + ORM/driver (or none).
- Test runners: unit/integration, and e2e (or none).

#### Chapter 8 — Capabilities & operations (UI, persistence, and — on UI repos — Eyes essential)

init installs no skills and prunes none — the whole roster ships with the plugin.
Each probe therefore only **sets a MATERIA.md section**: an absent capability
becomes a `none` section, and the affected skill or review angle skips itself at
runtime (the UI skills self-gate; the orchestrator's per-run gates handle the
rest). No skill is removed from the repo. The first two probes (UI,
persistence) are usually already settled by Chapter 1's surface vocabulary
and Chapter 7's persistence answer — confirm, don't re-ask; they are
essential either way (they gate skills and chapters, and `none` is itself a
concrete answer, not a skip). Two probes' legality depends on the UI answer:

- **Eyes:** `MATERIA.md` § Eyes may be `none` **only when § UI-affecting is
  `none`** — on a UI repo there is no legal empty value (the UI skills
  self-gate on § UI-affecting and then run § Eyes' recipe as written), so
  the Eyes question is **essential on UI repos**: a skip attempt falls back
  to the stated default toolchain (Playwright for web), never to `none`.
  On a non-UI repo, skip the question — § Eyes is `none` by consequence.
- **Design tool:** deterministically `none` on a non-UI repo (the design
  stage never runs) — set it without asking. Only UI repos get the question,
  where a skip records `none` per the section's own default.

The remaining probes follow the chapter skip rules, recording `none`/absent.

| Probe | Section | When absent |
|---|---|---|
| Does it have a user-facing UI? | § Surface gates § UI-affecting, § Eyes | both `none`; `design` / `ui-test-plan` / `ui-review` / `curator` / `concierge` self-gate at runtime (print one line + exit) |
| How will agents *see* it? (browser automation — Playwright is the default for web — TUI capture, screenshot tooling) | § Eyes | — |
| Will design work happen on an external design tool over MCP? (`claude-design` is the default offer; § Design tool's init comment carries the known-adapter catalog and each tool's capabilities) | § Design tool | `none` (also the default when the engineer skips the question); the design stage authors `design.md` repo-side and every tool-dependent behavior self-gates per § Design tool's degradation rules |
| Does it persist data? | § Surface gates § Data-affecting, § Data layer | both `none`; the ship-spec data-safety review angle never runs (the orchestrator's per-run data gate) |
| Any extra review angles the domain demands (a11y, perf budgets, compliance)? | § Review angles registry + a `.materia/review-angles/<slug>.md` file | absent → just the canonical twelve; a positive answer **appends** an angle file + a registry row (File / Gate / Tier) |
| Anything unusual about cold-start (runtime versions, codegen, services)? | § Environment preflight | — |
| Which models are available for spawn routing? (Sensible default: `haiku`/`sonnet`/`opus`/`fable` — all listed; `fable` is assigned nowhere by default, so it's never spent unless an operator assigns it in § Skill routing. Trim a row only if the plan genuinely can't spawn it, keeping `opus` as the protected fallback anchor.) This fills § Model set only — the per-skill § Skill routing assignments and their fixed `opus` fallbacks are **not** surveyed; they ship verbatim. | § Model set | — (a declared model outside the set coerces to the fallback) |

### Phase 2 — Confirmation checkpoint

Draft everything in-memory and present one confirmation block: the § Identity
sentence, the product brief's spine (name/tagline/positioning · goals &
success · audience · the five feel adjectives · taste references + brand
colors · voice · principles), the stack, the § Gate table, the surface-gate
patterns, the Eyes choice, the design-tool answer (tool + capabilities, or
`none`), the § Model set (the § Skill routing assignments and their
fallbacks ship verbatim — not surveyed), the review-angle library (the
canonical twelve ship verbatim; note any repo-specific angle to be appended
from Chapter 8), the sections that will be marked `none` (and which
UI/data-gated skills that makes inert — including a skipped Chapter 5 /
compressed Chapter 4 on non-UI repos), **the skipped-question tally — every
`Not yet decided` line that will be written, verbatim** — and the bootstrap
epic's proposed member specs (titles + one-liners). Recap it **chapter by
chapter** (the interview's own structure), not as one flat list — the
engineer reviews against what they remember answering. Reply verbs, with producer-lifecycle semantics
(`.materia/docs/standards/skills.md` § Producer lifecycle once materialized):
`approve` · `edit: <feedback>` · `cancel`. Nothing is written until
`approve`.

### Phase 3 — Materialize

On approve, in this order. Every source path below is under
`${CLAUDE_PLUGIN_ROOT}/scaffold/`; resolve the token in the **shell** for any
active read or copy (`cp "$CLAUDE_PLUGIN_ROOT/scaffold/..." ...`) — the Read
tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path:

1. **Copy the skeleton:** `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/docs/**` → `.materia/docs/`; and
   `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/**` → `.materia/` (the review-angle
   library — angle definitions are **config**, read at runtime from the repo
   like `.materia/docs/`, not skills — plus `project.json`, the project-state file that
   tracks artifact schema + applied migrations, and `.materia/scripts/check-docs.sh`,
   the portable docs-gate script that now travels under `.materia/scripts/`; all
   copied verbatim, no slots).
   **No skills are copied** — the pipeline skills run
   from the installed `materia` plugin, so the user repo has no `.claude/skills/`
   of its own and there is nothing to prune or deregister. Every producer stays
   advertised in the queue tables and skill rosters exactly as the scaffold
   ships them.
2. **Adapt the doc skeleton to the stack:** adapt `.materia/docs/surface-map.md`'s
   tables to the surface vocabulary, and prune/rename
   `.materia/docs/_templates/resource.md`'s layer sections to the layers this stack
   actually has (delete Data model on persistence-less repos, Client API /
   UI on repos without them) — per that template's own init comment.
3. **Write `MATERIA.md`** from `${CLAUDE_PLUGIN_ROOT}/scaffold/MATERIA.md`: fill
   every slot, mark absent capabilities `none` (§ Surface gates § UI-affecting /
   § Data-affecting, § Eyes, § Data layer, § Design tool, per Chapter 8's
   probes), delete the
   `<!-- init: … -->` comments. When Chapter 8 surfaced a **repo-specific review
   angle**, author it now as a pair: write `.materia/review-angles/<slug>.md`
   (two-key `name`+`description` front matter + body, per that directory's
   `README.md`) **and** append its row to § Review angles (File / Gate / Tier).
   The canonical twelve copied in step 1 stay verbatim.
4. **Write `CLAUDE.md`** from `${CLAUDE_PLUGIN_ROOT}/scaffold/CLAUDE.md`: same
   treatment. The folder map documents the *intended* layout the bootstrap epic
   will create.
5. **Generate the stack-specific standards** under `.materia/docs/standards/`, using
   `.materia/docs/_templates/standard.md`'s spine (Rule / Why / How / Where it lives /
   Related):
   - **Always:** `architecture.md` (folder rules, layering, naming — the
     kind-purity and one-export-per-file ethos adapted to the stack),
     `testing.md` (test kinds, locations, conventions; § End-to-end section
     when e2e exists), `workflow.md` (branch discipline, commands, CI shape,
     deploy) — these three are referenced by name from the pipeline skills.
   - **Per stack:** one standard per product layer the stack actually has
     (data, server routes, API/client-state layer, contracts/models,
     types/enums), each stating the conventions the interview settled.
   - **UI repos:** `ui-components.md` + `visual-language.md` seeds — thin at
     init (the design language barely exists yet); they grow via `docs-sync`.
   - Register every generated standard as a row in `.materia/docs/README.md`
     § Standards and in `.materia/docs/contributing.md`'s touch-map slot.
6. **Write `.materia/docs/product.md`** from `${CLAUDE_PLUGIN_ROOT}/scaffold/.materia/docs/product.md`:
   every section filled from Chapters 2–6 (plus, from Chapter 1: the
   § Identity one-liner copied verbatim, and the usage-context answer into
   § Audience & market's usage-context bullet) — opinionated where answered, a literal
   `*Not yet decided — <what was asked>.*` line where skipped, `*N/A — no
   user-facing UI.*` where structurally inapplicable, `{{slots}}` gone
   either way. When the repo ships UI, derive the `visual-language.md` seed
   from its § Design feel & taste (brand colors, density, motion stance) so
   the two never start contradictory.
7. **Fill the remaining doc slots:** `.materia/docs/README.md`, `.materia/docs/contributing.md`
   (DoD + touch-map rows), `.materia/docs/glossary.md` (seed the Chapter 1 entities +
   the § Voice & tone vocabulary), and delete `.materia/docs/surface-map.md`'s init
   comment (its tables were already adapted in step 2). **Seed the user repo's
   `.claude/settings.json`** (create it if absent) with a base `permissions.allow`
   of routine git/gh/docs-check commands, then extend it with this stack's own
   routine commands: the § Gate rows, the § Run it recipe, the package manager,
   and the § Eyes provisioning script.
   Rules: **write a `deny` block and keep it intact**; never add merge, delete,
   or deploy commands (those stay prompted); prefer allowlisting the literal
   gate commands over a bare script path (a script's contents are mutable
   trust — any later PR can change what an allowlisted path executes); and
   add stack-specific `deny` rules for destructive stack commands the interview
   surfaced (database drop/reset, `compose down -v`-style teardowns). This is
   the user repo's own settings, unrelated to the plugin install.
8. **Rewrite `README.md`** for the app: name, one-liner, run-it, a short
   "how changes ship here" section pointing at `.materia/docs/specs/README.md` and
   the skill roster.
9. **Interim check:** run `sh .materia/scripts/check-docs.sh` and fix every failure
   it reports. This is the *interim* pass — the **binding** self-check runs at
   the end of Phase 4, after the bootstrap epic exists, so the green-gate
   guarantee covers everything init writes.
10. **Commit** in logical chunks (skeleton · MATERIA/CLAUDE · product brief ·
    standards · README) directly to the default branch, and push if a
    remote exists — **as bare `git push`** (or `git push -u origin HEAD` on
    first push). The user repo's own deny rules block explicit
    `git push origin main` spellings for the pipeline's sake; init's
    direct-to-main bootstrap is sanctioned, and the bare form is how it's
    expressed.

### Phase 4 — Seed the bootstrap epic

Write the app's first epic per the `.materia/docs/epics/README.md` contract —
`epic.md` (+ a brief `research.md` when Chapter 7 involved real trade-off
research; **if you skip `research.md`, also remove `epic.md`'s templated
link to it**) — and 2–N member proposals into `.materia/docs/specs/_proposed/` with
`source: epic`, `epic: <epic-id>`, and a `depends_on` graph. **Link hygiene:**
in **member-proposal bodies**, write any reference to another repo file in
backtick/arrow form (`` text → path ``), never as a live markdown link —
proposal bodies are copied into differently-nested spec folders later, and a
live relative link is wrong in at least one location. (Same-folder sibling
links inside the epic folder — `epic.md → research.md` per the epic
contract's own template — are fine; epic folders are permanent and never
re-nested.) Mint every member's `id`
**first**, then **patch the `MATERIA.md` § Gate Bootstrap-grace marker with
S1's real proposal id** (Phase 3 wrote the marker with the id pending — a
marker still reading `<S1 proposal id>` after this step is a defect the
final self-check must catch). Shape the members as genuinely
single-shippable units; the typical decomposition:

- **S1 — App skeleton + local gate:** framework init, folder layout per
  `.materia/docs/standards/architecture.md`, every § Gate row real and green, the
  § Run it recipe working, and the `MATERIA.md` § Gate Bootstrap-grace
  marker (and its paragraph) deleted in the same PR — each of these an
  explicit acceptance criterion.
- **S2 — CI:** the full gate + `check:docs` on every PR (per
  `.materia/docs/standards/workflow.md`).
- **S3 (UI repos) — Eyes provisioning + first e2e:** the § Eyes provisioning
  recipe as a real script, one smoke e2e, the `test:e2e` gate row live.
- **S4+ —** the first thin vertical slice of the actual product, per
  Chapter 1 — shaped by the brief's § Product principles.

**Final self-check (binding):** re-run `sh .materia/scripts/check-docs.sh` over
the full tree — now including the epic + proposals — and fix every failure;
then grep for any surviving `{{` slot marker, `<!-- init:` / `<!-- template:`
comment, or **unfilled init-obligation placeholder** (`<S1 proposal id>`,
`<epic-id>` — the specific tokens init was meant to substitute). Notation in
code fences or inline backticks (`<model>/<effort>`, `<row>`, `<dated-slug>`)
is retained documentation, not a placeholder — never "fix" it. Zero on all
three is the exit criterion; init never hands over a repo that fails its own
docs gate.

Commit the epic + members to the default branch (still bootstrap), then hand
off: the orb is slotted and the pipeline is live — tell the engineer to run
`/materia:ship-spec` (or `/materia:ship-spec --auto`) — from this point
every change flows through the pipeline and lands via PR.

### Phase 5 — Report

Close with: what was materialized (standards generated, the product brief, the
docs skeleton + `.materia/scripts/check-docs.sh`, the `.materia/review-angles/` library, the
`.materia/project.json` project-state file), the MATERIA.md sections marked
`none` (and which UI/data-gated skills that leaves inert), the `Not yet
decided` gaps the skips recorded (docs-sync and the librarian maintain the
brief — firm them up as the product takes shape), the bootstrap epic's
member list with the recommended shipping order, and the one-line next step
(`/materia:ship-spec`).

## Idempotency & re-runs

Re-running init **before any bootstrap spec has shipped** is safe and needs no
restore: the pipeline skills live in the installed `materia` plugin (nothing was
moved out of the repo) and init does not remove itself, so there is nothing to
restore and nothing self-removed. It re-enters the interview with the previous
`MATERIA.md` / `.materia/docs/product.md` answers as chapter defaults (a previously
recorded `Not yet decided` line is re-asked, not re-recorded blindly) and
rewrites the materialized files (MATERIA.md,
CLAUDE.md, `.materia/docs/**`, `.materia/scripts/check-docs.sh`, `.materia/review-angles/**`)
wholesale from the bundled scaffold at `${CLAUDE_PLUGIN_ROOT}/scaffold/`.

After the pipeline has started shipping, init refuses to run wholesale (the repo
is now the pipeline's to evolve) and instead points at the right tool:
`MATERIA.md` edits for stack changes, `/materia:propose-spec` for new
capabilities. A capability that arrives later needs **no re-copied skill** — the
whole roster is already installed with the plugin; flip the relevant `MATERIA.md`
section from `none` to real patterns and the gated skill stops self-gating.

## Scope

- Does **not** scaffold the app itself — that is the bootstrap epic's job,
  built by `/materia:ship-spec` under review, gates, and docs discipline.
- Does **not** redraft the contracts in the bundled scaffold
  (`${CLAUDE_PLUGIN_ROOT}/scaffold/`) — slots only.
- Does **not** copy, prune, or otherwise touch the pipeline skills — they run
  from the installed plugin's read-only cache.
- Does **not** create a GitHub repo, configure branch protection, or touch
  anything outside this repo.

## Rules

- Nothing is written before the Phase 2 `approve`.
- Every `MATERIA.md` section heading ships exactly as the template spells it
  — the pipeline skills reference them by name.
- A capability the engineer doesn't have is `none`, never a guessed
  placeholder command that will fail downstream — the UI/data-gated skills
  self-gate (or the orchestrator skips their stage) on that `none` section.
- The self-check (green `check:docs`, zero `{{` markers) gates the final
  commit — init never hands over a repo that fails its own docs gate.
