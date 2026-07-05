---
name: plan-tasks
description: Decompose an architecture document into a dependency-ordered list of small, independently shippable tasks with testable acceptance criteria at docs/specs/<dated-slug>/tasks.md (where <dated-slug> is the timestamped folder name minted at intake, e.g. 2026-06-13-ab24f9-csv-export). Stage 5 of the ship-spec pipeline.
---

# plan-tasks — architecture → ordered tasks

Break `architecture.md` into tasks the `implement-task` skill can each finish
end-to-end (code + tests + review + docs). Runs as a subagent in `ship-spec`;
usable standalone.

## Inputs

- `docs/specs/<dated-slug>/architecture.md`; `docs/standards/workflow.md` (the
  end-to-end route recipe sets the natural task order).

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/tasks.md` (statuses initialized to `[ ]`) — `STATUS.md`
  updated, committed and pushed.

## Recommended tier

`sonnet/medium` — see [tier vocabulary](../ship-spec/resources/tiers.md) for the model and effort definitions. Decomposing a well-specified architecture into task slices is systematic bookkeeping; the natural task order is set by layer dependencies.

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`.claude/skills/ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

1. **Read** `docs/specs/<dated-slug>/architecture.md` and
   `docs/specs/_templates/tasks.md`. Skim `docs/standards/workflow.md` (the
   end-to-end route recipe sets the natural task order).

2. **Decompose** into small tasks. Order by dependency, generally following the
   repo's layer direction (lowest layer first — the dependency layering
   `docs/standards/architecture.md` defines, e.g. types → wire contracts →
   server → client state → presentation), plus schema/migration first when
   present. Each task should be a coherent vertical or layer slice that can be
   reviewed and committed on its own.

3. **Specify each task**: id, **depends-on**, **model/effort**, area/files, scope, **testable
   acceptance criteria**, the standards/resource docs to read first, which
   sibling specs to add/change, and a **docs-scope floor**.

   **Model/effort.** Assign each task a tier from the vocabulary at
   [`../ship-spec/resources/tiers.md`](../ship-spec/resources/tiers.md),
   drawn from the three complexity buckets:

   - **markdown-only / bookkeeping / single-doc-edit** → `haiku/low`
   - **standard vertical slices** → `sonnet/medium`
   - **gnarly / cross-cutting / high-risk** → `opus/high`

   Rule of thumb: any task whose ACs require **character-for-character
   verbatim reproduction** (parse anchors, schema field labels, template
   stubs) is assigned at least one tier above its sibling markdown-only
   tasks — verbatim fidelity is exactly what the lowest tier fumbles.

   The tier governs which model (and effort guidance) the `implement-task`
   subagent runs under. An absent `Model/effort` field falls back to `opus/high`
   (matching the `tiers.md` vocabulary).

   The **docs-scope floor** is the minimum set of docs the task must update at
   commit time, derived from `docs/contributing.md`'s touch-X→update-Y rows
   applied to the task's anticipated file set. It includes:

   - The **directly-coupled resource and standards docs** the task's files
     touch (the obvious application of touch-X→update-Y).
   - **Any cross-cutting doc** (`CLAUDE.md`, `docs/README.md` index,
     `docs/surface-map.md`, `docs/glossary.md`) that `architecture.md`
     § Affected existing resources flagged as touched by this task's code
     surface. The legacy default of "defer all cross-cutting docs to
     `docs-sync`" is overridden when architecture has already named the
     specific cross-cutting doc — keeping it in the per-task floor prevents
     the doc from going stale mid-run while the implement loop ships
     dependent code.
   - **Rule of thumb: fix staleness in files this branch modifies; defer only
     untouched files.** If a task edits a file that a standards/cross-cutting
     doc describes, that doc is in-floor — don't push it to `docs-sync`. Two
     concrete heuristics that recur: a task that **touches `types/**`** carries
     a `docs/standards/types-enums.md` floor; and a **cross-pipeline change**
     (editing one pipeline's skills/docs that a sibling pipeline references)
     must enumerate the **sibling-pipeline docs** (e.g. `docs/bugs/**`) as
     registration surfaces, not just the SKILL.md files.
   - **Enumerate every depiction of a changed structure, not just the
     canonical one.** When a structure (a pipeline graph, a stage/flow table)
     is drawn more than once in a multi-section doc, a registration-surface
     checklist must list **every** depiction — all mermaid graphs, all pipeline
     tables, all prose blocks — so a second diagram of the same flow (a second
     `/ship-spec` mermaid, a second bug-flow chart) can't silently drift. And
     treat a **changed skill's own frontmatter `description`** as an implicit
     registration surface whenever that skill's outputs or behavior change — it
     is the cold-routing copy and goes stale just like a README entry.

   `implement-task` treats this list as a floor and unions it with what it
   derives from the actual diff at commit time. The `finalize` → `docs-sync`
   pass still runs to catch cross-task drift or missed touch-Y rows; the
   per-task floor is the proactive layer, `docs-sync` is the safety net.

   **Cross-reference: `implement-task`'s hard doc-exclusion list.** When
   composing a floor, read it against `implement-task/SKILL.md` § Persist
   (step 6), which hard-excludes the cross-cutting docs (`CLAUDE.md`,
   `docs/README.md` index tables, `docs/surface-map.md`,
   `docs/glossary.md`) from per-task edits and defers them to
   `finalize` → `docs-sync`. A floor entry for a cross-cutting doc is only
   actionable per-task under the architecture-flagged override above —
   resolve that reconciliation here, at planning time, instead of making
   each implementer re-derive it. Worked example — **deferred, with
   rationale:** a pure-recolor fix touching only presentation hooks carries
   an empty floor and records "docs: deferred to
   docs-sync — presentation-only change; the standards docs keep no per-file
   inventory of plain presentation hooks". **In-floor:** a task adding a
   new type alias updates the repo's types standard in the same
   commit — the doc describes the exact layout the task extends, and the
   task's files trigger the touch-`types/**` heuristic above.

   **AC quality conventions.** Acceptance criteria are read by the
   implementer (to write tests) and the spec-adherence reviewer (to verify
   coverage). Three conventions keep that mapping mechanical and the references real:

   - **One AC bullet per validation/type-guard rule.** Don't bundle
     multiple cases into a single bullet — e.g. "positive integer
     required" reads as one rule but covers (`id === 0`, negatives,
     non-integers, non-numbers). Split each case into its own AC bullet
     so the implementer's `it(...)` blocks and the reviewer's coverage
     check line up 1:1. If multiple cases genuinely share one rule,
     name the case count explicitly ("**this AC covers 4 cases:** zero,
     negative, non-integer, non-number").
   - **Tight regex literals for grep/case ACs.** When an AC includes a
     literal regex for a grep sweep or case/membership detection, make
     the regex match exactly what it's claiming. A pattern like
     `#[0-9A-F]{3,8}` matches all-digit hex literals (e.g. `#059669`)
     because the character class includes `0-9`; the precise
     "uppercase drift detector" is `#[0-9A-Fa-f]*[A-F][0-9A-Fa-f]*`
     (requires at least one A-F letter). For closed-set membership,
     prefer named enumerations over wide character classes.
   - **Scope repo-wide gates and grep ACs to the task's own contribution.**
     ACs like "`check:docs` passes", "repo-wide typecheck = zero", or
     "`git grep X` returns 0" only converge after later tasks or docs-sync
     land, so a mid-pipeline task can't satisfy them literally. Phrase them
     as the task's own contribution ("contributes 0 broken links"; "> 0"
     rather than an exact hit count), and exclude generated migration
     directories, `docs/**`, and absence-asserting tests from any grep-zero AC. Route
     pure grep/case checks to the review pass or to spy assertions — a
     runtime `it()` doing a naive substring test self-matches the assertion
     literal or the file's own comments naming the forbidden API.
   - **Authoring-time reference verification.** Every literal or premise a
     task bakes in — grep patterns and their expected hit counts,
     contract/function signatures, named precedent files or snippets, "no
     existing spec/sibling" claims — must be verified against
     `git show HEAD:<file>` (or a live grep/glob) at authoring time, and
     scope prose cross-checked against sibling tasks that land earlier in
     the order. A reference that can't be verified is written as intent
     ("locate by content"), never as a literal.

   **Reconciliation step.** Before locking `tasks.md`, diff this task's
   "Deferred to docs-sync" section against `architecture.md` § Affected
   existing resources. Any cell-level disagreement — architecture lists
   the doc as touched but plan-tasks deferred it, OR plan-tasks named a
   narrower scope than architecture did — must be resolved explicitly:
   either include the doc in the per-task floor at architecture's scope,
   or add a one-line rationale to the "Deferred to docs-sync" section
   naming which architecture row was overridden and why. Silent
   cell-level disagreement was a recurring source of stale cross-cutting
   docs in prior runs.

4. **Mark parallelism** — tasks with no interdependency can run concurrently
   (the orchestrator may fan them out to subagents).

5. **Write** `docs/specs/<dated-slug>/tasks.md` with statuses initialized to `[ ]`.

   **Cross-references use arrow/prose form, never bracket-paren/wikilink syntax.**
   Any doc reference inside `tasks.md` (e.g. to `docs/specs/README.md`) must be
   written as `text → path`, not `[text](path)` or `[[wikilink]]` — `check:docs`
   extracts links from inline code spans too, so a bracket-paren cross-reference
   pointing at a non-link path fails the gate. Authors default to wikilink
   syntax, so apply this when writing every cross-reference.

6. **Persist:** tick stage 4 in `STATUS.md` and set `Next: T1`; commit + push. **Orchestrator-lane exception:** when spawned by `ship-spec`/`fix-bug`, do **not** tick `STATUS.md` or commit it — the orchestrator owns both (see `ship-spec/SKILL.md` § STATUS.md ownership (orchestrator lane)); write only your own artifact.

**Internal-consistency ripple edits are permitted.** State in each task (or once
in the `tasks.md` preamble) that an implementer MAY make small ripple edits
**within the task's own named files** when required to keep a file internally
consistent — e.g. removing a step that a new step made redundant, or updating a
sibling diagram/cross-reference in the same file. These don't need to be
enumerated as separate ACs and aren't scope creep; the implementer notes them in
the retro rather than flagging each as a discretionary divergence. (Edits that
spill into files **not** named by the task remain out of scope.)

## Renames and route moves (completeness)

Renames and route/path moves are the easiest place for a plan to ship an
app-breaking gap that every gate still passes — unit tests assert the *old*
path and integration tests hit handlers directly, so a client left calling a
moved route 404s only in the real app. Three rules:

- **A route/path move is a client+server pair.** Whenever a task moves a server
  route or changes a fetch path, the **client call sites** that hit that path
  (composables, pages, utils) must be updated in the **same task**, or in an
  explicitly dependent task named in `depends-on`. Never let the server move
  land without the paired client update planned. Add an AC that asserts the
  client calls the *live* route.
- **Renames run a whole-repo grep before slicing.** For any rename (a model,
  type, field, wire key, route segment, util, or user-facing string), run a
  **whole-repo case-insensitive grep** of the old token (`git grep -iI '<old>'`)
  and reconcile every hit into a task. This catches request-body fields, utils,
  and copy strings that an architecture-level inventory misses. Record the grep
  and its hit count so `implement-task` and the reviewer can re-run it.
  The ripple grep must reach past the obvious primary-constructor call
  pattern: also match secondary construction call sites and typed literals —
  a model gaining a **required** wire field breaks every typed literal in
  sibling tests, not just direct constructor callers. And whenever exported
  shapes are deleted, enumerate the repo's barrel/index files: a barrel
  re-exports the deleted items and breaks even when no other file references
  them.
- **A task that renames or changes a source file owns that file's tests.**
  Pair each source-file rename/change with its test updates
  **in the same task**, so every task leaves its relevant tests green and is
  independently gate-green. Never defer a renamed file's test update to a
  later task — that leaves the earlier task's tests red against
  `implement-task`'s "relevant tests green" gate and creates an artificial
  inter-task dependency.

## Done when

- Tasks cover the whole architecture — nothing in `architecture.md` is unplanned.
- Each task has a clear scope + testable acceptance criteria + the docs to read.
- Dependency order (and safe parallelism) is explicit.
- `STATUS.md` updated; tasks committed + pushed.

## Non-product features (skills, docs, tooling)

For non-product features (a Claude Code skill, a docs change, a CLI helper),
the layer stratification in step 2 (the repo's dependency layering) does not
apply. Defaults:

- **Single-file decomposition.** Tasks are typically section-by-section
  edits of one markdown file (e.g. `.claude/skills/<name>/SKILL.md`); serial
  order is the natural default.
- **Docs-scope floor is usually `[]`.** Cross-cutting docs (`CLAUDE.md`,
  `docs/README.md`, `surface-map.md`, `glossary.md`) are still deferred to
  `finalize` → `docs-sync` exactly as in product runs.
- **`Tests:` field can be `none — verification is read-against-spec`.**
  Markdown tasks have no test files; the spec-adherence reviewer is
  the only adversarial check that has anything to bite on (see
  `implement-task/SKILL.md` step 5 markdown exemption).
- **Parallel-execution summary** will usually read "no parallel-safe pair" —
  expected when every task edits the same file.

### UI-affecting features: derive e2e-authoring task when `ui-test-plan.md` is present

When `ui-test-plan.md` exists in the spec folder (UI-affecting feature), derive
**at least one e2e-authoring task** grounded in the flows and assertions listed
in `ui-test-plan.md`. This conditional rule applies **only** to UI-affecting
features; when `ui-test-plan.md` is absent (non-UI feature), the defaults above
apply unchanged — no e2e task is derived.

The e2e-authoring task must:

1. **Scope.** Target file in the repo's e2e suite directory, named for the
   feature slug (the directory and naming convention:
   `docs/standards/testing.md` § End-to-end).

2. **Register the new spec with the e2e runner in the same task.** If the
   repo's e2e runner enumerates specs explicitly (a `testMatch`-style list
   rather than a glob — `docs/standards/testing.md` § End-to-end says which),
   the task must add the new spec's entry to that list. This edit is
   **required scope**, not a separate task.

3. **Encode the registration trap.** The task must carry an acceptance
   criterion that explicitly verifies the `test:e2e` gate (`MATERIA.md`
   § Gate) actually **picks up and runs** the new spec (i.e. the test is
   executed, not just the file committed) — this prevents the silent gap
   where a spec is committed but never run because its registration was
   forgotten.

4. **Follow testing conventions.** The derived task's acceptance criteria and
   specification must reference `docs/standards/testing.md` § End-to-end —
   seed-value assertions against known fixture values, and the canonical
   viewport/surface from `MATERIA.md` § Eyes.

The existing § Non-product features **defaults are not overridden** for
non-UI features: the serial order, per-task decomposition, and
`Tests: none — verification is read-against-spec` apply as before.
