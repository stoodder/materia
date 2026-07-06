---
name: materia-reproduce-bug
description: Write the failing test(s) that reproduce a reported bug and fill reproduction.md — consumes the bug report body (frontmatter stripped) and STATUS.md, produces test file(s) placed per the repo testing standard plus docs/bugs/<dated-slug>/reproduction.md, and ticks STATUS.md stage 1 only after a real RED test run confirms the failure. Stage 1 of the fix-bug pipeline; usable standalone given a report body + folder.
---

# materia-reproduce-bug — confirm the bug is RED before anyone touches the fix

Write the failing test(s) that encode a reported bug's expected-vs-actual
contract, run them to confirm they fail on pre-fix code, and record the
evidence. This is the **RED gate**: stage 1 is ticked only when the test
run proves the bug is genuine. Runs as a subagent dispatched by `/materia-fix-bug`;
usable standalone after a bug report exists.

This skill does **not** fix the bug and does **not** analyse root cause —
those are subsequent stages (`materia-bug-analysis`, then `materia-plan-tasks` +
`materia-implement-task`).

## Inputs

- Bug report body (frontmatter stripped) — the full description, affected
  surface, steps to reproduce, expected vs actual, and severity from the
  report file in `docs/bugs/_reports/`.
- `docs/bugs/<dated-slug>/STATUS.md` — the bug run's live state; this skill
  ticks stage 1 here on success (or sets `Blocker:`).
- `docs/standards/testing.md` — the repo's testing standard: test placement
  (co-located or a separate test tree — whatever the standard says), naming,
  stubbing conventions, and the test runner's API.
- The resource/standards docs for the affected surface — resolved by reading
  the report's "Affected surface / route / module" section and cross-referencing
  `docs/surface-map.md` to find the matching `docs/resources/` and
  `docs/standards/` docs. Read them before writing any test code.

## Outputs

- One or more test file(s) that encode
  the bug's expected-vs-actual contract, placed per `docs/standards/testing.md`.
- `docs/bugs/<dated-slug>/reproduction.md` filled per
  `docs/bugs/_templates/reproduction.md`: the linked test path(s) + `it(...)`
  name(s), the restated repro steps, expected vs actual, the verbatim RED
  evidence (failing test output + command + SHA), and any notes for downstream
  stages.
- `STATUS.md` stage-1 ticked **or** `Blocker:` set (see § Procedure step 5).
- Committed + pushed.

## Procedure

1. **Load context.** Read the bug report body in full. Note the "Affected
   surface / route / module" section. Cross-reference `docs/surface-map.md`
   to find the matching resource and standards docs, then read them (per the
   docs read order in `CLAUDE.md`). Read `docs/standards/testing.md`.

2. **Identify the test surface.** Determine the exact module(s) whose behavior
   the bug violates. This is the module the failing test(s) must target
   (placed per `docs/standards/testing.md`). Decide the test shape:
   one test file per layer or one integration test — whichever is the
   lowest-level surface that will catch the regression.

3. **Write the failing test(s).** Each test must:
   - Encode the bug's expected-vs-actual contract precisely (the invariant
     the buggy code violates).
   - Be named after the expected behavior, not the bug symptom — e.g.
     `it("returns 0 when no sets are logged")`, not
     `it("does not crash when sets is null")`.
   - Follow all conventions in `docs/standards/testing.md`: test placement,
     the repo's stubbing conventions and test-runner API, one test per
     distinct case.
   - Not import the fix (the fix does not exist yet — the test must fail on
     current code).

4. **Run the tests to confirm RED.**

   ```
   <test command — MATERIA.md § Gate — scoped to the new test file>
   ```

   Capture the full stderr/stdout output and the commit SHA (`git rev-parse
   HEAD`). This is the RED evidence.

   If the tests pass (green) on current code, do **not** tick stage 1 — set
   `Blocker:` instead (see § Procedure step 5 — Blocker condition 2).

   If the test suite can't run at all (infrastructure failure unrelated to
   the bug), diagnose a Node-version mismatch or a stopped database before
   treating it as a blocker — recipes in
   `${CLAUDE_PLUGIN_ROOT}/skills/materia-ship-spec/resources/env-preflight.md` (Node major via hard
   runtime selection; dead-service restart).

5. **On RED confirmed — fill `reproduction.md` and tick stage 1.** Write
   `docs/bugs/<dated-slug>/reproduction.md` from the template, populating:
   - `## Failing test(s)` — repo-root-relative paths + `it(...)` name(s).
   - `## Repro steps` — the report's steps to reproduce, restated (the report
     is dequeued at finalize; the steps must live here).
   - `## Expected vs actual` — exactly what the test encodes.
   - `## RED evidence` — verbatim failing-test output in a fenced block, the
     command run, the SHA.
   - `## Notes` — anything `materia-bug-analysis` or `materia-plan-tasks` needs (preconditions,
     data setup, intermittency patterns).

   Then in `STATUS.md`: tick stage 1 (`- [x] 1. reproduce-bug …`) and set
   `Next: bug-analysis`. Commit the test file(s) + `reproduction.md` +
   `STATUS.md` and push.

   **Blocker condition 1 — cannot reproduce:** If the described steps do not
   trigger the observed failure after a genuine attempt (env seeded correctly,
   right Node version, right DB state), set in `STATUS.md`:

   ```
   Blocker: cannot reproduce — <reason: what you tried and what happened instead>
   ```

   Commit + push. Stop. Surface to the human; do not tick stage 1.

   **Blocker condition 2 — test passes on pre-fix code:** If the test you
   wrote is green on the current HEAD (the bug may already be fixed, or the
   repro steps are insufficient to trigger it), set in `STATUS.md`:

   ```
   Blocker: test passes on pre-fix code — bug may already be fixed or repro steps insufficient
   ```

   Commit + push. Stop. Surface to the human; do not tick stage 1.

## Scope

This skill:

- **Writes** the failing test(s) and `reproduction.md`.
- **Confirms** the test is RED before ticking stage 1.
- **Does NOT** attempt the fix or modify any production code.
- **Does NOT** analyse root cause — that is `materia-bug-analysis`'s role.
- **Does NOT** enumerate tasks — that is `materia-plan-tasks`'s role.

The fix is written by `materia-implement-task` (stage 4), guided by `materia-bug-analysis`
(stage 2) and `materia-plan-tasks` (stage 3). This stage's job ends once the RED
evidence is recorded.

## Rules

- **Never tick stage 1 before the test run.** The RED gate is machine-checkable
  from the `STATUS.md` stage-1 checkbox: ticked = reproduction confirmed RED.
  The orchestrator reads this field before spawning `materia-bug-analysis`.
- **RED evidence is mandatory.** The verbatim failing-test output + command +
  SHA must appear in `reproduction.md`. A stage-1 tick with no evidence block
  is invalid.
- **Two and only two `Blocker:` exits** (see § Procedure step 5). Any other
  failure mode (infra, Node version, DB) is diagnosed and retried, not
  declared a blocker.
- **Never fix the bug in this skill.** Editing production code to make the
  test pass here skips the analysis stage and produces an unreviewed fix.
  Write the test; stop.
- **Test naming encodes the invariant.** Test names describe the expected
  behavior (the contract), not the bug number or symptom — so the GREEN
  state after the fix reads as a positive assertion, not just "bug is gone."
- **Commit + push before returning.** The orchestrator checks the pushed
  state, not local working-tree state.

## Standalone use

Given a bug report body and a pre-created `docs/bugs/<dated-slug>/` folder
(with `STATUS.md` seeded), this skill runs without the `/materia-fix-bug` orchestrator:

1. Pass the report body (frontmatter stripped) as the input.
2. The skill resolves the affected surface, writes the failing test(s),
   confirms RED, fills `reproduction.md`, and ticks stage 1 (or sets
   `Blocker:`).
3. Output: one or more test files + `reproduction.md` — ready for
   `materia-bug-analysis` to consume.

The next stage is `materia-bug-analysis`.
