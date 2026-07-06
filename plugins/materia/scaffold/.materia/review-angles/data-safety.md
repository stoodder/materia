---
name: data-safety
description: Data-layer safety review — destructive migrations, seed idempotency, upsert indexes (data-gated).
---

# data-safety — data-layer safety review angle

## What it checks

The data-layer diff, reviewed for:

- **Destructive migration operations** against existing data — dropped or
  narrowed columns, table drops.
- **Seed idempotency** — re-seeding preserves user-entered values.
- **Unique indexes backing every upsert.**
- The repo-specific invariants in `MATERIA.md § Data layer`.

This angle is relevant only when the diff touches the persistence layer.

## How to run it

Run inline as an Agent over the data-layer diff.
