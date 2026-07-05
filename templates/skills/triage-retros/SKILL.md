---
name: triage-retros
description: Run manually via `/triage-retros` after a stretch of `ship-spec` runs to harvest unprocessed retros (one sub-agent per retro at 3+, parsed inline by the parent at ≤2), aggregate the insight envelopes, and run a three-way triage into four artifacts under `docs/specs/_improvements/<dated-slug>/`: `pipeline-improvements.md` (always emitted, consumed by `apply-pipeline-improvements`), `product-suggestions.md` (when product feedback is present, consumed by `suggestions-to-specs`), `bug-reports.md` (when defects are gathered, consumed by `bugs-to-reports`), and `pipeline-health.md` (always-emitted batch rollup, not consumed — accumulates as corpus). Pauses for the operator to nudge the artifacts, renames each consumed retro to `retro.processed.md`, and opens exactly one PR against `main` — no auto-merge. Resumable across sessions. Single PR per run.
---

# triage-retros — scan retros and draft the improvement plan

The **scan-and-plan** half of the self-improvement loop opened by
`ship-spec`'s per-run `retro.md` capture. It globs unprocessed retros from
both `docs/specs/**` and `docs/bugs/**`, collects one insight envelope per
retro (via sub-agents at 3+ retros, inline at ≤2), then clusters and triages
the aggregated signal into four artifacts written **directly to disk** — no
intermediate JSON. After the plan commit it **pauses for operator review by
ending the turn**, folds any feedback directly into the markdown, renames
each consumed `retro.md` to `retro.processed.md`, and opens exactly one PR
against `main`. It **never applies** the planned skill edits — that is
`apply-pipeline-improvements`' job — so this skill, `suggestions-to-specs`,
and `bugs-to-reports` run independently off the artifacts it lands.

The stack is markdown + `git` + `gh`/GitHub-MCP + the skill harness. Manual
invocation only; single PR per run; no auto-merge. The retro template, the
retro-generation contract in `ship-spec/SKILL.md`, and the
`retro.md`/`retro.processed.md` naming are **protected contracts** — the
cluster pass flags any proposed action touching them so the plan, PR, and
executor surface the change loudly.

**Read before running the relevant phase** (progressive disclosure — don't
front-load):

- `resources/rendering.md` — the four artifact render specs; read at
  Synthesis and on every fold-feedback round.
- `resources/actions-contract.md` — the plan's parse contract (frontmatter,
  `## Actions` fields, dimension vocabulary, traceback format,
  protected-contract paths); read at Synthesis.
- `docs/specs/_improvements/_templates/*.md` — **shape truth** for all four
  artifacts (read-only stubs).
- `docs/specs/_templates/retro.md` — the schema the parser is built against
  (read-only).
- `resources/design-notes.md` — rationale for the design decisions below;
  read only when **changing** this skill.

## Section map

| Section | What it covers |
| --- | --- |
| `## Resumability gate` | Detect run/phase from disk, print recap, resume |
| `## Discovery` | Glob + filter unprocessed retros; identity tuple |
| `## Branch + folder bootstrap` | Branch, `<dated-slug>`, plan folder, README seed |
| `## Parser` | The `RetroParse` envelope + degradation rules |
| `## Envelope collection` | Sub-agent fan-out (3+) or inline parse (≤2) |
| `## Synthesis` | Cluster prompt, three-way triage, skeptic pass, anchor validation |
| `## Artifacts + plan commit` | What gets written and committed (see resources/rendering.md) |
| `## Checkpoint` | Pause-by-ending-turn, approve tokens, fold-feedback |
| `## Mark-processed` → `## PR-URL backfill` | Renames, scope guard, PR, backfill |

## Resumability gate

Run this **first on every invocation**. It is pure: inspect the branch, the
plan folder, and the commit graph; derive the first incomplete phase; print a
recap; hand off. There is no `RUN.md`/`STATUS.md` — state is file-derived
(see design-notes). The lifecycle is linear — **artifacts written → retros
renamed → PR opened → PR-URL backfilled** — and each phase is one atomic
commit, so the first incomplete phase is unambiguous.

### Step 1 — detect the run

If the current branch matches `chore/triage-retros-*`, extract the
`<dated-slug>` suffix and continue to Step 2. Otherwise this is a **fresh
invocation** — go directly to **Discovery**.

### Step 2 — detect the phase (first match wins)

- **2a.** `docs/specs/_improvements/<dated-slug>/` does not exist →
  **resume at Synthesis.**
- **2b.** Folder exists but `pipeline-improvements.md` is missing → **corrupt
  state** (the plan commit deliberately never lands an empty folder). Halt,
  naming the directory and expected file; the operator deletes the orphan and
  re-invokes, or hand-restores the plan. Note: `pipeline-improvements.md` is
  the sentinel — **not** `pipeline-health.md`; health-only is still corrupt.
- **2c.** Plan exists AND `git log --format=%s` has zero commits matching
  `^triage-retros\(retros\):` → **resume at Checkpoint.** The message that
  re-invoked the skill is the checkpoint reply — classify it per
  `## Checkpoint`.
- **2d.** A `^triage-retros\(retros\): mark` commit exists but no open PR for
  the branch (`gh pr list --head <branch> --json url --jq '.[].url'` empty —
  or, in the remote environment where there is no `gh` CLI, the GitHub MCP
  `list_pull_requests` filtered by this head branch) → **resume at PR open.**
- **2e.** PR exists but the literal placeholder `<filled by finalize>` (or
  `<filled by PR open>`) remains anywhere on the branch → **resume at PR-URL
  backfill.**
- **2f.** PR exists, no placeholders → the run is complete. Print the final
  Done block and exit cleanly.

### Step 3 — recap, then continue

Before the resumed phase, print a short recap naming the branch, the plan
path, retros pending rename, bug-reports presence, whether a PR is open, and
the phase being resumed. A Checkpoint resume (2c) re-emits the full
checkpoint prompt with the unchanged plan summary immediately after.

**Crash-mid-phase safety:** a phase that died before its commit left no
commit, so the next resume re-runs it from on-disk state. Re-entry is always
safe.

## Discovery

Entry point for every fresh invocation. Anchor every command at the repo root
(`git rev-parse --show-toplevel`).

**Glob** (results merged):

```bash
git ls-files 'docs/specs/**/retro.md'
git ls-files 'docs/bugs/**/retro.md'
```

**Filter:** the pattern already excludes `retro.processed.md`; additionally
reject any basename matching `^retro\.processed(\..+)?\.md$` (belt-and-braces
against variants), and reject any path containing a `/_templates/` segment —
the glob matches the canonical stub at `docs/specs/_templates/retro.md`, a
placeholder template, never a real retro (the same guard every producer
carries). Filtered-out files count as "ignored" in the output.

**Identity tuple** per surviving path: `{ path, slug, run_kind }` — `slug` is
the parent folder's dated slug; `run_kind` is `spec run` for `docs/specs/**`,
`bug run` for `docs/bugs/**`.

**Zero matches:** report both globs' match/ignored counts and exit cleanly —
**no branch, no folder, no commit, no PR.**

**≥1 match:** list each retro with its feature slug and run kind, note the
ignored count, and advance to **Branch + folder bootstrap**.

## Branch + folder bootstrap

Idempotent — on resume the gate skips it entirely.

**Branch:** `chore/triage-retros-<dated-slug>` off latest `main`:

```bash
git fetch origin main
git checkout -b chore/triage-retros-<dated-slug> origin/main
```

**Minting the `<dated-slug>`** — same `<yyyy-mm-dd>-<rand>-<slug>` convention
as `intake-spec`: today's ISO date; a fresh 6-char base36 token
(`LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`); a short kebab-case
batch slug by this heuristic (operator may rename folder + branch after the
checkpoint; the skill never auto-renames):

| Retro count | Default slug |
| --- | --- |
| 1 | `<feature-slug>-retro` |
| 2 clustering around one theme | `<theme>-roundup` (else fall through) |
| ≥3 (or 2 that don't cluster) | `weekly-roundup` |

**Plan folder:** create `docs/specs/_improvements/<dated-slug>/` but do
**not** commit it empty — the first content commit is the plan commit.

**README seed:** if `docs/specs/_improvements/README.md` is untracked, seed
the index in the plan commit; otherwise append this run's row (one row per
run: dated-slug · plan path · PR cell carrying `<filled by PR open>` until
backfill · outcome `planned | no-op | blocked`).

## Parser

The parser reads a `retro.md` and produces the structured envelope everything
downstream consumes. It is the **only code path that touches retro file
contents** — synthesis, rendering, mark-processed, and PR open all work off
`RetroParse[]`. Schema bumps adjust one place. Implementation is
section-regex over the raw markdown (see design-notes for why not an AST
walker).

### `RetroParse` envelope shape

```jsonc
{
  "path": "docs/specs/<dated-slug>/retro.md",
  "slug": "<dated-slug>",
  "header": { "schema_version": 1, "slug": "...", "branch": "...", "started_at": "...", "finalized_at": "...", "status": "completed" }, // fields null/best-effort when unparseable
  "entries": [
    {
      "n": 1,
      "stage": "intake",              // free string, not enforced
      "timestamp": "<ISO>",
      "outcome": "ok",                // ok | blocked | failed | partial (recorded, not validated)
      "subagent_return": "ok",        // ok | crashed | empty | malformed
      "what_went_well": ["<bullet>"], // each section: bullets with "- " stripped; missing → []
      "what_could_be_improved": [],
      "unexpected": [],
      "other_signals": [],
      "anchor": "Entry 1 — intake",   // LOAD-BEARING: verbatim H2 text — the traceback link target
      "raw": "<full markdown of the entry block>" // LOAD-BEARING: fallback context for clustering
    }
  ],
  "parse_status": "ok" | "degraded",
  "parse_notes": ["schema_version=2 (unknown)", "Entry 3 missing 'What went well'"]
}
```

### Degradation rules — the parser never halts

| Symptom | Behavior |
| --- | --- |
| File unreadable | `degraded`, note `unreadable: <error>`, `entries: []`. Continues. |
| Missing/malformed frontmatter | `header` best-effort, fields null, noted. Continues. |
| Unknown `schema_version` | Recorded literally; `degraded`; noted. Continues. |
| Missing section in an entry | That array is `[]`; noted per entry. Continues. |
| Unknown section heading | Captured as `{ section: 'unknown:<name>', raw }` — not lost. Continues. |

Only Synthesis can hard-halt; the parser only labels.

## Envelope collection

Between bootstrap and Synthesis, produce **one insight envelope per retro**.
How they're produced depends on batch size:

- **≥3 retros — fan out one sub-agent per retro** (never per batch). Dispatch
  **all sub-agents in a single message** so they run concurrently. Each
  receives **only** its repo-root-relative `retro_path` — never the batch,
  never another retro.
- **≤2 retros — the parent parses and buckets inline**, running the identical
  four-step procedure itself and producing the identical envelope shape
  in-memory. (2026-07-01 amendment — dispatch overhead exceeds the context
  saved on small batches; see design-notes.)

**Sub-agent tier: `sonnet/low`** (vocabulary:
`.claude/skills/ship-spec/resources/tiers.md`) — bucketing and quoting over
one small retro is mechanical; the genuine reasoning (clustering, triage,
prioritisation, protected-contract flagging) lives in the parent's Synthesis.

### The four-step procedure (sub-agent or inline)

1. **Read** the assigned `retro.md`.
2. **Parse** it with the `RetroParse` rules above (reused, not reinvented).
3. **Tally per-retro `health`**: `total_entries`, `outcome_counts`,
   `subagent_return_counts`, and a `by_stage[]` row per entry
   (`stage`/`outcome`/`subagent_return`).
4. **Bucket** each piece of signal into `pipeline[]` / `product[]` / `bugs[]`
   — each item carrying the verbatim `Entry N — <stage>` anchor, a verbatim
   quote, and its source `section`. **Bucket and quote only — never classify
   into findings/actions/suggestions; that is the parent's job.**

### Insight envelope shape (the return)

```jsonc
{
  "retro_path": "docs/specs/<dated-slug>/retro.md",
  "slug": "<dated-slug>",
  "parse_status": "ok",              // "ok" | "degraded"
  "parse_notes": [],
  "health": {
    "total_entries": 6,
    "outcome_counts":         { "ok": 4, "partial": 1, "blocked": 1, "failed": 0 },
    "subagent_return_counts": { "ok": 5, "crashed": 0, "empty": 1, "malformed": 0 },
    "by_stage": [{ "stage": "intake", "outcome": "ok", "subagent_return": "ok" }]
  },
  "pipeline": [{ "anchor": "Entry 1 — intake", "quote": "<verbatim>", "section": "what_could_be_improved" }],
  "product":  [{ "anchor": "Entry 3 — implement-task:T2", "quote": "<verbatim>", "section": "other_signals" }],
  "bugs":     [{ "anchor": "Entry 2 — implement-task", "quote": "<verbatim>", "section": "unexpected" }]
}
```

### Sole-writer + return-only invariant

Per `docs/standards/skills.md` § Retro touchpoint contract, applied here:
**the parent is the sole writer and sole committer of every artifact.**
Sub-agents are read-only (exactly one `retro.md`) and return-only (the
envelope). **Deliberate divergence, stated loudly:** a triage-retros
sub-agent returns an insight envelope, **NOT** a ` ```retro ` fenced block,
and the parent never appends a sub-agent return to any `retro.md`. The only
`retro.md` writes in this skill are the Mark-processed `git mv` + footer.

### Failure / degrade behavior

- A sub-agent that crashes, returns empty, or returns malformed is
  **re-dispatched once** (transient failures — e.g. a sub-agent attempting a
  nested spawn — usually clear on retry). If the retry also fails, mark that
  envelope `parse_status: 'degraded'` with a note, log it, and continue
  synthesizing from the rest. Degraded retros still appear in the plan's
  "Retros consumed" row and in `pipeline-health.md`.
- **Only if ALL envelopes are unusable** does the run halt — before the plan
  commit, so nothing is on disk: "Synthesis failed: 0 usable envelopes. No
  plan written. Branch not committed. Re-invoke /triage-retros to retry."

## Synthesis

Aggregate the N envelopes, run the cluster pass **inside the parent's own
context** (no cluster sub-agent), and write the artifacts directly. Read
`resources/rendering.md` and `resources/actions-contract.md` now.

**Inputs in context:**

1. The collected insight envelopes (pre-bucketed; each item carries
   `retro_path`, verbatim `anchor`, verbatim `quote`, `section`).
2. The pipeline-skill paths — `git ls-files '.claude/skills/*/SKILL.md'`.
   **Paths only at cluster time** — actions name a target file; anchors are
   validated *after* drafting (below).
3. The protected-contract path list from
   `resources/actions-contract.md` § Protected-contract paths.

### Cluster prompt

> You are clustering a batch of per-run retros into a small set of actionable
> improvements for the pipeline skills.
>
> **Read every envelope's `pipeline[]` items first** — they carry the highest
> improvement signal. Read `product[]`, `bugs[]`, and
> `other_signals`-sourced quotes as secondary context. For degraded
> envelopes, lean on whatever quotes survived and note the degradation in the
> plan's "Retros consumed" row.
>
> **Bucket each piece of feedback into one of three kinds before
> clustering:**
>
> - **Pipeline-related** (`findings[]` / `actions[]`) — about **how the
>   pipeline operates**: a stage, skill, orchestration mechanic,
>   retro-capture, allowlist, resumability, or the pipeline docs. Criterion:
>   it touches `.claude/skills/**` or pipeline docs.
> - **Improvement** (`suggestions[]`) — a **new or expanded product or
>   codebase capability**: behaviour absent or merely sub-optimal, not
>   broken. Flows to `suggestions-to-specs`.
> - **Bug** (`bugs[]`) — a **defect or regression in already-shipped
>   behaviour**. Flows to the bug queue via `bugs-to-reports`.
>
> **Tie-breaks (in order):** genuinely both pipeline and product →
> `findings[]` if the friction is about the *flow*, else
> `suggestions[]`/`bugs[]`; never double-file. Ambiguous improvement vs bug →
> **bug wins when behaviour is broken**; suggestion only when absent or
> sub-optimal.
>
> **Hard invariants:** `product-suggestions.md` never contains a bug;
> `suggestions[*].kind: bug` is a classification error — re-classify to
> `bugs[]`.
>
> **Cluster** by recurring theme (same friction, mechanism, or stage-impact):
> ≥2 entries sharing a theme form a cluster; isolated signals still become
> findings, typically at lower priority. Fold duplicate reports of the same
> product item into one suggestion with multiple `supporting[]` references.
>
> **Prioritize:** **HIGH** — recurring across ≥2 retros AND blocks/derails a
> stage, OR single-occurrence with a downstream cost later stages worked
> around. **MEDIUM** — recurring with friction but no derail, OR
> single-occurrence with a clear pipeline-improving change. **LOW** —
> one-off, nice-to-have, or unclear actionability.
>
> **Propose actions:** per finding, name the skill(s), target file path(s), a
> one-sentence change summary, and (when possible) an `anchor_hint`. Findings
> with no viable in-reach action get **zero actions** and land in
> `out_of_scope[]` with a one-line rationale.
>
> **Dimension-tag each action** per
> `resources/actions-contract.md` § Dimension vocabulary (one or more tags;
> open-ended; prefer the most specific fit).
>
> **Protected-contract flagging:** any action whose files intersect the
> protected path list gets `protected_contract: true` plus a one-paragraph
> justification.
>
> **Emit suggestions and bugs** per the working-shape fields in
> `resources/rendering.md` (suggestions: title/kind/description/supporting;
> bugs: id/title/severity/description/supporting, `report_file` always null).
>
> Every supporting reference must carry a real `retro_path`, the verbatim
> entry `anchor`, and a short verbatim quote.

### Skeptic pass (before rendering)

Re-read each **HIGH and MEDIUM** finding against its own supporting quotes
and ask: do the quotes actually support the claim, and is the priority earned
under the rubric above? Demote what's overstated; drop what the quotes don't
support (or move it to `out_of_scope[]` with the rationale). Every finding
that survives costs a full executor cycle plus human review — kill overstated
findings here, where it's cheapest.

### Anchor validation (after drafting actions)

For each drafted action with a non-null `anchor_hint`, **grep the target file
at HEAD** (read-only — this skill still never edits pipeline skills):

- Hint found **exactly once** → keep it.
- Found more than once or not at all → repair it: pick a verbatim, unique
  substring from the live file that the described change would anchor to; if
  none fits, set the hint to the null sentinel
  (`_none — executor recomputes from the file at apply time._`).

A guessed anchor is worse than the sentinel — the executor trusts hints and
halts on drift. Every emitted hint must be verbatim-from-file and unique.

### Synthesis halt

If the cluster pass yields nothing usable even from usable envelopes, halt
with a one-line reason — nothing is committed yet, so re-invocation reruns
Discovery → bootstrap → collection → Synthesis fresh. Partial degradation is
**not** a halt.

### Fixture verification

When verifying triage changes, run the classification rubric over
`.claude/skills/triage-retros/resources/fixture-retro.md` (a synthetic retro
with one unmistakable signal per bucket, homed under `.claude/skills/**` so
live globs never harvest it): its pipeline item must land in `findings[]`,
its improvement item in `suggestions[]`, its bug item in `bugs[]` — and the
bug must never appear in `product-suggestions.md`.

## Artifacts + plan commit

Render per `resources/rendering.md` (shape truth:
`docs/specs/_improvements/_templates/*.md`; `## Actions` per
`resources/actions-contract.md`):

- `pipeline-improvements.md` — always
- `pipeline-health.md` — always (never renamed downstream)
- `product-suggestions.md` — iff `suggestions.length > 0`
- `bug-reports.md` — iff `bugs.length > 0` (gather-only: no ids minted, no
  `docs/bugs/_reports/` writes — `bugs-to-reports` files them later)

Format the written files (the formatter from MATERIA.md § Gate's lint row, scoped to exactly the
files written — see rendering.md § Common rules), then stage everything plus
the README seed/row in **one atomic plan commit**:

```
triage-retros(plan): draft improvement plan from N retros
```

A failed artifact write halts **before** this commit — nothing lands, and
re-invocation starts fresh.

## Checkpoint

The only interactive seam after invocation. After the plan commit is pushed,
print the checkpoint prompt below, then **end the turn** — no further tool
calls. The operator's next message re-invokes the skill; gate Step 2c routes
it back here, and the message is classified as approve or feedback. There is
no timeout and no reminder — the run sits on the pushed branch indefinitely
and resumes cleanly in any future session.

### Checkpoint prompt (verbatim, values filled from the synthesis result)

```
─────────────────────────────────────────────────────────────────────
Improvement plan ready for review.

  Plan:        docs/specs/_improvements/<dated-slug>/pipeline-improvements.md
  Branch:      chore/triage-retros-<dated-slug> (committed + pushed)

Summary (<count HIGH>, <count MEDIUM>, <count LOW> across <retros_consumed.length> retros — <S> spec run, <B> bug run):
  F1 [HIGH]   <skill> — <one-line finding title>
  F2 [MEDIUM] <skill> — <one-line finding title>
  …
Out-of-scope this run: <out_of_scope.length> finding(s) (see § Out-of-scope in the plan).
Product suggestions captured: <suggestions.length> (see product-suggestions.md, if non-zero).
Bugs gathered: <bugs.length> (see bug-reports.md — run /bugs-to-reports to file them, if non-zero).
Pipeline health: pipeline-health.md emitted.

Reply 'proceed' to accept the plan, or paste any notes / changes you want
folded into the plan, suggestions, or bug reports before the retros are marked
processed and the PR is opened. (No timeout — the run pauses until you reply.)
─────────────────────────────────────────────────────────────────────
```

Findings whose actions carry `protected_contract: true` get a trailing
`← PROTECTED-CONTRACT` on their summary line. After the prompt, the final
sentence of the turn is verbatim:

> Awaiting operator reply at the checkpoint. The next message in this thread will resume the run.

### Approve-token allowlist

The reply is an **approve** iff, after trimming and lowercasing, the entire
reply is exactly one of:

`proceed` · `lgtm` · `ship it` · `go` · `approve` · `apply` · `ok`

Exact-reply matching: `proceed with the plan` or `proceed, but also drop F4`
are **feedback**, not approval (fold-then-re-ask is the safer default — see
design-notes). On approve, advance to **Mark-processed**.

### Fold-feedback loop

Non-approve replies are feedback, applied **directly to the markdown files**
per `resources/rendering.md` § Fold-feedback edit rules (keep section order
and field labels intact; re-derive frontmatter counts; maintain the
conditional-emit invariants — create/delete `product-suggestions.md` /
`bug-reports.md` as items move). Then: format the edited artifacts, commit as
`triage-retros(plan): fold operator feedback (round N)` (count rounds via
`git log --format=%s | grep -c 'fold operator feedback'`), push, re-emit the
checkpoint prompt, end the turn. No cap on rounds. An empty/whitespace-only
reply → `git commit --allow-empty -m "triage-retros(plan): noted empty
operator reply (round N)"`, push, re-prompt.

## Mark-processed

On approval, rename each consumed retro via `git mv` (preserves history) and
append the footer — this is the idempotency-by-filename mechanism, and it
decouples retro-consumption from plan-execution:

```bash
# spec-run retros:
git mv docs/specs/<retro-slug>/retro.md docs/specs/<retro-slug>/retro.processed.md
# bug-run retros:
git mv docs/bugs/<retro-slug>/retro.md docs/bugs/<retro-slug>/retro.processed.md
```

Append one footer line to each `retro.processed.md` (` · `-separated, one
line):

```
processed_on: <ISO date>  ·  processed_by: docs/specs/_improvements/<dated-slug>/pipeline-improvements.md  ·  pr: <filled by finalize>
```

(`<filled by finalize>` is the inherited literal placeholder — part of the
protected footer format; the backfill step rewrites it.)

All renames + footers land in **one commit**: `triage-retros(retros): mark N
retros processed`. Then push. If a `git mv` fails (target exists), halt
naming the path — the operator resolves and re-invokes; gate 2c resumes at
the Checkpoint, and a fresh `proceed` re-runs this phase.

## Scope guard

This skill writes a small fixed set of paths and **never edits
`.claude/skills/**` at runtime** — proposing edits is the plan's job,
applying them the executor's. Before opening the PR, sweep
`git diff --name-only main...HEAD`; every path must match one of:

```
^docs/specs/_improvements/<DATED_SLUG>/.*$        # the run's plan folder
^docs/specs/.*/retro\.(md|processed\.md)$         # spec-run retro renames + footers
^docs/specs/_improvements/README\.md$             # the improvements index
^docs/bugs/.*/retro\.(md|processed\.md)$          # bug-run retro renames + footers
```

(`<DATED_SLUG>` interpolated per run.) No `docs/bugs/_reports/` row exists —
this skill is gather-only; a stray queue write halts. `pipeline-health.md` is
in-scope via the first row but must **never** be renamed `.processed.md` (no
consumer dequeues it). On any non-matching path, halt without opening the PR,
naming the file + commit SHA and the unwind options (`git reset HEAD~1` /
`git revert <SHA>`).

## PR open

Exactly one PR against `main`. No `--draft`, no auto-merge — the operator
merges after review. **Tooling:** `gh pr create` locally; in the remote
environment (no `gh` CLI) use the GitHub MCP `create_pull_request` with the
same base/head/title/body. Everything else is tool-agnostic.

- **Body:** the `## PR description seed` block from the plan (placeholder
  left as-is at this step) + the repo's standard `🤖 Generated with [Claude
  Code](https://claude.com/claude-code)` footer.
- **Title:** `triage-retros: ` + the first clause of `summary_paragraph`
  (before the first period), truncated at a word boundary to <70 chars total
  with a trailing `…` if truncated.

On failure (auth, protections, network): halt with the error — branch and
commits are intact and pushed; the next invocation resumes at gate 2d and
re-runs only this step.

On success, print the final Done block — PR URL, plan path, retros consumed
(spec/bug split), findings by priority, actions proposed, protected-contract
flags, suggestions captured, bugs gathered, commit count — and remind: human
review merges the PR; `apply-pipeline-improvements` applies the plan after
merge; gathered bugs await `/bugs-to-reports`. Then continue to **PR-URL
backfill** in the same turn.

## PR-URL backfill

Replace every placeholder with the literal PR URL:

- `<filled by finalize>` — in every `retro.processed.md` footer on the branch
  (both `docs/specs/**` and `docs/bugs/**`).
- `<filled by PR open>` — in the plan's PR description seed AND the current
  run's row in `docs/specs/_improvements/README.md`.

Then **amend the Mark-processed commit** (message unchanged) and push:

```bash
git add docs/specs/**/retro.processed.md docs/bugs/**/retro.processed.md \
        docs/specs/_improvements/<dated-slug>/pipeline-improvements.md \
        docs/specs/_improvements/README.md
git commit --amend --no-edit
git push --force-with-lease
```

This is the run's **only** force-push — `--force-with-lease` on a
single-operator chore branch (see design-notes for why this is consistent
with the repo's force-push rule). After backfill the branch history reads:
plan commit → fold-feedback ×N → mark-processed (amended with the URL). Gate
2f matches on any later invocation.
