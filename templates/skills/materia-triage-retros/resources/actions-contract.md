# The `pipeline-improvements.md` contract — planner emits, executor parses

This file is the **single source of truth** for the plan-artifact contract
between `materia-triage-retros` (which renders `pipeline-improvements.md`) and
`materia-apply-pipeline-improvements` (which parses it, applies its `## Actions`, and
renames it `pipeline-improvements.processed.md` on consumption).
`materia-suggestions-to-specs` and `materia-bugs-to-reports` parse the sibling hand-offs whose
shapes live in the `docs/specs/_improvements/_templates/` stubs (see
`resources/rendering.md`).

**Everything in this file is a parse anchor.** Changing a heading shape, a
field label, or a sentinel string here is a **protected-contract change** —
flag it in any plan that proposes it, and land both sides (planner render +
executor parse) in the same PR.

## Plan frontmatter

```yaml
---
schema_version: 1
slug: <dated-slug>
branch: chore/triage-retros-<slug>
generated_at: <ISO timestamp>
retros_consumed: <count>
findings_total: <count>
findings_actionable: <count of findings NOT referenced by out_of_scope>
protected_contract_flagged: <count of flagged actions>
bugs_filed: <count of gathered bugs>
---
```

`schema_version` is **informational, not a gate** — a consumer that sees an
unrecognised version records it, parses best-effort, and notes it in its PR
description rather than halting.

## The `## Actions` block — one record per action

Heading shape (the ` → ` separator is load-bearing):

```markdown
### A<n> — <title>  →  <motivating finding ids joined by `, `>
```

Seven fixed-name bullets, all required, reproduced character-for-character:

| Bullet | Semantics |
| --- | --- |
| `**Skill:**` | The pipeline skill the action edits (folder name). |
| `**Files:**` | Backticked target path(s), comma-separated. |
| `**Dimension:**` | One or more dimension tags, comma-separated (vocabulary below). A block missing this bullet parses as `["untagged"]` — legacy plans; untagged actions skip supersede/conflict reasoning and are treated as keep. |
| `**Change (one line):**` | The one-sentence change summary the edit must stay faithful to. |
| `**Anchor hint:**` | A backticked **verbatim, validated-unique** string from the target file (the executor's `Edit` `old_string`), or the literal null sentinel `_none — executor recomputes from the file at apply time._` |
| `**Protected contract:**` | `yes — <justification>` or `no`. The executor treats a `no` on a file that intersects the protected list below as a discrepancy and halts the plan. |
| `**Motivating findings:**` | Finding ids joined by `, ` — the traceback into `## Findings`. |

## Dimension vocabulary

Open-ended, **not** a closed enum — a run may mint a new kebab-case tag when
none of the seeds fits (prefer the most specific fit; don't tag a narrow
action with all five). The five seed tags:

| Tag | What it measures |
| --- | --- |
| `review-precision` | How accurately the skill scopes and describes what it changed, so reviewers spot regressions |
| `token-cost` | Prompt length, context window pressure, or redundant LLM calls |
| `resumability/robustness` | Crash-recovery, idempotency, and fault-tolerance of the skill's procedure |
| `docs-sync accuracy` | Correctness and coverage of the skill's own documentation |
| `producer signal-to-noise` | Quality and relevance of signals emitted by producer skills |

An unknown tag participates in the executor's supersede/conflict reasoning by
its tag string like any other.

## Findings traceback format

Every finding's supporting reference — and every supporting reference in the
sibling hand-offs — uses **literally** this shape (backticked path, ` § `,
backticked verbatim `Entry N — <stage>` anchor, em-dash, double-quoted
verbatim quote):

```markdown
`<retro_path>` § `<anchor>` — "<quote>"
```

Grep'ing the quoted phrase in the linked file must find the source.

## PR description seed + placeholder convention

The plan's final section, `## PR description seed`, is a fenced `markdown`
block pasted verbatim into the PR body at PR-open time. It (and each
`retro.processed.md` footer) carries a literal placeholder — `<filled by PR
open>` in the seed and README row, `<filled by finalize>` in retro footers —
that the PR-URL backfill step rewrites once the real URL exists.

## Protected-contract paths

The paths/regions whose silent change would break the self-improvement loop.
The planner's cluster pass flags any action whose files intersect them; the
executor enforces the flag and escalates visibility in the PR:

| Protected path | Why |
| --- | --- |
| `docs/specs/_templates/retro.md` | The schema the retro parser is built against. |
| `.claude/skills/materia-ship-spec/SKILL.md` § Retrospective capture | The retro-generation contract — what future retros contain. |
| This file (`materia-triage-retros/resources/actions-contract.md`) and `materia-triage-retros/resources/rendering.md` | The artifact contracts the executor, `materia-suggestions-to-specs`, and `materia-bugs-to-reports` parse. |
| Any path matching `retro\.(processed\.)?md`, `product-suggestions\.(processed\.)?md`, `pipeline-improvements\.(processed\.)?md` | The consume-by-rename naming conventions — a rename breaks idempotency. |
