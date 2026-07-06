---
name: implement-task
description: Implement one task from a tasks.md — read context, build to the standards, write tests, then run the local gate and commit. Stage 6 of the ship-spec pipeline; called once per task. Adversarial review happens after all implementation tasks complete (see ship-spec/SKILL.md § Review).
---

# implement-task — build one task to done

Take a single task to a clean, tested, committed state. Runs as a
subagent in `ship-spec` (one per task; independent tasks may run in parallel,
worktree-isolated); usable standalone.

Adversarial review is **not** per-task in this pipeline. After every task
finishes, `ship-spec` runs a single fresh-context review pass over the
cumulative branch diff (see `ship-spec/SKILL.md` § Review) — that is where
correctness, security, spec-adherence, and behavior reviewers fire. Your
job here is to build to the standards, leave the local gate green, and
commit; the post-implementation review will flag anything that needs a
remediation task.

## Inputs

- The task in `docs/specs/<dated-slug>/tasks.md` + `architecture.md`, and the
  standards/resource docs the task names (read in the docs read order).

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Run solo (no self-fan-out) + watch the DB

Do this task's own work **inline** — do **not** spawn sub-agents (no scan,
grep, or review fan-out). An implement-task agent that delegates to its own
sub-agent and then "waits" on it has stalled silently more than once: the
orchestrator gets no signal and only discovers the death by inspecting
transcript mtime against the wall clock. Run every scan, grep, and edit
yourself.

If a gate step fails because a required service (database, container) is
unreachable, **restart the service before treating it as a task failure** — a
dead service mid-task is the most common silent-stall cause (recipe:
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` § Standing rules +
`MATERIA.md` § Environment preflight). If it can't be revived, write the
blocker into `STATUS.md` and stop (see § Guardrail); don't hang waiting on it.

## Outputs

- The code + its tests; the **directly-touched** docs updated in the
  same commit (per Step 6 below); the task marked `[x]` in `tasks.md`;
  `STATUS.md` updated (and, if applicable, the task ID added to
  `behavior-deferred:`); committed and pushed. (Or, if blocked, a
  `Blocker` in `STATUS.md`.) The retro entry is **returned in the report**
  (see Step 6) — not written to `retro.md` directly.

## Procedure

1. **Load context** in the docs read order: read the task in
   `docs/specs/<dated-slug>/tasks.md`, then the standards + resource docs it
   names, then the code those docs point to. Reuse existing resources — do not
   reinvent.

   **Locate edit sites by content, never by line number.** Treat any line
   numbers the architecture or task cites as **approximate anchors** — they
   drift between authoring and implementation, and a stale number silently
   points at the wrong code. Find each edit site by **text-match** (grep / a
   unique surrounding substring) and confirm the surrounding content before
   editing; never trust a cited line number as the primary locator. Runs that
   grep-by-content stay correct while ones that trust line numbers go stale.

   **Widen the completeness grep to `docs/specs/**/*.md` for removals/renames.**
   When the task removes or renames a resource (a model, type, route, or
   user-facing name), the completeness grep that confirms no dangling references
   remain must reach **beyond product code** to include `docs/specs/**/*.md` —
   older spec architecture files reference deleted resource names and carry
   link-rot a code-only grep misses, so widening the scope surfaces every hit in
   **one round** instead of bouncing back from a later review.

2. **Clarify only if blocked.** The pipeline runs mostly autonomously; ask the
   human only when a genuine ambiguity would change the outcome. Otherwise pick
   the choice most consistent with the standards and proceed.

   **When `spec.md` and `tasks.md` disagree, follow `spec.md`.** The spec is
   the binding intent oracle; a task field that contradicts it (a wrong schema
   key, a missing step the spec requires) is a plan gap, not a new decision.
   Implement to the spec and **note the divergence in this task's retro entry**
   (under "Unexpected" or "What could be improved") so the correction is durable
   and the reviewer can trace it — don't silently follow the task letter.

3. **Implement** to the standards and the Definition of Done
   (`docs/contributing.md`): placement, layering, and every invariant the
   task's cited `docs/standards/*` docs name.

   **UI work matches its cohesion anchors.** When the task touches UI, read
   `design.md` § Cohesion anchors (when present) and build by **reusing the
   anchor screens' components and shared presentation hooks** — open the anchor
   page's source and match its tone-ladder rungs, spacing/typography, and
   list/card/sheet idioms before inventing a variant. Visual consistency
   comes from reuse, not from re-deriving tokens per screen; `ui-review`
   compares your screens against the anchors side-by-side.

4. **Tests.** Add/extend tests for every source module you touch, following
   the repo's testing standard (`docs/standards/testing.md`).

   **AC→test traceability.** Name each test after the AC it covers — e.g.
   `it('AC-7: rejects a non-finite multiplier', …)` — and give each invalid
   input its own `it` block even when the expected output is identical (don't
   fold `0 / -1 / NaN / Infinity` into one looped assertion). This makes the
   post-implementation review's AC-coverage check a grep against the AC ids
   rather than a careful read.

5. **Task gate.**

   **Preflight: runtime version.** Before running lint/typecheck/tests, check
   that the installed runtime version matches what `MATERIA.md` § Environment
   preflight requires, and switch/install per its recipe if not.

   - **Markdown-only tasks may proceed on the resident runtime.** If this task
     touches only `*.md` (docs/skills, no source or schema files), the
     pure-Node `check:docs` gate runs fine on any recent Node — proceed and
     note the version in the commit. **Code-touching tasks block** when the
     required runtime is unavailable: halt with a clear remediation naming the
     desired version. Do **not** run lint/typecheck/tests for code under the
     wrong runtime — that produces cryptic errors that obscure the real
     problem.

   **Gate.** `lint` and `typecheck` (`MATERIA.md` § Gate) clean and the
   relevant tests green. (While § Gate's Bootstrap-grace marker is present,
   a row whose command does not exist is skip + record per that section —
   `check:docs` always binding.) E2e-authoring tasks are **not exempt** from the
   typecheck — a test runner's list/collect mode does not type-check, so a
   task whose deliverable is a new e2e spec still runs `typecheck`; otherwise
   type errors in the new spec slip through to the review gate.
   Run the **formatter check on the changed files** (the `lint` row's
   auto-fix variant in `MATERIA.md` § Gate) as part of this gate — checking
   the touched files explicitly surfaces formatting failures **per-task**
   rather than letting them pile up into a finalize-time `lint` failure
   across many files. Adversarial review is deferred to the
   post-implementation review pass (see `ship-spec/SKILL.md` § Review);
   your job is to leave the local gate green so the review pass starts
   from a clean baseline.

6. **Persist:** update **directly-touched** docs in the same change. Use
   `docs/contributing.md`'s touch-X→update-Y rows applied to the actual diff
   to compute the set; if `plan-tasks` tagged this task with a docs-scope
   floor, your set is `floor ∪ derived-from-diff`. **Do NOT touch
   cross-cutting docs** here — `CLAUDE.md`, `docs/README.md` index tables,
   `docs/surface-map.md`, and `docs/glossary.md` are deferred to
   `finalize` → `docs-sync` to avoid cross-task drift. Then set the task to
   `[x]` in `tasks.md` and **tick that task's acceptance-criteria checkboxes to
   reflect what was actually built** — check the boxes your implementation
   satisfies and correct any template-default `[x]` that doesn't match reality,
   so `finalize` doesn't have to reconcile them. Tick progress in `STATUS.md`
   (set `Next` to the
   following task; add the task ID to `behavior-deferred:` if any AC is
   user-visible so the post-implementation review and `finalize`'s verify
   rerun see it). **Commit + push.**

   **Orchestrator-lane exception (no `STATUS.md`/`retro.md` writes).** When this
   task runs **spawned by `ship-spec`** (the orchestrator lane), the orchestrator
   owns `STATUS.md` and the run's commits, so the `STATUS.md` tick above is
   **superseded**: tick **only** this task's `tasks.md` acceptance-criteria boxes
   and do **not** edit, tick, or commit `STATUS.md` (just as you never touch
   `retro.md` — see below). The orchestrator advances the stage row, sets `Next`,
   and records `behavior-deferred:` after you return (see `ship-spec/SKILL.md`
   § STATUS.md ownership (orchestrator lane)). This stops the edit-and-revert
   churn of a spawned implementer racing the orchestrator on `STATUS.md`.

   **Return your retro entry — do not touch `retro.md`.** Close your report
   with a ` ```retro ` fenced block (opening fence exactly ` ```retro `;
   closing fence bare ` ``` ` on its own line) containing the per-entry schema
   from `ship-spec/SKILL.md` § Retrospective capture. Stamp the entry's
   `<ISO timestamp>` with the **real wall-clock time** at which you write it —
   never a `…T00:00:00Z` placeholder. Do **not** read, write, edit, or commit
   `retro.md`; the orchestrator is the sole writer. If no orchestrator is
   present (standalone invocation), still emit the ` ```retro ` block and
   output the line "No `retro.md` found — standalone invocation; entry returned
   in report only."

## STATUS/task notes and the check:docs gate

Two recurring `check:docs` traps when you write `STATUS.md` / `tasks.md` notes or
your returned retro block:

- **Never paste a literal bracket-then-paren markdown link** — `[text]`
  immediately followed by `(path)` — into a note, **even inside backticks**.
  `check:docs` extracts links from inline code spans (it strips fenced blocks but
  not single-backtick spans), so even an example _about_ the hazard re-introduces
  a broken link and fails the gate. Write it in arrow/prose form instead
  (`text → path`).
- **Read the gate verdict from the exit code, not the display line.** Treat
  `node scripts/check-docs.mjs` (and every gate command) as passing **iff its exit code
  is 0** — do not judge it by the trailing summary/display line it prints, which
  can read as success while the command exits non-zero.

## Guardrail (don't spin)

If the task gate can't converge in a few attempts, **stop**: write the
blocker into `STATUS.md` (`Blocker:` + `Notes`), commit + push, and surface
it to the human. The run resumes cleanly once the blocker is cleared.

## Done when

- Acceptance criteria met; tests added and green; `lint` + `typecheck` clean (MATERIA.md § Gate).
- Directly-touched docs updated (cross-cutting deferred to `docs-sync`); task
  `[x]` with its AC checkboxes ticked to reflect what was actually built;
  `STATUS.md` updated (and, if applicable, the task ID added to
  `behavior-deferred:`); committed + pushed.
- Retro entry returned in a ` ```retro ` fenced block as the closing element of
  the report (not written to `retro.md` — the orchestrator appends it).
