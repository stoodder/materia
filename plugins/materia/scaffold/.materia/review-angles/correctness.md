---
name: correctness
description: Correctness, simplicity, and test coverage across the cumulative diff, including test quality.
---

# correctness — correctness + simplicity + test-coverage

## What it checks

Correctness bugs, needless complexity, and test coverage across the cumulative
diff. Findings use the categories `correctness`, `coverage`, and `simplicity`.

Sub-mandates:

- **Test quality** — a test that asserts nothing, or that mocks the unit under
  test, is a finding.
- The repo-specific correctness invariants named in `MATERIA.md § Review
  angles`, plus the standards docs the tasks cite.

## How to run it

Invoke the `code-review` skill if the session provides it; otherwise run the
same angle inline (which covers test coverage in practice).

`code-review` is harness-provided and may be absent from a session. When it is
unavailable, running this angle inline is the documented procedure, not a
deviation.
