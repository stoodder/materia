# Rendering the authored artifacts

Read this at **Synthesis** (and again during fold-feedback rounds). It carries
the semantics `SKILL.md § Synthesis` / `§ File format` defer here: the in-memory
working shape, how to render the authored **proposed-spec** and **bug-report**
bodies, the per-artifact consolidation rule, the producer de-dup / dropped-list
surfacing, the `source` / `source_refs` conventions, the retro-rename footer, and
the confirmation fold-edit rules.

**Shape truth for the bodies lives in the producer/intake contracts** — this
file never re-prints a whole template. Defer:

- **Spec body** → `plugins/materia/skills/propose-spec/SKILL.md` § Body and
  `plugins/materia/skills/intake-spec/SKILL.md` § Procedure (step "Detect the
  input shape") — the H1 + H2 set `intake-spec` matches to adopt a proposal body
  verbatim.
- **Bug-report body** → `plugins/materia/skills/report-bug/SKILL.md` § Body and
  `.materia/docs/bugs/_templates/bug-report.md` (the 13-section single-defect format).

Reproduce those section orders and field labels character-for-character; this
file covers only what is triage-specific (grounding the drafts in the retro
quotes and the project vocabulary).

## The in-memory working shape

The cluster pass reasons in this structured shape, then renders it straight into
the confirmation and — on `approve` — into the authored markdown files. The
shape is **never persisted as JSON** — no `synthesis.json`, no intermediate
file. Every field lands either in an authored `_proposed/` / `_reports/` file or
in the confirmation / PR text, which are the only durable outputs. An interrupt
before `approve` discards it entirely (see design-notes: no session survival).

```jsonc
{
  "retros_consumed": [
    // one per consumed retro; the "retros to mark processed" list + the PR's
    // "retros consumed" line derive from this. Degraded ones are flagged.
    { "path": ".materia/docs/specs/<slug>/retro.md", "slug": "<slug>", "run_kind": "spec run", "parse_status": "ok" }
  ],
  "drafted_specs": [
    {
      "id": "<fresh 6-char base36 token>",
      "title": "<one-line title; == the body H1>",
      "frontmatter": { /* source: retro-triage · source_refs[] · status: proposed · … per § File format */ },
      "body": "<full spec body — H1 + tagline + the seven required H2s, in order>",
      "supporting": [{ "retro_path": "...", "anchor": "Entry 3 — implement-task", "quote": "<verbatim>" }]
    }
  ],
  "drafted_reports": [
    {
      "id": "<fresh 6-char base36 token>",
      "title": "<one-line title; == the body H1>",
      "severity": "low" | "medium" | "high" | "critical", // mirrored in frontmatter + `## Severity & impact`
      "frontmatter": { /* source: retro-triage · severity · source_refs[] · status: reported · … */ },
      "body": "<full 13-section single-defect body>",
      "supporting": [{ "retro_path": "...", "anchor": "Entry 2 — reproduce-bug", "quote": "<verbatim>" }]
    }
  ],
  "dropped": [
    // every in-scope draft removed by the skeptic pass, the de-dup pass, or an
    // operator `drop` — nothing silently discarded. Surfaced at the confirmation
    // AND in the PR body. Pipeline/harness friction is NOT here (excluded by
    // design, not dropped — see § Producer de-dup below).
    { "kind": "spec" | "bug", "rationale": "<one line>", "anchor": "Entry N — <stage>", "retro_path": "..." }
  ]
}
```

`drafted_specs[]` and `drafted_reports[]` are the two authored queues; a defect
never sits in `drafted_specs[]` and a capability-gap never sits in
`drafted_reports[]` (classification is one-way — see `SKILL.md § Synthesis`).
Each `supporting[]` entry is one originating retro reference; it renders into the
draft's `source_refs` (see below) and grounds the draft's acceptance criteria /
reproduction steps.

## Authored proposed-spec body

Render the exact structure `propose-spec` § Body produces and `intake-spec`'s
detector matches — H1 + one-sentence tagline blockquote + `## Problem`,
`## Goals`, `## Non-goals`, `## Users & context`,
`## User stories & acceptance criteria` (each story a
`- [ ] **Story:** … / - **Accept:** <testable AC>` pair), `## Constraints`,
`## Open questions`. **Every required H2 must be present verbatim and in order,
even when thin** — `intake-spec` adopts the body only when it finds the H1 plus
`## Problem`, `## Goals`, `## User stories & acceptance criteria`, and
`## Open questions`; a missing or renamed heading breaks that verbatim adoption
and forces a re-draft at intake.

Triage-specific rendering:

- **Ground the acceptance criteria in the retro quotes.** The `supporting[]`
  quotes are the evidence the capability is wanted; write each AC so it is
  **literally testable** against the behaviour the quotes describe, not a vague
  aspiration. Use the project's vocabulary (`.materia/docs/glossary.md`) and the relevant
  standards.
- **Tagline** — one sentence derived from the clustered signal.
- **Link paths** follow `propose-spec` § Link paths: backtick/arrow prose
  (`visual-language → .materia/docs/standards/visual-language.md`) **only** — never a
  live markdown link, relative or absolute-from-repo-root; both break
  `check-docs.sh` when `intake-spec` adopts the body at a different folder
  depth.

## Authored bug-report body

Render the 13-section format `report-bug` § Body / `.materia/docs/bugs/_templates/bug-report.md`
define, every H2 verbatim and in order: `## Summary` · `## Environment` ·
`## Steps to reproduce` · `## Expected` · `## Actual` · `## Reproducibility` ·
`## Severity & impact` · `## Affected surface / route / module` ·
`## Preconditions / data setup` · `## Evidence` · `## Regression window` ·
`## Workaround` · `## Open questions`.

Triage-specific rendering:

- **Single-defect** — one `## Steps to reproduce`, one `## Expected` /
  `## Actual`, one `severity`. `fix-bug` consumes one report = one defect.
- **Mirror `severity`** in both the frontmatter `severity:` field and the
  `## Severity & impact` section — both must agree.
- Fill each section from the retro signal; where the source data doesn't
  populate a field, use a placeholder line (e.g. "Unknown — see source retro.").
- The body **MUST NOT** repeat frontmatter metadata (no second `id:`, no heading
  duplicating the frontmatter `severity`).
- **Link paths** are absolute-from-repo-root (`report-bug` § Link paths), so they
  survive `fix-bug` adopting the body into a `.materia/docs/bugs/<dated-slug>/` run
  folder.

## Per-artifact consolidation

Fold recurring signal so the batch produces **as few artifacts as each queue's
shape allows** — but "consolidate" means something different per artifact:

- **Proposed specs — bundle related stories, capped at the split line.** Bundle
  small *related* capabilities into **one** proposed spec as multiple user
  stories rather than fragmenting into many one-item specs. Still **split** when
  a cluster crosses `propose-spec`'s bright line — `>~5 user stories`,
  independent surfaces touched, or multiple unrelated outcomes — so each spec
  stays a single shippable unit `ship-spec` can build end-to-end. The same need
  reported across two retros is **one** spec, not two (with both retro anchors in
  `source_refs`).
- **Bug reports — fold same-defect signal only.** Because the body is
  single-defect, "consolidate" for bugs means **fold duplicate / related signal
  about the *same* defect into one report** (multiple `source_refs` / supporting
  anchors) — **never** merge unrelated defects into one report.

## Producer de-dup + the dropped/parked list

Every draft is filtered against the live queues + the recent merge log
(`SKILL.md § Producer de-duplication`). Any draft that overlaps a pending or
recently-shipped/fixed item is **dropped** — added to `dropped[]` with a one-line
rationale (e.g. `spec: duplicates pending proposal 9c4f1q`, `bug: fixed in the
merge log 2026-06-28`). The skeptic pass and operator `drop <id>` also feed
`dropped[]`.

**No in-scope (spec/bug) draft is silently discarded** — the dropped/parked list
is surfaced **both** at the confirmation prompt and in the PR body, one bullet
each: `<spec|bug>: <rationale> (from <retro-anchor>)`.

**Pipeline / harness friction is excluded by design, NOT itemized on this list.**
Signal about how the pipeline operates (a stage, skill, orchestration mechanic,
retro-capture, allowlist, or the pipeline docs) is not project backlog signal
under the project retarget — it produces no spec and no report, and it does **not**
appear in `dropped[]`. The "nothing silently discarded" invariant governs only
in-scope signal (there is no longer a pipeline-health corpus to absorb the
friction).

## `source` / `source_refs` conventions

- **`source: retro-triage`** on every authored spec and report (registered in
  both queues' producer tables; the queue contracts are source-agnostic — no enum
  edit).
- **`source_refs`** is **always a YAML list**, one entry per originating retro
  anchor, pointing at the retro's **post-run resting path**
  (`.materia/docs/.../retro.processed.md § Entry N — <stage>`). The retro is renamed in
  the **same commit** that writes the artifact, so the `.processed.md` path is the
  one that resolves — never the pre-rename `retro.md`.
- The **anchor** is the retro heading's stable prefix through its stage (the
  heading may carry a trailing timestamp; the anchor is the substring-resolvable
  prefix). Grep'ing the anchor as a substring in the linked `retro.processed.md`
  must find the source.

## Retro-rename footer

Each consumed retro is `git mv`'d to `retro.processed.md` and gets **one** footer
line appended in the same commit (` · `-separated, one line — **no** PR-URL
backfill):

```
processed_on: <YYYY-MM-DD>  ·  processed_by: /materia:triage-retros
```

## Fold-feedback edit rules (checkpoint rounds)

Operator nudges (`edit: …`, `edit <id>: …`, `drop <id>`) are applied **directly
to the in-memory drafts** — nothing is on disk yet. Keep the required section
order and field labels intact (so the bodies stay verbatim-adoptable by
`intake-spec` / `fix-bug`) and **re-derive the frontmatter** from the edited body
(counts, `severity`, `source_refs`). Maintain the invariants on every round:

- **Classification stays one-way** — a defect never becomes a spec, a spec never
  carries a bug. If feedback re-classifies an item, create the draft in the other
  queue and remove it from the one it came from.
- **Add / drop drafts as items move.** A first story for a new capability → a new
  `drafted_specs[]` draft (mint a fresh `id`). `drop <id>` → move that draft to
  `dropped[]` with rationale `operator drop`. Folding two drafts about the same
  need/defect → one draft with both retro anchors in `source_refs`.
- **Moving an item never resurrects an `_improvements` artifact** — there are no
  intermediate buckets; every edit lands in a `drafted_specs[]` / `drafted_reports[]`
  / `dropped[]` entry.
- On round 5+ prefer a fresh re-draft from the new direction over incremental
  edits.

## Common rules

- **Title case (slug → title)** — strip the leading `<yyyy-mm-dd-hhmmss>-<id>-`
  prefix from a filename slug, split the remainder on `-`, and title-case it
  joined with spaces (`2026-06-21-134501-9c2a3-weekly-roundup` → `Weekly
  Roundup`). The kebab-slug itself is derived from the title via the normative
  algorithm in `.materia/docs/specs/_proposed/README.md` § Kebab-slug derivation — do not
  invent a different one.
- **Scoped formatting** — before staging the commit, run the repo formatter
  (`MATERIA.md` § Gate, lint row) scoped to **only the files the run actually
  wrote** (the authored specs + reports + renamed retros) — **never** `--write .`.
  This is load-bearing: hand-authored markdown trips the CI format gate, and an
  unscoped format sweeps unrelated files into the diff (which the scope guard
  would then halt on).

## Fixture-verification rubric

`SKILL.md § Fixture verification` runs the classification rubric over
`${CLAUDE_PLUGIN_ROOT}/skills/triage-retros/resources/fixture-retro.md` — a
synthetic retro with **one unmistakable signal per outcome**. The expected
mapping (the rubric this file defines):

| Fixture signal | Kind | Expected outcome |
| --- | --- | --- |
| Entry 2 — the visual **streak counter** on the weekly summary page (a new product capability) | improvement | lands as **one drafted proposed spec** in `drafted_specs[]` |
| Entry 3 — **set-log undo discards the wrong row** in rapid succession (a regression in shipped behaviour) | defect | lands as **one drafted bug report** in `drafted_reports[]` |
| Entry 1 — the intake-spec **AskUserQuestion / deferred-tool fallback** friction (how the pipeline operates) | pipeline/harness friction | produces **no artifact** — excluded by design, not even on `dropped[]` |

A change is verified when the improvement item drafts a spec, the bug item drafts
a report, and the pipeline-friction entry yields nothing.
