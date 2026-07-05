# Docs — agent context map

These docs exist to **build an agent's working context before it touches code**.
They are written for progressive disclosure: load the small thing that points at
the next small thing, and only read code once you know which files matter.

## Read order (always)

1. **`CLAUDE.md`** (repo root) — the always-loaded rules + this map. Start there.
2. **`docs/README.md`** (this file) — pick the standards and resources relevant
   to your change from the tables below.
3. **`docs/standards/*`** + **`docs/resources/*`** — read only the ones that
   apply. Each resource doc ends with a **Canonical files** list.
4. **The code** — open the files a doc named, now that you know the shape and the
   standards they must follow.

Do not skip a tier. If you're changing how sets are logged, you read
`standards/api-layer.md` + `resources/set-log.md` **before** opening
`composables/api/useWorkoutMutations.ts`. The docs tell you what already exists
so you reuse it instead of reinventing it.

**Read only what your change touches** — the resource doc(s) for the entities
involved plus the standards those docs link, not the whole tree. Each resource
doc's **Canonical files** and **Related** sections bound your reading. New to the
domain? Skim [glossary.md](glossary.md). Orienting on how a request flows?
[standards/request-lifecycle.md](standards/request-lifecycle.md). Need a route or
page fast? [surface-map.md](surface-map.md).

> Keep these docs true. If you change code in a way that changes what a doc
> says, update the doc in the same change — docs describe the code as it is, not
> as it was. Before you call a change done, read **[contributing.md](contributing.md)**
> (Definition of Done + which docs to update).

## Standards (cross-cutting "how we build")

| Doc | Read when you are… |
|---|---|
| [standards/request-lifecycle.md](standards/request-lifecycle.md) | orienting — how a read and a write flow across the layers end-to-end |
| [standards/architecture.md](standards/architecture.md) | adding/moving any file — folder rules, layering, one-export-per-file |
| [standards/types-enums.md](standards/types-enums.md) | adding a type or enum, or deciding `type` vs `enum` vs union |
| [standards/contracts-and-models.md](standards/contracts-and-models.md) | adding/changing a model or a route DTO (`from`/`toJSON`/getters) |
| [standards/api-layer.md](standards/api-layer.md) | adding a query or mutation — `ApiQuery`, cache keys, `optimisticUpdate` |
| [standards/server-routes.md](standards/server-routes.md) | adding/changing a Nitro route handler under `server/` |
| [standards/ui-components.md](standards/ui-components.md) — see [§ Transient surface taxonomy](standards/ui-components.md#transient-surface-taxonomy) for the overlay decision rule | touching pages, components, or presentation composables |
| [standards/visual-language.md](standards/visual-language.md) | picking colors, borders, or surface tones — Gymii palette, "no hard borders" rule, brand mark + wordmark |
| [standards/testing.md](standards/testing.md) | writing any test — Vitest `.spec.ts` (sibling co-location, auto-import stubbing), server integration tests, or Playwright browser e2e under `tests/e2e/` |
| [standards/data-and-loads.md](standards/data-and-loads.md) | changing the schema, seeding, or how loads are computed |
| [standards/workflow.md](standards/workflow.md) | adding a route end-to-end, branching, deploy/CI, commands |
| [standards/skills.md](standards/skills.md) | authoring or changing a Claude Code skill (`.claude/skills/**`) — SKILL.md anatomy, tiers, registration surfaces |
| [standards/docs.md](standards/docs.md) | writing or editing any doc here — present-state only, one home per fact, cell/size budgets, what `check:docs` enforces |

## Resources (one per domain entity)

Each maps to a Prisma table (or a derived read path) and documents its model,
contracts, routes, client API, UI, rules, and canonical files.

| Doc | Entity |
|---|---|
| [resources/week.md](resources/week.md) | `WeekTemplate` — program weeks (seeded at 8; user-extendable via `/schedule`) |
| [resources/workout.md](resources/workout.md) | `Workout` — a planned workout day |
| [resources/workout-log.md](resources/workout-log.md) | `WorkoutLog` — a run of a session (start/finish) |
| [resources/set.md](resources/set.md) | `Set` — a planned set |
| [resources/set-log.md](resources/set-log.md) | `SetLog` — a logged set (done / actuals) |
| [resources/csv-export.md](resources/csv-export.md) | `LiftFeeling` — one "how did it feel?" answer per lift per run |
| [resources/strength-metric.md](resources/strength-metric.md) | `StrengthMetric` — the user's 1RMs / benchmarks |
| [resources/load-rule.md](resources/load-rule.md) | `LoadRule` — load-derivation rules |
| [resources/exercise-template.md](resources/exercise-template.md) | `ExerciseTemplate` — user-editable movement library (display defaults + paired `LoadRule`) |
| [resources/daily-entry.md](resources/daily-entry.md) | `DailyEntry` — one day's weight + calories + wellness log (sleep quality, energy, notes, steps, HRV); feeds the derived TDEE/trend read and the home health-metric chart series |
| [resources/weight-goal.md](resources/weight-goal.md) | `WeightGoal` — the operator's active/archived weight target + effort tier; feeds the derived calorie-target/projection "goal view" and the chart's goal overlay |
| [resources/progress-photo.md](resources/progress-photo.md) | `ProgressPhoto` — optional front/back/left/right progress photos per calendar date, stored as `Bytes` in Postgres; feeds no derived read |
| [resources/auth.md](resources/auth.md) | PIN auth — login/logout/me, client state, route gate |
| [resources/user-profile.md](resources/user-profile.md) | `UserProfile` — the single operator's name + hashed PIN + onboarding marker; the sole login credential, the `needsOnboarding` first-run signal's source, and the `/onboarding` + `/profile` surfaces |
| [resources/today.md](resources/today.md) | derived "what do I do next" read path (the picked workout + its progress) |

## Reference & process

| Doc | What |
|---|---|
| [glossary.md](glossary.md) | domain + codebase terms (1RM, block, `loadMultiplier`, `WorkoutLog` vs `Workout`, …) |
| [surface-map.md](surface-map.md) | every HTTP route + every page, in one table |
| [contributing.md](contributing.md) | **read before calling a change done** — Definition of Done, doc-update map, how to add a doc |
| [specs/README.md](specs/README.md) | the spec-to-ship pipeline (`.claude/skills/`) + per-feature spec/design/architecture/task artifacts |
| [epics/README.md](epics/README.md) | epics — multi-spec initiatives: the `epic.md`/`research.md` contract, epic↔member linkage, and the `propose-epic`/`reconcile-epic` lifecycle |
| [bugs/README.md](bugs/README.md) | the bug-report queue — producers, consumer (`/fix-bug`), and per-run folder schema |
| [research/README.md](research/README.md) | durable research notes (external practice + agent research) that inform product and pipeline decisions; cited by proposals via `source_refs` |

## Authoring a doc

Copy a stub and fill it in — [_templates/resource.md](_templates/resource.md) or
[_templates/standard.md](_templates/standard.md). Read the gold-standard examples
first: [resources/week.md](resources/week.md) and
[standards/architecture.md](standards/architecture.md). Then follow the full flow
(add a row to the index table above, cross-link, run the link check) in
[contributing.md](contributing.md).

Keep docs concise and skimmable: prefer a table or a short example over prose, and
**link rather than duplicate — each fact lives in exactly one doc.** The full
authoring rules (present-state only, cell/size budgets, what `check:docs`
enforces) live in [standards/docs.md](standards/docs.md).
