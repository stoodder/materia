# Review angles

Canonical review-angle definitions for the `ship-spec` Review fan-out. Each
`<slug>.md` file describes one angle — what it checks and how to run it. The
fan-out spawns one reviewer per angle after the implement loop completes.

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

Every file path is backtick prose, never a live markdown link.

## Adding a new angle

1. Drop a `<slug>.md` file here with the two-key front matter.
2. Add a row to `MATERIA.md § Review angles` — the registry that owns the
   File → Gate → Tier mapping — and pick a Tier.

## Canonical angles are special-cased in ship-spec

The `ship-spec` **markdown-only exemption** and **trivial-diff collapse**
special-case the canonical angle slugs (`correctness`, `security`,
`spec-adherence`, `behavior`). A project that renames or removes a canonical
angle must update `ship-spec` § Review too.
