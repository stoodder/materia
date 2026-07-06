---
name: materia-triage-retros
description: "Run manually via `/materia-triage-retros` after a stretch of `materia-ship-spec` / `materia-fix-bug` runs to harvest unprocessed retros (one sub-agent per retro at 3+, parsed inline by the parent at ≤2), aggregate the insight envelopes, and run a two-way triage of the project-specific signal into artifacts under `docs/specs/_improvements/<dated-slug>/`: `product-suggestions.md` (when product feedback is present, consumed by `materia-suggestions-to-specs`), `bug-reports.md` (when defects are gathered, consumed by `materia-bugs-to-reports`), and `pipeline-health.md` (always emitted, never consumed — an accumulating health corpus that also serves as the run's resumability sentinel). Pauses for the operator to nudge the artifacts, renames each consumed retro to `retro.processed.md`, and opens exactly one PR against `main` — no auto-merge. Resumable across sessions. Single PR per run."
---

# materia-triage-retros — scan retros and triage project signal

The **scan-and-triage** step that harvests `materia-ship-spec`'s and
`materia-fix-bug`'s per-run `retro.md` captures and turns them into
**project-specific** backlog signal. It globs unprocessed retros from both
`docs/specs/**` and `docs/bugs/**`, collects one insight envelope per retro
(via sub-agents at 3+ retros, inline at ≤2), then clusters and triages the
aggregated signal into artifacts written **directly to disk** — no
intermediate JSON. After the triage commit it **pauses for operator review by
ending the turn**, folds any feedback directly into the markdown, renames
each consumed `retro.md` to `retro.processed.md`, and opens exactly one PR
against `main`. It only **captures** signal — the two hand-off buckets are
consumed downstream by `materia-suggestions-to-specs` (product suggestions →
proposed specs) and `materia-bugs-to-reports` (gathered bugs → the bug
queue), which run independently off the artifacts it lands.

The stack is markdown + `git` + `gh`/GitHub-MCP + the skill harness. Manual
invocation only; single PR per run; no auto-merge. The retro template
(`docs/specs/_templates/retro.md`) is the schema this skill's parser is built
against; the `retro.md`/`retro.processed.md` naming is the
idempotency-by-rename convention. This skill reads retros and writes hand-off
artifacts — it **never edits pipeline skills or product source**.

**Read before running the relevant phase** (progressive disclosure — don't
front-load):

- `resources/rendering.md` — the artifact render specs plus the shared
  traceback + placeholder conventions; read at Synthesis and on every
  fold-feedback round.
- `docs/specs/_improvements/_templates/*.md` — **shape truth** for the three
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
| `## Branch + folder bootstrap` | Branch, `<dated-slug>`, triage folder, README seed |
| `## Parser` | The `RetroParse` envelope + degradation rules |
| `## Envelope collection` | Sub-agent fan-out (3+) or inline parse (≤2) |
| `## Synthesis` | Cluster prompt, two-way triage, skeptic pass |
| `## Artifacts + triage commit` | What gets written and committed (see resources/rendering.md) |
| `## Checkpoint` | Pause-by-ending-turn, approve tokens, fold-feedback |
| `## Mark-processed` → `## PR-URL backfill` | Renames, scope guard, PR, backfill |

## Resumability gate

Run this **first on every invocation**. It is pure: inspect the branch, the
**committed tree**, and the commit graph; derive the first incomplete phase;
print a recap; hand off. There is no `RUN.md`/`STATUS.md` — state is
file-derived (see design-notes). **All folder/artifact existence below is
judged on the committed tree (`git ls-files`), never on-disk `test -d`** — so
a leftover *uncommitted* empty folder from a crash before the triage commit
never false-corrupts a retry. The lifecycle is linear — **artifacts written →
retros renamed → PR opened → PR-URL backfilled** — and each phase is one
atomic commit, so the first incomplete phase is unambiguous.

### Step 1 — detect the run

If the current branch matches `chore/triage-retros-*`, extract the
`<dated-slug>` suffix and continue to Step 2. Otherwise this is a **fresh
invocation** — go directly to **Discovery**.

### Step 2 — detect the phase (first match wins)

- **2a.** The triage commit has not landed —
  `git ls-files docs/specs/_improvements/<dated-slug>/pipeline-health.md`
  returns nothing (the folder is absent, **or** is a leftover *uncommitted*
  empty folder from a crash before the triage commit) → **resume at
  Synthesis.** Existence is judged on the committed tree, so a leftover
  uncommitted folder routes to a clean Synthesis re-run (it is re-used /
  overwritten safely), **never** to 2b.
- **2b.** The folder is **committed** (`git ls-files
  docs/specs/_improvements/<dated-slug>/` lists tracked files) but
  `pipeline-health.md` is **not** among them → **corrupt state.** The triage
  commit is atomic and always includes `pipeline-health.md` (the
  unconditionally-emitted sentinel), so a committed folder missing it can only
  be hand-corruption. Halt, naming the directory and expected file; the
  operator deletes the orphan and re-invokes, or hand-restores the run. The
  two bucket files (`product-suggestions.md`, `bug-reports.md`) are
  **conditional**, so their absence is never corrupt — a health-only run (both
  buckets empty) is a valid complete run.
- **2c.** The folder is committed (sentinel tracked) AND `git log --format=%s` has zero commits matching
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

Before the resumed phase, print a short recap naming the branch, the run
folder path, retros pending rename, bug-reports presence, whether a PR is
open, and the phase being resumed. A Checkpoint resume (2c) re-emits the full
checkpoint prompt with the unchanged triage summary immediately after.

**Crash-mid-phase safety:** a phase that died before its commit left no
commit, so the gate (judging existence on the committed tree) re-runs it —
any leftover uncommitted files are re-used or overwritten. Re-entry is always
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

**Minting the `<dated-slug>`** — same `<yyyy-mm-dd-hhmmss>-<rand>-<slug>` convention
as `materia-intake-spec`: today's ISO date; a fresh 6-char base36 token
(`LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`); a short kebab-case
batch slug by this heuristic (operator may rename folder + branch after the
checkpoint; the skill never auto-renames):

| Retro count | Default slug |
| --- | --- |
| 1 | `<feature-slug>-retro` |
| 2 clustering around one theme | `<theme>-roundup` (else fall through) |
| ≥3 (or 2 that don't cluster) | `weekly-roundup` |

**Triage folder:** create `docs/specs/_improvements/<dated-slug>/` but do
**not** commit it empty — the first content commit is the triage commit.

**README seed:** if `docs/specs/_improvements/README.md` is untracked, seed
the index in the triage commit; otherwise append this run's row (one row per
run: dated-slug · run folder path · PR cell carrying `<filled by PR open>`
until backfill · outcome). The **outcome** maps to what the run produced:
`captured` when ≥1 suggestion or bug was emitted, `health-only` when neither
bucket was (only `pipeline-health.md` — the PR still opens; it is **not** a
no-op).

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

**Sub-agent tier: `sonnet/low`** (row `triage-retros: sub-agent`,
`MATERIA.md` § Tiers § Skill routing) — bucketing and quoting over
one small retro is mechanical; the genuine reasoning (clustering, triage,
prioritisation) lives in the parent's Synthesis.

### The four-step procedure (sub-agent or inline)

1. **Read** the assigned `retro.md`.
2. **Parse** it with the `RetroParse` rules above (reused, not reinvented).
3. **Tally per-retro `health`**: `total_entries`, `outcome_counts`,
   `subagent_return_counts`, and a `by_stage[]` row per entry
   (`stage`/`outcome`/`subagent_return`).
4. **Bucket** each piece of project signal into `product[]` / `bugs[]` — each
   item carrying the verbatim `Entry N — <stage>` anchor, a verbatim quote,
   and its source `section`. Pipeline/harness-friction signal has no bucket
   under the project retarget — it survives only in the `health` tally.
   **Bucket and quote only — never classify into suggestions/reports; that is
   the parent's job.**

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
  synthesizing from the rest. Degraded retros still appear in the run's
  "Retros consumed" row and in `pipeline-health.md`.
- **Only if ALL envelopes are unusable** does the run halt — before the
  triage commit, so **nothing is committed** (the branch and an empty triage
  folder may exist on disk, but no commit landed): "Synthesis failed: 0 usable
  envelopes. No artifacts committed. Re-invoke /materia-triage-retros to
  retry." Re-invocation's gate finds no committed `pipeline-health.md` (2a) and
  re-runs Discovery-derived collection → Synthesis fresh over the same branch.

## Synthesis

Aggregate the N envelopes, run the cluster pass **inside the parent's own
context** (no cluster sub-agent), and write the artifacts directly. Read
`resources/rendering.md` now.

**Inputs in context:**

1. The collected insight envelopes (pre-bucketed; each item carries
   `retro_path`, verbatim `anchor`, verbatim `quote`, `section`).
2. The per-retro `health` tallies — the raw material for `pipeline-health.md`.

### Cluster prompt

> You are clustering a batch of per-run retros into **project-specific**
> backlog signal: product suggestions and bug reports. Pipeline/harness
> friction is **not** in scope here — it is captured only in the batch's
> `pipeline-health.md` rollup.
>
> **Read every envelope's `product[]` and `bugs[]` items first** — they carry
> the actionable project signal. Read the `other_signals`-sourced quotes as
> secondary context. For degraded envelopes, lean on whatever quotes survived
> and note the degradation in the "Retros consumed" row.
>
> **Bucket each piece of feedback into one of two kinds:**
>
> - **Improvement** (`suggestions[]`) — a **new or expanded product or
>   codebase capability**: behaviour absent or merely sub-optimal, not
>   broken. Flows to `materia-suggestions-to-specs`.
> - **Bug** (`bugs[]`) — a **defect or regression in already-shipped
>   behaviour**. Flows to the bug queue via `materia-bugs-to-reports`.
>
> Signal that is purely about **how the pipeline operates** (a stage, skill,
> orchestration mechanic, retro-capture, allowlist, resumability, or the
> pipeline docs) is **out of scope** for the buckets — drop it; it survives
> only as a health signal in `pipeline-health.md`.
>
> **Tie-break (ambiguous improvement vs bug):** **bug wins when behaviour is
> broken**; suggestion only when a capability is absent or sub-optimal. Never
> double-file.
>
> **Hard invariant:** `product-suggestions.md` never contains a bug;
> `suggestions[*].kind: bug` is a classification error — re-classify to
> `bugs[]`.
>
> **Cluster** by recurring theme: fold duplicate reports of the same product
> item into one suggestion (or one bug) with multiple `supporting[]`
> references; isolated signals still become their own entry.
>
> **Emit suggestions and bugs** per the working-shape fields in
> `resources/rendering.md` (suggestions: title/kind/description/supporting;
> bugs: id/title/severity/description/supporting, `report_file` always null).
>
> Every supporting reference must carry a real `retro_path`, the verbatim
> entry `anchor`, and a short verbatim quote.

### Skeptic pass (before rendering)

Re-read each suggestion and bug against its own supporting quotes and ask: do
the quotes actually support the claim? Drop what the quotes don't support,
and fold near-duplicates into a single entry with multiple `supporting[]`
references. Every item that survives costs a downstream producer run plus
human review — kill overstated items here, where it's cheapest.

### Health-only outcome (not a halt)

Zero suggestions **and** zero bugs is a legitimate terminal outcome, **not** a
halt: the batch carried no project-actionable signal. The run still emits
`pipeline-health.md` (the always-emitted rollup + sentinel), marks the
consumed retros processed, and opens its single PR — there are simply no
bucket files and no downstream producer hand-off (see `## Artifacts + triage
commit` → health-only run). The only clean no-op-with-no-PR path is the
**zero-retros** Discovery case (nothing to harvest at all).

A run hard-halts *only* when **all envelopes are unusable** (see § Envelope
collection) — before any commit, so re-invocation reruns Discovery →
bootstrap → collection → Synthesis fresh. Partial degradation is **not** a
halt.

### Fixture verification

When verifying triage changes, run the classification rubric over
`${CLAUDE_PLUGIN_ROOT}/skills/materia-triage-retros/resources/fixture-retro.md`
(a synthetic retro with one unmistakable signal per bucket, homed under the
skill's own `resources/` so live globs never harvest it): its improvement
item must land in `suggestions[]`, its bug item in `bugs[]`, and its
pipeline/harness-friction entry must produce **no** bucket item (out of scope
under the project retarget) — and the bug must never appear in
`product-suggestions.md`.

## Artifacts + triage commit

Render per `resources/rendering.md` (shape truth:
`docs/specs/_improvements/_templates/*.md`):

- `pipeline-health.md` — **always** (never renamed downstream; the
  resumability sentinel)
- `product-suggestions.md` — iff `suggestions.length > 0`
- `bug-reports.md` — iff `bugs.length > 0` (gather-only: no ids minted, no
  `docs/bugs/_reports/` writes — `materia-bugs-to-reports` files them later)

**Health-only run.** When `suggestions.length === 0` **and**
`bugs.length === 0`, the folder holds only `pipeline-health.md`. This is a
valid, complete run — the sentinel is present, so the folder is never
"corrupt" (gate 2b), and the two conditional buckets are simply absent.
Proceed through the **full lifecycle** (checkpoint → mark-processed → PR →
backfill): the retros are still consumed (else they would be re-harvested
forever) and the health snapshot still accrues as corpus. The only difference
is there are no bucket files and no downstream producer hand-off; the README
index row's outcome is `health-only` (it opened a PR — **not** a no-op). (A run
that opens *no* PR at all is the distinct **zero-retros** Discovery case, not
this one.)

Format the written files (the formatter from MATERIA.md § Gate's lint row, scoped to exactly the
files written — see rendering.md § Common rules), then stage everything plus
the README seed/row in **one atomic triage commit**:

```
triage-retros(plan): triage N retros into project signal
```

A failed artifact write halts **before** this commit — nothing lands, and
re-invocation starts fresh.

## Checkpoint

The only interactive seam after invocation. After the triage commit is pushed,
print the checkpoint prompt below, then **end the turn** — no further tool
calls. The operator's next message re-invokes the skill; gate Step 2c routes
it back here, and the message is classified as approve or feedback. There is
no timeout and no reminder — the run sits on the pushed branch indefinitely
and resumes cleanly in any future session.

### Checkpoint prompt (verbatim)

Values fill from the in-memory synthesis result on the **first** emission. On
a **2c resume** (a later turn — the in-memory result is gone), re-derive them
from the committed artifacts instead: counts and titles from
`product-suggestions.md` / `bug-reports.md` (absent → 0), and the
`retros_consumed` split (`<n> (<S> spec, <B> bug)`) / `blocker_rate` from
`pipeline-health.md`'s frontmatter.

```
─────────────────────────────────────────────────────────────────────
Retro triage ready for review.

  Folder:      docs/specs/_improvements/<dated-slug>/
  Branch:      chore/triage-retros-<dated-slug> (committed + pushed)

Triaged <retros_consumed.length> retros (<S> spec run, <B> bug run):
  Product suggestions: <suggestions.length>
    S1  <suggestion title>
    S2  <suggestion title>
    …
  Bugs gathered: <bugs.length>
    B1 [<severity>]  <bug title>
    …
  Pipeline health: pipeline-health.md emitted (blocker rate <blocker_rate>).

Files this run: product-suggestions.md (iff any suggestions) · bug-reports.md
(iff any bugs — run /materia-bugs-to-reports to file them) · pipeline-health.md
(always). Zero suggestions + zero bugs is a valid health-only run.

Reply 'proceed' to accept, or paste any notes / changes you want folded into
the suggestions or bug reports before the retros are marked processed and the
PR is opened. (No timeout — the run pauses until you reply.)
─────────────────────────────────────────────────────────────────────
```

After the prompt, the final sentence of the turn is verbatim:

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
`bug-reports.md` as items move). **When a round changes the suggestion/bug
counts (or flips the run between health-only and captured), also re-derive
`pipeline-health.md`'s bucket-derived parts** — its `triage_conversion`
frontmatter, its `## Triage conversion` count bullets, and its
`summary_paragraph` — so the on-disk PR seed PR-open re-reads stays truthful
(the retro-derived health stats stay fixed; see rendering.md § Fold-feedback
edit rules for the exact fixed-vs-re-derived split). A round that flips the run
between health-only and captured also updates the run's outcome cell in the
`docs/specs/_improvements/README.md` index. Then: format the edited artifacts
(**including `pipeline-health.md` when it was re-derived**) and
commit them all in one `triage-retros(plan): fold operator feedback (round N)`
commit (count rounds via
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
processed_on: <ISO date>  ·  processed_by: docs/specs/_improvements/<dated-slug>/pipeline-health.md  ·  pr: <filled by finalize>
```

(`<filled by finalize>` is the literal placeholder in the footer format — see
`resources/rendering.md` § Placeholder convention; the backfill step rewrites
it. `processed_by` points at the run's always-present `pipeline-health.md`.)

All renames + footers land in **one commit**: `triage-retros(retros): mark N
retros processed`. Then push. If a `git mv` fails (target exists), halt
naming the path — the operator resolves and re-invokes; gate 2c resumes at
the Checkpoint, and a fresh `proceed` re-runs this phase.

## Scope guard

This skill writes a small fixed set of paths and **never edits pipeline
skills or product source** — it only captures signal into hand-off
artifacts. Before opening the PR, sweep `git diff --name-only main...HEAD`;
every path must match one of:

```
^docs/specs/_improvements/<DATED_SLUG>/.*$        # the run's triage folder
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

Exactly one PR against `main`, its body closing with the Materia sigil
naming `materia-triage-retros` as the caster (`docs/standards/skills.md`
§ PR attribution — the Materia sigil). No `--draft`, no auto-merge — the operator
merges after review. **Tooling:** `gh pr create` locally; in the remote
environment (no `gh` CLI) use the GitHub MCP `create_pull_request` with the
same base/head/title/body. Everything else is tool-agnostic.

Because the checkpoint ended the turn, PR-open runs on a later resume turn
(gate 2d) where the in-memory synthesis result is gone. **Source the title and
body only from committed on-disk files**, never from an in-memory value:

- **Body:** built from the committed `pipeline-health.md` — its summary
  paragraph (the batch in the orchestrator's voice) and frontmatter counts —
  plus what landed on disk: suggestions captured (→ `product-suggestions.md`
  when present, run `/materia-suggestions-to-specs`), bugs gathered (→
  `bug-reports.md` when present, run `/materia-bugs-to-reports`), and the
  `pipeline-health.md` rollup itself. A health-only run (neither bucket file
  present) says so plainly. Close with the repo's standard `🤖 Generated with
  [Claude Code](https://claude.com/claude-code)` footer.
- **Title:** `triage-retros: ` + the first clause of `pipeline-health.md`'s
  summary paragraph (before the first period), truncated at a word boundary to
  <70 chars total with a trailing `…` if truncated.

On failure (auth, protections, network): halt with the error — branch and
commits are intact and pushed; the next invocation resumes at gate 2d and
re-runs only this step.

On success, print the final Done block — PR URL, run folder, retros consumed
(spec/bug split), suggestions captured, bugs gathered, whether the run was
health-only (`pipeline-health.md` the sole artifact), commit count — and
remind: human review merges the PR; captured suggestions await
`/materia-suggestions-to-specs`; gathered bugs await
`/materia-bugs-to-reports`. Then continue to **PR-URL backfill** in the same
turn.

## PR-URL backfill

Replace every placeholder with the literal PR URL:

- `<filled by finalize>` — in every `retro.processed.md` footer on the branch
  (both `docs/specs/**` and `docs/bugs/**`).
- `<filled by PR open>` — in the current run's row in
  `docs/specs/_improvements/README.md`.

Then land the backfill and push:

```bash
git add docs/specs/**/retro.processed.md docs/bugs/**/retro.processed.md \
        docs/specs/_improvements/README.md
git commit -m "triage-retros: backfill PR URL"
git push
```

The backfill lands as a **follow-up commit — no amend, no force-push** (the
shipped permission rules deny force spellings; see design-notes for why this
is consistent
with the repo's force-push rule). After backfill the branch history reads:
triage commit → fold-feedback ×N → mark-processed → backfill (PR URL). Gate
2f matches on any later invocation.
