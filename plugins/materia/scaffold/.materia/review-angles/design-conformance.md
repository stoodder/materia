---
name: design-conformance
description: Verifies built screens against the staged design's assertions and the deterministic conformance findings, classifying each discrepancy as implementation drift or design debt (design-gated).
---

# design-conformance — design conformance review angle

## What it checks

The built screens against the **staged design's contract** — not against taste. You review from
two inputs, both handed to you in the brief; you did not watch the implementation happen:

- the `## Assertions` block from `design.md` — the rubric;
- the deterministic conformance findings from the § Eyes design conformance harness — the facts,
  inlined into this brief (never a file you read yourself).

Walk **every assertion**, in order, and record for each **pass**, **fail**, or **not-checkable**,
with concrete evidence — a harness fact, or a specific observation from the labeled captures
(staged snapshot vs implemented screen). Then report **discrepancies no assertion covers**: those
are the high-value ones, because each means `design.md` under-specified something.

Never produce a number the harness already measured. The findings are facts — cite them; do not
re-eyeball spacing, colour, or radius the harness computed.

## Classify every discrepancy — take a position

A discrepancy is one of two things, and you must say which. An angle that only reports "these
differ" pushes the judgment back to the human at exactly the moment the machine has the most
context:

- **implementation drift** — the code is wrong, the design was right. A normal finding, severity
  per the central rubric.
- **design debt** — the code is right, the design was wrong or infeasible. Emit the finding with
  `classification: design-debt`. This is not a code fix.

Set the `classification` field on the finding record; how each routes (fix loop vs retro/backlog,
and the `design.md` course-correction banner) is the orchestrator's job — see `ship-spec/SKILL.md`
§ Loop on findings and § Course corrections. Do not route it yourself, and do not open tasks.

**`not-checkable`** — an assertion no static capture can settle because its checker is the e2e
lane (a runtime-behaviour assertion `ui-test-plan` turns into a guarded flow). Mark it
`classification: not-checkable` with a one-line note on why it is a runtime assertion.
Not-checkable **here** is not unverified **everywhere** — say so. It is informational, never a
`fail`.

## Seam with the `ui` angle

`ui` judges qualitative, app-level cohesion against the repo's visual standards and the design's
cohesion anchors — taste. `design-conformance` verifies the built screens against the staged
design's assertions and the deterministic findings — a contract. A finding that could belong to
both is **yours** (the sharper category). Neither angle restates the other's rubric.

## What you are NOT given

Only the assertions, the inlined findings, the labeled captures, and the standard reviewer
scaffolding — `spawn-contract.md` Blocks 1 + 3, plus (from round 2) the dismissed-findings
carry-forward. **Nothing else** — not the diff, not `tasks.md`, not the implementation reasoning.
The value of this angle is precisely not having watched the build; keep it that way.

## How to run it

Run inline as an Agent over the inputs above. Do **not** stand up the app or re-run the harness —
the orchestrator already ran it in the behavioral-verify lane and handed you its output.

## Gate rationale

Relevant only on a run that designs a UI surface and commits a design contract to verify
against: the design stage produced a `design.md` with a non-empty assertions checklist, the run
resolved to a UI surface, and an Eyes toolchain exists to see the built screen. When any of those
is absent there is nothing to check against. (The gate value itself has one home — the
`MATERIA.md § Review angles` registry — not restated here.)
