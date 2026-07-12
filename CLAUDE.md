# CLAUDE.md

Orientation for working on **this repo — the source of the Materia plugin**.
Read this, then the docs the map below points at, before changing anything.

## What this repo is

The development and distribution home of Materia, a Claude Code
development-harness plugin (see [README.md](README.md) for the product story).
The unusual property of working here: **the product is mostly markdown**. The
skills, the scaffold, and the release ledger are prose contracts consumed by
agents — so cross-document consistency IS correctness, and most "code review"
here is contract review. The validator exists to pin that consistency
mechanically.

This repo is **not** a Materia-installed repo. `plugins/materia/scaffold/**`
files (MATERIA.md, CLAUDE.md, .materia/docs/…) are *templates that ship to user repos*,
not this repo's own configuration. Do not run `/materia:ship-spec`,
`/materia:init`, or the other product pipelines here; they are exercised in
separate Materia-installed repos.

## Folder map

```
.claude-plugin/marketplace.json      ← the marketplace manifest (plugin list + source)
plugins/materia/                     ← the distributed plugin
  .claude-plugin/plugin.json         ← plugin manifest (name, version)
  skills/                            ← the skills (prose contracts; the product)
  scaffold/                          ← what /materia:init materializes into a user repo
  release/                           ← the release/migration ledger (README.md is NORMATIVE)
  scripts/                           ← doctor.mjs + migrate.mjs + shared lib (ships in the plugin)
scripts/validate-plugin.mjs          ← the repo's gate: §-numbered consistency-pin suite
scripts/check-docs-oracle.mjs        ← Node parity oracle for the scaffold's check-docs.sh (repo-local, never bundled)
tests/fixtures/materia/              ← committed doctor/migrate fixture repos
.claude/skills/evolve/               ← /evolve, the repo-local change orchestrator (not distributed)
.github/workflows/validate.yml       ← CI: the same validators, plus busybox/gawk portability lanes
```

## How changes happen here

Any real change to the harness — skills, scaffold, validator, manifests,
release machinery, CI — runs through **`/evolve`** (`.claude/skills/evolve/`):
intake → plan → adversarial review → operator approval → reviewed execution →
exactly one PR, never auto-merged. A small change still uses `/evolve` (it
scales the ceremony down); only a single obvious edit (a typo) skips it.

This repo carries no `.materia/docs/specs/_proposed/` queue — that queue shape belongs
to Materia-installed repos, not the harness source.

## Gates — run before every commit

```bash
node scripts/validate-plugin.mjs        # the full §-suite; must end "plugin validation: all clean."
claude plugin validate .                # marketplace manifest
claude plugin validate ./plugins/materia # plugin manifest
```

`validate-plugin.mjs` is the load-bearing gate: beyond manifest shape it pins
cross-document contracts — §-citation resolution (a `MATERIA.md § Section`
reference must name a real heading), registry↔file bijections, ledger/version
four-way coherence (§6), doctor/migrate behavior suites against the fixtures
(§7/§8), scaffold run-output hygiene (§1f), and the check-docs sh↔oracle
parity lanes. When it fails, it fails closed and names the pin — fix the
inconsistency, don't loosen the pin. CI runs the same suite; busybox lanes
that SKIP locally are hard failures there.

## The release/artifact contract (the part easiest to forget)

`plugins/materia/release/README.md` is **normative**. The short version:

- Every change classifies its installed-repo impact (`none` → `breaking`).
  Non-`none` changes land a machine-readable `Change` entry in the pending
  version file **in the same PR** — doctor/migrate consume the ledger, not PR
  prose. `/evolve` enforces this; silence is never a legal deferral.
- `pluginVersion` (semver) and `artifactSchema` (installed-artifact contract
  integer) are **independent axes** — most releases don't bump the schema.
- Entries accumulate into the pending version file — which `latest.json`
  already points at while the release stays **untagged**. Minting (a new
  version file + `latest.json` repoint + `plugin.json` bump) opens that
  pending window; **cutting the release (the git tag) is the deferred
  operator step**. Both are operator decisions, never side effects.
- Known consequence of an untagged pending release: `claude plugin update`
  compares version strings only, so repos installed from the marketplace need
  uninstall+reinstall to pick up folded changes until the tag is cut.

## Conventions that bite

- **Zero runtime dependencies.** Every `.mjs` here is Node stdlib only — no
  npm installs, ever. The scaffold's gate script is POSIX sh for the same
  portability reason (its Node twin is the repo-local oracle).
- **Grep before renaming anything.** Skills cite each other's sections by
  name (`ship-spec/SKILL.md § Design gate`); templates, the validator, and
  the ledger's `manualMigration` strings all carry such references. The
  validator pins many, not all.
- **One home per fact.** A contract lives in exactly one document; everything
  else points at it. When two documents disagree, fix the pointer, not by
  duplicating.
- **Comment density is deliberate.** The scripts carry heavy rationale
  comments (why a guard exists, what a pin protects). Match it — the next
  reader is an agent that only sees the file.
- **The scaffold ships no per-run outputs** (validator §1f): only
  `_`-prefixed dirs + `README.md` under the scaffold's `.materia/docs/{specs,bugs,
  epics,research}/`. Per-run artifacts are templates (`_templates/`), never
  materialized examples.
- **doctor and migrate share one detector** (`scripts/lib/materia-contract.mjs
  inspect()`); never fork state detection into either CLI.
