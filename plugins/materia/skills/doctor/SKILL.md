---
name: doctor
description: "Non-destructive health check for a Materia-installed project. Runs the deterministic inspector (plugins/materia/scripts/doctor.mjs) against a target repo — reading this plugin's release/artifact ledger and the repo's .materia/project.json — and reports one overall status (healthy · warnings · action-needed · blocked · unknown) plus whether the repo is Materia-enabled, its current vs latest artifact schema, any required/recommended/optional changes from the ledger, manual action items, an informational listing of same-release changes available to adopt (impact-ordered required/recommended/optional — adoption cannot be auto-verified for these; each names its adoption steps and the /materia:migrate --acknowledge pointer to quiet it), and a suggested next command. Detects untracked pre-tracking (legacy) installs and stale schemas and points at /materia:migrate --plan for them. Reads only; writes nothing, migrates nothing. Run it in an operator session on demand when you want to know whether a repo's Materia artifacts are current."
---

# doctor — inspect a Materia-installed project's health

The explicit, **read-only** inspection command for the `materia` plugin. It
answers, deterministically: is this repo Materia-enabled, does it have project
state, is its artifact schema current / stale / legacy-untracked / malformed /
unknown, which release-ledger changes are relevant, and what should the operator
do next.

Doctor reads the plugin's bundled release ledger and the target repo's
`.materia/project.json`, and prints a report — see Scope below for the full
read-only contract. The health verdict is produced by the deterministic
script, not the model; this skill runs it and summarizes the result (see
Rules) rather than re-deriving or guessing at state.

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

## Outputs

Doctor's only output is the report it prints — it writes nothing to the repo
(see Scope):

- **Default** — a human-readable summary: overall status, whether the repo is
  Materia-enabled, current vs latest artifact schema, the project-state location
  (or that it is missing/malformed), the per-check results, any
  required/recommended/optional changes, manual action items, an "Available to
  adopt" listing of same-release changes that cannot be auto-verified
  (impact-ordered required/recommended/optional, each with its adoption
  instructions and the `/materia:migrate --acknowledge <id>` pointer to quiet
  it once adopted or considered), and the suggested next command. On a
  Materia-enabled repo the script may append a **"Design gates:"** section —
  its read-only, out-of-contract scan of per-run `design.md` approval blocks —
  listing runs paused `pending` (awaiting approval; a legitimate in-progress
  state, not an error) or `abandoned` (parked). It is informational only and
  never affects the status or exit code.
- **`--json`** — the same report as a structured JSON object (for piping into
  other tooling), plus one additional top-level key the human summary derives
  its "Design gates:" section from: `designGate`, an array of per-run
  design-gate entries (empty when there is nothing paused or the repo is not
  Materia-enabled).

The script's exit code encodes the status (`0` healthy/warnings/unknown, `1`
action-needed, `2` blocked).

## Procedure

1. **Run the deterministic inspector.** Resolve the plugin token in the **shell**
   (the Read tool does not expand a literal `${CLAUDE_PLUGIN_ROOT}` path) and run:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" [path] [--json]
   ```

   with `[path]` omitted to inspect the current repo. The script exits `0` for
   `healthy`/`warnings`/`unknown`, `1` for `action-needed`, `2` for `blocked` —
   a non-zero exit is a normal report outcome here, not a skill failure.

2. **Summarize the result** for the operator from the script's own output (see
   Rules). A single light framing line may open the summary — the resident
   alchemist's read on the repo's workbench — but everything below it is the
   script's verdict verbatim (the status word, schema numbers, per-check results,
   and next command are relayed exactly, never re-voiced). Lead with the overall
   status and whether the repo is Materia-enabled,
   then the current vs latest artifact schema, the project-state location (or
   that it is missing/malformed), and any required/recommended/optional changes
   plus manual action items the script listed. When the report carries an
   "Available to adopt" listing, relay it too — same-release changes that
   cannot be auto-verified (schema-invisible prose or per-run-artifact
   contracts), impact-ordered, each with its adoption steps; mention that
   `/materia:migrate --acknowledge <change-id>` quiets an entry once the
   operator has adopted or considered it. It is purely informational — it
   never changes the status above. Two of the per-check results
   concern the binding check:docs gate script: `check-docs-sh-present` is `ok`
   when it sits at EITHER the canonical `.materia/scripts/check-docs.sh` OR a
   legacy `scripts/check-docs.sh` a not-yet-relocated install still carries (and
   `warning` at neither), while `check-docs-sh-location` is `ok` only at the
   canonical location and `warning` when it is root-only. A further check,
   `docs-location`, concerns the agent-facing docs tree: it is `ok` when the tree
   sits at the canonical `.materia/docs/` (or when there is nothing materia-shaped
   to relocate — no `.materia/docs/` and no legacy `docs/README.md` router, so a
   docs-less repo is never nagged), and `blocked` (breaking drift) when a legacy
   `docs/README.md` router is present with `.materia/docs/` absent. Relay each
   check's own remediation wording — it is schema-aware (it points at
   `/materia:migrate --plan` for a behind repo migrate can move/stamp, or "move it
   by hand" / "move the docs tree to .materia/docs/ by hand" for a state migrate
   will not modify). When the script appended a "Design gates:" section (see
   Outputs), relay those entries too — pending runs awaiting approval and
   abandoned (parked) runs — noting they are informational and do not affect
   the status.

3. **Recommend the next step the script named** — no more. Common cases:
   - **`healthy`** — schema is current; nothing required. Note that a healthy
     report can still list *optional* changes in the schema-window buckets (an
     `optional`-impact drift never demotes the status) — relay them as
     available, not needed. Separately, a healthy report — including a
     schema-current one — can list *recommended* and *optional* same-release
     changes under "Available to adopt": informational, adoption cannot be
     auto-verified for these, and listing one never demotes the status. Relay
     each with its adoption steps and the `/materia:migrate --acknowledge
     <change-id>` pointer to quiet it once adopted or considered. (A
     `required`-impact entry cannot legitimately appear here under a genuinely
     healthy status: an unadopted, detectable `required` drift's own check
     already demotes status off healthy before this listing is ever reached.)
     A healthy report can ALSO carry a `/materia:migrate --plan` suggestion in one
     bookkeeping case: an **adopted-but-unstamped** repo (it already carries a
     change's artifact — e.g. the gate script at the canonical
     `.materia/scripts/check-docs.sh` — but the project-state still records the
     older schema). The drift is adopted, so status stays healthy; migrate has a
     stamp-only step left to record. Relay the suggestion as bookkeeping, not a
     problem.
   - **`warnings`** — e.g. an untracked pre-tracking (legacy) install, or a stale
     schema whose adoptable changes are *recommended*. Relay the script's
     suggested next step, `/materia:migrate --plan` — the operator runs that to
     see the proposed migration (and, on `--apply`, adopt the safe ones).
   - **`action-needed`** — a `required`-impact change is outstanding; relay the
     script's suggestion.
   - **`blocked`** — malformed `.materia/project.json`, an unknown schema, or a
     project newer than the installed plugin. Relay the script's manual fix item
     (e.g. repair the JSON, or update the plugin); do **not** attempt the fix as
     part of doctor. (One `blocked` sub-case is a **tool fault** — the plugin's
     own ledger failing to read — which the script labels as such and attaches no
     project fix item; relay that framing rather than blaming the target repo.)
   - **`unknown`** — the repo does not appear Materia-enabled. State that plainly
     and invent no project state. (If the operator expected a Materia repo, the
     likely next step is `/materia:init` — offer it, don't run it.)

## Scope

- **Reads only.** Doctor never writes, edits, migrates, or regenerates
  anything — no branch, commit, PR, or file change is ever produced.
- **Does not implement `/materia:migrate`.** It only *suggests* it — `--plan`
  where the report calls for it, and `--acknowledge <change-id>` alongside each
  "Available to adopt" entry — never runs it itself.
- **Certifies artifacts, not their consumers.** A healthy doctor confirms a gate
  script is present and at its canonical location, but not that the repo's own
  references to it (the `MATERIA.md § Gate` row, package scripts, CI, docs) still
  point there; `/materia:migrate`'s plan carries the deterministic stale-reference
  scan (`referenceFollowUps`) for that gap.
- **Does not auto-run.** It is operator-invoked; nothing triggers it from plugin
  startup hooks.
- Runs in the **operator's own session** — it is never spawned as a pipeline
  sub-unit, so it carries no `MATERIA.md` § Skill routing tier row.

## Rules

- The **script owns the verdict.** The skill relays it; it does not override the
  status or fabricate state the script marked `unknown`/`blocked`.
- **No destructive or mutating action** is ever taken (see Scope) — not even
  the fixes the report suggests. Doctor diagnoses; the operator (or
  `/materia:migrate`) acts.
- When the report suggests `/materia:migrate --plan`, present it as the next
  step; migrate is the separate plan-first command that acts.
