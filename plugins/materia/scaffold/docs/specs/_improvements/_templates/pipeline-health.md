<!-- Filled by the `materia-triage-retros` skill (run-folder health rollup).
     Producer: materia-triage-retros
     Consumer: none — accumulates as historical corpus
     Renamed: never (unlike product-suggestions.md and bug-reports.md, which are consumed by rename) -->
---
schema_version: 1
slug: <slug>
generated_at: <generated_at>
retros_consumed: <retros_consumed>
total_entries: <total_entries>
blocker_rate: <blocker_rate>
ok_rate: <ok_rate>
most_failing_stage: <most_failing_stage>
triage_conversion: <triage_conversion>
---

# <Slug-as-Title-Case> — pipeline health

<summary paragraph — the batch headline in the synthesizer's voice: its health
signals plus what was captured (N suggestions / M bugs). This is the on-disk
seed the triage PR's title and body are re-derived from at PR-open.>

## Outcome counts by stage

| Stage | ok | partial | blocked | failed | Total | subagent_return issues |
|---|---|---|---|---|---|---|
| <stage> | <ok> | <partial> | <blocked> | <failed> | <total> | <issues> |
| **Total** | **<ok>** | **<partial>** | **<blocked>** | **<failed>** | **<total>** | **<issues>** |

## Triage conversion

- **Entries processed:** <total_entries> across <N> retros
- **Product suggestions:** <product_count> (product-suggestions.md emitted | none this run)
- **Bugs gathered:** <bug_count> (bug-reports.md emitted | none this run)
- **Blocker rate:** <blocker_rate>
- **Most-failing stage:** <most_failing_stage | none>

## What's working

<!-- omitted when no positives surface -->

- <positive signal from ≥2 retros or worth preserving>

## Degraded retros

<!-- omitted when all sub-agents returned cleanly -->

- `<retro_path>` — <first parse_note>

---

_Pipeline health rollup by `materia-triage-retros` run `<slug>` on `<generated_at>`. Not consumed by any downstream skill — accumulates as historical corpus._
