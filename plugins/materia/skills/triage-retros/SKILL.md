---
name: triage-retros
description: "Run manually via `/materia:triage-retros` after a stretch of `ship-spec` / `fix-bug` runs to harvest unprocessed retros (one sub-agent per retro at 3+, parsed inline by the parent at ≤2), cluster the project-specific signal in-memory, and author it directly — proposed specs into `docs/specs/_proposed/` and bug reports into `docs/bugs/_reports/`, both with `source: retro-triage` — following the `propose-spec` / `report-bug` producer practice. Bundles small related capabilities into as few specs as `propose-spec`'s split line allows, and folds duplicate signal about the same defect into one report; de-duplicates the drafts against the pending queues + the recent merge log (nothing silently discarded — a dropped/parked list rides the confirmation and the PR). Drafts everything in-memory, presents one confirmation, and on approve branches, writes the specs + reports, renames each consumed retro to `retro.processed.md`, and opens exactly one PR against the trunk — no auto-merge. In-memory until approve; re-invoke fresh if interrupted."
---

# triage-retros — scan retros and author backlog artifacts

The **scan-and-author** step that harvests `ship-spec`'s and `fix-bug`'s
per-run `retro.md` captures and turns them into **project-specific** backlog
artifacts. It globs unprocessed retros from both `docs/specs/**` and
`docs/bugs/**`, collects one insight envelope per retro (via sub-agents at 3+
retros, inline at ≤2), then clusters the aggregated signal **in-memory**
directly into drafted **proposed specs** and **bug reports** — no intermediate
hand-off buckets. It de-duplicates the drafts against the
live queues, presents **one confirmation** showing every draft inline plus a
dropped/parked list, and on `approve` branches, writes the specs into
`docs/specs/_proposed/` and the reports into `docs/bugs/_reports/` (both with
`source: retro-triage`), renames each consumed `retro.md` to
`retro.processed.md`, and opens exactly one PR against the trunk
(`MATERIA.md` § Version control).

This is a **producer**: it authors directly into both queues under their shared
contracts, following the `propose-spec` / `report-bug` practice — a single hop
from retro to reviewable proposal/report, all in one PR.

The stack is markdown + `git` + `gh`/GitHub-MCP + the skill harness. Manual
invocation only; single PR per run; no auto-merge. The retro template
(`docs/specs/_templates/retro.md`) is the schema this skill's parser is built
against; the `retro.md`/`retro.processed.md` naming is the
idempotency-by-rename convention. This skill reads retros and writes queue
artifacts + retro renames — it **never edits pipeline skills or product source**.

**Lifecycle:** interactive checkpoint · branch-at-approve — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, zero-work exit, id minting, consume-by-rename, link
integrity, one PR + tooling, no session survival). Harvest + synthesis +
drafting + de-dup all happen **in-memory**; an interrupted run leaves no trace,
and on `approve` the skill branches, writes, renames, commits, pushes, and
opens the PR in one shot.

**Read before running the relevant phase** (progressive disclosure — don't
front-load):

- `resources/rendering.md` — how to render the authored spec + report bodies,
  the per-artifact consolidation rule, the producer de-dup / dropped-list
  surfacing, the `source` / `source_refs` conventions, the in-memory working
  shape, the confirmation fold-edit rules, and the retro-rename footer; read at
  Synthesis and on every fold round.
- **Spec body shape truth** — `plugins/materia/skills/propose-spec/SKILL.md`
  § Body (the structured body the proposal must hit so `intake-spec` adopts it
  verbatim).
- **Spec structured-body detector** — `plugins/materia/skills/intake-spec/SKILL.md`
  § Procedure (step "Detect the input shape") — the H1 + H2 set `intake-spec`
  matches to adopt a proposal body verbatim.
- **Bug-report body shape truth** — `plugins/materia/skills/report-bug/SKILL.md`
  § Body and `docs/bugs/_templates/bug-report.md` (the 13-section format).
- **Queue contracts** — `docs/specs/_proposed/README.md` and
  `docs/bugs/_reports/README.md` (frontmatter shape, filename/folder pattern,
  producer responsibilities incl. de-duplication).
- `docs/specs/_templates/retro.md` — the schema the parser is built against
  (read-only).
- Fixture — `${CLAUDE_PLUGIN_ROOT}/skills/triage-retros/resources/fixture-retro.md`
  (the classification rubric's synthetic input; see § Fixture verification).
- `resources/design-notes.md` — rationale for the design decisions below; read
  only when **changing** this skill.

## Section map

| Section | What it covers |
| --- | --- |
| `## Discovery` | Glob + filter unprocessed retros; identity tuple; zero-work exit |
| `## Parser` | The `RetroParse` envelope + degradation rules |
| `## Envelope collection` | Sub-agent fan-out (3+) or inline parse (≤2); sole-writer invariant |
| `## Synthesis` | Cluster into drafted specs + reports; per-artifact consolidation; classification; skeptic pass |
| `## Producer de-duplication` | Filter drafts vs the live queues + merge log; the dropped/parked list |
| `## Confirmation checkpoint` | One in-memory confirmation, reply verbs, fold-feedback |
| `## On approve — branch, write, rename, commit, PR` | The whole git workflow, run in one shot |
| `## Scope guard` | The allowlist of touchable paths |
| `## File format` | Spec + report frontmatter/body/filename; ids; `source_refs`; retro footer |
| `## Scope (what this skill does NOT do)` | Non-goals — the boundaries of the run |
| `## Rules` | The load-bearing invariants, restated |

## Discovery

Entry point for every invocation. Anchor every command at the repo root
(`git rev-parse --show-toplevel`). **Nothing is written and no branch is
created here** — discovery is a pure in-memory scan.

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

**Zero matches (zero-work exit):** report both globs' match/ignored counts and
end the turn — **no branch, no files, no PR**. This is the only clean
no-op-with-no-PR path.

**≥1 match:** list each retro with its feature slug and run kind, note the
ignored count, and advance to **Envelope collection**.

## Parser

The parser reads a `retro.md` and produces the structured envelope everything
downstream consumes. It is the **only code path that touches retro file
contents** — synthesis and mark-processed all work off `RetroParse[]`. Schema
bumps adjust one place. Implementation is section-regex over the raw markdown
(see design-notes for why not an AST walker).

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
      "anchor": "Entry 1 — intake",   // LOAD-BEARING: the retro H2 through its stage (the heading may carry a trailing timestamp; the anchor is the stable prefix, substring-resolvable by grep) — the traceback target
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

Between discovery and Synthesis, produce **one insight envelope per retro**.
How they're produced depends on batch size:

- **≥3 retros — fan out one sub-agent per retro** (never per batch). Dispatch
  **all sub-agents in a single message** so they run concurrently. Each
  receives **only** its repo-root-relative `retro_path` — never the batch,
  never another retro.
- **≤2 retros — the parent parses and buckets inline**, running the identical
  three-step procedure itself and producing the identical envelope shape
  in-memory. (2026-07-01 amendment — dispatch overhead exceeds the context
  saved on small batches; see design-notes.)

**Sub-agent tier: `sonnet/low`** (row `triage-retros: sub-agent`,
`MATERIA.md` § Tiers § Skill routing) — bucketing and quoting over one small
retro is mechanical; the genuine reasoning (clustering, consolidation,
classification, drafting) lives in the parent's Synthesis.

### The three-step procedure (sub-agent or inline)

1. **Read** the assigned `retro.md`.
2. **Parse** it with the `RetroParse` rules above (reused, not reinvented).
3. **Bucket** each piece of project signal into `product[]` / `bugs[]` — each
   item carrying the verbatim `Entry N — <stage>` anchor, a verbatim quote, and
   its source `section`. Pipeline/harness-friction signal (a stage, skill,
   orchestration mechanic, retro-capture, allowlist, or the pipeline docs) has
   **no bucket** under the project retarget — it is not project backlog signal;
   leave it out. **Bucket and quote only — never classify into specs/reports or
   consolidate; that is the parent's job.**

### Insight envelope shape (the return)

```jsonc
{
  "retro_path": "docs/specs/<dated-slug>/retro.md",
  "slug": "<dated-slug>",
  "parse_status": "ok",              // "ok" | "degraded"
  "parse_notes": [],
  "product":  [{ "anchor": "Entry 3 — implement-task:T2", "quote": "<verbatim>", "section": "other_signals" }],
  "bugs":     [{ "anchor": "Entry 2 — implement-task", "quote": "<verbatim>", "section": "unexpected" }]
}
```

### Sole-writer + return-only invariant

Per `docs/standards/skills.md` § Retro touchpoint contract, applied here:
**the parent is the sole writer and sole committer of every artifact.**
Sub-agents are read-only (exactly one `retro.md`) and return-only (the
envelope). **Deliberate divergence, stated loudly:** a triage-retros sub-agent
returns an insight envelope, **NOT** a ` ```retro ` fenced block, and the parent
never appends a sub-agent return to any `retro.md`. The only `retro.md` writes
in this skill are the on-approve Mark-processed `git mv` + footer.

### Failure / degrade behavior

- A sub-agent that crashes, returns empty, or returns malformed is
  **re-dispatched once** (transient failures — e.g. a sub-agent attempting a
  nested spawn — usually clear on retry). If the retry also fails, mark that
  envelope `parse_status: 'degraded'` with a note, log it, and continue
  synthesizing from the rest. Degraded retros still appear in the run's
  "retros consumed" line and are flagged in the confirmation + PR body.
- **Only if ALL envelopes are unusable** does the run halt — before the
  confirmation, so **nothing is on disk** (no branch was created): "Triage
  failed: 0 usable envelopes. Nothing written. Re-invoke
  /materia:triage-retros to retry." Re-invocation reruns Discovery → collection
  → Synthesis fresh. Partial degradation is **not** a halt.

## Synthesis

Aggregate the N envelopes and run the cluster + draft pass **inside the
parent's own context** (no cluster sub-agent). Nothing is written to disk here —
the output is a set of in-memory drafts. Read `resources/rendering.md` now.

**Inputs in context:** the collected insight envelopes (each `product[]` /
`bugs[]` item carrying `retro_path`, verbatim `anchor`, verbatim `quote`,
`section`). For degraded envelopes, lean on whatever quotes survived and note
the degradation.

### Classify each signal

- **Improvement → proposed spec.** A **new or expanded product or codebase
  capability**: behaviour absent or merely sub-optimal, not broken.
- **Defect → bug report.** A **defect or regression in already-shipped
  behaviour**.
- **Pure pipeline / harness friction → excluded by design (no artifact).**
  Signal about how the pipeline operates is not project backlog signal — it
  produces no spec and no report. (Sub-agents already leave it out of the
  buckets; the parent drops any that slipped through.) This is a **deliberate,
  by-design exclusion under the project retarget** — distinct from a "drop"; it
  is not itemized on the dropped/parked list (the operator removed the
  pipeline-health corpus that once absorbed it). The "nothing silently
  discarded" invariant governs only **in-scope** (spec/bug) signal.

**Tie-break (ambiguous improvement vs defect):** **bug wins when behaviour is
broken**; spec only when a capability is absent or sub-optimal. Never
double-file — a defect never becomes a spec, and a spec never carries a bug.

### Consolidate — per-artifact rule

Fold recurring signal across retros so the batch produces **as few artifacts as
each queue's shape allows**. Consolidation means different things per artifact:

- **Proposed specs — bundle related stories, capped at the split line.** Bundle
  small *related* capabilities into **one** proposed spec as multiple user
  stories, rather than fragmenting into many one-item specs. Still **SPLIT**
  when a cluster crosses `propose-spec`'s bright line — `>~5 user stories`,
  independent surfaces touched, or multiple unrelated outcomes — so each spec
  stays a single shippable unit `ship-spec` can build end-to-end. Same need
  reported across two retros is one spec, not two.
- **Bug reports — fold same-defect signal only.** The `report-bug` body is
  **single-defect** (one `## Steps to reproduce`, one `## Expected` /
  `## Actual`, one `severity`), and `fix-bug` consumes one report = one defect.
  So "consolidate" for bugs means **fold duplicate / related signal about the
  *same* defect into one report** (multiple `source_refs` / supporting
  anchors) — **never** merge unrelated defects into one report.

### Draft each artifact

For each consolidated cluster, draft the complete artifact **now** — full
frontmatter + full body — per § File format. Mint a fresh `id` per draft so the
confirmation can show it and the operator can `edit <id>` / `drop <id>` it.
Ground every draft in the project's vocabulary (`docs/glossary.md`) and the
relevant standards so acceptance criteria / reproduction steps are **literally
testable**, not vague. Every supporting reference carries a real `retro_path`,
the verbatim entry `anchor`, and a short verbatim quote.

### Skeptic pass (before de-dup)

Re-read each drafted spec and report against its own supporting quotes: do the
quotes actually support the claim? Drop what the quotes don't support (to the
dropped/parked list with a one-line rationale), and fold near-duplicates into a
single artifact with multiple `source_refs`. Every artifact that survives costs
human review — kill overstated items here, where it's cheapest.

### Fixture verification

When verifying triage changes, run the classification rubric over
`${CLAUDE_PLUGIN_ROOT}/skills/triage-retros/resources/fixture-retro.md`
(a synthetic retro with one unmistakable signal per outcome, homed under the
skill's own `resources/` so live globs never harvest it): its improvement item
must land as a **drafted proposed spec**, its bug item as a **drafted bug
report**, and its pipeline/harness-friction entry must produce **no artifact**
(out of scope under the project retarget). The rubric detail lives in
`resources/rendering.md`.

## Producer de-duplication

**Mandatory queue-contract invariant.** Both `docs/specs/_proposed/README.md`
and `docs/bugs/_reports/README.md` require a producer to **not duplicate an
item already pending in the queue or recently shipped/fixed**. This is the one
behavior most likely to ship wrong, because the retro loop was not a queue
producer before this — do not skip it.

Load the live queues + the recent merge log, then filter every draft:

**Specs — filter against:**

1. Pending proposals: `git ls-files 'docs/specs/_proposed/*.md'` (minus
   `README.md`) — read frontmatter + tagline + body for content-level dedupe.
2. The recent merge log:
   `git log <trunk> --since='3 months ago' --grep='ship-spec\|_proposed\|triage-retros' --pretty=oneline`
   (`<trunk>` per `MATERIA.md` § Version control)
   — so a draft duplicating recently-shipped work is dropped.

**Reports — filter against:**

1. Pending reports: `git ls-files 'docs/bugs/_reports/*/report.md'` — read
   frontmatter + summary for content-level dedupe.
2. The recent merge log:
   `git log <trunk> --since='3 months ago' --grep='fix-bug\|_reports\|report-bug\|triage-retros' --pretty=oneline`
   — so a draft duplicating a recently-fixed defect is dropped.

Any draft that overlaps a pending or recently-shipped/fixed item is **dropped**.
**No in-scope draft is silently discarded** — every drop (from the skeptic pass
or this de-dup pass) goes to a **dropped/parked list** with a one-line rationale
each
(e.g. `spec: duplicates pending proposal 9c4f1q`, `bug: fixed in the merge log
2026-06-28`). That list is surfaced at the confirmation prompt **and** in the PR
body — it is both the queue-contract requirement and the producer-lifecycle
"nothing silently discarded" invariant.

## Confirmation checkpoint

The only interactive seam. Everything so far is in-memory — no branch, no
files. Present **one** confirmation block showing every surviving draft inline
(so the reviewer reads without fetching anything), the dropped/parked list, and
the retros that will be consumed, then **end the turn** — a skill cannot
synchronously await a reply. The operator's next message is classified per the
reply verbs below.

```
─────────────────────────────────────────────────────────────────────
Retro triage ready for review.

Triaged <K> retro(s) (<S> spec run, <B> bug run) into:

Proposed specs (<P>):
  1. <id-1> — <title-1>
     Will be written to: docs/specs/_proposed/<filename-1>

     <full inline body block — frontmatter + spec sections>
  …

Bug reports (<R>):
  1. <id-a> — <title-a>  [severity: <low|medium|high|critical>]
     Will be written to: docs/bugs/_reports/<dated-slug-a>/report.md

     <full inline body — frontmatter + 13-section body>
  …

Dropped or parked (<D>):
  - <spec|bug>: <one-line rationale> (from <retro-anchor>)
  - …

Retros to mark processed (renamed to retro.processed.md on approve):
  - docs/specs/<slug>/retro.md          (spec run)
  - docs/bugs/<slug>/retro.md           (bug run)
  …

Reply:
  - `approve` — branch, write the spec(s) + report(s), rename the retros,
    open one PR.
  - `edit: <feedback>` — adjust all drafts and re-present.
  - `edit <id>: <feedback>` — edit just one spec or report.
  - `drop <id>` — remove one spec or report from the batch.
  - `cancel` — exit cleanly; nothing written, nothing renamed.
─────────────────────────────────────────────────────────────────────
```

End the turn.

**No-artifact run is valid.** When the batch produces zero specs **and** zero
reports (all signal was pipeline friction, de-duped, or skeptic-dropped), still
present the confirmation — with empty spec/report sections, the dropped/parked
list, and the retros to mark processed — and on `approve` open a PR that renames
the retros (so they are not re-harvested forever) and carries the dropped list.
This is **not** the zero-work exit; that is the zero-retros Discovery case,
which opens no PR at all.

**Reply verbs** (per `docs/standards/skills.md` § Producer lifecycle,
interactive checkpoint mode):

- `approve` (or the standing approve tokens) → advance to
  **On approve**. Exact-reply matching: `approve, but also drop the second spec`
  is **feedback**, not approval — fold, then re-present.
- `edit: <feedback>` → fold into all drafts and re-present.
- `edit <id>: <feedback>` → fold into just that draft and re-present.
- `drop <id>` → remove that draft from the batch (move it to the dropped list
  with rationale `operator drop`) and re-present.
- `cancel` (or silence) → clean no-op. Nothing is on disk — no branch, no
  files — so there is nothing to unwind. Print "Cancelled. Nothing written."

Fold rounds have no cap; usually one round. Apply feedback to the in-memory
drafts per `resources/rendering.md` § Fold-feedback edit rules (keep the
required section order + field labels intact; re-derive frontmatter counts;
keep the spec/report classification invariants — a defect never becomes a spec).
On round 5+ prefer a fresh re-draft from the new direction over incremental
edits.

**No session survival.** An interrupt before `approve` discards the whole
in-memory harvest + synthesis — re-invoke `/materia:triage-retros` fresh (it
re-globs the still-unrenamed retros and re-runs). This cost is heavier than for
the cheap Q&A producers (see design-notes) but is the direct consequence of the
producer lifecycle. There is no cross-session resume.

## On approve — branch, write, rename, commit, PR

Run the whole workflow in one shot. Up to this point nothing has touched the
repo; the branch is created now so an abandoned confirmation leaves no trace.

1. **Sync the trunk and branch.**

   ```bash
   git checkout <trunk> && git pull <remote> <trunk>
   git checkout -b chore/triage-retros-<YYYY-MM-DD>
   ```

   (`<trunk>`/`<remote>` per `MATERIA.md` § Version control; the new branch is
   based off `<trunk>`.) `<YYYY-MM-DD>` is today's date (branch names stay
   date-only). Same-day
   collision + dirty-pull handling per the lifecycle (append `openssl rand -hex
   2` on a local name clash; halt and surface a `git pull` blocked by local
   changes).

2. **Write each proposed spec** with the `Write` tool to
   `docs/specs/_proposed/<filename>` (frontmatter + body per § File format).

3. **Write each bug report** with the `Write` tool to
   `docs/bugs/_reports/<dated-slug>/report.md` (frontmatter + body per § File
   format). Id-collision handling per the lifecycle: on a filename/folder
   collision or an id already on disk in either queue or in the recent merge
   log, regenerate the id once and retry; a second collision halts with the
   colliding path.

4. **Rename each consumed retro** with `git mv` (preserves history) — this is
   the idempotency-by-filename mechanism:

   ```bash
   # spec-run retros:
   git mv docs/specs/<retro-slug>/retro.md docs/specs/<retro-slug>/retro.processed.md
   # bug-run retros:
   git mv docs/bugs/<retro-slug>/retro.md docs/bugs/<retro-slug>/retro.processed.md
   ```

   Append one footer line to each `retro.processed.md` (` · `-separated, one
   line — no PR-URL backfill):

   ```
   processed_on: <YYYY-MM-DD>  ·  processed_by: /materia:triage-retros
   ```

   If a `git mv` fails (target exists), halt naming the path — the operator
   resolves and re-invokes.

5. **Format** the written files (the formatter from `MATERIA.md` § Gate's lint
   row, scoped to exactly the files written — never `--write .`; see
   `resources/rendering.md` § Common rules).

6. **Stage only the literal paths this run wrote or renamed** — never a whole
   tree. `git mv` already staged the renames; stage the new artifacts and the
   footer edits by their exact paths so nothing co-located (a formatter-touched
   `README.md`, an unrelated `retro.md`) can sweep in:

   ```bash
   # each authored spec, each authored report folder, each renamed retro:
   git add docs/specs/_proposed/<filename-1>.md [ …more specs ] \
           docs/bugs/_reports/<dated-slug-1>/ [ …more report folders ] \
           docs/specs/<retro-slug>/retro.processed.md [ …more renamed retros ] \
           docs/bugs/<retro-slug>/retro.processed.md
   ```

7. **Verify link integrity, then run the scope guard on the *staged* diff,
   before committing.** Run `sh scripts/check-docs.sh` and fix any link the
   *new* files introduce (pre-existing debt on the trunk is not this run's job; if
   `check:docs` isn't runnable, grep the new files for `](../` and `](./` and
   verify each target manually). Then run the **scope guard** (§ Scope guard)
   over `git diff --cached --name-only` — running it pre-commit means a stray
   path never enters history. Only if the guard passes, commit in **one atomic
   commit**:

   ```bash
   git commit -m "triage-retros: <P> spec(s) + <R> report(s) from <K> retro(s)"
   # no-artifact run: "triage-retros: <K> retro(s) triaged, no backlog signal"
   ```

8. **Push** the branch:

   ```bash
   git push -u <remote> chore/triage-retros-<YYYY-MM-DD>
   ```

9. **Open exactly one PR** against the trunk, via the open-PR op
   (`MATERIA.md` § Version control § Forge). No `--draft`, no auto-merge —
   the operator merges after review.

   - **Title:** `triage-retros: <P> spec(s) + <R> report(s) from <K> retro(s)`
     (a no-artifact run: `triage-retros: <K> retro(s), no backlog signal`).
   - **Body:** the rendered spec section(s) and report section(s) inline, the
     dropped/parked list with rationales, and the list of retros consumed
     (spec/bug split, degraded ones flagged). Closing lines: "Build any spec
     with `/materia:ship-spec <id>`. Work any report with `/materia:fix-bug`."
     The body's last element is the **Materia sigil** naming `triage-retros` as
     the caster (`docs/standards/skills.md` § PR attribution — the Materia
     sigil), followed by the standard `🤖 Generated with [Claude
     Code](https://claude.com/claude-code)` footer.

Print the closing report — the PR URL, the specs written (id + path), the
reports written (id + path), the retros consumed (spec/bug split), the
dropped/parked count, and the reminder that human review merges the PR. End the
turn.

On PR-open failure (auth, protections, network): halt with the error — the
branch and commit are intact and pushed; the operator retries the PR open or
re-invokes.

## Scope guard

This skill writes a small fixed set of paths and **never edits pipeline skills
or product source**. Run this guard on the **staged diff, before committing**
(step 7) — `git diff --cached --name-only` — so a stray path never enters
history. Every staged path must match one of these (the dated-prefix / basename
anchors keep the patterns from matching a queue `README.md` or an unrelated
file swept in by formatting):

```
^docs/specs/_proposed/[0-9]{4}-[0-9]{2}-[0-9]{2}-[^/]+\.md$        # authored proposed specs (dated filename)
^docs/bugs/_reports/[0-9]{4}-[0-9]{2}-[0-9]{2}-[^/]+/report\.md$   # authored bug reports (dated folder + report.md)
^docs/specs/[^/]+/retro\.(md|processed\.md)$                       # spec-run retro renames + footers
^docs/bugs/[^/]+/retro\.(md|processed\.md)$                        # bug-run retro renames + footers
```

Writing into `docs/bugs/_reports/**` is now **legitimate** — this skill is a
producer for that queue (the old gather-only prohibition is gone), but only the
run's **own** dated report folders (the `report.md` basename anchor rejects a
stray edit to another producer's folder). Any staged path outside the
allowlist — a pipeline skill under `plugins/materia/skills/**`, product source,
a queue `README.md`, any other doc — **halts** the run **before the commit**,
naming the offending file and the unwind (unstage it with `git restore --staged
<path>`, or abort and re-invoke). Nothing is committed or pushed until the guard
is clean.

## File format

### Proposed specs → `docs/specs/_proposed/`

**Frontmatter:**

```yaml
---
id: <fresh 6-char base36 token>
schema_version: 1
source: retro-triage
source_refs:
  - "docs/specs/<slug>/retro.processed.md § Entry 3 — implement-task"
  - "docs/bugs/<slug>/retro.processed.md § Entry 2 — reproduce-bug"
title: <one-line title; matches the body H1>
date: <YYYY-MM-DD>
status: proposed
---
```

**Body:** the exact structure `intake-spec` produces / `propose-spec` § Body
defines — H1 + tagline blockquote + `## Problem`, `## Goals`, `## Non-goals`,
`## Users & context`, `## User stories & acceptance criteria` (each story a
`- [ ] **Story:** … / - **Accept:** <testable AC>` pair), `## Constraints`,
`## Open questions`. **Every required H2 must be present verbatim and in order,
even when thin** — `intake-spec`'s detector matches on the H1 plus `## Problem`,
`## Goals`, `## User stories & acceptance criteria`, and `## Open questions`.
Link paths follow `propose-spec` § Link paths: backtick/arrow prose only, e.g.
`visual-language → docs/standards/visual-language.md` — never a relative link
(breaks when `intake-spec` adopts the body at a different folder depth) and
never an absolute-from-repo-root path (`check-docs.sh` resolves links against
the containing file's own directory, so a repo-root path doesn't resolve from
either location either).

**Filename:** `<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md`.

### Bug reports → `docs/bugs/_reports/`

**Frontmatter:**

```yaml
---
id: <fresh 6-char base36 token>
schema_version: 1
source: retro-triage
severity: low | medium | high | critical   # closed enum; mirrors the body section
source_refs:
  - "docs/bugs/<slug>/retro.processed.md § Entry 2 — implement-task"
title: <one-line title; matches the body H1>
date: <YYYY-MM-DD>
status: reported
---
```

**Body:** the 13-section format `report-bug` § Body / `docs/bugs/_templates/bug-report.md`
define, every H2 verbatim and in order: `## Summary` · `## Environment` ·
`## Steps to reproduce` · `## Expected` · `## Actual` · `## Reproducibility` ·
`## Severity & impact` · `## Affected surface / route / module` ·
`## Preconditions / data setup` · `## Evidence` · `## Regression window` ·
`## Workaround` · `## Open questions`. **Single-defect** — one reproduction,
one expected/actual, one severity. Fill each section from the retro signal; use
a placeholder line where the source data doesn't populate a field (e.g.
"Unknown — see source retro."). **Mirror `severity`** in both the frontmatter
`severity:` field and the `## Severity & impact` section — both must agree.
Link paths are absolute-from-repo-root (`report-bug` § Link paths). The body
**MUST NOT** repeat frontmatter metadata.

**Folder:** `docs/bugs/_reports/<YYYY-MM-DD-HHMMSS>-<id>-<slug>/report.md`.

### Shared conventions

- **`source: retro-triage`** on every authored spec and report (registered in
  both queues' producer tables; the queue contracts are source-agnostic — no
  enum edit).
- **`source_refs`** is **always a YAML list**, one entry per originating retro
  anchor, pointing at the retro's **post-run resting path**
  (`docs/.../retro.processed.md § Entry N — <stage>`) — the retro is renamed in
  the **same commit**, so the `.processed.md` path is the one that resolves.
  The anchor is the heading's stable prefix (through the stage); grep'ing it as
  a substring in the linked file must find the source.
- **Ids** — a fresh 6-char base36 token per artifact,
  `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
  `intake-spec`, `propose-spec`, and `report-bug` use). Never reuse an id on
  disk in the target queue or visible in the recent merge log; the `HHMMSS`
  filename prefix is minted alongside via `date -u +%Y-%m-%d-%H%M%S`.
- **Slug** — derived from the title via the **normative kebab-slug algorithm**
  in `docs/specs/_proposed/README.md` § Kebab-slug derivation. Do NOT invent a
  different algorithm.
- **Retro footer** — one line per `retro.processed.md`, appended in the same
  commit as the artifacts it produced:
  `processed_on: <YYYY-MM-DD>  ·  processed_by: /materia:triage-retros`. No
  PR-URL backfill.

## Scope (what this skill does NOT do)

- Does NOT branch, write, commit, push, or open a PR **before** the operator
  approves the drafts. Harvest + synthesis + de-dup are in-memory; the git
  workflow only fires on `approve`.
- Does NOT run `ship-spec` or `fix-bug` or implement any product change. After
  the PR lands, the operator runs `/materia:ship-spec <id>` on a spec or
  `/materia:fix-bug` on a report.
- Does NOT edit pipeline skills, product source, or product docs — only the two
  queues + the retro renames (§ Scope guard).
- Does NOT modify either queue's contract README. Contract changes are a
  separate PR.
- Does NOT write intermediate hand-off buckets or any per-run audit folder —
  the git diff on the branch / in the PR is the audit. There is no
  cross-session resume; an interrupted run is re-invoked fresh.

## Rules

- **Producer de-duplication is mandatory.** Filter every draft against the
  pending queue + the recent merge log; drop duplicates to the dropped/parked
  list. No in-scope draft is silently discarded — the dropped list rides the
  confirmation and the PR. (Out-of-scope pipeline/harness friction is excluded
  by design, not itemized — see § Synthesis.)
- **Consolidate per artifact.** Specs bundle related stories, capped at
  `propose-spec`'s split line; bug reports fold same-defect signal only, never
  merging unrelated defects.
- **Classification is one-way.** Improvement → spec, defect → bug report,
  pipeline friction → dropped. A defect never becomes a spec; a spec never
  carries a bug.
- **In-memory until approve.** No branch, no file, no commit until `approve`.
  `cancel` / silence is a clean no-op.
- **One PR per run, no auto-merge.** The renderer always emits every required
  H2 verbatim so `intake-spec` / `fix-bug` adopt the bodies unchanged; the PR
  body carries every artifact inline plus the dropped/parked list and closes
  with the Materia sigil.
