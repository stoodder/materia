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

The single source of truth for model/effort routing — every skill that
declares a `## Recommended tier`, every `tasks.md` `Model/effort` field, and
every review-angle `Tier` column resolves against this section. One
representation everywhere: the token pair **`<model>/<effort>`**
(e.g. `sonnet/medium`).

### Model set

The models available for spawn routing in this repo, and their availability:

| Model | Availability | Notes |
|---|---|---|
| {{e.g. haiku}} | {{default}} | {{cheap/mechanical units}} |
| {{e.g. sonnet}} | {{default}} | |
| {{e.g. opus}} | {{default}} | {{the fallback tier}} |
| {{e.g. a premium tier}} | {{opt-in — see below, or omit the row entirely}} | {{billed differently, reserved for the highest-judgement units}} |

- **`default`** — resolves whenever a unit declares it.
- **`opt-in`** — resolves **only** when the operator has explicitly enabled it
  (flip this cell to `default`, or give a per-run instruction that the
  orchestrator records in `STATUS.md` § Notes). Otherwise a unit declaring it
  coerces to the fallback with the standard one-line note. This is how a
  premium, per-token-billed model stays available to the routing vocabulary
  without ever being spent silently.
- A model a skill declares that is **not in the table at all** coerces to the
  fallback (see § Coercion) — canonical skills may name tiers this repo
  doesn't carry; that is expected, not an error.

### Fallback

The single fallback pair is **{{e.g. opus/high}}**. It applies to any absent
/ malformed / out-of-table / not-enabled / `Agent`-rejected tier. The
fallback never blocks a run.

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

When a tier value is absent, syntactically malformed, not in the model set,
or not enabled, coerce to the fallback and record a one-line note:

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
