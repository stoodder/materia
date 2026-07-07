# Bug reports

`docs/bugs/` is the **bug-report tree** — a sibling to `docs/specs/`. It holds the
queue contract, the report body template, per-run templates, and per-bug run
folders. Where `docs/specs/` tracks feature work, `docs/bugs/` tracks
reproducible defects from first report through resolution.

## What lives here

| Path | Role |
|---|---|
| [`_reports/README.md`](_reports/README.md) | **Queue contract** — frontmatter shape, folder pattern, lifecycle, producer/consumer responsibilities, and the producers table |
| [`_templates/bug-report.md`](_templates/bug-report.md) | **Body template** — the 13-section fill-in stub that `/materia:report-bug` (and hand-authors) fill in |
| [`_templates/status.md`](_templates/status.md) | **Bug-run STATUS template** — the resumable-state stub `/materia:fix-bug` seeds when it mints a new bug-run folder; carries the `## Bug-report provenance` block and the eight-stage checklist |
| [`_templates/reproduction.md`](_templates/reproduction.md) | **Reproduction template** — the fill-in stub `reproduce-bug` writes into; records the failing test path(s), repro steps, expected-vs-actual, and RED evidence |
| [`_templates/bug-analysis.md`](_templates/bug-analysis.md) | **Bug-analysis template** — the `architecture.md` analogue for the bug loop; the stub `bug-analysis` fills and `plan-tasks` decomposes |

## Producers

The canonical list of producers that write into `_reports/` lives in
[`_reports/README.md` § Producers in this repo](_reports/README.md). It is not
duplicated here — one fact, one place.

`/materia:triage-retros` authors reports directly into `_reports/`: it clusters
retro signal, classifies defects, folds duplicate signal about the same defect
into one single-defect report, and on approve writes conformant 13-section
reports into `docs/bugs/_reports/` under `source: retro-triage` (product
improvements go to the `docs/specs/_proposed/` queue in the same run).
`/materia:ui-inspection` also drives
the running app across the surface-map and files one consolidated UI/UX checklist report.
See the Producers table in [`_reports/README.md`](_reports/README.md).

## /materia:fix-bug — the consumer

`/materia:fix-bug` is the orchestrator that drives a selected bug report from
`docs/bugs/_reports/` through the full fix pipeline and opens a PR:

```
reproduce-bug (RED gate) → bug-analysis → plan-tasks
  → implement-task(s) → post-impl review → docs-sync ⇄ docs-audit → finalize (dequeue + PR)
```

Each run creates a `docs/bugs/<dated-slug>/` folder on a `fix/<slug>` branch and
seeds it from the templates above. At terminal state (finalize) the report file is
removed from `docs/bugs/_reports/` in the same PR.

### Per-run folder schema

Every `/materia:fix-bug` run produces a `docs/bugs/<dated-slug>/` folder with these five
artifacts:

| Artifact | Produced by | Role |
|---|---|---|
| `STATUS.md` | `/materia:fix-bug` (stake-and-mint) | Resumable run state — stages, provenance, per-task review state |
| `retro.md` | `/materia:fix-bug` (stake-and-mint) | Per-stage retrospective entries; harvested by `triage-retros` |
| `reproduction.md` | `reproduce-bug` | Failing test path(s), repro steps, RED evidence |
| `bug-analysis.md` | `bug-analysis` | Root cause, affected files, fix approach — the `architecture.md` analogue that `plan-tasks` decomposes |
| `tasks.md` | `plan-tasks` | Ordered, dependency-aware task list; marked `[x]` as implement-task runs |
