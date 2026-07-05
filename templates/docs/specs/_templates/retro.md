---
schema_version: 1
slug: <dated-slug>
branch: <type>/<slug>
started_at: <ISO timestamp>
finalized_at: <ISO timestamp when run ends — left blank until then>
status: running
---

<!-- Per-run retrospective captured by the `materia-ship-spec` orchestrator. Entries are
     appended after each first-level stage completes, and the orchestrator's own
     self-review is the final entry. A separate, scheduled aggregation skill
     (out of scope for ship-spec) consumes multiple retro.md files to propose
     pipeline improvements.

     `schema_version` is informational metadata, not a strict gate. It lets a
     downstream reader interpret entries in light of how the retro format has
     evolved over time, without anything hard-failing on a version difference.

     `status` is rewritten on every flush:
       running → completed | blocked | failed | aborted
     A partial file is always self-describing — `retro.md` is committed +
     pushed after each entry, so however far the run got, the record is real. -->

# <Feature> — pipeline retro

<!-- The orchestrator extracts each entry from the subagent's returned ` ```retro `
     fenced block and appends it to the file. Sub-subagents (the reviewer subagents
     inside `materia-implement-task`) are summarized in their parent's entry. Each
     first-level subagent (`intake`, `materia-design`, `materia-architecture`, `materia-plan-tasks`, each
     `materia-implement-task`, `materia-docs-sync` (per round), `materia-docs-audit` (per round), `materia-finalize`)
     returns one entry in their report.

     Schema per entry (`materia-ship-spec` passes this verbatim in each spawn prompt):

     ## Entry <N> — <stage-id> — <ISO timestamp>

     - **Stage:** <intake | design | ui-test-plan | architecture | plan-tasks | implement-task:T<n> | docs-sync | docs-audit | reconcile-epic | finalize | orchestrator (pipeline-level)>
     - **Outcome:** ok | blocked | failed | partial
     - **Subagent return:** ok          <!-- or: crashed | empty | malformed -->

     ### What went well
     - ...

     ### What could be improved
     - ...

     ### Unexpected
     - ...

     ### Other signals
     - ...

     The final entry is the orchestrator's own pipeline-level self-review,
     following the same schema, clearly marked `Stage: orchestrator
     (pipeline-level)`. -->
