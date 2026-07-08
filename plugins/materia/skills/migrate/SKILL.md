---
name: migrate
description: "Explicit, plan-first project upgrade for a Materia-installed repo. Runs the deterministic engine (plugins/materia/scripts/migrate.mjs) against a target repo — reading this plugin's release/artifact ledger and the repo's .materia/project.json — and by default PLANS the migration (writes nothing): current vs target artifact schema, which ledger migrations can be safely applied, which need manual/operator judgement, which are skipped and why, the files it would create/update, and whether local edits could be affected. With --apply it applies only safe, deterministic, idempotent migrations; v0 implements two, init-project-state (initializes .materia/project.json for a detectable pre-tracking untracked-legacy install) and install-check-docs (puts the check:docs gate script at its canonical .materia/scripts/check-docs.sh — renaming a legacy scripts/check-docs.sh in place or copying it from the plugin scaffold — then stamps artifact schema 3). Apply does file ops first and the project.json stamp last, never overwrites an existing gate script or a non-schema-2 state file, never deletes anything, invents no state for a non-Materia repo. Both plan and apply also run a deterministic, no-AI reference sweep — scanning the target repo for stale consumer references to a relocated/replaced artifact (referenceFollowUps); the engine reports the hits and this skill performs the bounded post-apply sweep, then re-runs the repo's check:docs gate. Run it in an operator session when /materia:doctor reports a stale or legacy project — doctor reports, migrate plans, the operator applies."
---

# migrate — upgrade a Materia-installed project's artifacts

The explicit, **operator-invoked** project-upgrade command for the `materia`
plugin. It is the acting counterpart to the read-only `/materia:doctor`:

```
/materia:doctor reports  →  /materia:migrate --plan plans  →  operator applies (--apply)
```

migrate is **plan-first** and **v0, dogfood-grade** — see Scope below for the
exact contract (what `--plan`/`--apply` do, and the single v0 migration). The
plan/apply verdict is produced by the deterministic script
`plugins/materia/scripts/migrate.mjs`, not the model; this skill runs it and
summarizes the result (see Rules) rather than re-deriving or guessing at
state.

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

The **engine** reads no other repo state and needs no network or AI: it reads only
the ledger and `.materia/project.json`, plus a bounded, read-only reference scan of
the target repo (see the reference sweep, below). The one exception that *writes*
beyond `.materia/project.json` is this skill's post-apply **reference sweep** — and it
edits only the consumer files the engine's `referenceFollowUps` already named, still
with no network or AI.

## Outputs

- **Plan mode (default)** — writes **nothing to the repo**. It prints: current
  detected state (Materia-enabled? current vs target artifact schema), the
  migrations that can be safely applied (and the files they would create), the
  already-satisfied items, the manual items (needing operator judgement), the
  skipped items and why, the files that would change, whether local edits may be
  affected, any `referenceFollowUps` (stale consumer references to a
  relocated/replaced artifact — see the reference sweep), and — if anything is
  applicable — the exact `--apply` command to run.
- **Apply mode (`--apply`)** — applies only the safe migrations, writing
  atomically (see Rules for the never-overwrite contract), then prints what
  changed, what did not (and why), the project state after migration, the
  post-apply `referenceFollowUps`, and the suggestion to run `/materia:doctor` to
  confirm health.
- **`--json`** — the same report as a structured JSON object (for other tooling).

No branch, commit, or PR is ever produced.

## Procedure

1. **Run the deterministic engine.** Resolve the plugin token in the **shell**
   (the Read tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path) and run:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/migrate.mjs" [path] [--plan|--apply] [--json]
   ```

   Default to **plan** (`--apply` omitted) unless the operator has explicitly
   asked to apply (see Rules).

2. **Summarize the plan** for the operator from the script's own output (see
   Rules). Lead with the current state and target schema, then the migrations
   that can be safely applied (and the files they touch), the manual items,
   and the skipped items with their reasons. State plainly whether any local
   edits could be affected (see Rules — `install-check-docs` may **rename** a
   legacy `scripts/check-docs.sh` in place, so the plan reports "Local edits may
   be affected: YES" when it applies; `init-project-state` only ever creates a
   missing file).

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
   to confirm the result (see Relationship to doctor).

5. **Reference sweep — when the report carries `referenceFollowUps` hits.** The
   engine's scan is the deterministic detector; this skill is the fix. Each
   follow-up is one artifact the migration relocated/replaced, with the stale
   consumer `hits` (`file:line`) the engine already found — **the report's hits are
   the one home; cite them, never re-derive the file list**. The engine already
   excluded the frozen dated run folders from the scan, so every hit it lists is a
   present-state consumer that is fair game.

   - **Post-`--apply`** (the hits are `staleNow`): for each follow-up with
     `autoFix: true`, rewrite the old path to the new one in the **live consumers**
     it names — the `MATERIA.md § Gate` `check:docs` row, package-manager scripts
     (`package.json`), CI workflows, settings allowlists — and in **present-state
     docs** (the index READMEs, `_templates/`, and other non-frozen docs the report
     lists). For a follow-up with `autoFix: false` (e.g. a `.mjs` consumer whose
     `node …` command shape must become `sh …`, not a mechanical path swap) and for
     any ambiguous hit (a lockfile, vendored or generated code), **list it with a
     suggested rewrite — do not edit it.** A hit inside a file the same report names
     as a manual **cleanup** item (a superseded artifact awaiting by-hand removal)
     is skipped, not rewritten — there is no point editing a file slated for
     deletion.
   - **Plan mode with `staleNow` hits and nothing applicable** — the
     schema-complete-but-stale repo (a relocated/replaced artifact whose consumers
     still point at the old path, the gymii failure mode). The plan itself writes
     **nothing**; surface the hits and **offer** the sweep. Run it only on the
     operator's explicit in-session go-ahead.
   - **Then re-run the repo's `check:docs` gate.** The gate command resolves from
     the repo's own `MATERIA.md § Gate` row (the same config home every gate-running
     skill reads) — so sweep the `§ Gate` row **first**, then run the gate, so the
     re-run uses the just-corrected command. Report the **swept diff distinctly**
     from the engine's own changes.
   - **No commit** — the operator reviews the working tree (branch/commit/PR are
     never produced; see Scope).
   - **Honesty.** A sweep failure or a still-red gate never masks the engine's
     migration success: report both outcomes plainly.

## Relationship to doctor

`/materia:doctor` is **read-only**: it detects and reports drift and, for a stale
or legacy project, suggests `/materia:migrate --plan`. migrate is the command
that **plans and (on `--apply`) acts**. The two share one deterministic detector,
so their view of a project agrees: after a successful apply, doctor no longer
flags the adopted drift. Two bookkeeping states are worth naming:

- **Adopted-but-unstamped.** If a repo already carries a change's artifact — say
  the gate script sits at the canonical `.materia/scripts/check-docs.sh` but the
  project-state still records schema 2 — doctor filters that change out of its
  buckets (it's adopted) yet still points at `/materia:migrate --plan`, because
  `install-check-docs` has a stamp-only step left to record. Doctor stays
  `healthy` (the drift is adopted); migrate finishes the bookkeeping.
- **Not-a-full-conformance certificate.** A migrated repo can still carry
  reconciliation items no migration touches (MATERIA.md sections, the
  review-angle library); a healthy schema certifies only `.materia/project.json`,
  and migrate surfaces by-hand cleanup (a superseded root `scripts/check-docs.sh`,
  a stale legacy `check-docs.mjs`) as manual items — it never deletes them.
- **Consumers, not just artifacts.** The gymii lesson: doctor certifies the
  *artifact* (the gate script is present and at its canonical location) but not the
  repo's own *references* to it — a relocated gate can pass doctor while the repo's
  `check:docs` command still points at the old path. migrate's reference scan is the
  deterministic detector for that gap, and this skill's sweep is the fix.

## Scope

- **Plan-first.** The default (`--plan`) never edits files; only `--apply`
  changes anything, and only for migrations that are safe, deterministic, and
  idempotent.
- **Two migrations in v0.** `init-project-state` (reserved in
  `0.2.0-project-state-file`) initializes `.materia/project.json` for a detectable
  pre-tracking (untracked-legacy) install. `install-check-docs` (reserved in
  `0.3.0-check-docs-sh-gate` + `0.3.0-scripts-relocation`) puts the check:docs gate
  script at its canonical `.materia/scripts/check-docs.sh` — renaming a legacy
  `scripts/check-docs.sh` in place (preserving local edits) or copying it from the
  plugin scaffold — then stamps artifact schema 3. Every other ledger change is
  reported as manual or skipped until a handler ships. No template rewrites,
  scaffold normalization, or conflict resolution in this version.
- **Does not auto-run.** It is operator-invoked; nothing triggers it from plugin
  startup or update hooks. Migration is always explicit.
- Runs in the **operator's own session** — it is never spawned as a pipeline
  sub-unit, so it carries no `MATERIA.md` § Skill routing tier row.

## Rules

- The **script owns the verdict.** The skill relays the plan/apply result; it does
  not override it or fabricate state the script marked manual/unknown.
- **Plan writes nothing.** Never edit files in plan mode; never run `--apply`
  without explicit operator intent.
- **Never overwrite local edits.** Apply never overwrites an existing gate script
  or a project-state file it did not create at the expected schema: it *creates* a
  missing `.materia/project.json`, *renames* (never rewrites) a legacy gate script,
  and *stamps* only a schema-2 state; an existing/malformed state or a
  hand-authored stale schema is reported manual, never clobbered. It never deletes
  anything — a superseded root `scripts/check-docs.sh` or stale legacy
  `check-docs.mjs` is surfaced as a manual cleanup item.
- **File ops first, stamp last.** Apply performs file moves/copies before the
  project.json schema stamp, so an interrupted apply leaves a recoverable
  schema-behind state (doctor suggests migrate again), never a stamped-but-unmoved
  orphan.
- **Stable, ledger-referenced migration ids.** Applied migrations use the exact
  ids the release ledger reserves (`init-project-state`, `install-check-docs`),
  recorded in the project-state file's `appliedMigrations` so re-runs and future
  migrations can detect what has already been applied.
- **The sweep edits only within the engine's `referenceFollowUps`.** It never scans
  or rewrites a file the engine did not name, only auto-fixes `autoFix: true` hits,
  and always re-runs the repo's `check:docs` gate (resolved from `MATERIA.md
  § Gate`) afterward. Wrapper honesty: a `§ Gate` row that is a wrapper command
  (e.g. `pnpm run check:docs`) carries no script path — the swept consumer is then
  wherever the scan hit (typically `package.json`) and the gate command re-runs
  unchanged; a custom `§ Gate` row that names the gate WITHOUT the literal old path
  is invisible to the scan (a named limitation — the post-sweep gate re-run is the
  safety net either way).
