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
// fixture actually emits (that path exercises all six), so a hand-edit here that drifts
// from what inspect() emits fails CI.
export const KNOWN_CHECK_IDS = [
  'release-ledger-readable',
  'materia-enabled',
  'project-state-present',
  'project-state-parses',
  'artifact-schema-known',
  'artifact-schema-current',
]
// Shared migration-id source of truth. migrate.mjs builds its REGISTRY handler ids from
// MIG, so the implemented migration set can never drift from KNOWN_MIGRATION_IDS; and the
// validator resolves a ledger change's `migrations` against this list by importing it from
// HERE (a pure module) rather than from migrate.mjs (whose top-level runs a CLI main()).
export const MIG = { INIT_PROJECT_STATE: 'init-project-state' }
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

// ---- core inspection --------------------------------------------------------
// Deterministic state detector. Returns the canonical report both doctor and
// migrate build on. `releaseDir` is passed in (never resolved here) so a caller
// points it at its own ../release sibling in the plugin cache; `targetRoot` is
// the separate user-repo root. Reads only; writes nothing.
//
// Check ID <-> ledger correspondence: `project-state-present` is the exact id the
// ledger reserves in `0.2.0-project-state-file`.doctorChecks — inspect implements
// it as that change's canonical detector. `artifact-schema-current` is a
// change-agnostic schema-currency check (it also fires on schema-1 repos); by
// design it is NOT listed in any ledger change's doctorChecks (that would be a
// ledger-data change). A drift is never reported as MORE severe than the ledger's
// own `impact` says — per-drift severity derives from that impact (IMPACT_SEV).
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

  // 3. project-state-present — .materia/project.json.
  const statePath = join(targetRoot, '.materia', 'project.json')
  const statePresent = existsSync(statePath)
  let overall = 'ok'

  if (!statePresent) {
    // Untracked legacy: pre-tracking installs are schema 1 by definition. The
    // drift to adopt = changes in (1, latest]; its severity = worst ledger impact.
    report.missing = true
    report.currentSchema = 'untracked-legacy'
    const changes = relevantChanges(ledger.versions, 1, ledger.latestSchema)
    bucketize(report, changes)
    const sev = changes.reduce((s, ch) => worst(s, IMPACT_SEV[ch.impact] ?? 'info'), 'info')
    overall = worst(overall, sev)
    add('project-state-present', 'Project state file present', sev,
      changes.length
        ? 'Materia appears installed, but no .materia/project.json was found. This likely predates artifact tracking (untracked legacy).'
        : 'No .materia/project.json, but the ledger declares no adoptable changes — nothing to migrate.')
    // Suggest migrate only for warning-or-worse adoptable drift; optional-only
    // (info) drift keeps the report `healthy` with an optional-changes list and
    // no suggestion, matching the skill's "healthy → nothing required" contract.
    if (sevRank(sev) >= sevRank('warning')) report.suggestedNextCommand = '/materia:migrate --plan'
    report.status = statusFrom(overall)
    return report
  }
  report.projectStateLocation = relative(targetRoot, statePath)
  add('project-state-present', 'Project state file present', 'ok', report.projectStateLocation)

  // 4. project-state-parses — gated on present. Absent != malformed (handled above).
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

  // 5. artifact-schema-known — gated on present ∧ parses.
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

  // 6. artifact-schema-current — gated on present ∧ parses ∧ known.
  if (schema === ledger.latestSchema) {
    add('artifact-schema-current', 'Artifact schema is current', 'ok', `schema ${schema} == latest`)
  } else {
    const changes = relevantChanges(ledger.versions, schema, ledger.latestSchema)
    bucketize(report, changes)
    const sev = changes.reduce((s, ch) => worst(s, IMPACT_SEV[ch.impact] ?? 'info'), 'info')
    overall = worst(overall, sev)
    add('artifact-schema-current', 'Artifact schema is current', sev,
      `schema ${schema} is behind latest ${ledger.latestSchema} — ${changes.length} change(s) to adopt.`)
    // Suggest migrate only for warning-or-worse adoptable drift; optional-only
    // (info) drift keeps the report `healthy` with an optional-changes list and
    // no suggestion, matching the skill's "healthy → nothing required" contract.
    if (sevRank(sev) >= sevRank('warning')) report.suggestedNextCommand = '/materia:migrate --plan'
  }

  report.status = statusFrom(overall)
  return report
}
