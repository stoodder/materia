<!-- This is the bug analysis record — the `architecture.md` analogue for the bug loop.
     Filled by `materia-bug-analysis`. This is the single document `materia-plan-tasks` decomposes.
     The `## Affected files` section is the "Affected existing resources" analogue
     that `materia-plan-tasks` reconciles against. -->

# <Bug title>

## Root cause

_One short paragraph: why the bug happens (the mechanism, not the symptom)._

## Affected files

<!-- This section is load-bearing: `materia-plan-tasks` reads it to reconcile against the tasks it generates.
     It is the "Affected existing resources" analogue. -->

| Path | What's wrong / what changes |
|------|----------------------------|
| `path/to/file.ts` | _One-line description of the defect or change._ |
| `path/to/other.ext` | _One-line description._ |

## Fix approach

_A thin sketch of the fix (NOT a design): the change shape (e.g. "add a validation check before X" or "refactor Y to Z")._

**Standards/resource docs the fix tasks must read:**
- `docs/standards/testing.md`
- `docs/resources/...` (the affected entity)

## Test impact

**Reproduction tests to flip RED→GREEN:**
- `path/to/file.spec.ts` — the tests written by `materia-reproduce-bug`

**Additional regression tests:**
- _Any additional test(s) the fix warrants to prevent future regressions._

## Out of scope

_What this fix deliberately does NOT touch (keeps blast radius honest)._
