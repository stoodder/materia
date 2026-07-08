# Materia project fixtures

Minimal, self-contained sample project trees that back the script-backed
`/materia:doctor` (validate-plugin.mjs §7) and `/materia:migrate` (§8) tests.
They are **not** app templates — they carry just enough Materia artifacts to
exercise detection and state-tracking logic.

Three shapes:

- **`legacy-0.1.0-project/`** — a pre-tracking (`artifactSchema` 1) install as it
  looked before the release/artifact contract existed. It has Materia artifacts
  (`MATERIA.md`, a `.materia/review-angles/` file) so detection can recognize it
  as *likely Materia-enabled*, but **no `.materia/project.json`** — the defining
  absence doctor uses to flag it as untracked/migratable and migrate's
  `init-project-state` keys on. It DOES carry a `scripts/check-docs.sh` stub, so
  the change-agnostic `check-docs-sh-present` check reports `ok` and the only
  drift is the recommended untracked-legacy adoption. §8 copies it to a temp dir
  to exercise apply (the committed fixture is never mutated).

- **`tracked-current-project/`** — the current tracked shape a fresh
  `/materia:init` produces: it carries `.materia/project.json` at `artifactSchema`
  2. Its `project.json` mirrors exactly what the bundled scaffold ships today
  (`pluginVersion: null`, `source: "scaffold"`), i.e. an unstamped freshly-init'd
  project — no stamping step exists yet. It also carries a `scripts/check-docs.sh`
  stub so `check-docs-sh-present` reports `ok` and the repo reads fully `healthy`.

- **`gnarly-legacy-project/`** — a REAL early dogfood install from deep inside the
  pre-tracking `0.1.0` range, modeling a repo that drifted before the scaffold
  stabilized. It is Materia-enabled (`MATERIA.md`, `CLAUDE.md`) but **has no
  `.materia/` at all** and **no `scripts/check-docs.sh`** — it still carries the
  old `scripts/check-docs.mjs` the `.sh` gate replaced, and its `MATERIA.md` omits
  the `§ Version control` / `§ Forge` / `§ Review angles` / `§ Skill routing`
  sections a current install has. Doctor reports `warnings` (untracked-legacy
  recommended drift) with `check-docs-sh-present` at `warning`; neither escalates
  past `warnings`. This is the fixture that proves schema currency is not a
  full-conformance certificate and that the honest caveat is surfaced.

The `.sh`/`.mjs` and `check-docs` stubs here are placeholders — doctor tests only
their PRESENCE; fixtures are never executed. Keep these small. Add fields/files
only when a doctor/migrate test needs them.
