---
name: design
description: From a feature spec, produce a UX design — authored on the design tool's canvas when an author-capable adapter is configured (MATERIA.md § Design tool), paired with a descriptive design.md (user flows, screens, their loading/empty/error/ready states, and pass/fail assertions) at docs/specs/<dated-slug>/design.md (where <dated-slug> is the timestamped folder name minted at intake, e.g. 2026-06-13-142530-ab24f9-csv-export); with no such adapter the stage authors design.md directly. Stage 2 of the ship-spec pipeline (UI-gated — spawned only when the feature ships UI; skipped and recorded on non-UI runs); usable standalone after a spec exists.
---

# design — UX flows & screens from a spec

Design the feature's screens, flows, and states inside the product's taste
(`docs/product.md`) — on the design tool's canvas when the adapter can
`author`, otherwise into `design.md` directly. Either way the stage produces
`design.md`, the descriptive half of a paired artifact (§ Canvas authoring &
the paired artifact). Runs as a subagent in `ship-spec`; usable standalone
after a spec exists.

**UI-gated.** This stage designs screens; a feature that ships no UI has
nothing for it to design. The orchestrator evaluates the UI-surface gate's
predictive form (`ship-spec/SKILL.md` § Review — § UI-surface gate — that
gate owns the timing and resolution) and skips this stage on non-UI runs —
`architecture` then works from `spec.md` alone, including the
operator-surface enumeration for non-product features (its § Non-product
features).

## Canvas authoring & the paired artifact

**The primary lane is the canvas.** When `MATERIA.md § Design tool` records an
`author`-capable adapter, this stage designs on that tool's canvas: the same
inputs as a repo-side run (`spec.md`, the `docs/product.md` taste sections, the
UI standards, and the design system the adapter returns through its `tokens`
capability), but the deliverable is a real visual design driven over MCP —
flows, screens, and states authored as canvas artifacts. With **no** `author`
adapter — or `MATERIA.md § Design tool` `none`/absent — the stage authors
`design.md` directly, exactly as it always has: a supported lane, not an error.
Which lane you are in is governed by the degradation ladder in
`MATERIA.md § Design tool` — read it, don't restate it here.

**The paired artifact.** The design is one artifact in two halves. The **canvas
is the visual half**; **`design.md` is the descriptive half**. `design.md` is
*not* a textual re-rendering of the canvas — do not transcribe layouts into
prose. It is the context that pairs with the canvas: what each screen is for,
the flows through them, the states each must handle, the interaction contract,
the components reused vs added, the cohesion anchors, and the assertions — the
things a canvas cannot say and a reader (a human, or a fresh-context subagent)
needs alongside it. Visual truth lives on the canvas — and, when the adapter can
`export` (or `read` well enough to reconstruct one, `export: via-read`), in a
committed static snapshot; descriptive truth lives in `design.md`. The
descriptive half is **tool-independent and not optional**:
every downstream stage — `ui-test-plan`, `architecture`, `ui-review` — is a
fresh-context subagent reading the repo, not the canvas, and a spec shipped six
months ago must stay readable when the canvas is gone. Keep `design.md` current
with the canvas at **every pause point**: first presentation, each revision
round, and approval (where the gate freezes it). Same sections as a repo-side
run, same downstream consumers, same exact flow-name contract `ui-test-plan`
depends on.

**The committed snapshot's directory contract.** When export or
export-via-read applies, the snapshot lands at
`docs/specs/<dated-slug>/design/`, a sibling of `design.md` — never inside it,
never a substitute for it. It must be **self-contained**: assets inlined or
co-located under that directory as relative paths, no network fetches, such
that opening `docs/specs/<dated-slug>/design/index.html` straight from disk
(no dev server, no auth) renders correctly. When the tool's own export isn't
self-contained, inline the assets **at write time** — never commit a snapshot
that silently 404s half its assets the moment someone opens it offline.
Mechanics — when it is (re-)written, by which actor, and the README that must
accompany it — are in § Persist step 9 and § Sync mode below.

**The lane split — who holds the MCP connection.** Whether the *spawned* design
stage can touch the canvas is decided by what `MATERIA.md § Design tool`'s
Reachable-from line records for this repo — verify that line, don't assume:

- **MCP reachable inside Agent spawns** → the spawned design stage drives the
  canvas directly: it authors, reads canvas state back, and writes the
  canvas-pointer frontmatter itself.
- **MCP reachable in the operator session only** → the spawned stage **cannot**
  touch the canvas. Split by ownership: the spawned design stage keeps the
  design thinking and the descriptive half — it produces `design.md` plus a
  concrete **canvas-authoring plan** (screens, layout intent, components,
  states, in enough detail to transcribe onto the canvas without re-deciding
  anything). The plan rides the spawn's **return payload** — never a committed
  artifact and never a `design.md` section (committing it would trip the gate's
  clean-tree stamping precondition, and inlining it would make `design.md` the
  transcription this section forbids). The **orchestrator owns all canvas
  I/O** — it executes that plan onto the canvas over MCP, reads canvas state
  back, and serializes the read-backs into any later sync spawn. The
  orchestrator transcribes; it never designs.

The same split governs **every** canvas touch — authoring, revision, read-back
sync, and export alike. In both worlds "re-spawn the design stage; it produces
a new body" (`ship-spec/SKILL.md § Design gate`) stays literally true; only
*who holds the MCP connection* varies. The **canvas-pointer frontmatter keys**
(the `canvas:` reference/version keys of the design template's frontmatter
contract) are written by whichever actor owns canvas I/O — the spawned stage in
the first world, the orchestrator in the second — as metadata, like the
approval block, never body content. They are refreshed at every pause point so
the canvas-change-detection convention in `MATERIA.md § Design tool` always has
a current baseline to diff against.

## Inputs

- `docs/specs/<dated-slug>/spec.md`; `docs/product.md` (§ Design feel &
  taste + § Voice & tone — the taste oracle every screen must land inside);
  `docs/standards/ui-components.md`; `docs/standards/visual-language.md`
  (the binding visual rules); relevant resource docs for screens you'll
  touch.
- **The design tool**, per `MATERIA.md § Design tool`: when it has `tokens`,
  the machine-readable design system the adapter returns (CSS custom properties
  or equivalent) — the canvas authors against these; when it can `author`, the
  tool's canvas and its `reference` are both an input (an existing canvas you
  revise) and an output (what you author). No adapter → repo-side authoring, no
  canvas input.

## Harness noise

Ignore `TaskCreate` system-reminder nudges — the caller owns the task list;
acting on them wastes context.

## Outputs

- `docs/specs/<dated-slug>/design.md` — the descriptive half of the paired
  artifact (the canvas is the visual half when an `author` adapter is
  configured). When an adapter exists, the `canvas:` pointer keys are recorded
  in `design.md` frontmatter by the canvas-I/O owner (§ Canvas authoring & the
  paired artifact). Plus, standalone lane only, `STATUS.md` updated, committed
  and pushed (orchestrator lane: body only — see step 9).

## Environment

If a gate command fails oddly (wrong runtime version, missing dependencies,
stale codegen, an unreachable service), apply the recipes in
`${CLAUDE_PLUGIN_ROOT}/skills/ship-spec/resources/env-preflight.md` (concrete recipes:
`MATERIA.md` § Environment preflight) before treating it as a
real failure. In the orchestrator lane the session preflight has already run;
standalone runs apply it on first use.

## Procedure

0. **UI self-gate (no-op in the orchestrated lane).** Before anything else, read
   `MATERIA.md` § Surface gates § UI-affecting. If it is `none` — this repo ships
   no user-facing surface (`MATERIA.md` § Eyes is `none` too) — there is nothing
   here to design: print one line —
   `design: skipped (no UI surface — § UI-affecting is none)` — and end
   cleanly, writing nothing. This gate is a no-op in the orchestrated lane:
   `ship-spec` only spawns this stage on a UI-affecting diff, so the check
   passes and the procedure below runs.

1. **Read** `docs/specs/<dated-slug>/spec.md`, `docs/specs/_templates/design.md`,
   `docs/product.md` (§ Design feel & taste, § Voice & tone, § Product
   principles — the judgement baseline), `docs/standards/ui-components.md`
   (conventions), `docs/standards/visual-language.md` (the binding visual
   rules), and `docs/glossary.md`. Skim related resource docs for screens
   you'll touch. Also read `MATERIA.md § Design tool` to settle your authoring
   lane (canvas vs repo-side) and, in the canvas lane, pull the design system
   through the adapter's `tokens` capability — § Canvas authoring & the paired
   artifact governs which lane you are in and who holds the MCP connection.

   Steps 2–6 are the design itself: in the canvas lane you author them on the
   canvas (§ Canvas authoring & the paired artifact) while capturing the
   descriptive half in `design.md`; in the repo-side lane they go into
   `design.md` directly. Step 7 distills the assertions, step 8 writes the
   descriptive half, step 9 persists.

2. **Flows.** For each user story, write the step-by-step path the user takes
   (entry → actions → outcome), grounded in the usage context from
   `docs/product.md` § Audience & market.

3. **Screens & states.** For every screen/route, define purpose, key elements,
   its **visual hierarchy** — what's primary (the one thing the screen wants
   done), secondary, and chrome (the template's Hierarchy column) — and its
   states. The **four canonical states — loading, empty, error, ready — stay
   mandatory per screen**, matching the repo's loading/empty/error component
   conventions (its UI standard names them). A state that genuinely cannot
   occur is recorded as an explicit `n/a — this screen cannot be <state>
   because <reason>`, never left silent; **domain-specific states** beyond the
   canonical four (e.g. offline, conflict) are admitted alongside them, never
   instead of them. Never a silent omission.

4. **Components.** Identify what's **reused** from `components/` vs **new**. New
   reusable patterns → `components/`; derived strings/classes/tones → a
   presentation hook per the repo's UI standard (never inline UI logic in
   models/contracts).

5. **Interaction notes.** Target sizes, reach/ergonomics at the canonical
   viewport (`MATERIA.md` § Eyes), optimistic save feedback, debounce —
   per the repo's UI and API-layer standards.

6. **Cohesion anchors.** For each new or changed screen, pick the **1–3
   existing screens most similar in role** (list page, detail page,
   sheet/modal, home card) and record them in a `## Cohesion anchors` section
   of `design.md`: the anchor screen(s) plus the concrete patterns the new
   screen must match — surface-tone ladder rungs, spacing/typography scale,
   header/nav idiom, card/list/sheet components, empty/error treatments. This
   section is **binding downstream**: implementers reuse the anchors'
   components and presentation hooks instead of inventing near-duplicate
   patterns, and `ui-review` captures the anchor screens for a side-by-side
   cohesion comparison. The failure mode this closes: a screen that satisfies
   every token rule *in isolation* but still reads as foreign next to its
   siblings — per-screen correctness doesn't compose into app-level cohesion
   unless the anchors make it checkable.

7. **Assertions.** Distill the design into a `## Assertions` checklist — each
   line one-line, imperative, and pass/fail when checked against a **rendered**
   screen. Prefer statically-checkable assertions (an element's presence,
   color, spacing, copy — what a static capture plus computed styles can see;
   the `design-conformance` review angle verifies these at review time);
   runtime-behavior assertions (e.g. "the error state preserves the user's
   typed input") are legitimate design intent but belong to the e2e lane —
   write them knowing `ui-test-plan` reads this section and turns them into
   guarded flows. **Hard rule (UI runs):** a `design.md` that can produce no
   assertions has not specified anything — **fail the run rather than writing
   an empty `## Assertions` block**, with the concrete line
   `Blocker: design produced no checkable assertions — <one line on what the
   design lacks> — revise spec.md or the design, then resume` (the same shape
   as step 9's git-ignore hard stop, and the same lane split: in the
   standalone lane write it to `STATUS.md` and end the turn; in the
   orchestrator lane return this exact `Blocker:` line in the return payload
   for the generic spawned-stage-Blocker hand-off, `ship-spec/SKILL.md`
   § STATUS.md ownership (orchestrator lane)).
   This binds every lane: the canvas lane and a `MATERIA.md § Design tool`
   `none` repo are held to it identically. Exempt: the non-UI skeleton variant
   and the code-only shape — neither has a rendered screen to assert against.

8. **Write** `docs/specs/<dated-slug>/design.md` — the descriptive half. In the
   canvas lane the visual design already lives on the canvas; `design.md`
   captures what the canvas cannot say (§ Canvas authoring & the paired
   artifact), never a transcription of it. Flag any genuinely open design
   question, but resolve everything that affects architecture now.

   **Auto Mode allowance for non-blocking judgement calls.** Small design
   judgement calls — choices that don't affect architecture and that the
   operator could reasonably flip later (e.g. delete a legacy palette key
   vs alias it; adopt the repo's existing error-state component on a
   page that previously had an ad-hoc error block; remove a subline
   alongside a wordmark rebrand) — are **made here**, with a one-bullet
   "Open design questions — non-blocking" entry in `design.md` naming
   the call AND the alternative. Do not ask the operator at design time;
   the entry exists so `plan-tasks` (or the operator) can flip it later
   without re-running design. Reserve clarifying questions for choices
   that genuinely change scope or block downstream stages.

9. **Persist.**

   **Sole-writer split.** The design stage owns the `design.md` **body and
   `## Feedback log`** — the log is design content (round number, what was
   asked, what changed), appended on the first gate revision round or the
   first pre-gate stage-review revision round (gate rounds: the loop defined
   in `ship-spec/SKILL.md` § Design gate; pre-gate rounds: § Stage reviews
   (design & architecture) — § Design-stage review); a canvas-sync write
   (§ Sync mode) is a design-stage write of the same two things. The **approval
   block is orchestrator-owned** (the standalone-lane exception below is the
   sole place this skill writes it). The **`canvas:` frontmatter keys** are
   neither body nor approval block: they are canvas-I/O-owner metadata, written
   by whichever actor holds the MCP connection per the lane split (§ Canvas
   authoring & the paired artifact) — the spawned stage when spawns reach the
   canvas, the orchestrator when they don't — refreshed at each pause point and
   carried in the gate commit; being frontmatter, they never enter the
   body-only `design_hash`. The operator hand-editing the body is a blessed
   feedback channel, never a sole-writer violation.

   On a revision round — either a **gate revision round** (re-spawned by
   `ship-spec` with the operator's feedback and any hand-edits, numbered on the
   gate's own rounds) or a **pre-gate stage-review revision round** (re-spawned
   with the stage-review findings as feedback, numbered on its own
   `stage-review r<N>` scale — normative home `ship-spec/SKILL.md` § Stage
   reviews (design & architecture) — § Design-stage review) — produce a new
   body and append the round to `## Feedback log`. Where a hand-edit or
   feedback item expresses **visual intent**, apply it onto the canvas during
   this same revision so the two halves never fork; a purely descriptive edit —
   a new assertion, a corrected flow — may leave the canvas untouched. The
   stage judges which is which and records that judgement in the
   `## Feedback log` entry. Still never touch the approval block on either
   round. (At an **approve** there is no re-authoring — `ship-spec/SKILL.md`
   § Design gate's edited-body rule governs.)

   **Committed snapshot (export).** On first authoring and on every full
   revision round (the re-spawned-with-feedback path just above — never sync
   mode; § Sync mode wires that re-export separately) — once the canvas-owned
   content is current — export or reconstruct the canvas as the self-contained
   static snapshot described in § Canvas authoring & the paired artifact's
   directory contract, performed by the **same actor** who holds the MCP
   connection for this touch. That's the lane split's existing "and export
   alike" rule (§ Canvas authoring & the paired artifact, "The lane split"
   subsection) — nothing new to decide here, just invoke it for this write.
   Skip cleanly — print one line naming what was skipped, per
   `MATERIA.md § Design tool`'s Degradation conventions — when either: no
   `author` adapter is configured (the repo-side lane; there is no canvas to
   export), or the adapter has neither `export` nor `read` to reconstruct from
   (that Degradation entry: "no snapshot, and the design-conformance check
   degrades per its own ladder"). A skipped snapshot never blocks the rest of
   this step.

   Before writing the directory, run
   `git check-ignore docs/specs/<dated-slug>/design/`. A match is a **hard
   stop** — never a silent skip and never a quiet no-commit: write
   `Blocker: design snapshot path is git-ignored — <path> — remove or adjust
   the local ignore rule, then resume` to `STATUS.md` and end the turn (the
   same shape as this skill's other hard stops, e.g. the rounds-exhaustion
   Blocker in `ship-spec/SKILL.md` § Revision bound). In the standalone lane
   (below) the stage owns `STATUS.md` already and writes this directly; in the
   orchestrator lane (below), where `STATUS.md` stays orchestrator-owned, the
   stage instead fails the run and returns this exact `Blocker:` line in its
   return payload — the orchestrator writes it verbatim to `STATUS.md`,
   commits, and surfaces it to the human (`ship-spec/SKILL.md` § STATUS.md
   ownership (orchestrator lane) is the normative home for this generic
   spawned-stage-Blocker hand-off, which also carries step 7's assertions
   hard rule).

   Alongside the exported assets, write `README.md` from
   `docs/specs/_templates/design-snapshot-readme.md` (read that template, do
   not inline its content here), filled in with this run's specifics: the
   `semantic-structure: yes/no` line **verified against the actual exported
   markup** (never asserted from how the design merely looks on the canvas),
   and — only when this adapter is `export: via-read` — the honesty clause
   naming which of the three fabrication-contract properties (`fabricated`,
   `faithful`, `semantic structure`) this reconstruction actually preserves.
   This README lives under `docs/specs/**`, so it is bound by the
   spawn-contract's no-live-markdown-links rule (arrow form only,
   `text → path`) — `ship-spec/resources/spawn-contract.md` Block 1.

   The snapshot is a **sibling directory**, never `design.md` itself: this
   changes nothing about the sole-writer split above or the `design_hash`
   recipe (frontmatter-excluded, body-only, per `ship-spec/SKILL.md`
   § `design_hash`). Like `docs/specs/<dated-slug>/ui-proof/`, the directory's
   presence is checked directly — it gets no frontmatter pointer of its own;
   the `canvas:` keys' job is change-detection, not snapshot-existence.

   **Orchestrator lane (spawned by `ship-spec`/`fix-bug`):** the freshly
   returned `design.md` is adversarially reviewed once, pre-gate, before the
   design gate's first arrival — `ship-spec/SKILL.md` § Stage reviews (design
   & architecture) — § Design-stage review; a standalone (operator-invoked)
   run has no such loop. Do **not** tick `STATUS.md`, do **not** commit it,
   and do **not** touch the approval block — the orchestrator owns
   `STATUS.md`, the design row, `Next:`, and the whole approval block
   (`ship-spec/SKILL.md` § STATUS.md ownership (orchestrator lane);
   § Design gate). Write only your own artifact (the `design.md` body).
   Unchanged from before the gate existed.

   **Standalone lane (operator-invoked directly, not a spawn):** this is the
   **sole standalone-lane exception** to the approval block's orchestrator
   ownership (`ship-spec/SKILL.md` § Design gate — Sole-writer split) — here the
   skill writes the initial approval block itself. Because this lane is
   operator-invoked (the skill holds any canvas connection itself), the skill
   also owns canvas I/O here — it writes the `canvas:` pointer keys, when
   `MATERIA.md § Design tool` records an adapter, into that same single
   frontmatter block alongside `approval:` (metadata, never body; one block,
   per the template's merge rule). Resolve the gate for this run, then persist:

   - **Resolve the gate** — consult, in order: a captured
     `design-gate: <on|off> (proposal frontmatter)` line in `STATUS.md`
     § Notes (present when `ship-spec` staked this folder from a proposal
     declaring `design_gate:`), then `MATERIA.md` § Design tool's Design gate
     default (absent section or knob → on). The invocation-flag rung
     (`--approve-design`) cannot apply in this lane.
   - **No `STATUS.md` at all** — a hand-created spec folder may have none: seed
     one from `docs/specs/_templates/status.md` — fill `Slug:` (the folder
     name), leave `Branch:` at the template placeholder (`ship-spec`'s resume
     backfills it on any route, gate pending or already auto-approved —
     § Design gate — Standalone-first lane and § Resume step 3's
     placeholder-branch guard), leave `## Provenance` ad-hoc (`—`) — rather
     than failing or writing `Next:` into a file that doesn't exist.
   - **Gate ON** → write the approval block into `design.md` frontmatter
     (`status: pending`, `rounds: 0`, no hash — the very top of the file,
     ordinary YAML frontmatter), tick stage 2, set
     `Next: design-approval (awaiting operator)`, append
     `design-gate: awaiting approval` to `STATUS.md` § Notes, commit + push. A
     later `/materia:ship-spec <slug>` resume then routes to the gate (its
     Resume step 0) instead of silently building an unapproved design.
   - **Gate OFF** → stamp `status: auto-approved, by: auto, at: <ISO-8601>,
     reason: <the deciding knob's reason string>` — the reason is
     `proposal frontmatter design_gate: off` or `MATERIA.md gate: off` — compute
     and write `design_hash` per the single normative recipe in
     `ship-spec/SKILL.md` § Design gate (body-only — that section is the only
     definition), tick stage 2, set `Next: architecture`, append
     `design-gate: auto-approved (<full reason string>)` to `STATUS.md`
     § Notes, commit + push — today's behavior plus the recorded decision.
   - **The persist commit** — either resolution — carries the gate-marker
     subject prefix `design-gate(<dated-slug>):` (`ship-spec/SKILL.md`
     § Design gate — Gate commits), keeping the pending-edit-detection baseline
     uniform (diff against the most recent gate-marked commit; no
     unmarked-commit fallback needed).

   This standalone seed/write runs in the **operator-invoked** lane, not a
   spawn — the spawn-contract's `STATUS.md` monopoly (Block 1) binds spawned
   subagents and is not contradicted here, so no new carve-out is needed there.

## Done when

- Every spec story has a flow; every screen records its hierarchy
  (primary/secondary/chrome) and its states — the four canonical states each
  present or an explicit `n/a — <reason>`, never silently omitted, with any
  domain-specific states admitted alongside them.
- Every new/changed screen names its anchor screen(s) in `## Cohesion anchors`.
- Reused vs new components are listed.
- **UI runs** (both the canvas lane and a `MATERIA.md § Design tool` `none`
  repo, identically): `## Assertions` is non-empty — one-line, imperative,
  pass/fail-against-a-rendered-screen statements distilled from the design; a UI
  `design.md` that can produce none has specified nothing and **fails rather
  than shipping an empty block** (non-UI skeleton variant and code-only shape
  exempt).
- **Paired-artifact currency:** when an adapter is configured, the `canvas:`
  pointer is recorded in frontmatter and `design.md` (the descriptive half) is
  current with the canvas at this pause point — first presentation, revision
  round, or approval.
- No design decision needed by the architecture stage is left ambiguous.
- Orchestrator lane: only the `design.md` body is written — the orchestrator
  ticks `STATUS.md`, sets `Next:`, and owns the approval block. Standalone lane:
  `STATUS.md` ticked with the approval block written and `Next:` set —
  `design-approval (awaiting operator)` when the gate is on, `architecture` when
  off (auto-approved, `design_hash` computed) — design committed + pushed.

## Sync mode

`ship-spec` may re-spawn this skill in **sync mode** at a gate arrival where the
canvas changed since the last gate commit — a compact unit, not a full
authoring run. The normative flow (when it fires, how the round is counted) is
`ship-spec/SKILL.md` § Design gate; this contract defines only the unit's I/O.

- **Inputs:** a serialized canvas read-back (the orchestrator's, when canvas
  I/O is operator-session-only; the stage's own read otherwise — the lane split
  in § Canvas authoring & the paired artifact decides) plus the current
  `design.md`.
- **Outputs:** the **canvas-owned** sections of `design.md`, re-derived from the
  read-back, and that round's `## Feedback log` entry (what changed on the
  canvas, and — per the revise-path rule — which edits were visual vs
  descriptive). Canvas-owned = what the read-back can reproduce — the
  screen/state/layout facts the canvas holds; the descriptive-judgement
  content (flow reasoning, cohesion anchors, assertions) is never re-derived.
- **Snapshot re-export.** When the adapter can `export` (or reconstruct via
  `read`), sync mode's outputs also include a re-derived committed snapshot
  at `docs/specs/<dated-slug>/design/` (§ Canvas authoring & the paired
  artifact's directory contract) plus its `README.md`, from the same serialized
  canvas read-back that re-derives the body above — same inputs, same
  self-contained requirement, same git-ignore guard (§ Persist step 9). Who
  actually performs it in the operator-only-MCP world (where the spawned sync
  unit never touches MCP) follows the same actor-per-lane rule as everything
  else in this section (§ Canvas authoring & the paired artifact, "The lane
  split") — `ship-spec/SKILL.md`'s Actor split paragraph is the normative home
  for spelling that out, not restated here.
- **Precedence:** operator hand-edits are **authoritative** for the sections
  they touch. Sync re-derives **only** canvas-owned content and never overwrites
  operator-authored descriptive edits — the canvas cannot produce an
  `## Assertions` line, so re-derivation never rewrites what the operator typed
  there.
- **Never the approval block.** Sync mode writes body + `## Feedback log` only
  (both design-stage writes). The orchestrator increments `approval.rounds` (at
  most one per gate arrival; a terminal stamping arrival counts none — both per
  `ship-spec/SKILL.md` § Design gate) and owns the block; the sync unit writes
  the log entry. The `canvas:` pointer keys are refreshed by the canvas-I/O
  owner as usual.

## Scope

This skill does **not**:

- **Do technical planning.** Mapping the feature onto existing resources, the
  data model, the API surface, and the blast-radius/edit-set discovery greps
  all belong to `architecture` (its § Procedure steps 2 and 6). `design.md`
  is a UX artifact — screens, flows, states, cohesion, and the assertions
  distilled from them — and stops there; overlap between the two documents is
  drift, not thoroughness.
- **Run for non-UI features.** A Claude Code skill, a CLI helper, a refactor —
  the orchestrator's UI gate skips this stage, and `architecture` § Non-product
  features carries the operator-facing phase/output enumeration instead. A
  standalone invocation **enforces** the same outcome: the § Procedure step 0 UI
  self-gate exits on a repo whose `MATERIA.md` § Surface gates § UI-affecting is
  `none` (no screens, no design stage) — it does not merely advise.
