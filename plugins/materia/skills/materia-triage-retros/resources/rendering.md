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
into the markdown artifacts. It is **never persisted** — no `synthesis.json`,
no intermediate file; the markdown is the only durable output. The shape
exists so the artifacts render consistently every run:

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
  "summary_paragraph": "<one paragraph in the orchestrator's voice — seeds the PR body>"
}
```

`suggestions[]` is the improvement bucket (a pure hand-off to
`materia-suggestions-to-specs`); `bugs[]` is the defect bucket (gathered into
`bug-reports.md` for `materia-bugs-to-reports` to file). A
`suggestions[*].kind: "bug"` is a classification error — move the item to
`bugs[]`. There is **no** findings / actions / pipeline-plan bucket — retros
feed the project's backlog, not the pipeline skills.

## Common rules

- **Title case** — strip the leading `<yyyy-mm-dd-hhmmss>-<rand>-` prefix
  from `slug`, split the remainder on `-`, and title-case it joined with
  spaces (`2026-06-21-134501-9c2a3-weekly-roundup` → `Weekly Roundup`).
- **Traceback format** — per § Findings traceback format below, identical
  across all artifacts.
- **Formatting** — before staging any commit that touches generated
  artifacts, run the repo formatter (MATERIA.md § Gate, lint row) scoped to **only the files the
  run actually wrote** (never `--write .`). This is load-bearing: hand-written
  markdown trips the the CI format gate (MATERIA.md § Gate, lint row).

## `product-suggestions.md` — emitted iff `suggestions.length > 0`

Five sections per the stub: frontmatter (`source_plan` points at the sibling
`pipeline-health.md`; `suggestion_count` matches the body) · H1
(`# <Title> — product suggestions`) · intro paragraph (per the stub) · one H2 per suggestion
(`## S<n> — <title>` with `**Kind:**`, `**Description:**`, `**Source:**`
bullets — every `supporting[]` entry as its own source bullet) · footer
(`_Captured by \`triage-retros\` run \`<slug>\` on \`<generated_at>\`._`).

Never emit an empty file — the file's presence is the downstream "anything to
do?" signal. Downstream, `materia-suggestions-to-specs` renames it
`product-suggestions.processed.md` on consumption; this skill never renames it.

## `bug-reports.md` — emitted iff `bugs.length > 0`

Per the stub: frontmatter (`bug_count`) · H1 (`# <Title> — bug reports`) ·
intro paragraph (gathered, not yet filed — run `/materia-bugs-to-reports`) ·
`## Filed reports` table, one row per bug in `bugs[]` order. The
"Report file" cell is **always `—`** — this skill mints no ids and writes no
report files; `materia-bugs-to-reports` mints both. Source-retro cell uses the
traceback shape (`` `<retro_path>` § `<anchor>` ``). Footer as above.
Downstream rename: `bug-reports.processed.md` by `materia-bugs-to-reports`.

## `pipeline-health.md` — always emitted, **never renamed**

No consumer dequeues it — it accumulates as a historical corpus (a
`pipeline-health.processed.md` is a scope-guard violation). Per the stub:

- **Frontmatter** — all nine fields required. `blocker_rate` is
  `"<pct>% (<blocked+failed> of <total_entries> entries)"`;
  `triage_conversion` is
  `"<product_count> product suggestions + <bug_count> bugs from <total_entries> entries"`.
- **Summary paragraph** — the synthesizer's voice: what the batch's health
  signals, which stage dominates, whether the signal is clean or noisy.
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

Every supporting reference in the hand-off artifacts uses **literally** this
shape (backticked path, ` § `, backticked verbatim `Entry N — <stage>`
anchor, em-dash, double-quoted verbatim quote):

```markdown
`<retro_path>` § `<anchor>` — "<quote>"
```

Grep'ing the quoted phrase in the linked file must find the source.
`materia-suggestions-to-specs` and `materia-bugs-to-reports` parse each
`supporting[]` entry back into `{ retro_path, anchor, quote }`, so the shape
is a contract — reproduce it character-for-character.

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
- `pipeline-health.md` is a fixed rollup — never created or deleted by
  fold-feedback; it is always present.
