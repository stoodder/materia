// materia-contract.mjs — shared, deterministic core for the Materia
// release/artifact compatibility contract. NO network, NO AI, NO writes.
//
// This module is the single source of truth for two things both /materia:doctor
// and /materia:migrate need, so their views of a project stay consistent by
// construction:
//   1. reading this plugin's bundled release ledger (../release), and
//   2. inspecting a TARGET project's .materia/project.json against it.
//
// doctor.mjs imports `inspect` (+ helpers) and renders a read-only report;
// migrate.mjs imports the same `inspect` (+ helpers) to derive current state,
// then layers migration planning/apply on top. Neither the ledger read nor the
// state detection is duplicated — a drift between doctor and migrate would be a
// contract break, so there is exactly one implementation here.
//
// `inspect()` takes the target root AND the release dir as arguments (it resolves
// no paths itself) so each caller controls both: the target is the user repo, the
// release dir is the caller script's own sibling ../release in the plugin cache.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

// ---- severity lattice + ledger-impact mapping -------------------------------
export const SEV_ORDER = ['ok', 'info', 'warning', 'action', 'blocked']
export const sevRank = (s) => SEV_ORDER.indexOf(s)
export const worst = (a, b) => (sevRank(a) >= sevRank(b) ? a : b)
// A drift's severity comes from its ledger `impact`, so consumers never report
// stronger than the contract they read.
export const IMPACT_SEV = {
  none: 'info', 'doctor-only': 'info', optional: 'info',
  recommended: 'warning', required: 'action', breaking: 'blocked',
}
// severity of the worst check -> overall status
export const SEV_STATUS = { ok: 'healthy', info: 'healthy', warning: 'warnings', action: 'action-needed', blocked: 'blocked' }
export const statusFrom = (severity) => SEV_STATUS[severity] ?? 'unknown'

// ---- authoritative id registries --------------------------------------------
// The exact check ids inspect() emits, in emission order — the authoritative set
// /materia:doctor reports. A release-ledger change's `doctorChecks` MUST be a subset
// of this. Its honesty (no missing AND no bogus-extra id) is pinned in
// scripts/validate-plugin.mjs §7 by set-equality against the ids the tracked-current
// fixture actually emits (that path exercises all KNOWN_CHECK_IDS checks), so a hand-edit
// here that drifts from what inspect() emits fails CI.
export const KNOWN_CHECK_IDS = [
  'release-ledger-readable',
  'materia-enabled',
  'check-docs-sh-present',
  'check-docs-sh-location',
  'project-state-present',
  'project-state-parses',
  'artifact-schema-known',
  'artifact-schema-current',
]
// Shared migration-id source of truth. migrate.mjs builds its REGISTRY handler ids from
// MIG, so the implemented migration set can never drift from KNOWN_MIGRATION_IDS; and the
// validator resolves a ledger change's `migrations` against this list by importing it from
// HERE (a pure module) rather than from migrate.mjs (whose top-level runs a CLI main()).
export const MIG = { INIT_PROJECT_STATE: 'init-project-state', INSTALL_CHECK_DOCS: 'install-check-docs' }
export const KNOWN_MIGRATION_IDS = Object.values(MIG)

// ---- safe JSON read ---------------------------------------------------------
export const readJson = (f) => {
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'))
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { error: 'not a JSON object' }
    return { value: v }
  } catch (e) {
    return { error: e.message }
  }
}

export const isInt = (n) => typeof n === 'number' && Number.isInteger(n)
export const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

// ---- ledger read (this plugin's bundled release/) ---------------------------
// Shape per plugins/materia/release/README.md: latest.json = { pluginVersion,
// artifactSchema, latestVersionFile }; each versions/<v>.json = { pluginVersion,
// artifactSchema, changes[] }. Change objects carry NO artifactSchema — the
// schema lives at the version-file top level.
export const readLedger = (releaseDir) => {
  const latest = readJson(join(releaseDir, 'latest.json'))
  if (latest.error) return { error: `latest.json: ${latest.error}` }
  if (!isInt(latest.value.artifactSchema)) return { error: 'latest.json artifactSchema is not an integer' }
  const versionsDir = join(releaseDir, 'versions')
  if (!isDir(versionsDir)) return { error: 'versions/ directory missing' }
  const versions = []
  for (const f of readdirSync(versionsDir).filter((f) => f.endsWith('.json')).sort()) {
    const v = readJson(join(versionsDir, f))
    if (v.error) return { error: `versions/${f}: ${v.error}` }
    versions.push(v.value)
  }
  return { latestSchema: latest.value.artifactSchema, versions }
}

// Changes whose version-file schema is in (fromSchema, latestSchema], flattened.
export const relevantChanges = (versions, fromSchema, latestSchema) => {
  const out = []
  for (const v of versions) {
    if (isInt(v.artifactSchema) && v.artifactSchema > fromSchema && v.artifactSchema <= latestSchema)
      for (const ch of Array.isArray(v.changes) ? v.changes : []) out.push(ch)
  }
  return out
}

// Fill required/recommended/optional buckets + manualActionItems from a change set.
export function bucketize (report, changes) {
  for (const ch of changes) {
    const entry = { id: ch.id, summary: ch.summary, impact: ch.impact }
    if (ch.impact === 'required' || ch.impact === 'breaking') report.requiredChanges.push(entry)
    else if (ch.impact === 'recommended') report.recommendedChanges.push(entry)
    else if (ch.impact === 'optional') report.optionalChanges.push(entry)
    // doctor-only / none are report-only — not adoption buckets.
    if (ch.manualMigration) report.manualActionItems.push(`${ch.id}: ${ch.manualMigration}`)
  }
}

// Adopted-drift filter. A ledger change is "adopted" — already satisfied by the
// repo despite an untracked/schema-behind project-state — when it is `detectable`,
// names a NON-EMPTY set of `doctorChecks`, and EVERY one of those checks was already
// emitted `ok` in the checks array BY THE TIME this runs. Adopted changes are excluded
// from the adoption buckets AND the severity reduce, so a repo that already carries a
// change's artifact isn't nagged to re-adopt it.
//   - Non-empty guard: a change with `doctorChecks: []` (or none) is never vacuously
//     adopted — it stays in the buckets and drives severity as declared.
//   - Reads the EMITTED checks (not KNOWN_CHECK_IDS): a change's own detector emitted
//     LATER in the same run can't adopt it — e.g. `project-state-present` is added
//     after the untracked bucketing site, so `0.2.0-project-state-file` is unfilterable
//     there and the recommended untracked-legacy adoption always surfaces.
// The doctor↔migrate bridge (see inspect's schema-behind branch) still points at migrate
// to record the stamp when a change is adopted-but-unstamped AND the state is one migrate
// will actually stamp (schema >= 2) — so doctor never says "nothing to do" while migrate
// has an applicable stamp, and never promises a stamp migrate would refuse (a
// hand-authored schema-1 state is manual on both sides).
const isAdopted = (ch, emittedChecks) => {
  if (ch.detectable !== true) return false
  const dc = Array.isArray(ch.doctorChecks) ? ch.doctorChecks : []
  if (dc.length === 0) return false
  return dc.every((id) => emittedChecks.some((c) => c.id === id && c.severity === 'ok'))
}

// ---- core inspection --------------------------------------------------------
// Deterministic state detector. Returns the canonical report both doctor and
// migrate build on. `releaseDir` is passed in (never resolved here) so a caller
// points it at its own ../release sibling in the plugin cache; `targetRoot` is
// the separate user-repo root. Reads only; writes nothing.
//
// Check ID <-> ledger correspondence: three checks are the canonical detectors the
// ledger reserves in a change's `doctorChecks` — `project-state-present` for
// `0.2.0-project-state-file`, `check-docs-sh-present` for `0.3.0-check-docs-sh-gate`,
// and `check-docs-sh-location` for `0.3.0-scripts-relocation`. The adopted-drift filter
// (isAdopted) keys on each firing `ok` to spare a repo that already carries the change.
// `artifact-schema-current` REMAINS change-agnostic (it fires on schema-1 repos too and
// is listed in NO ledger change's doctorChecks — that would be a ledger-data change; the
// schema-behind branch reuses it to carry the doctor↔migrate adopted-but-unstamped bridge
// note). `check-docs-sh-present` guards the binding check:docs gate at EITHER the legacy
// `scripts/check-docs.sh` (a not-yet-relocated install) or the canonical
// `.materia/scripts/check-docs.sh`; `check-docs-sh-location` reports whether it sits at
// that canonical location. Schema currency certifies ONLY .materia/project.json, never
// full scaffold conformance, so these separate checks catch a real dogfood gap schema
// currency would otherwise hide. A drift is never reported as MORE severe than the
// ledger's own `impact` says — per-drift severity derives from that impact (IMPACT_SEV).
export const inspect = (targetRoot, releaseDir) => {
  const checks = []
  const add = (id, title, severity, detail) => { checks.push({ id, title, severity, detail }) }

  const report = {
    status: 'unknown',
    materiaEnabled: false,
    currentSchema: null,
    latestSchema: null,
    projectStateLocation: null,
    missing: false,
    malformed: false,
    requiredChanges: [],
    recommendedChanges: [],
    optionalChanges: [],
    manualActionItems: [],
    suggestedNextCommand: null,
    checks,
  }

  // 1. release-ledger-readable — the plugin's OWN data. A failure here is a
  //    tool/plugin fault, not the project's fault (the detail says so).
  const ledger = readLedger(releaseDir)
  if (ledger.error) {
    add('release-ledger-readable', 'Release ledger readable', 'blocked',
      `TOOL FAULT (not the project): could not read this plugin's release ledger — ${ledger.error}`)
    report.status = SEV_STATUS.blocked
    return report
  }
  add('release-ledger-readable', 'Release ledger readable', 'ok',
    `latest artifact schema = ${ledger.latestSchema}`)
  report.latestSchema = ledger.latestSchema

  // 2. materia-enabled — MATERIA.md or a .materia/ dir marks a Materia repo.
  const hasMateriaMd = existsSync(join(targetRoot, 'MATERIA.md'))
  const hasMateriaDir = isDir(join(targetRoot, '.materia'))
  report.materiaEnabled = hasMateriaMd || hasMateriaDir
  if (!report.materiaEnabled) {
    add('materia-enabled', 'Repo appears Materia-enabled', 'info',
      'No MATERIA.md and no .materia/ directory — this repo does not appear to be Materia-enabled. Doctor invents no project state.')
    report.status = 'unknown'
    return report
  }
  add('materia-enabled', 'Repo appears Materia-enabled', 'ok',
    `detected ${[hasMateriaMd && 'MATERIA.md', hasMateriaDir && '.materia/'].filter(Boolean).join(' + ')}`)

  let overall = 'ok'

  // 3. check-docs-sh-present + check-docs-sh-location — change-agnostic gate-script
  //    detectors, both emitted on the shared path (before any later branch return) so
  //    (a) every Materia-enabled repo is checked, and (b) BOTH are in the checks array
  //    before the adopted-drift filter runs at either bucketing site below (the filter
  //    reads the emitted checks). Schema currency certifies ONLY .materia/project.json;
  //    these catch an old dogfood repo that predates the gate script (it replaced
  //    scripts/check-docs.mjs) or has not yet relocated it to the canonical
  //    .materia/scripts/ — gaps the project-state schema check cannot see.
  const atCanonSh = existsSync(join(targetRoot, '.materia', 'scripts', 'check-docs.sh'))
  const atRootSh = existsSync(join(targetRoot, 'scripts', 'check-docs.sh'))
  if (atCanonSh || atRootSh) {
    add('check-docs-sh-present', 'check:docs gate script present', 'ok',
      'the binding check:docs gate script is present (canonical location .materia/scripts/check-docs.sh; the plugin ships it at scaffold/.materia/scripts/check-docs.sh).')
  } else {
    overall = worst(overall, 'warning')
    add('check-docs-sh-present', 'check:docs gate script present', 'warning',
      'the binding check:docs gate script is missing from both .materia/scripts/check-docs.sh and scripts/check-docs.sh — this repo predates the gate script (it replaced scripts/check-docs.mjs) or has moved it; the binding check:docs gate will fail. Copy it from the installed plugin scaffold (scaffold/.materia/scripts/check-docs.sh).')
  }
  // Location detector for the 0.3.0 relocation change. The warning detail only points
  // at /materia:migrate when install-check-docs would actually be APPLICABLE there:
  // a MISSING state file (untracked-legacy — migrate relocates, disposition 4) or a
  // recorded schema of exactly 2 (the one behind-schema migrate will stamp). Everything
  // else — at/above the latest schema (migrate discovers nothing), or a present
  // schema<2 / unknown / unparseable state (migrate's classify says manual, the
  // never-overwrite guarantee) — gets move-by-hand wording, so doctor never points at
  // a command migrate would refuse. Peek the recorded state for that wording only —
  // the authoritative parse/known/current checks run in the branches below. (This is a
  // read-only peek; the canonical parse still happens once, gated, at step 5.)
  let recordedSchema = null
  let statePeekPresent = false
  {
    const sp = join(targetRoot, '.materia', 'project.json')
    if (existsSync(sp)) {
      statePeekPresent = true
      const p = readJson(sp)
      if (!p.error && isInt(p.value.artifactSchema)) recordedSchema = p.value.artifactSchema
    }
  }
  if (atCanonSh) {
    add('check-docs-sh-location', 'check:docs gate script at canonical location', 'ok',
      'the gate script is at the canonical .materia/scripts/check-docs.sh.')
  } else if (atRootSh) {
    overall = worst(overall, 'warning')
    // 2 mirrors migrate's INIT_STATE_SCHEMA stamp floor (install-check-docs stamps
    // only a schema-2 state; see migrate.mjs).
    const migrateApplicable = !statePeekPresent || recordedSchema === 2
    const fix = migrateApplicable
      ? 'run /materia:migrate --plan to relocate it to .materia/scripts/check-docs.sh.'
      : 'move it by hand to .materia/scripts/check-docs.sh (this repo\'s recorded state is not one migrate will modify — see /materia:migrate --plan\'s manual items).'
    add('check-docs-sh-location', 'check:docs gate script at canonical location', 'warning',
      `the gate script is at the legacy scripts/check-docs.sh, not the canonical .materia/scripts/check-docs.sh — ${fix}`)
  } else {
    add('check-docs-sh-location', 'check:docs gate script at canonical location', 'info',
      'absent — see check-docs-sh-present.')
  }

  // 4. project-state-present — .materia/project.json.
  const statePath = join(targetRoot, '.materia', 'project.json')
  const statePresent = existsSync(statePath)

  if (!statePresent) {
    // Untracked legacy: pre-tracking installs are schema 1 by definition. The
    // drift to adopt = changes in (1, latest]; its severity = worst ledger impact.
    report.missing = true
    report.currentSchema = 'untracked-legacy'
    // Filter out changes this untracked repo has ALREADY adopted (their doctorChecks
    // fired `ok` above) — e.g. a legacy repo that already carries the gate script needn't
    // re-adopt 0.3.0-check-docs-sh-gate. project-state-present is emitted BELOW, so the
    // recommended untracked-legacy adoption (0.2.0-project-state-file) is never filtered.
    const changes = relevantChanges(ledger.versions, 1, ledger.latestSchema)
      .filter((ch) => !isAdopted(ch, checks))
    bucketize(report, changes)
    const sev = changes.reduce((s, ch) => worst(s, IMPACT_SEV[ch.impact] ?? 'info'), 'info')
    overall = worst(overall, sev)
    add('project-state-present', 'Project state file present', sev,
      changes.length
        ? 'Materia appears installed, but no .materia/project.json was found. This likely predates artifact tracking (untracked legacy). Adopting tracking certifies only .materia/project.json, not full scaffold conformance — see the ledger 0.1.0 baseline reconciliation notes for legacy items (check-docs.sh, MATERIA.md sections, review-angles/) an old install may still need by hand.'
        : 'No .materia/project.json, but the ledger declares no adoptable changes — nothing to migrate.')
    // Suggest migrate for warning-or-worse adoptable drift. The untracked branch always
    // carries the recommended untracked-legacy adoption (never filtered — see above), so
    // this is effectively always set here; the info-severity adopted-but-unstamped bridge
    // that keeps a stamp discoverable lives in the schema-behind branch below.
    if (sevRank(sev) >= sevRank('warning')) report.suggestedNextCommand = '/materia:migrate --plan'
    report.status = statusFrom(overall)
    return report
  }
  report.projectStateLocation = relative(targetRoot, statePath)
  add('project-state-present', 'Project state file present', 'ok', report.projectStateLocation)

  // 5. project-state-parses — gated on present. Absent != malformed (handled above).
  const parsed = readJson(statePath)
  if (parsed.error) {
    report.malformed = true
    overall = worst(overall, 'blocked')
    add('project-state-parses', 'Project state parses', 'blocked',
      `${report.projectStateLocation} is malformed — ${parsed.error}`)
    report.manualActionItems.push(`Fix ${report.projectStateLocation} (invalid JSON): ${parsed.error}`)
    report.status = statusFrom(overall)
    return report
  }
  add('project-state-parses', 'Project state parses', 'ok', 'valid JSON object')
  const schema = parsed.value.artifactSchema
  report.currentSchema = isInt(schema) ? schema : null

  // 6. artifact-schema-known — gated on present ∧ parses.
  if (!isInt(schema) || schema < 1) {
    overall = worst(overall, 'blocked')
    add('artifact-schema-known', 'Artifact schema is known', 'blocked',
      `artifactSchema ${JSON.stringify(schema)} is not a known integer schema (expected 1..${ledger.latestSchema})`)
    report.manualActionItems.push(`Set a valid integer artifactSchema in ${report.projectStateLocation}.`)
    add('artifact-schema-current', 'Artifact schema is current', 'ok', 'skipped — schema unknown')
    report.status = statusFrom(overall)
    return report
  }
  if (schema > ledger.latestSchema) {
    overall = worst(overall, 'blocked')
    add('artifact-schema-known', 'Artifact schema is known', 'blocked',
      `artifactSchema ${schema} is newer than this plugin's latest (${ledger.latestSchema}) — the project is from the future.`)
    report.manualActionItems.push(`Update the materia plugin: this project is on artifact schema ${schema}, newer than the installed plugin's latest (${ledger.latestSchema}).`)
    add('artifact-schema-current', 'Artifact schema is current', 'ok', 'skipped — schema newer than plugin')
    report.status = statusFrom(overall)
    return report
  }
  add('artifact-schema-known', 'Artifact schema is known', 'ok', `schema ${schema} (latest ${ledger.latestSchema})`)

  // 7. artifact-schema-current — gated on present ∧ parses ∧ known.
  if (schema === ledger.latestSchema) {
    add('artifact-schema-current', 'Artifact schema is current', 'ok',
      `schema ${schema} == latest — certifies only .materia/project.json, not full scaffold conformance.`)
  } else {
    // Filter out already-adopted changes (their doctorChecks fired `ok` above), then
    // bucket + score only what's genuinely unadopted. `adoptedCount` drives the
    // doctor↔migrate bridge below.
    const all = relevantChanges(ledger.versions, schema, ledger.latestSchema)
    const changes = all.filter((ch) => !isAdopted(ch, checks))
    const adoptedCount = all.length - changes.length
    // The bridge only fires when migrate can actually record the adoption: the stamp
    // (install-check-docs) touches only a schema >= 2 state — a hand-authored schema-1
    // file is one migrate refuses to modify (its classify says manual, mirroring
    // init-project-state), so pointing "run migrate to record adoption" at it would be
    // an unfulfillable promise. Below 2, the filtered changes still stay out of the
    // buckets (they ARE adopted); only the record-it suggestion is withheld.
    const bridgeStampable = schema >= 2
    bucketize(report, changes)
    const sev = changes.reduce((s, ch) => worst(s, IMPACT_SEV[ch.impact] ?? 'info'), 'info')
    overall = worst(overall, sev)
    add('artifact-schema-current', 'Artifact schema is current', sev,
      `schema ${schema} is behind latest ${ledger.latestSchema} — ${changes.length} change(s) to adopt.` +
      (adoptedCount && bridgeStampable ? ` (${adoptedCount} change(s) already adopted but unstamped — run /materia:migrate --plan to record adoption.)`
        : adoptedCount ? ` (${adoptedCount} change(s) already adopted; the schema-${schema} state file needs by-hand review before migrate will stamp it — see /materia:migrate --plan's manual items.)` : ''))
    // Suggest migrate for warning-or-worse adoptable drift OR when a change was filtered
    // as adopted-but-unstamped AND migrate can stamp it — the doctor↔migrate bridge.
    // In that case migrate has an applicable stamp to record (schema 2, behind), so
    // doctor must not say "nothing to do"; the remaining severity is only info, so the
    // STATUS stays healthy (exit 0) while suggestedNextCommand points at the stamp.
    if (sevRank(sev) >= sevRank('warning') || (adoptedCount > 0 && bridgeStampable)) report.suggestedNextCommand = '/materia:migrate --plan'
  }

  report.status = statusFrom(overall)
  return report
}
