# Materia release / migration ledger

The machine-readable compatibility contract for the `materia` plugin. It records, per
plugin release, what changed about the **installed-project artifact contract** — enough for
`/materia:doctor` to detect drift and `/materia:migrate` to adopt changes.

It is the **source of truth** for compatibility: human changelogs and release notes
*summarize* it for people but do **not** define it — when they disagree, the ledger
governs. Existing pre-tracking installs adopt tracking by running `/materia:migrate
--apply` (the `init-project-state` migration); new repos are born tracked from the
scaffold's `.materia/project.json`.

This directory ships **inside the distributed plugin** but is **not** materialized into user
repos: `/materia:init` copies `scaffold/`, never `release/`. Doctor/migrate read it from the
installed plugin cache.

> **Status: v0, dogfood-grade.** `/materia:doctor` ships and reads this ledger to report
> drift **read-only** (it consumes the `doctorChecks` IDs — `project-state-present`,
> `check-docs-sh-present`, `check-docs-sh-location`); it writes nothing and runs no
> migration. `/materia:migrate` ships too — **plan-first** — and consumes the `migrations`
> IDs: v0 implements two, `init-project-state` (reserved in `0.2.0-project-state-file`),
> which initializes `.materia/project.json` for a pre-tracking install, and
> `install-check-docs` (reserved in `0.3.0-check-docs-sh-gate` + `0.3.0-scripts-relocation`),
> which puts the check:docs gate script at its canonical `.materia/scripts/check-docs.sh` and
> stamps schema 3. Any other `migrations` ID below is a reserved identifier no handler
> consumes yet; migrate reports it as manual/skipped.

## Files

```
release/
  latest.json            pointer to the current plugin version + artifact schema
  versions/
    0.1.0.json           pre-tracking baseline (schema 1; a range of pre-tracking shapes, see its notes)
    0.2.0.json           introduces this contract (schema 2)
    0.3.0.json           relocates the gate script to .materia/scripts/ (schema 3)
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
- **`artifactSchema`** — an integer tracking the **installed-artifact contract**: the
  canonical set of installed artifacts, their canonical file locations, and the shape of
  `.materia/project.json`. It is **not** a full-conformance certificate for the whole
  scaffold — a repo at the latest schema has the tracked artifacts in their canonical places
  and a current project-state file, not necessarily a fully reconciled scaffold (MATERIA.md
  sections, the review-angle library, and other prose are still reconciled by hand). The
  schema changes **only** when that installed-artifact contract actually changes.

Multiple plugin versions may share one `artifactSchema`. Do **not** bump the schema just
because the plugin shipped — bump it when the installed-artifact contract moves:

- `0.1.0` = schema 1 (pre-tracking — a range of untracked shapes).
- `0.2.0` = schema 2 because it adds a new installed artifact (`.materia/project.json`) — a
  real contract change, not a version coincidence.
- `0.3.0` = schema 3 because the check:docs gate script's **canonical location** changed
  (from `scripts/check-docs.sh` to `.materia/scripts/check-docs.sh`). No file *content*
  changed, but the canonical location is part of the installed-artifact contract, so the
  schema moves — which is what lets the ledger's schema-window machinery surface the
  relocation to a behind repo at all.

### doctorChecks double as adoption signals

Because `artifactSchema` tracks canonical locations (not just the project-state file), a
schema-behind repo may **already carry** a change's artifact — e.g. the gate script sits at
`.materia/scripts/check-docs.sh` but the project-state still records schema 2. Doctor's
**adopted-drift filter** keys on exactly this: a `detectable` change whose `doctorChecks`
all report `ok` is treated as already adopted and dropped from the drift buckets, so the
repo isn't nagged to re-adopt what it already has. (Migrate still offers a stamp-only step
to record the adoption in `.materia/project.json`; doctor points at it while staying
`healthy` — the adopted-but-unstamped bridge.) This is why a change's `doctorChecks` must
honestly detect the presence of its artifact: they are read both as drift detectors and as
adoption signals.

## Per-run outputs are outside the contract

`artifactSchema` tracks the **installed-artifact contract** — the harness artifacts
`/materia:init` materializes and doctor checks for presence and canonical location. It does
**not** track **per-run product outputs**: the files a pipeline run emits into a dated run
folder under `docs/specs/<dated-slug>/` — `spec.md`, `design.md`, `architecture.md`, `tasks.md`,
`retro.md`, and the run's `STATUS.md`. These are authored per spec, live in dated run folders,
and are freely edited by the project. Their **format** changing — a new `design.md` section, a
new frontmatter block, a new prototype output — is a `scaffold` template change classified
`optional`/`recommended`, **never an `artifactSchema` bump.** (The bundled scaffold ships only
the `_templates/` these are generated from, never a materialized run output;
`scripts/validate-plugin.mjs` guards that the scaffold carries no per-run output.)

Some per-run outputs are **conditional — present iff** a predicate holds:

- `design.md` (and any design/prototype output) is present **iff** the spec declared a
  design-bearing (UI-affecting) surface; a non-UI run skips the design stage and emits nothing.
- a design **snapshot** is present **iff** the design-tool adapter has an `export` capability
  (or a `read` capability to reconstruct one from) — see MATERIA.md § Design tool.

**For doctor/migrate authors:** a per-run output's absence is *legitimate*, not drift — a repo
may simply not have run a design-bearing spec since upgrading, or its adapter may lack `export`.
So a change to one of these outputs is `detectable: false` with `detectionNotes` recording the
conditionality; doctor never flags the absence of a conditional per-run output, and migrate has
nothing mechanical to relocate. Such a change carries no `doctorChecks` and no schema move — only
its classification and, where adoption is manual, a `manualMigration` note.

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

### Accumulating changes; minting a new version file

A version file accumulates `Change` entries for the release it names. While a release is
**pending and untagged**, new entries append to its existing `versions/<v>.json` — the file
grows as work lands, and `latest.json` keeps pointing at it. Landing a `Change` entry does
**not**, on its own, mint a new version file or bump the plugin version.

**Minting a new `versions/<v>.json` (and repointing `latest.json`) is an operator decision that
closes the current release's deliberate deferral** — never a mechanical side effect of landing
an entry. A release may be held untagged on purpose (e.g. while dogfooding) with entries
accumulating; the operator mints the next file when they choose to cut the release. `Change`
entries and the version-file mechanics are validated independently (validator §6 pins the
four-way coherence *once a file exists*), so this accumulate-until-mint discipline is
**semantic** — kept by this rule, not by the linter.

### Change object

| Field | Meaning |
|---|---|
| `id` | Stable, unique change identifier (e.g. `0.2.0-project-state-file`). |
| `summary` | Human one-sentence description. |
| `impact` | One of the impact classifications below. |
| `surfaces` | Array of surface tokens this change touches (glossary below). |
| `detectable` | `true` if a doctor check can detect the drift in an installed repo. |
| `detectionNotes` | Required when `detectable` is `false`: why the drift cannot be detected (ignored when `true`). |
| `migratable` | `true` if adoption can be automated (vs manual-only). |
| `doctorChecks` | Stable check IDs `/materia:doctor` implements to detect this change's drift. |
| `migrations` | Stable migration IDs `/materia:migrate` implements (or reserves for a later handler). |
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
names). Doctor and migrate read this array to decide whether a change concerns it:

- `scaffold` — the bundled `scaffold/` templates changed.
- `ledger` — this ledger changed.
- `validator` — `scripts/validate-plugin.mjs` expectations changed.
- `doctor` — a `/materia:doctor` check applies (see `doctorChecks`).
- `migrate` — a `/materia:migrate` step applies (see `migrations`).
