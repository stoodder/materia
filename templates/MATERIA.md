# MATERIA.md — the stack adaptation surface

<!-- init: this file is written once by /init from the survey answers and
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
`none` section is inapplicable here: `/init` prunes it at materialization
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

**The full gate** (what `finalize` and CI run): every non-`none` row above,
in table order, all green.

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
UI work — the toolchain behind `design`, `ui-test-plan`, `ui-review`,
`ui-inspection`, and behavioral verification. `none` if § Surface gates
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

## Review angles

The standard review fan-out is defined in `ship-spec/SKILL.md` § Review
(correctness · security · spec-adherence · behavior · ui when UI-affecting ·
data-safety when data-affecting). Rows below are **additional repo-specific
angles** the orchestrator appends to the fan-out; `none` if there are none.

| Angle | What it checks | Gate (when it runs) | Tier |
|---|---|---|---|
| {{none}} | | | |

## Pruned skills

What `/init` left out of `.claude/skills/` for this repo and why, so a later
reader (or the librarian) knows the absence is deliberate. Re-materialize a
pruned skill from the materia template if the capability arrives later.

| Skill | Reason pruned |
|---|---|
| {{e.g. ui-inspection}} | {{e.g. no user-facing UI (§ Eyes: none)}} |
