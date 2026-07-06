---
name: materia-ui-inspection
description: Run on demand to inspect the whole running app for UI/UX quality and file one consolidated checklist bug report into docs/bugs/_reports/. Provisions the Eyes toolchain on-demand per MATERIA.md § Eyes, drives every page in docs/surface-map.md § Pages at the canonical viewport, captures a screenshot + DOM snapshot per surface, judges each against the repo's visual standards docs, and writes one bug report with source ui-inspection. Observe-and-report only — never edits product code, never fixes anything, never opens a ship-spec or fix-bug run. Reach for it before a polish pass when you want a prioritized punch-list of UI/UX cleanups.
---

# materia-ui-inspection — drive the whole app, file one UI/UX punch-list

A single-shot **producer** skill. It drives the live local app across every
surface in `docs/surface-map.md` § Pages at the canonical viewport
(`MATERIA.md` § Eyes), judges each page against the repo's visual standards
docs, and files **one** consolidated, checklist-style bug report into the bug
queue at `docs/bugs/_reports/` (`docs/bugs/_reports/README.md`). It
runs in the operator's session — it is **not** a `materia-ship-spec` stage, and it is
distinct from [`materia-ui-review`](../materia-ui-review/SKILL.md): `materia-ui-review` is the
in-pipeline fifth review angle scoped to a single feature diff and feeds the
remediation loop, whereas `materia-ui-inspection` sweeps the **whole running app**
breadth-first and feeds the bug queue. It reuses `materia-ui-review`'s Eyes machinery
(the provisioning recipe, service env block, canonical viewport, and the
screenshot + DOM-snapshot technique — all from `MATERIA.md` § Eyes) but
applies the same visual rubric across every surface rather than one diff. It
is observe-only: its sole side effects are the report file it writes and the
producer-bookkeeping screenshots it captures.

**Lifecycle:** autonomous (PR-is-the-gate) — per the shared producer contract
at `docs/standards/skills.md` § Producer lifecycle (zero-work exit, id
minting, link integrity, one PR + tooling, no session survival); the clean
exits below (Phase 0 abort, instability degrade) are its zero-work paths.

## Inputs

- **The running app at its dev URL** (`MATERIA.md` § Run it) — the skill
  probes it for liveness in Phase 0 and drives it via the Eyes toolchain. If
  it is **not** already running, Phase 0 **starts it** (per the § Run it
  recipe, falling back to the § Eyes provisioning recipe) rather than
  aborting; the operator no longer has to bring it up by hand first.
- **`docs/surface-map.md` § Pages** — the
  inventory of routes to visit, in the order listed there.
- **The repo's visual standards docs** (the visual-language / UI-components
  standards under `docs/standards/`) — the judgment basis for findings.
- **The queue contract:
  `docs/bugs/_reports/README.md`** — the
  frontmatter shape, filename pattern, body sections, and bookkeeping convention
  the written report MUST conform to.

There are no prior-stage artifacts — this is a producer, not a pipeline stage.

## Outputs

- **Exactly one bug-report folder** in `docs/bugs/_reports/`, at
  `<dated-slug>/report.md` per the queue contract, with frontmatter
  `source: ui-inspection`. One report per run, with a fresh `id`.
- **Captures co-located in the report folder** as `<surface-slug>.{png,html}`,
  one pair per surface. The report's `source_refs` points at the report folder
  when any captures exist.

## Procedure

The run has five phases. Each phase's operator-output states (empty / loading /
error / ready) and error recoveries are as designed below; **no phase may throw
an unhandled error that terminates the operator's session** — each error path
records a note and either continues (surface-level) or writes a partial/minimal
report (phase-level) before returning control cleanly.

### Phase 0 — Preflight

**UI self-gate (first action — before the liveness probe).** Check `MATERIA.md`
§ Surface gates § UI-affecting. If it is `none` — this repo ships no user-facing
surface (`MATERIA.md` § Eyes is `none` too) — there is nothing to inspect: print
one line —
`materia-ui-inspection: skipped (no UI surface — § UI-affecting is none)` — and
end cleanly, writing nothing. This runs **before** step 1 so a no-UI repo never
autostarts the dev stack. (This is a user-invoked producer, so the gate is its
outermost guard — nothing upstream has already filtered by UI.)

1. Probe the running app for liveness (TCP probe of the dev URL from
   `MATERIA.md` § Run it). If it is already reachable, continue to step 3.
2. **Autostart when not reachable — interactive runs only.** Starting
   services and seeding a database are operator-visible machine-state
   changes: on a **non-interactive run** (Auto Mode / scheduled, and no
   explicit `--yes`), a down app takes the clean exit below instead of
   autostarting. On an interactive (or `--yes`) run, do not abort —
   announce "App not reachable — starting it.", **record every service and
   process this run starts** (for Phase 4 teardown), bring the app up, then
   re-probe (bounded wait, ~120s), via the first path that applies:
   - **Documented dev stack (preferred).** Run the `MATERIA.md` § Run it
     recipe and wait for the dev URL to answer.
   - **Provisioning fallback.** If the primary recipe cannot run in this
     environment, apply the Eyes provisioning recipe (`MATERIA.md` § Eyes)
     plus the environment preflight (`MATERIA.md` § Environment preflight) to
     stand the stack up directly, then launch the dev server in the background
     and wait for the dev URL to answer.
   - **Still down → clean exit.** If neither path makes the app reachable within
     the bounded wait, **first tear down anything the autostart attempts
     already started** (the services/processes recorded above — a partially
     up stack is still this run's to stop), then print the remediation step —
     "App not reachable. Start it with the § Run it recipe, then re-run." —
     and exit cleanly **without writing any file** (the original safe-exit
     behaviour, preserved as the final fallback).
3. Read `docs/surface-map.md` § Pages and announce the run plan: "App reachable.
   N surfaces to inspect at the canonical viewport."
4. **Interactive abort prompt.** Present a single yes/no checkpoint before
   provisioning begins: **"Ready to inspect N surfaces? (y/n)"**. This is cheap
   insurance against running on an unseeded or premature app.
   - **When an interactive channel is available** (AskUserQuestion), ask and wait
     for the reply. On `n` / abort, exit cleanly without provisioning or writing
     any file.
   - **When running in Auto Mode / a non-interactive channel** (no
     AskUserQuestion — mirroring `materia-report-bug`'s Auto Mode branch), **auto-proceed**
     and print a "proceeding non-interactively" note instead of blocking on the
     prompt. A `--yes` / non-interactive invocation also bypasses the gate.

   This is the skill's only interactive seam; all later phases run autonomously.

### Phase 1 — Provision

1. **Run the Eyes provisioning recipe (`MATERIA.md` § Eyes) as step 1** —
   always the first action of this phase, never skipped even if the
   environment looks already provisioned (the recipe must be idempotent).
2. **Export the service environment variables the recipe names** before
   driving the browser, in the same command as the drive (shell state does not
   persist between tool calls).
3. **Authenticate** using the dev credentials from `MATERIA.md` § Run it to
   reach any authenticated surfaces. (If the operator has changed the
   credentials they pass them; the § Run it values are the default. Skip when
   the app has no auth.)
4. **Provisioning failure / instability degrade path.** If provisioning fails
   or the browser drive exits with a signature `MATERIA.md` § Eyes lists as
   known environment instability (not a product bug), follow the
   degrade path: print "Eyes provisioning failed (known instability).
   Recording a note and stopping.", **write a stub report** (`source:
   ui-inspection`, `severity: low`, body noting the provisioning failure under
   `## Steps to reproduce` / `## Evidence`), **tear down anything Phase 0
   autostarted** (same rule as Phase 4's teardown step — stop exactly what
   this run started, nothing that pre-existed), and stop. **Never crash the
   operator's session.**

### Phase 2 — Inspect loop

0. **Mint `<dated-slug>`** — do this once, before the capture loop, so the
   report-folder name is in scope for every capture path below. Mint a fresh
   6-char base36 `id` (`LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`),
   derive the `<slug>` from the fixed title `UI/UX inspection — <YYYY-MM-DD>`
   via the normative kebab-slug algorithm in
   `docs/specs/_proposed/README.md` § Kebab-slug derivation, mint the
   timestamp prefix with `date -u +%Y-%m-%d-%H%M%S`, and assemble
   `<dated-slug>` as `<YYYY-MM-DD-HHMMSS>-<id>-<slug>`. This is the same mint recipe
   used in Phase 4 (formerly step 1 of Phase 4; it now lives here so captures
   can reference it immediately).

1. Visit each page from `docs/surface-map.md` § Pages **in surface-map order**,
   at the **canonical viewport** (`MATERIA.md` § Eyes).
2. For each surface, capture a **screenshot and a DOM snapshot** (the same
   "capture so judgment is grounded in observed output, not inference" technique
   `materia-ui-review` uses) into the report folder as
   `docs/bugs/_reports/<dated-slug>/<surface-slug>.png` and
   `docs/bugs/_reports/<dated-slug>/<surface-slug>.html`.
3. **Per-surface error recovery.** If a surface returns an HTTP error, fails to
   render, or its capture fails, record a note under the report's
   `## Preconditions / data setup` section ("Surface `<route>` returned an
   HTTP error; skipped") and **continue to the next surface** — the run does not
   abort. If **all** surfaces error and zero are captured, write a report with
   zero findings and a consolidated "all surfaces failed to load" note.

### Phase 3 — Judge

1. Evaluate each captured surface against the visual rubric — **only** the
   repo's visual-language and UI-components standards under `docs/standards/`
   (token discipline, surface conventions, semantic color roles, component
   rules). Anchor every finding to a **named standard** it violates — no
   free-floating opinions.
2. Accumulate findings up to the **finding cap (default 20)**. The operator may
   pass `--effort low|medium|high` to lower/keep/raise the cap (low → fewer,
   medium → default 20, high → more). The chosen cap and effort level are
   recorded in the report's `## Summary` section so the ceiling is visible.
3. **Sort findings by severity** (critical → high → medium → low) before applying
   the cap, so the most important findings survive. When the cap is reached,
   record a drop note (see Phase 4) and **stop accumulating** additional
   findings.
4. Judgment never crashes: zero findings after a full inspection is a valid,
   positive outcome (write a "No issues found" report in Phase 4).

### Phase 4 — Assemble & write

1. **Use the `<dated-slug>` minted at the top of Phase 2** — do not mint again
   here. The `id`, `<slug>`, and assembled `<dated-slug>` (`<YYYY-MM-DD-HHMMSS>-<id>-<slug>`)
   are already in scope from Phase 2 step 0.
2. **Build the report** with the standard frontmatter and the full 13-section
   body required by the queue contract (see § Report shape below). The findings
   checklist lives **inside `## Evidence`**; the per-finding format and the
   drop note are documented below.
3. **Write the report file** to `docs/bugs/_reports/<dated-slug>/report.md`. If
   the write fails, **surface the OS error to the operator** — do not silently
   discard findings.
4. **Branch / commit / open the PR** — the run is autonomous past the Phase 0
   gate, so once the report is assembled it always finishes on a PR (the opened
   PR is the operator's review surface — PR-is-the-gate; there is no second
   "approve" checkpoint). Sync `main`
   and branch `ui-inspection/<id>-<slug>`, write the report file and its
   co-located captures, run `node scripts/check-docs.mjs` to verify link integrity,
   commit, push `-u origin ui-inspection/<id>-<slug>`, and open a PR with
   `gh pr create` (title `ui-inspection: <title>`, body with the rendered report
   inline, a closing "Triage with `/materia-fix-bug <id>` once this PR lands",
   and the Materia sigil last — `docs/standards/skills.md` § PR attribution — the Materia sigil). The
   only terminal paths that do **not** open a PR are the clean exits defined
   earlier: the Phase 0 abort / unreachable-app exit, and the Phase 1
   instability degrade (which writes a stub report and stops).
5. **Teardown what this run started.** Stop exactly the processes/services
   recorded in Phase 0/Phase 1 (the backgrounded dev server, containers this
   run launched) — and nothing that was already running before the probe.
   Issue teardown as its own command, never chained with follow-up work.
6. Report the outcome to the operator: the path to the report, the finding
   count, whether the cap was hit, the PR URL, and what was torn down.

### Report shape

The report uses the **standard 13-section body** required by
`docs/bugs/_reports/README.md` (Summary · Environment · Steps to reproduce ·
Expected · Actual · Reproducibility · Severity & impact · Affected surface /
route / module · Preconditions / data setup · Evidence · Regression window ·
Workaround · Open questions), every H2 present and in order. The
inspection-specific sections are filled as follows:

- **Frontmatter** — `source: ui-inspection`; `severity` = the **highest**
  severity among all findings (`low` if zero findings); `title: UI/UX
  inspection — <YYYY-MM-DD>`; `source_refs:` points at
  `docs/bugs/_reports/<dated-slug>/` when any captures exist.
- **`## Steps to reproduce`** — describes the inspection run: provision,
  authenticate with the dev credentials, visit each surface at the canonical
  viewport.
- **`## Expected`** — "All surfaces comply with the repo's visual standards
  docs."
- **`## Actual`** — "See the findings checklist in ## Evidence."
- **`## Reproducibility`** — "Reproducible on demand; run `/materia-ui-inspection` to
  regenerate."
- **`## Affected surface / route / module`** — lists the surfaces that had
  findings.
- **`## Regression window`** — "Not applicable; this is a whole-app inspection,
  not a regression."
- **`## Workaround`** — "Not applicable; findings are cosmetic / UI-standard
  violations with no functional workaround."
- **`## Open questions`** — populated only when an ambiguous violation is found
  (e.g. unclear whether a treatment is allowlisted).

**The `## Evidence` findings checklist.** Each finding is one list item carrying
the **surface**, the **observed issue**, the **standard violated**, and an
**optional screenshot reference**:

```markdown
## Evidence

<!-- Consolidated findings checklist from ui-inspection run -->
- [ ] **[<surface>]** <observed issue>
      Standard violated: <token or rule name from the repo's visual standards docs>
      Screenshot: <surface-slug>.png (if captured)
```

**The drop note.** When the finding cap is reached, append this note at the end
of the `## Evidence` section (after the severity-sorted, capped checklist):

```markdown
> **N items dropped** — finding cap reached for this effort level. Re-run
> /materia-ui-inspection to surface more findings.
```

**The `## Summary` section** describes the run — run date, the number of
surfaces visited, the number of findings, the cap, the number dropped, and the
judgment basis:

```markdown
## Summary

Automated UI/UX inspection run on <YYYY-MM-DD>. Visited <N> surfaces at the
canonical viewport. Found <F> issues (cap: <cap>); <D> findings dropped.
Judgment basis: the repo's visual-language and UI-components standards.
```

## Scope

This skill is **observe-and-report only**. It does **NOT**:

- **Edit product files.** It never touches product source, schema, styles, or
  any other product code or UI. Its **only writes** are the one report folder
  in `docs/bugs/_reports/<dated-slug>/` — the `report.md` file and its
  co-located captures (`<surface-slug>.{png,html}`).
- **Fix anything.** It records UI/UX violations; it never remedies them.
- **Open a `materia-ship-spec` or `materia-fix-bug` run**, or trigger any downstream pipeline
  stage. Triage of the filed report (and any fix) is the operator's call via
  `/materia-fix-bug <id>` after the report PR lands.
- **Wire into `materia-ship-spec`'s review loop** — that remains `materia-ui-review`'s job. This
  is a standalone producer.
- **Modify the `docs/bugs/_reports/` contract**, baseline visual regressions, or
  pixel-diff. Judgment stays qualitative against the visual standards docs.
- **Survive session interruption.** It is not resumable mid-run; re-invoke from
  scratch (a fresh `id` is minted). An orphaned **report folder** from a crashed
  run is manually deletable and does not block a fresh run.

## Rules

- **Autostart before aborting.** When the Phase 0 liveness probe fails, start
  the app (§ Run it recipe preferred, provisioning fallback second) and
  re-probe before giving up. The remediation-message clean exit is the
  **final** fallback, taken only when autostart cannot make the app reachable
  — never the first response to a down app.
- **The Eyes provisioning recipe is always step 1** of provisioning — never
  skipped even when the environment looks provisioned (its idempotency makes a
  repeat call safe). The Phase 0 fallback autostart and Phase 1 provisioning
  both call it; the idempotency makes the repeat safe.
- **Export the service env block the recipe names before driving the
  browser** — mandatory whenever the recipe defines one.
- **Degrade gracefully, never crash the session.** On known instability /
  provisioning failure, write a stub report (`source: ui-inspection`,
  `severity: low`, body notes the failure) and stop. Surface-level errors
  record a note and continue.
- **Cap findings** at the default 20 (or the `--effort`-adjusted value), sort by
  severity before capping, and append the drop note when the cap is reached.
  Record the cap and effort level in `## Summary`.
- **Judge against the repo's visual standards docs only** — every finding
  cites a named standard it violates; no free-floating opinions.
- **One report per run with a fresh `id`.** Each invocation mints a new `id` and
  writes one report; multiple reports from successive runs coexist in the queue.
  De-duplication across runs is the operator's responsibility per the queue
  contract.
- **Conform to the queue contract** — valid frontmatter, all 13 H2 sections in
  order, no frontmatter metadata duplicated in the body, report at
  `<dated-slug>/report.md`, captures co-located as `<surface-slug>.{png,html}`
  in the same folder.

## Done when

- The app was probed — and, when not already running, autostarted (§ Run it
  recipe or provisioning fallback) and re-probed, or the clean remediation
  exit taken if it could not be brought up — and the surface plan announced;
  the abort gate honored (interactive) or auto-proceeded (Auto Mode).
- The Eyes toolchain was provisioned (or the instability / failure degrade
  path was taken and a stub report written).
- Each surface in `docs/surface-map.md` § Pages was visited and captured (or its
  error recorded), and findings were judged and capped.
- Exactly one conformant bug report was written to `docs/bugs/_reports/` with
  `source: ui-inspection`, and — on any run that completes past the Phase 0 gate
  without taking the instability degrade path — the branch was pushed and a PR
  opened.
