#!/usr/bin/env node
// doctor.mjs — deterministic, non-destructive inspector for a Materia-installed
// project. Reads the release/artifact compatibility contract (this plugin's
// bundled release/ ledger) and the target project's .materia/project.json, then
// reports health/status. NO network, NO AI, NO writes — pure inspection.
//
// This script ships INSIDE the plugin (plugins/materia/scripts/) so an installed
// skill can run it from the read-only plugin cache as
// `node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" [targetPath] [--json]`. The
// ledger it reads is the script's sibling: ../release (== $CLAUDE_PLUGIN_ROOT/
// release when installed). The TARGET project is a separate root (positional
// arg, default cwd) — never the plugin cache.
//
// Check ID <-> ledger correspondence: `project-state-present` is the exact id the
// ledger reserves in `0.2.0-project-state-file`.doctorChecks — doctor implements
// it as that change's canonical detector. `artifact-schema-current` is a
// change-agnostic schema-currency check (it also fires on schema-1 repos); by
// design it is NOT listed in any ledger change's doctorChecks (that would be a
// ledger-data change). Doctor never reports a drift as MORE severe than the
// ledger's own `impact` says — per-drift severity derives from that impact.
//
// Usage: node doctor.mjs [targetPath] [--json] [--help]
// Exit:  0 healthy|warnings|unknown · 1 action-needed · 2 blocked
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

// ---- severity lattice + ledger-impact mapping -------------------------------
const SEV_ORDER = ['ok', 'info', 'warning', 'action', 'blocked']
const sevRank = (s) => SEV_ORDER.indexOf(s)
const worst = (a, b) => (sevRank(a) >= sevRank(b) ? a : b)
// A drift's severity comes from its ledger `impact`, so doctor never reports
// stronger than the contract it reads.
const IMPACT_SEV = {
  none: 'info', 'doctor-only': 'info', optional: 'info',
  recommended: 'warning', required: 'action', breaking: 'blocked',
}
// severity of the worst check -> overall status
const SEV_STATUS = { ok: 'healthy', info: 'healthy', warning: 'warnings', action: 'action-needed', blocked: 'blocked' }
const EXIT = { healthy: 0, warnings: 0, unknown: 0, 'action-needed': 1, blocked: 2 }

// ---- arg parsing ------------------------------------------------------------
const parseArgs = (argv) => {
  const out = { json: false, help: false, target: null }
  for (const a of argv) {
    if (a === '--json') out.json = true
    else if (a === '--help' || a === '-h') out.help = true
    else if (a.startsWith('-')) { /* ignore unknown flags in v0 */ }
    else if (out.target === null) out.target = a
  }
  return out
}

const HELP = `materia doctor — non-destructive health check for a Materia-installed project

Usage: node doctor.mjs [targetPath] [--json] [--help]

  targetPath   project root to inspect (default: current working directory)
  --json       emit the structured report as JSON
  --help, -h   show this help

Doctor reads this plugin's release ledger + the target's .materia/project.json
and reports one of: healthy · warnings · action-needed · blocked · unknown.
It writes nothing and never migrates.`

// ---- safe JSON read ---------------------------------------------------------
const readJson = (f) => {
  try {
    const v = JSON.parse(readFileSync(f, 'utf8'))
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { error: 'not a JSON object' }
    return { value: v }
  } catch (e) {
    return { error: e.message }
  }
}

const isInt = (n) => typeof n === 'number' && Number.isInteger(n)
const isDir = (p) => existsSync(p) && statSync(p).isDirectory()

// ---- ledger read (this plugin's bundled release/) ---------------------------
// Shape per plugins/materia/release/README.md: latest.json = { pluginVersion,
// artifactSchema, latestVersionFile }; each versions/<v>.json = { pluginVersion,
// artifactSchema, changes[] }. Change objects carry NO artifactSchema — the
// schema lives at the version-file top level.
const readLedger = (releaseDir) => {
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
const relevantChanges = (versions, fromSchema, latestSchema) => {
  const out = []
  for (const v of versions) {
    if (isInt(v.artifactSchema) && v.artifactSchema > fromSchema && v.artifactSchema <= latestSchema)
      for (const ch of Array.isArray(v.changes) ? v.changes : []) out.push(ch)
  }
  return out
}

// ---- core inspection --------------------------------------------------------
const inspect = (targetRoot, releaseDir) => {
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
    if (changes.length) report.suggestedNextCommand = '/materia:migrate --plan'
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
    if (changes.length) report.suggestedNextCommand = '/materia:migrate --plan'
  }

  report.status = statusFrom(overall)
  return report
}

// Fill required/recommended/optional buckets + manualActionItems from a change set.
function bucketize (report, changes) {
  for (const ch of changes) {
    const entry = { id: ch.id, summary: ch.summary, impact: ch.impact }
    if (ch.impact === 'required' || ch.impact === 'breaking') report.requiredChanges.push(entry)
    else if (ch.impact === 'recommended') report.recommendedChanges.push(entry)
    else if (ch.impact === 'optional') report.optionalChanges.push(entry)
    // doctor-only / none are report-only — not adoption buckets.
    if (ch.manualMigration) report.manualActionItems.push(`${ch.id}: ${ch.manualMigration}`)
  }
}

const statusFrom = (severity) => SEV_STATUS[severity] ?? 'unknown'

// ---- human-readable rendering ----------------------------------------------
const ICON = { healthy: '✓', warnings: '⚠', 'action-needed': '●', blocked: '✗', unknown: '?' }
const SEV_ICON = { ok: '✓', info: 'ℹ', warning: '⚠', action: '●', blocked: '✗' }
const renderHuman = (r, targetRoot) => {
  const L = []
  L.push(`materia doctor — ${targetRoot}`)
  L.push('')
  L.push(`  ${ICON[r.status] ?? '?'} status: ${r.status.toUpperCase()}`)
  L.push(`  Materia-enabled: ${r.materiaEnabled ? 'yes' : 'no'}`)
  if (!r.materiaEnabled) {
    L.push('')
    L.push('  This repo does not appear to be Materia-enabled (no MATERIA.md, no .materia/).')
    L.push('  Doctor invents no project state.')
    return L.join('\n')
  }
  L.push(`  project schema: ${r.currentSchema ?? 'unknown'}${r.missing ? ' (no project.json)' : ''}`)
  L.push(`  latest schema:  ${r.latestSchema}`)
  if (r.projectStateLocation) L.push(`  project state:  ${r.projectStateLocation}`)
  if (r.missing) L.push('  project state:  MISSING (likely predates artifact tracking)')
  if (r.malformed) L.push('  project state:  MALFORMED')
  L.push('')
  L.push('  Checks:')
  for (const c of r.checks) L.push(`    ${SEV_ICON[c.severity] ?? '?'} ${c.id} — ${c.detail}`)
  const bucket = (label, arr) => {
    if (!arr.length) return
    L.push('')
    L.push(`  ${label}:`)
    for (const c of arr) L.push(`    - [${c.impact}] ${c.id}: ${c.summary}`)
  }
  bucket('Required changes', r.requiredChanges)
  bucket('Recommended changes', r.recommendedChanges)
  bucket('Optional changes', r.optionalChanges)
  if (r.manualActionItems.length) {
    L.push('')
    L.push('  Manual action items:')
    for (const m of r.manualActionItems) L.push(`    - ${m}`)
  }
  L.push('')
  L.push(`  Suggested next: ${r.suggestedNextCommand ?? 'none — project is current.'}`)
  return L.join('\n')
}

// ---- main -------------------------------------------------------------------
const main = () => {
  const { json, help, target } = parseArgs(process.argv.slice(2))
  if (help) { console.log(HELP); process.exit(0) }
  const targetRoot = resolve(target ?? process.cwd())
  const releaseDir = resolve(import.meta.dirname, '../release')
  const report = inspect(targetRoot, releaseDir)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(renderHuman(report, targetRoot))
  process.exit(EXIT[report.status] ?? 0)
}

main()
