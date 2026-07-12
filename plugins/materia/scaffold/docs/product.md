# Product brief

<!-- init: written once by /materia:init from the staged product interview and
     maintained thereafter like any other doc (docs-sync updates it when the
     product pivots; the librarian sweeps it). Replace every {{slot}} and
     delete these comments. This is the pipeline's taste and audience oracle:
     intake-spec and propose-spec default their "Users & context" from it,
     design grounds visual/tone judgement in § Design feel & taste, and
     ui-review's cohesion judgement inherits whatever visual-language.md
     derives from it. Keep it opinionated — a bland brief produces bland
     features. Opinionated where answered, honest where skipped: a question
     the engineer skipped at init lands as an explicit
     "*Not yet decided — <what was asked>.*" line, never an invented default;
     these gaps are temporary — revisit them (docs-sync maintains this doc)
     as the product takes shape. -->

The product identity oracle — who this is for, what it feels like, and the
taste every feature must land inside. Standards say how we *build*;
this brief says what we're building *toward*. One home per fact:
`MATERIA.md` § Identity carries only the one-liner; this doc owns the depth.

## Name & positioning

- **Name:** {{product name (and working name / codename if different)}}
- **One-liner:** {{the § Identity sentence, verbatim — what it delivers, for whom}}
- **Tagline:** {{the short, memorable line that sits under the name — the
  phrase a landing page or README would lead with}}
- **Positioning:** {{how it should be described next to its alternatives — the
  sentence you'd want a stranger to repeat}}

## Goals & success

- **Why this exists:** {{the goal behind building it — the change in the
  world (or in the builder's own work) that makes it worth the effort}}
- **Success metrics:** {{2–4 signals that would say it's working — adoption,
  usage, revenue, a personal bar; concrete enough to check against in six
  months}}
- **Milestones:** {{the horizon that matters now — first usable cut, first
  external user, launch; rough dates only when they're real}}
- **Business model:** {{how it sustains itself — paid / free / OSS, pricing
  direction, or "personal tool, no model"}}

## Audience & market

- **Primary user:** {{who exactly — role, context, sophistication; singular
  persona beats a demographic blur}}
- **Usage context:** {{where/when/how it's used — device, environment,
  cadence, attention level. This colors every spec's "Users & context".}}
- **Market:** {{the space it plays in; adjacent/competing products and what
  this one deliberately does differently}}
- **Not for:** {{audiences and use-cases deliberately out of scope}}

## Design feel & taste

- **Feel in five adjectives:** {{e.g. calm · dense · playful · clinical · warm}}
- **Taste references:** {{2–4 products/apps whose look-and-feel this should
  rhyme with, each with *what* to borrow (spacing, motion, density, color
  courage) — and one anti-reference: what to avoid}}
- **Brand & color:** {{the color direction — named hues or exact values where
  they exist (primary / accent / neutrals), plus any existing brand assets
  (logo, wordmark) the design work must honor}}
- **Visual direction:** {{light/dark stance, typography vibe, density —
  together with the brand colors above, the seeds
  `docs/standards/visual-language.md` grows from}}
- **Motion & delight:** {{restrained or expressive; where micro-interactions
  are welcome vs. where speed wins}}

## Voice & tone

- **Copy style:** {{how the product talks — terse vs. chatty, playful vs.
  neutral; capitalization, jargon policy, error-message temperament}}
- **Vocabulary:** {{words the product always/never uses — feeds glossary.md}}

## Product principles

{{3–5 opinionated tie-breakers that settle feature debates before they start,
one line each — e.g. "speed of capture beats completeness", "never make the
user do math", "one obvious action per screen"}}

## Related

- [MATERIA.md](../MATERIA.md) § Identity — the one-liner this expands.
- `visual-language → docs/standards/visual-language.md` — the binding
  visual rules derived from § Design feel & taste (UI repos only; on a
  non-UI repo this pointer is simply inert — no file to link).
- [glossary.md](glossary.md) — the vocabulary § Voice & tone seeds.
