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
// Alongside the health verdict it renders inspect's windowless adoption listing
// (availableAdoptions / acknowledgedCount) — same-release changes available to
// adopt that cannot be auto-verified (they bump no schema, so the schema window
// never reaches them), minus what the repo already carries or has acknowledged.
// Informational only: it never affects report.status or the exit code.
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
// Design-gate reporting layer (scanDesignGates, below) — an ADDITIONAL,
// read-only report that scans the target's per-run docs/specs/<run>/design.md
// approval blocks and surfaces runs paused at the design review gate. It is
// explicitly OUTSIDE the release/artifact compatibility contract: it adds NO
// inspect() check id (inspect() is migrate-shared and its check-id set is pinned
// by validate-plugin.mjs §7 — a docs/specs scan there is forbidden), never
// influences report.status or the exit code, writes nothing, recomputes no
// hashes, and does no network. Per-run outputs are freely edited and legitimately
// absent or legacy-shaped, so anything unparseable is silently skipped.
//
// Usage: node doctor.mjs [targetPath] [--json] [--help]
// Exit:  0 healthy|warnings|unknown · 1 action-needed · 2 blocked
import { resolve, join } from 'node:path'
import { readdirSync, lstatSync, openSync, readSync, closeSync } from 'node:fs'
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
It also lists same-release changes available to adopt but not auto-verifiable
(schema-invisible prose / per-run-artifact contracts), minus what the repo has
already adopted or acknowledged — an informational listing outside the status/
exit path. It also reports any run paused at the design review gate (docs/specs/
<run>/design.md with a pending/abandoned approval block) — a read-only note
outside the compatibility contract that never affects the status or exit code.
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
  // Windowless adoption listing (from inspect's surfaceWindowless — informational,
  // out of the status/exit path). Same-release changes that cannot be auto-verified
  // (schema-invisible prose / per-run-artifact contracts), minus what the repo has
  // already adopted or acknowledged. Rendered ONLY when non-empty — when there is
  // nothing to list we print nothing new, not even the hidden-count line (an
  // all-acknowledged repo is indistinguishable from a fresh scaffold here).
  if (r.availableAdoptions.length) {
    L.push('')
    L.push('  Available to adopt (same release — adoption cannot be auto-verified):')
    for (const a of r.availableAdoptions) {
      L.push(`    - [${a.impact}] ${a.id}: ${a.summary}`)
      if (a.manualMigration) L.push(`        adopt: ${a.manualMigration}`)
    }
    if (r.acknowledgedCount > 0) L.push(`    (${r.acknowledgedCount} acknowledged change(s) hidden)`)
    L.push('    Acknowledge once adopted/considered: /materia:migrate --acknowledge <id>')
  }
  L.push('')
  // The "none" default must stay honest about what schema currency certifies (the
  // §7 human pin keys on the "Schema currency certifies only that file" substring);
  // when the windowless listing above is non-empty, point at it so "none" doesn't
  // read as "nothing exists to consider".
  const suggestedNone = 'none — .materia/project.json is at the latest schema. Schema currency certifies only that file, not full scaffold conformance; see the ledger 0.1.0 baseline notes for legacy items an old install may still need.' +
    (r.availableAdoptions.length ? ' Same-release items that cannot be auto-verified are listed under "Available to adopt" above.' : '')
  L.push(`  Suggested next: ${r.suggestedNextCommand ?? suggestedNone}`)
  return L.join('\n')
}

// ---- design-gate reporting layer (read-only; OUTSIDE the compat contract) ---
// Scans the target's per-run design.md approval blocks and returns entries for
// runs sitting in a `pending` or `abandoned` gate state ONLY — approved /
// auto-approved runs are healthy noise. This never touches inspect(), never
// affects report.status/exit, writes nothing, recomputes no hash. Frontmatter is
// hand-parsed (the repo has zero deps — no YAML lib): read a bounded head of the
// file, require a leading `---` block, find the `approval:` mapping, and read its
// indented scalar keys. Symlinks are never followed and the scan never leaves
// targetRoot. Anything malformed/missing is silently skipped — per-run outputs
// are freely edited and their absence or legacy shape is legitimate.
const FRONT_BYTES = 4096

// Bounded read of a file's leading bytes (frontmatter lives at the very top).
const readHead = (path, maxBytes) => {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(maxBytes)
    const n = readSync(fd, buf, 0, maxBytes, 0)
    return buf.toString('utf8', 0, n)
  } finally { closeSync(fd) }
}

// Hand-rolled, defensive parse of the leading YAML frontmatter's `approval:`
// mapping. Returns { status, rounds?, by?, at? } or null when there is no clean
// leading frontmatter / no approval block / no status.
const parseApprovalBlock = (text) => {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trimEnd() !== '---') return null // must open with frontmatter
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') { end = i; break }
  }
  if (end === -1) return null // frontmatter not closed within the bounded read
  let ai = -1
  for (let i = 1; i < end; i++) {
    if (lines[i].trimEnd() === 'approval:') { ai = i; break }
  }
  if (ai === -1) return null
  const KEYS = new Set(['status', 'rounds', 'by', 'at'])
  const out = {}
  for (let i = ai + 1; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (!/^\s/.test(line)) break // dedent to a new top-level key — approval mapping ended
    const m = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(line)
    if (!m || !KEYS.has(m[1])) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    else val = val.replace(/\s+#.*$/, '') // strip a trailing YAML comment (hand-edited blocks); none of these keys legitimately contains '#'
    out[m[1]] = val
  }
  if (!out.status) return null
  if (out.rounds !== undefined) {
    const n = Number(out.rounds)
    if (Number.isInteger(n)) out.rounds = n
  }
  return out
}

// Scan docs/specs/<run>/design.md (top-level run folders only; skip _-prefixed
// dirs like _templates/_proposed). Returns [] when docs/specs is absent.
const scanDesignGates = (targetRoot) => {
  const specsDir = join(targetRoot, 'docs', 'specs')
  let dirents
  try { dirents = readdirSync(specsDir, { withFileTypes: true }) }
  catch { return [] } // no docs/specs — silence
  const out = []
  for (const de of dirents) {
    if (de.name.startsWith('_')) continue // _templates, _proposed
    if (de.isSymbolicLink() || !de.isDirectory()) continue // never follow symlinks / non-dirs
    const designPath = join(specsDir, de.name, 'design.md')
    let approval
    try {
      const st = lstatSync(designPath)
      if (st.isSymbolicLink() || !st.isFile()) continue // never follow a symlinked design.md
      approval = parseApprovalBlock(readHead(designPath, FRONT_BYTES))
    } catch { continue }
    if (!approval) continue
    if (approval.status !== 'pending' && approval.status !== 'abandoned') continue // approved/auto = healthy noise
    out.push({
      folder: de.name,
      status: approval.status,
      rounds: approval.rounds ?? null,
      by: approval.by ?? null,
      at: approval.at ?? null,
    })
  }
  out.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0))
  return out
}

// Human render for the design-gate layer — appended AFTER the inspect() report,
// and only when there is something to show. Pending is info (a legitimate
// in-progress state); abandoned is quieter (parked).
const renderDesignGate = (entries) => {
  const L = []
  const pending = entries.filter((e) => e.status === 'pending')
  const abandoned = entries.filter((e) => e.status === 'abandoned')
  if (!pending.length && !abandoned.length) return L
  L.push('')
  L.push('  Design gates:')
  for (const e of pending) {
    L.push(`    ${SEV_ICON.info} ${e.folder} — design awaiting approval (rounds: ${e.rounds ?? '?'}) — a legitimate in-progress state, not an error`)
  }
  for (const e of abandoned) {
    L.push(`    - ${e.folder} — design abandoned (parked)`)
  }
  return L
}

// ---- main -------------------------------------------------------------------
const main = () => {
  const { json, help, target } = parseArgs(process.argv.slice(2))
  if (help) { console.log(HELP); process.exit(0) }
  const targetRoot = resolve(target ?? process.cwd())
  const releaseDir = resolve(import.meta.dirname, '../release')
  const report = inspect(targetRoot, releaseDir)
  // Read-only design-gate scan — non-materia repos get no scan. Attached as a
  // separate key at print time; `report` itself stays pristine for the exit-code
  // lookup, which keys ONLY on report.status.
  const designGate = report.materiaEnabled ? scanDesignGates(targetRoot) : []
  if (json) console.log(JSON.stringify({ ...report, designGate }, null, 2))
  else console.log([renderHuman(report, targetRoot), ...renderDesignGate(designGate)].join('\n'))
  // Set exitCode rather than process.exit(): exit() can kill the process before
  // a large piped stdout write flushes (observed >8KB on macOS), truncating the
  // --json document. exitCode lets the event loop drain, then exits.
  process.exitCode = EXIT[report.status] ?? 0
}

main()
