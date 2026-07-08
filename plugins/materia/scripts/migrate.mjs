#!/usr/bin/env node
// migrate.mjs — deterministic, PLAN-FIRST project-upgrade engine for a
// Materia-installed project. Reads the release/artifact compatibility contract
// (this plugin's bundled release/ ledger) + the target project's
// .materia/project.json, then either PLANS (default — writes nothing) or APPLIES
// only safe, idempotent migrations. NO network, NO AI.
//
// It shares the ledger read + state detection with /materia:doctor via
// ./lib/materia-contract.mjs (the single detector), so doctor's report and
// migrate's plan agree by construction. doctor is read-only and only *suggests*
// migrate; migrate is the explicit, operator-invoked command that acts.
//
// Ships INSIDE the plugin so an installed skill runs it from the read-only
// plugin cache:
//   node "$CLAUDE_PLUGIN_ROOT/scripts/migrate.mjs" [targetPath] [--apply] [--json]
// The ledger is the script's sibling ../release; the TARGET project is a separate
// root (positional arg, default cwd) — never the plugin cache.
//
// v0 / dogfood-grade: TWO implemented migrations. `init-project-state` (reserved in
// `0.2.0-project-state-file`.migrations) initializes .materia/project.json for a
// detectable pre-tracking ("untracked-legacy") install. `install-check-docs` (reserved
// in `0.3.0-check-docs-sh-gate` + `0.3.0-scripts-relocation`.migrations) puts the binding
// check:docs gate script at its canonical .materia/scripts/check-docs.sh — renaming a
// legacy scripts/check-docs.sh in place (preserving any local edits) or copying it from
// the plugin scaffold when absent — then stamps artifact schema 3 in the project-state
// file. Every other ledger-declared migration is reported as skipped/manual until a
// handler exists. Guardrails: plan writes nothing; apply performs file ops FIRST and the
// project.json stamp LAST (an interrupted apply leaves a recoverable schema-behind state,
// never a stamped-but-unmoved orphan), writes project.json atomically, NEVER overwrites an
// existing gate script or a non-schema-2 project-state file, and never DELETES anything
// (a superseded root copy or a stale scripts/check-docs.mjs is surfaced as a manual
// cleanup item, not removed); nothing auto-runs from startup hooks.
//
// It also runs a deterministic, NO-AI consumer REFERENCE SWEEP: for a migration that
// relocates/renames/replaces an artifact (see the REGISTRY `referenceSweep` field), it
// walks the target repo and REPORTS every stale reference to the old path (the gymii
// lesson — a moved gate script leaves the repo's own package.json / CI / § Gate row /
// docs pointing at the old location, a broken gate behind a healthy doctor). The scan is
// window-independent (it runs even when the migration is not in the schema window, so a
// schema-complete-but-stale repo is still surfaced) and emits `referenceFollowUps`; the
// engine only reports the hits, the migrate SKILL performs the bounded sweep.
//
// Usage: node migrate.mjs [targetPath] [--plan|--apply] [--json] [--help]
// Exit:  0 ok (plan produced / apply done) · 2 tool fault or apply write failure
import { writeFileSync, readFileSync, renameSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { inspect, readLedger, relevantChanges, isInt, readJson, MIG } from './lib/materia-contract.mjs'

// ---- migration registry -----------------------------------------------------
// One entry per implemented, stable migration id. Each migration:
//  - id / title
//  - touchesExistingFiles: whether apply could modify/move a file the user may have
//    edited (drives the plan's "local edits may be affected" flag). init-project-state
//    only ever CREATES a missing file → false; install-check-docs may RENAME a legacy
//    gate script (preserving edits) → true.
//  - classify(report, targetRoot) -> { disposition, reason, files, manualNote? }
//      disposition ∈ applicable | satisfied | manual | not-applicable
//      files: repo-relative paths apply would create/change (only for `applicable`)
//      manualNote: an optional by-hand cleanup the migration will NOT perform (a
//        superseded root copy, or a stale scripts/check-docs.mjs) — surfaced as its
//        own manual item alongside the (possibly applicable) migration.
//  - apply(targetRoot) -> { created: string[], state: object|null }  (only call when
//    classify returned `applicable`)
//  - referenceSweep?: OPTIONAL array documenting the artifacts this migration
//    relocates/renames/replaces, so the engine can deterministically SCAN the target
//    repo for stale CONSUMER references (the gymii lesson: a migration that moves a gate
//    script leaves the repo's OWN package.json / CI / MATERIA.md § Gate row / docs still
//    naming the old path — a broken gate behind a healthy doctor). Each token:
//      { from, to, autoFix }
//        from: the OLD repo-relative path consumers may still name (the scan token)
//        to:   the NEW canonical path (excluded from the scan; drives staleNow)
//        autoFix: true  → a mechanical path swap the skill may apply unattended
//                 false → needs command-shape judgement (e.g. `node X.mjs` → `sh Y.sh`),
//                         so the skill LISTS it with a suggested rewrite, never auto-edits
//    ADD a referenceSweep whenever a migration relocates/renames/replaces an artifact
//    repos reference. The scan (scanReferences, below) is WINDOW-INDEPENDENT: it runs on
//    every plan/apply against a Materia-enabled target regardless of whether the migration
//    is in the schema window, so a schema-complete repo whose consumers are still stale
//    (the literal gymii failure mode) is still surfaced. The engine only REPORTS the hits
//    (referenceFollowUps); the migrate SKILL performs the bounded sweep — no AI here.

// `init-project-state` establishes artifact schema 2 — the schema of the change
// that reserves it (0.2.0-project-state-file). It records THIS literal, not the
// ledger's latest schema: stamping "latest" would falsely mark a repo current
// and hide a future schema-N drift this migration does not adopt.
const INIT_STATE_SCHEMA = 2
const STATE_REL = join('.materia', 'project.json')
// `install-check-docs` stamps schema 3 — the schema of the changes that reserve it
// (0.3.0-check-docs-sh-gate + 0.3.0-scripts-relocation). Its gate script lives at the
// canonical CHECK_DOCS_CANON; a legacy install may still carry it at CHECK_DOCS_ROOT, and
// the artifact the .sh replaced is CHECK_DOCS_MJS (never deleted — surfaced as manual).
const CHECK_DOCS_SCHEMA = 3
const CHECK_DOCS_CANON = join('.materia', 'scripts', 'check-docs.sh')
const CHECK_DOCS_ROOT = join('scripts', 'check-docs.sh')
const CHECK_DOCS_MJS = join('scripts', 'check-docs.mjs')

const initProjectState = {
  id: MIG.INIT_PROJECT_STATE, // shared source of truth (== 'init-project-state'); keeps REGISTRY in sync with KNOWN_MIGRATION_IDS
  title: 'Initialize project-state file (.materia/project.json)',
  touchesExistingFiles: false,
  classify (report) {
    if (!report.materiaEnabled)
      return { disposition: 'not-applicable', files: [],
        reason: 'repo is not Materia-enabled (no MATERIA.md / .materia/) — no project state to initialize. If you expected a Materia repo, run /materia:init.' }
    // Belt-and-suspenders: unreachable under current buildPlan control flow (a
    // malformed state sets fromSchema=null, so relevantChanges returns [] and
    // this classify() never runs — the malformed manual item comes from
    // buildPlan's own structural check). Kept so the migration is self-contained
    // and correct if a future caller classifies it directly.
    if (report.malformed)
      return { disposition: 'manual', files: [],
        reason: `${STATE_REL} is present but malformed — fix the invalid JSON by hand; migrate will not overwrite it.` }
    if (report.missing)
      return { disposition: 'applicable', files: [STATE_REL],
        reason: 'no .materia/project.json — pre-tracking (untracked-legacy) install; will initialize project state.' }
    // present & parsed:
    if (isInt(report.currentSchema) && report.currentSchema >= INIT_STATE_SCHEMA)
      return { disposition: 'satisfied', files: [],
        reason: `${STATE_REL} present and current (schema ${report.currentSchema}).` }
    return { disposition: 'manual', files: [],
      reason: `${STATE_REL} present but records ${report.currentSchema === null ? 'an unknown schema' : `schema ${report.currentSchema}`} (expected >= ${INIT_STATE_SCHEMA}) — review by hand; migrate will not overwrite an existing file.` }
  },
  apply (targetRoot) {
    const state = {
      artifactSchema: INIT_STATE_SCHEMA,
      pluginVersion: null,          // version-agnostic, mirrors the scaffold shape
      source: 'legacy-0.1.0',       // provenance: adopted from a pre-tracking install
      appliedMigrations: [this.id], // records the migration that ran
    }
    const dir = join(targetRoot, '.materia')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const dest = join(targetRoot, STATE_REL)
    // Atomic write: temp file + rename, so an interrupted apply can never leave a
    // half-written (self-inflicted malformed) project.json behind. If the rename
    // throws (near-impossible same-dir case), clean up the temp so no stray file
    // lingers, then rethrow for runApply to record as a tool fault.
    const tmp = join(dir, `.project.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
    try { renameSync(tmp, dest) }
    catch (e) { rmSync(tmp, { force: true }); throw e }
    return { created: [STATE_REL], state }
  },
}

const installCheckDocs = {
  id: MIG.INSTALL_CHECK_DOCS, // shared source of truth (== 'install-check-docs')
  title: 'Install the check:docs gate script at .materia/scripts/check-docs.sh (schema 3)',
  touchesExistingFiles: true, // may RENAME a legacy scripts/check-docs.sh in place
  // Consumer references this migration's relocate/replace leaves stale (see the REGISTRY
  // field doc). The .sh is MOVED (same basename, new dir) — a mechanical path swap, so
  // autoFix. The .mjs is REPLACED (the portable POSIX-sh gate superseded the old Node
  // checker): consumers say `node scripts/check-docs.mjs`, which must become `sh
  // .materia/scripts/check-docs.sh` — a command-SHAPE change, not a path swap, so the
  // engine lists it and the skill judges it (autoFix:false, never rewritten mechanically).
  // Kept as literal '/'-form paths (matching CHECK_DOCS_ROOT/CANON/MJS) so the scan tokens
  // are platform-independent — scanReferences compares them against '/'-form rel paths.
  referenceSweep: [
    { from: 'scripts/check-docs.sh', to: '.materia/scripts/check-docs.sh', autoFix: true },
    { from: 'scripts/check-docs.mjs', to: '.materia/scripts/check-docs.sh', autoFix: false },
  ],
  classify (report, targetRoot) {
    if (!report.materiaEnabled)
      return { disposition: 'not-applicable', files: [],
        reason: 'repo is not Materia-enabled (no MATERIA.md / .materia/) — nothing to install. If you expected a Materia repo, run /materia:init.' }
    const atCanon = existsSync(join(targetRoot, CHECK_DOCS_CANON))
    const atRoot = existsSync(join(targetRoot, CHECK_DOCS_ROOT))
    const staleMjs = existsSync(join(targetRoot, CHECK_DOCS_MJS))
    // Compose a manual cleanup note the migration will NOT perform (never deletes a file).
    const cleanup = (extra) => {
      const parts = []
      if (extra) parts.push(extra)
      if (staleMjs) parts.push(`a stale ${CHECK_DOCS_MJS} (the artifact ${CHECK_DOCS_CANON} replaced) is present — remove it by hand; migrate never deletes it`)
      return parts.length ? `${MIG.INSTALL_CHECK_DOCS} manual cleanup: ${parts.join('; ')}.` : undefined
    }
    // Disposition table (first match wins) — evaluated in the plan's ordered form:
    // 1. present-and-parsed state with integer schema < 2, or an unknown/null schema →
    //    MANUAL (mirrors init-project-state's refusal — never stamp a hand-authored
    //    stale state; this is the never-overwrite guarantee for the project-state file).
    if (!report.missing && !report.malformed &&
        (report.currentSchema === null || (isInt(report.currentSchema) && report.currentSchema < INIT_STATE_SCHEMA)))
      return { disposition: 'manual', files: [],
        reason: `${STATE_REL} records ${report.currentSchema === null ? 'an unknown schema' : `schema ${report.currentSchema}`} (expected >= ${INIT_STATE_SCHEMA}) — review by hand; migrate will not stamp a hand-authored stale state.`,
        manualNote: cleanup() }
    // 2. script already canonical ∧ schema already >= 3 → SATISFIED (defensive: at the
    //    latest schema install-check-docs isn't even discovered, so this is only reached
    //    by a direct classify() caller; a superseded root copy is named for removal).
    if (atCanon && isInt(report.currentSchema) && report.currentSchema >= CHECK_DOCS_SCHEMA)
      return { disposition: 'satisfied', files: [],
        reason: atRoot
          ? `${CHECK_DOCS_CANON} present and schema ${report.currentSchema} — current; a superseded ${CHECK_DOCS_ROOT} also exists (remove it by hand).`
          : `${CHECK_DOCS_CANON} present and schema ${report.currentSchema} — current.`,
        manualNote: cleanup(atRoot ? `a superseded ${CHECK_DOCS_ROOT} is present — remove it by hand` : undefined) }
    // 3. script already canonical (incl. both-locations) ∧ (missing state or schema 2) →
    //    APPLICABLE, stamp only (no file op — never overwrite the canonical script).
    if (atCanon && (report.missing || report.currentSchema === INIT_STATE_SCHEMA))
      return { disposition: 'applicable', files: [STATE_REL],
        reason: atRoot
          ? `${CHECK_DOCS_CANON} present; will stamp artifact schema ${CHECK_DOCS_SCHEMA}. A superseded ${CHECK_DOCS_ROOT} also exists — remove it by hand (migrate leaves it untouched).`
          : `${CHECK_DOCS_CANON} present; will stamp artifact schema ${CHECK_DOCS_SCHEMA}.`,
        manualNote: cleanup(atRoot ? `a superseded ${CHECK_DOCS_ROOT} is present — remove it by hand` : undefined) }
    // 4. script at root only ∧ (missing state or schema 2) → APPLICABLE, rename in place
    //    (preserves local edits) then stamp.
    if (atRoot && (report.missing || report.currentSchema === INIT_STATE_SCHEMA))
      return { disposition: 'applicable', files: [CHECK_DOCS_CANON, STATE_REL],
        reason: `${CHECK_DOCS_ROOT} will be relocated to ${CHECK_DOCS_CANON} (rename in place — preserves local edits), then artifact schema ${CHECK_DOCS_SCHEMA} stamped.`,
        manualNote: cleanup() }
    // 5. script at neither ∧ (missing state or schema 2) → APPLICABLE, copy from the
    //    plugin scaffold then stamp.
    if (report.missing || report.currentSchema === INIT_STATE_SCHEMA)
      return { disposition: 'applicable', files: [CHECK_DOCS_CANON, STATE_REL],
        reason: `no check:docs gate script — will copy it from the plugin scaffold to ${CHECK_DOCS_CANON}, then stamp artifact schema ${CHECK_DOCS_SCHEMA}.`,
        manualNote: cleanup() }
    // Defensive fallback: no reachable input lands here (schema >= 3 is not discovered;
    // schema < 2 / unknown handled above), but never offer an unclassified write.
    return { disposition: 'not-applicable', files: [],
      reason: `${CHECK_DOCS_CANON}: nothing applicable for schema ${report.currentSchema}.`, manualNote: cleanup() }
  },
  apply (targetRoot) {
    const created = []
    // FILE OP FIRST — never overwrite an existing canonical script.
    const canonAbs = join(targetRoot, CHECK_DOCS_CANON)
    if (!existsSync(canonAbs)) {
      const scriptsDir = join(targetRoot, '.materia', 'scripts')
      if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true })
      const rootAbs = join(targetRoot, CHECK_DOCS_ROOT)
      if (existsSync(rootAbs)) renameSync(rootAbs, canonAbs) // rename preserves local edits
      else copyFileSync(resolve(import.meta.dirname, '../scaffold/.materia/scripts/check-docs.sh'), canonAbs)
      created.push(CHECK_DOCS_CANON)
    }
    // STAMP LAST — re-read project.json from DISK (init-project-state may have created it
    // seconds earlier in the SAME apply run; version files sort 0.2.0 < 0.3.0, so its
    // migration is discovered and applied before this one). Stamp ONLY a parsed, integer,
    // 2 <= schema < 3 state; append the id only if absent (idempotent re-apply is byte-
    // stable). An interrupted apply that stopped before this leaves a recoverable
    // schema-behind state (doctor suggests migrate; a stamp-only re-apply finishes it).
    let state = null
    const statePath = join(targetRoot, STATE_REL)
    if (existsSync(statePath)) {
      const p = readJson(statePath)
      if (!p.error && isInt(p.value.artifactSchema) &&
          p.value.artifactSchema >= INIT_STATE_SCHEMA && p.value.artifactSchema < CHECK_DOCS_SCHEMA) {
        state = { ...p.value, artifactSchema: CHECK_DOCS_SCHEMA }
        const applied = Array.isArray(p.value.appliedMigrations) ? p.value.appliedMigrations.slice() : []
        if (!applied.includes(this.id)) applied.push(this.id)
        state.appliedMigrations = applied
        const dir = join(targetRoot, '.materia')
        const tmp = join(dir, `.project.json.tmp-${process.pid}`)
        writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
        try { renameSync(tmp, statePath) }
        catch (e) { rmSync(tmp, { force: true }); throw e }
        created.push(STATE_REL)
      }
    }
    return { created, state }
  },
}

const REGISTRY = { [initProjectState.id]: initProjectState, [installCheckDocs.id]: installCheckDocs }

// ---- arg parsing ------------------------------------------------------------
const parseArgs = (argv) => {
  const out = { apply: false, json: false, help: false, target: null }
  for (const a of argv) {
    if (a === '--apply') out.apply = true
    else if (a === '--plan') out.apply = false
    else if (a === '--json') out.json = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a.startsWith('-')) { /* ignore unknown flags in v0 */ }
    else if (out.target === null) out.target = a
  }
  return out
}

const HELP = `materia migrate — plan-first project upgrade for a Materia-installed project

Usage: node migrate.mjs [targetPath] [--plan|--apply] [--json] [--help]

  targetPath   project root to migrate (default: current working directory)
  --plan       inspect and print the migration plan; writes NOTHING (default)
  --apply      apply only safe, idempotent migrations
  --json       emit the structured report as JSON
  --help, -h   show this help

Default is --plan. Apply implements two migrations: init-project-state, which
initializes .materia/project.json for a pre-tracking (untracked-legacy) install;
and install-check-docs, which puts the check:docs gate script at its canonical
.materia/scripts/check-docs.sh (renaming a legacy scripts/check-docs.sh in place,
or copying it from the plugin scaffold) and stamps artifact schema 3. Apply does
file ops first and the project.json stamp last, never overwrites an existing gate
script or a non-schema-2 state file, and never deletes anything (a superseded root
copy or stale scripts/check-docs.mjs is surfaced as a manual cleanup item).

Both --plan and --apply also run a deterministic, no-AI reference sweep: they scan
the target repo for stale references to a relocated/replaced artifact (e.g. a
scripts/check-docs.sh a consumer still names after it moved to
.materia/scripts/check-docs.sh) and report them as referenceFollowUps — the engine
only reports the hits; the /materia:migrate skill performs the bounded sweep and
re-runs the repo's check:docs gate. Run /materia:doctor afterward to confirm health.`

// ---- reference sweep: deterministic consumer scan ---------------------------
// For a migration carrying `referenceSweep` (see the REGISTRY field doc), walk the TARGET
// repo and find every stale reference to a relocated/replaced artifact — the gymii failure
// mode (a moved gate script leaves the repo's own package.json / CI / § Gate row / docs
// naming the old path). WINDOW-INDEPENDENT and NO-AI: the engine only REPORTS hits
// (referenceFollowUps); the migrate skill performs the bounded sweep.
//
// Scan contract (deterministic, reproducible):
//  - ONE walk for all tokens. Skip .git, node_modules, and the FROZEN dated run folders
//    (docs/specs/<dated-slug>/**, docs/bugs/_reports/<dated-slug>/**) — historical run
//    artifacts are never rewritten. The sibling index README.md / _proposed/ / _templates/
//    are present-state and ARE scanned (they are genuine consumers).
//  - Per token, EXCLUDE the from-path artifact itself and the to-path: the artifact is not
//    its own consumer (its header self-reference is a false positive that post-move
//    dangles), and the relocated file at `to` is the destination, not a stale consumer.
//  - utf8-readable, size-capped files only; a null byte skips the file as binary.
//  - The match is the from-path with regex metacharacters ESCAPED (a raw `.` would
//    wildcard), wrapped in the fixed-length lookbehind (?<!\.materia\/) — the same idiom as
//    validator §1e's BADPATH — so a canonical `.materia/scripts/check-docs.sh` never
//    matches, while `scripts/check-docs.sh.bak` (a real stale consumer) deliberately does.
//  - hits[] sorted (file, then line) for stable, reproducible output.
//  - staleNow per token: the artifact is at its canonical `to` location now, so consumers
//    still naming `from` are stale THIS INSTANT (a MOVED artifact's refs are broken; a
//    REPLACED artifact's refs point at a superseded checker the canonical gate replaced).
//    Pre-move (to absent) it is false — the refs only go stale once apply relocates.
//  - Emit only tokens WITH hits (a token with no stale consumer has nothing to surface).
const REF_SCAN_MAX_BYTES = 512 * 1024
const DATED_SLUG = /^\d{4}-\d{2}-\d{2}-/
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const scanReferences = (targetRoot, mig) => {
  const sweeps = Array.isArray(mig.referenceSweep) ? mig.referenceSweep : []
  if (!sweeps.length) return []
  const tokens = sweeps.map((s) => ({
    id: mig.id, from: s.from, to: s.to, autoFix: s.autoFix,
    re: new RegExp(`(?<!\\.materia\\/)${escapeRegExp(s.from)}`),
    exclude: new Set([s.from, s.to]), // from-path artifact + to-path, in '/'-form
    hits: [],
  }))
  // ONE bounded walk. `rel` is kept in '/'-form (platform-independent) so it compares
  // directly against the '/'-form sweep tokens; `abs` uses the OS separator for fs reads.
  const walk = (abs, rel) => {
    let entries
    try { entries = readdirSync(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const childAbs = join(abs, e.name)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules') continue
        // Frozen dated run folders: only a DATED-slug dir directly under docs/specs/ or
        // docs/bugs/_reports/ is exempt — not the sibling README.md / _proposed/ /
        // _templates/, which are present-state and stay in the scan.
        if ((rel === 'docs/specs' || rel === 'docs/bugs/_reports') && DATED_SLUG.test(e.name)) continue
        walk(childAbs, childRel)
      } else if (e.isFile()) {
        let content
        try {
          if (statSync(childAbs).size > REF_SCAN_MAX_BYTES) continue
          content = readFileSync(childAbs, 'utf8')
        } catch { continue }
        if (content.includes('\0')) continue // binary skip
        const lines = content.split('\n')
        for (const t of tokens) {
          if (t.exclude.has(childRel)) continue
          for (let i = 0; i < lines.length; i++)
            if (t.re.test(lines[i])) t.hits.push({ file: childRel, line: i + 1 })
        }
      }
    }
  }
  walk(targetRoot, '')
  for (const t of tokens)
    t.hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  return tokens
    .filter((t) => t.hits.length)
    .map((t) => ({
      id: t.id, from: t.from, to: t.to, autoFix: t.autoFix,
      staleNow: existsSync(join(targetRoot, ...t.to.split('/'))),
      hits: t.hits,
    }))
}

// Run the sweep across every REGISTRY migration that declares one, for a target already
// known Materia-enabled. Order follows REGISTRY insertion (deterministic).
const collectReferenceFollowUps = (targetRoot) => {
  const out = []
  for (const mig of Object.values(REGISTRY))
    if (Array.isArray(mig.referenceSweep) && mig.referenceSweep.length)
      out.push(...scanReferences(targetRoot, mig))
  return out
}

// ---- planning ---------------------------------------------------------------
// Registry-driven: apply decisions come from each migration's classify(), NEVER
// from schema arithmetic (report.currentSchema is the string 'untracked-legacy'
// for the legacy case — comparing it numerically would silently match nothing on
// the one repo migrate exists to fix). The ledger is read only for REPORTING:
// the target schema, and to surface ledger-declared migration ids that have no
// implemented handler yet (skipped) with their manual instructions.
const buildPlan = (targetRoot, releaseDir) => {
  const report = inspect(targetRoot, releaseDir)
  const ledger = readLedger(releaseDir)

  const out = {
    mode: 'plan',
    target: targetRoot,
    status: report.status,
    materiaEnabled: report.materiaEnabled,
    currentSchema: report.currentSchema,
    latestSchema: report.latestSchema,
    targetSchema: report.latestSchema,
    missing: report.missing,
    malformed: report.malformed,
    toolFault: false,
    applicable: [],   // migrations that can be safely applied now (+ files)
    satisfied: [],    // already adopted / current — no-op
    manual: [],       // needs human judgement (structural + migration `manual`)
    skipped: [],      // not-applicable, or a ledger id with no handler yet
    filesToChange: [],
    localEditsAffected: false,
    referenceFollowUps: [], // stale consumer references a referenceSweep migration surfaces
    nextCommand: null,
  }

  // Tool fault: the plugin's OWN ledger failed to read. Not the project's fault.
  if (ledger.error) {
    out.toolFault = true
    out.status = 'blocked'
    out.manual.push({ id: 'release-ledger-readable',
      reason: `TOOL FAULT (not the project): could not read this plugin's release ledger — ${ledger.error}` })
    return out
  }

  // Structural, non-adoption manual items derived straight from the report — so
  // migrate reports them WITHOUT echoing the ledger's "do it by hand" adoption
  // text for a change it can actually automate.
  if (report.malformed)
    out.manual.push({ id: 'project-state-parses',
      reason: `Fix ${STATE_REL} (invalid JSON) by hand; migrate will not overwrite it.` })
  else if (report.materiaEnabled && !report.missing && report.currentSchema === null)
    out.manual.push({ id: 'artifact-schema-known',
      reason: `${STATE_REL} has an unknown artifactSchema; set a valid integer by hand.` })
  else if (isInt(report.currentSchema) && report.currentSchema < 1)
    // Mirror doctor's blocked "not a known integer schema" verdict: a present,
    // parsed state carrying an integer schema below the 1 floor is a structural
    // fault, not an adoptable drift — surface it here and skip ledger diffing
    // (below) so migrate never offers init-project-state against it.
    out.manual.push({ id: 'artifact-schema-known',
      reason: `${STATE_REL} records artifactSchema ${report.currentSchema}, not a known integer schema (expected 1..${report.latestSchema}); set a valid integer by hand.` })
  else if (isInt(report.currentSchema) && report.currentSchema > report.latestSchema)
    out.manual.push({ id: 'artifact-schema-known',
      reason: `Project is on artifact schema ${report.currentSchema}, newer than this plugin's latest (${report.latestSchema}) — update the materia plugin.` })
  if (report.materiaEnabled === false)
    out.manual.push({ id: 'materia-enabled',
      reason: 'This repo is not Materia-enabled (no MATERIA.md / .materia/) — migrate invents no state. If you expected a Materia repo, run /materia:init.' })

  // Ledger-driven candidate discovery with a SAFE fromSchema (never the
  // 'untracked-legacy' string). Missing/legacy → 1; a known integer schema (≥ 1)
  // → it; malformed/unknown/below-the-1-floor → no ledger diffing (structural
  // manual items above cover those).
  let fromSchema = null
  if (report.missing || report.currentSchema === 'untracked-legacy') fromSchema = 1
  else if (isInt(report.currentSchema) && report.currentSchema >= 1) fromSchema = report.currentSchema
  const changes = (fromSchema !== null && !report.malformed)
    ? relevantChanges(ledger.versions, fromSchema, report.latestSchema) : []

  const seen = new Set()
  for (const ch of changes) {
    for (const migId of Array.isArray(ch.migrations) ? ch.migrations : []) {
      if (seen.has(migId)) continue
      seen.add(migId)
      const mig = REGISTRY[migId]
      if (!mig) {
        out.skipped.push({ id: migId, change: ch.id, impact: ch.impact,
          reason: ch.manualMigration
            ? `no automated migration implemented yet — adopt by hand: ${ch.manualMigration}`
            : 'no automated migration implemented yet.' })
        continue
      }
      const c = mig.classify(report, targetRoot)
      const item = { id: migId, title: mig.title, change: ch.id, impact: ch.impact, reason: c.reason, files: c.files }
      if (c.disposition === 'applicable') {
        out.applicable.push(item)
        out.filesToChange.push(...c.files)
        if (mig.touchesExistingFiles) out.localEditsAffected = true
      } else if (c.disposition === 'satisfied') out.satisfied.push(item)
      else if (c.disposition === 'manual') out.manual.push(item)
      else out.skipped.push(item) // not-applicable
      // A by-hand cleanup the migration will NOT perform (superseded root copy, stale
      // .mjs) rides alongside the (possibly applicable) migration as its own manual item.
      if (c.manualNote) out.manual.push({ id: `${migId}-cleanup`, change: ch.id, reason: c.manualNote })
    }
  }

  // Dedup filesToChange: two migrations (init-project-state + install-check-docs) may both
  // name .materia/project.json in one legacy adopt — report each path once.
  out.filesToChange = [...new Set(out.filesToChange)]

  // Window-independent consumer reference sweep (see scanReferences). Runs on every plan
  // against a Materia-enabled target regardless of whether install-check-docs is in-window
  // — the schema-complete-but-stale repo (gymii) must still be surfaced. Plan REPORTS only,
  // writes nothing. A non-Materia repo has nothing to sweep (and toolFault returned above).
  if (report.materiaEnabled) out.referenceFollowUps = collectReferenceFollowUps(targetRoot)

  out.nextCommand = out.applicable.length ? '/materia:migrate --apply' : null
  return out
}

// ---- apply ------------------------------------------------------------------
const runApply = (targetRoot, releaseDir) => {
  const plan = buildPlan(targetRoot, releaseDir)
  const out = { ...plan, mode: 'apply', applied: [], created: [], notChanged: [], projectState: null, nextCommand: null }
  if (plan.toolFault) return out

  // Best-effort sweep of stray atomic-write temp files from a prior interrupted
  // apply (.materia/.project.json.tmp-<pid>). They never carry state we need and
  // would otherwise linger; failures here are non-fatal and never touch project.json.
  const materiaDir = join(targetRoot, '.materia')
  if (existsSync(materiaDir)) {
    try {
      for (const name of readdirSync(materiaDir))
        if (name.startsWith('.project.json.tmp-')) rmSync(join(materiaDir, name), { force: true })
    } catch { /* best-effort: a sweep failure must never block a real migration */ }
  }

  // Apply only the migrations classify() marked `applicable`. Everything else
  // (manual, skipped, satisfied) is recorded as NOT changed, with its reason.
  for (const item of plan.satisfied) out.notChanged.push({ id: item.id, reason: item.reason })
  for (const item of plan.manual) out.notChanged.push({ id: item.id, reason: item.reason })
  for (const item of plan.skipped) out.notChanged.push({ id: item.id, reason: item.reason })

  for (const item of plan.applicable) {
    const mig = REGISTRY[item.id]
    try {
      const res = mig.apply(targetRoot)
      out.applied.push({ id: item.id, title: mig.title })
      out.created.push(...res.created)
    } catch (e) {
      out.toolFault = true
      out.status = 'blocked'
      out.notChanged.push({ id: item.id, reason: `apply failed — ${e.message}` })
      return out
    }
  }

  // Dedup created: two migrations may both write .materia/project.json in one adopt
  // (init-project-state creates it, install-check-docs stamps it) — report it once.
  out.created = [...new Set(out.created)]

  // Re-inspect for the post-migration truth + read back the project state.
  const after = inspect(targetRoot, releaseDir)
  out.status = after.status
  out.currentSchema = after.currentSchema
  out.missing = after.missing
  out.malformed = after.malformed
  const statePath = join(targetRoot, STATE_REL)
  if (existsSync(statePath)) {
    try { out.projectState = JSON.parse(readFileSync(statePath, 'utf8')) } catch { out.projectState = null }
  }

  // Re-scan consumer references against the POST-apply tree: the relocate/replace has run,
  // so the artifact now sits at its canonical location and staleNow flips TRUE for the refs
  // that still name the old path (the skill's sweep targets exactly these). Guarded on the
  // re-inspected Materia-enabled result; on tool fault we returned earlier without a rescan
  // (so the human render's !toolFault early-return never reaches the follow-ups block).
  out.referenceFollowUps = after.materiaEnabled ? collectReferenceFollowUps(targetRoot) : []

  out.nextCommand = '/materia:doctor'
  return out
}

// ---- human-readable rendering ----------------------------------------------
// Reference follow-ups block — stale consumer references the migrate SKILL sweeps (autoFix
// true tokens) or lists for judgement (false). Rendered in BOTH plan and apply (apply is
// guarded on !toolFault by renderHuman's early return). Per-token wording honors the
// moved-vs-replaced distinction: a REPLACED artifact is never described as "moved" (the
// same basename ⇒ moved, a different basename ⇒ replaced). Apply mode closes with the gate
// re-run so the bare-CLI fallback is complete instructions.
const followUpLines = (r) => {
  const fu = (r.referenceFollowUps ?? []).filter((t) => t.hits.length)
  if (!fu.length) return []
  const L = ['', '  Reference follow-ups (stale consumer references — /materia:migrate\'s skill sweeps them):']
  for (const t of fu) {
    const moved = t.from.split('/').pop() === t.to.split('/').pop()
    const shape = t.autoFix ? 'auto-fixable path swap' : 'needs command-shape judgement — listed, not auto-edited'
    L.push(`    ${t.id}: ${t.from} → ${t.to} (${shape})`)
    let intro
    if (t.staleNow)
      intro = moved
        ? 'These references are stale NOW (the artifact already moved to its canonical location) — update them or let /materia:migrate\'s skill sweep them:'
        : `These references are stale NOW (the canonical gate exists; they still name the superseded ${t.from}) — update them or let /materia:migrate's skill sweep them:`
    else
      intro = 'After apply, these references will need updating (the skill sweeps them):'
    L.push(`      ${intro}`)
    for (const h of t.hits) L.push(`        - ${h.file}:${h.line}`)
  }
  if (r.mode === 'apply')
    L.push('    Then re-run your check:docs gate (MATERIA.md § Gate) to confirm it passes.')
  return L
}

const renderHuman = (r) => {
  const L = []
  L.push(`materia migrate (${r.mode}) — ${r.target}`)
  L.push('')
  // Tool fault: we bailed on our OWN ledger (or an apply write failed) before a
  // useful state read, so don't print (misleading) Materia-enabled / schema lines.
  // The reason lives in `manual` (ledger fault) or `notChanged` (apply-write
  // failure) — render both so the human mode never fails silently.
  if (r.toolFault) {
    for (const m of [...r.manual, ...(r.notChanged ?? [])]) L.push(`  ✗ ${m.reason}`)
    return L.join('\n')
  }
  L.push(`  Materia-enabled: ${r.materiaEnabled ? 'yes' : 'no'}`)
  L.push(`  project schema: ${r.currentSchema ?? 'unknown'}${r.missing ? ' (no project.json)' : ''}`)
  L.push(`  target schema:  ${r.targetSchema}`)

  const block = (label, arr, fmt) => {
    if (!arr.length) return
    L.push('')
    L.push(`  ${label}:`)
    for (const x of arr) L.push(`    - ${fmt(x)}`)
  }

  if (r.mode === 'plan') {
    block('Will apply (safe, deterministic)', r.applicable,
      (x) => `[${x.impact}] ${x.id}: ${x.reason}${x.files.length ? ` → creates ${x.files.join(', ')}` : ''}`)
    block('Already satisfied', r.satisfied, (x) => `${x.id}: ${x.reason}`)
    block('Manual (needs your judgement)', r.manual, (x) => `${x.id}: ${x.reason}`)
    block('Skipped', r.skipped, (x) => `${x.id}${x.change ? ` (${x.change})` : ''}: ${x.reason}`)
    L.push('')
    L.push(`  Files that would change: ${r.filesToChange.length ? r.filesToChange.join(', ') : 'none'}`)
    L.push(`  Local edits may be affected: ${r.localEditsAffected ? 'YES' : 'no'}`)
    L.push('')
    L.push(`  Next: ${r.nextCommand ?? 'nothing to apply — project is current or needs manual attention.'}`)
  } else {
    block('Applied', r.applied, (x) => `${x.id}: ${x.title}`)
    L.push('')
    L.push(`  Files created/updated: ${r.created.length ? r.created.join(', ') : 'none'}`)
    // After a legacy adopt, be explicit that this is NOT a full-conformance
    // certificate — schema tracks only .materia/project.json (mirror of doctor's
    // honesty caveat + the ledger 0.1.0 reconciliation notes).
    if (r.applied.some((x) => x.id === 'init-project-state')) {
      L.push('')
      L.push('  Note: this adopts artifact tracking only. Schema currency certifies just')
      L.push('  .materia/project.json, not full scaffold conformance — see the ledger 0.1.0')
      L.push('  baseline reconciliation notes for legacy items (check-docs.sh, MATERIA.md')
      L.push('  sections, .materia/review-angles/) an old install may still need by hand.')
    }
    block('Not changed', r.notChanged, (x) => `${x.id}: ${x.reason}`)
    if (r.projectState) {
      L.push('')
      L.push('  Project state now:')
      for (const line of JSON.stringify(r.projectState, null, 2).split('\n')) L.push(`    ${line}`)
    }
    L.push('')
    L.push(`  Status: ${r.status.toUpperCase()}`)
    L.push(`  Next: run ${r.nextCommand ?? '/materia:doctor'} to confirm health.`)
  }
  // Follow-ups render for plan + apply (the toolFault branch returned above).
  L.push(...followUpLines(r))
  return L.join('\n')
}

// ---- main -------------------------------------------------------------------
const main = () => {
  const { apply, json, help, target } = parseArgs(process.argv.slice(2))
  if (help) { console.log(HELP); process.exit(0) }
  const targetRoot = resolve(target ?? process.cwd())
  const releaseDir = resolve(import.meta.dirname, '../release')
  const report = apply ? runApply(targetRoot, releaseDir) : buildPlan(targetRoot, releaseDir)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderHuman(report))
  process.exit(report.toolFault ? 2 : 0)
}

main()
