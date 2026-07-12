#!/usr/bin/env node
// Plugin validation — simulates what /materia:init materializes from the
// `materia` plugin's bundled scaffold, then verifies it. No network, no AI.
// The plugin lives at plugins/materia/: skills/ (all pipeline skills, at the
// plugin root per the Claude Code plugin spec) and scaffold/ (the MATERIA.md +
// CLAUDE.md + .materia/docs/ + check-docs.sh bundle that /materia:init writes into a
// user repo). The shipped checker is the portable POSIX-sh check-docs.sh; its
// parity oracle (the Node reference implementation, repo-local, never bundled)
// lives at scripts/check-docs-oracle.mjs and is exercised by the check-docs
// parity harness (§1). Layers:
//  1. check-docs parity harness: materialize the two real scaffold profiles
//     exactly as /materia:init would (.materia/docs/ + root CLAUDE.md/MATERIA.md + the
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
  // Each fixture is a self-contained doc tree (CLAUDE.md and/or .materia/docs/**); the
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
    { name: 'broken-link', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[missing](.materia/docs/none.md)') } },
    { name: 'valid-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[ok](.materia/docs/real.md)'), '.materia/docs/real.md': doc('# Real') } },
    { name: 'bad-anchor', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[a](.materia/docs/real.md#nope)'), '.materia/docs/real.md': doc('# Real Heading') } },
    { name: 'dup-heading-anchor', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](.materia/docs/d.md#dup)', '', '[b](.materia/docs/d.md#dup-1)'), '.materia/docs/d.md': doc('# Dup', '', 'a', '', '# Dup', '', 'b') } },
    { name: 'nested-bracket-link', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', '[see [weekId] path](.materia/docs/none.md)') } },
    { name: 'heading-inline-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](.materia/docs/hl.md#see-docs)'), '.materia/docs/hl.md': doc('# H', '', '## See [docs](http://x)', '', 'body') } },
    { name: 'http-mailto-skipped', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](https://e.com) [b](mailto:x@y.z) [c](http://f)') } },
    // fences + inline code
    { name: 'in-fence-ignored', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', TICK, '[bad](.materia/docs/none.md) was removed previously', TICK) } },
    { name: 'between-fences-caught', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', TICK, 'a', TICK, '[bad](.materia/docs/none.md) was removed', TICK, 'b', TICK) } },
    { name: 'interleaved-fences', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', TICK, 'code ' + TILDE + ' code', TICK, '', TILDE, 'more [x](.materia/docs/none.md) code', TILDE) } },
    { name: 'inline-code-link', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', 'Use `[x](.materia/docs/none.md)` inline.') } },
    // narration (one per phrase) + wrap + NBSP surfaces
    { name: 'narration-linewrap', expect: 'fail', files: { '.materia/docs/w.md': doc('# T', '', 'The field was renamed', 'from foo.') } },
    { name: 'nbsp-narration-caught', expect: 'fail', files: { '.materia/docs/nb.md': doc('# T', '', 'The field was renamed' + NBSP + 'from foo.') } },
    { name: 'nbsp-heading-clean', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[a](.materia/docs/h.md#foo-bar)'), '.materia/docs/h.md': doc('# H', '', '## Foo' + NBSP + 'Bar', '', 'body') } },
    // long-line surfaces
    { name: 'overlong-boundary', expect: 'fail', files: { '.materia/docs/standards/o.md': doc('# T', '', line601, '', line600) } },
    { name: 'dup-long-line', expect: 'fail', files: { '.materia/docs/standards/dp.md': doc('# T', '', dupLine, dupLine) } },
    // glossary
    { name: 'glossary-clean', expect: 'clean', files: { '.materia/docs/glossary.md': doc('# Glossary', '', '## Alpha', '', '| Term | Def |', '| --- | --- |', '| **alpha** | 1 |', '| **beta** | 2 |', '| **gamma** | 3 |') } },
    { name: 'glossary-disorder', expect: 'fail', files: { '.materia/docs/glossary.md': doc('# Glossary', '', '| Term | Def |', '| --- | --- |', '| **apple** | a |', '| **Café** | b |', '| **cafe** | c |', '| **v2** | d |', '| **v10** | e |', '| **zebra** | f |', '| **aaa** | g |') } },
    // ordering + sort boundary + exemption
    { name: 'multi-violation-order', expect: 'fail', files: { '.materia/docs/standards/m.md': doc('# M', '', '[bad](.materia/docs/none.md)', '', 'This was removed; it is no longer used.', '', line601, '', megaLine, megaLine) } },
    { name: 'sort-boundary', expect: 'fail', files: { 'CLAUDE.md': doc('# C', '', '[bad](.materia/docs/none.md)'), '.materia/docs/z.md': doc('# Z', '', '[bad](none2.md)') } },
    { name: 'specs-exempt', expect: 'fail', files: { '.materia/docs/specs/s.md': doc('# S', '', 'This was removed previously.', '', '[bad](none.md)', '', '[self](s.md#no-such)') } },
    // fully clean tree
    { name: 'clean-tree', expect: 'clean', files: { 'CLAUDE.md': doc('# App', '', 'See [readme](.materia/docs/README.md) and [alpha](.materia/docs/glossary.md#alpha).'), '.materia/docs/README.md': doc('# Readme'), '.materia/docs/glossary.md': doc('# Glossary', '', '## Alpha', '', '| Term | Def |', '| --- | --- |', '| **alpha** | 1 |', '| **beta** | 2 |') } },
    // coverage — branches otherwise unexercised by the corpus or scaffold profiles
    { name: 'self-anchor-clean', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', 'See [x](#section-two).', '', '## Section Two', '', 'body') } }, // empty-target self-link resolves
    { name: 'self-anchor-bad', expect: 'fail', files: { 'CLAUDE.md': doc('# T', '', 'See [x](#no-such).', '', '## Section Two') } },
    { name: 'resources-style', expect: 'fail', files: { '.materia/docs/resources/r.md': doc('# R', '', 'This was removed previously.') } }, // .materia/docs/resources/ isStyle branch
    { name: 'templates-style', expect: 'fail', files: { '.materia/docs/_templates/t.md': doc('# Tmpl', '', 'This was removed previously.') } }, // .materia/docs/_templates/ isStyle branch
    { name: 'unpaired-fence', expect: 'fail', files: { '.materia/docs/standards/uf.md': doc('# T', '', TICK, 'code', '', 'This was removed here.') } }, // unclosed fence → content not blanked
    { name: 'multi-hash-fragment', expect: 'clean', files: { 'CLAUDE.md': doc('# T', '', '[x](.materia/docs/mh.md#foo#bar)'), '.materia/docs/mh.md': doc('# H', '', '## Foo', '', 'body') } }, // fragment = first #-segment
  ]
  // one fixture per NARRATION phrase (each a lone violation in a style-checked doc)
  for (const p of NARRATION)
    fixtures.push({ name: `narration:${p}`, expect: 'fail', files: { '.materia/docs/n.md': doc('# T', '', `This ${p} here.`) } })

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
      cpSync('plugins/materia/scaffold/.materia/docs', join(dir, '.materia', 'docs'), { recursive: true })
      cpSync('plugins/materia/scaffold/CLAUDE.md', join(dir, 'CLAUDE.md'))
      cpSync('plugins/materia/scaffold/MATERIA.md', join(dir, 'MATERIA.md'))
      for (const f of standards)
        writeFileSync(join(dir, '.materia', 'docs', 'standards', `${f}.md`), '# stub — generated by /materia:init\n')
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
  ['plugins/materia/scaffold/.materia/docs/specs/_templates/status.md', '- [ ] 4. architecture'],
  ['plugins/materia/scaffold/.materia/docs/specs/_templates/status.md', '- [ ] 5. plan-tasks'],
  ['plugins/materia/scaffold/.materia/docs/specs/_templates/status.md', '- [ ] 9. finalize'],
  ['plugins/materia/scaffold/.materia/docs/bugs/_templates/status.md', '- [ ] 3. plan-tasks'],
  ['plugins/materia/scaffold/.materia/docs/bugs/_templates/status.md', '- [ ] 6. docs-sync'],
  ['plugins/materia/scaffold/.materia/docs/bugs/_templates/status.md', '- [ ] 7. docs-audit'],
  ['plugins/materia/scaffold/.materia/docs/bugs/_templates/status.md', '- [ ] 8. finalize'],
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
// to). The shared producer-lifecycle standard .materia/docs/standards/skills.md IS pinned:
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
  if (!cites('plugins/materia/scaffold/.materia/docs/standards/skills.md'))
    fail('§ Version control pin: .materia/docs/standards/skills.md does not cite `MATERIA.md § Version control` — the shared producer-lifecycle rule routes trunk/remote/forge through the config home')
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
    // migrate joins the citers: its reference sweep re-runs the repo's check:docs gate,
    // resolved from MATERIA.md § Gate (the pin's own logic — a gate-runner must cite it).
    'migrate',
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

// ---- 1f. scaffold run-output hygiene ----------------------------------------
// Per-run product outputs (spec.md/design.md/architecture.md/tasks.md/retro.md/
// STATUS.md, plus any design/prototype output or snapshot) are NOT installed
// artifacts — a run emits them per spec into a dated run folder, and they sit
// OUTSIDE the artifactSchema contract (release/README.md § "Per-run outputs are
// outside the contract"). The bundled scaffold must therefore ship ONLY the
// _templates/ they are generated from plus the queue scaffolding — never a
// materialized run output. A dated run folder, or a stray run-output file, under
// any run-folder tree — scaffold/.materia/docs/{specs,bugs,epics,research}/ (specs+bugs
// runs, plus the epic.md/research.md an epic run mints; janitor/librarian treat
// all four as one historical-run-artifact class) — would mean the scaffold
// "declares" a per-run artifact it must not, so we fail closed. Pure over a
// dir listing (name+isDir)
// so the synthetic negatives below can drive it, mirroring lintLedger's idiom.
const lintScaffoldRunOutputs = (area, entries) => {
  const errs = []
  for (const { name, isDir } of entries) {
    // Only _-prefixed dirs (_templates/_proposed/_reports) and the area README
    // may ship. Everything else — most sharply a dated `YYYY-MM-DD-slug/` folder
    // or a bare run output like design.md — is a per-run artifact and rejected.
    const allowed = name === 'README.md' || (isDir && name.startsWith('_'))
    if (!allowed)
      errs.push(`${area}: "${name}" may not ship in the bundled scaffold — only _-prefixed dirs (_templates/_proposed/_reports) and README.md are allowed; a dated run folder or a materialized per-run output (spec.md/design.md/architecture.md/tasks.md/retro.md/STATUS.md/design snapshot) must never be bundled (per-run outputs are outside the artifact contract)`)
  }
  return errs
}
{
  const before = failures
  const AREAS = [
    'plugins/materia/scaffold/.materia/docs/specs',
    'plugins/materia/scaffold/.materia/docs/bugs',
    'plugins/materia/scaffold/.materia/docs/epics',
    'plugins/materia/scaffold/.materia/docs/research',
  ]
  const readArea = (area) => readdirSync(area, { withFileTypes: true }).map((d) => ({ name: d.name, isDir: d.isDirectory() }))
  // The real scaffold must be clean.
  for (const area of AREAS)
    for (const e of lintScaffoldRunOutputs(area, readArea(area)))
      fail(`scaffold run-output hygiene: ${e}`)
  // Synthetic coverage — prove the linter passes a clean area and fail-closes on
  // BOTH shapes of violation (a dated run folder AND a stray run-output file),
  // so a validator that only ever sees the good real scaffold can't rot silently.
  const clean = [{ name: 'README.md', isDir: false }, { name: '_templates', isDir: true }, { name: '_proposed', isDir: true }, { name: '_reports', isDir: true }]
  if (lintScaffoldRunOutputs('synthetic', clean).length !== 0)
    fail('scaffold run-output hygiene: self-test — a clean area (README.md + _-dirs) unexpectedly reported a violation')
  if (lintScaffoldRunOutputs('synthetic', [{ name: '2026-01-01-example', isDir: true }]).length !== 1)
    fail('scaffold run-output hygiene: self-test — a dated run folder was not rejected')
  if (lintScaffoldRunOutputs('synthetic', [{ name: 'design.md', isDir: false }]).length !== 1)
    fail('scaffold run-output hygiene: self-test — a stray materialized per-run output was not rejected')
  if (failures === before)
    console.log(`  ✓ scaffold run-output hygiene: ${AREAS.length} scaffold areas ship only _-dirs + README.md (no per-run outputs); 3 self-tests fail-close`)
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
  'design': '.materia/docs/specs/_templates/design.md',   // step 1: first spec read
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

  // Scaffold acknowledgedChanges prefill pin. A fresh install already CONTAINS every
  // same-schema change's content (it got the current scaffold), so the scaffold state
  // pre-acknowledges them — doctor's availableAdoptions listing stays empty on a fresh
  // install instead of listing adoptions the repo was born with. Keyed to ALL version
  // files at the scaffold's own schema (not just the pointed file) so a later
  // same-schema version file keeps fresh installs quiet too. Set-EQUALITY, both ways:
  // minting a new same-schema change forces this list current (missing), and a stale id
  // never lingers after a schema bump moves the ids out of scope (extra).
  if (scaffoldState && isInt(scaffoldState.artifactSchema)) {
    const wantIds = new Set()
    for (const obj of parsedVersions.values())
      if (obj.artifactSchema === scaffoldState.artifactSchema)
        for (const ch of Array.isArray(obj.changes) ? obj.changes : []) if (isStr(ch.id)) wantIds.add(ch.id)
    if (!Array.isArray(scaffoldState.acknowledgedChanges))
      fail(`scaffold .materia/project.json: acknowledgedChanges must be an array prefilled with every schema-${scaffoldState.artifactSchema} change id (fresh installs must not surface adoptions they were born with)`)
    else {
      const have = new Set(scaffoldState.acknowledgedChanges)
      const missing = [...wantIds].filter((id) => !have.has(id))
      const extra = [...have].filter((id) => !wantIds.has(id))
      if (missing.length || extra.length)
        fail(`scaffold .materia/project.json acknowledgedChanges must set-equal all schema-${scaffoldState.artifactSchema} change ids — missing: [${missing}], extra: [${extra}]`)
    }
  }

  // Fixture pins: tracked carries a schema-3 project.json (the current tracked shape);
  // legacy carries none (its defining trait — the absence a future doctor keys on).
  const trackedState = 'tests/fixtures/materia/tracked-current-project/.materia/project.json'
  if (!existsSync(trackedState)) fail(`fixture: ${trackedState} must exist (tracked shape)`)
  else { const t = parseJson(trackedState); if (t && t.artifactSchema !== 4) fail(`fixture: ${trackedState} artifactSchema must be 4 (current tracked shape)`) }
  const legacyState = 'tests/fixtures/materia/legacy-0.1.0-project/.materia/project.json'
  if (existsSync(legacyState)) fail(`fixture: ${legacyState} must NOT exist — the legacy fixture's defining trait is the absence of project state`)

  if (failures === before)
    console.log(`  ✓ release ledger + project-state sanity: ${versionFiles.length} version file(s); latest↔versions↔scaffold coherent; fixtures pinned`)
}

// ---- 6c. manualMigration reference-sweep content pin -------------------------
// The 0.3.0 gate + relocation entries' manualMigration texts must carry the
// consumer-reference-update step migrate's skill automates — so a human adopting by
// hand (no migrate run) still updates the § Gate row / package scripts / CI / docs, and
// the skill's sweep instructions and the ledger prose stay in agreement. Pin the STABLE
// short token `§ Gate row`, not a full sentence, so a reword doesn't false-fail. Both
// entries are the ones sharing the install-check-docs migration that relocates the gate.
{
  const before = failures
  const v030 = 'plugins/materia/release/versions/0.3.0.json'
  let obj = null
  try { obj = JSON.parse(readFileSync(v030, 'utf8')) } catch (e) { fail(`${v030}: not valid JSON — ${e.message}`) }
  if (obj) {
    for (const id of ['0.3.0-check-docs-sh-gate', '0.3.0-scripts-relocation']) {
      const ch = (obj.changes ?? []).find((c) => c && c.id === id)
      if (!ch) { fail(`manualMigration content pin: ${v030} has no change \`${id}\``); continue }
      if (!String(ch.manualMigration).includes('§ Gate row'))
        fail(`manualMigration content pin: ${id}.manualMigration must name the \`§ Gate row\` reference-update step (the consumer-sweep the migrate skill automates)`)
    }
  }
  if (failures === before)
    console.log('  ✓ manualMigration content pin: 0.3.0 gate + relocation entries carry the `§ Gate row` reference-update step')
}

// ---- 6c (docs-relocation). manualMigration content pin ----------------------
// The 0.4.0 agent-docs relocation is a breaking change whose migrate handler (relocate-docs)
// does more than a move: it refreshes the stale-roots gate script and stamps schema 4, and its
// reference sweep is list-only. A human adopting by hand (no migrate run) must therefore be told
// BOTH the gate-script refresh AND the consumer sweep — a bare "git mv docs .materia/docs" would
// leave a gate linting the user's own docs/ and a repo full of stale path references. Pin the two
// STABLE short tokens the by-hand path cannot omit — `check-docs.sh` (the gate refresh) and
// `review-angles` (a representative consumer-sweep target) — not full sentences, so a reword
// doesn't false-fail.
{
  const before = failures
  const v040 = 'plugins/materia/release/versions/0.4.0.json'
  let obj = null
  try { obj = JSON.parse(readFileSync(v040, 'utf8')) } catch (e) { fail(`${v040}: not valid JSON — ${e.message}`) }
  if (obj) {
    const ch = (obj.changes ?? []).find((c) => c && c.id === '0.4.0-docs-relocation')
    if (!ch) fail(`manualMigration content pin: ${v040} has no change \`0.4.0-docs-relocation\``)
    else {
      const mm = String(ch.manualMigration)
      if (!mm.includes('check-docs.sh'))
        fail('manualMigration content pin: 0.4.0-docs-relocation.manualMigration must name the `check-docs.sh` gate-script refresh (a stale old-roots gate would lint the user\'s own docs/)')
      if (!mm.includes('review-angles'))
        fail('manualMigration content pin: 0.4.0-docs-relocation.manualMigration must name the `review-angles` consumer sweep (the installed .materia/review-angles/ files carry docs-path refs the move leaves stale)')
    }
  }
  if (failures === before)
    console.log('  ✓ manualMigration content pin: 0.4.0-docs-relocation entry carries the gate-script refresh + consumer-sweep steps')
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
  // Look a bucket entry's full Change up in the shipped ledger (buckets carry
  // only {impact, id, summary}; detectability lives on the Change object).
  const ledgerChanges = readdirSync(resolve('plugins/materia/release/versions'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => { try { return JSON.parse(readFileSync(resolve('plugins/materia/release/versions', f), 'utf8')).changes ?? [] } catch { return [] } })
  const ledgerChangeById = (id) => ledgerChanges.find((ch) => ch.id === id) ?? null

  // tracked-current fixture -> healthy, schema 3, gate script at canonical location,
  // nothing outstanding
  check('tracked-current', resolve('tests/fixtures/materia/tracked-current-project'), (rep, r) => [
    ...want(rep, 'status', 'healthy'),
    ...want(rep, 'materiaEnabled', true),
    ...want(rep, 'currentSchema', 4),
    ...want(rep, 'suggestedNextCommand', null),
    ...sevWant(rep, 'check-docs-sh-present', 'ok'),  // fixture ships the gate-script stub…
    ...sevWant(rep, 'check-docs-sh-location', 'ok'), // …at the canonical .materia/scripts/ location
    ...detailWant(rep, 'check-docs-sh-location', '.materia/scripts/check-docs.sh'),
    // docs-location: the fixture carries a minimal .materia/docs/ tree, so the 0.4.0
    // relocation reads `ok` (precedence) and 0.4.0-docs-relocation is adopted-filtered.
    ...sevWant(rep, 'docs-location', 'ok'),
    // Healthy-path honesty: even a green report must say what "current" certifies.
    ...detailWant(rep, 'artifact-schema-current', 'certifies only .materia/project.json'),
    // Windowless adoption surfacing: a schema-current (schema 4) repo still sees
    // the 0.4.0 release's schema-invisible changes — the discoverability gap this
    // pass closes. The docs-relocation entry is adopted-filtered (docs-location `ok`,
    // via the fixture's .materia/docs/ tree), so what remains is the detectable:false
    // 0.4.0 set (stage-reviews recommended, init-staged-intake optional): non-empty,
    // impact-legal, and (no acknowledgedChanges in the fixture) nothing hidden. It stays
    // purely informational — status/exit/suggestedNextCommand above are unchanged.
    ...(rep.availableAdoptions.length ? [] : ['availableAdoptions empty for a schema-current repo (windowless surfacing missing)']),
    ...(rep.availableAdoptions.some((a) => a.id === '0.4.0-stage-reviews')
      ? [] : ['availableAdoptions missing 0.4.0-stage-reviews']),
    ...(rep.availableAdoptions.every((a) => ['required', 'breaking', 'recommended', 'optional'].includes(a.impact))
      ? [] : ['availableAdoptions carries a doctor-only/none impact (must be excluded)']),
    ...want(rep, 'acknowledgedCount', 0),
    ...exitWant(r, 0),
  ])

  // Healthy-path honesty in the HUMAN rendering too: the "Suggested next: none"
  // default must carry the certifies-only-project.json caveat (doctor.mjs).
  {
    const r = spawnSync('node', [DOCTOR, resolve('tests/fixtures/materia/tracked-current-project')], { encoding: 'utf8' })
    if (!r.stdout.includes('Schema currency certifies only that file'))
      fail('doctor [tracked-current, human]: healthy rendering lacks the schema-currency honesty caveat')
    // …and the windowless adoption listing renders in the human view too (the
    // discoverability surface, not just the --json field).
    if (!r.stdout.includes('Available to adopt'))
      fail('doctor [tracked-current, human]: healthy rendering lacks the "Available to adopt" windowless listing')
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

  // The windowless non-adopted set size — derived at test runtime, never hardcoded.
  // The tracked-current fixture is a schema-4 repo with the gate script + a .materia/docs/
  // tree at their canonical locations AND no acknowledgedChanges, so its availableAdoptions
  // IS the full windowless-minus-adopted set for the real ledger (docs-relocation
  // adopted-filtered via docs-location `ok`; the detectable:false 0.4.0 entries surviving).
  // The acknowledged-current case below reuses this count: it is ALSO schema 4, so it shares
  // the same windowless set, and acknowledging ALL of them must hide exactly this many.
  const windowlessNonAdopted = runDoctor(resolve('tests/fixtures/materia/tracked-current-project')).report.availableAdoptions.length

  // synthetic acknowledged-current -> the acknowledged filter. Same schema as
  // tracked-current (schema 4, canonical gate script, a .materia/docs/ tree so docs-location
  // is `ok`), but project.json lists ALL ledger change ids in acknowledgedChanges (read at
  // runtime from the loaded version files — NOT hardcoded). Every windowless entry that
  // survives the adopted filter is then acknowledged-hidden, so availableAdoptions is EMPTY,
  // acknowledgedCount equals the windowless-non-adopted size, and the human render shows
  // NEITHER the listing nor a bare hidden-count line (both are gated on a non-empty listing).
  // Status stays healthy — the pass is informational only.
  {
    const ac = mkdtempSync(join(tmpdir(), 'materia-doctor-acked-'))
    try {
      mkdirSync(join(ac, '.materia', 'scripts'), { recursive: true })
      mkdirSync(join(ac, '.materia', 'docs'), { recursive: true })
      writeFileSync(join(ac, 'MATERIA.md'), '# m\n')
      writeFileSync(join(ac, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(ac, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 4, pluginVersion: null, source: 'synthetic', appliedMigrations: [], acknowledgedChanges: ledgerChanges.map((ch) => ch.id) }))
      check('acknowledged-current', ac, (rep, r) => [
        ...want(rep, 'status', 'healthy'),
        ...(rep.availableAdoptions.length === 0 ? [] : [`availableAdoptions must be empty (all acknowledged), got ${JSON.stringify(rep.availableAdoptions.map((a) => a.id))}`]),
        ...(rep.acknowledgedCount > 0 ? [] : [`acknowledgedCount must be > 0 (entries hidden), got ${rep.acknowledgedCount}`]),
        ...want(rep, 'acknowledgedCount', windowlessNonAdopted),
        ...exitWant(r, 0),
      ])
      const human = spawnSync('node', [DOCTOR, ac], { encoding: 'utf8' }).stdout
      if (human.includes('Available to adopt') || human.includes('hidden'))
        fail('doctor [acknowledged-current, human]: rendered the windowless listing/hidden-count for an all-acknowledged repo (must show neither)')
    } finally { rmSync(ac, { recursive: true, force: true }) }
  }

  // synthetic current-missing-gate -> a schema-current (schema 3) repo MISSING the
  // gate script at both locations, no acknowledgedChanges. check-docs-sh-present is
  // `warning` -> overall status `warnings` (exit 0; impact-severity semantics
  // unchanged — the missing gate is not adopted-filtered). The windowless pass then
  // surfaces the required 0.3.0-check-docs-sh-gate as [required] (NOT adopted-away,
  // its doctorCheck is `warning` not `ok`) alongside the recommended detectable:false
  // entries — honest redundancy: the check already carries the severity, the listing
  // restates it in adoption terms.
  {
    const cmg = mkdtempSync(join(tmpdir(), 'materia-doctor-missgate-'))
    try {
      mkdirSync(join(cmg, '.materia'), { recursive: true })
      writeFileSync(join(cmg, 'MATERIA.md'), '# m\n')
      writeFileSync(join(cmg, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      check('current-missing-gate', cmg, (rep, r) => [
        ...want(rep, 'status', 'warnings'),
        ...sevWant(rep, 'check-docs-sh-present', 'warning'),
        ...(rep.availableAdoptions.some((a) => a.id === '0.3.0-check-docs-sh-gate' && a.impact === 'required')
          ? [] : ['availableAdoptions missing 0.3.0-check-docs-sh-gate [required] (missing gate is not adopted-filtered)']),
        ...(rep.availableAdoptions.some((a) => a.id === '0.3.0-design-review-gate' && a.impact === 'recommended')
          ? [] : ['availableAdoptions missing the recommended detectable:false entries']),
        ...exitWant(r, 0),
      ])
    } finally { rmSync(cmg, { recursive: true, force: true }) }
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
    // Missing state -> install-check-docs IS applicable (relocate), so the location
    // detail may honestly point at migrate.
    ...detailWant(rep, 'check-docs-sh-location', 'run /materia:migrate --plan'),
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
  // relocation changes are filtered as adopted. Since 0.3.0-design-review-gate (the
  // ledger's first recommended + detectable:false entry) the buckets can no longer
  // empty fully on a schema-behind repo — a non-detectable change is never filterable
  // as adopted (isAdopted keys on firing `ok` checks), so doctor truthfully reports
  // `warnings` (still exit 0) until the repo stamps to the current schema (relevance
  // keys on schema position; a stamped schema-3 repo sees none of THESE schema-window
  // buckets — the windowless listing is a separate axis that DOES surface schema-3's
  // detectable:false changes there). The bridge suggestion (/materia:migrate --plan —
  // the stamp-only step migrate has left) and the artifact-schema-current detail are
  // unchanged. Pins: requiredChanges stays empty and every surviving recommendedChanges
  // entry is detectable:false — i.e. all DETECTABLE drift is still filtered as adopted.
  // availableAdoptions is EMPTY here: the windowless set for a schema-2 repo is
  // 0.2.0.json's single detectable entry (project-state-file), which project-state-present
  // `ok` adopts away. Runs against the REAL shipped ledger via the doctor CLI.
  {
    const mu = mkdtempSync(join(tmpdir(), 'materia-doctor-moved-'))
    try {
      mkdirSync(join(mu, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(mu, 'MATERIA.md'), '# m\n')
      writeFileSync(join(mu, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(mu, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 2, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      check('moved-but-unstamped', mu, (rep, r) => [
        ...want(rep, 'status', 'warnings'),
        ...want(rep, 'currentSchema', 2),
        ...want(rep, 'suggestedNextCommand', '/materia:migrate --plan'), // the bridge
        ...sevWant(rep, 'check-docs-sh-present', 'ok'),
        ...sevWant(rep, 'check-docs-sh-location', 'ok'),
        ...detailWant(rep, 'artifact-schema-current', 'adopted but unstamped'),
        ...(rep.requiredChanges.length === 0 ? [] : ['gate/relocation not filtered as adopted (requiredChanges non-empty)']),
        ...(rep.recommendedChanges.every((ch) => ledgerChangeById(ch.id)?.detectable === false)
          ? [] : ['a DETECTABLE recommended change was not filtered as adopted']),
        // Windowless-at-2 = 0.2.0's single detectable entry, adopted-filtered -> empty.
        ...(rep.availableAdoptions.length === 0 ? [] : [`availableAdoptions must be empty at schema 2 (windowless entry adopted-away), got ${JSON.stringify(rep.availableAdoptions.map((a) => a.id))}`]),
        ...exitWant(r, 0),
      ])
    } finally { rmSync(mu, { recursive: true, force: true }) }
  }

  // synthetic hand-authored schema-1 state + canonical script -> the bridge must NOT
  // fire. The adopted-drift filter clears all DETECTABLE drift (the artifacts ARE
  // present), but migrate refuses to stamp a schema<2 hand-authored state
  // (install-check-docs disposition 1 = manual, the never-overwrite guarantee).
  // Since the ledger's first recommended + detectable:false entry
  // (0.3.0-design-review-gate), a schema-behind repo carries a truthful pending
  // recommended change -> `warnings` (exit 0), and the ≥warning severity legitimately
  // suggests /materia:migrate --plan — --plan is read-only and reports the change as
  // manual, so the suggestion is fulfillable (unlike the withheld stamp bridge, which
  // stays withheld: the detail still says by-hand review).
  {
    const s1 = mkdtempSync(join(tmpdir(), 'materia-doctor-schema1-'))
    try {
      mkdirSync(join(s1, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(s1, 'MATERIA.md'), '# m\n')
      writeFileSync(join(s1, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(s1, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 1, pluginVersion: null, source: 'hand-authored', appliedMigrations: [] }))
      check('schema1-no-bridge', s1, (rep, r) => [
        ...want(rep, 'status', 'warnings'),
        ...want(rep, 'currentSchema', 1),
        // ≥warning severity (the pending non-detectable recommended change) suggests
        // --plan; the stamp bridge itself stays withheld — the detail pins that.
        ...want(rep, 'suggestedNextCommand', '/materia:migrate --plan'),
        ...detailWant(rep, 'artifact-schema-current', 'needs by-hand review'),
        // Windowless-at-1 = 0.1.0.json's changes, of which there are zero (baseline) -> empty.
        ...(rep.availableAdoptions.length === 0 ? [] : [`availableAdoptions must be empty at schema 1 (0.1.0 baseline has no changes), got ${JSON.stringify(rep.availableAdoptions.map((a) => a.id))}`]),
        ...exitWant(r, 0),
      ])
    } finally { rmSync(s1, { recursive: true, force: true }) }
  }

  // …and the sibling wording guard: present schema-1 state + ROOT-only script. The
  // location check must NOT point at migrate (install-check-docs classifies a present
  // schema<2 state as manual — the never-overwrite guarantee), so the warning detail
  // says move-by-hand. Same defect class as the bridge gate above, pinned on the
  // check-docs-sh-location wording branch.
  {
    const s1r = mkdtempSync(join(tmpdir(), 'materia-doctor-schema1-root-'))
    try {
      mkdirSync(join(s1r, '.materia'), { recursive: true })
      mkdirSync(join(s1r, 'scripts'), { recursive: true })
      writeFileSync(join(s1r, 'MATERIA.md'), '# m\n')
      writeFileSync(join(s1r, 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(s1r, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 1, pluginVersion: null, source: 'hand-authored', appliedMigrations: [] }))
      check('schema1-root-script-wording', s1r, (rep) => [
        ...sevWant(rep, 'check-docs-sh-location', 'warning'),
        ...detailWant(rep, 'check-docs-sh-location', 'move it by hand'),
      ])
    } finally { rmSync(s1r, { recursive: true, force: true }) }
  }

  // synthetic docs-relocation false-positive -> the ok-PRECEDENCE that is the whole point of
  // the 0.4.0 relocation. A schema-4 (current) repo with the agent tree already at
  // .materia/docs/ AND the user's OWN root docs/README.md: docs-location must read `ok` (the
  // .materia/docs/ presence wins regardless of any root docs/, which is henceforth the user's),
  // so 0.4.0-docs-relocation is adopted-filtered and the repo reads fully `healthy`. If this
  // ever regressed to drift, every relocated repo that also kept a human docs/ would redden.
  {
    const fp = mkdtempSync(join(tmpdir(), 'materia-doctor-docs-fp-'))
    try {
      mkdirSync(join(fp, '.materia', 'scripts'), { recursive: true })
      mkdirSync(join(fp, '.materia', 'docs'), { recursive: true })
      mkdirSync(join(fp, 'docs'), { recursive: true })
      writeFileSync(join(fp, 'MATERIA.md'), '# m\n')
      writeFileSync(join(fp, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(fp, '.materia', 'docs', 'README.md'), '# agent docs\n')
      writeFileSync(join(fp, 'docs', 'README.md'), '# the user\'s OWN docs\n') // the collision the ok-precedence tolerates
      writeFileSync(join(fp, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 4, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      check('docs-location-false-positive', fp, (rep, r) => [
        ...want(rep, 'status', 'healthy'),
        ...want(rep, 'currentSchema', 4),
        ...sevWant(rep, 'docs-location', 'ok'), // .materia/docs/ present -> ok DESPITE the root docs/README.md
        ...(rep.requiredChanges.length === 0 ? [] : [`requiredChanges must be empty (docs-relocation adopted via ok-precedence), got ${JSON.stringify(rep.requiredChanges.map((c) => c.id))}`]),
        ...exitWant(r, 0),
      ])
    } finally { rmSync(fp, { recursive: true, force: true }) }
  }

  // synthetic floor-state docs drift wording -> the analog of schema1-root-script-wording.
  // A present hand-authored schema-1 state + a legacy docs/README.md router (and no
  // .materia/docs/) is genuine docs-location drift, but migrate REFUSES to relocate/stamp a
  // schema<2 hand-authored state (relocate-docs' project-state floor), so the drift detail must
  // say move-by-hand, NEVER point at a /materia:migrate command migrate would decline.
  {
    const df = mkdtempSync(join(tmpdir(), 'materia-doctor-docs-floor-'))
    try {
      mkdirSync(join(df, '.materia'), { recursive: true })
      mkdirSync(join(df, 'docs'), { recursive: true })
      writeFileSync(join(df, 'MATERIA.md'), '# m\n')
      writeFileSync(join(df, 'docs', 'README.md'), '# legacy router\n') // the materia-shaped drift trigger
      writeFileSync(join(df, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 1, pluginVersion: null, source: 'hand-authored', appliedMigrations: [] }))
      check('docs-location-floor-wording', df, (rep) => [
        ...sevWant(rep, 'docs-location', 'blocked'),
        ...detailWant(rep, 'docs-location', 'by hand'), // move-by-hand wording, not a migrate command
      ])
    } finally { rmSync(df, { recursive: true, force: true }) }
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
    console.log('  ✓ doctor behavior: tracked→healthy(schema 4, location+docs-location ok, windowless listing non-empty) · acknowledged-current→healthy(all acked→availableAdoptions empty, count hidden) · current-missing-gate→warnings(windowless surfaces [required] gate) · legacy→warnings(gate+docs-relocation adopted-away→requiredChanges empty, relocation recommended) · gnarly→action-needed(exit 1, required gate drift; docs-relocation adopted-away) · moved-but-unstamped→warnings(non-detectable recommended entry; detectable drift adopted-away; +bridge suggests migrate; windowless empty) · schema1+script→warnings(stamp bridge withheld, --plan suggested; windowless empty) · docs-location-false-positive→healthy(.materia/docs ok-precedence over root docs/) · docs-location-floor-wording→drift blocked, move-by-hand · non-materia→unknown · malformed→blocked · future/zero/negative-schema→blocked(exit 2) · synthetic required-change→action-needed(exit 1, via inspect())')
}

// ---- 7b. doctor's design-gate reporting layer — NEGATIVE invariants ---------
// doctor.mjs gained a read-only report that scans the target's per-run
// .materia/docs/specs/<run>/design.md approval blocks (legacy docs/specs/ fallback for
// un-migrated repos). That layer is explicitly OUTSIDE
// the release/artifact compatibility contract, so we pin only what it must NOT
// do — NEVER its positive output shape (section text / JSON key), which would
// ossify an out-of-contract surface and defeat the point of keeping it separate.
// Two invariants:
//   (a) inspect() (lib/materia-contract.mjs) must stay free of per-run-output
//       scanning. inspect() is shared VERBATIM with migrate and its check-id set
//       is pinned by §7's KNOWN_CHECK_IDS set-equality — a docs/specs scan there
//       would be a new, unpinned check surface on a per-run output that lives
//       outside the contract. Static: the string `docs/specs` must not appear.
//   (b) the design-gate scan must never influence doctor's exit code. doctor's
//       EXIT table keys ONLY on report.status; the scan is attached as a separate
//       key at print time and `report` stays pristine. Behavioral: a healthy
//       synthetic repo reports the SAME status+exit with and without a pending
//       design.md. Liveness + filtering are asserted through the HUMAN render
//       only (pending run named; approved sibling + _templates absent) — the
//       JSON key and entry fields stay unpinned so the layer can evolve.
{
  const before = failures
  const DOCTOR = resolve('plugins/materia/scripts/doctor.mjs')

  // (a) inspect() purity — no per-run-output scanning in the migrate-shared module.
  const contractSrc = readFileSync(resolve('plugins/materia/scripts/lib/materia-contract.mjs'), 'utf8')
  if (contractSrc.includes('docs/specs'))
    fail('design-gate layer: lib/materia-contract.mjs references docs/specs — the per-run design-gate scan must live in doctor.mjs ONLY. inspect() is shared verbatim with migrate and its check-id set is §7-pinned; per-run outputs are outside the compatibility contract and must never enter inspect().')

  // (b) exit-code independence — behavioral. Build a healthy schema-4 repo (with a
  // .materia/docs/ tree so docs-location reads `ok` and the schema-4 baseline is genuinely
  // healthy), note its status+exit, then plant a pending design.md under the RELOCATED
  // .materia/docs/specs/ tree (plus an approved sibling and a _templates dir that must both be
  // ignored) and prove status+exit are unchanged while the reporting surfaces the pending run.
  const dg = mkdtempSync(join(tmpdir(), 'materia-doctor-designgate-'))
  try {
    mkdirSync(join(dg, '.materia', 'scripts'), { recursive: true })
    mkdirSync(join(dg, '.materia', 'docs'), { recursive: true })
    writeFileSync(join(dg, 'MATERIA.md'), '# m\n')
    writeFileSync(join(dg, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
    writeFileSync(join(dg, '.materia', 'project.json'),
      JSON.stringify({ artifactSchema: 4, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
    const runJson = () => { const r = spawnSync('node', [DOCTOR, dg, '--json'], { encoding: 'utf8' }); let rep = null; try { rep = JSON.parse(r.stdout) } catch { /* asserted */ } return { r, rep } }

    // baseline — no specs tree at all
    const base = runJson()
    const problems = []
    if (!base.rep) problems.push(`baseline emitted no parseable JSON (exit ${base.r.status})`)
    else if (base.rep.status !== 'healthy') problems.push(`baseline synthetic schema-4 repo not healthy (got ${base.rep.status})`)
    const baseStatus = base.rep?.status, baseExit = base.r.status

    // plant a pending run + an approved sibling + a _templates dir, under the canonical
    // relocated .materia/docs/specs/ tree the scan now reads.
    const slug = '2026-01-01-000000-abc123-test'
    mkdirSync(join(dg, '.materia', 'docs', 'specs', slug), { recursive: true })
    writeFileSync(join(dg, '.materia', 'docs', 'specs', slug, 'design.md'),
      '---\napproval:\n  status: pending\n  rounds: 1\n  by: rick\n  at: 2026-01-01T00:00:00Z\n---\n# Test — design\n\nbody\n')
    const done = '2026-01-02-000000-def456-done'
    mkdirSync(join(dg, '.materia', 'docs', 'specs', done), { recursive: true })
    writeFileSync(join(dg, '.materia', 'docs', 'specs', done, 'design.md'),
      '---\napproval:\n  status: approved\n  rounds: 0\n  by: rick\n  at: 2026-01-02T00:00:00Z\n  design_hash: deadbeef\n---\n# Done — design\n')
    mkdirSync(join(dg, '.materia', 'docs', 'specs', '_templates'), { recursive: true })
    writeFileSync(join(dg, '.materia', 'docs', 'specs', '_templates', 'design.md'), '---\napproval:\n  status: pending\n---\n# tmpl\n')

    const withGate = runJson()
    if (!withGate.rep) problems.push(`with-gate emitted no parseable JSON (exit ${withGate.r.status})`)
    else if (withGate.rep.status !== baseStatus || withGate.r.status !== baseExit)
      problems.push(`a pending design.md changed doctor status/exit (status ${baseStatus}->${withGate.rep.status}, exit ${baseExit}->${withGate.r.status}) — the reporting layer must never influence exit codes`)
    // liveness + filtering via the human render only — no JSON-shape pins. Scope the
    // checks to the "Design gates:" section: this schema-4 repo also renders the
    // windowless adoption listing, whose adopt: migration prose legitimately mentions
    // .materia/docs/specs/_templates/… paths — a whole-stdout `_templates` scan would
    // false-trip on that unrelated surface. The design-gate section is what must skip _-dirs.
    const human = spawnSync('node', [DOCTOR, dg], { encoding: 'utf8' })
    const dgIdx = human.stdout.indexOf('Design gates:')
    const dgSection = dgIdx === -1 ? '' : human.stdout.slice(dgIdx)
    if (!dgSection.includes(slug)) problems.push('design-gate section does not name the pending run folder')
    if (dgSection.includes(done)) problems.push('design-gate section names the approved sibling — approved runs are healthy noise and must be skipped')
    if (dgSection.includes('_templates')) problems.push('design-gate section names _templates — underscore-prefixed dirs must be skipped')

    if (problems.length) fail(`design-gate layer [behavioral]: ${problems.join('; ')}`)
  } finally { rmSync(dg, { recursive: true, force: true }) }

  if (failures === before)
    console.log('  ✓ doctor design-gate layer (out-of-contract): inspect() free of docs/specs scanning; a pending design.md surfaces in --json + human render without changing status/exit (approved + _templates skipped)')
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
  // The repo-local parity oracle (≡ the shipped scaffold check-docs.sh, pinned byte-for-byte
  // by §1) — run against a MIGRATED tree to prove the escaped links the relocation exposes are
  // flagged loudly. Portable (pure Node), so it needs no awk lane.
  const ORACLE = resolve('scripts/check-docs-oracle.mjs')
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
  // referenceFollowUps hits are contract-sorted (file, then line) — assert reproducibility.
  const hitsSorted = (hits) => hits.every((h, i) =>
    i === 0 || hits[i - 1].file < h.file || (hits[i - 1].file === h.file && hits[i - 1].line <= h.line))
  // A follow-up's field shape: distinct from/to, to under .materia/, boolean autoFix/staleNow,
  // sorted non-empty hits with {file:string, line:number}.
  const followUpShapeProblems = (t) => {
    const p = []
    if (t.from === t.to) p.push(`follow-up from === to (${t.from})`)
    if (!String(t.to).startsWith('.materia/')) p.push(`follow-up to=${t.to} (want a .materia/ path)`)
    if (typeof t.autoFix !== 'boolean') p.push(`follow-up autoFix not boolean (${JSON.stringify(t.autoFix)})`)
    if (typeof t.staleNow !== 'boolean') p.push(`follow-up staleNow not boolean (${JSON.stringify(t.staleNow)})`)
    if (!Array.isArray(t.hits) || !t.hits.length) p.push('follow-up hits empty (only hit-bearing tokens are emitted)')
    else {
      if (!t.hits.every((h) => typeof h.file === 'string' && typeof h.line === 'number')) p.push('follow-up hit shape wrong (want {file, line})')
      if (!hitsSorted(t.hits)) p.push(`follow-up hits not sorted: ${JSON.stringify(t.hits)}`)
    }
    return p
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
        // Reference sweep (window-independent): EXACTLY the install-check-docs .sh token
        // surfaces — init-project-state carries no referenceSweep, proving it contributes
        // none. The package.json consumer (`sh scripts/check-docs.sh`) is the hit, NOT the
        // artifact's own header (excluded from the scan). Pre-apply staleNow is false (the
        // artifact has not yet moved to .materia/scripts/).
        const fu = report.referenceFollowUps ?? []
        const ids = [...new Set(fu.map((t) => t.id))]
        if (ids.length !== 1 || ids[0] !== 'install-check-docs')
          problems.push(`referenceFollowUps ids=${JSON.stringify(ids)} (want exactly [install-check-docs] — init-project-state contributes none)`)
        const sh = fu.find((t) => t.from === 'scripts/check-docs.sh')
        if (!sh) problems.push('referenceFollowUps missing the scripts/check-docs.sh token')
        else {
          problems.push(...followUpShapeProblems(sh))
          if (sh.autoFix !== true) problems.push('scripts/check-docs.sh token autoFix should be true (mechanical path swap)')
          if (sh.staleNow !== false) problems.push('pre-apply staleNow should be false (artifact not yet relocated)')
          if (!sh.hits.some((h) => h.file === 'package.json')) problems.push('follow-up hits missing the package.json consumer')
          if (sh.hits.some((h) => h.file === 'scripts/check-docs.sh')) problems.push('follow-up wrongly includes the from-path artifact\'s own header (should be excluded)')
        }
      }
      // Human rendering carries the follow-ups block (plan mode still writes nothing).
      const rh = spawnSync('node', [MIGRATE, work], { encoding: 'utf8' })
      if (!rh.stdout.includes('Reference follow-ups')) problems.push('human plan output lacks the Reference follow-ups block')
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
        // Fail-close the other way: a current repo (canonical gate, no stale consumers)
        // carries NO follow-ups — the scan finds nothing to sweep.
        if ((report.referenceFollowUps ?? []).length !== 0)
          problems.push(`referenceFollowUps=${JSON.stringify(report.referenceFollowUps)} (want none for a current repo)`)
      }
      // …and no follow-ups block in the human rendering either.
      const rh = spawnSync('node', [MIGRATE, work], { encoding: 'utf8' })
      if (rh.stdout.includes('Reference follow-ups')) problems.push('human output carries a Reference follow-ups block for a clean repo')
      const changed = diffKeys(snap, snapshot(work))
      if (changed.length) problems.push(`plan MUTATED the tree: ${changed.join(', ')}`)
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [plan-tracked]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 3. APPLY on a COPY of legacy -> ALL THREE migrations run (init-project-state creates the
  //    state at schema 2, install-check-docs relocates the root gate script and stamps
  //    schema 3, relocate-docs then stamps schema 4 and REFRESHES the just-relocated gate
  //    from the scaffold — the relocated legacy stub differs from the current scaffold gate,
  //    so it is backed up to .pre-schema4 and overwritten). Snapshot diff is EXACTLY
  //    {project.json created, root script removed, canonical script created, .pre-schema4
  //    backup created}; appliedMigrations carries all THREE ids once; re-apply idempotent
  //    (byte-identical); doctor then reports healthy at schema 4.
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
        const want = { artifactSchema: 4, pluginVersion: null, source: 'legacy-0.1.0', appliedMigrations: ['init-project-state', 'install-check-docs', 'relocate-docs'] }
        if (JSON.stringify(report.projectState) !== JSON.stringify(want))
          problems.push(`projectState=${JSON.stringify(report.projectState)} (want ${JSON.stringify(want)})`)
        if (report.status !== 'healthy') problems.push(`post-apply status=${report.status} (want healthy)`)
        // Post-apply the reference sweep re-scans: the artifact is now at its canonical
        // location, so the still-stale package.json consumer's staleNow flips to TRUE.
        const sh = (report.referenceFollowUps ?? []).find((t) => t.from === 'scripts/check-docs.sh')
        if (!sh) problems.push('post-apply referenceFollowUps missing the scripts/check-docs.sh token')
        else {
          if (sh.staleNow !== true) problems.push('post-apply staleNow should be true (artifact relocated; consumer now broken)')
          if (!sh.hits.some((h) => h.file === 'package.json')) problems.push('post-apply follow-up hits missing package.json')
          if (sh.hits.some((h) => h.file === '.materia/scripts/check-docs.sh')) problems.push('post-apply follow-up wrongly includes the relocated to-path artifact')
        }
      }
      // Exactly: project.json created, canonical script created (then refreshed), root script
      // removed, and the .pre-schema4 backup of the relocated legacy stub created.
      const changed = new Set(diffKeys(snap0, snap1))
      const wantChanged = new Set(['.materia/project.json', '.materia/scripts/check-docs.sh', '-scripts/check-docs.sh', '.materia/scripts/check-docs.sh.pre-schema4'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      // The refreshed gate now equals the scaffold gate; its backup preserves the relocated
      // legacy stub (the ORIGINAL fixture's root check-docs.sh bytes).
      const scaffoldGate = readFileSync(resolve('plugins/materia/scaffold/.materia/scripts/check-docs.sh'), 'utf8')
      if (readFileSync(join(work, '.materia/scripts/check-docs.sh'), 'utf8') !== scaffoldGate)
        problems.push('relocate-docs did not refresh the gate to the scaffold copy')
      const legacyStub = readFileSync(resolve('tests/fixtures/materia/legacy-0.1.0-project/scripts/check-docs.sh'), 'utf8')
      if (readFileSync(join(work, '.materia/scripts/check-docs.sh.pre-schema4'), 'utf8') !== legacyStub)
        problems.push('.pre-schema4 backup does not preserve the relocated legacy gate bytes')
      // Written file parses to the exact state (independent of the report echo).
      const onDisk = JSON.parse(readFileSync(join(work, '.materia/project.json'), 'utf8'))
      if (onDisk.artifactSchema !== 4 || onDisk.source !== 'legacy-0.1.0' ||
          JSON.stringify(onDisk.appliedMigrations) !== JSON.stringify(['init-project-state', 'install-check-docs', 'relocate-docs']))
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
      else {
        if (report.applied.length !== 0) problems.push(`applied=${JSON.stringify(report.applied)} (want none — already current)`)
        if ((report.referenceFollowUps ?? []).length !== 0)
          problems.push(`referenceFollowUps=${JSON.stringify(report.referenceFollowUps)} (want none — current repo, no stale consumers)`)
      }
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
  //    carries a stale scripts/check-docs.mjs, NO docs tree) -> init-project-state creates the
  //    state, install-check-docs COPIES the gate from the plugin scaffold to the canonical
  //    location and stamps schema 3, relocate-docs stamps schema 4 (docs-less -> docs-location
  //    ok -> stamp-only, no move). Its gate refresh is a NO-OP here: install-check-docs already
  //    copied the CURRENT scaffold gate, so the bytes match and NO .pre-schema4 backup is
  //    written — snapshot diff stays {project.json created, canonical script created}. The
  //    stale .mjs is UNTOUCHED and surfaced as a manual cleanup item; doctor-after is healthy.
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
        if (onDisk.artifactSchema !== 4) problems.push(`stamped schema=${onDisk.artifactSchema} (want 4)`)
        // The stale .mjs cleanup is surfaced (never auto-deleted).
        if (![...report.manual, ...report.notChanged].some((x) => /check-docs\.mjs/.test(x.reason || '')))
          problems.push('stale scripts/check-docs.mjs cleanup note not surfaced')
        // Reference sweep on gnarly: its MATERIA.md/CLAUDE.md name BOTH the old .sh and the
        // superseded .mjs, so both tokens surface. The .mjs token is a command-SHAPE change
        // (node → sh), never a mechanical path swap — assert autoFix:false (a free pin that
        // the replaced-artifact token is list-only).
        const mjs = (report.referenceFollowUps ?? []).find((t) => t.from === 'scripts/check-docs.mjs')
        if (!mjs) problems.push('referenceFollowUps missing the scripts/check-docs.mjs token (MATERIA.md/CLAUDE.md name it)')
        else {
          problems.push(...followUpShapeProblems(mjs))
          if (mjs.autoFix !== false) problems.push('scripts/check-docs.mjs token autoFix should be false (command-shape judgement, listed not swept)')
        }
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
  //     .materia/scripts/ AND root scripts/, NO docs tree) -> install-check-docs is stamp-only
  //     (disposition 3): the root copy is left UNTOUCHED and surfaced as a superseded-copy
  //     manual item, it stamps schema 3. relocate-docs then stamps schema 4 (docs-less ->
  //     stamp-only) and — because the synthetic canonical gate differs from the scaffold gate
  //     — REFRESHES it: the old canonBody is backed up to .pre-schema4 (a create, never a
  //     clobber) and the canonical is overwritten with the scaffold gate. So the diff is
  //     {project.json, canonical check-docs.sh (refreshed), .pre-schema4 backup}; the ROOT copy
  //     stays byte-identical. This is the backup-then-refresh contract that REPLACED the old
  //     "canonical copy is never overwritten" pin — the never-DESTROY guarantee holds (the
  //     original bytes survive in the backup), the never-blind-overwrite one is deliberately
  //     revised.
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
        if (!report.applied.some((m) => m.id === 'relocate-docs')) problems.push('relocate-docs not applied (stamp + gate refresh expected)')
        if (![...report.manual, ...report.notChanged].some((x) => /superseded/.test(x.reason || '') && /scripts\/check-docs\.sh/.test(x.reason || '')))
          problems.push('superseded root-copy manual item not surfaced')
        // The gate-refresh backup is surfaced as a relocate-docs manual follow-up.
        if (![...report.manual, ...report.notChanged].some((x) => /pre-schema4/.test(x.reason || '')))
          problems.push('gate-refresh backup (.pre-schema4) follow-up not surfaced')
        const onDisk = JSON.parse(readFileSync(join(dir, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 4) problems.push(`stamped schema=${onDisk.artifactSchema} (want 4)`)
      }
      // Backup-then-refresh: project.json + refreshed canonical + .pre-schema4 backup changed;
      // the ROOT copy stays byte-identical.
      const changed = new Set(diffKeys(snap0, snapshot(dir)))
      const wantChanged = new Set(['.materia/project.json', '.materia/scripts/check-docs.sh', '.materia/scripts/check-docs.sh.pre-schema4'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      if (readFileSync(join(dir, 'scripts', 'check-docs.sh'), 'utf8') !== rootBody) problems.push('root copy was mutated')
      // The canonical is refreshed to the scaffold gate; the backup preserves the ORIGINAL bytes.
      const scaffoldGate = readFileSync(resolve('plugins/materia/scaffold/.materia/scripts/check-docs.sh'), 'utf8')
      if (readFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), 'utf8') !== scaffoldGate) problems.push('canonical gate was not refreshed to the scaffold copy')
      if (readFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh.pre-schema4'), 'utf8') !== canonBody) problems.push('.pre-schema4 backup does not preserve the original canonical bytes')
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [apply-both-locations]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 11. Synthetic MOVED-BUT-UNSTAMPED repo (schema 2, gate script at the canonical
  //     location only, NO docs tree): the doctor↔migrate bridge. doctor reports `warnings` (the
  //     non-detectable recommended entry — see the doctor moved-but-unstamped fixture
  //     comment) and suggests /materia:migrate --plan; migrate has a stamp-only
  //     install-check-docs applicable and relocate-docs (stamp-only, docs-less); apply stamps
  //     schema 3 then 4, and — the synthetic gate differs from the scaffold — refreshes the
  //     canonical gate (old bytes -> .pre-schema4). Diff = {project.json, canonical gate,
  //     .pre-schema4}. re-apply is idempotent (byte-identical, backup NOT re-created).
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
      // doctor: warnings (the ledger's non-detectable recommended entry — see the
      // doctor moved-but-unstamped fixture comment) + bridge suggestion.
      const dr0 = spawnSync('node', [DOCTOR, dir, '--json'], { encoding: 'utf8' })
      let d0 = null; try { d0 = JSON.parse(dr0.stdout) } catch { /* below */ }
      if (!d0 || d0.status !== 'warnings') problems.push(`pre-apply doctor status=${d0 && d0.status} (want warnings — schema-behind + non-detectable recommended entry)`)
      if (!d0 || d0.suggestedNextCommand !== '/materia:migrate --plan') problems.push(`pre-apply doctor suggestedNextCommand=${d0 && d0.suggestedNextCommand} (want the bridge)`)
      // migrate plan: install-check-docs stamp-only applicable, files = project.json only.
      const { report: plan } = runMigrate(dir)
      if (!plan || !plan.applicable.some((m) => m.id === 'install-check-docs')) problems.push('install-check-docs not applicable (stamp-only)')
      if (plan && plan.applicable.some((m) => m.id === 'init-project-state')) problems.push('init-project-state wrongly applicable (state already present)')
      // apply: stamps schema 4, refreshes the canonical gate (old bytes -> .pre-schema4).
      const snap0 = snapshot(dir)
      const { r, report } = runMigrate(dir, '--apply')
      const changed = new Set(diffKeys(snap0, snapshot(dir)))
      const wantChanged = new Set(['.materia/project.json', '.materia/scripts/check-docs.sh', '.materia/scripts/check-docs.sh.pre-schema4'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      if (report) {
        const onDisk = JSON.parse(readFileSync(join(dir, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 4) problems.push(`post-apply schema=${onDisk.artifactSchema} (want 4)`)
        if (!onDisk.appliedMigrations.includes('install-check-docs')) problems.push('appliedMigrations missing install-check-docs')
        if (!onDisk.appliedMigrations.includes('relocate-docs')) problems.push('appliedMigrations missing relocate-docs')
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

  // 12. PLAN on a synthetic SCHEMA-4 (already-current, latest) repo whose CONSUMER is still
  //     stale: canonical gate script present, schema 4 stamped, but a Makefile still runs the
  //     old `sh scripts/check-docs.sh`. This is the literal first-migration failure mode — the
  //     migration window is empty (nothing applicable — the schema bump to 4 for the docs
  //     relocation is why this repo must sit at 4, not 3, to keep the window empty), yet the
  //     WINDOW-INDEPENDENT reference scan must STILL surface the stale consumer with
  //     staleNow:true (the artifact is at its canonical location, so the old-path reference is
  //     broken NOW). Plan writes nothing.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-schema4-stale-'))
    try {
      mkdirSync(join(dir, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 4, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      writeFileSync(join(dir, 'Makefile'), 'check:\n\tsh scripts/check-docs.sh\n')
      // Left-boundary pins: a NESTED path is a DIFFERENT file (never a hit — an
      // autoFix:true false positive would drive the skill to corrupt it, worst in
      // monorepos), while the relative-dot spelling is a genuine consumer (must hit).
      mkdirSync(join(dir, 'tools', 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'tools', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      writeFileSync(join(dir, 'tools', 'run.md'), 'Run `sh tools/scripts/check-docs.sh` here.\n')
      writeFileSync(join(dir, 'run-docs.md'), 'Run `./scripts/check-docs.sh` here.\n')
      // Frozen-folder pin: a dated run folder's old-path reference is a historical
      // artifact — the scan must never surface it (the skill would otherwise rewrite
      // frozen history).
      mkdirSync(join(dir, 'docs', 'specs', '2026-07-01-run'), { recursive: true })
      writeFileSync(join(dir, 'docs', 'specs', '2026-07-01-run', 'x.md'), 'ran `sh scripts/check-docs.sh` then\n')
      const snap = snapshot(dir)
      const { r, report } = runMigrate(dir)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.applicable.length !== 0) problems.push(`applicable=${JSON.stringify(report.applicable.map((m) => m.id))} (want none — schema 4, nothing in window)`)
        const sh = (report.referenceFollowUps ?? []).find((t) => t.from === 'scripts/check-docs.sh')
        if (!sh) problems.push('window-independent scan missed the stale consumer (schema-4-complete repo)')
        else {
          problems.push(...followUpShapeProblems(sh))
          if (sh.staleNow !== true) problems.push('staleNow should be true (canonical gate present; old-path reference broken now)')
          if (!sh.hits.some((h) => h.file === 'Makefile')) problems.push('follow-up hits missing the Makefile consumer')
          if (sh.hits.some((h) => h.file === 'tools/run.md')) problems.push('nested tools/scripts/check-docs.sh reference wrongly matched — the left boundary regressed (autoFix would corrupt a different file)')
          if (!sh.hits.some((h) => h.file === 'run-docs.md')) problems.push('relative-dot ./scripts/check-docs.sh consumer missed — the optional ./ group regressed')
          if (sh.hits.some((h) => h.file.startsWith('docs/specs/2026-07-01-run/'))) problems.push('frozen dated run folder surfaced in hits — the historical-artifact exclusion regressed (the sweep would rewrite frozen history)')
        }
      }
      const changed = diffKeys(snap, snapshot(dir))
      if (changed.length) problems.push(`plan MUTATED the tree: ${changed.join(', ')}`)
      problems.push(...exitWant(r, 0))
      if (problems.length) fail(`migrate [plan-schema4-stale-consumer]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 12b. APPLY on a COPY of the legacy-docs-layout fixture (schema 3, agent docs still at the
  //      legacy root docs/ with a tree-escaping ../MATERIA.md link, an old-roots gate stub):
  //      the relocate-docs AUTO-MOVE. apply relocates docs/ -> .materia/docs/, refreshes the
  //      stale-roots gate from the scaffold (old bytes -> .pre-schema4), and stamps schema 4;
  //      doctor-after is healthy. The pinned end state is the REAL one: tree at .materia/docs/,
  //      backup created, gate == scaffold, and — the "automated move surfaces link repairs
  //      loudly" contract — the refreshed gate (proxied by the byte-identical oracle) run
  //      against the migrated tree LISTS the now-short ../MATERIA.md escape as a broken link,
  //      the same breakage the relocate-docs manualNote tells the adopter to enumerate.
  {
    const work = copyFixture('legacy-docs-layout-project')
    try {
      const snap0 = snapshot(work)
      const { r, report } = runMigrate(work, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (!report.applied.some((m) => m.id === 'relocate-docs')) problems.push('relocate-docs not applied (auto-move expected)')
        if (report.status !== 'healthy') problems.push(`post-apply status=${report.status} (want healthy)`)
        const onDisk = JSON.parse(readFileSync(join(work, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 4) problems.push(`stamped schema=${onDisk.artifactSchema} (want 4)`)
        if (!onDisk.appliedMigrations.includes('relocate-docs')) problems.push('appliedMigrations missing relocate-docs')
        // relocate-docs surfaces BOTH the escape-link repair and the gate-refresh backup as
        // by-hand follow-ups (the move never rewrites file contents itself).
        const notes = [...report.manual, ...report.notChanged].map((x) => x.reason || '').join(' ')
        if (!/tree-escaping relative links/.test(notes)) problems.push('escape-link repair follow-up not surfaced')
        if (!/pre-schema4/.test(notes)) problems.push('gate-refresh backup (.pre-schema4) follow-up not surfaced')
      }
      // Real end state: docs/README.md -> .materia/docs/README.md, gate refreshed, backup made,
      // project.json stamped.
      const changed = new Set(diffKeys(snap0, snapshot(work)))
      const wantChanged = new Set(['-docs/README.md', '.materia/docs/README.md', '.materia/scripts/check-docs.sh', '.materia/scripts/check-docs.sh.pre-schema4', '.materia/project.json'])
      if (changed.size !== wantChanged.size || [...wantChanged].some((k) => !changed.has(k)))
        problems.push(`apply diff = ${JSON.stringify([...changed])} (want ${JSON.stringify([...wantChanged])})`)
      // Gate refreshed to the scaffold copy; backup preserves the fixture's old-roots stub.
      const scaffoldGate = readFileSync(resolve('plugins/materia/scaffold/.materia/scripts/check-docs.sh'), 'utf8')
      if (readFileSync(join(work, '.materia/scripts/check-docs.sh'), 'utf8') !== scaffoldGate) problems.push('gate was not refreshed to the scaffold copy')
      if (!existsSync(join(work, '.materia/scripts/check-docs.sh.pre-schema4'))) problems.push('.pre-schema4 backup not created')
      if (existsSync(join(work, 'docs', 'README.md'))) problems.push('legacy docs/ tree not relocated')
      // The refreshed gate (via the byte-identical oracle) flags the now-broken escape link.
      const oracle = spawnSync('node', [ORACLE], { cwd: work, encoding: 'utf8' })
      if (oracle.status === 0) problems.push('refreshed gate on the migrated tree found no broken link — the relocation should have exposed the escaping ../MATERIA.md')
      const gateOut = (oracle.stdout || '') + (oracle.stderr || '')
      if (!gateOut.includes('.materia/docs/README.md')) problems.push('refreshed gate did not name the escaped link .materia/docs/README.md as broken')
      problems.push(...exitWant(r, 0))
      // doctor↔migrate consistency: schema-4, healthy.
      const dr = spawnSync('node', [DOCTOR, work, '--json'], { encoding: 'utf8' })
      let drep = null; try { drep = JSON.parse(dr.stdout) } catch { /* below */ }
      if (!drep || drep.status !== 'healthy') problems.push(`doctor on migrated docs-layout status=${drep && drep.status} (want healthy)`)
      if (problems.length) fail(`migrate [apply-legacy-docs-layout]: ${problems.join('; ')}`)
    } finally { rmSync(work, { recursive: true, force: true }) }
  }

  // 12c. APPLY on a synthetic HUMAN-DOCS coexistence repo (schema 3, agent tree already at
  //      .materia/docs/ AND the user's OWN root docs/README.md, canonical gate == scaffold):
  //      the §7 docs-location-false-positive twin. docs-location is `ok` (precedence), so
  //      relocate-docs is STAMP-ONLY — no tree move, and the gate refresh no-ops (bytes already
  //      match the scaffold). apply stamps schema 4 with BOTH docs trees + the gate byte-
  //      untouched; the coexisting root docs/ is surfaced as a by-hand follow-up; doctor healthy.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-humandocs-'))
    try {
      mkdirSync(join(dir, '.materia', 'scripts'), { recursive: true })
      mkdirSync(join(dir, '.materia', 'docs'), { recursive: true })
      mkdirSync(join(dir, 'docs'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      // Canonical gate == the scaffold gate, so relocate-docs' refresh no-ops (no backup).
      const scaffoldGate = readFileSync(resolve('plugins/materia/scaffold/.materia/scripts/check-docs.sh'))
      writeFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), scaffoldGate)
      const agentDoc = '# agent docs\n', humanDoc = '# the user\'s OWN docs\n'
      writeFileSync(join(dir, '.materia', 'docs', 'README.md'), agentDoc)
      writeFileSync(join(dir, 'docs', 'README.md'), humanDoc) // the coexistence the ok-precedence tolerates
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }))
      const snap0 = snapshot(dir)
      const { r, report } = runMigrate(dir, '--apply')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (!report.applied.some((m) => m.id === 'relocate-docs')) problems.push('relocate-docs not applied (stamp-only expected)')
        const onDisk = JSON.parse(readFileSync(join(dir, '.materia/project.json'), 'utf8'))
        if (onDisk.artifactSchema !== 4) problems.push(`stamped schema=${onDisk.artifactSchema} (want 4)`)
        // The both-trees-coexist by-hand follow-up is surfaced.
        if (![...report.manual, ...report.notChanged].some((x) => /coexists/.test(x.reason || '')))
          problems.push('coexisting root docs/ follow-up not surfaced')
      }
      // Stamp only: EXACTLY project.json changed; both docs trees + the gate byte-untouched.
      const changed = diffKeys(snap0, snapshot(dir))
      if (changed.length !== 1 || changed[0] !== '.materia/project.json')
        problems.push(`apply changed more than project.json: ${JSON.stringify(changed)}`)
      if (readFileSync(join(dir, '.materia', 'docs', 'README.md'), 'utf8') !== agentDoc) problems.push('agent .materia/docs/ tree was mutated')
      if (readFileSync(join(dir, 'docs', 'README.md'), 'utf8') !== humanDoc) problems.push('the user\'s own root docs/ was mutated')
      if (existsSync(join(dir, '.materia', 'scripts', 'check-docs.sh.pre-schema4'))) problems.push('gate refresh wrongly fired (bytes already matched the scaffold — should no-op)')
      problems.push(...exitWant(r, 0))
      const dr = spawnSync('node', [DOCTOR, dir, '--json'], { encoding: 'utf8' })
      let drep = null; try { drep = JSON.parse(dr.stdout) } catch { /* below */ }
      if (!drep || drep.status !== 'healthy') problems.push(`doctor on stamped human-docs repo status=${drep && drep.status} (want healthy)`)
      if (problems.length) fail(`migrate [apply-human-docs-stamp-only]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // ---- --acknowledge behavior --------------------------------------------
  // A real, currently-shipped ledger change id to acknowledge against — DERIVED from
  // the runtime ledger (never hardcoded) so a future ledger edit can't silently
  // desync this suite from what --acknowledge actually validates against. Prefers the
  // one known-stable literal '0.3.0-design-tool-section' (an optional, detectable:false
  // 0.3.0 entry unlikely to be retired) when it's still present, falling back to
  // whatever id the ledger happens to carry first so the suite never hard-fails on a
  // ledger reshuffle.
  const ledgerChangeIds = readdirSync(resolve('plugins/materia/release/versions'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => { try { return JSON.parse(readFileSync(resolve('plugins/materia/release/versions', f), 'utf8')).changes ?? [] } catch { return [] } })
    .map((ch) => ch.id)
  const ACK_ID = ledgerChangeIds.includes('0.3.0-design-tool-section') ? '0.3.0-design-tool-section' : ledgerChangeIds[0]

  // 13. Happy path: schema-3 synthetic repo, --acknowledge one real id -> exit 0,
  //     written:true, acknowledgedChanges contains it (sorted-unique), every OTHER
  //     project.json field byte-identical to before, and doctor then shows that id
  //     GONE from availableAdoptions with acknowledgedCount incremented by one.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-ack-happy-'))
    try {
      mkdirSync(join(dir, '.materia', 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(dir, '.materia', 'scripts', 'check-docs.sh'), '#!/bin/sh\nexit 0\n')
      const before = { artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] }
      writeFileSync(join(dir, '.materia', 'project.json'), JSON.stringify(before))
      const dPre = spawnSync('node', [DOCTOR, dir, '--json'], { encoding: 'utf8' })
      let repPre = null; try { repPre = JSON.parse(dPre.stdout) } catch { /* below */ }
      const problems = []
      if (!repPre) problems.push('pre-ack doctor emitted no parseable JSON')
      else if (!repPre.availableAdoptions.some((a) => a.id === ACK_ID))
        problems.push(`pre-ack doctor availableAdoptions missing ${ACK_ID} (fixture setup assumption wrong)`)
      const preCount = repPre ? repPre.acknowledgedCount : null

      const { r, report } = runMigrate(dir, '--acknowledge', ACK_ID)
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.mode !== 'acknowledge') problems.push(`mode=${report.mode} (want acknowledge)`)
        if (report.written !== true) problems.push('written should be true')
        if (report.refused !== false) problems.push('refused should be false')
        if (!Array.isArray(report.projectState?.acknowledgedChanges) || !report.projectState.acknowledgedChanges.includes(ACK_ID))
          problems.push(`projectState.acknowledgedChanges missing ${ACK_ID}: ${JSON.stringify(report.projectState)}`)
      }
      problems.push(...exitWant(r, 0))
      const onDisk = JSON.parse(readFileSync(join(dir, '.materia', 'project.json'), 'utf8'))
      if (JSON.stringify(onDisk.acknowledgedChanges) !== JSON.stringify([ACK_ID]))
        problems.push(`on-disk acknowledgedChanges=${JSON.stringify(onDisk.acknowledgedChanges)} (want [${ACK_ID}], sorted-unique)`)
      for (const k of Object.keys(before))
        if (JSON.stringify(onDisk[k]) !== JSON.stringify(before[k])) problems.push(`on-disk field ${k} changed: ${JSON.stringify(onDisk[k])} (want ${JSON.stringify(before[k])})`)

      const dPost = spawnSync('node', [DOCTOR, dir, '--json'], { encoding: 'utf8' })
      let repPost = null; try { repPost = JSON.parse(dPost.stdout) } catch { /* below */ }
      if (!repPost) problems.push('post-ack doctor emitted no parseable JSON')
      else {
        if (repPost.availableAdoptions.some((a) => a.id === ACK_ID)) problems.push(`post-ack doctor still lists ${ACK_ID} in availableAdoptions`)
        if (repPost.acknowledgedCount !== preCount + 1) problems.push(`post-ack acknowledgedCount=${repPost.acknowledgedCount} (want ${preCount + 1})`)
      }
      if (problems.length) fail(`migrate [acknowledge-happy]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 14. Idempotent: re-running the SAME --acknowledge -> exit 0, no-op reported
  //     (written:false, alreadyAcknowledged includes the id), file bytes UNCHANGED.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-ack-idem-'))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      writeFileSync(join(dir, '.materia', 'project.json'),
        JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [], acknowledgedChanges: [ACK_ID] }))
      const before = readFileSync(join(dir, '.materia', 'project.json'), 'utf8')
      const { r, report } = runMigrate(dir, '--acknowledge', ACK_ID)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.written !== false) problems.push('written should be false (idempotent no-op)')
        if (report.refused !== false) problems.push('refused should be false (a no-op is not a refusal)')
        if (!report.alreadyAcknowledged.includes(ACK_ID)) problems.push(`alreadyAcknowledged=${JSON.stringify(report.alreadyAcknowledged)} (want it to include ${ACK_ID})`)
      }
      problems.push(...exitWant(r, 0))
      const after = readFileSync(join(dir, '.materia', 'project.json'), 'utf8')
      if (before !== after) problems.push('idempotent re-acknowledge changed file bytes')
      if (problems.length) fail(`migrate [acknowledge-idempotent]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 15. Unknown id -> exit 2, refused:true report with unknownIds, tree byte-unchanged,
  //     and — the render-path pin — toolFault is NOT a truthy field in the JSON (an
  //     acknowledge refusal must never be swallowed by / confused with the plan/apply
  //     toolFault branch).
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-ack-unknown-'))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      const before = JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] })
      writeFileSync(join(dir, '.materia', 'project.json'), before)
      const { r, report } = runMigrate(dir, '--acknowledge', 'not-a-real-ledger-change-id')
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.refused !== true) problems.push('refused should be true')
        if (!report.unknownIds.includes('not-a-real-ledger-change-id')) problems.push(`unknownIds=${JSON.stringify(report.unknownIds)}`)
        if (report.written !== false) problems.push('written should be false')
        if (report.toolFault) problems.push('toolFault must not be set for an acknowledge refusal')
      }
      problems.push(...exitWant(r, 2))
      if (readFileSync(join(dir, '.materia', 'project.json'), 'utf8') !== before) problems.push('unknown-id acknowledge OVERWROTE project.json')
      if (problems.length) fail(`migrate [acknowledge-unknown-id]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 16. --plan --acknowledge <id> -> exit 0, mode acknowledge-plan, written:false,
  //     would-be projectState shown, nothing written to disk.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-ack-plan-'))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      const before = JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] })
      writeFileSync(join(dir, '.materia', 'project.json'), before)
      const { r, report } = runMigrate(dir, '--plan', '--acknowledge', ACK_ID)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.mode !== 'acknowledge-plan') problems.push(`mode=${report.mode} (want acknowledge-plan)`)
        if (report.written !== false) problems.push('written should be false (--plan preview)')
        if (report.refused !== false) problems.push('refused should be false')
        if (!report.projectState?.acknowledgedChanges?.includes(ACK_ID)) problems.push(`would-be projectState missing ${ACK_ID}: ${JSON.stringify(report.projectState)}`)
      }
      problems.push(...exitWant(r, 0))
      if (readFileSync(join(dir, '.materia', 'project.json'), 'utf8') !== before) problems.push('--plan --acknowledge WROTE to project.json')
      if (problems.length) fail(`migrate [acknowledge-plan-preview]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 17. --apply --acknowledge <id> -> mutually exclusive modes, refused, exit 2,
  //     nothing written.
  {
    const dir = mkdtempSync(join(tmpdir(), 'materia-migrate-ack-apply-conflict-'))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      const before = JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] })
      writeFileSync(join(dir, '.materia', 'project.json'), before)
      const { r, report } = runMigrate(dir, '--apply', '--acknowledge', ACK_ID)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else if (report.refused !== true) problems.push('refused should be true (--apply + --acknowledge are mutually exclusive)')
      problems.push(...exitWant(r, 2))
      if (readFileSync(join(dir, '.materia', 'project.json'), 'utf8') !== before) problems.push('--apply --acknowledge WROTE to project.json')
      if (problems.length) fail(`migrate [acknowledge-apply-conflict]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 18. Missing operand: --acknowledge at the end of argv, and --acknowledge
  //     immediately followed by another flag -> both refused, exit 2.
  for (const [label, extraArgs] of [['end-of-argv', ['--acknowledge']], ['followed-by-flag', ['--acknowledge', '--json']]]) {
    const dir = mkdtempSync(join(tmpdir(), `materia-migrate-ack-missing-operand-${label}-`))
    try {
      mkdirSync(join(dir, '.materia'), { recursive: true })
      writeFileSync(join(dir, 'MATERIA.md'), '# m\n')
      const before = JSON.stringify({ artifactSchema: 3, pluginVersion: null, source: 'synthetic', appliedMigrations: [] })
      writeFileSync(join(dir, '.materia', 'project.json'), before)
      // Built directly (not via runMigrate, which appends --json at the END of argv —
      // that would make the 'followed-by-flag' case's own trailing --json the operand
      // lookalike, not a second, independent flag collision).
      const r = spawnSync('node', [MIGRATE, dir, '--json', ...extraArgs], { encoding: 'utf8' })
      let report = null; try { report = JSON.parse(r.stdout) } catch { /* asserted below */ }
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else if (report.refused !== true) problems.push('refused should be true (missing --acknowledge operand)')
      problems.push(...exitWant(r, 2))
      if (readFileSync(join(dir, '.materia', 'project.json'), 'utf8') !== before) problems.push('missing-operand acknowledge WROTE to project.json')
      if (problems.length) fail(`migrate [acknowledge-missing-operand-${label}]: ${problems.join('; ')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  // 19. schema-1 hand-authored state / malformed state -> refused (manual-style
  //     message), exit 2, nothing written (the same never-overwrite/stamp-floor
  //     guarantee plan/apply enforce elsewhere).
  {
    const s1 = synthState('ack-s1', '{ "artifactSchema": 1, "pluginVersion": null, "source": "hand", "appliedMigrations": [] }')
    try {
      const before = readFileSync(join(s1, '.materia', 'project.json'), 'utf8')
      const { r, report } = runMigrate(s1, '--acknowledge', ACK_ID)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else {
        if (report.refused !== true) problems.push('refused should be true (schema-1 hand-authored state)')
        if (!/expected >= 2/.test(report.reason || '')) problems.push(`reason lacks the schema-floor explanation: ${JSON.stringify(report.reason)}`)
      }
      problems.push(...exitWant(r, 2))
      if (readFileSync(join(s1, '.materia', 'project.json'), 'utf8') !== before) problems.push('schema-1 acknowledge OVERWROTE project.json')
      if (problems.length) fail(`migrate [acknowledge-schema1]: ${problems.join('; ')}`)
    } finally { rmSync(s1, { recursive: true, force: true }) }

    const raw = '{ not valid json'
    const mf = synthState('ack-mf', raw)
    try {
      const { r, report } = runMigrate(mf, '--acknowledge', ACK_ID)
      const problems = []
      if (!report) problems.push('no parseable JSON')
      else if (report.refused !== true) problems.push('refused should be true (malformed state)')
      problems.push(...exitWant(r, 2))
      if (readFileSync(join(mf, '.materia', 'project.json'), 'utf8') !== raw) problems.push('malformed-state acknowledge OVERWROTE project.json')
      if (problems.length) fail(`migrate [acknowledge-malformed]: ${problems.join('; ')}`)
    } finally { rmSync(mf, { recursive: true, force: true }) }
  }

  if (failures === before)
    console.log('  ✓ migrate behavior: plan→no-mutate · apply(legacy)→init+install-check-docs+relocate-docs(relocate,gate-refresh+backup,stamp 4→doctor healthy) · apply(gnarly)→copy-from-scaffold+stamp 4(gate-refresh no-op, stale .mjs untouched) · both-locations→stamp-only+gate-refresh(root untouched, .pre-schema4 backup) · moved-but-unstamped→bridge+stamp 4+gate-refresh · legacy-docs-layout→auto-move+gate-refresh+stamp 4(refreshed gate flags the escaped link) · human-docs coexist→stamp-only(both trees byte-untouched) · idempotent · never overwrites valid/stale/malformed · tracked-noop · unknown/future/non-materia→no-write · referenceFollowUps: legacy plan/apply(.sh token, staleNow flips) · tracked/current→none · schema-4-stale-consumer(window-independent) · gnarly(.mjs autoFix:false) · --acknowledge: happy(doctor availableAdoptions shrinks+acknowledgedCount++) · idempotent(byte-stable) · unknown-id→refused(no toolFault) · --plan preview · --apply conflict→refused · missing-operand(end-of-argv/followed-by-flag)→refused · schema-1/malformed→refused(never overwritten)')
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
