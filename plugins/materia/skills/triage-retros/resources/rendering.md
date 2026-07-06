# Rendering the run artifacts

Read this at **synthesis time** (and again during fold-feedback rounds). It
covers what the `_templates/` stubs can't express: field semantics, ordering,
conditional-emit rules, the fold-feedback edit rules, and the shared
traceback + placeholder conventions the downstream consumers rely on.

**Shape truth lives in the stubs** at `docs/specs/_improvements/_templates/`
(`product-suggestions.md`, `bug-reports.md`, `pipeline-health.md`) —
reproduce their section order and field labels character-for-character. The
traceback and placeholder conventions those artifacts use are defined in
§ Findings traceback format and § Placeholder convention below (relocated here
so they survive independent of any one artifact).

## The in-memory working shape

The cluster pass reasons in this structured shape, then writes it straight
into the markdown artifacts. The shape itself is **never persisted as JSON** —
no `synthesis.json`, no intermediate file; every field lands in the markdown,
which is the only durable output. In particular `summary_paragraph` is written
into `pipeline-health.md` (below), so it survives the checkpoint turn-break —
the PR-open step re-derives the PR title/body from it **on disk**, never from
the in-memory shape. The shape exists so the artifacts render consistently
every run:

```jsonc
{
  "schema_version": 1,
  "slug": "<dated-slug minted at branch bootstrap>",
  "generated_at": "<ISO timestamp>",
  "retros_consumed": [
    { "path": "...", "slug": "...", "run_kind": "spec run", "entry_count": 6, "parse_status": "ok" }
  ],
  "suggestions": [
    {
      "id": "S1",
      "title": "<short title>",
      "kind": "feature" | "fix" | "tech-debt" | "other", // "bug" is a dead value — defects route to bugs[]
      "description": "<one paragraph>",
      "supporting": [{ "retro_path": "...", "anchor": "Entry 3 — implement-task", "quote": "<verbatim>" }]
    }
  ],
  "bugs": [
    {
      "id": "B1",
      "title": "<short title>",
      "severity": "low" | "medium" | "high" | "critical", // required; infer best-effort
      "description": "<one paragraph — the defect and its impact>",
      "supporting": [{ "retro_path": "...", "anchor": "Entry 2 — implement-task", "quote": "<verbatim>" }],
      "report_file": null // always null — bugs-to-reports mints the id + filename downstream
    }
  ],
  "health": {
    // aggregated per-retro `health` tallies (outcome/subagent-return counts,
    // by-stage rows) → pipeline-health.md; see § pipeline-health.md below
  },
  "summary_paragraph": "<one paragraph in the orchestrator's voice — written into pipeline-health.md; the PR title/body are re-derived from it on disk at PR-open>"
}
```

`suggestions[]` is the improvement bucket (a pure hand-off to
`suggestions-to-specs`); `bugs[]` is the defect bucket (gathered into
`bug-reports.md` for `bugs-to-reports` to file). A
`suggestions[*].kind: "bug"` is a classification error — move the item to
`bugs[]`. There is **no** findings / actions / pipeline-plan bucket — retros
feed the project's backlog, not the pipeline skills.

## Common rules

- **Title case** — strip the leading `<yyyy-mm-dd-hhmmss>-<rand>-` prefix
  from `slug`, split the remainder on `-`, and title-case it joined with
  spaces (`2026-06-21-134501-9c2a3-weekly-roundup` → `Weekly Roundup`).
- **Traceback format** — per § Findings traceback format below. Note the
  **per-artifact variance**: `product-suggestions.md` carries the verbatim
  quote; `bug-reports.md` is **quote-less** (`` `<retro_path>` § `<anchor>` ``).
- **Formatting** — before staging any commit that touches generated
  artifacts, run the repo formatter (MATERIA.md § Gate, lint row) scoped to **only the files the
  run actually wrote** (never `--write .`). This is load-bearing: hand-written
  markdown trips the CI format gate (MATERIA.md § Gate, lint row).

## `product-suggestions.md` — emitted iff `suggestions.length > 0`

Five sections per the stub: frontmatter (`source_rollup` points at the sibling
`pipeline-health.md`; `suggestion_count` matches the body) · H1
(`# <Title> — product suggestions`) · intro paragraph (per the stub) · one H2 per suggestion
(`## S<n> — <title>` with `**Kind:**`, `**Description:**`, `**Source:**`
bullets — every `supporting[]` entry as its own source bullet, **with** the
verbatim quote) · footer
(`_Captured by \`triage-retros\` run \`<slug>\` on \`<generated_at>\`._`).

Never emit an empty file — the file's presence is the downstream "anything to
do?" signal. Downstream, `suggestions-to-specs` renames it
`product-suggestions.processed.md` on consumption; this skill never renames it.

## `bug-reports.md` — emitted iff `bugs.length > 0`

Per the stub: frontmatter (`source_rollup` → the sibling `pipeline-health.md`;
`bug_count`) · H1 (`# <Title> — bug reports`) · intro paragraph (gathered, not
yet filed — run `/materia:bugs-to-reports`) · `## Filed reports` table, one row
per bug in `bugs[]` order. The "Report file" cell is **always `—`** — this
skill mints no ids and writes no report files; `bugs-to-reports` mints
both. The "Source retro" cell uses the **quote-less** variant
(`` `<retro_path>` § `<anchor>` `` — no quote; see § Findings traceback
format). Footer as above (`_Captured by \`triage-retros\` …_`).
Downstream rename: `bug-reports.processed.md` by `bugs-to-reports`.

## `pipeline-health.md` — always emitted, **never renamed**

No consumer dequeues it — it accumulates as a historical corpus (a
`pipeline-health.processed.md` is a scope-guard violation). Per the stub:

- **Frontmatter** — all nine fields required. `retros_consumed` carries the
  run-kind split — `"<n> (<S> spec, <B> bug)"` — so a 2c checkpoint resume can
  reprint the true spec/bug breakdown from disk. `blocker_rate` is
  `"<pct>% (<blocked+failed> of <total_entries> entries)"`;
  `triage_conversion` is
  `"<product_count> product suggestions + <bug_count> bugs from <total_entries> entries"`.
- **Summary paragraph** — the synthesizer's voice (`summary_paragraph` from
  the working shape): what the batch signals — its health (which stage
  dominates, whether the signal is clean or noisy) and what was captured
  (suggestion/bug counts). This paragraph is the **on-disk seed** the PR-open
  step re-derives the PR title/body from, so lead with the batch headline.
- **`## Outcome counts by stage`** — one row per distinct stage across all
  envelopes, **sorted by descending `blocked + failed`**, with a bold
  `**Total**` row. The `subagent_return issues` column counts non-`ok`
  returns per stage (e.g. `1 crashed`), `0` when clean.
- **`## Triage conversion`** — all five bullets, per the stub.
- **`## What's working`** — 2–4 bullets of positives appearing across ≥2
  retros or worth preserving; **omit the section entirely** when none
  surface.
- **`## Degraded retros`** — one bullet per degraded envelope
  (`` `<retro_path>` — <first parse_note> ``); **omit when all clean**.
- **Footer** — per the stub (names the run, notes it is not consumed).

## Findings traceback format

Every supporting reference uses a backticked path, ` § `, and a backticked
verbatim `Entry N — <stage>` anchor. There are **two variants — per artifact,
not identical**:

- **`product-suggestions.md`** (`**Source:**` bullets) carries the verbatim
  quote:

  ```markdown
  `<retro_path>` § `<anchor>` — "<quote>"
  ```

  `suggestions-to-specs` parses each entry back into
  `{ retro_path, anchor, quote }`.

- **`bug-reports.md`** (the "Source retro" table cell) is **quote-less** —
  path + anchor only:

  ```markdown
  `<retro_path>` § `<anchor>`
  ```

  `bugs-to-reports` parses `{ retro_path, anchor }` (no quote — see its
  SKILL.md § Parse each source).

Grep'ing the anchor (and, for suggestions, the quoted phrase) in the linked
file must find the source. Both shapes are contracts — reproduce them
character-for-character, and **do not add a quote to the bug-reports cell** (it
breaks the quote-less parser).

## Placeholder convention

Two run-scoped artifacts carry a literal placeholder that the **PR-URL
backfill** step rewrites once the real PR URL exists:

- `<filled by finalize>` — in each `retro.processed.md` footer (both
  `docs/specs/**` and `docs/bugs/**`).
- `<filled by PR open>` — in the run's row in
  `docs/specs/_improvements/README.md`.

The resumability gate (SKILL § Resumability gate, 2e) treats either literal
surviving anywhere on the branch as "PR-URL backfill still pending".

## Fold-feedback edit rules (checkpoint rounds)

Operator nudges are applied **directly to the markdown files** — drop or add
suggestions/bugs, edit a description, adjust a bug's severity, re-bucket an
item between suggestions and bugs — keeping section order and field labels
intact (the downstream consumers parse them) and re-deriving the frontmatter
counts. Conditional-emit invariants are maintained on every round:

- All suggestions moved out → **delete `product-suggestions.md`**; a first
  suggestion added → create it per this file.
- An item re-bucketed to bugs → add its row to `bug-reports.md` (creating the
  file if needed) and remove it from where it came; update both frontmatters.
- Last bug removed → **delete `bug-reports.md`**.
- A round that **flips the run between health-only and captured** (first
  suggestion/bug added, or last one removed) → update the run's outcome cell in
  `docs/specs/_improvements/README.md` (`health-only` ↔ `captured`) in the same
  fold commit.
- `pipeline-health.md` is **never created or deleted** by fold-feedback (it is
  always present), but its **bucket-derived parts must be re-derived and
  re-committed in the same fold commit** on any round that changes the
  suggestion/bug counts or flips the run between health-only and captured —
  otherwise PR-open (which re-reads it) ships a stale title/body (e.g. still
  "health-only" after a suggestion is added). Precisely:
  - **Re-derive** (they mirror the buckets): the `triage_conversion`
    frontmatter field, the `## Triage conversion` **Product suggestions** and
    **Bugs gathered** count bullets, and the `summary_paragraph`'s
    captured-counts clause.
  - **Leave fixed** (they derive purely from the retros, not the buckets):
    `retros_consumed`, `total_entries`, `blocker_rate`, `ok_rate`,
    `most_failing_stage`, `## Outcome counts by stage`, `## What's working`,
    `## Degraded retros`.
