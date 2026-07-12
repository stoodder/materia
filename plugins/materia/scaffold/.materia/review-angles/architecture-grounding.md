---
name: architecture-grounding
description: Evidence honesty of the technical plan — reuse claims, precedent invariants, and scope-validation greps verified against the repo.
---

# architecture-grounding — evidence honesty of the technical plan

## What it checks

Whether the technical-plan artifact's evidence is honest, not just asserted.
Findings use category `architecture-grounding`.

- Every asserted reuse carries a real evidence line — the literal grep or
  `git ls-files` command plus its file:line hits — never a bare "confirmed by
  grep".
- Precedent-invariant checks are explicit: the precedent's invariants and the
  new code's invariants are both named, and any divergence is called out.
- Scope-validation grep counts are present and honest — a zero-hit area is
  reduced, merged, or removed, not left standing.
- Relative links in the artifact resolve.

Bug lane: when the artifact is `.materia/docs/bugs/<dated-slug>/bug-analysis.md`, the
Affected-files list must be grounded in the reproduction evidence
(`reproduction.md` plus the failing tests), not asserted.

## How to run it

Run inline as an Agent. Read the artifact plus its inputs — `spec.md` and
`design.md` for the spec pipeline, or the bug report body and
`reproduction.md` for the bug pipeline. Re-run the artifact's own greps and
evidence commands yourself and compare the actual output against what the
artifact recorded.

## Gate rationale

Relevant whenever the run produced a technical-plan artifact — the spec
pipeline's architecture document, or the bug pipeline's analysis document.
