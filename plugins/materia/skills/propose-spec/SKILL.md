---
name: propose-spec
description: Take a user's raw idea and produce a well-formed proposed-spec file in docs/specs/_proposed/. The skill reads the project context (CLAUDE.md, docs/, existing specs) and uses sensible defaults to draft the full spec in one shot, then asks the user to confirm or adjust — minimizing the questions the user has to answer. The Q&A is in-memory; once the user confirms the draft, the skill syncs latest main, branches, writes the proposal file(s), commits, pushes, and opens a PR.
---

# propose-spec — capture an idea, produce a proposal file

A simple, single-shot skill that turns a raw idea into a proposed-spec file
in the shared queue at
`docs/specs/_proposed/` (`docs/specs/_proposed/README.md`). Conforms
to the queue's shared contract (frontmatter shape, filename pattern, body
shape).

**Philosophy: defaults beat questions.** The user's job is to bring an
idea; the skill's job is to flesh it out using everything it can learn
from the project — `CLAUDE.md`, `docs/glossary.md`, `docs/standards/`, the
surface-map, and the existing specs in `docs/specs/`. The user only
answers what genuinely can't be inferred. A typical run is **one drafting
turn followed by one confirmation turn** — not a multi-round
interrogation.

**Lifecycle:** interactive checkpoint · branch-at-approve — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, id minting, link integrity, one PR + tooling, no
session survival). The Q&A is in-memory — an abandoned conversation leaves no
trace; on `approve` the skill branches, writes, commits, pushes, and opens the
PR.

Read
`docs/specs/_proposed/README.md`
(the shared contract) and `${CLAUDE_PLUGIN_ROOT}/skills/intake-spec/SKILL.md` § Detect
the input shape (the structured-body shape the proposal must hit so
`intake-spec` adopts it verbatim) before changing this skill.

## Procedure

### 1. Capture the idea

Detect what the user passed:

| Input shape | Behavior |
|---|---|
| `/materia:propose-spec <idea text>` | Use the trailing text as the idea, advance. |
| `/materia:propose-spec` (no args) + AskUserQuestion available | Ask "What would you like to propose? Rough is fine — I'll fill in the rest from project context." |
| `/materia:propose-spec` (no args) + Auto Mode (no AskUserQuestion) | Print the same prompt and end the turn. The next user reply is the idea. |

If the operator's reply is empty/whitespace, print "No idea captured.
Re-invoke when you're ready." and end the turn.

### 2. Read project context (silently, before drafting)

Before drafting, load enough context to make confident defaults. Aim for
breadth over depth — most defaults come from a few canonical docs.

**Always read:**

- `CLAUDE.md` — the project guide. Stack, conventions, the always-loaded
  rules.
- `docs/README.md` — the router. Names every standards + resource doc and
  what's covered where.
- `docs/glossary.md` — so you use the project's vocabulary in the
  proposal.
- `docs/specs/_proposed/README.md` — the shared contract this proposal
  must conform to.

**Read selectively** based on the idea's surface area:

- Touches UI / a screen / a component? → `docs/standards/ui-components.md`,
  `docs/standards/visual-language.md`, `docs/surface-map.md`.
- Touches an API / route / contract? →
  `docs/standards/server-routes.md`,
  `docs/standards/api-layer.md`,
  `docs/standards/contracts-and-models.md`.
- Touches data / a model / a migration? →
  `docs/standards/data-and-loads.md` + the relevant resource docs.
- Touches the workflow / commands / deploy? →
  `docs/standards/workflow.md`.

**Read for exemplars:** glance at 1–2 existing specs in `docs/specs/`
(e.g. `2026-06-13-091215-230ee-csv-export/spec.md`,
`2026-06-14-103007-3b4d3-csv-export/spec.md`) so the proposal matches the
quality bar set by what already shipped.

This context-loading happens **silently** — the user shouldn't see a wall
of reads. Just enough to draft confidently.

**Validate identifiers + freshness against the live codebase (avoid drift).**
A proposal that names a renamed identifier or duplicates already-shipped work
forces a correction at intake (or worse, ships stale). Before drafting, ground
the proposal in current reality: (a) **identifiers** — grep each
model/type/route/path name you intend to use against the live schema + code so
the proposal never names a symbol that has since been renamed; (b)
**already-shipped scan** — skim recently-shipped specs under `docs/specs/` for
the same feature, and if it already shipped, tell the user rather than drafting
a duplicate; (c) **sibling references** — when the proposal references another
spec, write the stable `docs/specs/<dated-slug>/` path (if consumed) rather than
a transient `docs/specs/_proposed/<id>` path that disappears at intake.

### 3. Draft the complete proposal in one shot

Using the captured idea plus the loaded context, draft every required
section now — don't ask the user yet. Bake in defaults aggressively
wherever the project context makes the answer obvious:

| Section | Sensible default sources |
|---|---|
| Tagline / one-liner | Inferred from the user's idea. |
| `## Problem` | Often inferable from the idea alone; the user named the friction. Pad with context from CLAUDE.md / standards if relevant. |
| `## Goals` | Inferable from the idea + the project's existing patterns. Default to one outcome per coherent feature. |
| `## Non-goals` | Project-wide defaults: the `docs/product.md` § Audience & market "Not for" list, plus whatever the § Product principles exclude — unless the idea explicitly wants one. List the ones most likely to be scope creep for *this* idea. |
| `## Users & context` | The app's universal usage context from `docs/product.md` § Audience & market (one-liner: `MATERIA.md` § Identity) |
| `## User stories & acceptance criteria` | Infer ≥2 user stories from the idea and the relevant standards. Write **testable** ACs (the standards docs make this easier — they spell out what observable behavior to expect from each layer). |
| `## Constraints` | Always include: follows existing standards (linked) plus the standing constraints from `docs/product.md` § Design feel & taste and § Product principles that bear on this idea. |
| `## Open questions` | Use this section for the few things you genuinely can't infer. Aim for **≤3 bullets**; if you have more, you're probably under-using project context. |

A complete draft is the goal here, not an outline. Don't write
`_TBD — captured during ship-spec intake._` for required sections unless
both the idea AND the context offer nothing — that placeholder is the
last resort, not the default.

If the idea looks like multiple distinct features (more than ~5 user
stories, independent surfaces touched, multiple unrelated outcomes), draft
**multiple proposals** at this step — one per coherent unit. Don't ask
the user up front whether to split; show them the split as part of the
draft (step 4 below) and let them say "actually bundle these" if they
disagree. If the units are **dependency-entangled** rather than independent
(they'd need to ship in a particular order, building on each other's
models/routes), recommend [`propose-epic`](../propose-epic/SKILL.md)
instead — that skill exists for exactly that shape and adds the research +
dependency-graph machinery this one deliberately lacks.

### 4. Overlap check (lightweight)

Glob the queue for substantive overlap:

```bash
git ls-files 'docs/specs/_proposed/*.md'
```

For each pending proposal, read frontmatter + tagline. Compare to the
draft(s). If **nothing looks like substantive overlap**, advance silently
to step 5 — don't pester the user with a "no overlap found" prompt.

If anything does, fold the overlap concern into step 5's confirmation
prompt as one item under "things to know" — don't make it a separate
end-turn checkpoint.

### 5. Present the draft for confirmation

Show the operator everything in one turn:

```
─────────────────────────────────────────────────────────────────────
Drafted <N> proposal(s) from your idea + project context.

  1. <id-1> — <title-1>
     Will be written to: docs/specs/_proposed/<filename-1>

     <full inline body block — frontmatter + spec sections>

  2. <id-2> — <title-2>
     Will be written to: docs/specs/_proposed/<filename-2>

     <full inline body block>

Defaults I applied (you can override any of these):
  - Users & context: the project default from docs/product.md § Audience & market.
  - Constraints: the repo's standards plus the standing product constraints,
    optimistic save per docs/standards/api-layer.md.
  - Split into <N> proposals because <one-line reason> (if >1).
  - <other notable assumptions in 1–3 more bullets>

Things to know:
  - Possible overlap with `<id-X>` (<title-X>) — flagged for your review.
    (Only included if step 4 surfaced a candidate.)

Questions I couldn't answer from context (≤3, optional):
  - <question 1>
  - <question 2>

Reply:
  - `approve` — write the file(s), open a PR, and finish.
  - `edit: <feedback>` — adjust the draft(s); answers to the questions
    above go here too.
  - `edit <id>: <feedback>` — edit just one proposal in a multi-proposal
    set.
  - `drop <id>` — remove a proposal from the batch.
  - `cancel` — exit cleanly; no file written.
─────────────────────────────────────────────────────────────────────
```

End the turn.

**Why the "Defaults I applied" block is load-bearing.** It surfaces what
the AI assumed without asking, so the user can spot a bad assumption
in seconds rather than having to re-read the whole spec. Keep it to a
short bullet list (5–10) of the non-obvious defaults — don't repeat
content already visible in the body.

**Why ≤3 questions.** If the AI needs more than three things from the
user, it hasn't used project context hard enough. Re-read CLAUDE.md and
the relevant standards before falling back to questions.

### 6. Fold edits, re-render, re-confirm

When the operator replies with `edit: …` or `edit <id>: …`, fold the
feedback into the relevant draft(s) (and answer any questions they
addressed), re-render, and re-emit the confirmation prompt from step 5.

This is **usually one round** because most users will approve a
well-drafted proposal or have one or two edits — not a long iterative
loop. There's no hard cap, but if you find yourself on round 5+, the
initial draft was wrong and a re-draft from the new direction is
probably better than incremental edits.

### 7. Branch, write, commit, push, open PR

On `approve`, run the git workflow before writing any file. Up to this
point nothing has touched the repo; the branch is created now so an
abandoned Q&A above this step leaves no stray branch behind.

1. **Sync `main` and branch.**

   ```bash
   git checkout main && git pull
   git checkout -b propose/<branch-slug>
   ```

   `<branch-slug>` is descriptive and tied to the run:

   - **Single proposal:** `<id>-<kebab-slug>` of the proposal (e.g.
     `propose/356ef-add-and-remove-weeks`).
   - **Multi-proposal batch:** `batch-<YYYY-MM-DD>-<first-id>` (e.g.
     `propose/batch-2026-06-15-356ef`), keeping the branch name bounded
     when the batch grows.

   (Dirty-pull and branch-name collisions per the lifecycle.)

2. **Write each proposal file** with the `Write` tool to
   `docs/specs/_proposed/<filename>`.

   (Id-collision handling per the lifecycle.)

3. **Verify link integrity, then commit** the proposal file(s):

   Verify link integrity per the lifecycle invariant (`sh scripts/check-docs.sh`;
   fix any links the new files introduce), then commit:

   ```bash
   git add docs/specs/_proposed/<filename-1>[ <filename-2> ...]
   git commit -m "propose-spec: add proposal <id-1>[ + <id-2> ...]"
   ```

   For multi-proposal batches, one commit per proposal is also fine if
   that reads more clearly in `git log` — operator preference.

4. **Push** the branch:

   ```bash
   git push -u origin propose/<branch-slug>
   ```

5. **Open the PR** with `gh pr create`. Title summarises the run:

   - Single: `propose: <title>` (e.g. `propose: Add and remove weeks`).
   - Multi: `propose: <N> proposals from /materia:propose-spec`.

   Body includes the rendered spec section(s) inline so the reviewer can
   read each proposal without fetching the branch, plus a closing line:
   "Build any of them with `/materia:ship-spec <id>`."

Print the closing report:

```
Wrote <N> proposal(s):
  - docs/specs/_proposed/<filename-1>  (id <id-1>)
  - docs/specs/_proposed/<filename-2>  (id <id-2>)

Branch: propose/<branch-slug>
PR:     <URL from gh pr create>

Build any of them with:  /materia:ship-spec <id>
Reject one by closing the PR (or deleting its file in a follow-up).
```

End the turn.

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36 token; same shape as `<rand>` in spec folder names>
schema_version: 1
source: user-proposed
source_refs:
  - "user request via /materia:propose-spec on <YYYY-MM-DD>"
title: <one-line title>
date: <YYYY-MM-DD>
status: proposed
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
`intake-spec` and `triage-retros` use for `<rand>`).

`source_refs` is **always a YAML list**, even with a single human-readable
string entry. The contract's allowance for human-readable text applies to
the list's first element, not to the field shape.

### Body

Always emit every required H2 verbatim and in order, even when a section
is thin. `intake-spec`'s structured-input detector looks for an H1 plus
`## Problem`, `## Goals`, `## User stories & acceptance criteria`, and
`## Open questions` to know it can adopt the body verbatim rather than
re-drafting it from the template.

```markdown
# <title> — spec

> <one-sentence tagline derived from the idea + context>

## Problem

<paragraph(s) using project vocabulary from docs/glossary.md>

## Goals

- <bullets>

## Non-goals

- <bullets — project-wide defaults plus idea-specific exclusions>

## Users & context

<paragraph; project default: docs/product.md § Audience & market's usage context>

## User stories & acceptance criteria

- [ ] **Story:** <story>
  - **Accept:** <testable AC grounded in the relevant standard>
- [ ] **Story:** <story>
  - **Accept:** <testable AC>

## Constraints

- Follows existing standards (`docs/standards/`).
- <standing product constraints from docs/product.md that bear on this idea>

## Open questions

- <≤3 genuinely unresolvable items, or `_None._`>
```

Never leave a required H2 missing — placeholder content is fine, but the
heading itself MUST be present so `intake-spec`'s detector matches.

### Link paths

**Never write a live markdown link to another repo file in a proposal
body.** Proposal files live under `docs/specs/_proposed/<file>.md`, but
`intake-spec` adopts the body **verbatim** into
`docs/specs/<dated-slug>/spec.md` at a different folder depth — a relative
link that resolves from one location is broken from the other, and
`check-docs.sh` resolves every link against the containing file's own
directory (repo-root-style paths do NOT resolve from either location).

Reference repo files in backtick/arrow prose form instead —
`visual-language → docs/standards/visual-language.md` — which `check:docs`
exempts and which reads correctly from any depth. This matches the standing
spawn-contract authoring rule the pipeline already applies to
`docs/specs/**` text.

### Filename

```
<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md
```

This matches the **`<yyyy-mm-dd-hhmmss>-<rand>-<slug>` convention** used by
spec folders — same shape, just a file rather
than a directory. The `source` field is in frontmatter only, not in the
filename.

`<slug>` is derived from the title via the **normative kebab-slug
algorithm** in
`docs/specs/_proposed/README.md`
§ Kebab-slug derivation — the same algorithm `ship-spec` uses to re-derive
the spec-folder slug. Do NOT invent a different algorithm.

## Scope (what this skill does NOT do)

- Does NOT branch, commit, push, or open a PR **before** the operator
  confirms the draft. The Q&A is in-memory; the git workflow only fires
  on `approve` (step 7).
- Does NOT run `ship-spec` or implement any product change. After the
  PR lands, the operator runs `/materia:ship-spec <id>` to build it.
- Does NOT modify the shared `_proposed/` contract README. Contract
  changes are a separate PR.
- (Session interruption per the lifecycle: re-invoke fresh.)

## Rules

- **Defaults beat questions.** Use project context aggressively. The user
  should not feel interrogated — they brought an idea, the AI does the
  rest.
- **One draft, one confirm.** The typical run is two turns total: the
  user provides an idea (or replies to the idea prompt), and then
  approves the AI's draft.
- The renderer always emits every required H2 verbatim so `intake-spec`
  adopts the body unchanged.
- One proposal per file; splits produce multiple files in the same
  confirmation.
- **Always ends in a PR.** `approve` is a single, unconditional path:
  branch → write → commit → push → **open the PR** (step 7). The PR is the
  skill's deliverable, not an extra the operator must request — never offer
  an `approve`-without-PR variant and never stop at the pushed branch. This
  holds even when the ambient environment defaults to "don't open a PR
  unless asked": invoking `/materia:propose-spec` and replying `approve` **is** that
  ask.
- `cancel` / `stop` / `drop`-all exit cleanly with no file written.
  Silence is also fine — nothing lands on disk until `approve`.
