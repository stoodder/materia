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
  design (stage-reviewed, then human gate) → architecture (stage-reviewed) →
  tasks → implementation → multi-angle review → docs → one PR; `/materia:fix-bug`
  drives a bug report through a RED-first TDD loop that reuses the same
  mid-stages.
- **Producers** — skills that fill the queues from every signal source you
  have: your ideas (`/materia:propose-spec`, `/materia:propose-epic`), your own eyes
  (`/materia:report-bug`), and the pipeline's own retrospectives
  (`/materia:triage-retros`).
- **Maintainers** — `/materia:janitor` sweeps the code against your standards docs;
  `/materia:librarian` sweeps the docs against the code; `/materia:curator` and
  `/materia:concierge` sweep the running app's visuals and experience. All fix
  drift directly.
- **A retro-triage loop that feeds your backlog, not the harness.** Every
  pipeline run writes a `retro.md`; `/materia:triage-retros` clusters the
  accumulated signal and authors it directly into **your project's** backlog —
  proposed specs and bug reports (`source: retro-triage`) — in one PR. The
  pipeline itself ships as a versioned plugin and does not rewrite its own
  skills.
- **A docs system built for agent context** — a progressive-disclosure read
  order (`CLAUDE.md` → `.materia/docs/README.md` → standards + resources → code),
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
/materia:init            # scaffolds MATERIA.md + CLAUDE.md + .materia/docs/ into this repo
```

1. **Add the marketplace, then install the plugin** (the two commands above).
   Claude Code resolves `materia@materia` — plugin `materia` from marketplace
   `materia` — and installs the skills into its plugin cache.
2. **Run `/materia:init`** in the target repo. It interviews you about what
   you're building, helps you pick a stack, then writes `MATERIA.md`,
   `CLAUDE.md`, and the `.materia/docs/` skeleton into place — sections your stack
   doesn't need (no UI → § UI-affecting: none) are marked `none` and the
   corresponding skills self-gate at runtime instead of being pruned. Materia
   reserves `.materia/` (plus `MATERIA.md`/`CLAUDE.md` at the root) in the target repo;
   it adopts cleanly where that path is free, and leaves any pre-existing root
   `docs/` alone — that stays yours.
3. `/materia:init` finishes by seeding `.materia/docs/specs/_proposed/` with a
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

**Forge support is GitHub-only.** Materia's automated forge operations — opening
PRs, reading CI, merging — drive **GitHub** through the `gh` CLI (or its GitHub
MCP twins in a `gh`-less environment). On any other forge (GitLab, Bitbucket,
Gitea, …) set `MATERIA.md` § Forge to `none`: the spec-to-ship pipeline still
runs end to end, but the PR/CI/merge steps degrade to the manual `none`
convention — the skill prints the drafted PR and stops for you to open and merge.

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
  scaffold/                          the bundled MATERIA.md/CLAUDE.md/docs templates
                                      and .materia/ (the check-docs.sh docs gate, review-angles
                                      library + project.json) that /materia:init materializes into your repo
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
**artifact schema** — an integer tracking the **installed-artifact contract** (the canonical
set of installed artifacts, their canonical locations, and the `.materia/project.json`
shape) — changes only when that contract actually changes, so a plugin upgrade does **not**
imply a project migration. `0.1.0` is the pre-tracking baseline (schema 1); the first
tracked schema (2) begins with this compatibility system itself; schema 3 moves the
check:docs gate script to its canonical `.materia/scripts/` home. See
[`plugins/materia/release/README.md`](plugins/materia/release/README.md) for the normative
definition — the full schema/semver contract and the impact classifications (`none` through
`breaking`) doctor and migrate act on.

**Project state — new vs existing repos.** New repos get their state for free:
`/materia:init` materializes `.materia/project.json` (schema 3) from the bundled scaffold,
so a fresh install is born tracked. Existing pre-tracking (dogfood) repos — created before
schema 2 — have no `.materia/project.json`; `/materia:doctor` detects them as *untracked
legacy* and points at `/materia:migrate --plan`, and `/materia:migrate --apply` then runs
the two v0 migrations: `init-project-state` writes the project-state file, and
`install-check-docs` puts the check:docs gate script at its canonical
`.materia/scripts/check-docs.sh` (relocating a root copy or installing from the plugin
scaffold) and stamps the adopted schema.

This is a deliberately **conservative, dogfood-grade v0 foundation**, not a public-grade
migration framework: two automated migrations, plan-first, no auto-run, and it refuses to
touch a malformed or hand-authored stale state file — those are surfaced as manual items,
never overwritten.

## Design values

- **Contracts are sacred.** The queue frontmatter contracts, the producer
  lifecycle, the RED-before-fix gate, the sole-writer retro rule — these were
  hardened over many runs and ship verbatim. `/materia:init` fills slots; it does not
  redraft contracts.
- **One home per fact.** Stack specifics live in `MATERIA.md` and the
  generated `.materia/docs/standards/*`; skills point at them instead of restating.
- **The PR is the review gate.** Every repo-changing pipeline run ends at
  exactly one PR — the named exceptions are the read-only/operator tools
  (`/materia:doctor`, which writes nothing; `/materia:migrate --apply`, which
  writes the working tree directly with no PR), `/materia:init`'s bootstrap
  commit to the default branch, and a pipeline's internal sub-stages (which
  don't each open their own PR). Nothing auto-merges except the librarian's
  mechanically docs-only diff and an explicit `--auto` autopilot run.
- **The harness is a versioned plugin, not a self-editing one.** Every repo
  it's installed in runs the same skills from the same plugin cache; there is
  no per-repo fork to diverge. What *is* yours is the signal: retros feed
  your project's specs/bugs backlog, and `MATERIA.md`'s stack-specific
  sections are where your repo's own configuration lives.

## Provenance

Extracted and generalized from a production Claude Code pipeline that
shipped 60+ specs end-to-end. The contracts here are as-built, not
speculative.
