<!-- Fill-in stub for the `materia-triage-retros` skill's plan artifact
     (`docs/specs/_improvements/<dated-slug>/pipeline-improvements.md`).
     Producer: `materia-triage-retros` (resources/rendering.md § pipeline-improvements.md).
     Consumer: `materia-apply-pipeline-improvements` (§ Plan parsing) — it globs
     `docs/specs/_improvements/**/pipeline-improvements.md`, parses the
     `## Actions` section via a section-regex over the raw markdown, and
     renames the consumed plan to `pipeline-improvements.processed.md` on
     apply. The `### A<n> — <title>  →  <finding ids>` heading shape and the
     seven bold field labels below (`**Skill:**`, `**Files:**`,
     `**Dimension:**`, `**Change (one line):**`, `**Anchor hint:**`,
     `**Protected contract:**`, `**Motivating findings:**`) are its parse
     anchors — reproduce them character-for-character; do not rename,
     reorder, or reword them. -->
---
schema_version: <placeholder>
slug: <placeholder>
branch: chore/triage-retros-<slug>
generated_at: <placeholder>
retros_consumed: <placeholder>
findings_total: <placeholder>
findings_actionable: <placeholder>
protected_contract_flagged: <placeholder>
bugs_filed: <placeholder>
---

<!-- `schema_version` is informational, not a gate — the same forward-compat
     posture the retro template takes (see `docs/specs/_templates/retro.md`).
     A downstream consumer that sees an unrecognised version records it and
     degrades gracefully rather than halting. -->

# <Slug-as-Title-Case> — improvement plan

> <placeholder summary paragraph — the orchestrator's voice: what the retros
> were telling us, what's changing, what's deferred.>

## Retros consumed

| Path | Slug | Run kind | Entries | Parse status |
|---|---|---|---|---|
| `<path>` | <placeholder> | spec \| bug | <placeholder> | <placeholder> |

## Findings

### F1 — <title>  ·  <priority>

- **Pattern:** <placeholder>
- **Supporting retros:**
  - `<retro_path>` § `<anchor>` — "<quote>"
- **Pipeline skills touched by proposed action:** <placeholder>
- **Action pointer:** <placeholder>

## Actions

### A1 — <title>  →  <finding ids>

- **Skill:** <placeholder>
- **Files:** <placeholder>
- **Dimension:** <placeholder>
- **Change (one line):** <placeholder>
- **Anchor hint:** `<placeholder>`  (or `_none — executor recomputes from the file at apply time._`)
- **Protected contract:** <placeholder>
- **Motivating findings:** <placeholder>

## Out-of-scope / deferred

- **<finding_id> — <finding title>** — <placeholder rationale>

## Protected-contract flags

<!-- Either the alternate below when no action is protected-contract-flagged
     this run, or one block per flagged action. -->

_None this run._

### PROTECTED-CONTRACT CHANGE — extra scrutiny required

- **Action:** <placeholder>
- **Files touched:** <placeholder>
- **Justification:** <placeholder>

## PR description seed

```markdown
<placeholder PR body — includes a Changes → findings table, the list of
consumed retros (as `retro.processed.md` paths), a link to this plan, and a
"Bugs gathered" section when bugs were filed.>

PR: <filled by PR open>
```
