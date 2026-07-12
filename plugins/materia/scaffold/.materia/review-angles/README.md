# Review angles

Canonical review-angle definitions for the pipeline's review points: the
post-implementation `ship-spec` Review fan-out, and the stage-review points
after the `design` stage and after the `architecture`/`bug-analysis` stage.
Each `<slug>.md` file describes one angle — what it checks and how to run it.
The fan-out spawns one reviewer per applicable angle after the implement loop
completes; each stage-review point spawns one reviewer per applicable angle
right after that stage returns its artifact.

This README is a plain doc, not an angle: it carries no `name` / `description`
front matter.

## Front-matter schema

Each angle file carries exactly two front-matter keys:

- `name` — the angle slug; must equal the filename stem (e.g. `correctness`).
- `description` — one sentence: what this angle reviews.

No other keys. The File → Gate → Tier mapping lives in `MATERIA.md § Review
angles`, not in the file — a stray `gate:`, `tier:`, or `category:` key here is
invalid.

## Body conventions

Each body states:

- **What it checks** — the defects the angle hunts, and the finding categories
  it emits.
- **How to run it** — which skill to invoke, or the inline procedure when no
  skill applies. A harness-provided skill may be absent from a session; when a
  named skill is unavailable, running the angle inline is the documented
  procedure, not a deviation.
- **Gate rationale** — for a gated angle, the plain-English condition under
  which the angle is relevant. Never write the gate token; the gate value has
  one home, the `MATERIA.md § Review angles` registry.

Reviewer calibration — the severity rubric, the structured finding shape, and
verify-before-reporting — is provided centrally by the `ship-spec` review
machinery (its § Severity rubric and § Structured finding schema sections, plus
the spawn contract's reviewer block), so angle files stay mission-only and add
no generic review rubric.

Every file path is backtick prose, never a live markdown link.

## Adding a new angle

1. Drop a `<slug>.md` file here with the two-key front matter.
2. Add a row to `MATERIA.md § Review angles` — the registry that owns the
   File → Gate → Tier mapping — and pick a Tier.

## Canonical angles are special-cased in ship-spec

The `ship-spec` **markdown-only exemption** and **trivial-diff threshold**
special-case four of the canonical post-implementation angle slugs
(`correctness`, `security`, `spec-adherence`, `behavior`) — the fan-out's own
exemption set; stage-review angles are a separate mechanism with their own
gating (`ship-spec/SKILL.md` § Stage reviews (design & architecture)). A
project that renames or removes one of these four must update `ship-spec` §
Review too.
