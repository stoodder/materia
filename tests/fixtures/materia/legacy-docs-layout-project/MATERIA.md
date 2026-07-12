# MATERIA.md — the stack adaptation surface

Fixture stub for a Materia install that adopted artifact tracking (schema 3)
but still keeps its agent-facing docs at the **legacy root `docs/`**, before the
0.4.0 relocation to `.materia/docs/`. The `docs-relocation` detection +
auto-move carrier.

## Identity

- **App:** Legacy docs-layout fixture app
- **What it is:** A tracked (schema 3) Materia project whose docs tree predates
  the `.materia/docs/` relocation, used to exercise `docs-location` drift and
  `relocate-docs` auto-move + gate refresh in migrate's §8 tests.
