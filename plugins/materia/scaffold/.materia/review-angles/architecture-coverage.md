---
name: architecture-coverage
description: Completeness of the technical plan — every requirement mapped, risks and test strategy present, decomposable without re-deciding.
---

# architecture-coverage — completeness of the technical plan

## What it checks

Whether the technical-plan artifact is complete enough to decompose into
tasks without re-deciding anything. Findings use category
`architecture-coverage`.

- Every `spec.md` requirement and `design.md` assertion maps to a specified
  change — nothing is silently dropped or quietly deviated from.
- Risks/trade-offs, a test strategy, and explicit out-of-scope are all
  present.
- The plan is concrete enough for `plan-tasks` to decompose without having to
  re-decide anything itself.
- Every touched layer cites its standard.
- On non-product features, the operator-surface enumeration is present.

Bug lane: the root cause fully explains the RED evidence, and the fix scope
covers the whole affected surface, not just the one reproducing case.

## How to run it

Run inline as an Agent. Read the artifact plus its upstream inputs. Walk each
requirement and assertion to its mapped change in the artifact, and verify
the required sections exist and are concrete rather than placeholder.

## Gate rationale

Same condition as its sibling: relevant whenever the run produced a
technical-plan artifact — the spec pipeline's architecture document, or the
bug pipeline's analysis document.
