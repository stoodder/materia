# MATERIA.md — the stack adaptation surface

Fixture stub modeling a REAL early dogfood Materia install (well inside the
pre-tracking `0.1.0` range). It is Materia-enabled but deliberately gnarly: it
is missing everything the current scaffold ships that an old install would have
to reconcile by hand.

Intentionally ABSENT (so doctor's honesty caveat and the 0.1.0 reconciliation
notes have teeth):

- no `§ Version control` / `§ Forge` sections
- no `§ Review angles` / `§ Skill routing` sections
- no `.materia/` directory at all (no `project.json`, no `review-angles/`)
- no `scripts/check-docs.sh` — this repo still carries the old
  `scripts/check-docs.mjs` it predates the `.sh` gate script

## Identity

- **App:** Gnarly legacy fixture app
- **What it is:** An early pre-tracking Materia-installed project, used to prove
  doctor reports `warnings` (untracked-legacy drift) AND flags the missing
  check-docs.sh gate — without either escalating past `warnings`.
