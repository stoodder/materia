<!-- Filled by the `architecture` skill (or by hand). MUST be grounded in the
     docs: read ../../README.md and the relevant resource/standard docs first,
     and prefer REUSING existing resources over adding new ones. -->
# <Feature> — architecture

> One sentence: the technical approach.

## Summary

<!-- The plan in a paragraph. What changes, what's reused. -->

## Affected existing resources

<!-- What we touch. Link each to its resource doc; say how it changes. -->

| Resource (doc) | Change |
|---|---|
| [week](../../resources/week.md) | … |

## New resources (if any)

<!-- Only when nothing existing fits. For each: the model / contract / route /
     composable / page to add, following the standards. Note the verb+noun
     contract names and the cache key. -->

## Data model & migration

<!-- Prisma schema changes + the migration. Unique indexes for upserts. See
     ../../standards/data-and-loads.md. -->

## API surface

<!-- New/changed routes: METHOD · path · auth · contract · payload. See
     ../../standards/server-routes.md and ../../surface-map.md. -->

## Client state

<!-- New queries (cache keys) + mutations (optimistic patch / dependent
     refresh). See ../../standards/api-layer.md. -->

## Standards in play

<!-- Link the standards this work must follow. -->

## Risks & trade-offs

## Test strategy

<!-- Which sibling specs get added/changed; integration coverage if any. See
     ../../standards/testing.md. -->

## Out of scope / follow-ups

<!-- ============================================================
     NON-PRODUCT (skills / docs / tooling) — skeleton variant
     ============================================================
     For a skills/docs/tooling feature there is no Prisma model, route, or
     composable to design. The product sections above (Data model & migration,
     API surface, Client state) collapse; use this skeleton instead of forcing
     empty product headings:

     ## Summary
     <!-- What changes, what's reused — same as above. -->

     ## Affected skills / docs / templates
     | Path (skill/doc/template) | NEW or REFERENCE | Change |
     |---|---|---|
     | `.claude/skills/<x>/SKILL.md` | REFERENCE | … |

     ## Reuse map
     <!-- Which existing skill section / template / artifact each new piece
          mirrors, with the verified evidence (grep hit, sibling precedent). -->

     ## Registration surfaces
     <!-- Every surface that must be updated in lockstep: CLAUDE.md, README
          mermaid/flow graphs, docs/README.md router, sibling-pipeline docs
          (docs/bugs/**), skills.md. Enumerate with pre-run grep hit counts. -->

     ## check:docs implications
     <!-- Which new cross-links are gate-protected vs only review-protected
          (the checker scans CLAUDE.md + docs/** only; .claude/skills/** is not
          gate-protected). Watch the inline-backtick markdown-link hazard. -->

     ## Standards in play / Risks / Out of scope
     <!-- Same as the product variant. -->
     ============================================================ -->
