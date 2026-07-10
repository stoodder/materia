---
schema_version: 1
slug: <dated-slug>
branch: <type>/<slug>
started_at: <ISO timestamp>
finalized_at: <ISO timestamp when run ends — left blank until then>
status: running
---

<!-- Per-run retrospective captured by the `ship-spec` orchestrator. Entries are
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
     inside `implement-task`) are summarized in their parent's entry. Each
     first-level subagent (`intake`, `design`, `architecture`, `plan-tasks`, each
     `implement-task`, `docs-sync` (per round), `docs-audit` (per round), `finalize`)
     returns one entry in their report.

     Schema per entry (`ship-spec` passes this verbatim in each spawn prompt):

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
     (pipeline-level)`.

     Design-gate signal (ship-spec/SKILL.md § Design gate): when the run had
     a design gate, the `design` entry (or the orchestrator's own, if the
     gate resolved after design's entry was already written) records
     `rounds` from the design.md approval block and what the revisions were
     about, categorized: `missing-state` | `wrong-hierarchy` |
     `design-system-violation` | `infeasible` | `misread-spec`. Rounds-per-
     spec is the honest measure of whether the design stage itself is any
     good — but if `misread-spec` dominates, the problem is upstream in the
     spec, not the design stage.

     Design-conformance drift signal (ship-spec/SKILL.md § Review — the
     design-conformance angle): when a design-conformance review ran, the
     orchestrator's review entry records each classified finding with a
     drift category, in the bullet prose (triage-retros clusters on the words,
     it has no category field): `assertion-unmet` | `assertion-unfalsifiable`
     | `design-infeasible` | `design-underspecified` | `token-hardcoded`.
     `assertion-unmet`, `design-infeasible`, and `token-hardcoded` that name a
     real code/design gap can become backlog items; `assertion-unfalsifiable`
     (a runtime assertion the static angle can't settle — its checker is the
     e2e lane) and `design-underspecified` are process signal. If
     `design-underspecified` dominates, the design.md Assertions format is
     wrong, not the implementers. -->

