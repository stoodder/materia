---
name: intake-spec
description: Turn a raw product spec or feature request into a structured spec.md under docs/specs/<dated-slug>/, asking clarifying questions to resolve gaps. First stage of the ship-spec pipeline; also usable standalone before any design/build work.
---

# intake-spec — normalize a raw spec

Convert a free-form product spec / feature request into a precise, testable
`spec.md`. This is the pipeline's one interactive checkpoint: **ask the human all
the clarifying questions now**, so later stages can run autonomously.

Runs as a subagent in `ship-spec`; usable standalone.

## Inputs

- **The spec body** — either the raw freeform spec / feature request from
  the operator (text, doc, or link) or a **structured proposal body**
  passed in by `ship-spec` after it stripped the frontmatter from a
  `docs/specs/_proposed/` file. The body comes through one channel; this
  skill's drafting branch decides whether it's freeform or already-shaped
  (see procedure step 3 and step 3').
- **Optional: `pre-created-folder: docs/specs/<dated-slug>/`** —
  `ship-spec` signals this when it has already minted the dated-slug,
  created the folder, and seeded `STATUS.md` (incl. the `## Provenance`
  block) as part of staking a proposal claim. When present, intake
  **skips folder/STATUS.md creation** and writes spec.md into the
  existing folder; the provenance lines are read-only to intake.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/spec.md` and `docs/specs/<dated-slug>/STATUS.md` (from
  `_templates/`), the spec registered in `docs/specs/README.md` — committed and
  pushed.

## Recommended tier

`fable/high` — see [tier vocabulary](../ship-spec/resources/tiers.md) for the model and effort definitions. This interactive intake checkpoint calls for high-effort synthesis to resolve spec ambiguities before later autonomous stages run.

## The `<dated-slug>` folder name

Every spec folder is uniquely identified by a timestamped, kebab-case folder
name:

```
<yyyy-mm-dd>-<rand>-<slug>
```

- `<yyyy-mm-dd>` — today's date in ISO form (the date intake runs).
- `<rand>` — a 6-character base36 token (lowercase a–z and 0–9), freshly generated per spec
  (e.g. `ab24f9`). Use `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` — never
  reuse a previous one.
- `<slug>` — short, kebab-case, feature-descriptive (e.g. `rest-timer`,
  `exercise-swaps`).

Example: `2026-06-13-ab24f9-csv-export`.

This keeps every spec folder globally unique and chronologically sortable, even
if two specs share a slug. Use the full dated form everywhere a path is written
— in code, in docs, and in `STATUS.md`'s `Slug:` field (which stores the
**full dated folder name**, not just the bare `<slug>`).

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`.claude/skills/ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

1. **Read the raw input** the user provided (text, a doc, a link). Read
   `docs/specs/_templates/spec.md` for the shape, and skim `docs/glossary.md` so
   you use the project's vocabulary.

2. **Mint the `<dated-slug>` (skipped on the proposal path).** Per the rule
   above (today's date + a fresh 6-char base36 token + a short kebab slug), create
   `docs/specs/<dated-slug>/` and seed `STATUS.md` from
   `docs/specs/_templates/status.md`, filling `Slug:` with the full dated
   folder name and the `## Provenance` block with `—` in every field (ad-hoc
   run).

   **If the orchestrator passed `pre-created-folder:`**, skip this step
   entirely — `ship-spec` has already minted the folder and seeded
   STATUS.md (incl. the `## Provenance` block) as part of staking the
   proposal claim. Treat the provenance lines as read-only; write spec.md
   into the existing folder.

   **Do NOT seed `retro.md`.** The `ship-spec` orchestrator owns the retro
   file and creates it immediately after intake returns (see
   `ship-spec/SKILL.md` § Retrospective capture). If you're running intake
   standalone (no orchestrator), the retro is simply absent — that's fine.

3. **Detect the input shape.** Before drafting, check whether the body is
   already in the spec template's shape:

   - An H1 heading on the first non-blank line, AND
   - All of these H2s present anywhere in the body: `## Problem`, `## Goals`,
     `## User stories & acceptance criteria`, `## Open questions`.

   If all four conditions hold, the input is **structured** — almost
   certainly a proposal body that `ship-spec` stripped from a
   `docs/specs/_proposed/` file. Skip the drafting step entirely:

   - **Adopt the body verbatim as `spec.md`.** Do not rewrite the H1, do
     not re-flow paragraphs, do not insert template scaffolding.
   - **Skip step 3 below (drafting).** The producer has already done that
     work.
   - **Walk the body's `## Open questions` section as the input to step 4
     (clarifying questions).** Each bullet is a question; resolve them via
     AskUserQuestion (or the Auto-Mode path) and fold the answers back
     into the spec, removing each resolved bullet.

   Otherwise, the input is **freeform** — proceed to step 3' (the
   traditional drafting path).

3'. **Draft the spec** from the template (freeform path only): problem,
   goals, non-goals, users & context, user stories with **testable
   acceptance criteria**, constraints. Assume the app's universal usage
   context (`MATERIA.md` § Identity + `CLAUDE.md` § What this is) unless the
   input says otherwise.

4. **Find the gaps and ASK.** Anything ambiguous or unstated that changes scope,
   UX, or data — ask the human via clarifying questions (use the AskUserQuestion
   tool for discrete choices). Examples worth resolving here: scope boundaries,
   which users/flows, success criteria, data to persist, edge cases, what's
   explicitly out of scope. Fold the answers into the spec.

   **Auto-Mode path when `AskUserQuestion` is unavailable.** In practice this is
   the **common, designed path** for an orchestrator-spawned intake, not a rare
   exception — `AskUserQuestion` is frequently absent from a spawned subagent's
   tool list, so the three-part Auto-Mode contract below (bake grounded
   defaults → return `partial` → orchestrator runs the operator checkpoint) is
   the **intended flow** for most pipeline runs. Some spawn environments
   don't surface `AskUserQuestion` in the deferred-tool list. Detect it by
   inspecting your own available tools: if `AskUserQuestion` is missing
   AND you are running under the `ship-spec` orchestrator, treat that as
   **Auto Mode active**. If you are running standalone (no orchestrator) and
   the tool is missing, fall back to plain-text clarifying questions in the
   next turn and block until answered — do not bake silent defaults.

   Under Auto Mode active, the contract is three-part — **all three are
   required**, not optional:

   1. **Bake reasonable defaults** into the spec, choosing the option the
      operator is most likely to want given the raw input.
   2. **Surface every default** in the "Open questions" section: one bullet
      per default, naming the assumption made AND the alternative the
      operator might want to flip to. The operator must be able to read
      that section alone and flip any default without re-reading the spec.
   3. **Return outcome `partial`** to the caller in the subagent return
      message. `partial` means "artifacts are complete and committed BUT
      the interactive checkpoint was skipped — operator confirmation
      needed before the next stage." The `ship-spec` orchestrator
      intercepts `partial` and surfaces the Open questions to the human
      before spawning `design` (see `ship-spec/SKILL.md` § Intake hand-off
      for `partial` outcome).

   When `AskUserQuestion` *is* available, ask the questions and return
   outcome `ok` — silently baked defaults are forbidden on that path.

   **Transient `AskUserQuestion` failure → retry once, then degrade to Auto
   Mode.** `AskUserQuestion` can fail mid-checkpoint with a transient stream
   error (the permission stream closing) even when it is present in the tool
   list. Treat that as recoverable: **retry the call once**; if it fails again,
   **degrade to the Auto Mode active contract** (bake grounded defaults, surface
   every default in Open questions, return `partial`) rather than blocking or
   guessing silently — the orchestrator then runs the operator checkpoint over
   the surfaced defaults. Record that the checkpoint degraded due to an
   `AskUserQuestion` stream error.

   **Contradiction-detection pass over operator answers.** Before folding answers
   (or baking defaults) into the spec, run a quick consistency pass over the
   collected answers: if two answers contradict each other (or an answer
   contradicts a stated spec goal/constraint), do **not** silently bake them.
   Re-ask the conflicting pair when `AskUserQuestion` is available; under Auto
   Mode, reconcile toward the answer most consistent with the raw input and
   **record the contradiction and the resolution as an Open-questions bullet** so
   the operator can confirm or flip it at the checkpoint.

   **Preflight named paths and tooling-adjacent rules.** Before writing
   the spec, run two cheap sanity checks against the draft:

   - **Named-path existence check.** For every file or directory the
     spec body references by literal path (source files, config files,
     seed files), verify the path resolves
     on disk via `git ls-files <path>` (or `ls`). If any path is missing,
     either correct the spec (the referenced file may have moved or
     been renamed — a common source is `.ts` vs `.js` extension drift)
     or flag it explicitly in the spec as "to be created" so downstream
     stages know it's not a typo. Surface unresolved paths as
     clarifying questions or Auto-Mode defaults per the steps above.
   - **Tooling-adjacent rule preflight.** If the spec bakes a convention
     that interacts with existing tooling (formatter rule, lint rule,
     file-naming convention, schema-validation rule), run the tooling
     against a minimal example of that convention before committing
     the rule. E.g. a 30-second formatter check (`MATERIA.md` § Gate,
     `lint` row) against an example of the proposed rule will catch
     conflicts (a casing rule the formatter silently reverts) before
     they propagate into the implementation stage.
     If the tooling rejects the proposed rule, either reverse the
     convention to match the tooling OR flag the conflict explicitly
     as a tooling-policy decision the operator must resolve before
     `design` runs.
   - **Freshness / already-shipped gate (proposal path).** A proposal can be
     drafted against a moving codebase and go stale before intake adopts it.
     Before adopting a proposal body, reconcile it against current reality:
     (a) **identifiers** — grep each model/type/route/path name the proposal
     names against the live schema + code; if a name was renamed since the
     proposal was drafted, correct it (or flag it) rather than carrying the
     dead name downstream; (b) **already-shipped / superseded** — scan
     recently-shipped specs under `docs/specs/` for the same feature; if the
     work already shipped (possibly with a *changed* mapping), **halt with a
     Blocker** naming the shipped spec so the operator can drop or re-scope the
     proposal instead of rebuilding it; (c) **sibling references** — resolve any
     `docs/specs/_proposed/<id>` cross-reference to the sibling's stable
     `docs/specs/<dated-slug>/` path if that proposal has since been consumed.

5. **Write** `docs/specs/<dated-slug>/spec.md`. Leave only genuinely deferred
   items under "Open questions" (flag them clearly).

6. **Register** the spec: add a row under "Index" in `docs/specs/README.md`,
   linking the full dated folder name.

7. **Persist:** in `STATUS.md`, tick stage 1 and set `Next: design`; then
   commit (`spec.md`, `STATUS.md`, the README index) and push.

## Done when

- `spec.md` exists with concrete, testable acceptance criteria.
- No blocking ambiguity remains (everything that affects design/architecture is
  resolved or explicitly deferred with the human's agreement).
- The spec is registered, `STATUS.md` updated, and the work committed + pushed.

## Standalone use

Runnable on its own to turn an idea into a spec without building. The next stage
is `design`.

Standalone runs only see the **freeform** input path — no orchestrator
means no `pre-created-folder:` signal, and standalone callers paste prose
rather than passing a pre-shaped proposal body. The structured-input
branch (step 3) is reserved for `ship-spec`'s proposal path.
