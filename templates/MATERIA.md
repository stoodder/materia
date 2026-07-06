# MATERIA.md — the stack adaptation surface

<!-- init: this file is written once by /materia-init from the survey answers and
     maintained thereafter like any other doc (librarian sweeps it; docs-sync
     updates it when the stack changes). Replace every {{slot}} and delete
     these comments. Every section heading below is a stable anchor that the
     pipeline skills reference by name — NEVER rename a section without
     updating every skill that cites it (grep for "MATERIA.md §"). -->

The companion document to `CLAUDE.md`. Everything **stack-specific** the
pipeline needs lives here, in named sections; the pipeline skills under
`.claude/skills/` are stack-agnostic and reference this file by section
(e.g. `MATERIA.md § Gate`). One home per fact: skills never restate what a
section owns.

**The `none` convention.** A section marked `none` means this repo has no
such capability. A skill or pipeline stage whose procedure depends on a
`none` section is inapplicable here: it was pruned at materialization
time, and any surviving reference degrades gracefully (skip + record the
skip, never block).

## Identity

- **App:** {{app name}}
- **What it is:** {{one sentence — what this delivers and for whom}}

## Stack

{{language(s) · framework(s) · package manager · database/ORM · styling ·
test runners · deploy target — one line each, the way an engineer would say
it. Depth belongs in docs/standards/*, not here.}}

## Run it

```bash
{{the one command (or short recipe) that brings the app up locally for
development, with the URL/port and any credentials a driver needs}}
```

## Gate

The named checks every skill refers to. Skills use the **canonical names**
in the left column; this table maps each to this repo's real command. A
check this repo doesn't have is marked `none` (skills skip it and record
the skip).

| Canonical name | Command | Notes |
|---|---|---|
| `lint` | {{e.g. pnpm lint}} | {{auto-fix variant if any}} |
| `typecheck` | {{command or none}} | |
| `test` | {{unit/integration suite command}} | |
| `test:e2e` | {{browser/e2e suite command, or none}} | |
| `check:docs` | {{e.g. node scripts/check-docs.mjs}} | ships with materia; portable |

**The full gate** (what `materia-finalize` and CI run): every non-`none` row above,
in table order, all green.

**Bootstrap grace.** Until the bootstrap epic's gate spec merges, the
commands above are *intended*, not yet real. While the marker line below is
present, any skill running a gate treats a row whose command does not exist
as **skip + record** (`gate-grace: <row> skipped (bootstrap grace)`), never a
Blocker — except `check:docs`, which ships with the harness and is always
binding. The spec that creates the gates carries "every § Gate row real and
green" as acceptance criteria and **deletes the marker line in the same PR**;
after that, a missing command is a failure like any other.

{{Bootstrap grace: active until <S1 proposal id> merges. — /materia-init
writes this line; the gate spec removes it. Delete the whole Bootstrap-grace
paragraph AND this line once the gates are real, or immediately if the gate
commands already exist at init time.}}

## Environment preflight

The cold-start recipes a fresh session runs before dispatching any
code-touching work, so subagents inherit a green baseline instead of each
rediscovering the gaps. Single source for every environment recipe.

{{runtime version + how to select it · dependency install · codegen steps
(ORM client generation etc.) · database provisioning/reset · browser/driver
provisioning · known cold-start failure signatures and their one-line fixes.
Delete this section's body and write `none` if a bare checkout is already
runnable.}}

## Surface gates

File patterns that classify a diff, evaluated with
`git diff <baseline>...HEAD --name-only`. These drive which pipeline stages
and review angles run.

### UI-affecting

A diff is **UI-affecting** when any changed path matches:

{{pattern list, e.g. `*.vue` · `pages/**` · `components/**` · asset dirs ·
styling config — or `none` for a repo with no user-facing surface}}

### Data-affecting

A diff is **data-affecting** when any changed path matches:

{{pattern list, e.g. schema files · migration dirs · seed files · load/derivation
utilities — or `none` for a repo with no persistence layer}}

## Eyes

How an agent **sees** the running app to design against, review, and verify
UI work — the toolchain behind `materia-design`, `materia-ui-test-plan`, `materia-ui-review`,
`materia-ui-inspection`, and behavioral verification. `none` if § Surface gates
§ UI-affecting is `none`.

- **Toolchain:** {{e.g. Playwright (Chromium) · a TUI snapshot harness ·
  screenshot tooling}}
- **Provisioning:** {{the idempotent script/recipe that installs the driver
  and stands up the app + fixtures for a run}}
- **Viewport / surface:** {{the canonical viewport or terminal size all
  captures use, e.g. Pixel-5 390×844}}
- **Capture:** {{how to take a screenshot/snapshot and where proofs land —
  keep the `docs/specs/<dated-slug>/ui-proof/` convention}}

## Data layer

What the data-safety review angle checks beyond the generic rubric
(destructive migrations, seed idempotency, unique indexes behind upserts,
type casts at the storage boundary). `none` if § Surface gates
§ Data-affecting is `none`.

{{repo-specific data invariants worth a reviewer's attention — e.g. "re-seeding
must preserve user-entered values", "all writes go through the ORM, never raw
SQL", transaction rules}}

## Tiers

The single source of truth for model/effort routing. **Skills no longer carry
their own tier** — every unit's assignment lives here, in one of two tables:

- **§ Model set** — the catalog of models this repo can spawn, with their
  availability and *preferred usage*. Dynamic assigners (the per-task
  `Model/effort` field `materia-plan-tasks` writes into `tasks.md`, the
  per-question research tiers `materia-propose-epic` picks) choose from this
  menu per unit.
- **§ Skill routing** — the fixed per-unit assignment. Every spawned
  sub-skill, every `materia-ship-spec` review angle, and every internal
  sub-agent spawn has a row (`Model`, `Effort`, `Fallback Model`); a unit with
  no row uses the **Default** row.

One representation everywhere: the token pair **`<model>/<effort>`**
(e.g. `sonnet/medium`), where `<model>` is a § Model set name and `<effort>` a
§ Effort set level.

### Model set

The models available for spawn routing in this repo, their availability, and
what each is for. This is the menu a dynamic assigner picks from.

| Model | Availability | Preferred usage |
|---|---|---|
| `haiku` | {{default}} | cheap / mechanical units — markdown-only, bookkeeping, single-doc edits |
| `sonnet` | {{default}} | standard vertical slices, systematic synthesis, most implementation and review |
| `opus` | {{default}} | gnarly / cross-cutting / high-risk units; the default fallback model |
| `fable` | {{opt-in — flip to `default`, or omit the row entirely}} | the highest-judgement units — architecture, interactive intake, qualitative visual review; billed per-token |

- **`default`** — resolves whenever a unit assigns it.
- **`opt-in`** — resolves **only** when the operator has explicitly enabled it
  (flip this cell to `default`, or give a per-run instruction that the
  orchestrator records in `STATUS.md` § Notes). Otherwise a unit assigning it
  coerces to its fallback with the standard one-line note. This is how a
  premium, per-token-billed model stays in the routing vocabulary without ever
  being spent silently.
- A model **not in this table at all** coerces to the fallback (see
  § Coercion) — the § Skill routing table names canonical models this repo may
  not carry; that is expected, not an error.

### Skill routing

The fixed model/effort assignment for every unit the pipeline spawns. This
table **ships verbatim** (it is not stack-specific — only § Model set
availability is). Resolution reads the unit's row; a unit with no row uses the
**Default** row. The **Fallback Model** column names what the unit degrades to
when its `Model` is not-enabled / out-of-table / malformed / `Agent`-rejected —
run at the unit's **own effort** (effort describes the work, not the model).

| Skill / role | Model | Effort | Fallback Model | Notes |
|---|---|---|---|---|
| **Default** (any unlisted spawned unit) | `opus` | `high` | `opus` | the backstop when a unit has no row of its own |
| `materia-intake-spec` | `fable` | `high` | `opus` | interactive intake; resolve spec ambiguities before the autonomous stages run |
| `materia-architecture` | `fable` | `high` | `opus` | highest-stakes planning; grounds the plan in existing resources and reuse |
| `materia-design` | `sonnet` | `high` | `opus` | UX flows + states across every screen surface |
| `materia-plan-tasks` | `sonnet` | `medium` | `opus` | systematic decomposition; per-task tiers it emits are dynamic (§ Model set) |
| `materia-implement-task` | `sonnet` | `medium` | `opus` | standalone backstop — a task's own `Model/effort` in `tasks.md` overrides this row |
| `materia-reproduce-bug` | `sonnet` | `high` | `opus` | find the right test surface; land a genuine RED |
| `materia-bug-analysis` | `fable` | `medium` | `opus` | synthesis of `reproduction.md` + the report into a thin output |
| `materia-docs-sync` | `sonnet` | `medium` | `opus` | systematic doc↔intent synthesis, bounded scope |
| `materia-docs-audit` | `sonnet` | `medium` | `opus` | five well-defined properties over bounded inputs |
| `materia-finalize` | `sonnet` | `high` | `opus` | orchestrates gate + PR; a clean handoff |
| `materia-reconcile-epic` | `sonnet` | `high` | `opus` | **pipeline mode only** — standalone mode runs in the operator session (no spawn) |
| `materia-ui-test-plan` | `sonnet` | `medium` | `opus` | enumerate flows worth guarding from a resolved design |
| `materia-ui-review` | `fable` | `high` | `opus` | qualitative cross-screen cohesion judgement; UI-gated |
| `ship-spec: review/correctness` | `fable` | `high` | `opus` | correctness + simplicity + test-coverage angle |
| `ship-spec: review/security` | `sonnet` | `high` | `opus` | security angle |
| `ship-spec: review/spec-adherence` | `sonnet` | `medium` | `opus` | drops to `haiku/low` on the markdown-only exemption path |
| `ship-spec: review/behavior` | `sonnet` | `medium` | `opus` | the `verify` skill over the merged branch |
| `ship-spec: review/ui` | `fable` | `high` | `opus` | UI-gated cohesion review |
| `ship-spec: review/data-safety` | `sonnet` | `high` | `opus` | data-gated migration / seed / index review |
| `ship-spec: review/tiebreaker` | `fable` | `high` | `opus` | resolves conflicting review recommendations |
| `triage-retros: sub-agent` | `sonnet` | `low` | `opus` | mechanical bucketing / quoting over one retro |
| `apply-pipeline-improvements: reviewer` | `opus` | `high` | `opus` | fresh-context diff review before the PR |
| `propose-epic: research` | per-question (§ Model set) | — | `opus` | one subagent per question; `haiku/low` default, `sonnet/medium` ceiling |

### Fallback

Each § Skill routing row names its own **Fallback Model**; a unit with no row
uses the **Default** row (fallback model **`opus`**). The fallback runs at the
unit's own effort and applies to any not-enabled / out-of-table / malformed /
`Agent`-rejected model. The fallback never blocks a run.

### Effort set

`low · medium · high · xhigh` — advisory-only; never an `Agent` parameter.
The matching guidance sentence is injected into the spawn prompt verbatim:

| effort | Guidance sentence injected into the spawn prompt |
|---|---|
| `low` | "Run this at low reasoning effort — it's mechanical; don't over-deliberate." |
| `medium` | "Run this at medium reasoning effort." |
| `high` | "Run this at high reasoning effort — reason carefully before acting." |
| `xhigh` | "Run this at maximum reasoning effort — this is the highest-stakes unit; be exhaustive." |

### Coercion

When a unit's resolved model is absent, syntactically malformed, not in
§ Model set, or not enabled, coerce to the unit's **Fallback Model** (its
§ Skill routing row, or the Default row) and record a one-line note:

```
tier-fallback: <unit> … → <fallback> (<reason>)
```

Never block the run for a bad tier value.

## Review angles

The standard review fan-out is defined in `materia-ship-spec/SKILL.md` § Review
(correctness · security · spec-adherence · behavior · ui when UI-affecting ·
data-safety when data-affecting). Rows below are **additional repo-specific
angles** the orchestrator appends to the fan-out; `none` if there are none.

| Angle | What it checks | Gate (when it runs) | Tier |
|---|---|---|---|
| {{none}} | | | |

## Pruned skills

What the init survey left out of `.claude/skills/` for this repo and why,
so a later reader (or the librarian) knows the absence is deliberate.
Re-materialize a pruned skill from the materia template (git history, or the
upstream template repo) if the capability arrives later.

| Skill | Reason pruned |
|---|---|
| {{e.g. materia-ui-inspection}} | {{e.g. no user-facing UI (§ Eyes: none)}} |
