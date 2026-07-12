---
name: curator
description: "Visual-standards sweep of the running app — drives every surface in .materia/docs/surface-map.md at the canonical viewport through the Eyes toolchain, judges each rendered screen against the repo's visual-language and UI-components standards (tokens, spacing, color roles, component rules), fixes the bounded presentation-layer drift directly (markup, styles, tokens, component usage, static copy — never logic or data), re-captures each fixed surface to prove the change, and opens one PR gated by the full local suite, riding it to green but never auto-merging. A finding too large or too behavioral to fix in the envelope becomes a queue entry — a proposed spec or bug report (`source: curator`) committed in the same PR. The visual half of the UI-maintainer pair with `/materia:concierge` (which owns flows, interaction states, a11y, and microcopy); distinct from the in-pipeline `ui-review` angle. Fully autonomous; `--dry-run` previews; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule to re-true the app's look against its standards."
---

# curator — visual-standards sweep of the live app

A single-shot, operator-run (or scheduled) **UI maintainer** skill that drives
the **running app**'s rendered surfaces and re-trues them against the repo's
**visual-language and UI-components standards** under `.materia/docs/standards/`
(token discipline, spacing, semantic color roles, component rules), applies the
bounded, presentation-layer fixes directly, and drives one PR to a green CI
state. It is the visual half of the UI-maintainer pair with
`/materia:concierge` — the curator owns how the app *looks* (tokens, spacing,
component styling); the concierge owns how it *behaves* (flows, interaction
states, a11y, microcopy). Both follow the shared maintainer lifecycle
(`.materia/docs/standards/skills.md` § Maintainer lifecycle) and its
§ UI maintainers — the live-app envelope subsection, which owns the Eyes
provisioning, canonical-viewport capture, edit envelope, and post-fix re-capture
machinery both skills share. This file states only what is curator-specific and
cites those sections for the shared machinery.

**Deliberate posture (like `/materia:janitor`):** the curator **never
auto-merges** — a UI diff has no mechanically-bounded envelope the way the
librarian's docs-only diff does, so it stops at a green PR and the PR review is
the human gate, the same terminal shape as a `ship-spec` run's `finalize`. It is
distinct from `ui-review`, which stays `ship-spec`'s in-pipeline UI review angle
scoped to a single feature diff; the curator sweeps the **whole running app**
breadth-first and lands its own fixes. It is NOT a pipeline stage (no tier; runs
in the operator's session).

## Invocation

```
/materia:curator [--path <route-or-glob>] [--surface <name>] [--dry-run] [--yes]
```

- `--path` / `--surface` — confine the drive to a subset of the surface-map (a
  route glob, or a named surface).
- `--dry-run` — drive and report the fix plan only; no branch, no edits, no PR.
- `--yes` — autostart a down app non-interactively (§ Maintainer lifecycle
  § UI maintainers — the live-app envelope); otherwise a down app on a
  non-interactive run takes the clean remediation exit.

No mid-run checkpoint (autonomous, like `/materia:janitor`); `--dry-run` is the
preview mechanism. Judgment is conservative: an ambiguous or behavior-affecting
fix is noted, never guessed at (§ Rules).

## Inputs

- **The running app at its dev URL** (`MATERIA.md` § Run it) — probed for
  liveness and, on an interactive/`--yes` run, autostarted per § Maintainer
  lifecycle § UI maintainers — the live-app envelope; driven via the Eyes
  toolchain (`MATERIA.md` § Eyes).
- **`.materia/docs/surface-map.md`** (§ Pages for a web app; § Commands for a
  CLI/TUI) — the surfaces to visit, in the order listed there.
- **The repo's visual-language and UI-components standards** under
  `.materia/docs/standards/` — the judgment basis; every finding cites a named
  standard.
- `.materia/docs/contributing.md` — the touch-X→update-Y map, so each fix
  carries its doc updates.
- **Both live queues**, read for dedup — `git ls-files
  '.materia/docs/specs/_proposed/*.md'` and `git ls-files
  '.materia/docs/bugs/_reports/*/report.md'` — plus the recent merge log
  (`git log <trunk> --since='3 months ago' --pretty=oneline`; `<trunk>` per
  `MATERIA.md` § Version control) and the sibling maintainers' open sweep PRs
  (`/materia:concierge` most of all).

## Outputs

- One PR (branch `curator/sweep-<YYYY-MM-DD>`, hex-suffix on same-day rerun)
  carrying the presentation-layer fixes plus the doc updates they demand, the
  before/after capture pairs for every fixed surface (committed in the run
  folder the run names, linked from the PR body), and any queue entries the run
  filed — ridden to green CI and **left open for human review**. The PR body
  lists every fix (with the standard it re-trued), every skip with a rationale,
  every queue entry filed (with its `id` and target queue), every needs-human
  note, and the deferred remainder.
- Zero-drift run (no fixes, no queue entries): a short "nothing to fix" report;
  no branch, no PR.
- `--dry-run`: the fix plan printed to the session; no other output.

## Procedure

The run mechanics a UI maintainer shares — self-gate, liveness probe +
autostart, Eyes provisioning, canonical-viewport capture, the presentation-layer
edit envelope, post-fix re-capture, instability degrade, and teardown — live
once in `.materia/docs/standards/skills.md` § Maintainer lifecycle
§ UI maintainers — the live-app envelope; the lifecycle spine (preflight →
sweep → classify → branch → fix → verify → pre-PR review → PR → ride CI) lives
in that same § Maintainer lifecycle. This section states only the
curator-specific judgment and cites those sections for the machinery.

1. **UI self-gate (first action).** Read `MATERIA.md` § Surface gates
   § UI-affecting; if it is `none`, print one line and end cleanly — no drive,
   no branch, no file (§ Maintainer lifecycle § UI maintainers — the live-app
   envelope). This runs before any liveness probe so a no-UI repo never
   autostarts a dev stack.
2. **Liveness probe + preflight.** Probe the running app for liveness (and, on
   an interactive/`--yes` run, autostart a down app); sync the trunk and confirm
   the forge and verify tooling are reachable (§ Maintainer lifecycle step 1);
   run the Eyes provisioning recipe and authenticate — all per § UI maintainers
   — the live-app envelope.
3. **Sweep — drive + judge.** Visit each in-scope surface in
   `.materia/docs/surface-map.md` in map order at the canonical viewport,
   capturing each; judge every captured surface against the repo's
   **visual-language and UI-components standards** only (token discipline,
   spacing, semantic color roles, component rules). Anchor every finding to a
   **named standard** it violates — no free-floating opinions. Drop a finding
   already covered by a pending queue entry, a recent merge, or a sibling
   maintainer's open sweep PR, naming the overlap (§ Overlap & dedup).
4. **Classify** each finding — bounded presentation-layer fix / oversized queue
   entry / ambiguous needs-human note — per § Maintainer lifecycle step 3. Zero
   fixes **and** zero queue entries → print the zero-drift report and exit; no
   branch, no PR. `--dry-run` → print the full plan and exit.
5. **Branch + fix.** `git checkout -b curator/sweep-<YYYY-MM-DD>` (hex-suffix on
   a same-day rerun); apply the bounded fixes **inside the presentation-layer
   envelope** in small scoped commits (`curator: <what> (<standard it
   violated>)`), each carrying its `.materia/docs/contributing.md` doc updates;
   write any oversized finding as a queue entry (`source: curator`,
   § Maintainer lifecycle § Oversized findings) in its own commit.
6. **Verify by re-capture.** After each fix, re-drive the affected surface and
   capture again, committing the before/after pair into the run folder
   (§ UI maintainers — the live-app envelope, re-capture verification). Then run
   the full local gate (`MATERIA.md` § Gate); a fix that can't be made sound is
   reverted to a needs-human note.
7. **Pre-PR review rounds** at the `curator: reviewer` row (`MATERIA.md` § Tiers
   § Skill routing), ≤3 rounds to convergence (§ Maintainer lifecycle
   § Pre-PR review rounds) — gated on a non-trivial diff.
8. **Open one PR** (`git push -u <remote> curator/sweep-<YYYY-MM-DD>`, then the
   open-PR op, `MATERIA.md` § Version control § Forge), body per § Maintainer
   lifecycle step 8 closing with the Materia sigil naming `curator`; **ride it
   to green, never auto-merge** (§ Maintainer lifecycle steps 9–10). Tear down
   whatever the run started (§ UI maintainers — the live-app envelope) and print
   the closing report.

## Overlap & dedup

The curator and `/materia:concierge` sweep the same app; ownership is drawn so a
finding lands with exactly one of them:

- **Curator owns** component visual styling, spacing, design-token usage, and
  semantic color-role usage.
- **Concierge owns** interaction states (empty/loading/error/disabled), flows,
  navigation coherence, keyboard/focus + a11y (**including contrast** and other
  color-a11y findings), and microcopy.

A contrast or other a11y-adjacent color finding is **concierge's** — drop it
with a named-overlap note rather than fixing it here (a drop is a note, never
a discard — § Maintainer lifecycle § UI maintainers, sibling routing). Dedup
every finding against **both** live queues, the recent merge log, **and** the
sibling maintainers' open sweep PRs before fixing.

## Scope (what this skill does NOT do)

- **NEVER auto-merges and never pushes to the trunk** — the green PR is the
  hand-off; a human merges (a UI diff has no mechanical envelope, unlike the
  librarian's docs-only diff).
- **NEVER edits outside the presentation layer.** Markup, styles, tokens,
  component usage and presentational props (a prop that gates behavior or data
  flow is out of envelope), and static copy only — never logic, data
  derivation, handlers, schema, or wire shapes (§ Maintainer lifecycle § UI
  maintainers — the live-app envelope). A fix that would need any of those is
  oversized (a queue entry) or a needs-human note.
- **Does NOT own experience findings** — interaction states, flows, a11y
  (including contrast), and microcopy are `/materia:concierge`'s; the curator
  drops them with an overlap note (§ Overlap & dedup).
- **NEVER edits or removes** existing artifacts in the historical trees
  (`.materia/docs/specs/**`, `.materia/docs/bugs/**`, `.materia/docs/epics/**`,
  `.materia/docs/research/**`) or the Materia plugin skills (installed
  read-only under `${CLAUDE_PLUGIN_ROOT}/skills/`) — the one carve-out is
  creating a **new** queue entry (§ Maintainer lifecycle § Oversized findings).
- **Not a pixel-diff baseline tool** — judgment stays qualitative against the
  visual standards docs; it baselines no screenshots and diffs no pixels.
- **Distinct from `ui-review`** — that is `ship-spec`'s in-pipeline UI angle on
  a single feature diff; the curator is a standalone whole-app maintainer.
- **Does NOT survive session interruption** — re-invoke fresh; a stray pre-push
  branch is deleted or pushed manually by the operator.

## Rules

- **Ground every fix in a named `.materia/docs/standards/*` visual rule**, cited
  in the commit and the PR body. No rule to cite → skip.
- **Presentation-layer by construction.** A green gate is necessary, not
  sufficient — a fix that could change behavior, data, or a wire shape is not
  fixed inline; it becomes a queue entry or a needs-human note. When in doubt,
  note; a wrong fix in a UI PR costs more than a missed one.
- **Re-capture is the verify** — every fixed surface is re-driven and its
  before/after pair rides the PR; a fix without an observed-output proof is
  reverted (§ Maintainer lifecycle § UI maintainers — the live-app envelope).
- **Dedup is binding** — a finding covered by a pending queue entry, a recent
  merge, or a sibling maintainer's open sweep PR is skipped naming the overlap.
- **Docs ride the same commit** — every fix applies the
  `.materia/docs/contributing.md` touch-X→update-Y map, and doc edits follow
  `.materia/docs/standards/docs.md`.
- **Idempotent + schedulable** — a run against a clean app is a no-op; safe on a
  cron (`/schedule`) or ad hoc.
- **Teardown what the run started** and **never crash the session** on known
  Eyes instability (§ Maintainer lifecycle § UI maintainers — the live-app
  envelope).
- **One PR per run**; an interrupted run is re-invoked fresh (a stray pre-push
  branch is deleted or pushed manually by the operator).
