---
name: materia-docs-sync
description: Reconcile docs with the branch's aggregate code changes before the PR — apply docs/contributing.md touch-X→update-Y to the whole diff, edit stale resource/standards docs (intent-oracle rules), update cross-cutting docs (CLAUDE.md, README index, surface-map, glossary), with every edit written to docs/standards/docs.md (present-state, one home per fact) and gated by `node scripts/check-docs.mjs` before commit, then hand off to the sibling `materia-docs-audit` stage. Invoked by `materia-ship-spec` as its own pipeline stage (after review, paired with the sibling `materia-docs-audit` stage, before finalize); usable standalone after a hotfix.
---

# materia-docs-sync — reconcile docs to the final branch state

Per-task implementation already updates the **directly-touched** resource and
standards docs. `materia-docs-sync` runs once at the end of the branch to (a) catch
cross-task drift (Task N invalidates a doc Task N-1 wrote), (b) update the
**cross-cutting** docs that are deliberately deferred from per-task scope
(CLAUDE.md, `docs/README.md` index, `docs/surface-map.md`, `docs/glossary.md`),
and (c) audit doc accuracy from fresh context before the PR.

Runs as a **fresh-context subagent** spawned by `materia-ship-spec` as its own pipeline
stage (after the review pass, paired with the sibling `materia-docs-audit` stage, before
finalize). Usable standalone after a hotfix if docs slip.

## Inputs

- The full branch diff vs `main` (`git diff main...HEAD`).
- `docs/specs/<dated-slug>/spec.md` + `architecture.md` (intent oracles).
- `docs/contributing.md` (the **touch-X→update-Y** map — the authoritative
  definition of what "docs" means for a given change).
- `docs/standards/docs.md` (the **authoring standard** — every edit this
  skill writes must follow it; see § Authoring rules).
- The current `docs/**` tree (read it as it stands on the branch).

**Fresh-context exclusion list — do NOT read:**

- The implementer's commit messages on the branch.
- `STATUS.md` (the resume state). Read your own inputs and run; the orchestrator
  ticks STATUS for you.
- `.claude/review-logs/**` (gitignored anyway; never read it).

## Authoring rules — how every edit is written

The docs are agent context; `docs/standards/docs.md` is binding for every
line this skill writes. This skill is the main pressure point: docs written
change-by-change accrete history unless each pass folds its change into the
present-state description.

- **Fold, never append.** Rewrite the sentence/cell/bullet so it describes
  the current state. Never append a delta on top of the old text ("now also
  supports…", "gained a prop", "(modified)", "renamed from…", "replaces the
  removed…"). If your edit makes a section read like a change log, rewrite
  the section.
- **No pipeline residue.** No spec-run markers ("LOCKED per spec …", "new —",
  "left untouched to bound the diff"). State the invariant; link the spec
  folder only when it genuinely aids a future reader.
- **Tables index, bullets explain.** A table cell holds a name plus one–two
  short sentences; anything longer moves to a bullet list below the table
  with the cell reading "details below". Never grow an existing cell past
  that.
- **One home per fact.** Before restating a fact in a second doc, link to
  the doc that owns it (ownership map: `docs/standards/docs.md`
  § Ownership map).
- **Glossary entries are one line** (one sentence + Detail link), inserted at
  the term's alphabetical position.

`node scripts/check-docs.mjs` mechanically enforces the checkable subset (narration
phrases, >600-char lines, duplicated long lines, glossary order, links,
`#anchor` fragments) over CLAUDE.md + docs root + `resources/` +
`standards/` + `_templates/` (links also across `docs/**` +
`.claude/skills/**`) — run it before committing (Procedure step 6). The rules
above are broader than the checker; passing it is necessary, not sufficient.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- Doc edits committed and pushed in one `docs(<slug>):` commit (or a small
  series if changes are large), with the doc-change summary (silent-oracle list
  + matrix coverage) in the commit body.
- A `docs-sync:` sub-row added to `STATUS.md` (round count + change summary) by
  the orchestrator after this subagent returns.
- Or, if intent-oracle rules detect a regression vs explicit intent, a
  `Blocker` written to STATUS and the run paused for the human.

## Recommended tier

`sonnet/medium` — see `MATERIA.md` § Tiers for the model and effort definitions. Auditing docs against intent oracles and applying the touch-X→update-Y map is systematic synthesis; the scope is bounded by cross-cutting doc boundaries.

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`.claude/skills/materia-ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

1. **Build the required-updates matrix.** Enumerate every file changed on the
   branch. For each, apply `docs/contributing.md`'s touch-X→update-Y rows to
   produce the matrix `{changed_file → [docs that must reflect it]}`.

   **Widened-enum / closed-set scan.** When the branch widens an enum or
   extends a closed set (e.g. `WeekDay` from `Mon|Tue|Wed` to all seven
   days; a status enum from `pending|done` to `pending|in-progress|done`),
   grep `docs/**` for the pre-widening literal token-set — both the
   member names themselves AND any derived phrasings (e.g. `Mon/Tue/Wed`,
   `W1 Mon → W8 Wed`, `three program days`). Inline annotations that
   name the old set don't appear in the touch-X→update-Y map (the
   standards doc for the enum is named, but incidental prose mentions
   in unrelated resource docs are not), and the audit reviewer surfaces
   them as round-2 findings if round 1 misses them. Add each surfaced
   doc to the required-updates matrix with a corrective note ("widen
   prose to match new enum membership"). One-pass grep at the start
   of docs-sync is cheap insurance.

   **Docs-wide sweep safety — exclude `docs/specs/**`.** Any docs-wide glob or
   token replacement (the widened-enum grep above, a vocabulary rename sweep)
   must **exclude `docs/specs/**`** — git fnmatch lets `*` cross `/`, so
   `git ls-files 'docs/*.md'` / `'docs/**/*.md'` silently match historical spec
   artifacts and the in-flight run's own mapping tables, and a blind
   replacement clobbers them (e.g. turning a `Old → New` rename table into
   `New → New`). Always scope the sweep with an explicit `:(exclude)docs/specs/**`
   pathspec (e.g. `git ls-files 'docs/**/*.md' ':(exclude)docs/specs/**'`) or an
   enumerated live-docs file list. docs-sync reconciles **live** docs
   (`CLAUDE.md`, `docs/README.md`, `docs/standards/*`, `docs/resources/*`,
   `docs/glossary.md`, `docs/surface-map.md`), never spec snapshots.

   **Recurring coverage gaps — a mandatory self-verify gate, not a sample.**
   Four distinct misses recur across runs. Run all four checks in full on
   every sync round — they are mechanical, so they sit outside the sampled
   accuracy pass; run them even when the explicit worklist looks complete,
   and treat a skipped check as a defect, not a sampling decision. Fold each
   into the matrix:

   1. **Refactored helper → update its code examples.** When a named helper is
      *refactored* (a signature or behavior change, not just an added field),
      update the **code examples** that show it in the standards/resource docs —
      not only the field tables.
   2. **`types/index.ts` barrel ↔ type-coverage tables.** Cross-check the
      `types/index.ts` barrel against the type-coverage tables so a
      `types/ui|api/` file the barrel re-exports isn't omitted from the tables.
   3. **Advance the `docs/specs/README.md` index Stage column in round 1.** Tick
      the run's Index Stage column to `implement ✓ → docs-sync` in **round 1**,
      not as an afterthought a later round has to backfill.
   4. **Code-comment rationale ↔ resource prose.** When a code-comment rationale
      changes, diff it against the matching resource-doc prose and update the
      prose so the two agree.

   **End-of-round-1 self-verify.** Before closing round 1, diff the round's
   own commit against these mandatory items and confirm each one actually
   landed in the diff — starting with check 3: if
   `git diff HEAD~1 -- docs/specs/README.md` shows no Stage-column advance for
   the run's Index row, the item was silently skipped. Fix any miss inside
   round 1 rather than letting docs-audit catch it and force an extra round.

2. **Read each named doc** as it stands on the branch (post-implement).

3. **Apply the intent-oracle rules** for every required doc whose content
   diverges from the code:

   | Doc says | Code says | Spec/architecture explicitly states | Action |
   |---|---|---|---|
   | X | Y | X | **Code regression vs intent** — do NOT edit doc. Write a `Blocker` to STATUS (`Blocker: docs-sync detected regression: <file>:<line> — doc says X, spec says X, code shipped Y`) and stop. |
   | X | Y | Y | **Doc is stale** — edit doc to match code. |
   | X | Y | *(silent — spec/architecture doesn't name this code path)* | **See step 4** (silent-oracle). |

4. **Silent-oracle handling.** For files spec/architecture doesn't name (most
   cross-cutting utilities, helpers, shared composables, internal types):

   - **Resource/standards docs** (`docs/resources/*`, `docs/standards/*`) — if
     the doc edit would change only **descriptive prose** (examples, narrative,
     non-normative explanation), auto-edit to match code; record in the audit
     summary as `silent-oracle: <doc> edited to match <file>`. If the doc edit
     would change a **normative statement** (a "must", "never", invariant, or
     wire-shape sentence), do NOT auto-edit. Write a `Blocker` to STATUS
     surfacing the conflict for the human.
   - **Cross-cutting docs** (`CLAUDE.md`, `docs/README.md` index tables,
     `docs/surface-map.md`, `docs/glossary.md`) — **always Blocker on
     silent-oracle**. These docs are too high-leverage (CLAUDE.md is
     always-loaded; a wrong line poisons every future agent) to be auto-edited
     against silent intent.

   Detect "normative" lines heuristically by matching `must|never|always|required|do not|cannot|will|shall|invariant|exactly one|never null|always null` (case-insensitive) on the line about to change, or any change to a code-fenced API shape / TypeScript signature.

5. **Apply the routine cross-cutting updates** that the touch-X→update-Y map
   demands and are NOT silent-oracle (i.e. the spec/architecture *does* name
   them):
   - New schema model named in `architecture.md` → ensure
     `docs/resources/<entity>.md` exists (copy from `docs/_templates/resource.md`
     if not) and is registered in the Resources index of `docs/README.md`.
   - New route named in `architecture.md` → add a row to `docs/surface-map.md`.
   - New domain term defined in `spec.md` or `architecture.md` → add a
     **one-line** entry (one sentence + Detail link) at its **alphabetical**
     position in `docs/glossary.md` (`check:docs` enforces both).
   - New convention/rule documented as a deliberate change in `architecture.md`
     → reflected in `CLAUDE.md` AND the matching `docs/standards/*.md`.

6. **Run `node scripts/check-docs.mjs`, then commit and hand off to `materia-docs-audit`.**
   Run the docs checks **before committing** and fix every failure — the
   checker gates style (change-narration phrases, >600-char lines, duplicated
   long lines, glossary order) as well as links and `#anchor` fragments, and
   a failure here costs a full audit round (or a red `materia-finalize` gate) later. Then commit the doc
   edits and push to the branch (`docs(<slug>): sync (round R)`; include the
   doc-change summary in the commit body). Return to `materia-ship-spec`; the
   orchestrator spawns the sibling `materia-docs-audit` stage next. The audit checks
   (coverage, accuracy, consistency, authoring-standard conformance, the
   mechanical gate) are performed by `materia-docs-audit` — see
   `.claude/skills/materia-docs-audit/SKILL.md`.

7. **Address audit findings.** The orchestrator (`materia-ship-spec`) hands the
   `materia-docs-audit` findings back when re-invoking `materia-docs-sync` for round 2;
   address them and commit updated edits. The orchestrator then re-spawns
   the `materia-docs-audit` stage. The **orchestrator-owned loop** bounds this at
   ≤2 rounds (the authoritative statement lives in `materia-ship-spec` § Pipeline);
   if the audit can't clear, the orchestrator writes a `Blocker` to STATUS
   and stops.

## Forward-compatible STATUS handling

If the STATUS.md template predates this skill and is missing the `docs-sync:`
sub-row, create it under `## Current` when ticking. Don't fail.

## Guardrail (don't spin)

If steps 3–5 can't converge — recurring intent-oracle conflicts — write the
blocker into `STATUS.md` (`Blocker:` + `Notes`), commit + push, and surface it
to the human. The run resumes once the blocker is cleared.

## Done when

- Every required-updates matrix cell is satisfied or recorded as a Blocker.
- Every edit follows § Authoring rules (present-state, folded, one home per
  fact).
- Doc edits committed and pushed; the sibling `materia-docs-audit` stage will verify them.
- `node scripts/check-docs.mjs` **passes — run it yourself in step 6** (links + style;
  `materia-finalize`'s gate re-verifies).

## Standalone use

Runnable on its own after a hotfix: invoke with the branch diff vs `main` and
the same inputs. Useful when a manual edit landed without going through the
full pipeline.

In standalone mode the sibling `materia-docs-audit` stage is **not** auto-spawned — run
`node scripts/check-docs.mjs` to catch link + style issues mechanically, or invoke the
docs-audit procedure manually for the judgment checks.
