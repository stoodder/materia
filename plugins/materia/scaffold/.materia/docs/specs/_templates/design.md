<!-- Filled by the `design` skill (or by hand). Ground every choice
     in .materia/docs/product.md § Design feel & taste; see
     ../../standards/ui-components.md for UI conventions. -->

<!-- Design-review-gate approval block (contract only — no live block ships
     in this template). The orchestrator writes the frontmatter block below
     into design.md at the very top of the file (line 1, above both comments,
     as ordinary YAML frontmatter) once the design stage returns its first body; the
     design stage itself never touches it. Shape:

       approval:
         status: pending | approved | auto-approved | abandoned
         by: <human handle> | auto
         at: <ISO-8601>
         reason: <required when status is auto-approved>
         rounds: <integer>   # revision rounds so far, any channel; ship-spec
                              # enforces the ≤3 bound from it
         design_hash: <sha256>   # approved|auto-approved only; body-only hash

     Ownership: orchestrator-owned, like STATUS.md. Sole exception: the
     standalone design skill (no orchestrator present) writes the initial
     `status: pending` block itself. In the orchestrated lane the design
     stage never touches the block.

     The operator hand-editing the body is a blessed feedback channel, never
     a sole-writer violation — a hand-edit is bookkeeping the orchestrator
     commits, not an authorship claim on the block.

     `design_hash` covers the markdown body only — every byte after the
     closing `---` of the frontmatter block; all frontmatter is excluded.
     Normative definition: ship-spec/SKILL.md § Design gate.

     Canvas-pointer keys (only on runs where MATERIA.md § Design tool records a
     connected adapter — its Capabilities line is not `none`). These live
     OUTSIDE and DISJOINT FROM the `approval:` mapping, as a sibling key in the
     same frontmatter block:

       canvas:
         reference: <durable project id | file key | URL>   # never a short-lived
                                                              # preview/session URL
         version: <canvas state/version id>   # only when the adapter exposes one
                                                # (claude-design: per-file etags)

     `reference` is the adapter's durable pointer (MATERIA.md § Design tool's
     `reference` capability); `version` is its canvas-change-detection signal
     when one exists. Written by whichever actor owns canvas I/O per the lane
     split in design/SKILL.md — metadata, like the approval block, never body
     content — and refreshed and committed at every gate commit, so
     canvas-change detection always has a current baseline to diff against.
     Like all frontmatter, both keys are excluded from `design_hash` (the
     normative definition stays ship-spec/SKILL.md § Design gate, above).

     Merge semantics: one frontmatter block per file, always. A writer adding
     `canvas:` inserts it into the existing block alongside `approval:`; it
     never opens a second `---` block — the hash recipe strips the leading
     frontmatter block (first `---` line through the next `---` line,
     inclusive), and a second block would corrupt that recipe.

     Post-approval orchestrator-written banners (course corrections) are
     legal body writes and never re-trigger the gate — the hash answers
     "what did the human approve," not "has the file changed since." -->
# <Feature> — design

> One sentence: the UX in a breath.

## Overview

<!-- The shape of the experience; how it fits the existing app. -->

## Non-UI / CLI / tooling / code-only features — skeleton variant

<!-- Positioned ahead of the UI skeleton so non-UI runs hit it first without
     scrolling past all the UI structure. Delete this section for a product-UI
     feature; delete the UI sections below for a non-UI one.
     ============================================================
     For a skills/docs/tooling feature (no screens, no components), the
     product-UI sections below don't fit. Use this vocabulary swap instead of
     mechanically skipping them:

       - "Screens & states"  →  "Phases & operator output"
       - the four UI states (loading/empty/error/ready)  →  the four operator-
         output states per phase (empty/loading/error/ready), i.e. the
         no-work / in-progress / blocked / done messages the operator sees
       - "Components"  →  "Reused vs new" (which skills/artifacts/sections are
         reused vs newly authored)
       - "Interaction & ergonomics notes"  →  "Invocation & resume notes"
         (how it's invoked, what's interactive, how it resumes)

     ## Phases & operator output

     | Phase | Purpose | Operator-output states |
     |---|---|---|
     |  |  | empty · loading · error · ready |

     ## Reused vs new
     <!-- Which existing skills/templates/sections are reused vs newly authored. -->

     ## Invocation & resume notes
     <!-- Trigger, interactive seams, resume/blocker behavior. -->

     ------------------------------------------------------------
     Code-only changes — a refactor, a config-cleanup, a palette/token swap, a
     pure-docs change — have no operator "phases" at all. For these, drop the
     phases framing entirely and use a lighter shape:

       - "What changes & why"  — the before→after in a line or two, and the
         motivation (the friction or drift being removed).
       - "Surface / blast radius"  — the files, tokens, or call sites touched;
         what stays invariant; what could regress.
       - "Verification"  — how you'll confirm no behavior changed (existing tests
         green, a visual diff for a palette/token swap, grep counts for a
         refactor).

     No state table is required for a code-only change — note "no
     loading/empty/error/ready states (non-behavioral change)" and move on.
     ============================================================ -->

## User flows

<!-- Per story from spec.md: the step-by-step path the user takes. -->

## Screens & states

<!-- Per screen/route: purpose, key elements, visual hierarchy, and the
     loading / empty / error / ready states — use the repo's
     loading/empty/error component conventions from its UI standard.

     Hierarchy: what's primary (the one thing the screen wants done), what's
     secondary (supporting actions), and what's chrome (nav, headers, other
     screen furniture that isn't this screen's content).

     States: all four canonical states stay mandatory per screen — never leave
     one silently undefined. But "n/a — this screen cannot be empty because
     <reason>" is a legal fill-in when a state genuinely doesn't apply (e.g. a
     fixed-config screen with no empty state), and domain-specific states
     beyond the canonical four (e.g. "offline", "conflict") are admitted
     alongside them, never instead of them. -->

| Screen / route | Purpose | Hierarchy | States covered |
|---|---|---|---|
|  |  |  | loading · empty · error · ready |

## Components

<!-- Reused (from the repo's component library) vs new. New reusable
     patterns → the component layer; derived strings/classes → the repo's
     presentation-hook convention (its UI standard names it). -->

## Cohesion anchors

<!-- Binding downstream (implement + ui-review). One row per new/changed
     screen: the 1-3 existing screens most similar in role, and the concrete
     patterns to match (tone-ladder rungs, spacing/typography, header idiom,
     card/list/sheet components, empty/error treatments). Delete for non-UI
     features. -->

| New/changed screen | Anchor screen(s) | Patterns to match |
|---|---|---|
|  |  |  |

## Interaction & ergonomics notes

<!-- Target sizes, reach/ergonomics at the canonical viewport (MATERIA.md
     § Eyes), save/feedback affordances, debounce — per the repo's UI and
     API-layer standards. -->

## Assertions

<!-- The load-bearing section: a checklist of specific, checkable statements
     about the implemented screens, distilled from the design above. Not
     prose — each assertion is one line, imperative, and either passes or
     fails when checked against a rendered screen. Prefer assertions a static
     capture + computed styles can check (an element's presence, its color,
     its spacing, its copy) — the `design-conformance` review angle verifies
     those at review time. Runtime-behavior assertions are legitimate
     design intent too — e.g. "the error state preserves the user's typed
     input," "the list virtualizes above 50 items" — but a static capture
     can't see them: they're checked by the e2e lane instead, where
     `ui-test-plan` reads this section and turns them into guarded flows.
     Write each assertion knowing which lane checks it.

     On a UI run this section must not be empty — a UI design that can
     produce no assertions has not specified anything, and the design stage
     fails rather than emit an empty block.

     Exempt: the non-UI skeleton variant above and the code-only shape it
     nests — neither has a rendered screen to assert against. Delete this
     section entirely for those runs.

     Example checklist lines:
       - [ ] The empty state shows a single primary CTA and no secondary actions.
       - [ ] The primary action is the only filled button on the screen.
       - [ ] Every interactive element has an accessible name.
       - [ ] The error state preserves the user's typed input.
       - [ ] Loading state shows a skeleton, never a blank screen. -->

## Open design questions

<!-- Unresolved UX/scope questions for the operator; remove the section if none. -->

<!-- ## Feedback log — not shipped here; appended by the design stage on the
     first revision round through either channel — a design-gate revision
     round or a pre-gate stage-review revision round (see ship-spec/SKILL.md
     § Design gate and § Stage reviews (design & architecture)) —
     never materialized as an empty section up front. Design-stage-owned
     design content (like the body above it), not orchestrator-owned like the
     approval block. Per round: round number, what was asked, what changed —
     a synced canvas edit counts as a round too. It survives into the PR so a
     reviewer can see how and why the design was revised. -->
