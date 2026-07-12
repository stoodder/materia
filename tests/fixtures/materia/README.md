# Materia project fixtures

Minimal, self-contained sample project trees that back the script-backed
`/materia:doctor` (validate-plugin.mjs §7) and `/materia:migrate` (§8) tests.
They are **not** app templates — they carry just enough Materia artifacts to
exercise detection and state-tracking logic.

Four shapes, each carrying a distinct story about the release/artifact contract:

- **`legacy-0.1.0-project/`** — a pre-tracking (`artifactSchema` 1) install as it
  looked before the release/artifact contract existed, and the **adopted-drift-filter
  carrier**. It has Materia artifacts (`MATERIA.md`, a `.materia/review-angles/`
  file) so detection can recognize it as *likely Materia-enabled*, but **no
  `.materia/project.json`** — the defining absence doctor uses to flag it as
  untracked/migratable and migrate's `init-project-state` keys on. It DOES carry a
  **root** `scripts/check-docs.sh` stub, so `check-docs-sh-present` reports `ok` and
  the required `0.3.0-check-docs-sh-gate` entry is **filtered as already-adopted**
  (`requiredChanges` is empty) — but `check-docs-sh-location` reports `warning`
  (root-only), so the recommended `0.3.0-scripts-relocation` entry stays in
  `recommendedChanges` alongside the recommended untracked-legacy adoption. Doctor
  reports `warnings`. §8 copies it to a temp dir to exercise apply (init-project-state
  + install-check-docs relocate the script and stamp schema 3; the committed fixture
  is never mutated). It also carries a minimal **`package.json`** whose `check:docs`
  script runs `sh scripts/check-docs.sh` — a genuine first-migration-class **consumer** of the
  old gate path, so migrate's reference scan surfaces exactly one auto-fixable
  `referenceFollowUps` hit (the package.json line, NOT the gate script's own header,
  which the scan excludes as the from-path artifact). §8 pins that hit both directions
  (plan: `staleNow` false; post-apply: `staleNow` true once the script has relocated).

- **`tracked-current-project/`** — the current tracked shape a fresh
  `/materia:init` produces: it carries `.materia/project.json` at `artifactSchema`
  4, the gate script at its canonical `.materia/scripts/check-docs.sh`, and the
  agent-docs router at `.materia/docs/README.md`. Its `project.json` matches the
  bundled scaffold's core fields (`pluginVersion: null`, `source: "scaffold"`),
  i.e. an unstamped freshly-init'd project — but deliberately **omits** the
  scaffold's pre-filled `acknowledgedChanges` (absent reads as `[]`), so §7's
  windowless "available to adopt" listing is non-empty for this fixture (the
  all-acknowledged twin is a §7 synthetic case, not a committed fixture).
  `check-docs-sh-present`, `check-docs-sh-location`, and `docs-location` all
  report `ok` and the repo reads fully `healthy` (schema current, nothing
  outstanding).

- **`legacy-docs-layout-project/`** — a tracked schema-3 install whose agent
  docs still sit at the legacy repo-root `docs/` (a `docs/README.md` router
  with a tree-escaping `../MATERIA.md` link; `.materia/docs/` absent), and the
  **docs-relocation drift carrier** for the 0.4.0 `docs/` -> `.materia/docs/`
  move: `docs-location` reports the drift, and §8 copies it to a temp dir to
  exercise the `relocate-docs` apply — the auto-move, the stale-roots gate
  refresh (old bytes backed up to `.materia/scripts/check-docs.sh.pre-schema4`),
  the schema-4 stamp, and the refreshed gate flagging the now-short escaped
  link for by-hand repair (the committed fixture is never mutated).

- **`gnarly-legacy-project/`** — a REAL early dogfood install from deep inside the
  pre-tracking `0.1.0` range, and the **required-drift carrier**. It is
  Materia-enabled (`MATERIA.md`, `CLAUDE.md`) but **has no `.materia/` at all** and
  **no `check-docs.sh` at either location** — it still carries the old
  `scripts/check-docs.mjs` the `.sh` gate replaced, and its `MATERIA.md` omits the
  `§ Version control` / `§ Forge` / `§ Review angles` / `§ Skill routing` sections a
  current install has. Because the gate script is absent, `check-docs-sh-present`
  reports `warning` and the required `0.3.0-check-docs-sh-gate` entry is NOT
  filtered: it lands in `requiredChanges`, so doctor reports **`action-needed`
  (exit 1)** — the required drift escalates past the recommended untracked-legacy
  adoption. This is the fixture that proves schema currency is not a
  full-conformance certificate and that a missing binding gate is action-needed.
  §8 exercises its apply (install-check-docs copies the gate from the plugin
  scaffold and stamps schema 3; the stale `scripts/check-docs.mjs` is left untouched
  and surfaced as a manual cleanup item).

The `.sh`/`.mjs` and `check-docs` stubs here are placeholders — doctor tests only
their PRESENCE and LOCATION; fixtures are never executed. Keep these small. Add
fields/files only when a doctor/migrate test needs them.
