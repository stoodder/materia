<!-- Filled by the `plan-tasks` skill (or by hand). Tasks are dependency-ordered
     and independently shippable where possible. Each is implemented by the
     `implement-task` skill. -->
# <Feature> — tasks

> Ordered, dependency-aware. Independent tasks may run in parallel.

## Legend

- **Depends on** — task ids that must land first.
- **Model/effort** — the tier this task's own `implement-task` subagent should run at (drawn from the closed vocabulary at `MATERIA.md` § Tiers; omitted → `opus/high` fallback).
- **Standards/docs** — what to read before coding (per ../../README.md read order).
- Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## Tasks

### T1 — <title>

- **Status:** [ ]
- **Depends on:** —
- **Model/effort:** `<model>/<effort>` — see `MATERIA.md` § Tiers
- **Area / files:** <models/contracts/server/composables/pages …>
- **Scope:** <what this task does, concretely>
- **Acceptance criteria:**
  - [ ] …
- **Standards/docs:** <links, e.g. ../../standards/api-layer.md, ../../resources/set-log.md>
- **Tests:** <which sibling specs to add/change>

### T2 — <title>

- **Status:** [ ]
- **Depends on:** T1
- **Model/effort:** `<model>/<effort>` — see `MATERIA.md` § Tiers
- …
