---
name: propose-epic
description: "Take a user's raw idea for a large, multi-spec feature-set and develop it into an epic — iterative brainstorm Q&A with the operator, a parallel web-research fan-out run on low-tier subagents, then decomposition into 2–N single-shippable-unit spec proposals with an explicit dependency graph. Produces docs/epics/<dated-slug>/ (epic.md + research.md) plus one member proposal per spec in docs/specs/_proposed/ (source: epic), all in one PR. Use when an idea is too big for /propose-spec's one-shot draft; as members ship, ship-spec's epic gate (reconcile-epic in pipeline mode) keeps the epic and its remaining members in sync automatically."
---

# propose-epic — develop a big idea into an epic + member specs

The big sibling of [`propose-spec`](../propose-spec/SKILL.md). Where that
skill turns an idea into **one** proposal in a single drafting turn, this one
turns an idea into an **epic**: a researched, operator-refined initiative
document under `docs/epics/` (`docs/epics/README.md`)
plus a set of member spec proposals in the shared queue at
`docs/specs/_proposed/` (`docs/specs/_proposed/README.md`), each
scoped to one shippable PR and wired together by a dependency graph.

**Philosophy: converge, then decompose.** `propose-spec`'s "defaults beat
questions" rule is inverted here on purpose — an epic is where ambiguity is
expensive, so the skill *invests* in brainstorm rounds and web research until
the operator and the orchestrator agree on shape, and only then splits the
work. What stays inherited: defaults still beat questions for anything the
project context already answers; the questions spent on the operator are the
genuinely open ones.

**Lifecycle:** interactive checkpoint · branch-at-approve — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, id minting, link integrity, one PR + tooling, no
session survival). Brainstorming, research syntheses, and drafts are all
in-memory; nothing touches the repo until `approve`.

Read `docs/epics/README.md`
(the epic contract — folder shape, `epic.md` format, linkage keys),
`docs/specs/_proposed/README.md`
(the queue contract every member proposal must hit), and
`${CLAUDE_PLUGIN_ROOT}/skills/intake-spec/SKILL.md` § Detect the input shape (the
structured-body shape) before changing this skill.

## Inputs / Outputs

| | |
|---|---|
| **Inputs** | The operator's raw epic idea (argument text or prompted); project context (`CLAUDE.md`, `docs/`, existing specs + epics); web research gathered by subagents during the run. |
| **Outputs** | One PR landing `docs/epics/<dated-slug>/epic.md` + `research.md`, and 2–N member proposal files in `docs/specs/_proposed/` (`source: epic`, linked per the epic contract). |

## Procedure

### 1. Capture the idea

| Input shape | Behavior |
|---|---|
| `/materia:propose-epic <idea text>` | Use the trailing text as the idea, advance. |
| `/materia:propose-epic` (no args) + AskUserQuestion available | Ask "What's the epic about? Rough is fine — we'll develop it together." |
| `/materia:propose-epic` (no args) + Auto Mode | Print the same prompt and end the turn. The next reply is the idea. |

Empty/whitespace reply → "No idea captured. Re-invoke when you're ready."
and end the turn.

**Size check.** If the idea reads as a single shippable unit (one surface,
one outcome, ≤ ~5 user stories), say so and recommend `/materia:propose-spec`
instead — offer to continue anyway (`continue` / `switch`). An epic that
decomposes into one member spec is `propose-spec` with extra steps.

### 2. Read project context (silently, before any questions)

Same read set as `propose-spec` step 2 (always: `CLAUDE.md`,
`docs/README.md`, `docs/glossary.md`, the `_proposed/` contract;
selectively: the standards matching the idea's surface area; 1–2 shipped
specs as exemplars), **plus**:

- `docs/epics/README.md` — the contract this run's artifacts must hit.
- Existing epics under `docs/epics/*/epic.md` — overlap with a live
  epic is a step-7 "things to know" item, same as proposal overlap.
- Validate identifiers + freshness against the live codebase per
  `propose-spec` step 2 (grep intended names, already-shipped scan, stable
  sibling paths).

### 3. Brainstorm Q&A (iterative, with the operator)

Unlike `propose-spec`, this step is a deliberate multi-round conversation.
Per round:

1. State your current understanding of the epic in 3–6 bullets (scope,
   outcomes, rough shape) so the operator can correct course cheaply.
2. Ask **2–4 focused questions**, each with a proposed default, targeting
   the ambiguities that most change the epic's shape: intended outcomes,
   scope boundaries, priorities, appetite (how much of the maximal version
   they actually want), and known constraints. Use AskUserQuestion when
   available; otherwise print the questions and end the turn.
3. Fold the answers into an in-memory **decision log** (these become
   `## Decisions` in `epic.md`).

Repeat until the shape is stable enough to direct research — typically 1–3
rounds. Don't re-ask anything the project context or an earlier answer
already settled.

### 4. Research fan-out (parallel, low-tier subagents)

Derive **2–5 focused research questions** the open web can actually answer
and that would change how the epic is built: domain best practices, prior
art in comparable products, known algorithms/formulas, UX patterns, common
pitfalls. Skip anything the repo's own docs answer — this step buys outside
knowledge only.

Spawn **one fresh-context subagent per question, in parallel**. This is the
dynamic `propose-epic: research` role (`MATERIA.md` § Tiers § Skill routing):
tier each question to the cheapest pair that can do the job, picking from
`MATERIA.md` § Tiers § Model set:

- `haiku/low` — default: gather-and-summarize questions ("what are the
  standard approaches to X", "how do comparable apps present Y").
- `sonnet/medium` — questions needing judgment or synthesis across
  conflicting sources ("which of these approaches fits this product's constraints per docs/product.md").
- Never above `sonnet/medium` — a question that seems to need `opus` is
  really the orchestrator's synthesis job (step 5), not a gathering job.

Inject the matching effort guidance sentence from `MATERIA.md` § Tiers
§ Effort set verbatim into each spawn prompt. Each brief carries: the research question; 2–3 sentences
of epic context; the instruction to use web search/fetch; the required
return shape — a `## Findings` list (each finding one bold claim + 1–3
supporting sentences), a `## Recommendation` paragraph, and a `## Sources`
list of URLs with one-line descriptions; and the standing rules: read-only
(no repo writes), no nested subagent spawns, return the report inline.

Retry a failed or empty-return subagent **once**; a twice-failed question is
recorded as unresearched and surfaced in step 5's digest rather than
blocking the run.

### 5. Synthesize + converge checkpoint

Merge the returns into an in-memory research brief (deduplicate, note where
sources conflict, keep every source URL). Then present a digest:

```
─────────────────────────────────────────────────────────────────────
Epic so far: <2–3 sentence current shape>

Research round <n> — <k> questions, tiers used: <e.g. 3× haiku/low, 1× sonnet/medium>
  - <question> → <one-line takeaway> [n sources]
  - <question> → <one-line takeaway> [n sources]
  - <question> → unresearched (subagent failed twice)

How this changes the epic:
  - <concrete shape changes driven by findings, or "no change — confirms the plan">

Still open:
  - <remaining ambiguities, if any>

Reply:
  - `proceed` — shape is agreed; decompose into member specs.
  - `discuss: <topic>` — another brainstorm round on that topic.
  - `research: <question(s)>` — another research fan-out.
  - `cancel` — exit cleanly; nothing written.
─────────────────────────────────────────────────────────────────────
```

End the turn. `discuss:` loops back to step 3; `research:` loops back to
step 4; both return here. This loop is **agreement-bounded, not
round-capped** — but from round 3 on, name what's still unconverged and
recommend either `proceed` or trimming the epic's scope; endless research is
usually scope creep wearing a lab coat.

### 6. Decompose into member specs + dependency graph

On `proceed`, split the epic into **2–N member specs**, each a single
shippable unit per the queue contract (self-contained, roughly one
reasonable PR). Then wire the graph:

- Add a `depends_on` edge **only** where a member genuinely consumes
  another's output (a model/route/component it builds on) — never for mere
  thematic ordering. Fewer edges = more parallelism = better.
- Derive the ship order as topological levels: which members are ready
  immediately, which unlock when what merges, which can run in parallel.
- A member with no incoming or outgoing edges is a hint it may not belong in
  the epic — either justify it in the epic body or leave it to a standalone
  `/materia:propose-spec`.

Mint ids (one for the epic, one per member — lifecycle minting command +
collision rules), then draft everything in-memory: `epic.md` and
`research.md` per the epic contract (`docs/epics/README.md`)
formats (`research.md` cites primary sources as bare URLs per that
contract's citation conventions), and each member proposal per § File
format below. Member bodies
must be **self-contained** — a `ship-spec` run sees only the proposal body,
so each member restates the context it needs instead of pointing at the
epic for essentials; the `## Epic context` section is orientation, not a
load-bearing dependency.

### 7. Present the full package for confirmation

One turn, everything inline: the `epic.md` body (including the member table
+ mermaid graph + ship order), then each member proposal's full body
(frontmatter + spec sections), then:

```
Defaults I applied (you can override any of these):
  - Split into <N> members because <one-line reason>.
  - Dependency edges: <one line per edge, with why>.
  - <other notable assumptions, 3–6 bullets>

Things to know:
  - <overlap with a pending proposal or live epic, if step 2 found any>

Reply:
  - `approve` — write everything, open one PR, finish.
  - `edit: <feedback>` — adjust the epic and/or drafts; re-present.
  - `edit <id>: <feedback>` — adjust one member (or the epic by its id).
  - `drop <id>` — remove a member from the batch.
  - `cancel` — exit cleanly; nothing written.
─────────────────────────────────────────────────────────────────────
```

End the turn. On `drop <id>`, recompute the graph — members that depended
on the dropped one need their `depends_on` rewired (or the drop challenged)
before re-presenting. Fold-and-re-present per the lifecycle.

### 8. Branch, write, commit, push, open PR

On `approve` (nothing has touched the repo before this):

1. `git checkout <trunk> && git pull <remote> <trunk>` (`<trunk>`/`<remote>`
   per `MATERIA.md` § Version control), then branch off `<trunk>`:
   `git checkout -b epic/<epic-id>-<kebab-slug>` (dirty-pull + collision
   handling per the lifecycle).
2. Write `docs/epics/<dated-slug>/epic.md` + `research.md`, then each
   member proposal to `docs/specs/_proposed/<YYYY-MM-DD-HHMMSS>-<id>-<slug>.md`.
3. Verify link integrity per the lifecycle invariant, then commit — one
   commit for the epic folder, one for the member proposals, message prefix
   `propose-epic:`.
4. Push and open the PR (lifecycle tooling rules). Title:
   `epic: <title> (<N> member specs)`. Body: the epic summary + member table
   + mermaid graph, each member's spec body inline, the dropped list with
   rationales, and the closing line: "Ship members in dependency order with
   `/materia:ship-spec <id>` — each member's `epic:` key makes ship-spec sync the
   epic + cascade the pending siblings in that member's own PR (the epic
   gate); `/materia:reconcile-epic <epic-id>` is the standalone backstop."

Closing report: the epic path, each member file + id, ready-now member ids,
branch, PR URL. End the turn.

## File format — member proposals

Everything from the queue contract and `propose-spec`'s § File format holds —
its frontmatter shape **and field values** (so `schema_version: 3`, the same
as every queue proposal), body H2 set in order, absolute-from-repo-root links,
filename pattern, kebab-slug algorithm — with these deltas:

```yaml
source: epic
source_refs:
  - docs/epics/<dated-slug>/epic.md
epic: <epic-id>
depends_on: []            # or [<sibling proposal id>, …]
surfaces: [ui]            # optional; per-member — infer from THIS member's own scope, not the epic's
```

Members of one epic can touch different surfaces — infer `surfaces:` per
member from that member's own scope, same suggestion-only semantics as
`propose-spec` § File format (`docs/specs/_proposed/README.md` § Field roles
→ `surfaces`).

and one extra body section, **last, after `## Open questions`**, so
`intake-spec`'s required-H2 detector sees the standard spine first:

```markdown
## Epic context

Member <#> of epic "<title>" — see docs/epics/<dated-slug>/epic.md.
Builds on: <sibling id — title, or "nothing (root member)">.
Depended on by: <sibling ids — titles, or "nothing">.
While this proposal is queued, /materia:reconcile-epic may revise it if an
earlier-shipped sibling changes the ground it stands on.
```

This section survives verbatim into the shipped spec folder (frontmatter is
stripped at intake; the body is adopted whole) — it is the durable spec-side
backlink required by the epic contract's bi-directional-linkage rule.

## Scope (what this skill does NOT do)

- Does NOT branch, commit, push, or open a PR before `approve` — brainstorm,
  research, and drafts are all in-memory.
- Does NOT build anything. Members ship one at a time via
  `/materia:ship-spec <id>`, in dependency order, at the operator's pace.
- Does NOT maintain the epic after this run — that's
  [`reconcile-epic`](../reconcile-epic/SKILL.md)'s job.
- Does NOT modify the `_proposed/` or `_epics/` contract READMEs; contract
  changes are a separate PR.
- Research subagents are read-only gatherers — they never write to the repo
  and never spawn further subagents.

## Rules

- **Converge, then decompose.** No member specs are drafted until the
  operator says `proceed` — a beautifully decomposed wrong epic is worse
  than a third brainstorm round.
- **Research is tiered down.** `haiku/low` default, `sonnet/medium` ceiling,
  per § 4 — the dynamic `propose-epic: research` role
  (`MATERIA.md` § Tiers § Skill routing), picking from § Model set; fallback
  per § Fallback. The orchestrator does the thinking; subagents do the
  fetching.
- **Every member is independently shippable** and its body self-contained;
  `depends_on` edges exist only for real build-on relationships.
- **Bi-directional linkage always lands whole** — epic table + member
  frontmatter keys + `## Epic context` sections all written in the same PR;
  never a half-linked state.
- **Always ends in a PR** on `approve` — same unconditional path as
  `propose-spec` (branch → write → commit → push → PR); never stop at a
  pushed branch.
- `cancel` at any checkpoint exits cleanly with nothing written; silence is
  fine — nothing lands until `approve`.
