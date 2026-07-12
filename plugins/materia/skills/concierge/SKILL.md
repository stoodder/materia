---
name: concierge
description: "Experience sweep of the running app — drives every surface and flow in .materia/docs/surface-map.md at the canonical viewport through the Eyes toolchain and judges the lived experience against the repo's design/UX and a11y standards: interaction states (empty/loading/error/disabled), flow and navigation coherence, keyboard/focus and accessibility (including contrast), and microcopy quality. Fixes the bounded presentation-layer drift directly (markup, component usage, static display strings — never validation logic or derived messages), re-captures each fixed surface to prove the change, and opens one PR gated by the full local suite, riding it to green but never auto-merging. A finding too large or too behavioral to fix in the envelope becomes a queue entry — a proposed spec or bug report (`source: concierge`) committed in the same PR. The experience half of the UI-maintainer pair with `/materia:curator` (which owns tokens, spacing, and component styling); distinct from the in-pipeline `ui-review` angle. Fully autonomous; `--dry-run` previews; zero-drift runs exit clean with no branch or PR. Use on demand or on a schedule to re-true how the app feels to use."
---

# concierge — experience sweep of the live app

A single-shot, operator-run (or scheduled) **UI maintainer** skill that drives
the **running app**'s surfaces and flows and re-trues the lived experience
against the repo's **design/UX and accessibility standards** under
`.materia/docs/standards/` and the flows in `.materia/docs/surface-map.md`,
applies the bounded, presentation-layer fixes directly, and drives one PR to a
green CI state. It is the experience half of the UI-maintainer pair with
`/materia:curator` — the concierge owns how the app *behaves* (flows,
interaction states, a11y, microcopy); the curator owns how it *looks* (tokens,
spacing, component styling). Both follow the shared maintainer lifecycle
(`.materia/docs/standards/skills.md` § Maintainer lifecycle) and its
§ UI maintainers — the live-app envelope subsection, which owns the Eyes
provisioning, canonical-viewport capture, edit envelope, and post-fix re-capture
machinery both skills share. This file states only what is concierge-specific and
cites those sections for the shared machinery.

**Deliberate posture (like `/materia:janitor`):** the concierge **never
auto-merges** — a UI diff has no mechanically-bounded envelope the way the
librarian's docs-only diff does, so it stops at a green PR and the PR review is
the human gate, the same terminal shape as a `ship-spec` run's `finalize`. It is
distinct from `ui-review`, which stays `ship-spec`'s in-pipeline UI review angle
scoped to a single feature diff; the concierge sweeps the **whole running app**
breadth-first and lands its own fixes. It is NOT a pipeline stage (no tier; runs
in the operator's session).

## Invocation

```
/materia:concierge [--path <route-or-glob>] [--surface <name>] [--dry-run] [--yes]
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
  toolchain (`MATERIA.md` § Eyes), exercising each surface's interaction states.
- **`.materia/docs/surface-map.md`** (§ Pages for a web app; § Commands for a
  CLI/TUI) — the surfaces and flows to walk, in the order listed there.
- **The repo's design/UX and accessibility standards** under
  `.materia/docs/standards/` — the judgment basis; every finding cites a named
  standard.
- `.materia/docs/contributing.md` — the touch-X→update-Y map, so each fix
  carries its doc updates.
- **Both live queues**, read for dedup — `git ls-files
  '.materia/docs/specs/_proposed/*.md'` and `git ls-files
  '.materia/docs/bugs/_reports/*/report.md'` — plus the recent merge log
  (`git log <trunk> --since='3 months ago' --pretty=oneline`; `<trunk>` per
  `MATERIA.md` § Version control) and the sibling maintainers' open sweep PRs
  (`/materia:curator` most of all).

## Outputs

- One PR (branch `concierge/sweep-<YYYY-MM-DD>`, hex-suffix on same-day rerun)
  carrying the presentation-layer fixes plus the doc updates they demand, the
  before/after capture pairs for every fixed surface (committed in the run
  folder the run names, linked from the PR body), and any queue entries the run
  filed — ridden to green CI and **left open for human review**. The PR body
  lists every fix (with the standard it re-trued), every skip with a rationale,
  every queue entry filed (with its `id` and target queue), every needs-human
  note, and the deferred remainder.
- Zero-drift run (no fixes, no queue entries): a short "nothing to fix — the
  floor's running smoothly" report;
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
concierge-specific judgment and cites those sections for the machinery.

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
3. **Sweep — drive + judge.** Walk each in-scope surface and flow in
   `.materia/docs/surface-map.md` in map order at the canonical viewport,
   exercising its interaction states (empty/loading/error/disabled) and
   capturing each; judge the lived experience against the repo's **design/UX and
   accessibility standards** only — interaction states, flow and navigation
   coherence, keyboard/focus + a11y (including contrast), and microcopy quality.
   Anchor every finding to a **named standard** it violates — no free-floating
   opinions. Drop a finding already covered by a pending queue entry, a recent
   merge, or a sibling maintainer's open sweep PR, naming the overlap
   (§ Overlap & dedup).
4. **Classify** each finding — bounded presentation-layer fix / oversized queue
   entry / ambiguous needs-human note — per § Maintainer lifecycle step 3. Zero
   fixes **and** zero queue entries → print the zero-drift report and exit; no
   branch, no PR. `--dry-run` → print the full plan and exit.
5. **Branch + fix.** `git checkout -b concierge/sweep-<YYYY-MM-DD>` (hex-suffix
   on a same-day rerun); apply the bounded fixes **inside the presentation-layer
   envelope** in small scoped commits (`concierge: <what> (<standard it
   violated>)`), each carrying its `.materia/docs/contributing.md` doc updates;
   write any oversized finding as a queue entry (`source: concierge`,
   § Maintainer lifecycle § Oversized findings) in its own commit.
6. **Verify by re-capture.** After each fix, re-drive the affected surface (and
   its affected states) and capture again, committing the before/after pair into
   the run folder (§ UI maintainers — the live-app envelope, re-capture
   verification). Then run the full local gate (`MATERIA.md` § Gate); a fix that
   can't be made sound is reverted to a needs-human note.
7. **Pre-PR review rounds** at the `concierge: reviewer` row (`MATERIA.md`
   § Tiers § Skill routing), ≤3 rounds to convergence (§ Maintainer lifecycle
   § Pre-PR review rounds) — gated on a non-trivial diff.
8. **Open one PR** (`git push -u <remote> concierge/sweep-<YYYY-MM-DD>`, then the
   open-PR op, `MATERIA.md` § Version control § Forge), body per § Maintainer
   lifecycle step 8 closing with the Materia sigil naming `concierge`; **ride it
   to green, never auto-merge** (§ Maintainer lifecycle steps 9–10). Tear down
   whatever the run started (§ UI maintainers — the live-app envelope) and print
   the closing report.

## Overlap & dedup

The concierge and `/materia:curator` sweep the same app; ownership is drawn so a
finding lands with exactly one of them:

- **Concierge owns** interaction states (empty/loading/error/disabled), flows,
  navigation coherence, keyboard/focus + a11y (**including contrast** and other
  color-a11y findings), and microcopy quality.
- **Curator owns** component visual styling, spacing, design-token usage, and
  semantic color-role usage.

A pure token, spacing, or component-styling finding is **curator's** — drop it
with a named-overlap note rather than fixing it here — **unless** it is
visible only in a state or flow this sweep drives (curator's default-render
drive will never render it): then this run surfaces it itself, as a
needs-human note or a queue entry naming curator, per the sibling-routing
rule (§ Maintainer lifecycle § UI maintainers). A drop is a note, never a
discard. Dedup every finding against **both** live queues, the recent merge
log, **and** the sibling maintainers' open sweep PRs before fixing.

## Scope (what this skill does NOT do)

- **NEVER auto-merges and never pushes to the trunk** — the green PR is the
  hand-off; a human merges (a UI diff has no mechanical envelope, unlike the
  librarian's docs-only diff).
- **NEVER edits outside the presentation layer.** Markup, component usage and
  presentational props (a prop that gates behavior or data flow is out of
  envelope), and **static display copy** only — never validation logic, event
  handlers, data derivation, schema, or wire shapes (§ Maintainer lifecycle
  § UI maintainers — the live-app envelope). A microcopy fix is a change to a
  **literal display string**; a message a code path *assembles* or derives is
  oversized (a queue entry) or a needs-human note, never edited inline.
- **Does NOT own visual-styling findings** — tokens, spacing, and component
  styling are `/materia:curator`'s; the concierge drops them with an overlap
  note (§ Overlap & dedup).
- **NEVER edits or removes** existing artifacts in the historical trees
  (`.materia/docs/specs/**`, `.materia/docs/bugs/**`, `.materia/docs/epics/**`,
  `.materia/docs/research/**`) or the Materia plugin skills (installed
  read-only under `${CLAUDE_PLUGIN_ROOT}/skills/`) — the one carve-out is
  creating a **new** queue entry (§ Maintainer lifecycle § Oversized findings).
- **Not a pixel-diff baseline tool** — judgment stays qualitative against the
  design/UX standards; it baselines no screenshots and diffs no pixels.
- **Distinct from `ui-review`** — that is `ship-spec`'s in-pipeline UI angle on
  a single feature diff; the concierge is a standalone whole-app maintainer.
- **Does NOT survive session interruption** — re-invoke fresh; a stray pre-push
  branch is deleted or pushed manually by the operator.

## Rules

- **Ground every fix in a named `.materia/docs/standards/*` design/UX or a11y
  rule**, cited in the commit and the PR body. No rule to cite → skip.
- **Presentation-layer by construction.** A green gate is necessary, not
  sufficient — a fix that could change behavior, data, a wire shape, or a
  logic-derived message is not fixed inline; it becomes a queue entry or a
  needs-human note. When in doubt, note; a wrong fix in a UI PR costs more than
  a missed one.
- **Microcopy fixes stay literal** — only a static display string is editable
  inline; a message assembled or derived in code is oversized or noted.
- **Re-capture is the verify** — every fixed surface (and its affected states)
  is re-driven and its before/after pair rides the PR; a fix without an
  observed-output proof is reverted (§ Maintainer lifecycle § UI maintainers —
  the live-app envelope).
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
