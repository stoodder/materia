---
name: report-bug
description: Take a raw bug description and produce a reproducible bug-report file in `docs/bugs/_reports/`. The skill reads project context (CLAUDE.md, docs/, surface-map) and uses sensible defaults to draft the full report in one shot, then asks the operator to confirm or adjust — minimizing the questions they have to answer. The Q&A is in-memory; once the operator confirms the draft, the skill syncs latest main, branches, writes the report file, commits, pushes, and opens a PR.
---

# report-bug — capture a bug, produce a report file

A simple, single-shot skill that turns a raw bug description into a bug-report
file in the queue at
[`docs/bugs/_reports/`](../../../docs/bugs/_reports/README.md). Conforms to the
queue's contract (frontmatter shape, filename pattern, body shape).

**Philosophy: defaults beat questions.** The operator's job is to describe the
bug; the skill's job is to flesh it out using everything it can learn from the
project — `CLAUDE.md`, `docs/glossary.md`, `docs/surface-map.md`, and the queue
contract. The operator only answers what genuinely can't be inferred. A typical
run is **one drafting turn followed by one confirmation turn** — not a
multi-round interrogation.

**Lifecycle:** interactive checkpoint · branch-at-approve — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, id minting, link integrity, one PR + tooling, no
session survival). The Q&A is in-memory — an abandoned conversation leaves no
trace; on `approve` the skill branches, writes, commits, pushes, and opens the
PR.

Read [`docs/bugs/_reports/README.md`](../../../docs/bugs/_reports/README.md)
(the queue contract) and [`docs/bugs/README.md`](../../../docs/bugs/README.md)
before changing this skill.

## Procedure

### 1. Capture the bug

Detect what the operator passed:

| Input shape | Behavior |
|---|---|
| `/report-bug <description text>` | Use the trailing text as the bug description, advance. |
| `/report-bug` (no args) + AskUserQuestion available | Ask "Describe the bug — rough notes are fine; I'll fill in the rest." |
| `/report-bug` (no args) + Auto Mode (no AskUserQuestion) | Print the same prompt and end the turn. The next user reply is the description. |

If the operator's reply is empty/whitespace, print "No bug description captured.
Re-invoke when you're ready." and end the turn.

### 2. Read project context (silently, before drafting)

Before drafting, load enough context to make confident defaults. Aim for
breadth over depth — most defaults come from a few canonical docs.

**Always read:**

- `CLAUDE.md` — the project guide. Stack, conventions, the always-loaded rules.
- `docs/glossary.md` — so you use the project's vocabulary in the report.
- `docs/surface-map.md` — surface and route names to populate "Affected surface".
- `docs/bugs/README.md` — the bugs tree overview.
- `docs/bugs/_reports/README.md` — the queue contract this report must conform to.

**Read selectively** based on the description's surface area:

- Bug touches a specific route or page? → `docs/surface-map.md` (already above).
- Bug mentions data or loading? → relevant `docs/resources/*.md`.
- Bug mentions a skill or pipeline step? → that skill's `SKILL.md`.

On a missing required doc, note it inline in the draft as a caveat — do **not**
halt.

This context-loading happens **silently** — the operator should not see a wall
of reads.

### 3. Draft the complete report in one shot

Using the captured description plus the loaded context, draft every required
section now — don't ask the operator yet. Bake in defaults aggressively wherever
the project context makes the answer obvious:

| Section | Sensible default sources |
|---|---|
| **Summary** | One sentence inferred from the description. |
| **Environment** | Node 24 · pnpm 9 · Nuxt 4 · Postgres (from `CLAUDE.md`); operator overrides for non-default envs. |
| **Steps to reproduce** | Numbered list inferred from description; `_Unknown — please clarify_` if indeterminate. |
| **Expected** | Inferred from domain knowledge + description. |
| **Actual** | Taken verbatim from description. |
| **Reproducibility** | Default `intermittent`; rate `unknown` until operator says otherwise. |
| **Severity & impact** | Default `medium` (surfaced in "Defaults I applied"). |
| **Affected surface / route / module** | Inferred from description + `docs/surface-map.md`; open question if unresolvable. |
| **Preconditions / data setup** | Inferred or `_None known._` |
| **Evidence** | Operator-pasted text/logs from description; `_None provided._` otherwise. |
| **Regression window** | `_Unknown._` unless description names a version, commit, or date. |
| **Workaround** | `_None known._` unless operator states one. |
| **Open questions** | Empty or 1–3 reproduction gaps. |

A complete draft is the goal here, not an outline. Fill every required H2
verbatim — an empty section signals to the reviewer that more detail is needed.

### 4. Overlap check (lightweight)

Glob the queue for potential duplicates:

```bash
git ls-files 'docs/bugs/_reports/*/report.md'
```

For each existing report, read frontmatter + summary. Compare to the draft. If
**nothing looks like substantive overlap**, advance silently to step 5 — don't
pester the operator with a "no overlap found" note.

If anything does overlap, fold the concern into step 5's confirmation prompt as
one item under "things to know" — don't make it a separate end-turn checkpoint.

### 5. Present the draft for confirmation

Show the operator everything in one turn:

```
─────────────────────────────────────────────────────────────────────
Drafted 1 bug report from your description + project context.

  Will be written to: docs/bugs/_reports/<dated-slug>/report.md

  <full inline body — frontmatter + all template sections>

Defaults I applied (you can override any of these):
  - Environment: Node 24, pnpm 9, Nuxt 4, Postgres (project defaults from CLAUDE.md).
  - Severity: medium (adjust if higher/lower impact).
  - Affected surface: <inferred from description or "Unknown">.
  - Reproducibility: intermittent (override if always/once).
  - <other notable assumptions — ≤5 more bullets>

Things to know:
  - Possible overlap with `<id-X>` (<title-X>) — flagged for your review.
    (Only included if step 4 surfaced a candidate.)

Questions I couldn't answer from context (≤3, optional):
  - <question 1>
  - <question 2>

Reply:
  - `approve` — write the file and open a PR.
  - `edit: <feedback>` — adjust the draft; answers to the questions above go here.
  - `cancel` — exit cleanly; no file written.
─────────────────────────────────────────────────────────────────────
```

End the turn.

**Why the "Defaults I applied" block is load-bearing.** It surfaces what the AI
assumed without asking, so the operator can spot a bad assumption in seconds
rather than having to re-read the whole report. Keep it to a short bullet list
(5–10) of the non-obvious defaults.

**Why ≤3 questions.** If the skill needs more than three things from the
operator, it hasn't used project context hard enough. Re-read `CLAUDE.md` and
the relevant standards before falling back to questions.

### 6. Fold edits, re-render, re-confirm

When the operator replies with `edit: …`, fold the feedback into the draft,
re-render, and re-emit the confirmation prompt from step 5.

This is **usually one round** because most operators will approve a
well-drafted report or have one or two edits — not a long iterative loop. There
is no hard cap, but if you find yourself on round 5+, the initial draft was
wrong and a re-draft from the new direction is probably better than incremental
edits.

### 7. Branch, write, commit, push, open PR

On `approve`, run the git workflow before writing any file. Up to this point
nothing has touched the repo; the branch is created now so an abandoned Q&A
above this step leaves no stray branch behind.

1. **Sync `main` and branch.**

   ```bash
   git checkout main && git pull
   git checkout -b report-bug/<id>-<slug>
   ```

   `<id>-<slug>` is derived from the report's frontmatter `id` and the
   kebab-slug of its title (e.g. `report-bug/3a1f2-save-button-spinner-hangs`).

   (Dirty-pull and branch-name collisions per the lifecycle.)

2. **Write the report file** with the `Write` tool to
   `docs/bugs/_reports/<dated-slug>/report.md`.

   (Id-collision handling per the lifecycle.)

3. **Verify link integrity, then commit** the report file:

   Verify link integrity per the lifecycle invariant (`pnpm run check:docs`;
   fix any links the new file introduces), then commit:

   ```bash
   git add docs/bugs/_reports/<dated-slug>/
   git commit -m "report-bug: add bug report <id>"
   ```

4. **Push** the branch:

   ```bash
   git push -u origin report-bug/<id>-<slug>
   ```

5. **Open the PR** with `gh pr create`. Title: `report-bug: <title>`.

   Body includes the rendered report inline so the reviewer can read it without
   fetching the branch, plus a closing line: "Triage with `/fix-bug <id>` once
   this PR lands."

Print the closing report:

```
Wrote 1 bug report:
  - docs/bugs/_reports/<dated-slug>/report.md  (id <id>)

Branch: report-bug/<id>-<slug>
PR:     <URL from gh pr create>

The report is queued in docs/bugs/_reports/ awaiting a fix run.
```

End the turn.

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36 token>      # LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6
schema_version: 1
source: bug-report
severity: low | medium | high | critical    # closed enum — default medium
title: <one-line title>
date: <YYYY-MM-DD>
status: reported
# source_refs:                              # OPTIONAL — evidence URLs or repo-root-relative paths
#   - <url or path>
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
`intake-spec` and `triage-retros` use for `<rand>`).

`source_refs` is **optional** for bug reports. Bug reports originate from
operator observation rather than a machine artifact, so a meaningful pointer is
often unavailable. When evidence is available (error text, log excerpts,
screenshots, a session URL), include it here so a reviewer can trace the report
to its source.

All seven frontmatter fields (`id`, `schema_version`, `source`, `severity`,
`title`, `date`, `status`) are required. `source_refs` is the only optional
field.

### Body

Always emit every required H2 verbatim and in order, even when a section is
thin. Fill every section with at least a placeholder line — an empty section
signals to the reviewer that more detail is needed.

```markdown
# <title>

## Summary

<one sentence inferred from the description>

## Environment

Node 24 · pnpm 9 · Nuxt 4 · Postgres

## Steps to reproduce

1. <step>
2. <step>

## Expected

<what should happen>

## Actual

<what actually happens — verbatim from description>

## Reproducibility

intermittent — rate unknown

## Severity & impact

medium — <one-line impact statement>

## Affected surface / route / module

<inferred from description + docs/surface-map.md, or "_Unknown — please clarify_">

## Preconditions / data setup

_None known._

## Evidence

_None provided._

## Regression window

_Unknown._

## Workaround

_None known._

## Open questions

- <reproduction gap, or omit section if none>
```

The required sections in order are: Summary · Environment · Steps to reproduce ·
Expected · Actual · Reproducibility · Severity & impact · Affected surface /
route / module · Preconditions / data setup · Evidence · Regression window ·
Workaround · Open questions. Never leave a required H2 missing.

The body **MUST NOT** repeat metadata already in the frontmatter (no second
`id:` line, no separate heading that duplicates the frontmatter `severity`).
Frontmatter and body are kept distinct so consumers can strip the frontmatter
without touching the body.

### Link paths

Use **absolute-from-repo-root** link paths in report bodies (e.g.
`docs/standards/visual-language.md`, not `../resources/today.md`). Report files
live under `docs/bugs/_reports/<dated-slug>/report.md`, but a future `/fix-bug`
run may adopt the body into `docs/bugs/<dated-slug>/` at a different folder
depth. Relative paths that resolve from `_reports/<dated-slug>/` would silently
break there; absolute paths resolve identically from both locations.

### Folder

The report lives at:

```
docs/bugs/_reports/<YYYY-MM-DD>-<id>-<slug>/report.md
```

`<slug>` is derived from the title via the **normative kebab-slug algorithm** in
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
§ Kebab-slug derivation — the same algorithm `ship-spec` uses. Do NOT invent a
different algorithm.

## Scope (what this skill does NOT do)

- Does NOT fix the bug or run any pipeline. After the PR lands, the operator
  runs `/fix-bug <id>` (proposal `5356b`) to begin a fix run.
- Does NOT branch, commit, push, or open a PR **before** the operator confirms
  the draft. The Q&A is in-memory; the git workflow only fires on `approve`
  (step 7).
- Does NOT modify the `docs/bugs/_reports/` contract README. Contract changes
  are a separate PR.
- (Session interruption per the lifecycle: re-invoke fresh.)

## Rules

- **Defaults beat questions.** Use project context aggressively. The operator
  should not feel interrogated — they brought a bug description, the skill does
  the rest.
- **One draft, one confirm.** The typical run is two turns total: the operator
  provides a description (or replies to the description prompt), and then
  approves the skill's draft.
- The renderer always emits every required H2 verbatim and in order so the
  report body matches the template exactly.
- `cancel` / `stop` exits cleanly with no file written. Silence is also fine —
  nothing lands on disk until `approve`.
