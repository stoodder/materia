---
name: materia-suggestions-to-specs
description: Drafts proposed-spec file(s) in docs/specs/_proposed/ from unprocessed `product-suggestions.md` files emitted by `materia-triage-retros`. Single-shot: cluster + filter the suggestions in-memory, present candidates for approval, then write proposals and rename consumed sources on approve. As soon as discovery finds work the skill syncs latest main and branches; on approve it commits the proposals + renames and opens a single PR covering both.
---

# materia-suggestions-to-specs — proposals from captured suggestions

A simple, single-shot skill that turns the unprocessed `product-suggestions.md` files
under `docs/specs/_improvements/**/` into proposed-spec files in the shared
queue at [`docs/specs/_proposed/`](../../../docs/specs/_proposed/README.md).
Conforms to the queue's shared contract (frontmatter shape, filename pattern,
body shape).

**Lifecycle:** interactive checkpoint · branch-at-discovery — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, zero-work exit, id minting, consume-by-rename, link
integrity, one PR + tooling). The skill clusters and filters in-memory,
presents candidates for approval, then writes proposals and renames the
consumed sources; the git diff is the audit — no per-run audit folder, no
envelope JSON.

Read
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
(the shared contract), `.claude/skills/materia-triage-retros/resources/rendering.md` §
`product-suggestions.md` (the input shape; shape truth in
`docs/specs/_improvements/_templates/product-suggestions.md`), and
`.claude/skills/materia-intake-spec/SKILL.md` (the spec body format proposals must
conform to) before changing this skill.

## Procedure

### 1. Discover and branch

Glob unprocessed sources from the repo root:

```bash
git ls-files 'docs/specs/_improvements/**/product-suggestions.md'
```

The glob pattern matches `product-suggestions.md` exactly, so
`product-suggestions.processed.md` is excluded by the pattern. Belt-and-braces:
reject any path whose basename matches
`^product-suggestions\.processed(\..+)?\.md$`.

**Also reject any path containing a `/_templates/` segment.** The recursive `**`
glob matches the canonical fill-in stub at
`docs/specs/_improvements/_templates/product-suggestions.md`, which is a
template full of `<placeholder>` tokens, not a real hand-off — never consume it.

**Zero matches:** print "No unprocessed `product-suggestions.md` found. Nothing to
do." and end the turn. No prompt, no further action, **no branch
created** — the zero-match path is a clean no-op.

If at least one source survives, sync `main` and check out a new branch
**before** any further work (no writes have happened yet; the branch
exists so the rest of the run's incremental edits land somewhere clean):

```bash
git checkout main && git pull
git checkout -b propose/from-suggestions-<YYYY-MM-DD>
```

`<YYYY-MM-DD>` is today's date (branch names stay date-only; same-day collision + dirty-pull handling
per the lifecycle).

For each surviving path, derive `{ path, slug }` where `slug` is the
parent folder name.

### 2. Parse each source

Parse each `product-suggestions.md` with a section regex over the raw markdown —
no AST walker. The shape is fixed by `materia-triage-retros`: YAML frontmatter,
a fixed intro paragraph, one `## S<n> — <title>` heading per suggestion
with fixed-name bullets underneath (`**Kind:**`, `**Description:**`,
`**Source:**`), and a trailing footer.

Per-suggestion fields:

- `n`, `title` (verbatim H2 text), `kind`
- `description` (verbatim paragraph)
- `supporting[]` — list of `{ retro_path, anchor, quote }` pairs

Degradation is tolerable: missing fields → record a one-line note in the
loading stream, keep the suggestion in the set. Don't halt on tolerable
weirdness; only the cluster pass can hard-halt.

### 3. Cluster + filter + draft (in-memory)

In this skill's context, with the parsed suggestions + the current
`_proposed/` contents + the recent merge log all loaded, decide which
suggestions become proposals.

**Inputs in context:**

1. The full set of parsed suggestions across all sources.
2. The current contents of `docs/specs/_proposed/` —
   `git ls-files 'docs/specs/_proposed/*.md'` minus `README.md`.
   Top-level files only. Bodies read for content-level dedupe.
3. The recent merge log:
   `git log --grep='suggestions-to-specs\|_proposed' main --since='3 months ago' --pretty=oneline`
   — so the cluster pass can drop proposals duplicating recently shipped
   work.

**Cluster.** Group suggestions across files by recurring theme. Same need
across two retros is one proposal, not two. **Cap each proposal at a
single coherent, shippable unit of work — roughly one reasonable PR's
worth.** A cluster that bundles loosely-related concerns is split into
separate proposals. A cluster that fills a whole feature area is split
into separate proposals, one per coherent slice.

**Filter.** Promote only the concrete and worthwhile:

- **Concrete** — a testable acceptance criterion is writable.
- **Worthwhile** — a clear user/maintainer benefit exists.
- **Not already proposed** — no overlap with pending files in
  `_proposed/` (by title or body content).
- **Not recently shipped** — no overlap with the recent merge log.

Items that fail any check go to a **dropped** list with a one-line
rationale; nothing is silently discarded.

**Draft.** For each promoted cluster, draft the complete proposal now —
frontmatter + full spec body — don't ask the operator yet. The body
follows the format `materia-intake-spec` produces: H1 + tagline blockquote +
`## Problem`, `## Goals`, `## Non-goals`, `## Users & context`,
`## User stories & acceptance criteria`, `## Constraints`,
`## Open questions`. Every required H2 must be present, even when a
section is thin — `materia-intake-spec`'s detector matches on headings.

Use the project's vocabulary from `docs/glossary.md` and ground
acceptance criteria in the relevant standards (e.g. `api-layer.md`,
`ui-components.md`) so they're **literally testable** — "the feeling
dropdown is absent from every set card", not "feelings feel cleaner".

Mint a fresh `id` per proposal with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`.
Never reuse an `id` already on disk in `_proposed/` or visible in the
recent merge log.

### 4. Present for confirmation

Show the operator everything in one turn:

```
─────────────────────────────────────────────────────────────────────
Drafted <P> proposal(s) from <N> source file(s).

  1. <id-1> — <title-1>
     Will be written to: docs/specs/_proposed/<filename-1>

     <full inline body block — frontmatter + spec sections>

  2. <id-2> — <title-2>
     Will be written to: docs/specs/_proposed/<filename-2>

     <full inline body block>

  …

Dropped or parked (<D>):
  - <kind>: <one-line rationale> (from <source-anchor>)
  - …

Sources to mark processed (renamed to product-suggestions.processed.md on approve):
  - docs/specs/_improvements/<slug-1>/product-suggestions.md
  - …

Reply:
  - `approve` — write the proposal file(s) and rename the source(s).
  - `edit: <feedback>` — adjust the draft(s) and re-present.
  - `edit <id>: <feedback>` — edit just one proposal in the batch.
  - `drop <id>` — remove a proposal from the batch.
  - `cancel` — exit cleanly; nothing written, nothing renamed.
─────────────────────────────────────────────────────────────────────
```

End the turn.

### 5. Fold edits, re-render, re-confirm

When the operator replies with `edit: …` or `edit <id>: …` or
`drop <id>`, apply the change in-memory and re-emit the confirmation
prompt from step 4. No commits land yet — the branch exists from
step 1 but holds zero diffs until step 6.

`cancel` and the fold-loop cadence follow the lifecycle (delete the empty
branch; print "Cancelled. No proposals written; branch removed.").

### 6. Write, rename, commit, push, open PR

On `approve`, run the write + rename steps first, then the git
workflow.

1. **Write each proposal file** with the `Write` tool to
   `docs/specs/_proposed/<filename>`. Frontmatter + body per § File
   format (id-collision handling per the lifecycle).

2. **Rename each consumed source** with `git mv` (preserves history):

   ```bash
   git mv docs/specs/_improvements/<slug>/product-suggestions.md \
          docs/specs/_improvements/<slug>/product-suggestions.processed.md
   ```

3. **Append a one-line footer** to the bottom of each
   `product-suggestions.processed.md`:

   ```
   processed_on: <YYYY-MM-DD>
   ```

4. **Verify link integrity, then stage + commit** the proposals, the
   renames, and the footer edits together:

   Verify link integrity per the lifecycle invariant (`node scripts/check-docs.mjs`;
   fix any links the new files introduce), then commit:

   ```bash
   git add docs/specs/_proposed/ docs/specs/_improvements/
   git commit -m "suggestions-to-specs: <P> proposals from <N> source(s)"
   ```

   `git mv` already staged the renames; `git add` picks up the new
   proposal files and the footer edits. One commit covers the whole
   run.

5. **Push** the branch:

   ```bash
   git push -u origin propose/from-suggestions-<YYYY-MM-DD>
   ```

6. **Open the PR** with `gh pr create`. Title:
   `suggestions-to-specs: <P> proposals from <N> source(s)`. Body
   includes the rendered proposal sections inline (so reviewers can
   read without fetching) AND the dropped/parked list with rationales
   (so the reviewer sees what wasn't promoted and why). Closing line:
   "Build any proposal with `/materia-ship-spec <id>`."

Print the closing report:

```
Wrote <P> proposal(s):
  - docs/specs/_proposed/<filename-1>  (id <id-1>)
  - docs/specs/_proposed/<filename-2>  (id <id-2>)

Renamed <N> source(s) → product-suggestions.processed.md:
  - docs/specs/_improvements/<slug-1>/product-suggestions.processed.md
  - …

Branch: propose/from-suggestions-<YYYY-MM-DD>
PR:     <URL from gh pr create>

Build any proposal with:  /materia-ship-spec <id>
```

End the turn.

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36>
schema_version: 1
source: retro-suggestions
source_refs:
  - docs/specs/_improvements/<slug>/product-suggestions.md#S<n>
  - …
title: <one-line title>
date: <YYYY-MM-DD>
status: proposed
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
`materia-intake-spec`, `materia-triage-retros`, and `materia-propose-spec` use).
`source_refs` is **always a YAML list**, with one entry per clustered
suggestion anchor so a reviewer can trace evidence back to the originating
`product-suggestions.md` source.

### Body

Same structure as `materia-propose-spec` and `materia-intake-spec` — see
`.claude/skills/materia-propose-spec/SKILL.md` § Body for the template. Always
emit every required H2 verbatim and in order, even when a section is
thin. `materia-intake-spec`'s detector matches on the H1 plus `## Problem`,
`## Goals`, `## User stories & acceptance criteria`, and
`## Open questions`.

**Link paths follow the same absolute-from-repo-root convention** as
`materia-propose-spec` — see `.claude/skills/materia-propose-spec/SKILL.md` § File
format → Link paths. The reason is identical: `materia-intake-spec` adopts the
body verbatim into `docs/specs/<dated-slug>/spec.md` at a different
folder depth, so relative paths that resolve from `_proposed/` will
silently break in `<dated-slug>/spec.md` and trip `node scripts/check-docs.mjs`
downstream.

### Filename

```
<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md
```

`<slug>` is derived from `title` via the normative kebab-slug algorithm
in
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
§ Kebab-slug derivation. Do NOT invent a different algorithm.

## Scope (what this skill does NOT do)

- Does NOT run `materia-ship-spec` or implement any product change. After the
  PR lands, the operator runs `/materia-ship-spec <id>`.
- Does NOT write a per-run audit folder or envelope JSON. The git diff
  on the branch / in the PR is the audit.
- Does NOT modify the shared `_proposed/` contract README. Contract
  changes are a separate PR.
- Does NOT edit pipeline skills, source code, or product docs (other
  than the suggestions-source rename).

## Rules

- **Defaults beat questions.** Cluster + filter + draft in one shot
  using the parsed suggestions and project context. Don't ask the
  operator anything before step 4.
- **Concrete and worthwhile beats more.** Promote only proposals with
  testable AC and clear user/maintainer benefit; everything else goes
  to dropped.
- **One coherent unit per proposal.** Sprawling proposals are the
  failure mode this skill exists to prevent — split them.
- The renderer always emits every required H2 verbatim so `materia-intake-spec`
  adopts the body unchanged.
