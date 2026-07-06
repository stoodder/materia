#!/usr/bin/env node
// Deterministic docs checker — no network, no AI. Three layers:
//  1. Link check (CLAUDE.md + docs/** + .claude/skills/**): every relative
//     Markdown link resolves to a real file on disk.
//  2. Anchor check (agent-context docs + skills only): every `#fragment` in a
//     relative link resolves to a real heading in the target file.
//  3. Style checks (CLAUDE.md + docs root + resources/ + standards/ +
//     _templates/ only — the agent-context docs governed by
//     docs/standards/docs.md): no change-narration phrases (matched across
//     line wraps), no over-long lines (mega table cells), no duplicated long
//     lines, glossary stays alphabetical.
// Exits non-zero (with the offending file:line) on any failure.
// Run: `node scripts/check-docs.mjs` or `pnpm run check:docs`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'

const ROOTS = ['CLAUDE.md', 'docs', '.claude/skills']

const files = []
function walk(p) {
  if (!existsSync(p)) return
  const st = statSync(p)
  if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e))
  else if (p.endsWith('.md')) files.push(p)
}
for (const r of ROOTS) walk(r)

let failures = 0
function fail(msg) {
  console.error(`  ✗ ${msg}`)
  failures++
}

// Blank a region of text (non-newline chars → spaces) so later scans skip it
// while every line number stays true.
function blank(text, re) {
  return text.replace(re, (m) => m.replace(/[^\n]/g, ' '))
}
const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g // code fences aren't rendered
const INLINE_CODE = /`[^`]*`/g // may span a wrapped line

// ---------------------------------------------------------------- link check

// Link text may itself contain brackets (e.g. Nuxt dynamic-route paths like
// `[server/api/weeks/[weekId]/x.ts]`), so allow one level of nested `[...]`
// in the text — otherwise the text match stops at the first `]` and the link
// (and its target) is silently skipped.
const LINK = /\[(?:[^[\]]|\[[^\]]*\])*\]\(([^)]+)\)/g

// Only the always-relevant agent-context docs; the run-artifact trees
// (specs/bugs/epics/research) are historical records and exempt by design.
const STYLE_DIRS = ['docs/resources', 'docs/standards', 'docs/_templates']
const isStyleChecked = (f) =>
  f === 'CLAUDE.md' ||
  STYLE_DIRS.some((d) => f.startsWith(d + sep)) ||
  (f.startsWith('docs' + sep) && !f.slice(5).includes(sep)) // docs/ root files
const isAnchorChecked = (f) => isStyleChecked(f) || f.startsWith('.claude' + sep)

// GitHub-style heading slugs, normalized (runs of hyphens collapsed) so both
// dash-variant renderings of the same heading compare equal.
const slugify = (heading) =>
  heading
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
const headingSlugs = new Map() // file → Set of normalized slugs
function slugsFor(file) {
  if (!headingSlugs.has(file)) {
    const set = new Set()
    const text = blank(readFileSync(file, 'utf8'), FENCE)
    for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
      const base = slugify(m[1])
      set.add(set.has(base) ? `${base}-${[...set].filter((s) => s.startsWith(base)).length}` : base)
      set.add(base)
    }
    headingSlugs.set(file, set)
  }
  return headingSlugs.get(file)
}

for (const f of files.sort()) {
  // Blank inline code too: a backticked `[text](path)` is illustrative link
  // syntax (common in skill docs), not a rendered link.
  const text = blank(blank(readFileSync(f, 'utf8'), FENCE), INLINE_CODE)
  for (const m of text.matchAll(LINK)) {
    const [target, fragment] = m[1].split('#')
    const path = target.trim()
    if (/^(https?:|mailto:)/.test(path)) continue
    const resolved = path ? resolve(dirname(f), path) : resolve(f)
    if (path && !existsSync(resolved)) {
      fail(`${f} -> ${m[1]}`)
      continue
    }
    if (fragment !== undefined && isAnchorChecked(f) && resolved.endsWith('.md')) {
      const want = fragment
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '-')
      const slugs = slugsFor(relative(process.cwd(), resolved))
      if (!slugs.has(want) && !slugs.has(want.replace(/-\d+$/, '')))
        fail(`${f} -> ${m[1]} (no heading matches #${fragment})`)
    }
  }
}

// -------------------------------------------------------------- style checks

// Change-narration markers — docs describe the present state; git owns the
// past (docs/standards/docs.md § Rule). Case-insensitive, matched across
// line wraps; text inside code fences or inline code is exempt.
const NARRATION = [
  'renamed from',
  'formerly',
  'previously',
  'used to be',
  'was removed',
  'were removed',
  'no longer',
  'left untouched',
  '(modified)',
  'locked per',
  'new exemption',
]
const phraseRe = (p) =>
  new RegExp(
    p
      .split(/\s+/)
      .map((w) => w.replace(/[()]/g, '\\$&'))
      .join('\\s+'),
    'gi',
  )
const MAX_LINE = 600 // mega-table-cell backstop
const DUP_MIN = 100 // duplicated-long-line detector threshold

for (const f of files.filter(isStyleChecked).sort()) {
  const raw = readFileSync(f, 'utf8')
  const prose = blank(blank(raw, FENCE), INLINE_CODE)
  for (const phrase of NARRATION)
    for (const m of prose.matchAll(phraseRe(phrase))) {
      const line = prose.slice(0, m.index).split('\n').length
      fail(
        `${f}:${line} change-narration phrase "${phrase}" — describe the present state (docs/standards/docs.md)`,
      )
    }
  const seen = new Map() // trimmed long line -> first line number
  const fenceless = blank(raw, FENCE).split('\n')
  raw.split('\n').forEach((rawLine, i) => {
    if (fenceless[i].trim() === '' && rawLine.trim() !== '') return // inside a fence
    const n = i + 1
    if (rawLine.length > MAX_LINE)
      fail(
        `${f}:${n} line is ${rawLine.length} chars (max ${MAX_LINE}) — move detail out of the table cell (docs/standards/docs.md)`,
      )
    const trimmed = rawLine.trim()
    if (trimmed.length >= DUP_MIN) {
      if (seen.has(trimmed))
        fail(`${f}:${n} duplicates line ${seen.get(trimmed)} — copy-paste drift`)
      else seen.set(trimmed, n)
    }
  })
}

// Glossary must stay alphabetical (ignoring case + markdown decoration).
const GLOSSARY = 'docs/glossary.md'
if (existsSync(GLOSSARY)) {
  const terms = readFileSync(GLOSSARY, 'utf8')
    .split('\n')
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => /^\| ?\*\*/.test(l))
    .map(({ l, n }) => ({ term: l.split('|')[1].replace(/[*`]/g, '').trim(), n }))
  for (let i = 1; i < terms.length; i++) {
    const [a, b] = [terms[i - 1], terms[i]]
    if (a.term.localeCompare(b.term, 'en', { sensitivity: 'base', numeric: true }) > 0)
      fail(
        `${GLOSSARY}:${b.n} "${b.term}" sorts before "${a.term}" (line ${a.n}) — keep the table alphabetical`,
      )
  }
}

if (failures) {
  console.error(`\n${failures} docs-check failure(s) across ${files.length} docs.`)
  process.exit(1)
}
console.log(
  `✓ docs check: ${files.length} files — links, anchors, style, glossary order all clean.`,
)
