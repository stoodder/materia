<!-- Filled by the `design` skill (or by hand). Ground every choice
     in docs/product.md § Design feel & taste; see
     ../../standards/ui-components.md for UI conventions. -->

<!-- Design-review-gate approval block (contract only — no live block ships
     in this template). The orchestrator writes the frontmatter block below
     into design.md at the top of the file (above this comment, as ordinary
     YAML frontmatter) once the design stage returns its first body; the
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

<!-- Per screen/route: purpose, key elements, and the loading / empty / error /
     success states (every screen must define all four — use the repo's
     loading/empty/error component conventions from its UI standard). -->

| Screen / route | Purpose | States covered |
|---|---|---|
|  |  | loading · empty · error · ready |

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

## Open design questions

<!-- Unresolved UX/scope questions for the operator; remove the section if none. -->

<!-- ## Feedback log — not shipped here; appended by the design stage on the
     first design-gate revision round (see ship-spec/SKILL.md § Design gate),
     never materialized as an empty section up front. Design-stage-owned
     design content (like the body above it), not orchestrator-owned like the
     approval block. Per round: round number, what was asked, what changed.
     It survives into the PR so a reviewer can see how and why the design was
     revised. -->
