---
name: migrate
description: "Explicit, plan-first project upgrade for a Materia-installed repo. Runs the deterministic engine (plugins/materia/scripts/migrate.mjs) against a target repo — reading this plugin's release/artifact ledger and the repo's .materia/project.json — and by default PLANS the migration (writes nothing): current vs target artifact schema, which ledger migrations can be safely applied, which need manual/operator judgement, which are skipped and why, the files it would create/update, and whether local edits could be affected. With --apply it applies only safe, deterministic, idempotent migrations; v0 implements one, init-project-state, which initializes .materia/project.json for a detectable pre-tracking (untracked-legacy) install. It never overwrites an existing or malformed state file, invents no state for a non-Materia repo, and mutates only the project-state target. Run it in an operator session when /materia:doctor reports a stale or legacy project — doctor reports, migrate plans, the operator applies."
---

# migrate — upgrade a Materia-installed project's artifacts

The explicit, **operator-invoked** project-upgrade command for the `materia`
plugin. It is the acting counterpart to the read-only `/materia:doctor`:

```
/materia:doctor reports  →  /materia:migrate --plan plans  →  operator applies (--apply)
```

migrate is **plan-first**. The default mode inspects the repo against this
plugin's release/artifact ledger and prints the proposed plan **without editing
any file**. Only `--apply` changes anything, and only for migrations that are
safe, deterministic, and idempotent. The plan/apply verdict is produced by the
deterministic script `plugins/materia/scripts/migrate.mjs`, not by the model —
this skill is the orchestration/explanation layer that runs the script and
summarizes the result. Where the script cannot act safely, migrate reports the
change as **manual** and does **not** guess.

This is **v0, dogfood-grade**: the only implemented apply-mode migration is
`init-project-state` (the stable id the ledger reserves in
`0.2.0-project-state-file`), which initializes `.materia/project.json` for a
detectable pre-tracking (untracked-legacy) install. Every other ledger change is
reported as manual or skipped until a handler ships. migrate does **not** move
files, rewrite templates, or normalize scaffold in this version.

## Invocation

```
/materia:migrate [path] [--plan | --apply] [--json]
```

- `path` — the project root to migrate (default: the current working directory).
- `--plan` — inspect and print the plan; **writes nothing** (this is the default).
- `--apply` — apply only the safe, idempotent migrations the plan lists.
- `--json` — emit the structured report as JSON instead of the human summary.

## Inputs

- The **target repo** at `path` (default cwd): its root `MATERIA.md` / `.materia/`
  (the Materia-enabled markers) and `.materia/project.json` (the project-state
  file). Plan mode reads only; apply mode may **create** `.materia/project.json`.
- This plugin's **release ledger**, bundled at `${CLAUDE_PLUGIN_ROOT}/release/`
  (`latest.json` + `versions/*.json`) — the machine-readable compatibility
  contract. The script reads it from its own sibling directory; the skill does
  not pass it in.

migrate reads no other repo state and needs no network or AI.

## Outputs

- **Plan mode (default)** — writes **nothing to the repo**. It prints: current
  detected state (Materia-enabled? current vs target artifact schema), the
  migrations that can be safely applied (and the files they would create), the
  already-satisfied items, the manual items (needing operator judgement), the
  skipped items and why, the files that would change, whether local edits may be
  affected, and — if anything is applicable — the exact `--apply` command to run.
- **Apply mode (`--apply`)** — applies only the safe migrations, then prints what
  changed, what did not (and why), the project state after migration, and the
  suggestion to run `/materia:doctor` to confirm health. Apply mutates **only**
  `.materia/project.json`, writes it **atomically**, and **never** overwrites an
  existing or malformed file.
- **`--json`** — the same report as a structured JSON object (for other tooling).

No branch, commit, or PR is ever produced.

## Procedure

1. **Run the deterministic engine.** Resolve the plugin token in the **shell**
   (the Read tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path) and run:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/migrate.mjs" [path] [--plan|--apply] [--json]
   ```

   Default to **plan** (`--apply` omitted) unless the operator has explicitly
   asked to apply. Never run `--apply` on your own initiative — apply is an
   operator decision.

2. **Summarize the plan** for the operator from the script's own output — do not
   re-derive or second-guess it. Lead with the current state and target schema,
   then the migrations that can be safely applied (and the files they touch), the
   manual items, and the skipped items with their reasons. State plainly whether
   any local edits could be affected (for v0's `init-project-state`: no — it only
   ever creates a missing file).

3. **Recommend the next step the script named** — no more:
   - **Something applicable** — relay the script's `/materia:migrate --apply`
     suggestion and, when the operator approves, run it.
   - **Nothing applicable, all manual** — relay the manual items; do **not**
     attempt the manual fixes as part of migrate (e.g. a malformed
     `.materia/project.json`, an unknown/newer schema, or a non-Materia repo where
     the likely step is `/materia:init` — offer it, don't run it).
   - **Nothing to do** — the project is already current; say so.

4. **On `--apply`,** run the engine, then summarize what changed, what did not
   and why, and the resulting project state. Close by suggesting `/materia:doctor`
   to confirm the result (a legacy repo may still carry warnings from
   change-agnostic checks migrate does not adopt).

## Relationship to doctor

`/materia:doctor` is **read-only**: it detects and reports drift and, for a stale
or legacy project, suggests `/materia:migrate --plan`. migrate is the command
that **plans and (on `--apply`) acts**. The two share one deterministic detector,
so their view of a project agrees: after a successful `init-project-state` apply,
doctor no longer flags the untracked-legacy drift. It does not follow that the
repo is `healthy` — change-agnostic checks (e.g. a missing `scripts/check-docs.sh`)
can still warn; migrate adopts only the ledger's migrations, never those.

## Scope

- **Plan-first.** The default never edits files; only `--apply` changes anything.
- **One migration in v0.** `init-project-state` initializes the project-state
  file for a detectable legacy install. No file moves, template rewrites, scaffold
  normalization, or conflict resolution — those are reported manual/future.
- **Does not auto-run.** It is operator-invoked; nothing triggers it from plugin
  startup or update hooks. Migration is always explicit.
- Runs in the **operator's own session** — it is never spawned as a pipeline
  sub-unit, so it carries no `MATERIA.md` § Skill routing tier row.

## Rules

- The **script owns the verdict.** The skill relays the plan/apply result; it does
  not override it or fabricate state the script marked manual/unknown.
- **Plan writes nothing.** Never edit files in plan mode; never run `--apply`
  without explicit operator intent.
- **Never overwrite local edits.** Apply only ever *creates* a missing
  `.materia/project.json`; an existing or malformed file is reported manual, never
  clobbered. Apply mutates only the project-state target.
- **Stable, ledger-referenced migration ids.** Applied migrations use the exact
  ids the release ledger reserves (`init-project-state`), recorded in the
  project-state file's `appliedMigrations` so re-runs and future migrations can
  detect what has already been applied.
