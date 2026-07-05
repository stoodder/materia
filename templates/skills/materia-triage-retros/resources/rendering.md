# Rendering the four run artifacts

Read this at **synthesis time** (and again during fold-feedback rounds). It
covers what the `_templates/` stubs can't express: field semantics, ordering,
conditional-emit rules, and the fold-feedback edit rules.

**Shape truth lives in the stubs** at `docs/specs/_improvements/_templates/`
(`pipeline-improvements.md`, `product-suggestions.md`, `bug-reports.md`,
`pipeline-health.md`) — reproduce their section order and field labels
character-for-character. The `## Actions` / frontmatter / traceback contract
is specified in `resources/actions-contract.md`; this file re-states none of
it.

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
  "findings": [
    {
      "id": "F1",
      "title": "<short title>",
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "pattern": "<one-paragraph summary of the cluster>",
      "supporting": [{ "retro_path": "...", "anchor": "Entry 1 — intake", "quote": "<verbatim>" }],
      "skills_touched": ["intake-spec"],
      "action_ids": ["A1"]
    }
  ],
  "actions": [
    {
      "id": "A1",
      "title": "<skill>: <what changes>",
      "skill": "intake-spec",
      "files": [".claude/skills/materia-intake-spec/SKILL.md"],
      "dimension": ["resumability/robustness"],
      "change_summary": "<one sentence>",
      "anchor_hint": "<validated verbatim string from the target file, or null>",
      "motivating_findings": ["F1"],
      "protected_contract": false,
      "protected_contract_justification": null
    }
  ],
  "out_of_scope": [{ "finding_id": "F3", "rationale": "<one line>" }],
  "protected_contract_flagged_actions": [], // ids of actions with protected_contract=true
  "suggestions": [
    {
      "id": "S1",
      "title": "<short title>",
      "kind": "feature" | "fix" | "tech-debt" | "other", // "bug" is a dead value — defects route to bugs[]
      "description": "<one paragraph>",
      "supporting": [{ "retro_path": "...", "anchor": "...", "quote": "..." }]
    }
  ],
  "bugs": [
    {
      "id": "B1",
      "title": "<short title>",
      "severity": "low" | "medium" | "high" | "critical", // required; infer best-effort
      "description": "<one paragraph — the defect and its impact>",
      "supporting": [{ "retro_path": "...", "anchor": "...", "quote": "..." }],
      "report_file": null // always null — bugs-to-reports mints the id + filename downstream
    }
  ],
  "summary_paragraph": "<one paragraph in the orchestrator's voice — seeds plan summary AND PR body>"
}
```

`suggestions[]` is the improvement bucket (never participates in any action —
a pure hand-off to `materia-suggestions-to-specs`); `bugs[]` is the defect bucket
(gathered into `bug-reports.md` for `materia-bugs-to-reports` to file). A
`suggestions[*].kind: "bug"` is a classification error — move the item to
`bugs[]`.

## Common rules

- **Title case** — strip the leading `<yyyy-mm-dd-hhmmss>-<rand>-` prefix
  from `slug`, split the remainder on `-`, and title-case it joined with
  spaces (`2026-06-21-134501-9c2a3-weekly-roundup` → `Weekly Roundup`).
- **Traceback format** — per `actions-contract.md` § Findings traceback
  format, identical across all artifacts.
- **Formatting** — before staging any commit that touches generated
  artifacts, run the repo formatter (MATERIA.md § Gate, lint row) scoped to **only the files the
  run actually wrote** (never `--write .`). This is load-bearing: hand-written
  markdown trips the CI `prettier --check` gate.

## `pipeline-improvements.md` — always emitted

Nine sections in the stub's order: frontmatter · H1
(`# <Title> — improvement plan`) · summary blockquote (the
`summary_paragraph`, `> `-prefixed) · `## Retros consumed` table (one row per
retro, `Run kind` = `spec`/`bug` from the identity tuple, `Parse status` =
`ok` or `degraded — <first parse_note>`) · `## Findings` (one H3 per finding,
`### F<n> — <title>  ·  <priority>`, in `findings[]` order) · `## Actions`
(per `actions-contract.md`, in `actions[]` order) · `## Out-of-scope /
deferred` (one bullet per entry: `**<finding_id> — <title>** — <rationale>`) ·
`## Protected-contract flags` (`_None this run._` or one block per flagged
action) · `## PR description seed` (fenced `markdown` block: a
Changes → findings table, consumed-retro list as `retro.processed.md` paths, a
link to the plan, a "Bugs gathered" section when `bugs.length > 0` with a
pointer to run `/materia-bugs-to-reports`, and the `<filled by PR open>` placeholder).

Frontmatter counts (`findings_total`, `findings_actionable`,
`protected_contract_flagged`, `bugs_filed`) must match the body — re-derive
them after every fold-feedback edit.

## `product-suggestions.md` — emitted iff `suggestions.length > 0`

Five sections per the stub: frontmatter (`source_plan` points at the sibling
plan; `suggestion_count` matches the body) · H1
(`# <Title> — product suggestions`) · intro paragraph (with a relative link
back to `./pipeline-improvements.md`) · one H2 per suggestion
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
  `"<actionable> pipeline findings + <product_count> product suggestions + <bug_count> bugs from <total_entries> entries"`.
- **Summary paragraph** — the synthesizer's voice: what the batch's health
  signals, which stage dominates, whether the signal is clean or noisy.
- **`## Outcome counts by stage`** — one row per distinct stage across all
  envelopes, **sorted by descending `blocked + failed`**, with a bold
  `**Total**` row. The `subagent_return issues` column counts non-`ok`
  returns per stage (e.g. `1 crashed`), `0` when clean.
- **`## Triage conversion`** — all six bullets, per the stub.
- **`## What's working`** — 2–4 bullets of positives appearing across ≥2
  retros or worth preserving; **omit the section entirely** when none
  surface.
- **`## Degraded retros`** — one bullet per degraded envelope
  (`` `<retro_path>` — <first parse_note> ``); **omit when all clean**.
- **Footer** — per the stub (names the run, notes it is not consumed).

## Fold-feedback edit rules (checkpoint rounds)

Operator nudges are applied **directly to the markdown files** — drop or add
findings/actions, change priorities, edit change summaries or anchors, move a
finding to out-of-scope, adjust a protected flag — keeping section order and
field labels intact (the executor parses them) and re-deriving the
frontmatter counts. Conditional-emit invariants are maintained on every
round:

- All suggestions moved out → **delete `product-suggestions.md`**; a first
  suggestion added → create it per this file.
- An item re-bucketed to bugs → add its row to `bug-reports.md` (creating the
  file if needed) and remove it from where it came; update both frontmatters.
- Last bug removed → **delete `bug-reports.md`**.
