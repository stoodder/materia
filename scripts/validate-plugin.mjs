#!/usr/bin/env node
// Plugin validation — simulates what /materia:init materializes from the
// `materia` plugin's bundled scaffold, then verifies it. No network, no AI.
// The plugin lives at plugins/materia/: skills/ (all pipeline skills, at the
// plugin root per the Claude Code plugin spec) and scaffold/ (the MATERIA.md +
// CLAUDE.md + docs/ + check-docs.sh bundle that /materia:init writes into a
// user repo). The shipped checker is the portable POSIX-sh check-docs.sh; its
// parity oracle (the Node reference implementation, repo-local, never bundled)
// lives at scripts/check-docs-oracle.mjs and is exercised by the check-docs
// parity harness (§1). Layers:
//  1. check-docs parity harness: materialize the two real scaffold profiles
//     exactly as /materia:init would (docs/ + root CLAUDE.md/MATERIA.md + the
//     standards stubs init generates; skills are NOT copied — installed
//     plugins run from the read-only cache, not from .claude/skills/ in the
//     user repo, so a scaffold doc that still LINKS into a skill file fails
//     here honestly) plus a synthetic fixture corpus, and prove
//     `node check-docs-oracle.mjs` (ground truth) == `sh check-docs.sh` on
//     host awk == busybox awk == gawk/C.UTF-8 on every one of them.
//  1b. Direct skills link/anchor check: resolves every relative link + #anchor
//     in plugins/materia/skills/** as the files sit in the repo (the coverage
//     the skill-free parity harness gives up), skipping ${CLAUDE_PLUGIN_ROOT}
//     runtime paths and http(s)/mailto links (not repo-relative). A link that
//     escapes the skills subtree fails — such refs must be repo-relative
//     backtick prose.
//  2. § audit: every segment of every `MATERIA.md § A § B` reference chain
//     across plugins/materia/ names a real heading in MATERIA.md, plus mirror
//     pins (§ Skill routing rows that must carry an equal tier).
//  3. Slot hygiene: {{slot}} markers may exist only in the slotted templates
//     (MATERIA.md, CLAUDE.md, docs skeleton) — never in skills.
// Exits non-zero with the failures listed. Run: node scripts/validate-plugin.mjs
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
// Authoritative id lists + the pure inspector from the PURE contract lib (no CLI main()
// runs on import), so §6 can resolve a ledger change's doctorChecks/migrations against the
// real doctor checks + migrate handlers, and §7 can pin KNOWN_CHECK_IDS against what doctor
// actually emits AND (for the doctor releaseDir-isn't-CLI-overridable case) call inspect()
// directly against a synthetic ledger the same way doctor.mjs/migrate.mjs do.
import { KNOWN_CHECK_IDS, KNOWN_MIGRATION_IDS, inspect } from '../plugins/materia/scripts/lib/materia-contract.mjs'

process.chdir(join(import.meta.dirname, '..'))
let failures = 0
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures++ }

// ---- 1. check-docs parity harness -------------------------------------------
// The shipped checker is a portable POSIX-sh reimplementation
// (plugins/materia/scaffold/.materia/scripts/check-docs.sh) of the Node reference
// implementation (scripts/check-docs-oracle.mjs). "Byte-for-byte identical
// output" is a CONTRACT, not a hope — so pin it here permanently: for a fixture
// corpus that exercises every branch AND the known divergence surfaces, prove
// `node check-docs-oracle.mjs` == `sh check-docs.sh` on host awk == `sh
// check-docs.sh` under busybox awk (identical stdout + stderr + exit). The
// oracle is the ground truth; the .sh must match it, and must give identical
// results under mawk and busybox awk (the portability floor). A mismatch on ANY
// lane fails CI with a diff snippet, so a future edit to either checker that
// breaks parity (e.g. the round-1 NBSP-narration regression) cannot land green.
{
  const ORACLE = resolve('scripts/check-docs-oracle.mjs')
  const SH = resolve('plugins/materia/scaffold/.materia/scripts/check-docs.sh')

  // ---- busybox lane gating (detect once) ----
  // The .sh must be portable across awks; busybox awk is the strict floor. In CI
  // (GitHub sets CI=true) busybox is REQUIRED — never silently skip the lane.
  // Locally, if it's absent, warn + run host-awk parity only (oracle==sh still
  // asserted) rather than blocking the dev loop.
  const bbProbe = spawnSync('busybox', ['true'], { encoding: 'utf8' })
  const haveBusybox = !bbProbe.error && bbProbe.status === 0
  if (!haveBusybox) {
    if (process.env.CI)
      fail('busybox required in CI for the check-docs portability lane but not found — install busybox-static on the runner')
    else
      console.log('  ⚠ SKIP busybox lane: busybox not found on PATH — running host-awk parity only (oracle==sh still asserted). Set CI=1 to make this a hard failure.')
  }
  // gawk lane under a UTF-8 locale (C.UTF-8): gawk is multibyte-aware, so under a
  // UTF-8 locale it uses CHARACTER semantics and would diverge on non-ASCII
  // slugs/glossary sorts — exactly what broke on GitHub Actions when this lane
  // ran under an explicit AWK=gawk override with LC_ALL=C.UTF-8. check-docs.sh
  // pins LC_ALL=C internally to force byte semantics; this lane runs that
  // failure environment so a future removal of the pin fails here, not just in
  // CI. IMPORTANT: Ubuntu's DEFAULT `awk` is mawk, not gawk — the host-awk lane
  // above does NOT exercise gawk at all, so gawk must be explicitly apt-installed
  // for this lane to run anywhere. In CI it is therefore a HARD requirement,
  // symmetric with busybox above (never silently skip it there); locally, warn +
  // skip rather than blocking the dev loop.
  const gawkProbe = spawnSync('gawk', ['--version'], { encoding: 'utf8' })
  const haveGawk = !gawkProbe.error && gawkProbe.status === 0
  if (!haveGawk) {
    if (process.env.CI)
      fail('gawk required in CI for the check-docs gawk/C.UTF-8 parity lane but not found — install gawk on the runner (Ubuntu\'s default awk is mawk, not gawk)')
    else
      console.log('  ⚠ SKIP gawk lane: gawk not found on PATH — running without it (other lanes still assert oracle==sh parity). Install gawk locally, or set CI=1 to make this a hard failure.')
  }

  const snippet = (s) => { s = s ?? ''; return s.length > 700 ? s.slice(0, 700) + '\n…[truncated]' : s }
  // Run all lanes over `cwd` and assert three-way (or two-way, no-busybox)
  // identity of stdout+stderr+status. Returns the oracle result for expectation
  // checks. fail()s with a diff snippet on any lane mismatch.
  const parity = (label, cwd) => {
    const oracle = spawnSync('node', [ORACLE], { cwd, encoding: 'utf8' })
    const lanes = [['oracle(node)', oracle], ['sh(host-awk)', spawnSync('sh', [SH], { cwd, encoding: 'utf8' })]]
    if (haveBusybox)
      lanes.push(['sh(busybox-awk)', spawnSync('sh', [SH], { cwd, encoding: 'utf8', env: { ...process.env, AWK: 'busybox awk' } })])
    if (haveGawk)
      lanes.push(['sh(gawk,C.UTF-8)', spawnSync('sh', [SH], { cwd, encoding: 'utf8', env: { ...process.env, AWK: 'gawk', LC_ALL: 'C.UTF-8' } })])
    const [refName, ref] = lanes[0]
    for (const [name, r] of lanes.slice(1)) {
      const diffs = []
      if (r.status !== ref.status) diffs.push(`  exit: ${refName}=${ref.status} vs ${name}=${r.status}`)
      if (r.stdout !== ref.stdout) diffs.push(`  stdout ${refName}:\n${snippet(ref.stdout)}\n  stdout ${name}:\n${snippet(r.stdout)}`)
      if (r.stderr !== ref.stderr) diffs.push(`  stderr ${refName}:\n${snippet(ref.stderr)}\n  stderr ${name}:\n${snippet(r.stderr)}`)
      if (diffs.length)
        fail(`check-docs parity [${label}] — ${refName} vs ${name} diverge:\n${diffs.join('\n')}`)
    }
    return ref
  }

  // ---- fixture corpus ----
  // Each fixture is a self-contained doc tree (CLAUDE.md and/or docs/**); the
  // checkers are invoked by ABSOLUTE path with cwd = the tree, so no checker copy
  // is materialized inside it. `expect` pins the oracle's own verdict (fail|clean)
  // so a mis-crafted fixture that stops exercising its branch is caught too — but
  // the primary assertion is cross-lane parity.
  const TICK = '```', TILDE = '~~~', NBSP = ' ', EMD = '—'
  const rep = (s, n) => s.repeat(n)
  const doc = (...ls) => ls.join('\n') + '\n'
  const NARRATION = ['renamed from', 'formerly', 'previously', 'used to be', 'was removed',
    'were removed', 'no longer', 'left untouched', '(modified)', 'locked per', 'new exemption']
  const line600 = rep(EMD, 200) + rep('x', 400) // 600 code points, 1000 bytes — NOT overlong
  const line601 = rep(EMD, 200) + rep('x', 401) // 601 code points — overlong (>600); byte count would be 1001
  const dupLine = rep('z', 120)                 // >= 100 cp, duplicated
  const megaLine = rep('q', 120)                // dup line for the multi-violation fixture

  const fixtures = [
    // links + anchors
    { name: 'broken-link', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[missing](docs/none.md)') } },
    { name: 'valid-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[ok](docs/real.md)'), 'docs/real.md': doc('# Real') } },
    { name: 'bad-anchor', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[a](docs/real.md#nope)'), 'docs/real.md': doc('# Real Heading') } },
    { name: 'dup-heading-anchor', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](docs/d.md#dup)', '', '[b](docs/d.md#dup-1)'), 'docs/d.md': doc('# Dup', '', 'a', '', '# Dup', '', 'b') } },
    { name: 'nested-bracket-link', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[see [weekId] path](docs/none.md)') } },
    { name: 'heading-inline-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](docs/hl.md#see-docs)'), 'docs/hl.md': doc('# H', '', '## See [docs](http://x)', '', 'body') } },
    { name: 'http-mailto-skipped', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](https://e.com) [b](mailto:x@y.z) [c](http://f)') } },
    // fences + inline code
    { name: 'in-fence-ignored', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', TICK, '[bad](docs/none.md) was removed previously', TICK) } },
    { name: 'between-fences-caught', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', TICK, 'a', TICK, '[bad](docs/none.md) was removed', TICK, 'b', TICK) } },
    { name: 'interleaved-fences', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', TICK, 'code ' + TILDE + ' code', TICK, '', TILDE, 'more [x](docs/none.md) code', TILDE) } },
    { name: 'inline-code-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', 'Use `[x](docs/none.md)` inline.') } },
    // narration (one per phrase) + wrap + NBSP surfaces
    { name: 'narration-linewrap', expect: 'fail', files: { 'docs/w.md': doc('# T', '', 'The field was renamed', 'from foo.') } },
    { name: 'nbsp-narration-caught', expect: 'fail', files: { 'docs/nb.md': doc('# T', '', 'The field was renamed' + NBSP + 'from foo.') } },
    { name: 'nbsp-heading-clean', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](docs/h.md#foo-bar)'), 'docs/h.md': doc('# H', '', '## Foo' + NBSP + 'Bar', '', 'body') } },
    // long-line surfaces
    { name: 'overlong-boundary', expect: 'fail', files: { 'docs/standards/o.md': doc('# T', '', line601, '', line600) } },
    { name: 'dup-long-line', expect: 'fail', files: { 'docs/standards/dp.md': doc('# T', '', dupLine, dupLine) } },
    // glossary
    { name: 'glossary-clean', expect: 'clean', files: { 'docs/glossary.md': doc('# Glossary', '', '## Alpha', '', '| Term | Def |', '| --- | --- |', '| **alpha** | 1 |', '| **beta** | 2 |', '| **gamma** | 3 |') } },
    { name: 'glossary-disorder', expect: 'fail', files: { 'docs/glossary.md': doc('# Glossary', '', '| Term | Def |', '| --- | --- |', '| **apple** | a |', '| **Café** | b |', '| **cafe** | c |', '| **v2** | d |', '| **v10** | e |', '| **zebra** | f |', '| **aaa** | g |') } },
    // ordering + sort boundary + exemption
    { name: 'multi-violation-order', expect: 'fail', files: { 'docs/standards/m.md': doc('# M', '', '[bad](docs/none.md)', '', 'This was removed; it is no longer used.', '', line601, '', megaLine, megaLine) } },
    { name: 'sort-boundary', expect: 'fail', files: { 'CLAUDE.md': doc('# C', '', '[bad](docs/none.md)'), 'docs/z.md': doc('# Z', '', '[bad](none2.md)') } },
    { name: 'specs-exempt', expect: 'fail', files: { 'docs/specs/s.md': doc('# S', '', 'This was removed previously.', '', '[bad](none.md)', '', '[self](s.md#no-such)') } },
    // fully clean tree
    { name: 'clean-tree', expect: 'clean', files: { 'CLAUDE.md': doc('# App', '', 'See [readme](docs/README.md) and [alpha](docs/glossary.md#alpha).'), 'docs/README.md': doc('# Readme'), 'docs/glossary.md': doc('# Glossary', '', '## Alpha', '', '| Term | Def |', '| --- | --- |', '| **alpha** | 1 |', '| **beta** | 2 |') } },
    // coverage — branches otherwise unexercised by the corpus or scaffold profiles
    { name: 'self-anchor-clean', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', 'See [x](#section-two).', '', '## Section Two', '', 'body') } }, // empty-target self-link resolves
    { name: 'self-anchor-bad', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', 'See [x](#no-such).', '', '## Section Two') } },
    { name: 'resources-style', expect: 'fail', files: { 'docs/resources/r.md': doc('# R', '', 'This was removed previously.') } }, // docs/resources/ isStyle branch
    { name: 'templates-style', expect: 'fail', files: { 'docs/_templates/t.md': doc('# Tmpl', '', 'This was removed previously.') } }, // docs/_templates/ isStyle branch
    { name: 'unpaired-fence', expect: 'fail', files: { 'docs/standards/uf.md': doc('# T', '', TICK, 'code', '', 'This was removed here.') } }, // unclosed fence → content not blanked
    { name: 'multi-hash-fragment', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[x](docs/mh.md#foo#bar)'), 'docs/mh.md': doc('# H', '', '## Foo', '', 'body') } }, // fragment = first #-segment
  ]
  // one fixture per NARRATION phrase (each a lone violation in a style-checked doc)
  for (const p of NARRATION)
    fixtures.push({ name: `narration:${p}`, expect: 'fail', files: { 'docs/n.md': doc('# T', '', `This ${p} here.`) } })

  const corpus = mkdtempSync(join(tmpdir(), 'materia-parity-'))
  try {
    const before = failures
    for (const fx of fixtures) {
      const dir = join(corpus, fx.name.replace(/[^\w.-]/g, '_'))
      for (const [rel, content] of Object.entries(fx.files)) {
        const dest = join(dir, rel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, content)
      }
      const ref = parity(`fixture ${fx.name}`, dir)
      const got = ref.status === 0 ? 'clean' : 'fail'
      if (got !== fx.expect)
        fail(`check-docs parity fixture "${fx.name}": oracle verdict ${got} but fixture expects ${fx.expect} — the fixture no longer exercises its branch (oracle stderr: ${snippet(ref.stderr).split('\n')[0] || '<none>'})`)
    }

    // ---- the two real scaffold profiles through the same three-way parity ----
    // Re-materialize UI + non-UI profiles exactly as /materia:init would write
    // them (minus copying a checker — invoked by absolute path) and assert
    // cross-lane parity on the real bundled docs, not just synthetic fixtures.
    // Both must be clean. This is the sole coverage of the real scaffold
    // profiles through check-docs — it fully absorbs what a separate
    // materialization-sim-plus-check-docs-exit-0 pass would give.
    const profiles = [
      ['UI repo', ['architecture', 'testing', 'workflow', 'visual-language', 'ui-components']],
      ['non-UI repo', ['architecture', 'testing', 'workflow']],
    ]
    for (const [label, standards] of profiles) {
      const dir = join(corpus, 'profile-' + label.replace(/[^\w.-]/g, '_'))
      mkdirSync(dir, { recursive: true })
      cpSync('plugins/materia/scaffold/docs', join(dir, 'docs'), { recursive: true })
      cpSync('plugins/materia/scaffold/CLAUDE.md', join(dir, 'CLAUDE.md'))
      cpSync('plugins/materia/scaffold/MATERIA.md', join(dir, 'MATERIA.md'))
      for (const f of standards)
        writeFileSync(join(dir, `docs/standards/${f}.md`), '# stub — generated by /materia:init\n')
      const ref = parity(`scaffold profile ${label}`, dir)
      if (ref.status !== 0)
        fail(`check-docs parity scaffold profile "${label}": oracle reports failures (expected clean):\n${snippet(ref.stderr)}`)
    }

    if (failures === before) {
      const awks = ['host awk', haveBusybox && 'busybox awk', haveGawk && 'gawk/C.UTF-8'].filter(Boolean).join(' == ')
      console.log(`  ✓ check-docs parity: ${fixtures.length} fixtures + ${profiles.length} scaffold profiles — oracle == sh (${awks})`)
    }
  } finally {
    rmSync(corpus, { recursive: true, force: true })
  }
}

// ---- 1b. direct skills link/anchor check ------------------------------------
// The skill-free parity harness (above) no longer covers skill-internal markdown links or
// anchors. Restore that coverage HONESTLY: resolve every relative link + #anchor
// in plugins/materia/skills/** exactly as the files sit in the repo — no temp
// reconstruction. Valid skill links stay inside the skills subtree: sibling
// ../<skill>/SKILL.md and intra-skill resources/... paths. ${CLAUDE_PLUGIN_ROOT}
// runtime paths (Part A's rerouted cache reads) and http(s)/mailto links are
// skipped — not repo-relative — and link syntax inside code fences / inline code
// is illustrative, not a real link. A link that ESCAPES plugins/materia/skills/**
// (e.g. a stale ../../../docs/... pointer into the user repo) FAILS: an installed
// skill runs from a read-only cache that can't reach the user repo, so such
// references must be repo-relative backtick prose, not live links.
{
  const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
  const INLINE_CODE = /`[^`]*`/g
  const LINK = /\[(?:[^[\]]|\[[^\]]*\])*\]\(([^)]+)\)/g
  const blankOut = (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' '))
  const slugify = (h) =>
    h.toLowerCase().replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[^\w\s-]/g, '').trim().replace(/[\s-]+/g, '-')
  const slugCache = new Map()
  const slugsFor = (file) => {
    if (!slugCache.has(file)) {
      const set = new Set()
      for (const m of blankOut(readFileSync(file, 'utf8'), FENCE).matchAll(/^#{1,6}\s+(.+)$/gm)) {
        const base = slugify(m[1])
        set.add(set.has(base) ? `${base}-${[...set].filter((s) => s.startsWith(base)).length}` : base)
        set.add(base)
      }
      slugCache.set(file, set)
    }
    return slugCache.get(file)
  }
  const skillsRoot = resolve('plugins/materia/skills')
  const skillDocs = []
  const walkSkills = (p) => {
    for (const e of readdirSync(p)) {
      const fp = join(p, e)
      if (statSync(fp).isDirectory()) walkSkills(fp)
      else if (fp.endsWith('.md')) skillDocs.push(fp)
    }
  }
  walkSkills(skillsRoot)
  const before = failures
  let checked = 0
  for (const f of skillDocs.sort()) {
    const text = blankOut(blankOut(readFileSync(f, 'utf8'), FENCE), INLINE_CODE)
    for (const m of text.matchAll(LINK)) {
      const [target, fragment] = m[1].split('#')
      const path = target.trim()
      if (/^(https?:|mailto:)/.test(path)) continue
      if (path.includes('CLAUDE_PLUGIN_ROOT')) continue // runtime cache token, not repo-relative
      const resolved = path ? resolve(dirname(f), path) : resolve(f)
      if (resolved !== skillsRoot && !resolved.startsWith(skillsRoot + sep)) {
        fail(`skills link escapes plugins/materia/skills/**: ${relative(skillsRoot, f)} -> ${m[1]} — make it repo-relative backtick prose`)
        continue
      }
      if (path && !existsSync(resolved)) {
        fail(`skills link: ${relative(skillsRoot, f)} -> ${m[1]}`)
        continue
      }
      checked++
      if (fragment !== undefined && resolved.endsWith('.md')) {
        const want = fragment.trim().toLowerCase().replace(/[\s-]+/g, '-')
        const slugs = slugsFor(resolved)
        if (!slugs.has(want) && !slugs.has(want.replace(/-\d+$/, '')))
          fail(`skills anchor: ${relative(skillsRoot, f)} -> ${m[1]} (no heading matches #${fragment})`)
      }
    }
  }
  if (failures === before)
    console.log(`  ✓ direct skills link/anchor check: ${checked} links/anchors across ${skillDocs.length} skill docs resolve (natural repo layout)`)
}

// ---- 1c. stage-numbering canon ----------------------------------------------
// The status templates are the source of truth; skills that hard-code a row
// number must agree. Both sides are pinned here so drift fails CI.
const canon = [
  ['plugins/materia/scaffold/docs/specs/_templates/status.md', '- [ ] 4. architecture'],
  ['plugins/materia/scaffold/docs/specs/_templates/status.md', '- [ ] 5. plan-tasks'],
  ['plugins/materia/scaffold/docs/specs/_templates/status.md', '- [ ] 9. finalize'],
  ['plugins/materia/scaffold/docs/bugs/_templates/status.md', '- [ ] 3. plan-tasks'],
  ['plugins/materia/scaffold/docs/bugs/_templates/status.md', '- [ ] 6. docs-sync'],
  ['plugins/materia/scaffold/docs/bugs/_templates/status.md', '- [ ] 7. docs-audit'],
  ['plugins/materia/scaffold/docs/bugs/_templates/status.md', '- [ ] 8. finalize'],
  ['plugins/materia/skills/architecture/SKILL.md', 'tick stage 4 in `STATUS.md`'],
  ['plugins/materia/skills/plan-tasks/SKILL.md', 'tick stage 5 in `STATUS.md`'],
  ['plugins/materia/skills/finalize/SKILL.md', 'row 9 in the spec template, row 8 in the bug template'],
  ['plugins/materia/skills/fix-bug/SKILL.md', 'it ticks **stage 3**, not stage 5'],
  ['plugins/materia/skills/fix-bug/SKILL.md', '7. **docs-audit**'],
]
for (const [f, needle] of canon)
  if (!readFileSync(f, 'utf8').includes(needle)) fail(`stage canon: ${f} missing expected text: "${needle}"`)
console.log(`  ✓ stage-numbering canon: ${canon.length} pins hold`)

// ---- 1d. § Version control citation pin -------------------------------------
// Git/forge portability (trunk, remote, baseline, and the PR/CI forge flow) is
// no longer hardcoded in the skills — it resolves from MATERIA.md § Version
// control (+ its § Forge subsection). Guard that the config home exists AND that
// every skill which resolves trunk/remote/forge AT RUNTIME actually references
// it, so a future edit can't silently re-hardcode a literal without also
// dropping the pin. This is PRESENCE + CITATION only (no denylist scan for the
// literals themselves — that was a deliberate scoping decision); the honesty of
// the swap is carried by review, this pin catches the section being renamed away
// or a listed skill losing its reference.
//
// The citation set is the skills that run trunk/remote/forge git/PR commands.
// EXCLUDED by design: `init` (it MATERIALIZES MATERIA.md — it writes this section
// from the repo's existing default branch and must not cite the config it
// writes), and `docs-sync`/`docs-audit` (they are HANDED the branch diff and run
// no git of their own — they may mention § Version control but are not required
// to). The shared producer-lifecycle standard docs/standards/skills.md IS pinned:
// the producers inherit their PR-open/branch rules from it.
//
// The match mirrors the § audit's normalization (whitespace-collapsed text +
// an optional backtick/quote after `MATERIA.md`) so a citation that wraps across
// lines or is written `MATERIA.md`\n§ Version control is not a false failure.
// It first blanks code fences and HTML comments so a stray reference left inside
// a ``` block or an <!-- --> comment can't satisfy the pin while the real prose
// citation was replaced by a hardcode (the decoy-match gap). Inline code is NOT
// blanked — the citation writes `MATERIA.md` as inline code, so blanking it would
// destroy the very token being matched (the § audit matches these the same way).
{
  const before = failures
  const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
  const HTML_COMMENT = /<!--[\s\S]*?-->/g
  const blankOut = (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' '))
  const matSrc = readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8')
  const matLines = matSrc.split('\n').map((l) => l.trimEnd())
  for (const h of ['## Version control', '### Forge'])
    if (!matLines.includes(h))
      fail(`§ Version control pin: plugins/materia/scaffold/MATERIA.md is missing the \`${h}\` heading — it is the config home the pipeline resolves trunk/remote/forge from`)
  const cites = (file) => {
    const t = blankOut(blankOut(readFileSync(file, 'utf8'), FENCE), HTML_COMMENT)
    return /MATERIA\.md[`"']?\s*§\s*Version control/.test(t.replace(/\s+/g, ' '))
  }
  const VC_CITERS = [
    'janitor', 'librarian', 'ship-spec', 'finalize', 'propose-spec', 'propose-epic',
    'report-bug', 'reconcile-epic', 'ui-inspection', 'triage-retros', 'fix-bug',
  ]
  for (const s of VC_CITERS) {
    const f = `plugins/materia/skills/${s}/SKILL.md`
    if (!existsSync(f)) { fail(`§ Version control pin: ${f} not found`); continue }
    if (!cites(f))
      fail(`§ Version control pin: ${s}/SKILL.md does not cite \`MATERIA.md § Version control\` — it resolves trunk/remote/forge at runtime and must reference the config home (not re-hardcode main/origin)`)
  }
  if (!cites('plugins/materia/scaffold/docs/standards/skills.md'))
    fail('§ Version control pin: docs/standards/skills.md does not cite `MATERIA.md § Version control` — the shared producer-lifecycle rule routes trunk/remote/forge through the config home')
  if (failures === before)
    console.log(`  ✓ § Version control citation pin: 2 headings + ${VC_CITERS.length} skills + skills.md reference the config home`)
}

// ---- 1e. § Gate citation pin + no-hardcoded-gate-path scan ------------------
// The docs gate's command is not hardcoded in the skills — it resolves from the
// installed repo's own MATERIA.md § Gate `check:docs` row (the gate script ships
// under .materia/scripts/, but a skill must never name that literal path: the
// path is the repo's to set, exactly like trunk/remote resolve from § Version
// control, §1d). Two guards, mirroring §1d's style:
//   (a) No skill file may name the legacy root gate path `scripts/check-docs.sh`
//       (a fixed-length lookbehind exempts the real `.materia/scripts/check-docs.sh`).
//       doctor/ and migrate/ skills are EXEMPT — their either-location / ledger
//       prose legitimately names the legacy root path a migrating repo still carries.
//   (b) Every skill that runs or names the docs gate must cite `MATERIA.md § Gate`
//       (the command-resolution home), matched whitespace-collapsed like §1d so a
//       citation wrapped across lines still counts (fences/HTML comments blanked
//       first — a citation left inside a ``` block can't satisfy the pin).
//       The fence regex is line-ANCHORED (a real Markdown fence opens a line):
//       §1d's un-anchored variant would mis-pair on an inline ` ```retro ` code
//       span (triage-retros names one) and falsely blank real prose citations.
{
  const before = failures
  const FENCE = /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm
  const HTML_COMMENT = /<!--[\s\S]*?-->/g
  const blankOut = (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' '))
  // (a) legacy-path scan over every file under skills/, except doctor/ & migrate/.
  const BADPATH = /(?<!\.materia\/)scripts\/check-docs\.sh/
  const EXEMPT = new Set(['doctor', 'migrate'])
  const scanDir = (dir) => {
    for (const e of readdirSync(dir)) {
      const fp = join(dir, e)
      if (statSync(fp).isDirectory()) { scanDir(fp); continue }
      readFileSync(fp, 'utf8').split('\n').forEach((ln, i) => {
        if (BADPATH.test(ln))
          fail(`§ Gate path pin: ${fp}:${i + 1} names the legacy gate path \`scripts/check-docs.sh\` — gate commands resolve from the repo's MATERIA.md § Gate row (do not hardcode the script path; the gate script ships under .materia/scripts/)`)
      })
    }
  }
  for (const d of readdirSync('plugins/materia/skills')) {
    if (EXEMPT.has(d)) continue
    const p = join('plugins/materia/skills', d)
    if (statSync(p).isDirectory()) scanDir(p)
  }
  // (b) § Gate citation for the gate-running/naming skills.
  const cites = (file) => {
    const t = blankOut(blankOut(readFileSync(file, 'utf8'), FENCE), HTML_COMMENT)
    return /MATERIA\.md[`"']?\s*§\s*Gate/.test(t.replace(/\s+/g, ' '))
  }
  const GATE_CITERS = [
    'implement-task', 'report-bug', 'librarian', 'propose-spec', 'docs-audit',
    'docs-sync', 'fix-bug', 'architecture', 'ui-inspection', 'finalize', 'triage-retros',
  ]
  for (const s of GATE_CITERS) {
    const f = `plugins/materia/skills/${s}/SKILL.md`
    if (!existsSync(f)) { fail(`§ Gate citation pin: ${f} not found`); continue }
    if (!cites(f))
      fail(`§ Gate citation pin: ${s}/SKILL.md does not cite \`MATERIA.md § Gate\` — the docs gate command resolves from the repo's MATERIA.md § Gate row (do not hardcode the script path)`)
  }
  if (failures === before)
    console.log(`  ✓ § Gate path pin: no skill names the legacy gate path (doctor/migrate exempt) + ${GATE_CITERS.length} skills cite MATERIA.md § Gate`)
}

// ---- helpers ---------------------------------------------------------------
const mdFiles = []
const walk = (p) => {
  for (const e of readdirSync(p)) {
    const fp = join(p, e)
    if (statSync(fp).isDirectory()) walk(fp)
    else if (fp.endsWith('.md')) mdFiles.push(fp)
  }
}
walk('plugins/materia')

// ---- 2. § audit -------------------------------------------------------------
// Every segment of a `MATERIA.md § A § B` chain must name a real heading AND,
// past the first, be a subsection of its predecessor — so a mis-scoped pointer
// like `§ Gate § Model set` (Model set is a child of Tiers, not Gate) fails,
// not just an unknown segment. References wrap across lines, so audit over
// whitespace-normalized text and match each segment against the known heading
// set (longest first, at a word boundary) rather than guessing terminators —
// which also stops the capture from swallowing trailing prose.
const heads = []
const parentOf = new Map() // h3 heading -> its parent h2, for the nesting check
let curH2 = null
for (const ln of readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8').split('\n')) {
  const m2 = /^## (.+)$/.exec(ln), m3 = /^### (.+)$/.exec(ln)
  if (m2) { curH2 = m2[1].trim(); heads.push(curH2) }
  else if (m3) { const h = m3[1].trim(); heads.push(h); if (curH2) parentOf.set(h, curH2) }
}
const headsByLen = [...heads].sort((a, b) => b.length - a.length)
// the known heading that `text` begins with (word-boundary terminated), or null
const leadingHead = (text) =>
  headsByLen.find((h) => text === h || (text.startsWith(h) && /[^A-Za-z0-9]/.test(text[h.length]))) ?? null
let refs = 0
for (const f of mdFiles) {
  const norm = readFileSync(f, 'utf8').replace(/\s+/g, ' ')
  for (const start of norm.matchAll(/MATERIA\.md[`"']?/g)) {
    let pos = start.index + start[0].length
    let prev = null
    let sm
    while ((sm = /^\s*§\s*/.exec(norm.slice(pos)))) {
      const after = pos + sm[0].length
      if (!/^[A-Za-z]/.test(norm.slice(after))) break // `§` not followed by a name → not a section ref
      pos = after
      refs++
      const h = leadingHead(norm.slice(pos))
      if (!h) {
        const bad = norm.slice(pos, pos + 30).replace(/[.,;()`|<>—'"].*$/, '').trim()
        fail(`${f}: MATERIA.md § "${bad}…" has no matching heading in plugins/materia/scaffold/MATERIA.md`)
        break // chain integrity is lost past an unknown segment
      }
      if (prev && parentOf.get(h) !== prev) {
        fail(`${f}: MATERIA.md § "${prev} § ${h}" — "${h}" is not a subsection of "${prev}"`)
        break
      }
      prev = h
      pos += h.length
    }
  }
}
console.log(`  ✓ § audit: ${refs} MATERIA.md § references (nested, all chain segments) checked against ${heads.length} headings`)

// ---- 2b. mirror pins --------------------------------------------------------
// A cross-table pin: the § Skill routing `ui-review` row governs standalone
// invocation of the skill, while the ship-spec UI review angle spawns at the
// `ui` Tier in § Review angles. The two must stay in sync, so the skill row's
// model/effort is pinned equal to the registry row's Tier here — an edit to one
// that misses the other fails CI. The registry Tier is a single `<model>/<effort>`
// pair with NO Fallback token, so this compares model+effort only (per-token
// backticks stripped on both sides so `opus` and `` `opus` `` can't mismatch).
const stripTicks = (s) => s.replace(/`/g, '').trim()
const routingRow = (label) => {
  const src = readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8')
  const re = new RegExp(`^\\|\\s*\`${label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\`\\s*\\|(.+)$`, 'm')
  const m = src.match(re)
  if (!m) return null
  return m[1].split('|').slice(0, 3).map((c) => c.trim()) // [Model, Effort, Fallback Model]
}
// Parse a § Review angles registry row (columns Angle | File | Gate | Tier) and
// return its Tier as a 2-token [model, effort] (backticks stripped). The
// registry Tier carries no Fallback token — hence the 2-token shape.
const registryRow = (angle) => {
  const src = readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8')
  const re = new RegExp(`^\\|\\s*\`${angle.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\`\\s*\\|[^|]*\\|[^|]*\\|([^|]*)\\|`, 'm')
  const m = src.match(re)
  if (!m) return null
  return stripTicks(m[1]).split('/').map((t) => t.trim()) // Tier -> [model, effort]
}
const MIRRORS = [['ui-review', 'ui']]
for (const [skill, angle] of MIRRORS) {
  const rs = routingRow(skill), rg = registryRow(angle)
  if (!rs) fail(`mirror pin: § Skill routing row \`${skill}\` not found`)
  else if (!rg) fail(`mirror pin: § Review angles registry row \`${angle}\` not found`)
  else {
    const skillTier = rs.slice(0, 2).map(stripTicks) // [model, effort], backticks off
    if (skillTier.join('/') !== rg.join('/'))
      fail(`mirror pin: § Skill routing \`${skill}\` (${skillTier.join('/')}) and § Review angles \`${angle}\` Tier (${rg.join('/')}) must carry the same model/effort`)
  }
}
console.log(`  ✓ mirror pins: ${MIRRORS.length} cross-table mirror(s) hold`)

// ---- 2c. UI self-gate registry + placement ----------------------------------
// init no longer prunes skills — the four UI skills install in EVERY repo,
// including no-UI ones. Each MUST carry a runtime self-gate that exits cleanly
// when MATERIA.md § Surface gates § UI-affecting is `none`, and — most safety-
// critically for ui-inspection — that gate must run BEFORE the liveness
// probe / autostart so a no-UI repo never starts the dev stack. Presence alone
// is too weak (a gutted or relocated gate that kept the heading would pass), so
// this pins BOTH a distinctive marker AND placement:
//  - Marker: the bold gate lead-in `**UI self-gate` — a prose mention of "UI
//    self-gate" (e.g. design's § Scope) is NOT bolded, so it can never
//    satisfy the check (closes the accidental word-wrap false-green).
//  - Placement: the marker's offset must precede the skill's first side-effect
//    anchor. For ui-inspection that anchor IS the liveness/autostart
//    step, mechanically enforcing "gate before autostart"; for the other three
//    it is the first provisioning/read/short-circuit, enforcing "gate first".
// Repurposes the former UI_PRUNE set (skill → first-side-effect anchor).
const GATE_MARKER = '**UI self-gate'
const UI_SELF_GATE = {
  'design': 'docs/specs/_templates/design.md',            // step 1: first spec read
  'ui-test-plan': 'Pure non-behavioral change',           // the zero-flow waiver short-circuit (first write)
  'ui-review': 'Provision the Eyes environment',          // step 1: Eyes provisioning
  'ui-inspection': 'Probe the running app for liveness',  // Phase 0 step 1: liveness probe / autostart
}
const gateBefore = failures
for (const [skill, anchor] of Object.entries(UI_SELF_GATE)) {
  const s = readFileSync(`plugins/materia/skills/${skill}/SKILL.md`, 'utf8')
  const mark = s.indexOf(GATE_MARKER)
  const side = s.indexOf(anchor)
  if (mark === -1)
    fail(`UI self-gate: ${skill}/SKILL.md is missing the "${GATE_MARKER}" gate marker — it installs in every repo and must exit cleanly when MATERIA.md § UI-affecting is none`)
  else if (side === -1)
    fail(`UI self-gate: ${skill}/SKILL.md placement anchor "${anchor}" not found — cannot verify the gate runs before the first side-effect (did the anchor text change?)`)
  else if (mark > side)
    fail(`UI self-gate: ${skill}/SKILL.md gate marker is AFTER "${anchor}" — the gate must run before the first side-effect (for ui-inspection, before the liveness probe / autostart) or a no-UI repo acts before it self-gates`)
}
if (failures === gateBefore)
  console.log(`  ✓ UI self-gate: ${Object.keys(UI_SELF_GATE).length} UI skills carry the "${GATE_MARKER}" gate before their first side-effect`)

// ---- 2d. skill ↔ § Skill routing coverage -----------------------------------
// init no longer prunes, so EVERY skill dir ships in every repo, and each must
// be accounted for in MATERIA.md § Skill routing exactly once — via a plain row
// (label == dir) XOR the "Operator-session skills (rowless by design)" list. A
// future skill added with neither is the F3 gap this guards: it would silently
// fall to the Default row with no operator ever having sized it. Role rows
// (`<skill>: <role>`) account for an internal role only, never the parent dir —
// so a role-row parent (`janitor`, `ship-spec`, …) is covered by its LIST entry,
// not its role row, and that is not a double-count. We parse ONLY the § Skill
// routing section slice (bounded by its h3 and the next ##/### — the operator-
// session #### h4 stays inside it, and its bullets aren't `|`-rows) and the
// operator-session list slice separately, so no rows from § Review angles /
// § Model set can leak in.
{
  const before = failures
  const src = readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8')
  const lines = src.split('\n')
  // Slice § Skill routing: from its h3 to the next ##/### (a #### h4 — the
  // operator-session subheading — does NOT terminate the slice).
  let secStart = -1, secEnd = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (/^### Skill routing\s*$/.test(lines[i])) { secStart = i; continue }
    if (secStart !== -1 && /^#{2,3} /.test(lines[i])) { secEnd = i; break }
  }
  if (secStart === -1) fail('skill↔routing: MATERIA.md has no `### Skill routing` section')
  const routing = secStart === -1 ? '' : lines.slice(secStart, secEnd).join('\n')
  // Table-row labels: first cell, backtick-wrapped. The `**Default** …` row is
  // not backticked, so it never matches (correct). Classify each label:
  // `a: b` → role row, parent `a`; else plain row, the label IS a skill name.
  const plainRows = new Set(), roleParents = new Set(), rowLabels = []
  for (const ln of routing.split('\n')) {
    const m = /^\|\s*`([^`]+)`/.exec(ln)
    if (!m) continue
    const label = m[1].trim()
    rowLabels.push(label)
    if (label.includes(': ')) roleParents.add(label.split(': ')[0].trim())
    else plainRows.add(label)
  }
  // Slice the operator-session list: from its exact #### h4 to the next heading
  // of any level; each bullet's first backticked token is a rowless-by-design
  // skill name.
  let listStart = -1, listEnd = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (/^#### Operator-session skills \(rowless by design\)\s*$/.test(lines[i])) { listStart = i; continue }
    if (listStart !== -1 && /^#{1,6} /.test(lines[i])) { listEnd = i; break }
  }
  if (listStart === -1) fail('skill↔routing: MATERIA.md has no `#### Operator-session skills (rowless by design)` list')
  const opList = new Set()
  for (const ln of (listStart === -1 ? [] : lines.slice(listStart + 1, listEnd))) {
    const m = /^-\s*`([^`]+)`/.exec(ln)
    if (m) opList.add(m[1].trim())
  }
  // Skill dirs shipped under plugins/materia/skills/.
  const skillDirs = readdirSync('plugins/materia/skills', { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name)
  const dirSet = new Set(skillDirs)
  // A. Coverage — each dir accounted by EXACTLY ONE of {plain row} XOR {list}.
  for (const d of skillDirs) {
    const hasRow = plainRows.has(d), inList = opList.has(d)
    if (!hasRow && !inList)
      fail(`skill \`${d}\` is unaccounted in MATERIA.md § Skill routing — add a plain row, or list it under 'Operator-session skills (rowless by design)'`)
    else if (hasRow && inList)
      fail(`skill \`${d}\` is double-accounted (has a plain row AND is in the operator-session list) — pick one`)
  }
  // B. Orphan-row hygiene — every plain label + every role-row parent is a dir.
  for (const name of [...plainRows, ...roleParents])
    if (!dirSet.has(name))
      fail(`§ Skill routing row \`${name}\` names no skill dir under plugins/materia/skills/`)
  // C. Operator-session list hygiene — every listed name is a real dir.
  for (const name of opList)
    if (!dirSet.has(name))
      fail(`§ Skill routing operator-session list entry \`${name}\` names no skill dir under plugins/materia/skills/`)
  // Canon pin (consistency anchor): every `<skill>: <role>` row must be cited by
  // its exact backticked label in that skill's SKILL.md. Routing resolves from
  // this table regardless, but the prose citation is what keeps a maintainer
  // sizing the spawn here — an uncited role row is the drift that lets a future
  // edit relocate the spawn and silently pick up the Default row. Guards every
  // role row, not just janitor's. (Boundary: this covers skill dirs and cited
  // role rows — a future internal role added with no row at all is not a dir and
  // has no label, so it stays outside the mechanical guarantee; check A + the
  // operator-session list close the skill-dir case, which is the guarded one.)
  for (const label of rowLabels) {
    if (!label.includes(': ')) continue
    const parent = label.split(': ')[0].trim()
    if (!dirSet.has(parent)) continue // orphan parent already reported by check B
    const skillFile = `plugins/materia/skills/${parent}/SKILL.md`
    if (!existsSync(skillFile)) { fail(`${parent}/ has no SKILL.md — cannot verify it cites its \`${label}\` routing row`); continue }
    if (!readFileSync(skillFile, 'utf8').includes('`' + label + '`'))
      fail(`${parent}/SKILL.md does not cite its \`${label}\` routing row — a spawned role left uncited can drift to the Default row`)
  }
  if (failures === before)
    console.log(`  ✓ skill↔routing coverage: ${skillDirs.length} skill dirs each accounted (plain row XOR operator-session list); ${rowLabels.length + opList.size} rows/list entries name real skills`)
}

// ---- 3. slot hygiene ---------------------------------------------------------
// Skills ship slot-free (slots live in MATERIA.md/CLAUDE.md/docs). Rule is
// pattern-scoped, not file-scoped: flag a `{{` only when it is NOT immediately
// preceded by a backtick. A backtick-quoted `{{slot}}` is documentation of the
// slot-filling mechanism (init describes it), never a shipped unfilled
// marker — so it's allowed, while a bare pasted `{{...}}` still fails, in every
// skill including init.
for (const f of mdFiles.filter((f) => f.includes('plugins/materia/skills/'))) {
  const s = readFileSync(f, 'utf8')
  for (let i = s.indexOf('{{'); i !== -1; i = s.indexOf('{{', i + 2)) {
    if (i === 0 || s[i - 1] !== '`') {
      fail(`${f} carries an unquoted {{slot}} marker at offset ${i} — skills ship slot-free (a backtick-quoted \`{{slot}}\` documentation mention is allowed)`)
      break
    }
  }
}
console.log('  ✓ slot hygiene: no unquoted {{slot}} markers in skills')

// ---- 4. review-angle registry ↔ file bijection + front-matter conformance ---
// Review angles are a materialized library: one file per angle under
// plugins/materia/scaffold/.materia/review-angles/, and MATERIA.md § Review
// angles (columns Angle | File | Gate | Tier) is the registry. The user repo's
// materialized .materia/ is NOT check-docs-scanned, so THIS is the only
// mechanical guard against registry↔file drift. Pins a strict bijection plus
// front-matter conformance:
//  - every registry row's File names an existing angle file;
//  - every angle file (except README.md) has exactly one registry row — no
//    orphan file, no duplicate rows for one file;
//  - each row's Angle slug equals its File stem;
//  - each angle file carries `---`…`---` YAML front matter whose ONLY keys are
//    `name` + `description`, with name == filename stem (transitively == the
//    registry Angle slug) and a non-empty description. A stray gate:/tier:/
//    category: key is the exact "gate lives in the registry, not the file"
//    violation and fails here.
const ANGLE_DIR = 'plugins/materia/scaffold/.materia/review-angles'
{
  const before = failures
  const src = readFileSync('plugins/materia/scaffold/MATERIA.md', 'utf8')
  // Slice the ## Review angles section body so we parse ONLY its registry table
  // (the § Skill routing table also has `slug` | `value` rows we must not read).
  const lines = src.split('\n')
  let start = -1, end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (/^## Review angles\s*$/.test(lines[i])) start = i
    else if (start !== -1 && /^## /.test(lines[i])) { end = i; break }
  }
  const section = start === -1 ? '' : lines.slice(start, end).join('\n')
  if (start === -1) fail('review-angle registry: MATERIA.md has no `## Review angles` section')
  // Registry data rows: | `angle` | `file` | ... | (header/separator have no
  // backticks). Fail CLOSED: any table row in the slice that is not the header
  // or separator MUST have backticked Angle+File cells — a bare row (e.g. a
  // hand-appended `| a11y | a11y.md | … |`) would otherwise be silently skipped,
  // escaping every check below (the exact drift this guard exists to catch).
  const rows = []
  for (const ln of section.split('\n')) {
    if (!/^\|/.test(ln)) continue // not a table row
    if (/^\|\s*-+\s*\|/.test(ln)) continue // separator |---|---|
    if (/^\|\s*Angle\s*\|/.test(ln)) continue // header
    const m = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(ln)
    if (!m) { fail(`review-angle registry: malformed row "${ln.trim()}" — the Angle and File cells must be backticked (\`slug\` | \`slug.md\`)`); continue }
    rows.push({ angle: m[1].trim(), file: m[2].trim() })
  }
  const angleFiles = readdirSync(ANGLE_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')
  const rowsByFile = new Map()
  for (const row of rows) {
    const stem = row.file.replace(/\.md$/, '')
    if (row.angle !== stem)
      fail(`review-angle registry: row Angle \`${row.angle}\` does not match its File stem \`${stem}\` — the Angle slug must equal the filename stem`)
    if (!existsSync(join(ANGLE_DIR, row.file)))
      fail(`review-angle registry: row \`${row.angle}\` names File \`${row.file}\` but ${ANGLE_DIR}/${row.file} does not exist`)
    if (!rowsByFile.has(row.file)) rowsByFile.set(row.file, [])
    rowsByFile.get(row.file).push(row.angle)
  }
  for (const [file, angles] of rowsByFile)
    if (angles.length > 1)
      fail(`review-angle registry: File \`${file}\` is named by ${angles.length} registry rows (${angles.join(', ')}) — exactly one row per file`)
  for (const f of angleFiles)
    if (!rowsByFile.has(f))
      fail(`review-angle registry: ${ANGLE_DIR}/${f} has no § Review angles row — every angle file needs exactly one registry row`)
  // Front-matter conformance, per angle file on disk.
  for (const f of angleFiles.sort()) {
    const stem = f.replace(/\.md$/, '')
    const raw = readFileSync(join(ANGLE_DIR, f), 'utf8')
    const fm = /^---\n([\s\S]*?)\n---/.exec(raw)
    if (!fm) {
      fail(`review-angle front matter: ${ANGLE_DIR}/${f} has no \`---\`…\`---\` YAML front matter (needs name + description)`)
      continue
    }
    const keys = new Map()
    for (const ln of fm[1].split('\n')) {
      if (!ln.trim()) continue
      if (/^\s/.test(ln)) continue // indented YAML continuation (folded/block scalar) — not a key
      const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(ln)
      if (!kv) { fail(`review-angle front matter: ${ANGLE_DIR}/${f} has a non key:value front-matter line: "${ln.trim()}"`); continue }
      keys.set(kv[1], kv[2].trim())
    }
    const extra = [...keys.keys()].filter((k) => k !== 'name' && k !== 'description')
    if (extra.length)
      fail(`review-angle front matter: ${ANGLE_DIR}/${f} has disallowed front-matter key(s) ${extra.map((k) => `\`${k}\``).join(', ')} — only \`name\` and \`description\` are allowed (Gate/Tier live in the § Review angles registry, not the file)`)
    if (!keys.has('name'))
      fail(`review-angle front matter: ${ANGLE_DIR}/${f} is missing the \`name\` key`)
    else if (keys.get('name') !== stem)
      fail(`review-angle front matter: ${ANGLE_DIR}/${f} has name \`${keys.get('name')}\` but must equal its filename stem \`${stem}\``)
    if (!keys.has('description') || !keys.get('description'))
      fail(`review-angle front matter: ${ANGLE_DIR}/${f} is missing a non-empty \`description\``)
  }
  if (failures === before)
    console.log(`  ✓ review-angle registry: ${rows.length} rows ↔ ${angleFiles.length} files (bijection; Angle==File stem==name; name+description only)`)
}

// ---- 5. review-angle slot + link hygiene ------------------------------------
// The skills-only slot scan (§3) and direct-skills link check (§1b) both filter
// to plugins/materia/skills/, so a {{slot}} or a live [text](path) link in a
// verbatim-shipped angle file went uncaught. Angle files ship byte-for-byte via
// /materia:init, so hold them to the same hygiene: no unquoted {{slot}} markers,
// no live markdown links to repo-relative paths (backtick prose only; http(s)/
// mailto and ${CLAUDE_PLUGIN_ROOT} are exempt, mirroring §1b). Live-link syntax
// inside code fences or inline code is illustrative — blanked before the link
// scan. The {{slot}} scan follows §3's rule instead (a bare {{ fails unless
// backtick-adjacent; fences are NOT exempt), so it runs over the raw text.
{
  const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
  const INLINE_CODE = /`[^`]*`/g
  const LINK = /\[(?:[^[\]]|\[[^\]]*\])*\]\(([^)]+)\)/g
  const blankOut = (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, ' '))
  const before = failures
  const files = readdirSync(ANGLE_DIR).filter((f) => f.endsWith('.md')).sort()
  for (const f of files) {
    const raw = readFileSync(join(ANGLE_DIR, f), 'utf8')
    // Slot hygiene: same rule as §3 — a bare `{{` fails, a backtick-quoted
    // `{{slot}}` documentation mention is allowed.
    for (let i = raw.indexOf('{{'); i !== -1; i = raw.indexOf('{{', i + 2)) {
      if (i === 0 || raw[i - 1] !== '`') {
        fail(`review-angle slot hygiene: ${ANGLE_DIR}/${f} carries an unquoted {{slot}} marker at offset ${i} — angle files ship verbatim and must be slot-free (a backtick-quoted \`{{slot}}\` mention is allowed)`)
        break
      }
    }
    // Link hygiene: scan with fences + inline code blanked out.
    const code = blankOut(blankOut(raw, FENCE), INLINE_CODE)
    for (const m of code.matchAll(LINK)) {
      const path = m[1].split('#')[0].trim()
      if (/^(https?:|mailto:)/.test(path)) continue
      if (path.includes('CLAUDE_PLUGIN_ROOT')) continue // runtime cache token, not repo-relative
      fail(`review-angle link hygiene: ${ANGLE_DIR}/${f} has a live markdown link \`${m[0].trim()}\` — angle files must use backtick prose for repo-relative paths, not live links`)
    }
  }
  if (failures === before)
    console.log(`  ✓ review-angle hygiene: no unquoted {{slot}} markers or live repo-relative links in ${files.length} angle-dir files`)
}

// ---- 5b. marketplace.json shape check ---------------------------------------
// .claude-plugin/marketplace.json is the install-critical catalog `/plugin
// marketplace add` reads to resolve `materia@materia` — nothing on stock CI
// actually parses it today: the `claude plugin validate` step in
// .github/workflows/validate.yml only runs if the `claude` CLI happens to be on
// the runner (it usually isn't) and is continue-on-error even when it does. Give
// it a small fail-close shape check here instead: it parses as a JSON object,
// `plugins` is a non-empty array, every entry's `source` resolves to a real
// directory on disk (relative to the repo root, matching how `/plugin
// marketplace add` resolves it), and the `materia` entry exists with a `name`
// that agrees with the plugin manifest its `source` points at — so a broken/
// renamed source or a name drift between the two manifests fails CI instead of
// only surfacing at install time.
{
  const before = failures
  const MKT = '.claude-plugin/marketplace.json'
  const isDir = (p) => existsSync(p) && statSync(p).isDirectory()
  let mkt
  try { mkt = JSON.parse(readFileSync(MKT, 'utf8')) }
  catch (e) { mkt = undefined; fail(`${MKT}: not valid JSON — ${e.message}`) }
  if (mkt !== undefined && (mkt === null || typeof mkt !== 'object' || Array.isArray(mkt)))
    fail(`${MKT}: must be a JSON object`)
  else if (mkt) {
    if (!Array.isArray(mkt.plugins) || mkt.plugins.length === 0) {
      fail(`${MKT}: plugins must be a non-empty array`)
    } else {
      for (const [i, p] of mkt.plugins.entries()) {
        const where = `${MKT}: plugins[${i}]`
        if (!p || typeof p !== 'object' || Array.isArray(p)) { fail(`${where}: must be an object`); continue }
        if (typeof p.source !== 'string' || !p.source) { fail(`${where}: source must be a non-empty string`); continue }
        if (!isDir(resolve(p.source)))
          fail(`${where}: source "${p.source}" does not resolve to an existing directory (resolved: ${resolve(p.source)})`)
      }
      const materiaEntry = mkt.plugins.find((p) => p && p.name === 'materia')
      if (!materiaEntry) {
        fail(`${MKT}: no plugins[] entry named "materia"`)
      } else {
        const pluginManifest = join(resolve(materiaEntry.source ?? 'plugins/materia'), '.claude-plugin/plugin.json')
        if (!existsSync(pluginManifest)) {
          fail(`${MKT}: materia entry's source has no manifest at ${pluginManifest}`)
        } else {
          let pm = null
          try { pm = JSON.parse(readFileSync(pluginManifest, 'utf8')) }
          catch (e) { fail(`${pluginManifest}: not valid JSON — ${e.message}`) }
          if (pm && pm.name !== materiaEntry.name)
            fail(`${MKT}: materia entry name "${materiaEntry.name}" != ${pluginManifest} name "${pm.name}"`)
        }
      }
    }
  }
  if (failures === before)
    console.log('  ✓ marketplace.json shape: parses; plugins non-empty; sources resolve to real directories; materia entry name agrees with plugin.json')
}

// ---- pure release-ledger linter (shared by §6 and its §6b negative tests) ---
// Operates on ALREADY-PARSED objects (no fs), so §6 runs it on the real shipped ledger
// AND §6b runs it on synthetic bad ledgers to prove each rule fail-closes — the coverage
// a validator that only ever sees good data can't give. Inputs:
//   latest    parsed latest.json (or null)
//   versions  [{ stem, obj }] — stem = filename without .json (for the semver + monotonic
//             checks that need the version string); obj = the parsed version file
//   knownCheckIds / knownMigrationIds — the authoritative id lists exported by the contract
//             lib, so a ledger doctorChecks/migrations id naming no real check/handler is
//             caught (unless the change ships a manualMigration plan).
// Returns string[] of human-readable errors (empty === clean). The fs-coupled checks
// (pluginVersion == filename stem, latestVersionFile resolves on disk) stay in §6.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const semverCore = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null }
const semverCmp = (a, b) => { const x = semverCore(a), y = semverCore(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 }
const LEDGER_IMPACTS = ['none', 'doctor-only', 'optional', 'recommended', 'required', 'breaking']
const lintLedger = ({ latest, versions, knownCheckIds, knownMigrationIds }) => {
  const errs = []
  const push = (m) => errs.push(m)
  const isInt = (n) => typeof n === 'number' && Number.isInteger(n)
  const isStr = (s) => typeof s === 'string' && s.length > 0
  const kChecks = new Set(knownCheckIds)
  const kMigs = new Set(knownMigrationIds)

  // latest-level: semver, and the pointed version file is one we actually have.
  if (latest && latest.pluginVersion !== undefined && !SEMVER_RE.test(String(latest.pluginVersion)))
    push(`latest.json: pluginVersion "${latest.pluginVersion}" is not valid semver (X.Y.Z)`)
  if (latest && isStr(latest.latestVersionFile) &&
      !versions.some((v) => `versions/${v.stem}.json` === latest.latestVersionFile))
    push(`latest.json: latestVersionFile "${latest.latestVersionFile}" names no known version file`)

  for (const { stem, obj } of versions) {
    const rel = `versions/${stem}.json`
    if (isStr(obj.pluginVersion) && !SEMVER_RE.test(obj.pluginVersion))
      push(`${rel}: pluginVersion "${obj.pluginVersion}" is not valid semver (X.Y.Z)`)
    const changes = Array.isArray(obj.changes) ? obj.changes : []
    const seenIds = new Set()
    for (const [i, ch] of changes.entries()) {
      const where = `${rel} changes[${i}]`
      if (ch === null || typeof ch !== 'object' || Array.isArray(ch)) { push(`${where}: change must be an object`); continue }
      if (!isStr(ch.id)) push(`${where}: id must be a non-empty string`)
      else if (seenIds.has(ch.id)) push(`${where}: duplicate change id "${ch.id}"`)
      else seenIds.add(ch.id)
      if (!isStr(ch.summary)) push(`${where}: summary must be a non-empty string`)
      if (!LEDGER_IMPACTS.includes(ch.impact)) push(`${where}: impact "${ch.impact}" is not one of ${LEDGER_IMPACTS.join(', ')}`)
      if (!Array.isArray(ch.surfaces) || !ch.surfaces.every(isStr))
        push(`${where}: surfaces must be an array of non-empty strings`)
      else if (ch.impact !== 'none' && ch.surfaces.length === 0)
        push(`${where}: surfaces must be non-empty when impact is not "none"`)
      if (typeof ch.detectable !== 'boolean') push(`${where}: detectable must be a boolean`)
      if (typeof ch.migratable !== 'boolean') push(`${where}: migratable must be a boolean`)
      // doctorChecks / migrations: arrays of unique non-empty strings when present.
      for (const key of ['doctorChecks', 'migrations']) {
        if (ch[key] === undefined) continue
        if (!Array.isArray(ch[key]) || !ch[key].every(isStr)) { push(`${where}: ${key} must be an array of non-empty strings`); continue }
        if (new Set(ch[key]).size !== ch[key].length) push(`${where}: ${key} has duplicate ids`)
      }
      if (ch.manualMigration !== undefined && !isStr(ch.manualMigration))
        push(`${where}: manualMigration, when present, must be a non-empty string`)
      if (ch.detectionNotes !== undefined && !isStr(ch.detectionNotes))
        push(`${where}: detectionNotes, when present, must be a non-empty string`)
      // detectable ⇒ a doctor check declares the drift; not-detectable ⇒ say why not.
      if (ch.detectable === true && !(Array.isArray(ch.doctorChecks) && ch.doctorChecks.length))
        push(`${where}: detectable is true but no doctorChecks declare how the drift is detected`)
      if (ch.detectable === false && !isStr(ch.detectionNotes))
        push(`${where}: detectable is false but no detectionNotes explain why it cannot be detected`)
      // doctorChecks resolve to real /materia:doctor checks.
      if (Array.isArray(ch.doctorChecks))
        for (const id of ch.doctorChecks)
          if (isStr(id) && !kChecks.has(id))
            push(`${where}: doctorChecks id "${id}" is not a known /materia:doctor check`)
      // migrations resolve to an implemented handler OR the change ships a manual plan.
      if (Array.isArray(ch.migrations))
        for (const id of ch.migrations)
          if (isStr(id) && !kMigs.has(id) && !isStr(ch.manualMigration))
            push(`${where}: migrations id "${id}" has no implemented handler and the change declares no manualMigration plan`)
      // migratable ⇒ there is an adoption path (automated ids or a manual plan).
      if (ch.migratable === true && !(Array.isArray(ch.migrations) && ch.migrations.length) && !isStr(ch.manualMigration))
        push(`${where}: migratable is true but declares neither migrations nor a manualMigration plan`)
      // non-migratable required/breaking ⇒ manual instructions are mandatory.
      if ((ch.impact === 'required' || ch.impact === 'breaking') && ch.migratable === false && !isStr(ch.manualMigration))
        push(`${where}: impact "${ch.impact}" is not migratable and must include manualMigration instructions`)
    }
  }

  // artifactSchema monotonic non-decreasing across versions ordered by REAL semver (not
  // lexical — 0.10.0 must sort after 0.2.0): multiple plugin versions may share a schema,
  // but it must never go backward. Encodes "artifact schema ≠ plugin semver, but
  // comparable + monotonic".
  const ordered = versions
    .filter((v) => semverCore(v.obj.pluginVersion) && isInt(v.obj.artifactSchema))
    .sort((a, b) => semverCmp(a.obj.pluginVersion, b.obj.pluginVersion))
  for (let i = 1; i < ordered.length; i++)
    if (ordered[i].obj.artifactSchema < ordered[i - 1].obj.artifactSchema)
      push(`release: artifactSchema is non-monotonic — ${ordered[i - 1].obj.pluginVersion} has ${ordered[i - 1].obj.artifactSchema} but later ${ordered[i].obj.pluginVersion} has ${ordered[i].obj.artifactSchema} (must be non-decreasing by plugin semver)`)

  // latest.json must point at the NEWEST release, and its artifactSchema must be the
  // MAX across all versions/*.json — a lagging pointer/schema would pass every check
  // above yet make doctor/migrate misjudge a genuinely-current repo as behind (or, if
  // the drift ran the other way, "from the future"/blocked). Derive "newest" via REAL
  // semver order (semverCmp on semverCore), never lexical sort — 0.10.0 must sort after
  // 0.2.0, exactly the bug lexical `versionFiles.sort()` would reintroduce here.
  const bySemver = versions
    .filter((v) => semverCore(v.obj.pluginVersion))
    .sort((a, b) => semverCmp(a.obj.pluginVersion, b.obj.pluginVersion))
  if (latest && bySemver.length) {
    const newest = bySemver[bySemver.length - 1]
    const wantFile = `versions/${newest.stem}.json`
    if (isStr(latest.latestVersionFile) && latest.latestVersionFile !== wantFile)
      push(`latest.json: latestVersionFile "${latest.latestVersionFile}" does not point at the newest version by semver (${newest.obj.pluginVersion}, expected "${wantFile}")`)
    const schemaInts = versions.map((v) => v.obj.artifactSchema).filter(isInt)
    if (isInt(latest.artifactSchema) && schemaInts.length) {
      const maxSchema = Math.max(...schemaInts)
      if (latest.artifactSchema !== maxSchema)
        push(`latest.json: artifactSchema ${latest.artifactSchema} != max artifactSchema across versions/*.json (${maxSchema})`)
    }
  }

  return errs
}

// ---- 6. release ledger + project-state sanity -------------------------------
// Basic JSON parse + coherence sanity for the release/migration ledger
// (plugins/materia/release/) and the scaffold's project-state artifact. This is
// v0: it asserts internal consistency of the SHIPPED data only. This section
// validates the doctorChecks / migrations IDs for SHAPE (non-empty, unique) and
// does NOT resolve them against the actual scripts — that behavioral coverage
// lives in §7 (doctor) and §8 (migrate), which spawn the shipped scripts. The
// split is deliberate: §6 guards the data contract, §7/§8 the tools. The one
// invariant that earns its
// keep: the artifact schema is declared in three places — release/latest.json,
// the pointed-to versions/*.json, and scaffold/.materia/project.json — and they
// must agree; a silent drift between them is exactly the contract break a future
// doctor/migrate would trust. That coupling is guarded here.
{
  const before = failures
  const REL = 'plugins/materia/release'
  const isInt = (n) => typeof n === 'number' && Number.isInteger(n)
  const isStr = (s) => typeof s === 'string' && s.length > 0
  const parseJson = (f) => {
    let v
    try { v = JSON.parse(readFileSync(f, 'utf8')) }
    catch (e) { fail(`${f}: not valid JSON — ${e.message}`); return null }
    if (v === null || typeof v !== 'object' || Array.isArray(v)) { fail(`${f}: must be a JSON object`); return null }
    return v
  }

  const plugin = parseJson('plugins/materia/.claude-plugin/plugin.json')
  const latest = parseJson(join(REL, 'latest.json'))
  if (plugin && latest) {
    if (latest.pluginVersion !== plugin.version)
      fail(`release/latest.json pluginVersion "${latest.pluginVersion}" != plugin.json version "${plugin.version}"`)
    if (!isInt(latest.artifactSchema))
      fail(`release/latest.json artifactSchema must be an integer (got ${JSON.stringify(latest.artifactSchema)})`)
    if (!isStr(latest.latestVersionFile))
      fail(`release/latest.json latestVersionFile must be a non-empty string`)
    else if (!latest.latestVersionFile.startsWith('versions/'))
      fail(`release/latest.json latestVersionFile "${latest.latestVersionFile}" must point into versions/`)
    else if (!existsSync(join(REL, latest.latestVersionFile)))
      fail(`release/latest.json latestVersionFile "${latest.latestVersionFile}" does not resolve under ${REL}/`)
  }

  // Every versions/*.json: parse + fs-coupled top-level shape; collect for lint + coherence.
  const versionsDir = join(REL, 'versions')
  const versionFiles = existsSync(versionsDir)
    ? readdirSync(versionsDir).filter((f) => f.endsWith('.json')).sort()
    : (fail(`${versionsDir} does not exist`), [])
  const parsedVersions = new Map() // "versions/x.json" -> parsed object
  const versionsForLint = []       // { stem, obj } handed to the pure ledger linter
  for (const vf of versionFiles) {
    const rel = `versions/${vf}`
    const obj = parseJson(join(REL, rel))
    if (!obj) continue
    parsedVersions.set(rel, obj)
    const stem = vf.replace(/\.json$/, '')
    versionsForLint.push({ stem, obj })
    // fs-coupled top-level shape stays here (needs the filename stem). The per-change
    // semantics, the version-string semver, id-resolution, and monotonic-schema rules
    // live in lintLedger (pure) so §6b can drive them with synthetic bad input.
    if (!isStr(obj.pluginVersion)) fail(`${rel}: pluginVersion must be a non-empty string`)
    else if (obj.pluginVersion !== stem) fail(`${rel}: pluginVersion "${obj.pluginVersion}" must equal the filename stem "${stem}"`)
    if (!isInt(obj.artifactSchema)) fail(`${rel}: artifactSchema must be an integer`)
    if (!Array.isArray(obj.changes)) fail(`${rel}: changes must be an array`)
  }
  // Pure ledger-data lint on the REAL shipped ledger: semver, monotonic schema, per-change
  // semantics, and doctorChecks/migrations id resolution against the authoritative lists.
  // §6b proves the same function REJECTS bad input.
  for (const e of lintLedger({ latest, versions: versionsForLint, knownCheckIds: KNOWN_CHECK_IDS, knownMigrationIds: KNOWN_MIGRATION_IDS }))
    fail(e)

  // Scaffold project-state artifact shape.
  const scaffoldState = parseJson('plugins/materia/scaffold/.materia/project.json')
  if (scaffoldState) {
    if (!isInt(scaffoldState.artifactSchema)) fail(`scaffold .materia/project.json: artifactSchema must be an integer`)
    if (!Array.isArray(scaffoldState.appliedMigrations)) fail(`scaffold .materia/project.json: appliedMigrations must be an array`)
    if (!isStr(scaffoldState.source)) fail(`scaffold .materia/project.json: source must be a non-empty string`)
  }

  // Coherence coupling: latest ↔ pointed version file ↔ scaffold project.json.
  if (latest && isInt(latest.artifactSchema)) {
    const pointed = latest.latestVersionFile ? parsedVersions.get(latest.latestVersionFile) : null
    if (pointed) {
      if (pointed.artifactSchema !== latest.artifactSchema)
        fail(`release: latest.artifactSchema (${latest.artifactSchema}) != ${latest.latestVersionFile} artifactSchema (${pointed.artifactSchema})`)
      if (pointed.pluginVersion !== latest.pluginVersion)
        fail(`release: latest.pluginVersion (${latest.pluginVersion}) != ${latest.latestVersionFile} pluginVersion (${pointed.pluginVersion})`)
    }
    if (scaffoldState && isInt(scaffoldState.artifactSchema) && scaffoldState.artifactSchema !== latest.artifactSchema)
      fail(`release: scaffold .materia/project.json artifactSchema (${scaffoldState.artifactSchema}) != latest.artifactSchema (${latest.artifactSchema})`)
  }

  // Fixture pins: tracked carries a schema-3 project.json (the current tracked shape);
  // legacy carries none (its defining trait — the absence a future doctor keys on).
  const trackedState = 'tests/fixtures/materia/tracked-current-project/.materia/project.json'
  if (!existsSync(trackedState)) fail(`fixture: ${trackedState} must exist (tracked shape)`)
  else { const t = parseJson(trackedState); if (t && t.artifactSchema !== 3) fail(`fixture: ${trackedState} artifactSchema must be 3 (current tracked shape)`) }
  const legacyState = 'tests/fixtures/materia/legacy-0.1.0-project/.materia/project.json'
  if (existsSync(legacyState)) fail(`fixture: ${legacyState} must NOT exist — the legacy fixture's defining trait is the absence of project state`)

  if (failures === before)
    console.log(`  ✓ release ledger + project-state sanity: ${versionFiles.length} version file(s); latest↔versions↔scaffold coherent; fixtures pinned`)
}

// ---- 6b. lintLedger negative coverage ---------------------------------------
// §6 asserts the SHIPPED ledger lints clean; here we prove each lintLedger rule
// FAIL-CLOSES on crafted bad input — the coverage a validator that only ever sees good
// data can't give. Pure + in-memory (no fixtures on disk): a `goodChange` builder yields
// a valid change, each case mutates ONE thing and asserts the matching error surfaces.
{
  const before = failures
  const kChecks = KNOWN_CHECK_IDS
  const kMigs = KNOWN_MIGRATION_IDS
  const goodChange = () => ({
    id: 'x-change', summary: 'a change', impact: 'recommended',
    surfaces: ['scaffold'], detectable: true, migratable: true,
    doctorChecks: [kChecks[0]], migrations: [kMigs[0]], manualMigration: 'adopt by hand',
  })
  // A one-version ledger whose sole change is `ch`, with a latest that points at it.
  const ledger = (changes, over = {}) => ({
    latest: over.latest ?? { pluginVersion: '0.2.0', artifactSchema: 2, latestVersionFile: 'versions/0.2.0.json' },
    versions: [{ stem: '0.2.0', obj: { pluginVersion: '0.2.0', artifactSchema: 2, changes } }, ...(over.extraVersions ?? [])],
    knownCheckIds: kChecks, knownMigrationIds: kMigs,
  })
  const expect = (label, input, needle) => {
    const errs = lintLedger(input)
    if (!errs.some((e) => e.includes(needle)))
      fail(`lintLedger negative [${label}]: expected an error containing "${needle}"; got ${JSON.stringify(errs)}`)
  }
  // Sanity: the baseline good ledger lints clean, else the negatives prove nothing.
  const baseErrs = lintLedger(ledger([goodChange()]))
  if (baseErrs.length) fail(`lintLedger negative: baseline good ledger did not lint clean — ${JSON.stringify(baseErrs)}`)

  expect('invalid-impact', ledger([{ ...goodChange(), impact: 'sideways' }]), 'is not one of')
  expect('missing-latest-target', ledger([goodChange()], { latest: { pluginVersion: '0.2.0', artifactSchema: 2, latestVersionFile: 'versions/9.9.9.json' } }), 'latestVersionFile')
  expect('bad-semver', { latest: { pluginVersion: '0.2.0', artifactSchema: 2, latestVersionFile: 'versions/v2.json' }, versions: [{ stem: 'v2', obj: { pluginVersion: 'v2', artifactSchema: 2, changes: [goodChange()] } }], knownCheckIds: kChecks, knownMigrationIds: kMigs }, 'semver')
  expect('non-monotonic', ledger([goodChange()], { extraVersions: [{ stem: '0.3.0', obj: { pluginVersion: '0.3.0', artifactSchema: 1, changes: [] } }] }), 'non-monotonic')
  expect('detectable-no-check', ledger([{ ...goodChange(), detectable: true, doctorChecks: [] }]), 'doctorChecks')
  expect('undetectable-no-notes', ledger([{ ...goodChange(), detectable: false, doctorChecks: undefined }]), 'detectionNotes')
  expect('unknown-doctor-check', ledger([{ ...goodChange(), doctorChecks: ['no-such-check'] }]), 'not a known')
  expect('unresolved-migration', ledger([{ ...goodChange(), migrations: ['no-handler'], manualMigration: undefined }]), 'no implemented handler')
  expect('migratable-no-path', ledger([{ ...goodChange(), migratable: true, migrations: [], manualMigration: undefined }]), 'migratable is true')
  expect('required-nonmigratable-no-manual', ledger([{ ...goodChange(), impact: 'required', migratable: false, migrations: [], manualMigration: undefined }]), 'must include manualMigration')
  expect('surfaces-empty', ledger([{ ...goodChange(), surfaces: [] }]), 'surfaces must be non-empty')
  expect('dup-change-id', ledger([goodChange(), goodChange()]), 'duplicate change id')
  // latest.json must point at the semver-NEWEST version file — a lagging pointer (here,
  // latest points at 0.2.0 while a newer 0.3.0 exists) must fail even though 0.2.0.json
  // itself resolves fine and schemas stay monotonic.
  expect('latest-not-newest', ledger([goodChange()], {
    latest: { pluginVersion: '0.2.0', artifactSchema: 2, latestVersionFile: 'versions/0.2.0.json' },
    extraVersions: [{ stem: '0.3.0', obj: { pluginVersion: '0.3.0', artifactSchema: 2, changes: [] } }],
  }), 'does not point at the newest version')
  // latest.json points at the newest version file (0.3.0) but understates its
  // artifactSchema (2 instead of the true max, 3) — must fail even though the
  // "points at newest" rule above is satisfied.
  expect('artifact-schema-not-max', ledger([goodChange()], {
    latest: { pluginVersion: '0.3.0', artifactSchema: 2, latestVersionFile: 'versions/0.3.0.json' },
    extraVersions: [{ stem: '0.3.0', obj: { pluginVersion: '0.3.0', artifactSchema: 3, changes: [] } }],
  }), '!= max artifactSchema')

  if (failures === before)
    console.log('  ✓ lintLedger negatives: 14 rule violations each fail-close (baseline good ledger lints clean)')
}

// ---- 7. /materia:doctor deterministic behavior ------------------------------
// Spawn the shipped doctor script (plugins/materia/scripts/doctor.mjs) against
// the committed fixtures + synthetic temp cases and pin its JSON verdict. This
// proves doctor recognizes a tracked-current project as `healthy`, a
// pre-tracking legacy install as `warnings` (untracked-legacy, the ledger's
// recommended drift, migrate suggested), a malformed project-state as `blocked`,
// and a non-Materia repo as `unknown` WITHOUT inventing state. Deterministic —
// no network/AI. The non-Materia + malformed cases use mkdtemp so they never
// become committed fixtures (§6 pins the committed fixture shapes: legacy must
// carry NO project.json). Assertions key on the JSON `status` + report fields;
// exit code is checked secondarily.
{
  const before = failures
  const DOCTOR = resolve('plugins/materia/scripts/doctor.mjs')
  const runDoctor = (target) => {
    const r = spawnSync('node', [DOCTOR, target, '--json'], { encoding: 'utf8' })
    let report = null
    try { report = JSON.parse(r.stdout) } catch { /* leave null; asserted below */ }
    return { r, report }
  }
  const want = (rep, field, expected) =>
    rep[field] === expected ? [] : [`${field}=${JSON.stringify(rep[field])} (want ${JSON.stringify(expected)})`]
  const exitWant = (r, code) => (r.status === code ? [] : [`exit=${r.status} (want ${code})`])
  // Assert a named check's severity in the emitted report.checks array.
  const checkOf = (rep, id) => (rep.checks ?? []).find((c) => c.id === id) ?? null
  const sevWant = (rep, id, sev) => {
    const c = checkOf(rep, id)
    return c && c.severity === sev ? [] : [`check ${id} severity=${JSON.stringify(c && c.severity)} (want ${JSON.stringify(sev)})`]
  }
  // Assert a named check's detail carries a substring (pins honesty wording).
  const detailWant = (rep, id, substr) => {
    const c = checkOf(rep, id)
    return c && String(c.detail).includes(substr) ? [] : [`check ${id} detail lacks ${JSON.stringify(substr)}`]
  }
  const check = (label, target, assertFn) => {
    const { r, report } = runDoctor(target)
    if (!report) {
      fail(`doctor [${label}]: emitted no parseable JSON (exit ${r.status}); stderr: ${(r.stderr || '').slice(0, 200)}`)
      return
    }
    const problems = assertFn(report, r)
    if (problems.length) fail(`doctor [${label}]: ${problems.join('; ')}`)
  }

  // tracked-current fixture -> healthy, schema 3, gate script at canonical location,
  // nothing outstanding
  check('tracked-current', resolve('tests/fixtures/materia/tracked-current-project'), (rep, r) => [
    ...want(rep, 'status', 'healthy'),
    ...want(rep, 'materiaEnabled', true),
    ...want(rep, 'currentSchema', 3),
    ...want(rep, 'suggestedNextCommand', null),
    ...sevWant(rep, 'check-docs-sh-present', 'ok'),  // fixture ships the gate-script stub…
    ...sevWant(rep, 'check-docs-sh-location', 'ok'), // …at the canonical .materia/scripts/ location
    ...detailWant(rep, 'check-docs-sh-location', '.materia/scripts/check-docs.sh'),
    // Healthy-path honesty: even a green report must say what "current" certifies.
    ...detailWant(rep, 'artifact-schema-current', 'certifies only .materia/project.json'),
    ...exitWant(r, 0),
  ])

  // Healthy-path honesty in the HUMAN rendering too: the "Suggested next: none"
  // default must carry the certifies-only-project.json caveat (doctor.mjs).
  {
    const r = spawnSync('node', [DOCTOR, resolve('tests/fixtures/materia/tracked-current-project')], { encoding: 'utf8' })
    if (!r.stdout.includes('Schema currency certifies only that file'))
      fail('doctor [tracked-current, human]: healthy rendering lacks the schema-currency honesty caveat')
  }

  // KNOWN_CHECK_IDS honesty pin (bidirectional). The tracked-current path emits ALL
  // KNOWN_CHECK_IDS checks in one run (present ∧ parsed ∧ known ∧ current), so the ids it
  // emits must set-EQUAL KNOWN_CHECK_IDS — catching both a MISSING id (list forgets a check)
  // and a BOGUS EXTRA id (list invents one the ledger's doctorChecks rule would then
  // wrongly trust). Keeps the exported list honest against what inspect() really emits.
  {
    const { report } = runDoctor(resolve('tests/fixtures/materia/tracked-current-project'))
    const emitted = new Set((report?.checks ?? []).map((c) => c.id))
    const missing = KNOWN_CHECK_IDS.filter((id) => !emitted.has(id))
    const extra = [...emitted].filter((id) => !KNOWN_CHECK_IDS.includes(id))
    if (missing.length || extra.length)
      fail(`KNOWN_CHECK_IDS drift vs doctor's emitted ids (tracked-current) — missing: [${missing}], extra: [${extra}]`)
  }

  // legacy 0.1.0 fixture -> warnings (the adopted-drift-filter carrier). It carries a
  // ROOT check-docs.sh stub, so check-docs-sh-present is `ok` and the required
  // 0.3.0-check-docs-sh-gate entry is FILTERED as already-adopted -> requiredChanges is
  // EMPTY. check-docs-sh-location is `warning` (root-only), so the recommended
  // 0.3.0-scripts-relocation entry stays, alongside the recommended untracked-legacy
  // adoption. Nothing escalates past `warnings`.
  check('legacy-0.1.0', resolve('tests/fixtures/materia/legacy-0.1.0-project'), (rep, r) => [
    ...want(rep, 'status', 'warnings'),
    ...want(rep, 'materiaEnabled', true),
    ...want(rep, 'currentSchema', 'untracked-legacy'),
    ...want(rep, 'missing', true),
    ...want(rep, 'suggestedNextCommand', '/materia:migrate --plan'),
    ...sevWant(rep, 'check-docs-sh-present', 'ok'),       // fixture ships a ROOT gate-script stub
    ...sevWant(rep, 'check-docs-sh-location', 'warning'), // …but at the legacy root location
    // Adopted-drift filter: the required gate entry is filtered (presence ok) -> EMPTY.
    ...(rep.requiredChanges.length === 0 ? [] : [`requiredChanges must be empty (gate entry adopted-away), got ${JSON.stringify(rep.requiredChanges.map((c) => c.id))}`]),
    ...(rep.recommendedChanges.some((c) => c.id === '0.2.0-project-state-file')
      ? [] : ['recommendedChanges missing 0.2.0-project-state-file']),
    ...(rep.recommendedChanges.some((c) => c.id === '0.3.0-scripts-relocation')
      ? [] : ['recommendedChanges missing 0.3.0-scripts-relocation (location warning -> not filtered)']),
    ...exitWant(r, 0),
  ])

  // gnarly legacy fixture -> a REAL early dogfood repo: untracked-legacy AND missing
  // the check-docs gate at BOTH locations (the required-drift carrier). Proves (1)
  // status is `action-needed` (exit 1) — the required 0.3.0-check-docs-sh-gate drift
  // (NOT filtered, since check-docs-sh-present is `warning`) escalates past the
  // recommended untracked-legacy adoption; (2) the gate entry lands in requiredChanges;
  // (3) the honest caveat that schema currency certifies ONLY .materia/project.json is
  // surfaced (pinned via the project-state-present check detail, the stable short pin).
  check('gnarly-legacy', resolve('tests/fixtures/materia/gnarly-legacy-project'), (rep, r) => [
    ...want(rep, 'status', 'action-needed'),
    ...want(rep, 'materiaEnabled', true),
    ...want(rep, 'currentSchema', 'untracked-legacy'),
    ...want(rep, 'missing', true),
    ...want(rep, 'suggestedNextCommand', '/materia:migrate --plan'),
    ...sevWant(rep, 'check-docs-sh-present', 'warning'), // no check-docs.sh at either location
    ...(rep.requiredChanges.some((c) => c.id === '0.3.0-check-docs-sh-gate')
      ? [] : ['requiredChanges missing 0.3.0-check-docs-sh-gate (required gate drift not filtered)']),
    ...((checkOf(rep, 'project-state-present')?.detail ?? '').includes('only .materia/project.json')
      ? [] : ['honesty caveat "only .materia/project.json" missing from project-state-present detail']),
    ...exitWant(r, 1),
  ])

  // synthetic moved-but-unstamped repo -> the doctor↔migrate adopted-but-unstamped
  // bridge. Schema 2 in project.json but the gate script ALREADY at its canonical
  // .materia/scripts/check-docs.sh: both check-docs checks report `ok`, so the gate +
  // relocation changes are filtered as adopted, leaving only optional drift (sev info).
  // Doctor must stay `healthy` (exit 0) YET still suggest /materia:migrate --plan (the
  // stamp-only step migrate has left), and say so in the artifact-schema-current detail.
  // Runs against the REAL shipped ledger via the doctor CLI.
  {
    const mu = mkdtempSync(join(tmpdir(), 'materia-doctor-moved-'))
    try {
      mkdirSync(join(mu, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(mu, 'MATERIA.md'), '# m\n')
      writeFileSync(join(mu, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(mu, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 2, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      check('moved-but-unstamped', mu, (rep, r) => [
        ...want(rep, 'status', 'healthy'),
        ...want(rep, 'currentSchema', 2),
        ...want(rep, 'suggestedNextCommand', '/materia:migrate --plan'), // the bridge
        ...sevWant(rep, 'check-docs-sh-present', 'ok'),
        ...sevWant(rep, 'check-docs-sh-location', 'ok'),
        ...detailWant(rep, 'artifact-schema-current', 'adopted but unstamped'),
        ...(rep.requiredChanges.length === 0 && rep.recommendedChanges.length === 0
          ? [] : ['gate/relocation not filtered as adopted']),
        ...exitWant(r, 0),
      ])
    } finally { rmSync(mu, { recursive: true, force: true }) }
  }

  // synthetic non-Materia repo -> unknown, no invented state
  const nm = mkdtempSync(join(tmpdir(), 'materia-doctor-nm-'))
  try {
    writeFileSync(join(nm, 'README.md'), '# just a repo\n')
    check('non-materia', nm, (rep, r) => [
      ...want(rep, 'status', 'unknown'),
      ...want(rep, 'materiaEnabled', false),
      ...want(rep, 'suggestedNextCommand', null),
      ...(rep.recommendedChanges.length === 0 && rep.requiredChanges.length === 0 && rep.optionalChanges.length === 0
        ? [] : ['invented change entries for a non-Materia repo']),
      ...exitWant(r, 0),
    ])
  } finally { rmSync(nm, { recursive: true, force: true }) }

  // synthetic malformed project-state -> blocked (Materia-enabled, malformed)
  const mf = mkdtempSync(join(tmpdir(), 'materia-doctor-mf-'))
  try {
    mkdirSync(join(mf, '.materia'), { recursive: true })
    writeFileSync(join(mf, 'MATERIA.md'), '# m\n')
    writeFileSync(join(mf, '.materia', 'project.json'), '{ not valid json')
    check('malformed-state', mf, (rep, r) => [
      ...want(rep, 'status', 'blocked'),
      ...want(rep, 'materiaEnabled', true),
      ...want(rep, 'malformed', true),
      ...exitWant(r, 2),
    ])
  } finally { rmSync(mf, { recursive: true, force: true }) }

  // future/zero/negative schema -> blocked, exit 2. All three land in the same
  // artifact-schema-known structural branch of inspect() ("not a known integer"
  // for schema <= 0, "from the future" for schema > latest) — real CLI + a
  // synthetic temp target is enough; both branches read only the real shipped
  // ledger's latestSchema, so no synthetic ledger is needed here.
  for (const [label, schema] of [['future-schema', 99], ['zero-schema', 0], ['negative-schema', -1]]) {
    const dir = mkdtempSync(join(tmpdir(), `materia-doctor-${label}-`))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: schema, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      check(label, dir, (rep, r) => [
        ...want(rep, 'status', 'blocked'),
        ...want(rep, 'materiaEnabled', true),
        ...sevWant(rep, 'artifact-schema-known', 'blocked'),
        ...exitWant(r, 2),
      ])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // action-needed/exit-1 coverage: doctor.mjs resolves its ledger as the fixed
  // sibling ../release relative to the SCRIPT (`resolve(import.meta.dirname,
  // '../release')`, see doctor.mjs) — not CLI-overridable — so a synthetic
  // ledger can't be driven through the CLI the way the schema cases above are.
  // Import inspect() directly instead (the same pure function doctor.mjs and
  // migrate.mjs both call): point it at a synthetic releaseDir declaring a
  // `required`-impact change, and a synthetic stale tracked target whose schema
  // sits below it, and assert on the report + doctor.mjs's own status->exit map.
  {
    const relDir = mkdtempSync(join(tmpdir(), 'materia-doctor-ledger-'))
    const tgtDir = mkdtempSync(join(tmpdir(), 'materia-doctor-tgt-'))
    try {
      mkdirSync(join(relDir, 'versions'), { recursive: true })
      writeFileSync(join(relDir, 'latest.json'),
        JSON.stringify({ pluginVersion: '0.3.0', artifactSchema: 3, latestVersionFile: 'versions/0.3.0.json' }))
      writeFileSync(join(relDir, 'versions', '0.2.0.json'),
        JSON.stringify({ pluginVersion: '0.2.0', artifactSchema: 2, changes: [] }))
      writeFileSync(join(relDir, 'versions', '0.3.0.json'), JSON.stringify({
        pluginVersion: '0.3.0', artifactSchema: 3,
        changes: [{
          id: 'synthetic-required-change', summary: 'a required change', impact: 'required',
          surfaces: ['scaffold'], detectable: true, migratable: false, doctorChecks: [], manualMigration: 'do it by hand',
        }],
      }))
      mkdirSync(join(tgtDir, '.materia'), { recursive: true })
      writeFileSync(join(tgtDir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(tgtDir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 2, pluginVersion: '0.2.0', source: 'synthetic', appliedMigrations: [] }))

      const rep = inspect(tgtDir, relDir)
      const problems = [
        ...want(rep, 'status', 'action-needed'),
        ...(rep.requiredChanges.some((c) => c.id === 'synthetic-required-change')
          ? [] : ['requiredChanges missing synthetic-required-change']),
      ]
      // doctor.mjs's own status->exit map (`const EXIT = {...}` in doctor.mjs) is not
      // exported, so mirror it here AND textually pin that doctor.mjs's source still
      // maps action-needed -> 1 — a drift in either the mirror or the real map fails.
      const EXIT = { healthy: 0, warnings: 0, unknown: 0, 'action-needed': 1, blocked: 2 }
      if (!/['"]action-needed['"]:\s*1/.test(readFileSync(DOCTOR, 'utf8')))
        problems.push('doctor.mjs EXIT map no longer maps action-needed -> 1 (this test\'s mirror of it is stale)')
      if (EXIT[rep.status] !== 1)
        problems.push(`mirrored EXIT[${rep.status}]=${EXIT[rep.status]} (want 1)`)
      if (problems.length) fail(`doctor [synthetic-action-needed, via inspect()]: ${problems.join('; ')}`)
    } finally {
      rmSync(relDir, { recursive: true, force: true })
      rmSync(tgtDir, { recursive: true, force: true })
    }
  }

  if (failures === before)
    console.log('  ✓ doctor behavior: tracked→healthy(schema 3, location ok) · legacy→warnings(gate adopted-away→requiredChanges empty, relocation recommended) · gnarly→action-needed(exit 1, required gate drift) · moved-but-unstamped→healthy(+bridge suggests migrate) · non-materia→unknown · malformed→blocked · future/zero/negative-schema→blocked(exit 2) · synthetic required-change→action-needed(exit 1, via inspect())')
}

// ---- 8. /materia:migrate deterministic behavior -----------------------------
// Spawn the shipped migrate script (plugins/materia/scripts/migrate.mjs) and pin
// its plan/apply JSON. Migrate is PLAN-FIRST and its apply path MUTATES a target,
// so — unlike §7's mostly-read-only doctor cases — EVERY case runs on an mkdtemp
// COPY of a committed fixture (or a synthetic temp tree), including the plan
// cases: the committed fixtures are NEVER touched (the legacy fixture's
// project.json-absence is a §6 pin). What this proves: plan writes nothing; apply
// on a pre-tracking install creates EXACTLY .materia/project.json with the
// ledger-consistent state; re-apply is idempotent (byte-identical); an existing
// state — VALID-and-current, valid-but-stale, OR malformed — is never
// overwritten; a non-Materia repo gets no invented state; the structural manual
// branches (unknown / future schema) don't write; the exit code is 0 on every
// normal path; and doctor agrees the migrated repo is healthy (the doctor↔migrate
// consistency contract). Deterministic — no net/AI. (Migrate's OWN ledger
// tool-fault branch — status 'blocked', exit 2 — is knowingly NOT covered here:
// releaseDir is hardcoded relative to the script and isn't CLI-overridable, so
// exercising it would need a direct import of buildPlan/runApply with a bogus
// releaseDir rather than a CLI spawn; §6 already guards the ledger data itself.)
{
  const before = failures
  const MIGRATE = resolve('plugins/materia/scripts/migrate.mjs')
  const DOCTOR = resolve('plugins/materia/scripts/doctor.mjs')
  const runMigrate = (target, ...flags) => {
    const r = spawnSync('node', [MIGRATE, target, '--json', ...flags], { encoding: 'utf8' })
    let report = null
    try { report = JSON.parse(r.stdout) } catch { /* asserted below */ }
    return { r, report }
  }
  const exitWant = (r, code) => (r.status === code ? [] : [`exit=${r.status} (want ${code})`])
  // Snapshot a dir tree as a rel-path -> contents map, so "apply touched ONLY
  // .materia/project.json" and "plan/no-op mutated nothing" are provable, not
  // asserted. A leftover atomic-write temp file surfaces as an extra changed key.
  const snapshot = (root) => {
    const out = new Map()
    const walk = (p) => {
      for (const e of readdirSync(p, { withFileTypes: true })) {
        const fp = join(p, e.name)
        if (e.isDirectory()) walk(fp)
        else out.set(relative(root, fp), readFileSync(fp, 'utf8'))
      }
    }
    walk(root)
    return out
  }
  const diffKeys = (a, b) => {
    const changed = []
    for (const [k, v] of b) if (!a.has(k) || a.get(k) !== v) changed.push(k)
    for (const k of a.keys()) if (!b.has(k)) changed.push(`-${k}`)
    return changed
  }
  const copyFixture = (name) => {
    const dst = mkdtempSync(join(tmpdir(), `materia-migrate-${name}-`))
    cpSync(join('tests/fixtures/materia', name), dst, { recursive: true })
    return dst
  }
  // A synthetic Materia-enabled temp repo carrying the given project.json raw
  // text. Returns the dir; caller rmSync's it.
  const synthState = (label, rawStateText) => {
    const dir = mkdtempSync(join(tmpdir(), `materia-migrate-${label}-`))
    mkdirSync(join(dir, '.materia'), { recursive: true })
    writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
    writeFileSync(join(dir, '.materia', 'project.json'), rawStateText)
    return dir
  }

  // 1. PLAN on a COPY of the legacy fixture -> init-project-state AND install-check-docs
  //    both applicable; would create .materia/project.json + relocate the gate script;
  //    localEditsAffected is now TRUE (install-check-docs renames a legacy gate script —
  //    the first touchesExistingFiles exercise); writes NOTHING (snapshot diff). Runs on a
  //    copy (not the committed fixture) so a plan-mode write regression can never dirty
  //    the tracked tree, matching every other case here.
  {
    const work = copyFixture('legacy-0.1.0-project')
    try {
      const snap = snapshot(work)
      const { r, report } = runMigrate(work) // default = plan
      const problems = report ? [] : [`no parseable JSON (exit ${r.status})`]
      if (report) {
        if (report.mode !== 'plan') problems.push(`mode=${report.mode} (want plan)`)
        if (!report.applicable.some((m) => m.id === 'init-project-state')) problems.push('init-project-state not applicable')
        if (!report.applicable.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not applicable')
        if (!report.filesToChange.includes('.materia/project.json')) problems.push('filesToChange missing .materia/project.json')
        if (!report.filesToChange.includes('.materia/scripts/check-docs.sh')) problems.push('filesToChange missing .materia/scripts/check-docs.sh')
        if (report.localEditsAffected !== true) problems.push('localEditsAffected should be true (install-check-docs renames a legacy gate script)')
        if (report.nextCommand !== '/materia:migrate --apply') problems.push(`nextCommand=${JSON.stringify(report.nextCommand)}`)
      }
      const changed = diffKeys(snap, snapshot(work))
      if (changed.length) problems.push(`plan MUTATED the tree: ${changed.join(', ')}`)
      if (existsSync(join(work, '.materia/project.json'))) problems.push('plan created .materia/project.json')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [plan-legacy]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 2. PLAN on tracked-current (copy) -> nothing applicable, no next command,
  //    and the tree is untouched (snapshot diff).
  {
    const work = copyFixture('tracked-current-project')
    try {
      const snap = snapshot(work)
      const { r, report } = runMigrate(work)
      const problems = report ? [] : ['no parseable JSON']
      if (report) {
        if (report.applicable.length !== 0) problems.push(`applicable=${JSON.stringify(report.applicable.map((m) => m.id))} (want none)`)
        if (report.nextCommand !== null) problems.push(`nextCommand=${JSON.stringify(report.nextCommand)} (want null)`)
      }
      const changed = diffKeys(snap, snapshot(work))
      if (changed.length) problems.push(`plan MUTATED the tree: ${changed.join(', ')}`)
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [plan-tracked]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 3. APPLY on a COPY of legacy -> BOTH migrations run (init-project-state creates the
  //    state at schema 2, install-check-docs relocates the root gate script and stamps
  //    schema 3). Snapshot diff is EXACTLY {project.json created, root script removed,
  //    canonical script created}; appliedMigrations carries BOTH ids once; re-apply
  //    idempotent (byte-identical); doctor then reports healthy.
  {
    const work = copyFixture('legacy-0.1.0-project')
    try {
      const snap0 = snapshot(work)
      const { r, report } = runMigrate(work, '--apply')
      const snap1 = snapshot(work)
      const problems = []
      if (!report) problems.push('apply emitted no parseable JSON')
      else {
        if (!report.applied.some((m) => m.id === 'init-project-state')) problems.push('init-project-state not in applied')
        if (!report.applied.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not in applied')
        if (!report.created.includes('.materia/project.json')) problems.push('created missing .materia/project.json')
        if (!report.created.includes('.materia/scripts/check-docs.sh')) problems.push('created missing .materia/scripts/check-docs.sh')
        const want = { artifactSchema: 3, pluginVersion: null, source: 'legacy-0.1.0', appliedMigrations: ['init-project-state', 'install-check-docs'] }
        if (JSON.stringify(report.projectState) !== JSON.stringify(want))
          problems.push(`projectState=${JSON.stringify(report.projectState)} (want ${JSON.stringify(want)})`)
        if (report.status !== 'healthy') problems.push(`post-apply status=${report.status} (want healthy)`)
      }
      // Exactly: project.json created, canonical script created, root script removed.
      const changed = new Set(diffKeys(snap0, snap1))
      const wantChanged = new Set(['.materia/project.json', '.materia/scripts/check-docs.sh', '-scripts/check-docs.sh'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      // Written file parses to the exact state (independent of the report echo).
      const onDisk = JSON.parse(readFileSync(join(work, '.materia/project.json'), 'utf8'))
      if (onDisk.artifactSchema !== 3 || onDisk.source !== 'legacy-0.1.0' ||
          JSON.stringify(onDisk.appliedMigrations) !== JSON.stringify(['init-project-state', 'install-check-docs']))
        problems.push(`on-disk state wrong: ${JSON.stringify(onDisk)}`)
      problems.push(...exitWant(r, 0))
      // Idempotent re-apply: nothing applied AND the tree is byte-identical.
      const { r: r2, report: again } = runMigrate(work, '--apply')
      if (!again || again.applied.length !== 0) problems.push(`re-apply not idempotent: applied=${JSON.stringify(again && again.applied)}`)
      const changed2 = diffKeys(snap1, snapshot(work))
      if (changed2.length) problems.push(`re-apply MUTATED the tree: ${changed2.join(', ')}`)
      problems.push(...exitWant(r2, 0))
      // doctor↔migrate consistency: the migrated repo is healthy.
      const dr = spawnSync('node', [DOCTOR, work, '--json'], { encoding: 'utf8' })
      let drep = null; try { drep = JSON.parse(dr.stdout) } catch { /* below */ }
      if (!drep || drep.status !== 'healthy') problems.push(`doctor on migrated repo status=${drep && drep.status} (want healthy)`)
      if (problems.length) fail(`migrate [apply-legacy-copy]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 3b. APPLY human rendering carries the adopts-tracking-only honesty Note
  //     (fresh copy — the Note prints only when init-project-state actually applies).
  {
    const work = copyFixture('legacy-0.1.0-project')
    try {
      const r = spawnSync('node', [MIGRATE, work, '--apply'], { encoding: 'utf8' })
      if (!r.stdout.includes('adopts artifact tracking only'))
        fail('migrate [apply-legacy-copy, human]: apply rendering lacks the adopts-tracking-only honesty Note')
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 4. APPLY on an already-current tracked project (copy) -> no-op, and the tree
  //    (its valid schema-2 project.json included) is byte-identical afterward.
  {
    const work = copyFixture('tracked-current-project')
    try {
      const snap = snapshot(work)
      const { r, report } = runMigrate(work, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none — already current)`)
      const changed = diffKeys(snap, snapshot(work))
      if (changed.length) problems.push(`apply MUTATED an already-current tree: ${changed.join(', ')}`)
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-tracked-noop]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 5. APPLY on a VALID but stale (schema 1) hand-authored state -> BOTH migrations
  //    are guarded by the manual disposition ("expected >= 2"), nothing applies, and the
  //    file is NEVER overwritten/stamped. This is the valid-state half of the
  //    never-overwrite guarantee (case 6 covers malformed). install-check-docs's
  //    disposition 1 (schema < 2 -> manual) is the pin that a hand-authored stale state
  //    is never stamped to schema 3.
  {
    const raw = '{ "artifactSchema": 1, "pluginVersion": null, "source": "hand", "appliedMigrations": [] }'
    const s1 = synthState('s1', raw)
    try {
      const { r, report } = runMigrate(s1, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none)`)
        const both = [...report.manual, ...report.notChanged]
        if (!both.some((x) => /expected >= 2/.test(x.reason || '')))
          problems.push('no manual/notChanged item explains the stale schema ("expected >= 2")')
        if (!both.some((x) => x.id === 'install-check-docs' && /expected >= 2/.test(x.reason || '')))
          problems.push('install-check-docs not classified manual for the schema-1 stale state')
      }
      if (readFileSync(join(s1, '.materia', 'project.json'), 'utf8') !== raw) problems.push('valid stale project.json was OVERWRITTEN')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-valid-stale]: ${problems.join('; ')}`)
    } finally { rmSync(s1, { recursive: true, force: true }) }
  }

  // 6. APPLY on malformed state -> never overwritten; reported manual.
  {
    const raw = '{ not valid json'
    const mf = synthState('mf', raw)
    try {
      const { r, report } = runMigrate(mf, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none)`)
        if (!report.notChanged.some((n) => n.id === 'project-state-parses')) problems.push('malformed not reported in notChanged')
      }
      if (readFileSync(join(mf, '.materia', 'project.json'), 'utf8') !== raw) problems.push('malformed project.json was OVERWRITTEN')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-malformed]: ${problems.join('; ')}`)
    } finally { rmSync(mf, { recursive: true, force: true }) }
  }

  // 7. APPLY on the structural manual branches (unknown / future schema) -> no
  //    write, reported manual as artifact-schema-known. Valid JSON, so not the
  //    malformed path; distinct buildPlan branches.
  for (const [label, raw] of [
    ['unknown-schema', '{ "artifactSchema": "banana", "pluginVersion": null, "source": "hand", "appliedMigrations": [] }'],
    ['future-schema', '{ "artifactSchema": 99, "pluginVersion": null, "source": "hand", "appliedMigrations": [] }'],
  ]) {
    const dir = synthState(label, raw)
    try {
      const { r, report } = runMigrate(dir, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none)`)
        if (![...report.manual, ...report.notChanged].some((x) => x.id === 'artifact-schema-known'))
          problems.push('no artifact-schema-known manual item')
      }
      if (readFileSync(join(dir, '.materia', 'project.json'), 'utf8') !== raw) problems.push(`${label} project.json was OVERWRITTEN`)
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-${label}]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 8. APPLY on a non-Materia repo -> no invented state, no file written.
  {
    const nm = mkdtempSync(join(tmpdir(), 'materia-migrate-nm-'))
    try {
      writeFileSync(join(nm, 'README.md'), '# just a repo\n')
      const { r, report } = runMigrate(nm, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none)`)
      if (existsSync(join(nm, '.materia', 'project.json'))) problems.push('invented .materia/project.json for a non-Materia repo')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-non-materia]: ${problems.join('; ')}`)
    } finally { rmSync(nm, { recursive: true, force: true }) }
  }

  // 9. APPLY on a COPY of gnarly (untracked, NO gate script at either location, still
  //    carries a stale scripts/check-docs.mjs) -> init-project-state creates the state,
  //    install-check-docs COPIES the gate from the plugin scaffold to the canonical
  //    location and stamps schema 3. Snapshot diff = {project.json created, canonical
  //    script created}; the stale .mjs is UNTOUCHED and surfaced as a manual cleanup
  //    item; doctor-after is healthy.
  {
    const work = copyFixture('gnarly-legacy-project')
    try {
      const snap0 = snapshot(work)
      const { r, report } = runMigrate(work, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (!report.applied.some((m) => m.id === 'init-project-state')) problems.push('init-project-state not applied')
        if (!report.applied.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not applied')
        if (report.status !== 'healthy') problems.push(`post-apply status=${report.status} (want healthy)`)
        const onDisk = JSON.parse(readFileSync(join(work, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 3) problems.push(`stamped schema=${onDisk.artifactSchema} (want 3)`)
        // The stale .mjs cleanup is surfaced (never auto-deleted).
        if (![...report.manual, ...report.notChanged].some((x) => /check-docs\.mjs/.test(x.reason || '')))
          problems.push('stale scripts/check-docs.mjs cleanup note not surfaced')
      }
      const changed = new Set(diffKeys(snap0, snapshot(work)))
      const wantChanged = new Set(['.materia/project.json', '.materia/scripts/check-docs.sh'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      // Stale .mjs still present, byte-identical.
      if (!existsSync(join(work, 'scripts/check-docs.mjs'))) problems.push('stale scripts/check-docs.mjs was deleted')
      // Gate script actually installed at the canonical location.
      if (!existsSync(join(work, '.materia/scripts/check-docs.sh'))) problems.push('gate script not installed at .materia/scripts/check-docs.sh')
      problems.push(...exitWant(r, 0))
      const dr = spawnSync('node', [DOCTOR, work, '--json'], { encoding: 'utf8' })
      let drep = null; try { drep = JSON.parse(dr.stdout) } catch { /* below */ }
      if (!drep || drep.status !== 'healthy') problems.push(`doctor on migrated gnarly status=${drep && drep.status} (want healthy)`)
      if (problems.length) fail(`migrate [apply-gnarly-copy]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 10. APPLY on a synthetic BOTH-LOCATIONS repo (schema 2, gate script at BOTH
  //     .materia/scripts/ AND root scripts/) -> install-check-docs is stamp-only
  //     (disposition 3): the canonical script is never overwritten, the root copy is left
  //     UNTOUCHED and surfaced as a superseded-copy manual item, and only project.json
  //     changes (stamped to schema 3).
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-both-'))
    try {
      mkdirSync(join(dir, '.materia', 'scripts'), { recursive: true })
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      const canonBody = '#!/bin/sh\n# canonical\nexit 0\n', rootBody = '#!/bin/sh\n# superseded root\nexit 0\n'
      writeFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), canonBody)
      writeFileSync(join(dir, 'scripts', 'check-docs.sh'), rootBody)
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 2, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      const snap0 = snapshot(dir)
      const { r, report } = runMigrate(dir, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (!report.applied.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not applied (stamp-only expected)')
        if (![...report.manual, ...report.notChanged].some((x) => /superseded/.test(x.reason || '') && /scripts\/check-docs\.sh/.test(x.reason || '')))
          problems.push('superseded root-copy manual item not surfaced')
        const onDisk = JSON.parse(readFileSync(join(dir, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 3) problems.push(`stamped schema=${onDisk.artifactSchema} (want 3)`)
      }
      // Stamp only: EXACTLY project.json changed; both scripts byte-identical.
      const changed = diffKeys(snap0, snapshot(dir))
      if (changed.length !== 1 || changed[0] !== '.materia/project.json')
        problems.push(`apply changed more than project.json: ${JSON.stringify(changed)}`)
      if (readFileSync(join(dir, 'scripts', 'check-docs.sh'), 'utf8') !== rootBody) problems.push('root copy was mutated')
      if (readFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), 'utf8') !== canonBody) problems.push('canonical copy was overwritten')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-both-locations]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 11. Synthetic MOVED-BUT-UNSTAMPED repo (schema 2, gate script at the canonical
  //     location only): the doctor↔migrate bridge. doctor is healthy yet suggests
  //     /materia:migrate --plan; migrate has a stamp-only install-check-docs applicable;
  //     apply stamps schema 3; re-apply is idempotent (byte-identical).
  {
    const mk = () => {
      const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-moved-'))
      mkdirSync(join(dir, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 2, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      return dir
    }
    const dir = mk()
    try {
      const problems = []
      // doctor: healthy + bridge suggestion.
      const dr0 = spawnSync('node', [DOCTOR, dir, '--json'], { encoding: 'utf8' })
      let d0 = null; try { d0 = JSON.parse(dr0.stdout) } catch { /* below */ }
      if (!d0 || d0.status !== 'healthy') problems.push(`pre-apply doctor status=${d0 && d0.status} (want healthy)`)
      if (!d0 || d0.suggestedNextCommand !== '/materia:migrate --plan') problems.push(`pre-apply doctor suggestedNextCommand=${d0 && d0.suggestedNextCommand} (want the bridge)`)
      // migrate plan: install-check-docs stamp-only applicable, files = project.json only.
      const { report: plan } = runMigrate(dir)
      if (!plan || !plan.applicable.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not applicable (stamp-only)')
      if (plan && plan.applicable.some((m) => m.id === 'init-project-state')) problems.push('init-project-state wrongly applicable (state already present)')
      // apply: stamps schema 3, nothing else changes.
      const snap0 = snapshot(dir)
      const { r, report } = runMigrate(dir, '--apply')
      const changed = diffKeys(snap0, snapshot(dir))
      if (changed.length !== 1 || changed[0] !== '.materia/project.json') problems.push(`apply changed more than project.json: ${JSON.stringify(changed)}`)
      if (report) {
        const onDisk = JSON.parse(readFileSync(join(dir, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 3) problems.push(`post-apply schema=${onDisk.artifactSchema} (want 3)`)
        if (!onDisk.appliedMigrations.includes('install-check-docs')) problems.push('appliedMigrations missing install-check-docs')
      }
      problems.push(...exitWant(r, 0))
      // re-apply idempotent.
      const snap1 = snapshot(dir)
      const { r: r2, report: again } = runMigrate(dir, '--apply')
      if (!again || again.applied.length !== 0) problems.push(`re-apply not idempotent: applied=${JSON.stringify(again && again.applied)}`)
      if (diffKeys(snap1, snapshot(dir)).length) problems.push('re-apply mutated the tree')
      problems.push(...exitWant(r2, 0))
      if (problems.length) fail(`migrate [moved-but-unstamped]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  if (failures === before)
    console.log('  ✓ migrate behavior: plan→no-mutate · apply(legacy)→init+install-check-docs(relocate+stamp 3→doctor healthy) · apply(gnarly)→copy-from-scaffold+stamp(stale .mjs untouched) · both-locations→stamp-only(root untouched) · moved-but-unstamped→bridge+stamp · idempotent · never overwrites valid/stale/malformed · tracked-noop · unknown/future/non-materia→no-write')
}

// ---- 9. doctor/migrate skills + script references ---------------------------
// If the release ledger exists, its consuming TOOLS must ship with it: the doctor +
// migrate skills, and every script those skills name. Catches a deleted skill or a
// renamed script silently shipping while the ledger still advertises drift/migration.
// Robust, not brittle: resolve each referenced script's BASENAME from the skill text
// (both the plugins/materia/scripts/… and the ${CLAUDE_PLUGIN_ROOT}/scripts/… runtime
// forms collapse to the same basename) rather than pinning exact prose.
{
  const before = failures
  const REL = 'plugins/materia/release'
  if (existsSync(REL)) {
    for (const s of ['doctor', 'migrate']) {
      const skill = `plugins/materia/skills/${s}/SKILL.md`
      if (!existsSync(skill)) { fail(`release ledger exists but ${skill} is missing — the doctor+migrate skills must ship alongside the ledger they consume`); continue }
      const text = readFileSync(skill, 'utf8')
      const refs = new Set([...text.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map((m) => m[1]))
      if (refs.size === 0)
        fail(`${skill} names no scripts/*.mjs — expected it to reference plugins/materia/scripts/${s}.mjs (the deterministic engine it runs)`)
      for (const base of refs)
        if (!existsSync(`plugins/materia/scripts/${base}`))
          fail(`${skill} references scripts/${base} but plugins/materia/scripts/${base} does not exist`)
    }
    if (failures === before)
      console.log('  ✓ doctor/migrate skills + script refs: skills present; every scripts/*.mjs they name exists')
  }
}

if (failures) {
  console.error(`\n${failures} validation failure(s).`)
  process.exit(1)
}
console.log('\nplugin validation: all clean.')
