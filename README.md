# Materia

> *Prima materia* — the formless base substance the alchemists believed
> everything could be transmuted from. Also: a small glowing orb you slot into
> your equipment to gain skills, and that levels up as you use it.

Materia is a **self-improving Claude Code development harness**. You start
with a blank repo, run one `/materia-init` survey, and Materia materializes a full
spec-to-ship pipeline tailored to your tech stack:

- **Two queues** — a proposed-specs queue and a bug-reports queue, each a
  transient intake surface with a strict frontmatter/filename contract.
- **Two orchestrators** — `/materia-ship-spec` drives a proposal through intake →
  design → architecture → tasks → implementation → multi-angle review → docs →
  one PR; `/materia-fix-bug` drives a bug report through a RED-first TDD loop that
  reuses the same mid-stages.
- **Producers** — skills that fill the queues from every signal source you
  have: your ideas (`/materia-propose-spec`, `/materia-propose-epic`), your own eyes
  (`/materia-report-bug`), the app's UI (`/materia-ui-inspection`), and the pipeline's own
  retrospectives (`/materia-suggestions-to-specs`, `/materia-bugs-to-reports`).
- **Maintainers** — `/materia-janitor` sweeps the code against your standards docs;
  `/materia-librarian` sweeps the docs against the code. Both fix drift directly.
- **A self-improvement loop** — every pipeline run writes a `retro.md`;
  `/materia-triage-retros` triages the accumulated signal three ways (pipeline
  improvements / product suggestions / bugs) and `/materia-apply-pipeline-improvements`
  edits the pipeline skills themselves. The harness levels up with use.
- **A docs system built for agent context** — a progressive-disclosure read
  order (`CLAUDE.md` → `docs/README.md` → standards + resources → code),
  present-state-only authoring rules, and a deterministic `check:docs` gate
  that keeps it all true.

The glue is **`MATERIA.md`** — a companion document to `CLAUDE.md` that holds
everything stack-specific in named sections (§ Gate, § Eyes, § Surface gates,
§ Environment preflight, …). The pipeline skills are stack-agnostic and
reference `MATERIA.md` by section, so the same battle-tested skill text drives
a Nuxt app, a Rails app, or a CLI tool — only the companion doc changes.

## How to use this template

1. Create a new repo from this template (or clone it) and open it in Claude
   Code.
2. Run **`/materia-init`**. It interviews you about what you're building, helps you
   pick a stack, then writes `MATERIA.md`, `CLAUDE.md`, the `docs/` skeleton,
   and the pipeline skills into place — pruning anything your stack can't
   use (no UI → no eyes-dependent skills).
3. `/materia-init` finishes by seeding `docs/specs/_proposed/` with a **bootstrap
   epic**: the scaffolding of your app skeleton, CI, and gates as the
   pipeline's own first specs. Run `/materia-ship-spec` and the harness builds your
   app from commit one — dogfooding itself.

## Repo layout

```
.claude/skills/materia-init/    the only live skill in the template — the /materia-init survey
.claude/settings.json   permissions allowlist for routine pipeline commands (inherited by your repo; /materia-init extends it with your stack's commands)
templates/
  MATERIA.md            the companion-doc template /materia-init fills in
  CLAUDE.md             the always-loaded guide template /materia-init fills in
  skills/               the canonical pipeline skills (stack-agnostic)
  docs/                 the docs-system skeleton (contracts, templates, standards)
  scripts/check-docs.mjs  the deterministic docs checker (portable, no deps)
```

## Design values

- **Contracts are sacred.** The queue frontmatter contracts, the producer
  lifecycle, the RED-before-fix gate, the sole-writer retro rule — these were
  hardened over many runs and ship verbatim. `/materia-init` fills slots; it does not
  redraft contracts.
- **One home per fact.** Stack specifics live in `MATERIA.md` and the
  generated `docs/standards/*`; skills point at them instead of restating.
- **The PR is the review gate.** Every skill ends at exactly one PR; nothing
  auto-merges except the librarian's mechanically docs-only diff and an
  explicit `--auto` autopilot run.
- **Repos diverge by design.** `/materia-apply-pipeline-improvements` edits your
  repo's skills in place. Upstream syncing back to this template is a
  non-goal — your materia levels up with *your* usage.

## Provenance

Extracted and generalized from a production Claude Code pipeline that
shipped 60+ specs end-to-end. The contracts here are as-built, not
speculative.
