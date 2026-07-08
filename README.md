# Materia

> *Prima materia* — the formless base substance the alchemists believed
> everything could be transmuted from. Also: a small glowing orb you slot into
> your equipment to gain skills.

Materia is a Claude Code development-harness **plugin**, distributed via a
plugin marketplace and installed into any repo — nothing to clone, nothing
to fork. Install it once, run `/materia:init`, and it materializes a full
spec-to-ship pipeline tailored to your tech stack:

- **Two queues** — a proposed-specs queue and a bug-reports queue, each a
  transient intake surface with a strict frontmatter/filename contract.
- **Two orchestrators** — `/materia:ship-spec` drives a proposal through intake →
  design → architecture → tasks → implementation → multi-angle review → docs →
  one PR; `/materia:fix-bug` drives a bug report through a RED-first TDD loop that
  reuses the same mid-stages.
- **Producers** — skills that fill the queues from every signal source you
  have: your ideas (`/materia:propose-spec`, `/materia:propose-epic`), your own eyes
  (`/materia:report-bug`), the app's UI (`/materia:ui-inspection`), and the pipeline's own
  retrospectives (`/materia:triage-retros`).
- **Maintainers** — `/materia:janitor` sweeps the code against your standards docs;
  `/materia:librarian` sweeps the docs against the code. Both fix drift directly.
- **A retro-triage loop that feeds your backlog, not the harness.** Every
  pipeline run writes a `retro.md`; `/materia:triage-retros` clusters the
  accumulated signal and authors it directly into **your project's** backlog —
  proposed specs and bug reports (`source: retro-triage`) — in one PR. The
  pipeline itself ships as a versioned plugin and does not rewrite its own
  skills.
- **A docs system built for agent context** — a progressive-disclosure read
  order (`CLAUDE.md` → `docs/README.md` → standards + resources → code),
  present-state-only authoring rules, and a deterministic `check:docs` gate
  that keeps it all true.

The glue is **`MATERIA.md`** — a companion document to `CLAUDE.md` that holds
everything stack-specific in named sections (§ Gate, § Eyes, § Surface gates,
§ Environment preflight, …). The pipeline skills are stack-agnostic and
reference `MATERIA.md` by section, so the same battle-tested skill text drives
a Nuxt app, a Rails app, or a CLI tool — only the companion doc changes.

## Install & first run

```
/plugin marketplace add stoodder/materia
/plugin install materia@materia
/materia:init            # scaffolds MATERIA.md + CLAUDE.md + docs/ into this repo
```

1. **Add the marketplace, then install the plugin** (the two commands above).
   Claude Code resolves `materia@materia` — plugin `materia` from marketplace
   `materia` — and installs the skills into its plugin cache.
2. **Run `/materia:init`** in the target repo. It interviews you about what
   you're building, helps you pick a stack, then writes `MATERIA.md`,
   `CLAUDE.md`, and the `docs/` skeleton into place — sections your stack
   doesn't need (no UI → § UI-affecting: none) are marked `none` and the
   corresponding skills self-gate at runtime instead of being pruned.
3. `/materia:init` finishes by seeding `docs/specs/_proposed/` with a
   **bootstrap epic**: the scaffolding of your app skeleton, CI, and gates as
   the pipeline's own first specs. Run `/materia:ship-spec` and the harness
   builds your app from commit one.
4. **Protect `main`** (Settings → Branches, or
   `gh api` — require a pull request before merging). The allowlist
   `/materia:init` seeds into `.claude/settings.json`
   denies the force-push/push-to-main spellings it can express, but prefix
   matching has real limits (trailing flags, refspec forms like
   `git push origin +main` or `HEAD:main` evade it); branch protection is
   the mechanical backstop that
   makes "every change lands via PR" true regardless of what an agent types.
   With required approvals enabled, `--auto` autopilot merges wait for your
   approval instead of completing on green — both behaviors are correct.

Once initialized, the pipeline runs entirely through slash commands —
`/materia:ship-spec`, `/materia:fix-bug`, the producers, the maintainers, and
`/materia:triage-retros` — with no per-repo skill files to keep in sync;
upgrading the plugin upgrades every repo it's installed in.

## Repo layout

```
.claude-plugin/marketplace.json      the marketplace catalog (one entry: materia)
plugins/materia/
  .claude-plugin/plugin.json         the plugin manifest
  skills/                            the pipeline skills (stack-agnostic), invoked /materia:<name>
  scaffold/                          the bundled MATERIA.md/CLAUDE.md/docs templates + check-docs.sh
                                      that /materia:init materializes into your repo
  release/                           the plugin's own release/migration ledger (semver +
                                      artifact-schema contract; not materialized into repos)
scripts/validate-plugin.mjs          validates the marketplace + plugin manifests and the scaffold
```

## Staying current — doctor, migrate & the release ledger

Materia is a versioned plugin, so a repo it's installed in can drift from what the
current plugin expects. Two operator commands make that legible — and both are
**opt-in and non-surprising**:

- **`/materia:doctor`** — a **read-only** health check. It reads the plugin's release
  ledger and your repo's `.materia/project.json` and reports one status
  (`healthy · warnings · action-needed · blocked · unknown`), your current vs latest
  artifact schema, and any changes to adopt. It **writes nothing** and migrates
  nothing — where a migration would help it only *suggests* `/materia:migrate --plan`.
- **`/materia:migrate`** — the explicit, **plan-first** upgrade command. The default
  (`--plan`) prints what it *would* do and changes nothing; only `--apply` acts, and
  only for safe, idempotent migrations. **Migrations never auto-run** — nothing
  triggers them from plugin update or startup. Upgrading the plugin never silently
  rewrites your repo; you run migrate when you choose to.

**The release ledger is the source of truth.** Compatibility is defined by a
machine-readable release/migration ledger (`plugins/materia/release/`), not by prose.
Human changelogs and release notes *summarize* the ledger for people; they do **not**
define compatibility — when they disagree, the ledger governs. It is what doctor and
migrate actually read (from the installed plugin cache; the ledger is never copied into
your repo).

**Plugin version ≠ artifact schema.** The plugin's semver changes whenever it ships; the
**artifact schema** — an integer describing what an installed repo is expected to
contain — changes only when that installed-project contract actually changes. Multiple
plugin versions can share one schema, so a plugin upgrade does **not** imply a project
migration. `0.1.0` is the **pre-tracking baseline** (schema 1): installs from before this
system existed had no project-state file and no ledger. The **first tracked schema (2)**
begins with this compatibility system itself.

**Project state — new vs existing repos.** New repos get their state for free:
`/materia:init` materializes `.materia/project.json` (schema 2) from the bundled scaffold,
so a fresh install is born tracked. Existing pre-tracking (dogfood) repos — created before
schema 2 — have no `.materia/project.json`; `/materia:doctor` detects them as *untracked
legacy* and points at `/materia:migrate --plan`, and `/materia:migrate --apply` then runs
the one v0 migration, `init-project-state`, which writes the project-state file without
touching anything else.

This is a deliberately **conservative, dogfood-grade v0 foundation**, not a public-grade
migration framework: one automated migration, plan-first, no auto-run, and it never
overwrites an existing or hand-edited state file.

## Design values

- **Contracts are sacred.** The queue frontmatter contracts, the producer
  lifecycle, the RED-before-fix gate, the sole-writer retro rule — these were
  hardened over many runs and ship verbatim. `/materia:init` fills slots; it does not
  redraft contracts.
- **One home per fact.** Stack specifics live in `MATERIA.md` and the
  generated `docs/standards/*`; skills point at them instead of restating.
- **The PR is the review gate.** Every skill ends at exactly one PR; nothing
  auto-merges except the librarian's mechanically docs-only diff and an
  explicit `--auto` autopilot run.
- **The harness is a versioned plugin, not a self-editing one.** Every repo
  it's installed in runs the same skills from the same plugin cache; there is
  no per-repo fork to diverge. What *is* yours is the signal: retros feed
  your project's specs/bugs backlog, and `MATERIA.md`'s stack-specific
  sections are where your repo's own configuration lives.

## Provenance

Extracted and generalized from a production Claude Code pipeline that
shipped 60+ specs end-to-end. The contracts here are as-built, not
speculative.
