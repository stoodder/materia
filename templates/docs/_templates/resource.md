<!--
  Copy this to docs/resources/<entity>.md and fill it in, following
  docs/standards/docs.md (present-state only, short cells, one home per fact).
  The layer sections below are the typical full-stack set — KEEP ONLY the
  layers this repo actually has (docs/standards/architecture.md names them)
  and rename headings to the repo's own layer vocabulary; /materia-init
  prunes this template to the stack at materialization time. Read the newest
  existing doc under docs/resources/ as the local example, if one exists.
  Delete these comments. After writing: add the doc to the table in
  docs/README.md and run the checks (see docs/contributing.md).
-->
# <Entity> (`SchemaModel or core-type name`)

> One sentence: what it is.

## Domain meaning

<!-- What it represents in the program. -->

## Data model

<!-- Schema model(s)/persistent shape, key fields, relations, unique indexes.
     Delete on repos with no persistence layer. -->

## Backend model(s)

<!-- Server-side domain objects and their computed surface; wire-shape paths.
     Delete/rename per the repo's layering. -->

## API surface

<!-- Table: how this entity is reached from outside — HTTP routes, CLI
     commands, public functions/exports, events — one row per surface.
     If there is no external surface (internal util / derived), say so and
     describe the entry points. -->

| Surface | Contract / signature | Source file | Payload / IO |
|---|---|---|---|
|  |  |  |  |

## Client API

<!-- How client-side code consumes it (queries, caching, mutations).
     Delete on repos with no client layer. -->

## UI

<!-- Pages/screens, components, presentation helpers, derived strings.
     Delete on repos with no UI. -->

## Business rules & invariants

<!-- Anything an agent must not break. -->

## Gotchas

<!-- Non-obvious traps. -->

## Canonical files

<!-- Exhaustive path list, grouped by the repo's layers. -->

## Related

<!-- Links to other docs. -->
