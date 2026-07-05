# Spawn contract — standing rules injected into every spawn prompt

The verbatim boilerplate the `ship-spec` orchestrator copies into subagent
spawn prompts, assembled per spawn kind: **Block 1** goes into every spawn;
**Block 2** additionally into every stage/task spawn; **Block 3** additionally
into every reviewer spawn. Keeping the copies here (one source) is what stops
the rules drifting apart across the orchestrator's many spawn sites.

The tier's effort guidance sentence (from `tiers.md` § effort →
guidance-sentence map) is prepended before Block 1.

## Block 1 — every spawn

> Do **all analysis inline — you cannot spawn sub-agents.** Run every scan,
> grep, read, and step yourself; do not delegate to a child agent. In this
> environment subagents cannot spawn further subagents — a delegated call
> stalls the parent or returns malformed. If you invoke a skill, run it inline
> in your own context.
>
> Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
> acting on the nudge wastes context.
>
> Never write a live markdown link — the `[text](path)` form — to a path that
> does not resolve from the writing file, **even inside backticks**
> (`check:docs` extracts links from inline code spans). Describe such a
> reference with an arrow instead (`text → path`).
>
> The safe idiom, binding for **all** `docs/specs/**` text — subagent returns
> and the orchestrator's own hand-edits alike: never render the literal
> bracket-then-paren sequence anywhere in that tree, even as an illustrative
> example, even inside backticks; name it in prose ("the bracket-then-paren
> form") instead. **One explicit carve-out:** the `docs/specs/README.md`
> Index-registration links written by intake's Index-registration step are
> exempt — they are real, tooling-verified links that `check:docs` resolves
> (the required syntax for that step, matching every existing Index row), not
> illustrative examples. Do not re-derive this reconciliation per run.
>
> The orchestrator owns `STATUS.md`, `retro.md`, and the run's status commits.
> Do **not** edit, tick, or commit `STATUS.md` or `retro.md` — tick only your
> own artifact (e.g. your task's `tasks.md` AC boxes). The orchestrator
> advances the stage row and `Next:` after you return.

## Block 2 — stage and task spawns (adds the retro return)

> **The ` ```retro ` block is mandatory and is the final element of your
> report — no report is complete without it.** However small the stage, do
> not omit it: a missing block forces the orchestrator to synthesize a
> degraded entry from your return summary. Close your report with a
> ` ```retro ` fenced block (opening fence exactly ` ```retro `; closing
> fence a bare ` ``` ` on its own line) containing the per-entry schema
> below, verbatim. Stamp the entry's `<ISO timestamp>` with the **real
> wall-clock time** at which you write it — never a `…T00:00:00Z`
> placeholder. Do not number your own entry (`## Entry N` — the `N` is a
> literal placeholder; the orchestrator assigns the real sequence number).
> Before returning, re-check that the block is present and is the last thing
> in the report.

Followed by the per-entry schema copied verbatim from
`ship-spec/SKILL.md` § Retrospective capture (the schema lives there — the
protected retro-generation contract; this file does not duplicate it).

## Block 3 — reviewer spawns (adds fresh-context exclusions)

> You are reviewing a code change with fresh context. You may read: the
> branch diff (`git diff <baseline>...HEAD`), the AC bullets from
> `tasks.md`, the standards and resource docs the tasks named, and
> `spec.md`. You must NOT read: implementer commit messages,
> `STATUS.md`, the implementer-edited copies of docs (for regression
> checks read code at `<baseline>`), other reviewers' outputs, or
> anything under `.claude/review-logs/`.

### Round-2+ additions (both fresh-context-allowed — they are the
orchestrator's brief, not other reviewers' raw outputs)

- **Spec + architecture grounding.** A short section naming the load-bearing
  facts from `spec.md` / `architecture.md` / `CLAUDE.md` that bound the change
  (single-user app, UI-gated states, client-only state, by-design
  invariants) — many MEDIUM dismissals hinge on facts a reviewer can't infer
  from the diff alone.
- **Dismissed-findings carry-forward.** One line per HIGH/MEDIUM dismissed in
  an earlier round, in the format
  `dismissed-prior-round: <finding> — <why> (verified @ <sha>)`. A reviewer
  that wants to re-raise it must engage with the recorded verification rather
  than restate the original claim.
