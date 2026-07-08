#!/usr/bin/env node
// doctor.mjs — deterministic, non-destructive inspector for a Materia-installed
// project. Reads the release/artifact compatibility contract (this plugin's
// bundled release/ ledger) and the target project's .materia/project.json, then
// reports health/status. NO network, NO AI, NO writes — pure inspection.
//
// The ledger read + state detection live in the shared ./lib/materia-contract.mjs
// module (imported below) so /materia:doctor and /materia:migrate see a project
// identically — doctor renders the report read-only; migrate builds migration
// planning on the same `inspect()`. This file is doctor's CLI + rendering layer.
//
// This script ships INSIDE the plugin (plugins/materia/scripts/) so an installed
// skill can run it from the read-only plugin cache as
// `node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" [targetPath] [--json]`. The
// ledger it reads is the script's sibling: ../release (== $CLAUDE_PLUGIN_ROOT/
// release when installed). The TARGET project is a separate root (positional
// arg, default cwd) — never the plugin cache. (The check-id ↔ ledger
// correspondence and per-drift severity rules are documented next to inspect()
// in ./lib/materia-contract.mjs, where that logic now lives.)
//
// Usage: node doctor.mjs [targetPath] [--json] [--help]
// Exit:  0 healthy|warnings|unknown · 1 action-needed · 2 blocked
import { resolve } from 'node:path'
import { inspect } from './lib/materia-contract.mjs'

// status -> exit code (doctor's own CLI concern; not part of the shared report).
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
  L.push(`  Suggested next: ${r.suggestedNextCommand ?? 'none — .materia/project.json is at the latest schema. Schema currency certifies only that file, not full scaffold conformance; see the ledger 0.1.0 baseline notes for legacy items an old install may still need.'}`)
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
