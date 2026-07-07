# Materia release / migration ledger

The machine-readable compatibility contract for the `materia` plugin. It records, per
plugin release, what changed about the **installed-project artifact contract** — enough for
`/materia:doctor` to detect drift and a future `/materia:migrate` to adopt changes.

This directory ships **inside the distributed plugin** but is **not** materialized into user
repos: `/materia:init` copies `scaffold/`, never `release/`. Doctor/migrate read it from the
installed plugin cache.

> **Status: v0, dogfood-grade.** `/materia:doctor` now ships and reads this ledger to report
> drift **read-only** (it consumes the `doctorChecks` IDs, starting with
> `project-state-present`); it writes nothing and runs no migration. `/materia:migrate`
> remains **forthcoming** — no migration behavior ships yet, so the `migrations` IDs below
> are still reserved identifiers nothing consumes.

## Files

```
release/
  latest.json            pointer to the current plugin version + artifact schema
  versions/
    0.1.0.json           pre-tracking baseline (schema 1, no changes)
    0.2.0.json           introduces this contract (schema 2)
```

- `latest.json` — `{ pluginVersion, artifactSchema, latestVersionFile }`. Its
  `latestVersionFile` points at the newest `versions/*.json`; its `pluginVersion` and
  `artifactSchema` must agree with that file, and its `artifactSchema` must also agree with the
  scaffold's shipped `.materia/project.json` (the scaffold is version-agnostic — it ships
  `pluginVersion: null` — so only the schema is pinned against it).
  `scripts/validate-plugin.mjs` pins this coherence.
- `versions/<pluginVersion>.json` — one file per plugin release (see schema below).

## Plugin semver is not the artifact schema

Two independent version axes:

- **`pluginVersion`** — the plugin's own semver, from `plugins/materia/.claude-plugin/plugin.json`.
  It changes whenever the plugin ships.
- **`artifactSchema`** — an integer describing what a Materia-installed repo is expected to
  contain. It changes **only** when the installed-project artifact contract actually changes.

Multiple plugin versions may share one `artifactSchema`. Do **not** bump the schema just
because the plugin shipped. Here `0.1.0` = schema 1 (pre-tracking) and `0.2.0` = schema 2
because `0.2.0` genuinely adds a new installed artifact (`.materia/project.json`) — a real
contract change, not a version coincidence.

## Version file schema

```jsonc
{
  "pluginVersion": "0.2.0",      // matches this file's name and plugin.json when it is latest
  "artifactSchema": 2,           // the installed-project contract this release expects
  "summary": "...",              // human one-liner for the release
  "baseline": true,              // optional; marks a pre-tracking baseline with no changes
  "changes": [ /* Change objects — see below */ ]
}
```

### Change object

| Field | Meaning |
|---|---|
| `id` | Stable, unique change identifier (e.g. `0.2.0-project-state-file`). |
| `summary` | Human one-sentence description. |
| `impact` | One of the impact classifications below. |
| `surfaces` | Array of surface tokens this change touches (glossary below). |
| `detectable` | `true` if a doctor check can detect the drift in an installed repo. |
| `migratable` | `true` if adoption can be automated (vs manual-only). |
| `doctorChecks` | Stable check IDs `/materia:doctor` implements to detect this change's drift. |
| `migrations` | Stable migration IDs a forthcoming `/materia:migrate` will implement. |
| `manualMigration` | Instructions to adopt by hand when automation is absent or unsafe. |
| `notes` | Optional clarifications (e.g. how impact differs for new vs existing projects). |

### Impact classifications

Exactly one per change. These match the classifications the repo-local `evolve` tool enforces:

- `none` — no installed-project artifact impact.
- `doctor-only` — doctor should report drift, but no migration is needed.
- `optional` — a newer default is available; adoption is purely optional.
- `recommended` — existing projects should adopt, though old artifacts still work.
- `required` — artifacts must change for compatibility, but mechanically; old artifacts keep
  working until updated.
- `breaking` — old artifacts are unsupported without migration.

### Surface tokens

The short machine tokens used in `change.surfaces` (deliberately terser than prose surface
names). Doctor (and a future migrate) reads this array to decide whether a change concerns it:

- `scaffold` — the bundled `scaffold/` templates changed.
- `ledger` — this ledger changed.
- `validator` — `scripts/validate-plugin.mjs` expectations changed.
- `doctor` — a `/materia:doctor` check applies (see `doctorChecks`).
- `migrate` — a `/materia:migrate` step applies (see `migrations`).
