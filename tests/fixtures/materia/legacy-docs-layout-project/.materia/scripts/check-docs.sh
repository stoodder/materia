#!/bin/sh
# Fixture stub — a PRE-RELOCATION check:docs gate that scans the legacy `docs`
# root (find -L CLAUDE.md docs ...). Differs byte-wise from the current scaffold
# check-docs.sh, so relocate-docs refreshes it and backs these bytes up to
# .materia/scripts/check-docs.sh.pre-schema4. Never executed as-is by fixtures.
exit 0
