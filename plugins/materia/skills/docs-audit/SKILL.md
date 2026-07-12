---
name: docs-audit
description: Verify docs against the branch's code diff after `docs-sync` edits — audit coverage, accuracy, consistency, authoring-standard conformance (.materia/docs/standards/docs.md), and the mechanical `check:docs` gate (`MATERIA.md § Gate`; links + style); return HIGH/MEDIUM/LOW findings or a clean verdict. Spawned by `ship-spec` as a sibling stage after `docs-sync` (never by a subagent). Stage 9 of the ship-spec pipeline.
---

# docs-audit — verify docs against the final branch state

`docs-audit` is the verify half of the self-contained doc loop that runs
between the review pass and `finalize`. It runs after `docs-sync` has committed
its edit pass, checks the result from fresh context, and returns findings to
the orchestrator. If findings are HIGH or MEDIUM the orchestrator re-invokes
`docs-sync` with the findings appended; if clean it proceeds to `finalize`.

Runs as a **fresh-context subagent** spawned by `ship-spec` — never by
`docs-sync` or any other subagent (subagents cannot spawn subagents).

## Inputs

- The full branch diff vs the trunk (`git diff <baseline>...HEAD`, `<baseline>`
  per `MATERIA.md` § Version control).
- The post-edit working tree (staged doc edits from `docs-sync`).
- `.materia/docs/contributing.md` (the **touch-X→update-Y** map — the authoritative
  definition of what "docs" means for a given change; `docs-audit` verifies
  coverage *against* it, never re-derives it from scratch).
- `.materia/docs/standards/docs.md` (the **authoring standard** — check 5 judges
  `docs-sync`'s edits against it).
- The relevant `.materia/docs/**` files as they stand post-`docs-sync` edits.
- **Dismissed-findings carry-forward (rounds ≥ 2).** A structured list the
  orchestrator passes in from prior audit rounds: each entry is
  `{ id, file, finding, dismissal_rationale }` for a finding the orchestrator
  triaged as **by-design / won't-fix** (e.g. an intentional dual-scale). This
  is a real input, not "prior work to defer to" — see the Procedure note.

**Fresh-context exclusion list — do NOT read:**

> **Orchestrator override.** The orchestrator MAY explicitly grant this subagent
> `STATUS.md` read/write/commit authority in its invocation prompt. When it
> does, that grant **overrides** both the `STATUS.md` exclusion below and the
> "No STATUS.md tick, no commit" default under § Outputs — follow the spawn
> prompt. Absent such a grant, the defaults below hold.

- `STATUS.md` (the resume state; the orchestrator ticks it, not this subagent —
  **unless the spawn prompt grants STATUS.md authority**, see the override
  above).
- The implementer's commit messages on the branch.
- The `docs-sync` subagent's commit messages.
- `.claude/review-logs/**` (gitignored anyway; never read it).
- The prior `docs-sync` agent's reasoning or intermediate steps.

## Outputs

- A HIGH/MEDIUM/LOW findings list returned to the orchestrator, or a clean
  verdict. Structured-finding schema (same as used in `ship-spec` § Review):
  each finding has a severity, file, and description.
- **No STATUS.md tick, no commit** — _unless the orchestrator's invocation
  prompt explicitly grants STATUS.md authority_ (see the override callout under
  § Inputs), in which case update + commit the `docs-audit` row as instructed.
  By default the orchestrator ticks the `docs-audit` row after this subagent
  returns clean.

## Procedure

1. **Coverage** — every cell of the required-updates matrix has a
   corresponding doc edit (or is intentionally noted as Blocker).
2. **Accuracy (sampled — not exhaustive)** — pick up to 5 of the largest
   code changes; verify the doc that should describe them now does.
   Sampling is explicit: full doc-vs-code verification is not feasible at
   this scale; silent-oracle paths are trusted (logged), not verified.
3. **Consistency** — `CLAUDE.md`, `.materia/docs/README.md` indexes,
   `.materia/docs/surface-map.md`, `.materia/docs/glossary.md` reflect new resources / routes /
   terms that the matrix produced.
4. **Mechanical gate** — run the `check:docs` gate (`MATERIA.md § Gate`; read-only; it verifies
   links across `CLAUDE.md` + `.materia/docs/**`, `#anchor`
   fragments, and style over the agent-context docs: change-narration
   phrases, >600-char lines, duplicated long lines, glossary alphabetical
   order). `docs-sync` runs it before committing, so a failure
   here means the sync round is defective — flag each reported line as a
   finding (`finalize`'s gate also runs it; fix in the loop so the gate stays
   green).
5. **Authoring-standard conformance** — judge the docs `docs-sync` edited on
   this branch against `.materia/docs/standards/docs.md` for what the mechanical
   checker can't catch:
   - **Delta-appended prose** — an edit bolted onto old text ("now also
     supports…", "gained a prop", a section that reads as a change log)
     instead of folded into the present-state description.
   - **Duplicated facts** — the same fact restated in a second doc instead of
     linked to its owning doc (ownership map in `.materia/docs/standards/docs.md`).
   - **Cell bloat** — multi-sentence prose growing inside table cells (under
     the 600-char backstop but past the "one–two short sentences" rule) that
     belongs in bullets below the table.
   - **Glossary mini-docs** — multi-sentence glossary entries.

   Severity: MEDIUM by default (it blocks, and the fix is a rewrite of the
   offending lines); LOW when purely cosmetic.

Findings come back as a list (HIGH/MEDIUM/LOW). HIGH and MEDIUM block; LOW is
recorded in the audit summary returned to the orchestrator.

**Honor the dismissed-findings carry-forward.** Before returning, cross-check
each candidate finding against the carry-forward input (rounds ≥ 2): if it
matches a previously-dismissed `{ id, file, finding }`, **do not re-raise it** —
the orchestrator already triaged it as by-design. If you genuinely believe a
dismissed finding is wrong, return it once as a LOW that explicitly cites the
`id` and argues against the recorded `dismissal_rationale`, rather than
re-flagging it fresh each round. This keeps the docs loop converging instead of
re-litigating settled, intentional decisions.

## Scope

What `docs-audit` does NOT do:

- Does not edit any docs — read-only by design, so it can be re-run
  idempotently between edit rounds without mutating state.
- Does not commit anything.
- Does not read `STATUS.md` or commit messages (excluded from fresh-context
  inputs above).
- Does not re-derive the required-updates matrix from scratch — it trusts
  `docs-sync`'s matrix and verifies coverage against it.
- Does not spawn further subagents — spawned by the `ship-spec` orchestrator
  only; never by `docs-sync` or any other subagent.

Standalone mechanical checking (links + style) is covered by
the `check:docs` gate (`MATERIA.md § Gate`); use that command when running outside the pipeline —
the judgment checks (coverage, accuracy, consistency, conformance) are what
this skill adds on top of it.
