---
name: bugs-to-reports
description: Drafts conformant bug reports in docs/bugs/_reports/ from unprocessed `bug-reports.md` hand-off files emitted by `triage-retros`. Single-shot: parse the gathered bug items in-memory, present candidates for approval, then write reports and rename consumed sources on approve. As soon as discovery finds work the skill syncs latest main and branches; on approve it commits the reports + renames and opens a single PR covering both.
---

# bugs-to-reports — queue reports from gathered bugs

A simple, single-shot skill that turns the unprocessed `bug-reports.md` files
under `docs/specs/_improvements/**/` into queued bug-report files in
[`docs/bugs/_reports/`](../../../docs/bugs/_reports/README.md). Conforms to the
queue's shared contract (frontmatter shape, filename pattern, body shape).

**Lifecycle:** interactive checkpoint · branch-at-discovery — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, zero-work exit, id minting, consume-by-rename, link
integrity, one PR + tooling). The skill parses the gathered items in-memory,
presents candidates for approval, then writes reports and renames the consumed
sources; the git diff is the audit — no per-run audit folder, no envelope
JSON.

Read [`docs/bugs/_reports/README.md`](../../../docs/bugs/_reports/README.md)
(the shared queue contract), `.claude/skills/triage-retros/resources/rendering.md` §
`bug-reports.md` (the input shape; shape truth in
`docs/specs/_improvements/_templates/bug-reports.md`), and
[`docs/bugs/_templates/bug-report.md`](../../../docs/bugs/_templates/bug-report.md)
(the 13-section body format) before changing this skill.

## Procedure

### 1. Discover and branch

Glob unprocessed sources from the repo root:

```bash
git ls-files 'docs/specs/_improvements/**/bug-reports.md'
```

The glob pattern matches `bug-reports.md` exactly, so
`bug-reports.processed.md` is excluded by the pattern. Belt-and-braces:
reject any path whose basename matches
`^bug-reports\.processed(\..+)?\.md$`.

**Also reject any path containing a `/_templates/` segment.** The recursive `**`
glob matches the canonical fill-in stub at
`docs/specs/_improvements/_templates/bug-reports.md`, which is a template full of
`<placeholder>` tokens, not a real hand-off — never consume it.

**Zero matches:** print "No unprocessed `bug-reports.md` found. Nothing to
do." and end the turn. No prompt, no further action, **no branch created** —
the zero-match path is a clean no-op.

If at least one source survives, sync `main` and check out a new branch
**before** any further work (no writes have happened yet; the branch exists so
the rest of the run's incremental edits land somewhere clean):

```bash
git checkout main && git pull
git checkout -b file/from-bug-reports-<YYYY-MM-DD>
```

`<YYYY-MM-DD>` is today's date (same-day collision + dirty-pull handling per
the lifecycle).

For each surviving path, derive `{ path, slug }` where `slug` is the parent
folder name.

### 2. Parse each source

Parse each `bug-reports.md` with a section regex over the raw markdown — no AST
walker. The shape is fixed by `triage-retros`'s `## bug-reports.md
rendering`: YAML frontmatter, a fixed intro paragraph, a `## Filed reports`
table with one row per bug item, and a trailing footer.

Per-item fields extracted from each table row:

- `title` (column "Title")
- `severity` (column "Severity" — one of `low | medium | high | critical`)
- `source_retro` (column "Source retro", format `<retro_path> § <anchor>`)
- `report_file` (column "Report file" — always `—` in gather-only mode; ignored)

Degradation is tolerable: missing or malformed fields → record a one-line note
in the loading stream and keep the item in the set. Don't halt on tolerable
weirdness; only hard-halt when zero items survive parsing across all sources.

### 3. Draft (in-memory)

For each parsed item, draft a complete conformant bug report in-memory. There
is **no cluster or filter pass** — items are already-triaged defects that
`triage-retros` placed in the `bugs[]` bucket with an assigned severity. The
mapping is **1:1 item→report**; the operator's `drop <id>` at the confirmation
prompt is the only removal path.

Per item:

1. **Mint a fresh `id`** via `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`. Never reuse an
   `id` already on disk in `docs/bugs/_reports/` or visible in the recent merge
   log.

2. **Derive the slug** from `title` via the normative kebab-slug algorithm at
   [`docs/specs/_proposed/README.md` § Kebab-slug
   derivation](../../../docs/specs/_proposed/README.md). Do NOT invent a
   different algorithm.

3. **Compose the full 13-section body** in the format
   [`docs/bugs/_templates/bug-report.md`](../../../docs/bugs/_templates/bug-report.md)
   defines:

   ```
   # <title>
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

   Fill each section from the item's available data. No required H2 may be left
   empty — use a placeholder line per the queue contract if the source data
   doesn't populate the field (e.g. "Unknown — see source retro for context.").

4. **Mirror `severity` in two places.** Write the severity value (read verbatim
   from the "Severity" column) to both the frontmatter `severity:` field **and**
   the `## Severity & impact` body section. Both must agree; the queue contract
   requires it.

5. **Populate `source_refs`** from the "Source retro" column so a reviewer can
   trace the item back to its evidence.

### 4. Present for confirmation

Show the operator everything in one turn:

```
─────────────────────────────────────────────────────────────────────
Drafted <N> report(s) from <M> source file(s).

  1. <id-1> — <title-1>  [severity: <low|medium|high|critical>]
     Will be written to: docs/bugs/_reports/<dated-slug-1>/report.md

     <full inline body — frontmatter + 13-section body>

  2. <id-2> — <title-2>  [severity: <severity>]
     Will be written to: docs/bugs/_reports/<dated-slug-2>/report.md

     <full inline body>

  …

Sources to mark processed (renamed to bug-reports.processed.md on approve):
  - docs/specs/_improvements/<slug-1>/bug-reports.md
  - …

Reply:
  - `approve` — write the report file(s) and rename the source(s).
  - `edit: <feedback>` — adjust all draft(s) and re-present.
  - `edit <id>: <feedback>` — edit just one report in the batch.
  - `drop <id>` — remove a report from the batch.
  - `cancel` — exit cleanly; nothing written, nothing renamed.
─────────────────────────────────────────────────────────────────────
```

End the turn.

### 5. Fold edits, re-render, re-confirm

When the operator replies with `edit: …` or `edit <id>: …` or `drop <id>`,
apply the change in-memory and re-emit the confirmation prompt from step 4. No
commits land yet — the branch exists from step 1 but holds zero diffs until
step 6.

`cancel` and the fold-loop cadence follow the lifecycle (delete the empty
branch; print "Cancelled. No reports written; branch removed.").

### 6. Write, rename, commit, push, open PR

On `approve`, run the write + rename steps first, then the git workflow.

1. **Write each report file** with the `Write` tool to
   `docs/bugs/_reports/<dated-slug>/report.md`. Frontmatter + body per §
   File format (id-collision handling per the lifecycle).

2. **Rename each consumed source** with `git mv` (preserves history):

   ```bash
   git mv docs/specs/_improvements/<slug>/bug-reports.md \
          docs/specs/_improvements/<slug>/bug-reports.processed.md
   ```

3. **Append a one-line footer** to the bottom of each
   `bug-reports.processed.md`:

   ```
   processed_on: <YYYY-MM-DD>
   ```

4. **Verify link integrity, then stage + commit** the reports, the renames, and
   the footer edits together:

   Verify link integrity per the lifecycle invariant (`pnpm run check:docs`;
   fix any links the new files introduce), then commit:

   ```bash
   git add docs/bugs/_reports/ docs/specs/_improvements/
   git commit -m "bugs-to-reports: <N> reports from <M> source(s)"
   ```

   `git mv` already staged the renames; `git add` picks up the new report files
   and the footer edits. One commit covers the whole run.

5. **Push** the branch:

   ```bash
   git push -u origin file/from-bug-reports-<YYYY-MM-DD>
   ```

6. **Open the PR** with `gh pr create`. Title:
   `bugs-to-reports: <N> reports from <M> source(s)`. Body includes the
   rendered report sections inline (so reviewers can read without fetching) AND
   the list of renamed sources (so the reviewer sees the full scope of the
   change). Closing line: "Work each report with `/fix-bug`."

Print the closing report:

```
Wrote <N> report(s):
  - docs/bugs/_reports/<dated-slug-1>/report.md  (id <id-1>)
  - docs/bugs/_reports/<dated-slug-2>/report.md  (id <id-2>)

Renamed <M> source(s) → bug-reports.processed.md:
  - docs/specs/_improvements/<slug-1>/bug-reports.processed.md
  - …

Branch: file/from-bug-reports-<YYYY-MM-DD>
PR:     <URL from gh pr create>

Queue these reports with:  /fix-bug
```

End the turn.

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36>
schema_version: 1
source: bugs-to-reports
source_refs:
  - <retro_path>#<anchor>
  - …
title: <one-line title>
date: <YYYY-MM-DD>
severity: low | medium | high | critical
status: reported
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
`triage-retros`, `report-bug`, and `intake-spec` use). `source_refs` is
**always a YAML list**, with one entry per source-retro pointer so a reviewer
can trace evidence. The `severity` field is **required** — a closed enum
(`low | medium | high | critical`) read verbatim from the "Severity" column of
the `bug-reports.md` source table and mirrored in the body `## Severity &
impact` section. Both must agree per the queue contract.

### Body

Same structure as the fill-in stub at
[`docs/bugs/_templates/bug-report.md`](../../../docs/bugs/_templates/bug-report.md).
Always emit every required H2 verbatim and in order. No H2 may be left empty —
use a placeholder line if the item's available data doesn't populate the field.
The body **MUST NOT** repeat metadata already in the frontmatter (no second
`id:` line, no separate `Severity:` heading duplicating the frontmatter
`severity`).

### Folder

The report lives at `docs/bugs/_reports/<dated-slug>/report.md`, where
`<dated-slug>` is `<YYYY-MM-DD>-<id>-<slug>`.

`<slug>` is derived from `title` via the normative kebab-slug algorithm at
[`docs/specs/_proposed/README.md` § Kebab-slug
derivation](../../../docs/specs/_proposed/README.md). Do NOT invent a different
algorithm.

## Scope

What this skill does NOT do:

- Does NOT run `/fix-bug` or implement any product change. After the PR lands,
  the operator runs `/fix-bug` to work each report.
- Does NOT write a per-run audit folder or envelope JSON. The git diff on the
  branch / in the PR is the audit.
- Does NOT modify the `docs/bugs/_reports/` queue contract. Contract changes
  are a separate PR.
- Does NOT edit pipeline skills, source code, or product docs (other than the
  bug-reports-source rename).
- Does NOT cluster or filter items — items emitted by `triage-retros` are
  already-triaged defects. The 1:1 item→report mapping is deliberate; only
  `drop <id>` removes an item.

## Rules

- **Defaults beat questions.** Parse items and draft reports in one shot using
  the gathered data and project context. Don't ask the operator anything before
  step 4.
- **No cluster/filter pass.** Bug items are pre-triaged by `triage-retros`;
  re-clustering them would re-introduce judgement the gather step already made.
  Use `drop <id>` at the confirmation prompt to remove an item the operator
  wants to skip.
- The renderer always emits every required H2 verbatim so a consumer can strip
  the frontmatter and pass the body directly to `/fix-bug`.
