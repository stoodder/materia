# Bug-report queue contract

A **shared intake surface** for bug reports from any source. Each folder is a
self-contained, reproducible bug report waiting on operator review. The
directory is **source-agnostic** and **transient** — it is a live queue, not an
archive.

This document defines the contract. Any producer that drops a folder here MUST
follow it; any consumer that reads from here MAY rely on it.

## What lives here

One **folder** per bug report, with a YAML frontmatter block carrying
source-agnostic metadata followed by the report body in the exact format
`/materia:report-bug` produces (and that the fill-in stub at
[`../_templates/bug-report.md`](../_templates/bug-report.md) describes). The
body is the **bug report itself**, not a summary; a reviewer should be able to
read the report end-to-end and either triage it or discard it without consulting
any other artifact.

```
.materia/docs/bugs/_reports/
  README.md                          ← this file (the contract)
  <dated-slug>/                      ← one folder per pending report
    report.md                        ← the report (frontmatter + body)
    <surface-slug>.png               ← co-located evidence (optional)
    <surface-slug>.html              ← co-located evidence (optional)
  …
```

## Frontmatter contract

Every report file starts with this YAML block. Fields are required unless
marked optional. Consumers MUST treat unknown fields as informational and not
hard-fail on them.

```yaml
---
id: <6-char base36 token>                   # LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6; SOURCE OF TRUTH for identity
schema_version: 1                           # informational; bump on shape change
source: bug-report                          # the producer key for /materia:report-bug
severity: low | medium | high | critical    # closed enum — see Field roles below
title: <one-line title>                     # one line; matches the body H1
date: <YYYY-MM-DD>                          # the date the report was drafted
status: reported                            # always literally `reported` while in _reports/
# source_refs:                              # OPTIONAL — see Field roles below
#   - <repo-root-relative path or URL>
---
```

### Field roles

- **`id`** — the canonical unique key for this report. The **source of
  truth for identity**; **logic reads `id`, never the folder name**. Once issued,
  an `id` is immutable for the life of the report. Format: a 6-character
  base36 (lowercase a–z and 0–9) token
  (`LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`) freshly generated
  per report — the same shape as the `<rand>` token used in spec folder names
  under `.materia/docs/specs/`. Treat `id` as opaque — do not parse it.
  Legacy 5-char hex ids remain valid — id resolution is format-agnostic.
- **`schema_version`** — informational version of this frontmatter shape.
  Bump when the contract changes. Consumers SHOULD record an unrecognised
  `schema_version` and degrade rather than halt.
- **`source`** — short kebab-case identifier of the producing loop.
  `/materia:report-bug` writes `bug-report`; `/materia:triage-retros` writes
  `retro-triage`. New sources are added by convention; no enum is enforced.
- **`severity`** — a **required** closed enum: `low | medium | high | critical`.
  Gives the downstream `/materia:fix-bug` consumer a stable field to filter and
  prioritize on (a closed set, deliberately — never free text). The
  `severity` field mirrors the "Severity & impact" H2 section in the report
  body; both must agree.
- **`title`** — one-line human-readable title. SHOULD match the report body's
  H1. Used in indexes and PR descriptions.
- **`date`** — ISO date (`YYYY-MM-DD`) the report was drafted. Drives the
  folder-name prefix.
- **`status`** — always literally `reported` while the file lives here. See
  § Lifecycle below for the terminal states.
- **`source_refs`** — **optional** list of strings (repo-root-relative paths
  or URLs) pointing at evidence: error text, log excerpts, screenshots, or a
  URL to a recorded session. Bug reports originate from operator observation
  rather than a machine artifact, so a meaningful pointer is often unavailable;
  producers MAY omit this field entirely. When evidence is available, include
  it here so a reviewer can trace the report to its source.

## Folder pattern

Report folders are named:

```
<YYYY-MM-DD-HHMMSS>-<id>-<slug>/
```

and the report itself lives at `<YYYY-MM-DD-HHMMSS>-<id>-<slug>/report.md`.

This matches the `<yyyy-mm-dd-hhmmss>-<rand>-<slug>` convention used by spec folders
under `.materia/docs/specs/` —
the `id` and the `<rand>` token are the same shape (a 6-character base36
token) and serve the same role: a chronologically-sortable, globally-unique
disambiguator.

- `<YYYY-MM-DD-HHMMSS>` — the creation timestamp, UTC: the date part
  matches the frontmatter `date`; the time part is minted at write time
  (`date -u +%Y-%m-%d-%H%M%S`) so report folders `ls`-sort in creation order.
- `<id>` — the frontmatter `id` (6-char base36).
- `<slug>` — a short kebab-case rendering of the title; see
  [`.materia/docs/specs/_proposed/README.md`](../../specs/_proposed/README.md) § Kebab-slug derivation
  for the normative algorithm both producers and consumers MUST use. The
  algorithm is defined there once and referenced here — it is NOT restated in
  this file (single source of truth).

The folder name is a **convenience for humans and `ls` ordering only**. **Logic
MUST read the frontmatter `id`, never the folder name.** Two consequences:

- A producer that needs to write a report with no meaningful `<slug>` MAY use
  a placeholder slug; consumers don't care.
- Renaming a folder on disk does not change its identity. The `id` does.

## Body format

After the closing `---` of the frontmatter, the file body is a complete bug
report in the format `/materia:report-bug` produces — see
[`../_templates/bug-report.md`](../_templates/bug-report.md) for the shape.

Required sections, in order:

```
## Summary
## Environment
## Steps to reproduce
## Expected
## Actual
## Reproducibility
## Severity & impact
## Affected surface / route / module
## Preconditions / data setup
## Evidence
## Regression window
## Workaround
## Open questions
```

Producers SHOULD fill every section with at least a placeholder line; an
empty section signals to the reviewer that more detail is needed. **Logic that
consumes the body MUST NOT rely on section presence** — forward-compat: a
future schema version may reorder or rename sections.

**Consolidated-checklist variant (allowed alongside the single-defect shape).**
A producer MAY populate the `## Evidence` section as a checklist of multiple
findings rather than a narrative for a single defect. Each checklist item carries:
the surface where the issue was observed, the observed issue itself, the standard
it violates (referenced by name from the repo's visual standards docs under
`.materia/docs/standards/`), and an optional screenshot reference. This
variant uses all 13 required sections in the same order; only the internal content
of `## Evidence` differs. Consumers MUST NOT rely on body-section internals
(consistent with the rule above) — a consumer reading a checklist-variant report
MUST still strip frontmatter, resolve by `id`, and treat `## Evidence` as opaque
prose.

The body **MUST NOT** repeat metadata that already lives in the frontmatter
(no second `id:` line, no separate `Severity:` heading that duplicates the
frontmatter `severity`). Frontmatter and body are kept distinct so consumers
can strip the frontmatter without touching the body.

## Lifecycle

The directory is a **transient queue**:

1. A producer writes a new report folder (`<dated-slug>/report.md`, plus any
   co-located evidence files) with `status: reported`.
2. An operator reviews the report in place. They either:
   - **Fix** — run the report through `/materia:fix-bug`. `/materia:fix-bug` reads the selected
     report (resolved by frontmatter `id`, not folder name), strips the leading
     YAML frontmatter block, mints a `<dated-slug>`, and creates a
     `.materia/docs/bugs/<dated-slug>/` run folder on a `fix/<slug>` branch. At the
     terminal state (finalize), the report folder is staged for `git rm -r`,
     `sh .materia/scripts/check-docs.sh` is re-run against the staged removal, and the dequeue
     is committed as part of the finalize PR.
   - **Close** — delete the folder manually (e.g. `git rm -r` or via a follow-up
     PR). No state is persisted; closed reports leave no trace except in git
     history.
3. Either terminal state removes the folder from this directory. The directory
   trends toward empty.

**Lifecycle states:**

| Status | Who sets it | When |
|---|---|---|
| `reported` | producer (`/materia:report-bug`) | Folder is written into `_reports/` |
| _(removed by `/materia:fix-bug`)_ | `/materia:fix-bug` orchestrator at finalize | `/materia:fix-bug` stages `git rm -r <report-folder>`, re-runs `sh .materia/scripts/check-docs.sh` against the staged removal, and commits the dequeue as part of the finalize PR (commit message pattern: `fix-bug(stake): dequeue report <id> from _reports/`) |
| _(closed manually)_ | operator | Folder deleted without a fix run; no trace except git history |

If `/materia:fix-bug` halts mid-run (Blocker, session crash, abort), the report folder
stays in `_reports/` — the `git rm -r` only lands at the terminal state.

Because the directory is transient, **it is NOT an archive** and consumers
SHOULD NOT mine it for historical data. A producer that wants an audit trail
keeps its own log alongside its input artifacts.

## Producer responsibilities

A new producer joining the surface MUST:

- Generate a fresh `id` per report (never reuse).
- Emit valid frontmatter per the contract above.
- Write the body in the bug-report template format (all 13 required H2
  sections in order, none left empty).
- Carry traceability via the optional `source_refs` when evidence is available.
- Not duplicate a report already in the directory or recently fixed
  (de-duplication is the producer's responsibility, not the directory's).

A producer MUST NOT:

- Read or modify files written by another producer.
- Rely on the folder name for identity (use `id`).
- Embed pipeline-specific metadata in the body (frontmatter only).
- Promote out-of-scope or speculative items.

## Consumer responsibilities

A consumer (the operator triaging in place; `/materia:fix-bug` reading the folder)
MUST:

- Read frontmatter to discover identity, source, severity, and provenance.
  Folder name is decorative.
- Strip the frontmatter before passing the body to anything that expects the
  bare report format. Use a precise YAML-block strip: optionally skip a UTF-8
  BOM, opener `^---\r?\n` at line 1, closer `^---\r?\n` on its own line.
- Resolve a selection by frontmatter `id`, never by folder name.
- Remove the folder (`git rm -r`) from the directory at the terminal state.
  Leaving an acted-upon report in the directory breaks the queue's transient
  guarantee.

## Producers in this repo

| Source key | Skill | Input(s) it consumes |
|---|---|---|
| `bug-report` | `/materia:report-bug` | The operator's raw bug description, refined via in-memory Q&A; on approve it branches, writes the report, and opens a PR |
| `retro-triage` | `/materia:triage-retros` | Unprocessed `retro.md` captures under `.materia/docs/specs/**` and `.materia/docs/bugs/**`; clusters defect signal in-memory into single-defect 13-section reports (folding duplicate signal about the same defect), de-duplicates against the pending queue + recent merge log, and on approve writes them directly into `.materia/docs/bugs/_reports/` (product improvements go to the sibling `.materia/docs/specs/_proposed/` queue in the same run) |
| `janitor` | `/materia:janitor` | Legacy key — carried only by reports still pending in the queue; the janitor is now a maintainer that fixes drift directly and writes no new queue entries |
| `ui-inspection` | `/materia:ui-inspection` | The running app, driven across `.materia/docs/surface-map.md § Pages` at the canonical viewport (MATERIA.md § Eyes); judged against the repo's visual standards docs. Writes one consolidated checklist report; captures co-located in the report folder as `<surface-slug>.{png,html}`. |

When a new producer is added, it MUST update this table with one row.
**Adding a producer row is NOT a contract change** — it is a registration
update; the contract sections above are untouched. Producer rows can ship in
the PR that introduces the new producer skill.

## Consumers

Consumers read from this queue and remove folders at terminal state.

### /materia:fix-bug

`/materia:fix-bug` is the orchestrator that drives a selected report through the full
TDD fix pipeline.

**Discovery:** scans report files via the glob `.materia/docs/bugs/_reports/*/report.md`.
Resolves a selection **by frontmatter `id` only, never by folder name**.

**Branch created:** `fix/<slug>` (one branch per run, where `<slug>` is the
kebab rendering of the report's `title`).

**Terminal-state dequeue lifecycle:** at finalize, `/materia:fix-bug` stages
`git rm -r .materia/docs/bugs/_reports/<dated-slug>/`, re-runs `sh .materia/scripts/check-docs.sh`
against the staged removal, and commits the removal as part of the finalize PR.
The dequeue commit message pattern is:

```
fix-bug(stake): dequeue report <id> from _reports/
```

If `Bug-report:` in the bug-run `STATUS.md` is `—` (ad-hoc run with no
queued report), the dequeue step is skipped silently.

**Consumer responsibilities inherited:** all responsibilities in
§ Consumer responsibilities above apply — strip frontmatter before passing the
body downstream, resolve by `id`, remove the folder at terminal state.

## Changing the contract

The frontmatter contract and the folder pattern are **shared across all
producers and consumers**. Any change here forces every producer to update in
lockstep. Flag PRs that modify this file for extra scrutiny.
