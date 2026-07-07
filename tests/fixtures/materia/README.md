# Materia project fixtures

Minimal, self-contained sample project trees that back the script-backed
`/materia:doctor` (validate-plugin.mjs §7) and `/materia:migrate` (§8) tests.
They are **not** app templates — they carry just enough Materia artifacts to
exercise detection and state-tracking logic.

Two shapes:

- **`legacy-0.1.0-project/`** — a pre-tracking (`artifactSchema` 1) install as it
  looked before the release/artifact contract existed. It has Materia artifacts
  (`MATERIA.md`, a `.materia/review-angles/` file) so detection can recognize it
  as *likely Materia-enabled*, but **no `.materia/project.json`** — the defining
  absence doctor uses to flag it as untracked/migratable and migrate's
  `init-project-state` keys on. §8 copies it to a temp dir to exercise apply
  (the committed fixture is never mutated).

- **`tracked-current-project/`** — the current tracked shape a fresh
  `/materia:init` produces: it carries `.materia/project.json` at `artifactSchema`
  2. Its `project.json` mirrors exactly what the bundled scaffold ships today
  (`pluginVersion: null`, `source: "scaffold"`), i.e. an unstamped freshly-init'd
  project — no stamping step exists yet.

Keep these small. Add fields/files only when a doctor/migrate test needs them.
