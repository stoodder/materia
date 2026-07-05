---
name: logs-to-specs
description: Drafts proposed-spec file(s) in docs/specs/_proposed/ from bugs found in the running app's container logs. Single-shot and fully autonomous: collect `docker compose logs` over a window, triage real bugs from dev-only noise (cross-checking each signature against the current working tree), draft proposals, snapshot the supporting log excerpts to producer bookkeeping for durable provenance, then branch, commit, and open one PR. The PR is the operator's review gate. Use when the operator wants log-surfaced bugs turned into queue proposals.
---

# logs-to-specs — proposals from container logs

A single-shot producer that reads the running app's Docker logs, triages the
real bugs out of the dev-only noise, and writes well-formed proposed-spec files
into the shared queue at
[`docs/specs/_proposed/`](../../../docs/specs/_proposed/README.md). Conforms to
the queue's shared contract (frontmatter shape, filename pattern, body shape).
It is the third **producer** alongside `suggestions-to-specs` (from retros) and
`propose-spec` (from a raw idea).

**Philosophy: keep state in the diff, not on the side.** The skill collects,
triages, and drafts in one pass, writes the proposal files plus a durable
snapshot of the supporting log excerpts, then opens a PR. Everything that
happened is visible in the resulting git diff; no per-run audit envelope, no
resumability gate.

**Fully autonomous — the PR is the gate.** Unlike `suggestions-to-specs`, this
skill does **not** pause for an interactive approval turn. It decides which
log clusters are real bugs, drafts proposals for them, and opens a PR in one
run. The operator reviews (and accepts/rejects) at the PR, exactly as they do
for every other producer's output — no proposal merges without that review.
Because there is no mid-run gate, triage MUST be conservative: when in doubt,
drop. A false proposal costs the operator more than a missed one.

**Lifecycle:** autonomous (PR-is-the-gate) · branch after triage promotes at
least one cluster — per the shared producer contract at
`docs/standards/skills.md` § Producer lifecycle (zero-work exit, id minting,
link integrity, one PR + tooling, no session survival). Zero promoted clusters
→ clean exit without branching.

Read
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
(the shared contract) and
`.claude/skills/propose-spec/SKILL.md` § File format (the body + link-path
template proposals must conform to) before changing this skill.

## Invocation

```
/logs-to-specs [<window>] [<service>]
```

- `<window>` — optional log window passed to `docker compose logs --since`.
  Accepts the Docker duration form (`24h`, `72h`, `7d`, `30m`) or an RFC3339
  timestamp. **Default: `24h`.**
- `<service>` — optional compose service to read. **Default: `app`.** Pass `db`
  (or another service) to triage a different container, or `all` to scan every
  service.

Examples: `/logs-to-specs`, `/logs-to-specs 72h`, `/logs-to-specs 7d all`.

## Procedure

### 1. Collect logs

Confirm the stack is up and capture the window:

```bash
docker compose ps --format '{{.Service}}\t{{.Status}}'
docker compose logs <service> --since <window> --no-color --timestamps
```

- **Docker / compose unavailable** (command errors, no `docker-compose.yml`,
  daemon down): print a one-line explanation (e.g. "Docker is not running —
  start the stack with `docker compose up` and re-invoke.") and end the turn.
  No branch, no files. Clean no-op.
- **Stack down but compose present:** `docker compose logs` still returns the
  last run's logs for stopped containers; that's fine to triage. Note in the
  loading stream that the container is not currently running.
- **Empty window:** if the window returns no lines, print "No log output in the
  last `<window>`. Nothing to triage." and end the turn. No branch.

Keep the raw captured text in context for the triage pass — do not write it to
disk yet (only the excerpts behind *promoted* proposals get snapshotted, in
step 4).

### 2. Triage — real bugs vs. noise (in-context)

Cluster the captured lines into candidate issues and classify each. Do this in
this skill's context with the repo loaded — it is the judgment the skill exists
to provide.

**Cluster.** Group lines that share a signature into one candidate. Normalize
away the volatile parts before comparing — leading timestamps, request ids,
ports, hex hashes, line/column numbers — so the same underlying issue logged
100 times collapses to one candidate with a count. Record the representative
message, the occurrence count, and 1–2 verbatim example lines per cluster.

**Classify each cluster as BUG or NOISE.**

A cluster is **NOISE** (drop it) when it is any of:

- **Stale dev-server / build-cache churn.** Nuxt/Vite HMR messages,
  "Incremental route update failed", `.nuxt` cache `ENOENT`, "Duplicated
  imports", "performing full rebuild" — especially in a long-running dev
  container that has survived renames. **MUST-cross-check rule:** if the
  message names a file, route, or exported symbol, verify it still exists in
  the current working tree (`git ls-files`, or grep for the export). If the
  referenced thing is gone, the log is a stale artifact from a pre-rename build
  — **NOISE, not a bug.** (This is the single highest-value filter: a warning
  about `pickTodaySession.ts` when only `pickTodayWorkout.ts` exists on disk is
  a cache ghost, not a real duplicate export.)
- **Expected/benign.** Startup banners, health-check pings, info-level
  lifecycle lines, deprecation notices for pinned deps, seed/migration chatter
  on a normal boot.
- **Transient and self-resolved.** A single connection blip during startup that
  the next line shows recovering.
- **Not actionable from the repo.** Errors rooted entirely in the local
  environment (Docker networking, disk space) with no code change that fixes
  them.

A cluster is a **BUG** (candidate for a proposal) when it is a code-level fault
the repo can fix: unhandled promise rejections, thrown exceptions with app
stack frames, HTTP 500s from a route handler, Prisma errors (constraint
violations, failed queries) outside expected validation paths, real
duplicate-export/ambiguity warnings where **both** referenced files still
exist, type/runtime errors in app code, or repeated warnings that point at a
live code path.

**Then filter the BUG set down to what's worth a proposal:**

- **Concrete** — a testable acceptance criterion is writable (typically "the
  `<signature>` error no longer appears in the logs over a clean run" plus the
  structural fix).
- **Worthwhile** — a real user/maintainer impact, not a cosmetic log line.
- **Reproducible signal** — recurring, or a single clear stack trace; not a
  one-off you cannot characterize.
- **Not already proposed** — no overlap with pending files in `_proposed/`
  (load `git ls-files 'docs/specs/_proposed/*.md'` minus `README.md`; read
  bodies for content-level dedupe).
- **Not recently shipped/proposed** — check the recent merge log:
  `git log --grep='logs-to-specs\|_proposed' main --since='3 months ago' --pretty=oneline`.

Everything that fails a check goes to a **dropped** list with a one-line
rationale (`NOISE: stale .nuxt cache — pickTodaySession.ts no longer in tree`).
Nothing is silently discarded; the dropped list ships in the PR body so the
reviewer sees what was filtered and why.

**Cap each proposal at a single coherent, shippable unit of work** — roughly
one reasonable PR's worth. If one root cause produces several log signatures,
that is **one** proposal. If unrelated bugs surface, that is one proposal each.

### 3. Draft proposals (in-memory)

For each promoted bug, draft the complete proposal — frontmatter + full spec
body. The body follows the format `propose-spec`/`intake-spec` produce: H1 +
tagline blockquote + `## Problem`, `## Goals`, `## Non-goals`,
`## Users & context`, `## User stories & acceptance criteria`, `## Constraints`,
`## Open questions`. Every required H2 must be present, even when thin —
`intake-spec`'s detector matches on headings.

Ground the body in evidence and standards:

- **Problem** quotes the representative log line(s) and the occurrence count,
  and names the implicated code path (file/route) when triage identified it.
- **Acceptance criteria** are literally testable: "running the app through
  `<scenario>` produces zero `<signature>` lines in `docker compose logs app`",
  plus the structural fix grounded in the relevant standard (e.g.
  `docs/standards/architecture.md` for a one-export-per-file violation,
  `docs/standards/server-routes.md` for a 500 in a handler).
- Use project vocabulary from `docs/glossary.md`.

Mint a fresh `id` per proposal with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6`. Never
reuse an `id` already on disk in `_proposed/` or visible in the recent merge
log.

### 4. Snapshot evidence, then write

Logs are ephemeral, so a proposal's `source_refs` cannot point at the live log
stream. Instead snapshot the supporting excerpt to **producer bookkeeping** —
an underscore-prefixed subdir under `_proposed/`, which the queue contract
explicitly treats as not part of the queue (consumers scan only the top level):

1. **Write the evidence snapshot** for each promoted bug to
   `docs/specs/_proposed/_log-triage/<YYYY-MM-DD>-<id>.log`. Contents: a short
   header line (service, window, capture date, occurrence count) followed by
   the representative + example log lines for that cluster. This is the durable
   artifact `source_refs` points at.

2. **Write the proposal file** with the `Write` tool to
   `docs/specs/_proposed/<filename>` (§ File format). If the target filename
   already exists (id collision — extremely unlikely), regenerate the `id`,
   rename the snapshot to match, and retry once; if it still collides, halt
   with the colliding path.

### 5. Branch, commit, push, open PR

Now that there is a promotable set, sync `main` and branch, then commit the
work. (No writes have been committed yet; the snapshots + proposals from step 4
live in the working tree.)

```bash
git checkout main && git pull
git checkout -b propose/from-logs-<YYYY-MM-DD>
```

`<YYYY-MM-DD>` is today's date (same-day collision + dirty-pull handling per
the lifecycle).

> **Note on uncommitted work.** Because the step-4 writes already landed in the
> working tree, `git checkout main` will carry them over — that is fine; they
> are new untracked files. If the operator was mid-task on another branch when
> they invoked this skill, prefer creating the branch from the current `main`
> tip and `git stash`-ing nothing of the skill's own files. Keep the skill's
> files (`docs/specs/_proposed/**`) the only thing committed.

Then verify links, stage, and commit:

```bash
pnpm run check:docs   # confirm the new proposal file(s) add no broken links
git add docs/specs/_proposed/
git commit -m "logs-to-specs: <P> proposal(s) from log triage (<window>, <service>)"
```

Link-integrity handling per the lifecycle invariant (fix any links the new
files introduce; use the absolute-from-repo-root convention, see
`propose-spec` § Link paths).

Push and open the PR:

```bash
git push -u origin propose/from-logs-<YYYY-MM-DD>
gh pr create --title "logs-to-specs: <P> proposal(s) from log triage" --body "<body>"
```

PR body includes, inline:

- The rendered proposal sections (so reviewers read without fetching).
- The **dropped/noise** list with one-line rationales (so the reviewer sees what
  was filtered, and can catch a real bug that triage wrongly dropped).
- The capture parameters (service, window, total lines scanned, cluster count).
- Closing line: "Build any proposal with `/ship-spec <id>`."

Print the closing report:

```
Scanned <service> logs over <window>: <L> lines → <C> clusters.

Wrote <P> proposal(s):
  - docs/specs/_proposed/<filename-1>  (id <id-1>)
  - docs/specs/_proposed/<filename-2>  (id <id-2>)

Evidence snapshots:
  - docs/specs/_proposed/_log-triage/<YYYY-MM-DD>-<id-1>.log
  - …

Dropped as noise/not-worthwhile (<D>): see PR body.

Branch: propose/from-logs-<YYYY-MM-DD>
PR:     <URL from gh pr create>

Build any proposal with:  /ship-spec <id>
```

End the turn.

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36>
schema_version: 1
source: log-triage
source_refs:
  - docs/specs/_proposed/_log-triage/<YYYY-MM-DD>-<id>.log
title: <one-line title>
date: <YYYY-MM-DD>
status: proposed
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` (the same command
`intake-spec`, `triage-retros`, `propose-spec`, and `suggestions-to-specs`
use). `source_refs` is **always a YAML list**; its entry is the evidence
snapshot written in step 4 so a reviewer can trace the proposal to the exact
log lines.

### Body

Same structure as `propose-spec` and `intake-spec` — see
`.claude/skills/propose-spec/SKILL.md` § Body for the template. Always emit
every required H2 verbatim and in order, even when thin. `intake-spec`'s
detector matches on the H1 plus `## Problem`, `## Goals`,
`## User stories & acceptance criteria`, and `## Open questions`.

**Link paths follow the absolute-from-repo-root convention** — see
`.claude/skills/propose-spec/SKILL.md` § File format → Link paths. `intake-spec`
adopts the body verbatim into `docs/specs/<dated-slug>/spec.md` at a different
folder depth, so relative paths that resolve from `_proposed/` break downstream
and trip `pnpm run check:docs`.

The body MUST NOT repeat frontmatter metadata (no second `id:` line, no `Source:`
heading) and MUST NOT embed raw log dumps — the evidence lives in the snapshot
file. Quote only the representative line(s) needed to state the problem.

### Filename

```
<YYYY-MM-DD>-<id>-<slug>.md
```

`<slug>` is derived from `title` via the normative kebab-slug algorithm in
[`docs/specs/_proposed/README.md`](../../../docs/specs/_proposed/README.md)
§ Kebab-slug derivation. Do NOT invent a different algorithm.

## Scope (what this skill does NOT do)

- Does NOT pause for interactive approval. It is fully autonomous; the PR is the
  operator's review gate.
- Does NOT run `ship-spec` or implement any product/code fix. After the PR
  lands, the operator runs `/ship-spec <id>` to build the fix.
- Does NOT write a per-run audit envelope. The git diff (proposals + evidence
  snapshots) is the audit.
- Does NOT modify the shared `_proposed/` contract README beyond the one-row
  producer-table registration (which the contract permits in the introducing
  PR). Contract-section changes are a separate PR.
- Does NOT read or modify another producer's files (`product-suggestions.md`, etc.).
- (Session interruption per the lifecycle: re-invoke fresh.)

## Rules

- **Conservative beats complete.** With no mid-run gate, a false proposal is the
  expensive failure mode. When a cluster is ambiguous between bug and noise,
  drop it (and list it).
- **Cross-check the tree before promoting.** Any log message naming a file,
  route, or symbol must be verified against the current working tree; if the
  referent is gone, it is stale-cache noise, never a bug.
- **One coherent unit per proposal.** One root cause = one proposal, even across
  several log signatures. Unrelated bugs = one proposal each.
- **Concrete and worthwhile beats more.** Promote only bugs with a testable AC
  and real impact; everything else is dropped with a rationale.
- The renderer always emits every required H2 verbatim so `intake-spec` adopts
  the body unchanged.
- Zero promotable bugs exits cleanly with nothing written and no branch.
