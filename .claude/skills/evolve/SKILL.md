---
name: evolve
description: Orchestrate a change to the Materia harness (the materia plugin's skills, the bundled scaffold, the validator, the marketplace/plugin manifests, CI) through a rigorous, reviewed loop — interactive intake Q&A, then a drafted plan, then adversarial plan-review rounds, then one operator approval, then per-task execution by fresh-context sub-agents each followed by adversarial review rounds, with dynamic re-scoping as findings emerge, ending at one pull request (never auto-merged). Repo-local dev tool, not part of the distributed plugin. Reach for it for any real change to the harness — anything past a single obvious edit — especially one spanning multiple skills or surfaces or redrawing a contract. Invoke as `/evolve "<change request>"`.
---

# evolve — orchestrate a reviewed change to Materia

The repo's own meta-orchestrator for evolving the Materia harness. It runs in the
operator session, does the thinking + coordination itself, and dispatches the actual
work to **fresh-context sub-agents** — the same loop that shipped the plugin-marketplace
migration: **intake → plan → review → approve → execute-with-reviews → PR**, staying
dynamic as new findings change scope.

This skill is **repo-local** (`.claude/skills/evolve/`) — a development tool for *this*
repo, deliberately outside the distributed `materia` plugin. It is distinct from the
plugin's own `/materia:ship-spec` pipeline: `ship-spec` builds product features in a
repo where Materia is *installed*; `evolve` changes Materia *itself*, is lighter-weight
(no queues/epics/retros), and routes model/effort per task rather than from a fixed
table. It always runs in the top-level operator session (where the interactive tools it
needs are available).

## When to use / not use

- **Use** for any real change to the harness: touching one or more skills, the bundled
  `plugins/materia/scaffold/`, `scripts/validate-plugin.mjs`, the marketplace/plugin
  manifests, or CI. A small change still runs through `/evolve` — Phase 1 downgrades the
  ceremony to match its size (that is the "scale to change size" decision); it does not
  mean skipping the skill.
- **Don't** use only for a **single obvious edit** with no design question and nothing to
  review beyond "is the typo fixed" (a doc typo, a one-character correction) — just make
  it. And don't confuse it with `/materia:ship-spec` (that ships product features in an
  installed repo, not changes to Materia).

## Inputs / Outputs

- **Input:** the change request, as `$ARGUMENTS` and/or the conversation.
- **Outputs:** a feature branch; a gitignored working plan + progress tracker (with a
  review log) under `.tmp/`; a series of reviewed commits (one per task, plus review-fix
  commits); exactly **one open PR** (never auto-merged), whose body records the
  decisions, any operator-veto calls, the **action-needed items**, and what the review
  rounds hardened.

## Procedure

### Phase 0 — Branch, context, intake Q&A (interactive)

1. `git checkout main && git pull`, then open a feature branch (`git checkout -b <slug>`).
   Opening the branch is not "executing the change" — no change is committed before
   Phase 3.
2. **Gather context first:** read the surfaces the request touches (skills, scaffold
   docs, validator, manifests) before asking anything — so the questions are informed.
3. **Interactive Q&A:** resolve every ambiguity *before* planning. Ask as much as you
   need — the downstream phases run autonomously *because* this phase removed the
   ambiguity. Do not guess at a decision the operator owns; do pick sensible defaults for
   low-stakes mechanics and state them.
   - **Preferred:** `AskUserQuestion` for discrete, operator-owned decisions (lead each
     option with a recommendation); plain conversational turns for open discussion.
   - **If `AskUserQuestion` is not available** in the session (it is not always present):
     degrade to **Auto Mode** — the same convention the plugin's intake skills use. Ask
     the same questions as plain text with numbered options, mark the recommended
     default per question, and either let the operator answer inline or bake the grounded
     defaults and record them in the plan's decisions list for confirmation at Phase 3.
     Never block on a missing tool.

### Phase 1 — Size the change + draft the plan

4. **Classify the change** (drives the rigor — "scale to change size"):
   - **Small / single-surface** → a lightweight path: a short plan, one adversarial
     review pass per artifact, execution possibly inline (still committed + gate-checked).
   - **Substantial / multi-surface** → the full path: fan out to fresh-context
     sub-agents per task, each with its own adversarial review rounds.
5. Ensure `.tmp/` is gitignored (add it if not); write the plan + task list to
   `.tmp/<slug>-plan.md`. It is the **single source of truth for progress** — a
   `## Progress tracker` and a `## Review log` (append per task/round: task · round ·
   angle · findings · resolution) that you keep current so an interrupted run is
   resumable from it. Each task carries: a one-line goal, its assigned tier as a
   `<model>/<effort>` pair (§ Model/effort heuristic), acceptance criteria, and the
   adversarial review angles that apply to it (§ Review angles). Order tasks so nothing
   is built then discarded, and note cross-task seams explicitly.

### Phase 2 — Adversarial plan review (≤3 rounds to convergence)

6. Spawn **fresh-context reviewers** on the plan's applicable angles (§ Review angles),
   typically *approach-correctness*, *completeness & coupling*, and *decision-fidelity &
   sequencing*. Reviewers are adversarial and **calibrated** — real Blocker/Major/Minor
   findings, not nitpicks.
7. Fold findings → revise the plan → re-review, up to **3 rounds** or until reviewers
   converge (no material Blocker/Major); apply the § Non-convergence fallback if it
   doesn't. Never proceed to execution past an open Blocker. On a small change this phase
   collapses to a careful self-review.

### Phase 3 — Operator approval (the single execution checkpoint)

8. Present the converged plan + task list (in Auto Mode, include the baked defaults for
   confirmation). Reply verbs: **`approve`** (execute) · **`edit: <feedback>`** (adjust +
   re-present) · **`cancel`** (switch to `main`, delete the branch, delete
   `.tmp/<slug>-plan.md`, exit clean). **Nothing is executed or committed before
   `approve`.** After approve the skill runs autonomously through to the open PR.

### Phase 4 — Execute each task (execute → commit → review rounds)

For each task, in order:

9. **Execute:** spawn a fresh-context sub-agent at the task's tier with a precise brief
   (goal, exact edits, the acceptance gates, "get validators green," "do NOT commit,
   report back"), injecting the effort as a plain instruction (§ Effort). A small task
   may be done inline instead. Every executor/reviewer brief is **inline-only — no nested
   spawns** (keeps fan-out bounded and the orchestrator the sole committer).
10. **Verify + commit:** the orchestrator independently re-runs the gates
    (`node scripts/validate-plugin.mjs`, and `claude plugin validate .` /
    `claude plugin validate ./plugins/materia` where relevant, plus any change-specific
    check), sanity-checks the diff, then commits. Commit only green.
11. **Review:** spawn fresh-context adversarial reviewers on the task's angles (§ Review
    angles). Fold findings → re-commit the fixes → re-review, ≤3 rounds to convergence.
    Append to the `.tmp/` review log after each round.
12. See § Non-convergence fallback if a task's reviews don't converge.

### Phase 5 — Dynamic re-scoping (stay aligned as scope changes)

13. When a round surfaces a finding that changes scope — a needed new task, an
    under-scoped task, a decision the work falsified — **fold it into the plan**:
    add/split/re-order tasks, update the tracker + review log, and re-verify the ordering
    still has no build-then-discard seams, then **continue autonomously**. Two cases need
    more than a quiet fold:
    - An engineering call **beyond the operator's approved decisions** (a new
      behavior/trade-off they didn't sign off on) → make the safe/conservative choice and
      **flag it in the PR body for operator veto** — do not pause the run, and do not ship
      it as settled. (This is how the migration caught the `disable-model-invocation`
      risk and deferred it.)
    - A finding that **invalidates the approved goal or plan wholesale** (not mere growth)
      → stop and return to the operator; the approval no longer covers the work.

### Phase 6 — Finalize + open the PR

14. Run a full green sweep (all validators + a repo-wide stale-token grep for whatever
    the change was supposed to remove/rename) and a **final whole-repo adversarial
    verification pass** (a fresh-context reviewer that checks the change hangs together
    across every task's surface). Fold any finding via the loop above.
15. Push the branch and open **exactly one PR** — never auto-merge. The PR body records:
    a summary, the operator decisions, any veto-flagged engineering calls, the
    action-needed items, and what the review rounds hardened. End the turn with the PR
    link; the operator merges.

**Interrupting a run.** The operator may stop at any time. Committed work stays on the
branch; report what landed and what's pending, and point at `.tmp/<slug>-plan.md` — a
later `/evolve` (or manual resume) continues from the tracker. Resumability is
**local-only**: `.tmp/` is gitignored and never pushed, so a resume needs the same
working tree (a fresh clone or a deleted worktree loses the tracker).

## Model/effort heuristic

Route each spawned unit as a `<model>/<effort>` pair.

| Model | For |
|---|---|
| `haiku` | trivial / mechanical / bookkeeping — single-file edits, renames, tracker updates |
| `sonnet` | standard slices, systematic synthesis, writing, most reviews |
| `opus` | gnarly / cross-cutting / high-risk work, contract redesigns, and the final verification pass |
| `fable` | *(premium/per-token — listed, but nothing routes to it by default)* reserved for the highest-judgement units (interactive intake, approach-correctness review, qualitative design calls); run those at `opus` unless the operator asks for `fable` on the run |

### Effort

`low` · `medium` · `high` · `xhigh` describes the *work*, not the model. Inject the
matching one-line instruction into each spawn prompt:

- `low` — "Run this at low reasoning effort — it's mechanical; don't over-deliberate."
- `medium` — "Run this at medium reasoning effort."
- `high` — "Run this at high reasoning effort — reason carefully before acting."
- `xhigh` — "Run this at maximum reasoning effort — highest-stakes; be exhaustive."

## Review angles

Reviewers are spawned fresh-context, adversarial, and calibrated. Pick the angles that
fit the unit; a plan review and a code task draw different sets:

- **Plan:** approach-correctness · completeness & coupling · decision-fidelity & sequencing.
- **A code/skill/doc task:** correctness / behavior · reference-integrity & consistency ·
  contract/invariant preservation · reuse & simplification · plus any surface the task
  specifically touches (validator coverage, manifest conformance, docs accuracy, …).

Record the chosen angles for each task in the plan (Phase 1) so reruns are stable.

## Non-convergence fallback

Convergence means **no material Blocker/Major finding remains** — not "the reviewer ran
out of things." If a review loop (plan or task) hasn't converged after 3 rounds, do NOT
silently proceed:

1. If findings are **shrinking**, extend one more round — and if the sticking point is
   depth of judgement, **escalate the reviewer's (or executor's) tier** one step
   (§ Model/effort) for that round.
2. Else **re-scope** — split the task, or take the plan back to the operator (during
   Phase 2 this is expected; it is pre-approval, not a second execution checkpoint).
3. **Never advance past an open Blocker.** Log the decision in the `.tmp/` review log.

## Rules

- **Nothing executes or commits before the Phase-3 `approve`.**
- **One PR per run, never auto-merged.** The PR is the operator's review gate;
  branch-protection and the merge stay theirs.
- **State lives in `.tmp/`** (gitignored) — the plan doubles as the progress tracker +
  review log; keep it current for resumability (local-only, per Phase 6).
- **Fresh context per unit, inline-only.** Executors and reviewers are spawned fresh and
  must not spawn their own sub-agents; the orchestrator is the sole committer.
- **Verify green before every commit** — the orchestrator re-runs the gates itself.
- **Reviews are adversarial and calibrated**; convergence = no material Blocker/Major.
  (On the small-change path a careful self-review may substitute for a spawned reviewer —
  see Phase 1.)
- **Beyond-decision calls are flagged for veto** in the PR, not shipped silently.

## Scope

- Does **not** merge — it stops at an open PR.
- Is **not** shipped in the distributed `materia` plugin (it's a repo-local tool), and
  does not touch the plugin's own tier machinery (`MATERIA.md` § Tiers governs the
  plugin's pipeline, not this skill), `docs/specs/`, `STATUS.md`, or `retro.md`.
- Does **not** replace `/materia:ship-spec` — that ships product features where Materia is
  installed; `evolve` changes Materia itself.
