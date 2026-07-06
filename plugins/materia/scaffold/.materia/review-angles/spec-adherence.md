---
name: spec-adherence
description: Literal AC verification plus regression / blast-radius across changed exports.
---

# spec-adherence — spec-adherence + regression/blast-radius

## What it checks

That the implementation satisfies the spec and does not regress existing
behavior. Findings use the categories `spec-adherence` and `regression`.

## How to run it

Run inline as an Agent:

- Verify each AC literally across `tasks.md`.
- Flag AC bullets that under-cover `spec.md`.
- Identify callers and dependents of changed exports (blast radius).
- Check regression by reading the pre-branch state via
  `git show <baseline>:<path>`.
