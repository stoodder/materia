---
name: behavior
description: End-to-end behavioral verification of the merged branch.
---

# behavior — behavioral verification angle

## What it checks

That the merged branch behaves correctly end-to-end — every task listed under
`behavior-deferred:` and any user-visible AC across the diff.

## How to run it

Invoke the `verify` skill over the merged branch.

`verify` is harness-provided. When a named skill is unavailable, running that
angle inline is the documented procedure, not a deviation.
