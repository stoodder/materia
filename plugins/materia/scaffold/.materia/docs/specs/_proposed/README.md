# Proposed specs

A **shared intake surface** for feature/work proposals from any source. Each
file is a self-contained, well-formed product spec waiting on operator review.
The directory is **source-agnostic** and **transient** — it is a live queue, not
an archive.

This document defines the contract. Any producer that drops a file here MUST
follow it; any consumer that reads from here MAY rely on it.

## What lives here

One file per proposed spec, with a YAML frontmatter block carrying
source-agnostic metadata followed by the spec body in the exact format
[`intake-spec`](../_templates/spec.md) produces (and that `ship-spec` accepts as
input). The body is the **product spec itself**, not a summary; a reviewer
should be able to read a file end-to-end and either run it through `ship-spec`
or delete it without consulting any other artifact.

```
.materia/docs/specs/_proposed/
  README.md            ← this file (the contract)
  <YYYY-MM-DD-HHMMSS-id-slug>.md         ← top-level files = pending proposals
  …
```

**Convention.** Top-level files in this directory are **proposals** subject to
the transient-queue lifecycle below. Any underscore-prefixed subdirectory a
future producer drops here is **producer bookkeeping** and not part of the
queue. Consumers MUST scan only the top level (`.materia/docs/specs/_proposed/*.md`)
when looking for pending proposals; they MUST NOT recurse.

## Frontmatter contract

Every proposal file starts with this YAML block. Fields are required unless
marked optional. Consumers MUST treat unknown fields as informational and not
hard-fail on them.

```yaml
---
id: <stable opaque identifier>           # source of truth for identity (see below)
schema_version: 3                        # informational; bump on shape change
source: <producer key>                   # which loop produced it; lowercase kebab
source_refs:                             # provenance pointers back to the producer's input
  - <repo-root-relative path or URL>
  - …
title: <short human-readable title>      # one line; matches the spec body's H1
date: <YYYY-MM-DD>                       # the date the proposal was drafted
status: proposed                         # always literally `proposed` while in this directory
# surfaces: [ui]                          # OPTIONAL — see Field roles below
# design_gate: off                        # OPTIONAL — override the design-gate default (see Field roles below)
---
```

### Field roles

- **`id`** — the canonical unique key for this proposal. The **source of
  truth for identity**; consumers reference proposals by `id`, never by
  filename. Once issued, an `id` is immutable for the life of the proposal.
  Format: a 6-character base36 (lowercase a–z and 0–9) token
  (`LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`) freshly
  generated per proposal — **the same shape as the `<rand>` token used in
  spec folder names under `.materia/docs/specs/` and in the `_proposed/`
  proposed-spec filenames**, so the proposed-spec filename pattern
  matches them. Treat `id` as opaque — do not parse it. Legacy 5-char hex
  ids remain valid — id resolution is format-agnostic.
- **`schema_version`** — informational version of this frontmatter shape.
  Bump when the contract changes; the current version is **3**. The bump to
  3 is purely additive — the optional `design_gate:` field — so
  `schema_version: 1`/`2` proposals (with no `design_gate:` key, and no
  `surfaces:` key for `1`) remain fully valid. Consumers SHOULD record an
  unrecognised `schema_version` and degrade rather than halt, in both
  directions: an old consumer seeing `3` and a new consumer seeing `1` or `2`
  both keep working.
- **`source`** — short kebab-case identifier of the producing loop. Examples:
  `retro-triage`, `market-research`, `user-feedback`, `manual`. New
  sources are added by convention; no enum is enforced.
- **`source_refs`** — list of strings (repo-root-relative paths or URLs)
  pointing back at the producer's input artifact(s) so a reviewer can trace
  the proposal to its evidence. At least one entry SHOULD be present;
  producers without a meaningful pointer (e.g. operator-typed proposals) MAY
  write a single human-readable string explaining the origin.
- **`title`** — one-line human-readable title. SHOULD match the spec body's
  H1. Used in indexes and PR descriptions.
- **`date`** — ISO date (`YYYY-MM-DD`) the proposal was drafted. Drives the
  date part of the filename prefix (the `HHMMSS` time part is minted at
  write time, not stored in frontmatter).
- **`status`** — always literally `proposed` while the file lives here. The
  field exists for forward-compat with possible workflow states (`triaged`,
  `accepted`, `rejected`) but in v1 the only terminal states are
  **acted-upon** (file removed by `ship-spec` consumption) and **rejected**
  (file deleted manually). The directory holds only `status: proposed`.
- **`surfaces`** *(optional)* — the product surfaces this proposal is
  expected to touch. Optional and additive: a proposal MAY omit it entirely.
  - **Value** — a YAML flow list: `[ui]`, `[ui, data]`, or the empty list
    `[]`. The list form lets a consumer tell a present-but-empty `[]` apart
    from a missing key.
  - **Vocabulary** — list elements are drawn from a fixed set: `ui` and
    `data`, derived from the two diff classifiers in `MATERIA.md § Surface
    gates` (UI-affecting and Data-affecting). New elements are added only when
    a downstream consumer exists to read them.
  - **Semantics** — **absent means "unknown"** (the producer did not
    declare), **not "none"**; `surfaces: []` means "none" — a declared
    absence of any surface.
  - **Design-bearing** — today `ui` is the only *design-bearing* surface: the
    surface class that carries a UX design (the design / ui-test-plan stages).
    Consumers that gate design work resolve the phrase "the declared surfaces
    include a design-bearing surface" against this definition. A declared
    value is triage input to those consumers, **not a redefinition of any
    consumer's own gate** — e.g. `ship-spec`'s § UI-surface gate stays the
    single canonical definition of "UI-affecting" and consults a declared
    value only in its predictive (pre-implementation) form; its
    post-implementation diff form still governs and catches a declared-vs-built
    mismatch.
  - **Two namesakes** — this field is unrelated to the release ledger's
    `Change.surfaces` array (the five machine tokens
    `scaffold`/`ledger`/`validator`/`doctor`/`migrate`) — nothing shared but
    the word; and "design-bearing surface" here is distinct from
    `MATERIA.md § Design tool` (the MCP design-tool capability seam).
- **`design_gate`** *(optional)* — `on | off`. **Absent means "unset"** — it
  falls through to the next rung of the precedence chain, `MATERIA.md`
  § Design tool's Design gate default. Operator-owned: producers do not emit
  this field. Captured by `ship-spec` at stake time: a declared value is
  recorded into `STATUS.md` § Notes as the pinned
  `design-gate: <on|off> (proposal frontmatter)` line — durable through
  dequeue, like `Surfaces:` — and consumed at gate arrival per the
  precedence chain. `off` means the design gate auto-approves with
  reason `proposal frontmatter design_gate: off` — a recorded decision, not
  a skipped step. Normative gate semantics: `ship-spec/SKILL.md`
  § Design gate.

## Filename pattern

Files are named:

```
<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md
```

This matches the **`<yyyy-mm-dd-hhmmss>-<rand>-<slug>` convention** used by
spec folders under `.materia/docs/specs/` — the `id` and the `<rand>` token are
the same shape (a 6-character base36 token) and serve the same
role: a chronologically-sortable, globally-unique disambiguator.

- `<YYYY-MM-DD-HHMMSS>` — the creation timestamp, UTC: the date part
  matches the frontmatter `date`; the time part is minted at write time
  (`date -u +%Y-%m-%d-%H%M%S`) so queue files `ls`-sort in creation order.
- `<id>` — the frontmatter `id` (6-char base36; the same shape as
  `<rand>` in spec folder names and `_proposed/` proposal filenames).
- `<slug>` — a short kebab-case rendering of the title; see § Kebab-slug
  derivation below for the normative algorithm both producers and
  consumers MUST use.

The frontmatter `source` field is **not** part of the filename. It lives
in the YAML block only, queried at parse time. This keeps the filename
shape aligned with spec folder names; the source is still
discoverable for any consumer that opens the file.

### Kebab-slug derivation

Both producers (when writing the filename) and consumers (when re-deriving
the spec-folder slug at intake time) MUST use this exact algorithm so the
filename slug and any downstream slug agree:

1. Lowercase the title.
2. Replace every run of non-alphanumeric characters with a single `-`.
3. Trim leading and trailing `-`.
4. Drop English stopwords from the start and end only (`a`, `an`, `the`,
   `for`, `and`, `or`, `to`, `of`, `in`, `on`, `with`).
5. Cap to the first **six** kebab segments. If a cap drops a segment,
   leave no trailing `-`.

Examples:

| Title | Slug |
|---|---|
| `Undo action is one tap too deep on mobile` | `undo-action-is-one-tap` |
| `Remove dead runtimeConfig.public.appName` | `remove-dead-runtime-config-public-app` |
| `Export CSV (chart data)` | `export-csv-chart-data` |

### Filename examples

```
2026-06-14-084112-a91c2m-undo-action-is-one-tap.md
2026-06-14-160940-7b30dx-remove-dead-runtime-config-public-app.md
2026-06-21-113059-9c4f1q-export-csv-chart-data.md
```

Notice how each filename mirrors the shape of a spec folder name like
`2026-06-13-142530-ab24f9-csv-export` — the same `<date-time>-<rand>-<slug>` triad,
just with a `.md` suffix on a file rather than a `/` on a directory.

The filename is a **convenience for humans and `ls` ordering only**.
**Logic MUST read the frontmatter**, never parse the filename. Two
consequences:

- A producer that needs to write a proposal with no meaningful `<slug>` (e.g.
  the title is empty) MAY use a placeholder slug; consumers don't care.
- Renaming a file on disk does not change its identity. The `id` does.

## Body format

After the closing `---` of the frontmatter, the file body is a complete spec
in the format `intake-spec` produces — see
[`../_templates/spec.md`](../_templates/spec.md) for the shape. Required
sections, in order:

```markdown
# <Title> — spec

> One sentence: what this delivers and for whom.

## Problem

## Goals

## Non-goals

## Users & context

## User stories & acceptance criteria

- [ ] **Story:** …
  - **Accept:** …

## Constraints

## Open questions
```

Producers SHOULD fill every section with at least a placeholder line; an
empty section is a signal to the reviewer that more thought is needed.
**Genuinely deferred** items belong under "Open questions" — that's the
section `intake-spec` re-reads when the operator runs the proposal forward.

The body **MUST NOT** repeat metadata that already lives in the frontmatter
(no second `id:` line, no separate `Source:` heading). Frontmatter and body
are kept distinct so consumers can strip the frontmatter without touching
the body.

## Lifecycle

The directory is a **transient queue**:

1. A producer writes a new proposal file with `status: proposed`.
2. An operator reviews the file in place. They either:
   - **Accept** — run the proposal through `ship-spec`. `ship-spec` reads
     the selected file (resolved by frontmatter `id`, not filename),
     strips the leading YAML frontmatter block, mints a `<dated-slug>`,
     and feeds the body into its existing intake → design → architecture
     → tasks → implement → finalize pipeline. `finalize` includes the
     proposal's `git rm` in the same PR it opens, so an accepted proposal
     exits the queue when the PR merges.
   - **Reject** — delete the file manually (e.g. `rm` or via a follow-up
     PR). No state is persisted; rejected proposals leave no trace except
     in git history.
3. Either terminal state removes the file from this directory. The
   directory trends toward empty.

If `ship-spec` halts mid-run (Blocker, session crash, abort), the proposal
file stays in `_proposed/` — the `git rm` only lands at `finalize` time.
The next `ship-spec` invocation detects the in-flight pick via the spec
folder's `STATUS.md` `## Provenance` block and resumes that run rather
than re-presenting the proposal in the menu.

Because the directory is transient, **it is NOT an archive** and consumers
SHOULD NOT mine it for historical data. A producer that wants an audit
trail of what it has proposed keeps its own log alongside its input
artifacts (e.g. the renamed `retro.processed.md` captures the
`retro-triage` producer leaves beside its consumed retros).

## Producer responsibilities

A new producer joining the surface MUST:

- Generate a fresh `id` per proposal (never reuse).
- Emit valid frontmatter per the contract above.
- Write the body in the spec-template format. Self-contained, actionable,
  scoped to a single shippable unit of work (roughly one reasonable PR's
  worth).
- Carry traceability via `source_refs` so a reviewer can find the evidence.
- Not duplicate a proposal already in the directory or recently shipped
  (de-duplication is the producer's responsibility, not the directory's).

A producer MUST NOT:

- Read or modify files written by another producer.
- Rely on the filename for identity (use `id`).
- Embed pipeline-specific metadata in the body (frontmatter only).
- Promote out-of-scope or speculative items — favor a smaller, clearer set.

## Consumer responsibilities

A consumer (the operator triaging via the menu; `ship-spec` reading the
folder directly) MUST:

- Read frontmatter to discover identity, source, and provenance. Filename
  is decorative.
- Strip the frontmatter before passing the body to anything that expects
  the bare spec format. Use a precise YAML-block strip: optionally skip a
  UTF-8 BOM, opener `^---\r?\n` at line 1, closer `^---\r?\n` on its own
  line. A body that contains literal `---` is safe because the parser only
  matches line-anchored delimiters.
- Resolve a selection by frontmatter `id`, never by filename. If multiple
  proposals share a derived spec-folder slug, `ship-spec`'s resume gate
  breaks the tie by matching `Proposed-id:` from `STATUS.md` — id match
  wins, slug match alone never does.
- Remove the file from the directory at the terminal state. Leaving an
  acted-upon proposal in the directory breaks the queue's transient
  guarantee.

## Producers in this repo

| Source key | Skill | Input(s) it consumes |
|---|---|---|
| `retro-triage` | `triage-retros` | Unprocessed `retro.md` captures under `.materia/docs/specs/**` and `.materia/docs/bugs/**` from ship-spec / fix-bug runs; clustered in-memory into proposed specs (product improvements), de-duplicated against the pending queue + recent merge log, then written on approve (defects go to the sibling `.materia/docs/bugs/_reports/` queue in the same run) |
| `user-proposed` | `propose-spec` | The user's raw idea, refined via in-conversation Q&A; Q&A is in-memory, then on approve it branches, commits, and opens a PR |
| `janitor` | `janitor` | Oversized standards-drift findings from a code sweep — a conformance change too large or too behavioral to fix inline that needs a product/design decision (§ Maintainer lifecycle § Oversized findings, [`../../standards/skills.md`](../../standards/skills.md)); the bounded rest is fixed directly in the janitor's own PR, only the oversized remainder is filed here. Also a legacy key on any proposal still pending from before the maintainer retrofit. |
| `librarian` | `librarian` | Oversized documentation work from a docs sweep — doc drift too large to restructure in place (§ Maintainer lifecycle § Oversized findings, [`../../standards/skills.md`](../../standards/skills.md)). The librarian files **proposed specs only**; a normative code-vs-doc conflict stays a needs-human note, never a queue entry. |
| `epic` | `propose-epic` | The operator's large multi-spec idea, developed via iterative brainstorm + web research into an epic under [`.materia/docs/epics/`](../../epics/README.md); each member proposal carries extra `epic:` + `depends_on:` frontmatter keys and a closing `## Epic context` body section per that contract. While a member is queued, `reconcile-epic` (the same producer family; sanctioned in `.materia/docs/epics/README.md` § Who writes what) may revise its body + `depends_on` to track shipped siblings — the one exception to § Producer responsibilities' no-touch rule |

When a new producer is added, it MUST update this table with one row.
**Adding a producer row is NOT a contract change** — it is a registration
update; the contract sections above are untouched. Producer rows can ship
in the PR that introduces the new producer skill.

## Changing the contract

The frontmatter contract and the filename pattern are **shared across all
producers and consumers**. Any change here forces every producer to update
in lockstep. Flag PRs that modify this file for extra scrutiny: review them
with the same care as a change to any shared artifact contract (e.g. the
retro contract `triage-retros` parses).
