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
  retrospectives (`/materia:suggestions-to-specs`, `/materia:bugs-to-reports`).
- **Maintainers** — `/materia:janitor` sweeps the code against your standards docs;
  `/materia:librarian` sweeps the docs against the code. Both fix drift directly.
- **A retro-triage loop that feeds your backlog, not the harness.** Every
  pipeline run writes a `retro.md`; `/materia:triage-retros` triages the
  accumulated signal two ways (product suggestions / bug reports) into
  **your project's** backlog. `/materia:suggestions-to-specs` turns suggestions
  into proposed specs and `/materia:bugs-to-reports` files the bugs — the
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
  scaffold/                          the bundled MATERIA.md/CLAUDE.md/docs templates + check-docs.mjs
                                      that /materia:init materializes into your repo
scripts/validate-plugin.mjs          validates the marketplace + plugin manifests and the scaffold
```

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
