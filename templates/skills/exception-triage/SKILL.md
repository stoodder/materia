---
name: exception-triage
description: Triages the Sentry exception-tracker inbox into the bug-report queue: fetches unresolved issues via the Sentry Issues REST API, proposes an ignore/ingest disposition per issue in-memory, and on `approve` writes conformant reports into `docs/bugs/_reports/`, marks each Sentry issue ignored or resolved (with a link-back comment), and opens one PR. Use when the operator wants to clear the Sentry inbox into queued bug reports.
---

# exception-triage — Sentry inbox to bug reports

A single-shot **producer** skill that reads the Sentry exception-tracker inbox,
proposes an ignore/ingest disposition per issue in-memory, and — on `approve` —
writes conformant bug-report files into the shared queue at `docs/bugs/_reports/`
(see `../../../docs/bugs/_reports/README.md` for the contract), marks each issue
ignored or resolved (with a link-back comment) in Sentry, and opens one PR. It
sits alongside `report-bug` and `bugs-to-reports` as the third producer in the
bug-report queue; its distinctive feature is the **write-back to the external
source** (Sentry mutations), which fires only after the PR is open.

**Runtime dependency on sibling spec `d388d`.** This skill requires a configured
Sentry org and project to run. The env-var preflight guard (step 1) catches the
not-yet-configured state and exits cleanly — a premature invocation is a graceful
no-op, not an error.

**Lifecycle:** interactive checkpoint · branch-at-approve — per the shared
producer contract at `docs/standards/skills.md` § Producer lifecycle (reply
verbs, cancel semantics, zero-work exit, id minting, link integrity, one PR +
tooling, no session survival). The full run before the checkpoint (Preflight →
Fetch → De-dup → Triage plan) is read-only — no branch, no file write, no
Sentry mutation until `approve`; the git diff + PR body are the audit. The
skill-specific delta: the **write-back to Sentry** (mutations) fires only after
the PR is open.

Read `docs/bugs/_reports/README.md` (the shared queue contract, at
`../../../docs/bugs/_reports/README.md` from this skill) and
`docs/bugs/_templates/bug-report.md` (the 13-section body format, at
`../../../docs/bugs/_templates/bug-report.md`) before changing this skill.

## Invocation

```
/exception-triage
```

No arguments in the first cut. Org, project, and token come from environment
variables (see step 1). Future cuts may add a `--project` override; that is out
of scope here.

## Procedure

### 1. Preflight — check environment variables

Check that all three variables are present in the environment:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

If **any** variable is unset, print setup instructions identifying the missing
variable and the steps to export it, then exit cleanly:

```
SENTRY_AUTH_TOKEN is not set.

Export it with:
  export SENTRY_AUTH_TOKEN=<your-token>

The token needs `project:read` scope to list issues and issue-write scope
to mark them resolved or ignored. Re-invoke when ready.
```

(Or the analogous message for `SENTRY_ORG` or `SENTRY_PROJECT`.) No branch, no
file, no API call is made when any variable is unset.

If all three are present, proceed silently to step 2.

### 2. Fetch — pull the unresolved issue list from Sentry

Print a loading line:

```
Fetching Sentry inbox for {SENTRY_ORG}/{SENTRY_PROJECT}…
```

Fetch all unresolved issues using cursor-based pagination. For each page:

```bash
curl -s -D - \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&cursor=<cursor>"
```

On the first request, omit the `&cursor=` parameter. Parse the `Link` response
header from each response: if a link with `rel="next"; results="true"` is
present, extract its cursor value and fetch the next page. Continue until
`results="false"` or the `Link` header has no `rel="next"` entry.

**Pagination note:** if the total issue count exceeds 200, surface a count
warning inline ("Warning: {N} issues found — proceeding with full set") and
continue without enforcing a cap.

**Error handling:**

| HTTP status | Behavior |
|---|---|
| 401 / 403 | "Authentication failed — check your token has `project:read` scope." Exit clean. |
| 404 | "Project {SENTRY_ORG}/{SENTRY_PROJECT} not found in Sentry. Check SENTRY_ORG and SENTRY_PROJECT." Exit clean. |
| 5xx / network timeout | "Sentry API unavailable ({code}). Retry when the service recovers." Exit clean. |
| Pagination partial failure | Log which pages succeeded, which failed; continue with the partial set and note in the triage plan header. |

**Zero issues:** if the fetch returns zero unresolved issues, print
"No unresolved issues found in Sentry. Nothing to triage." and exit cleanly.
No branch, no file, no Sentry mutation.

Collect the full issue list in context (issue `id`, `title`, `level`,
`status`, and the issue URL) for the de-dup and triage passes.

Print the result count: "{N} unresolved issue(s) fetched."

### 3. De-dup filter — remove already-ingested issues

Print a loading line: "Checking for already-ingested issues…"

Run two checks in order for each fetched issue. The first matching check
wins; remove the issue from the triage set and record the skip reason.

**Check (a) — Sentry-side resolved+linked check (best-effort):**

```bash
curl -s \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/<sentry-id>/comments/"
```

If the issue's comment list contains a comment whose text matches the pattern
`exception-triage: filed as docs/bugs/_reports/`, skip this issue with
rationale "already ingested as report {id extracted from comment}".

This check is best-effort: if the Sentry API call errors (unexpected response
shape, 4xx, network failure), log a one-line warning and fall back to check (b)
only. Do not halt.

**Check (b) — Repo-side `source_refs` scan (best-effort):**

Glob `docs/bugs/_reports/*/report.md`. For
each file, read the frontmatter `source_refs` list. If any entry matches the
Sentry issue URL (exact URL match), skip the issue with rationale "open report
{id} already references this issue".

This check is also best-effort: if the filesystem read errors, log a one-line
warning and include the issue in the triage set (ingest as default — safe because
it produces a possible duplicate report rather than silently dropping a real bug).

**Result:** print "{N} issue(s) remain after de-dup ({D} skipped)." If all
issues were de-duped, print "All {N} issues already ingested or skipped. Nothing
to write." and exit cleanly. No branch.

### 4. Build triage plan — assign default dispositions in-memory

Print a loading line: "Building triage plan…"

For each surviving issue, apply the ordered rules from `## Triage model` to
assign a default disposition (`ignore` or `ingest`) and a one-line rationale.

This step is **purely in-memory** — no branch, no file, no Sentry call. The
complete plan is held in context and presented in step 5.

Map each issue's Sentry `level` to the queue `severity` using the severity
mapping table in `## Triage model`.

### 5. Approval checkpoint — present the plan and wait

Present the full triage plan to the operator in one turn:

```
─────────────────────────────────────────────────────────────────────
Triage plan — {N} issue(s) from Sentry ({SENTRY_ORG}/{SENTRY_PROJECT})

  1. [INGEST] {sentry-title}
     Sentry id: {sentry-id}   Level: {level} → severity: {queue-severity}
     URL: {sentry-issue-url}
     Rationale: {one-line rationale}
     Will write: docs/bugs/_reports/<dated-slug>/report.md

  2. [IGNORE] {sentry-title}
     Sentry id: {sentry-id}   Level: {level}
     URL: {sentry-issue-url}
     Rationale: {one-line rationale}
     Will mark: ignored in Sentry

  …

Skipped (already ingested / de-duped):
  - {sentry-id}: {title}  — {reason}

On `approve`:
  - {count-ingest} report(s) written to docs/bugs/_reports/
  - {count-ingest} Sentry issue(s) resolved with link-back comment
  - {count-ignore} Sentry issue(s) marked ignored
  - Branch triage/sentry-{YYYY-MM-DD} pushed; one PR opened.

Reply:
  - `approve` — apply the plan above.
  - `edit: <feedback>` — adjust all dispositions and re-present.
  - `edit <sentry-id>: <feedback>` — change one issue's disposition.
  - `drop <sentry-id>` — remove an issue from this triage run (leave it unresolved in Sentry).
  - `cancel` — exit cleanly; nothing written, nothing mutated.
─────────────────────────────────────────────────────────────────────
```

End the turn.

**Handling operator replies:**

- `approve` → advance to step 6.
- `edit: <feedback>` → update all affected dispositions in-memory, re-present
  the checkpoint. No writes yet.
- `edit <sentry-id>: <feedback>` → update that one issue's disposition
  in-memory, re-present. No writes yet.
- `drop <sentry-id>` → remove that issue from the plan entirely (it stays
  unresolved in Sentry). Re-present. No writes yet.
- `cancel` → print "Cancelled. No files written, no Sentry mutations made."
  and exit. No branch created.

If the operator supplies an `edit` targeting an unrecognizable `sentry-id`,
re-present the checkpoint with an inline note identifying the problem. Do not
halt.

### 6. Apply — branch, write, check, commit, push, PR, then Sentry mutations

Run the apply sequence in this exact order. Mutations are deliberately last —
repo side commits first, then Sentry is updated.

**6a. Branch:**

```bash
git checkout main && git pull
git checkout -b triage/sentry-{YYYY-MM-DD}
```

If a branch of that exact name already exists locally (a prior run on the same
date), append a short hex suffix: `openssl rand -hex 2`
(e.g. `triage/sentry-2026-06-19-a91c`).

If the operator was on a non-main branch when they invoked the skill, sync and
branch off the `main` tip regardless of the current branch.

If `git pull` reports blocking uncommitted changes, halt with a conflict message;
the operator resolves and re-invokes.

Print: "Branching…"

**6b. Write reports:**

For each **ingest** issue:

1. **Mint a fresh `id`** with `openssl rand -hex 3 | cut -c1-5`. Never reuse an
   `id` already on disk in `docs/bugs/_reports/` or visible in the recent merge
   log.

2. **Derive the slug** from the Sentry issue title via the normative kebab-slug
   algorithm at `docs/specs/_proposed/README.md` § Kebab-slug derivation
   (path from repo root; `../../../docs/specs/_proposed/README.md` from this skill).
   Do NOT invent a different algorithm.

3. **Compose the `<dated-slug>` folder:** `{YYYY-MM-DD}-{id}-{slug}` where
   `{YYYY-MM-DD}` is today's date. The report lives at
   `docs/bugs/_reports/<dated-slug>/report.md`.

4. **Id-collision check:** if the target folder already exists, regenerate `id`
   once and retry. If it still collides, halt with the colliding path.

5. **Write the report file** to `docs/bugs/_reports/<dated-slug>/report.md` (see
   `## File format` for frontmatter and body requirements).

Print: "Writing {N} report(s)…"

**6c. Verify link integrity:**

```bash
pnpm run check:docs
```

If the gate flags any broken links inside the new report file(s), fix them in
place (use absolute-from-repo-root paths; see `## File format` → Link paths) and
re-run. The pre-existing broken-link count on `main` need not drop — this skill
is responsible for its new files only.

Print: "Running check:docs…"

**6d. Commit:**

```bash
git add docs/bugs/_reports/
git commit -m "exception-triage: {N} report(s) from Sentry inbox ({YYYY-MM-DD})"
```

**6e. Push and open PR:**

```bash
git push -u origin triage/sentry-{YYYY-MM-DD}
gh pr create \
  --title "exception-triage: {N} report(s) from Sentry inbox" \
  --body "<body>"
```

PR body includes:
- The rendered report sections inline (so reviewers can read without fetching).
- The full disposition table (ingest, ignore, skip) so the reviewer sees what
  was filtered and why.
- Closing line: "Work each ingested report with `/fix-bug`."

Print: "Pushing and opening PR…"

**6f. Sentry mutations (after PR is open):**

For each **ingest** issue (in any order):

```bash
# Mark resolved
curl -s -X PUT \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}' \
  "https://sentry.io/api/0/issues/{sentry-id}/"

# Post link-back comment
curl -s -X POST \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"exception-triage: filed as docs/bugs/_reports/<dated-slug>/report.md (id {report-id})"}' \
  "https://sentry.io/api/0/issues/{sentry-id}/comments/"
```

For each **ignore** issue:

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ignored"}' \
  "https://sentry.io/api/0/issues/{sentry-id}/"
```

Print: "Sending Sentry mutations…"

**Sentry mutation failure handling:** if any individual mutation call fails
(network error, rate limit, 403), log the failure inline, list which issues'
mutations succeeded and which failed, and advise the operator to retry the
failed mutations manually (Sentry URL provided per issue). The PR and report
files are already committed; do NOT roll back the PR or delete reports. The
repo side succeeded and is the source of truth.

### 7. Closing summary

Print the per-issue disposition table and the PR URL:

```
─────────────────────────────────────────────────────────────────────
Triage complete — {SENTRY_ORG}/{SENTRY_PROJECT}

Ingested ({count-ingest}):
  - {sentry-id}: {title}
    Report:  docs/bugs/_reports/<dated-slug>/report.md  (id {report-id})
    Sentry:  resolved + link-back comment posted

Ignored ({count-ignore}):
  - {sentry-id}: {title}
    Sentry:  marked ignored

Skipped / de-duped ({count-skip}):
  - {sentry-id}: {title}  — {reason}

Sentry mutation failures ({count-fail}):
  - {sentry-id}: {title}  — {error message}
    Retry manually: PUT https://sentry.io/api/0/issues/{sentry-id}/ {"status":"resolved"|"ignored"}

Branch:  triage/sentry-{YYYY-MM-DD}
PR:      {URL from gh pr create}

Work each ingested report with:  /fix-bug
─────────────────────────────────────────────────────────────────────
```

End the turn.

## Triage model

### Default disposition rules

The skill assigns each Sentry issue a default disposition of `ingest` or
`ignore` using the following ordered rules. The first matching rule wins.

| Priority | Condition | Default | Rationale shape |
|---|---|---|---|
| 1 | Issue `status` is already `resolved` or `ignored` in Sentry (shouldn't appear in `is:unresolved` fetch, but guard against) | **ignore** | "already resolved/ignored in Sentry — skip" |
| 2 | A `docs/bugs/_reports/` report already has `source_refs` pointing at this Sentry issue URL | **ignore** | "already ingested as report {id}" |
| 3 | Issue `level` is `info` | **ignore** | "info-level — likely telemetry, not a bug" |
| 4 | Issue `level` is `warning` and title matches known benign patterns (see allowlist below) | **ignore** | "warning matches benign dev-server pattern" |
| 5 | Issue `level` is `fatal` or `error` | **ingest** | "error/fatal in production — warrants a bug report" |
| 6 | Issue `level` is `warning` (not matched by rule 4) | **ingest** | "warning with no benign match — ingest to review" |
| 7 | All other cases | **ingest** | "unknown level — ingest conservatively" |

The operator can override any default at the approval checkpoint via `edit`.

### Severity mapping

Sentry `level` values map to the queue's `severity` closed enum as follows:

| Sentry `level` | Queue `severity` |
|---|---|
| `fatal` | `critical` |
| `error` | `high` |
| `warning` | `medium` |
| `info` | `low` |
| (unknown / absent) | `low` |

The mapped severity is written to both `frontmatter.severity` and the
`## Severity & impact` body section. Both must agree per the queue contract.

### Benign-warning allowlist (rule 4)

The following patterns are treated as benign dev-server noise (HMR / Nuxt
dev-server lifecycle) and default to `ignore` when the issue level is `warning`.
Pattern matching is case-insensitive substring or regex match against the issue
title:

- `[vite] hmr` — Vite hot-module-replacement chatter
- `[vite] full reload` — Vite full-page reload notification
- `nuxt:hmr` — Nuxt HMR module update
- `[nuxt] page reload` — Nuxt dev-server page reload
- `enoent.*\.nuxt` — missing `.nuxt` cache file (stale build artifact)
- `incremental route update failed` — Nuxt dev-server route cache miss
- `performing full rebuild` — Nuxt dev-server triggered full rebuild
- `duplicated imports` — build-cache ghost from renamed files

This list is hard-coded for the first cut. A configurable allowlist is a
follow-up (see architecture § Out of scope).

## File format

### Frontmatter

```yaml
---
id: <fresh 6-char base36 token>
schema_version: 1
source: exception-triage
source_refs:
  - <sentry-issue-url>
title: <one-line title matching the body H1>
date: <YYYY-MM-DD>
severity: low | medium | high | critical
status: reported
---
```

Generate `id` with `LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6` — the
canonical command every producer uses (see the lifecycle § Id minting; this
skill previously documented a divergent 5-char hex mint). `source_refs` is
**always a YAML list** containing the Sentry issue URL — a durable pointer that
survives Sentry's UI changes. `severity` is **required** — map from Sentry
`level` using the severity mapping table above. Both `frontmatter.severity` and
the `## Severity & impact` body section must agree per the queue contract.

All eight frontmatter fields are required.

### Body

Always emit every required H2 verbatim and in order. No H2 may be left empty —
use a placeholder line per the queue contract if the Sentry data doesn't
populate the field. The body MUST NOT repeat metadata already in the frontmatter
(no second `id:` line, no separate `Severity:` heading duplicating the
frontmatter `severity`).

All 13 body sections from the queue template must be present in every emitted
report, in order:

```
## Summary
## Environment
## Steps to reproduce
## Expected
## Actual
## Reproducibility
## Severity & impact
## Affected surface / route / module
## Preconditions / data setup
## Evidence
## Regression window
## Workaround
## Open questions
```

Populate `## Evidence` with the Sentry issue URL and any stack trace or event
data visible in the issue payload. Populate `## Summary` from the Sentry issue
title and description. Use placeholders for fields the Sentry data does not
supply.

### Link paths

Use **absolute-from-repo-root** link paths in report bodies (e.g.
`docs/standards/visual-language.md`, not `../resources/today.md`). Report files
live under `docs/bugs/_reports/<dated-slug>/report.md`, but a future `/fix-bug`
run may copy the body into `docs/bugs/<dated-slug>/` at a different folder depth.
Relative paths that resolve from `_reports/<dated-slug>/` would silently break
there; absolute paths resolve identically from both locations.

### Folder

```
<YYYY-MM-DD>-<id>-<slug>/report.md
```

`<slug>` is derived from the Sentry issue title via the **normative kebab-slug
algorithm** in `docs/specs/_proposed/README.md` § Kebab-slug derivation
(`../../../docs/specs/_proposed/README.md` from this skill).
Do NOT invent a different algorithm.

## Scope

What this skill does NOT do:

- Does NOT fix bugs or run `/fix-bug`. After the PR lands, the operator runs
  `/fix-bug` on each ingested report.
- Does NOT integrate Sentry into the gym app — that is sibling spec `d388d`.
  This skill only calls the Sentry management API from the operator session via
  `curl`.
- Does NOT change the `docs/bugs/_reports/` queue contract. Adding a row to the
  producers table is a registration update, not a contract change.
- Does NOT delete Sentry issues or touch project settings beyond per-issue
  ignore/resolve status.
- Does NOT mutate anything — no branch, no file write, no Sentry API call —
  before the operator replies `approve`.
- Does NOT survive session interruption. Re-invoke if interrupted.
  - If interrupted before step 6, no branch exists — clean re-invoke.
  - If interrupted during step 6 after the branch was created but before push:
    the operator can push and open the PR manually, or `git branch -D` the
    branch and re-invoke.
  - If interrupted after the PR is open but before all Sentry mutations
    completed: report files are safe (committed); the operator applies the
    remaining Sentry mutations manually (the closing summary lists them).
- Does NOT write a per-run audit folder or envelope JSON. The git diff on the
  branch and the PR body are the audit.

## Rules

- **Conservative-drop bias on triage ambiguity.** When a cluster or issue is
  ambiguous between ingest and ignore, the default disposition leans toward
  `ignore`. A false ingest (reporting noise as a bug) costs the operator more
  than a missed one. The approval checkpoint is the safety valve.
- **Severity agrees in frontmatter and body.** The `severity` value is written
  to both `frontmatter.severity` and the `## Severity & impact` body section,
  and both must agree. Never let them drift.
- **De-dup is this producer's job.** The queue contract places de-duplication
  responsibility on the producer. The two-check de-dup pass in step 3 is the
  mechanism; if both checks error, ingest conservatively (safe failure direction).
- **No writes or mutations until `approve`.** The branch, report files, and
  Sentry API calls all fire only after the operator approves. `cancel` at any
  point before `approve` leaves the repo and Sentry unchanged.
- **Sentry mutations fire only after the PR opens.** Repo side commits first,
  then Sentry is updated. This ordering ensures the PR exists before the
  link-back comment is posted — and ensures that a Sentry mutation failure never
  rolls back the repo side.
- **Repo side is the source of truth; it is never rolled back on a Sentry
  failure.** If a Sentry mutation fails after the PR is open, the report files
  and PR are preserved. The closing summary lists failed mutations for manual
  retry.
- **Env-var-unset → graceful clean exit.** Missing `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG`, or `SENTRY_PROJECT` causes an informative exit with setup
  instructions. No partial state is left behind.
