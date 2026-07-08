---
name: finalize
description: "Final gate for a feature — re-run `verify` for any tasks that deferred behavior checks, then run lint/typecheck/tests/check:docs; fix everything they expose; confirm acceptance criteria; open the pull request. Stage 10 of the ship-spec pipeline (STATUS checkbox row 9 in the spec template, row 8 in the bug template — stage numbering: see docs/specs/_templates/status.md § Stages)."
---

# finalize — gate, behavior re-check, and ship

Take the finished tasks to a green, documented, open PR. Runs as a subagent in
`ship-spec`; usable standalone once tasks are done. **Orchestrator-lane
exception:** when step 1's behavioral re-check stands up a live stack
(database + Eyes toolchain + dev server), that re-check must run in the
orchestrator lane — foreground, exit code captured — never backgrounded
inside a subagent, where a backgrounded launcher yields a false "exit 0"
that masks a real failure (see step 1 and `ship-spec/SKILL.md`
§ Orchestrator behavioral-verify lane). A standalone invocation applies the
same rule: run the live-stack verify in your own foreground lane.

## Inputs

- `docs/specs/<dated-slug>/tasks.md` (tasks `[x]`) + `spec.md` (acceptance
  criteria).
- The branch's changes (full diff vs the trunk — `<baseline>`, per
  `MATERIA.md` § Version control).
- `STATUS.md` — read it for `behavior-deferred:` (tasks whose `verify` was
  skipped during parallel implement-task runs and must be re-checked here)
  and the existing stage state.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- A green gate, behavior verified for any deferred tasks, the PR opened, and
  the finalize row ticked in `STATUS.md` with the `PR:` link (row 9 in the
  spec template, row 8 in the bug template) — committed and pushed. (Or a
  `Blocker` if any step won't go green.)

## Procedure

1. **Behavior re-check for deferred tasks.** Read `behavior-deferred:` from
   `STATUS.md`. For each task ID listed, look up its acceptance criteria in
   `tasks.md`; if any AC is user-visible, invoke the `verify` skill once over
   the merged branch covering the union of those ACs. When this re-check stands
   up a long-lived stack (database + Eyes toolchain + dev server), run it in the
   **foreground with explicit exit-code capture**, never `nohup … &` — a
   backgrounded launcher yields a false "exit 0" notification that masks a real
   failure (see `ship-spec/SKILL.md` § Orchestrator behavioral-verify lane).
   **Retry up to 2x** on
   failure to absorb non-determinism; if it still fails, distinguish in the
   Blocker note:
   - `Blocker: verify failed reproducibly on T<id> — <symptom>` (real bug), vs
   - `Blocker: verify flaked on T<id> across 3 attempts — needs human triage`
     (likely environmental).
   If STATUS.md predates this skill and has no `behavior-deferred:` line,
   treat it as "all user-visible ACs need re-verify" — safer default.

2. **Run the full gate** from the repo root and **fix everything it surfaces**
   (loop until all green, **≤3 rounds**):

   **Gate preflight (deps + runtime).** Before the first gate run, ensure the
   environment is provisioned per
   `${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` (runtime → deps →
   codegen → services; the concrete recipes and any documented fallback gates
   live in `MATERIA.md` § Environment preflight — when a fallback gate is
   used, record it in the PR).

   The gate is every non-`none` row of `MATERIA.md` § Gate, in table order
   (`lint` · `typecheck` · `test` · `test:e2e` where CI runs it ·
   `check:docs` — `sh scripts/check-docs.sh`). While § Gate's
   Bootstrap-grace marker is present, a row whose command does not exist is
   skip + record per that section (`check:docs` always binding); state the
   graced rows in the PR body. On the bootstrap gate spec itself, the grace
   never excuses the run's own acceptance criteria — that spec's job is to
   make the rows real.

   These are exactly what CI runs, so green here means green there.

   **docs/skills-only gate profile.** When the cumulative diff is **zero-code
   and all-markdown** — no source-code changes and no test additions (the
   same predicate as `ship-spec` § Review's markdown-only exemption) — the
   code gates (`lint`, `typecheck`, `test`) cover nothing on this branch.
   Declare them **no-ops for this
   branch** and name `sh scripts/check-docs.sh` the **binding gate**, instead of
   re-reasoning that conclusion each run. State the profile explicitly in the PR
   body. If the no-op gates can't even run (Node/deps gap), say so in the PR
   rather than claiming they passed — `check:docs` remains the gate of record
   either way.

3. **Acceptance.** Cross-check `docs/specs/<dated-slug>/spec.md` — every
   acceptance criterion is met. Mark all tasks `[x]` in `tasks.md` if not
   already.

3'. **Dequeue the proposal (if this run came from one).** Read STATUS.md's
   `## Provenance` block:

   - If `Proposed-spec:` is `—` (ad-hoc run) or the block is absent
     (pre-template STATUS.md), **skip this step silently** and proceed to
     step 4.
   - Otherwise, stage the dequeue without committing. **Path guard:** the
     `Proposed-spec:` value is data, not a trusted path — verify it matches
     `docs/specs/_proposed/<yyyy-mm-dd-hhmmss>-<id>-<slug>.md` exactly (no
     `..`, no leading `/`, confined to `_proposed/`) before use, and quote it:

     ```bash
     git rm docs/specs/_proposed/<filename-from-Proposed-spec>
     ```

     If the file is already gone (operator manually deleted it mid-run),
     skip the `git rm` and add a note to the PR body draft:
     "_Proposal `<id>` was already removed from `_proposed/` before
     finalize ran._" — not a Blocker; the operator's deletion was
     deliberate.

   - **Re-run `sh scripts/check-docs.sh` against the staged (file-removed)
     working tree.** If green, commit the dequeue:

     ```bash
     git commit -m "ship-spec(intake): dequeue proposal <id> from _proposed/"
     git push
     ```

     If red — something in the repo linked to the proposal file (a
     contract violation; docs-sync should prohibit it) — unstage with
     `git restore --staged docs/specs/_proposed/<filename>` + `git
     checkout -- docs/specs/_proposed/<filename>`, set
     `Blocker: dequeue tripped check:docs — <broken-link path>` in
     STATUS.md, and stop. The operator removes the offending link, then
     re-invokes finalize.

   The order matters: dequeue runs **after** the gate (step 2) and
   acceptance (step 3) so a broken gate doesn't waste the dequeue effort,
   but **before** the e2e-coverage gate (step 3'') so the deletion lands in the
   same PR. Staging + re-checking `check:docs` is the chicken-and-egg
   safeguard against deletion-induced link breakage.

3''. **E2e-coverage gate (UI-affecting features only).** Check whether this
   feature is UI-affecting by evaluating the gate defined in
   `ship-spec/SKILL.md` § Review — § UI-surface gate (do NOT re-enumerate the
   file patterns here; reference that section by name).

   - **Non-UI feature:** skip this step entirely. No gate check, no PR body
     mention.
   - **UI-affecting feature:** require evidence of e2e test coverage. (When
     `MATERIA.md` § Gate's `test:e2e` row is `none`, record
     `e2e-coverage: skipped (no e2e suite)` in `STATUS.md` and skip this
     gate.) Check the branch diff (`git diff <baseline>...HEAD --name-only`)
     for any new or updated files under the repo's e2e suite directory (named
     in the `test:e2e` row's Notes). Then check `STATUS.md` for a
     `ui-coverage-waiver:` line. One of the following must be true:
     - *Coverage present:* A file under the e2e suite directory appears in the diff.
       Continue; note the spec paths in the PR body under a `## E2e coverage`
       section (see the PR-body section below).
     - *Waiver present:* `STATUS.md` contains a line matching the pattern
       `ui-coverage-waiver: <reason>` anywhere in the `## Notes` section.
       Continue; render in the PR body: `### No e2e coverage added — rationale:
       <reason>` (still under PR-body coverage section).
     - *Neither:* Write to `STATUS.md` a `Blocker:` entry with exactly this
       text: "UI-affecting feature — no e2e coverage and no
       `ui-coverage-waiver` recorded in STATUS.md". Commit + push, and **stop**
       — do not proceed to step 4. Resume once the blocker is cleared.

**Concurrent-run Index conflict (trivial merge).** `docs/specs/README.md`'s Index
table is a recurring low-grade merge conflict for concurrent ship-spec runs —
when `<trunk>` advances mid-run, the colliding hunk is almost always another run's
Index-table row addition. Resolve it as a **trivial merge: keep both rows** (yours
and theirs) and re-run `check:docs`; **never rebase the shared branch** to
sidestep it. The larger append-only / one-file-per-spec registry redesign that
would remove this conflict class is out-of-scope here (deferred to its own spec).

4. **Open the PR.** **Shell hygiene for title/body:** never interpolate
   frontmatter `title` or other artifact text raw into a shell command —
   pass the body via `--body-file`, and build the `--title` from the slug or
   a rewrite with `"`, backticks, and `$(` stripped. Title summarizes the
   feature; body summarizes the spec,
   the approach, the tasks shipped, and the gate status (lint/typecheck/tests/docs
   green; behavior re-verified for deferred tasks; docs were reconciled + audited
   by the preceding docs-sync ⇄ docs-audit stages; e2e coverage present or waived).
   Link the `docs/specs/<dated-slug>/` artifacts. Close the body with the
   Materia sigil (`docs/standards/skills.md` § PR attribution — the Materia
   sigil), naming the driving orchestrator (`ship-spec` /
   `fix-bug`) as the caster; it stays the last element through every
   later body edit.

   **PR-creation tool.** Open the PR through the **open-PR op**
   (`MATERIA.md` § Version control § Forge), which routes the tool — `gh pr
   create` by default, its GitHub-MCP twin in a `gh`-less environment, or the
   `none` manual handoff — while you draft the title/body the same way
   regardless. Finalize's one wrinkle § Forge does not cover: if finalize
   runs as a **subagent without MCP tools**, it cannot open the PR itself —
   hand the drafted title/body (and branch) to the orchestrator to open.

   **E2e-coverage block in the PR body (UI features only).** If step 3'' passed
   with coverage present, render a `## E2e coverage` section listing the spec
   paths (e2e files that were added or updated in the diff).
   If step 3'' passed with a waiver, render under the same section:
   `### No e2e coverage added — rationale: <reason>` (the `<reason>` is the
   text from the `ui-coverage-waiver:` line in STATUS.md). For non-UI features,
   skip this section entirely.

   **UI proof block in the PR body.** This block is gated by the same
   UI-surface gate used in step 3'' (the gate defined in
   `ship-spec/SKILL.md` § Review — § UI-surface gate) — do NOT re-enumerate its
   file patterns here. Three states:

   - **Non-UI diff (gate negative):** omit the `## UI proof` section entirely,
     exactly as `## E2e coverage` is omitted for non-UI features. Reuse the
     gate evaluation already performed at step 3''; do not re-derive it.

   - **UI-affecting diff, `ui-proof/` present and contains PNGs (ready):**
     render a `## UI proof` section with one `###` subheading per flow and
     one Markdown image per PNG within that subheading, ordered canonically
     (`loading → empty → error → ready` — do NOT use alphabetical/glob
     order). ≤ 4 images per flow subheading. Each image must use an
     **absolute raw-content URL** of the form:

     ```
     https://<host>/<owner>/<repo>/raw/<sha>/docs/specs/<dated-slug>/ui-proof/<flow>-<state>.png
     ```

     **URL construction (new — no existing precedent in the skills; follow
     exactly):**

     1. `<sha>` = `git rev-parse HEAD` at the moment finalize renders the PR
        body. The `ui-review` `ui-proof/` commit is already on the branch at
        this point (it was committed by `ui-review` during the review stage,
        before finalize runs), so the SHA resolves to a commit that contains
        the files.

     2. `<owner>/<repo>` = parsed from `git remote get-url <remote>` (the
        remote per `MATERIA.md` § Version control) as the **last two path
        segments** of the URL, stripping a trailing `.git`.
        This parse is robust across `git@github.com:o/r.git`,
        `https://github.com/o/r.git`, and the proxy-rewritten form
        `http://local_proxy@127.0.0.1:41729/git/<owner>/<repo>` — the
        environment's actual remote is proxy-rewritten, so naive parsing
        expecting the `github.com` host directly will fail. Always extract
        the last two segments after stripping `.git`, regardless of the
        remote's host.

     3. `<host>` = the git host, resolved from `git remote get-url <remote>` —
        but used **only** when it is a recognized, non-localhost git host. Parse
        the host from whichever remote form matches:
        `git@<host>:<owner>/<repo>.git`, `ssh://git@<host>/<owner>/<repo>`, or
        `https://<host>/<owner>/<repo>`. Use that parsed host **only when it is a
        real DNS hostname** — non-empty, not `localhost`/`127.0.0.1`/`::1`, and
        not a proxy rewrite (e.g. `local_proxy@127.0.0.1:<port>`). Otherwise
        **fall back to `github.com`**. This keeps the proxy-rewritten remote case
        (`http://local_proxy@127.0.0.1:41729/git/<owner>/<repo>`) resolving to
        `github.com` exactly as before: its host is a loopback proxy, so the rule
        rejects it and falls back. Non-github.com GitHub hosts (GHES /
        self-hosted) are supported **best-effort** — a recognized host flows
        through, but the `/raw/<sha>/…` path convention is only guaranteed on
        `github.com`.

     4. **Fallback:** if `<owner>/<repo>` cannot be resolved from the remote
        URL (empty output, unexpected format), attempt
        `gh repo view --json nameWithOwner` (when `gh` is present) to retrieve
        the canonical `<owner>/<repo>` string. The GitHub MCP
        `create_pull_request` context (already available to finalize) may also
        supply it. Use whichever resolves first.

     5. **Unresolvable escape hatch:** if neither the remote-URL parse nor the
        `gh`/MCP fallback can resolve `<owner>/<repo>`, render the degraded
        note (see below) with reason `repo coordinates unresolved`. Never emit
        a broken image tag. Never block PR open.

     **Never-block contract (rendering only):** any *rendering* failure —
     URL unresolvable, repo coordinates unresolved, partial PNG set —
     degrades to the note below; never emit a broken image tag over it. The
     one blocking case is different in kind and defined in the absent/empty
     branch below: an empty `ui-proof/` with **no recorded reason** is a
     missing deliverable, not a rendering failure, and gates the PR.

   - **UI-affecting diff, `ui-proof/` absent or empty (or all files
     unreadable):** screenshots are a mandatory deliverable on UI runs
     (`ship-spec/SKILL.md` § Review — § Screenshot-presence check), so this
     branch forks on whether the absence has a **recorded reason** in
     `STATUS.md` `## Notes`:

     - **Reason recorded** — one of:
       `ui-review: skipped (eyes-instability — degrade path)`, a
       `ui-proof: capture failed — <reason>` note, or `ui-proof/` absent
       because `ui-review` never ran under the `ui-coverage-waiver` path
       (then use `ui-coverage-waiver recorded` as the reason). Render a
       degraded `## UI proof` section containing only the note:

       ```
       _screenshots unavailable this run — <reason>_
       ```

       Never emit a broken image tag; a recorded degrade never blocks PR
       open.

     - **No reason recorded** — this is a gate, mirroring step 3''. Write to
       `STATUS.md` a `Blocker:` entry with exactly this text: "UI-affecting
       feature — `ui-proof/` empty with no capture-degrade note (screenshots
       are mandatory; see ship-spec § Screenshot-presence check)". Commit +
       push, and **stop** — do not open the PR. The usual fix: the
       orchestrator (or the operator, standalone) runs the orchestrator-lane
       recapture from § Screenshot-presence check, or records the explicit
       `ui-proof: capture failed — <reason>` note, then re-invokes finalize.

   **Autopilot note (when instructed).** When the orchestrator's spawn prompt
   marks the run as autopilot (`--auto`), insert the one-line autopilot
   notice it provides into the PR body, above the closing Materia sigil
   (which stays last), so reviewers know the PR auto-merges on
   green (see `ship-spec/SKILL.md` § Autopilot). Finalize itself never
   merges; the merge belongs to the orchestrator's § Merge watch.

   **Provenance block in the PR body.** If STATUS.md's `## Provenance`
   block has any non-`—` field, render a `## Provenance` section in the
   PR body listing `Proposed-id`, `Proposed-spec` (linked), `Proposed-
   source`, `Proposed-source-refs`, and `Proposed-id-selection`. Note the
   dequeue commit by SHA so reviewers can find it. For ad-hoc runs, skip
   the section.

5. **Persist:** tick the finalize row in `STATUS.md` (row 9 in the spec
   template, row 8 in the bug template), set `PR:` to the link and `Next:
   merge`; commit + push the status update.

6. **Hand off.** Report the PR link; offer to watch CI / autofix failures.

## Fresh-context fallback (no nested subagents)

The docs-sync ⇄ docs-audit stages that precede finalize are meant to run as
**fresh-context subagents**. Some environments (including the remote execution
environment) **cannot spawn sub-subagents**, so a subagent-run finalize cannot
itself spawn them. The codified fallback, in preference order:

1. **Orchestrator-spawned.** The directly-invoked orchestrator (not a subagent)
   spawns docs-sync and the fresh-context docs-audit as its own siblings before
   finalize — preserving the fresh-context guarantee. This is the default when
   the orchestrator is driving the run.
2. **Inline self-audit (last resort).** If neither the orchestrator nor a
   subagent can spawn a reviewer, run the docs reconciliation + audit inline in
   the current context and **flag the fresh-context gap explicitly on the PR**
   ("docs-audit ran inline — no independent fresh-context pass this run") so the
   human reviewer knows to apply extra scrutiny.

Do not silently skip the audit; choose the highest fallback the environment
allows and record which one was used.

### Orchestrator-lane finalize (the de-facto path)

In the remote execution environment, finalize **runs inline in the orchestrator
lane**, not as a fresh-context subagent — PR creation needs the GitHub MCP tools
and the behavior re-check needs the long-lived e2e stack, neither of which a
backgrounded subagent can hold (see `ship-spec/SKILL.md` § Orchestrator
behavioral-verify lane). This is the expected path, not a per-run deviation;
state it in `STATUS.md` rather than re-deciding it each run. Several branches
follow from it:

- **Behavior already verified → cite, don't re-run `verify`.** When the
  orchestrator already ran the behavioral verification for a `behavior-deferred:`
  task in its own lane during the run, finalize **cites that verification** (the
  task ID and what it covered) in the PR body instead of re-running `verify` from
  scratch — step 1's re-check is satisfied by the recorded orchestrator-lane run.
- **Gate can't run due to the env gap → state it in the PR body (named
  gate-profile).** When a code gate (`lint` / `typecheck` / `test`)
  can't run because of the runtime/deps env gap rather than a real failure, **say so
  explicitly in the PR body** and name `check:docs` (or the host-fallback gate)
  as the gate of record — never claim a gate passed that did not run. This is an
  explicit gate-profile branch, parallel to step 2's docs/skills-only profile,
  not a per-run judgement call.
- **STATUS/dequeue/PR split protocol.** In the orchestrator lane the work
  divides cleanly: **finalize** runs the gate, acceptance, and the proposal
  **dequeue commit** (step 3'), and drafts the PR title/body; the
  **orchestrator** opens the PR (it owns the GitHub MCP tools) and ticks
  `STATUS.md` (the finalize row, `PR:`, `Next: merge`) after finalize returns. In this
  lane finalize does **not** open the PR or tick `STATUS.md` itself — it hands
  the drafted title/body back to the orchestrator (per step 4's PR-creation tool
  note), which owns the PR-open and the STATUS tick.
- **Commit orchestrator-lane ui-proof screenshots to the branch before the PR
  body is rendered.** When `ui-review` ran in the orchestrator lane, its
  screenshots often live only in the orchestrator scratchpad and never reach the
  branch, so the PR body can only describe them. Before finalize renders the PR
  body, **copy those screenshots into `docs/specs/<dated-slug>/ui-proof/` and
  commit them to the branch** so the `## UI proof` block can embed real images
  via the raw-content URLs (step 4) instead of degrading to the
  screenshots-unavailable note.

## Forward-compatible STATUS handling

If `STATUS.md` predates the v4 template (missing `behavior-deferred:`),
create those rows under `## Current` as you tick. Don't fail
on missing fields — degrade gracefully (see step 1 default).

## Budget ceiling

- Verify re-check ≤ 2 retries per deferred task.
- Gate ≤ 3 rounds.

## Guardrail (don't spin)

If any step can't converge within its bound, **stop** before opening the PR:
write the failure into `STATUS.md` (`Blocker:` + `Notes`), commit + push, and
surface it. Resume once it's cleared.

## Done when

- `verify` succeeded for every `behavior-deferred` task (or behavior-deferred
  was empty).
- Every non-`none` gate row in `MATERIA.md` § Gate is green.
- Every acceptance criterion met; tasks marked done.
- If the run came from a proposal: the proposal file has been `git rm`ed in
  a dedicated commit and the post-stage `check:docs` rerun was green.
- The PR is open; the finalize row in `STATUS.md` ticked with the PR link.
