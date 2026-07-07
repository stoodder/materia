---
name: doctor
description: "Non-destructive health check for a Materia-installed project. Runs the deterministic inspector (plugins/materia/scripts/doctor.mjs) against a target repo — reading this plugin's release/artifact ledger and the repo's .materia/project.json — and reports one overall status (healthy · warnings · action-needed · blocked · unknown) plus whether the repo is Materia-enabled, its current vs latest artifact schema, any required/recommended/optional changes from the ledger, manual action items, and a suggested next command. Detects untracked pre-tracking (legacy) installs and stale schemas and points at /materia:migrate --plan for them. Reads only; writes nothing, migrates nothing. Run it in an operator session on demand when you want to know whether a repo's Materia artifacts are current."
---

# doctor — inspect a Materia-installed project's health

The explicit, **read-only** inspection command for the `materia` plugin. It
answers, deterministically: is this repo Materia-enabled, does it have project
state, is its artifact schema current / stale / legacy-untracked / malformed /
unknown, which release-ledger changes are relevant, and what should the operator
do next.

Doctor is **non-destructive**: it reads the plugin's bundled release ledger and
the target repo's `.materia/project.json`, and prints a report. It **writes
nothing**, changes no files, and **runs no migration** — where a migration would
help it only *suggests* the (forthcoming) `/materia:migrate --plan`.

The health verdict is produced by the deterministic script, not by the model.
This skill is the orchestration/explanation layer: it runs the script and
summarizes the result. When the script cannot determine state, doctor reports
that plainly (`unknown` / `blocked`) and **does not guess** — it never invents
project state a non-Materia repo doesn't have.

## Invocation

```
/materia:doctor [path] [--json]
```

- `path` — the project root to inspect (default: the current working directory).
- `--json` — emit the structured report as JSON instead of the human summary
  (useful for piping into other tooling).

## Inputs

- The **target repo** at `path` (default cwd): its root `MATERIA.md` / `.materia/`
  (the Materia-enabled markers) and `.materia/project.json` (the project-state
  file), read-only.
- This plugin's **release ledger**, bundled at `${CLAUDE_PLUGIN_ROOT}/release/`
  (`latest.json` + `versions/*.json`) — the machine-readable compatibility
  contract. The script reads it from its own sibling directory; the skill does
  not pass it in.

Doctor reads no other repo state and needs no network or AI.

## Procedure

1. **Run the deterministic inspector.** Resolve the plugin token in the **shell**
   (the Read tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path) and run:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" [path] [--json]
   ```

   with `[path]` omitted to inspect the current repo. The script exits `0` for
   `healthy`/`warnings`/`unknown`, `1` for `action-needed`, `2` for `blocked` —
   a non-zero exit is a normal report outcome here, not a skill failure.

2. **Summarize the result** for the operator from the script's own output — do
   not re-derive or second-guess it. Lead with the overall status and whether the
   repo is Materia-enabled, then the current vs latest artifact schema, the
   project-state location (or that it is missing/malformed), and any
   required/recommended/optional changes plus manual action items the script
   listed.

3. **Recommend the next step the script named** — no more. Common cases:
   - **`healthy`** — schema is current; nothing to do. Say so.
   - **`warnings`** — e.g. an untracked pre-tracking (legacy) install, or a stale
     schema whose adoptable changes are recommended/optional. Relay the script's
     suggested `/materia:migrate --plan` (noting that `/materia:migrate` is
     forthcoming — for now the report's manual action items describe the change
     by hand).
   - **`action-needed`** — a `required`-impact change is outstanding; relay the
     script's suggestion.
   - **`blocked`** — malformed `.materia/project.json`, an unknown schema, or a
     project newer than the installed plugin. Relay the script's manual fix item
     (e.g. repair the JSON, or update the plugin); do **not** attempt the fix as
     part of doctor.
   - **`unknown`** — the repo does not appear Materia-enabled. State that plainly
     and invent no project state. (If the operator expected a Materia repo, the
     likely next step is `/materia:init` — offer it, don't run it.)

## Scope

- **Reads only.** Doctor never writes, edits, migrates, or regenerates anything.
- **Does not implement `/materia:migrate`.** It only *suggests* it (and its
  `--plan` mode) where the report calls for it.
- **Does not auto-run.** It is operator-invoked; nothing triggers it from plugin
  startup hooks.
- Runs in the **operator's own session** — it is never spawned as a pipeline
  sub-unit, so it carries no `MATERIA.md` § Skill routing tier row.

## Rules

- The **script owns the verdict.** The skill relays it; it does not override the
  status or fabricate state the script marked `unknown`/`blocked`.
- **No destructive or mutating action** is ever taken — not even the fixes the
  report suggests. Doctor diagnoses; the operator (or a future `/materia:migrate`)
  acts.
- When the report suggests `/materia:migrate --plan`, present it as the next
  step and note that command is forthcoming; fall back to the report's manual
  action items until it ships.
