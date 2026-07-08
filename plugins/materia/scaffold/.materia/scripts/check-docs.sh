#!/bin/sh
# Deterministic docs checker — no network, no AI. Portable POSIX sh + awk;
# the reference implementation of the Materia docs contract. Three layers:
#   1. Link check (CLAUDE.md + docs/**): every relative Markdown link resolves
#      to a real file on disk.
#   2. Anchor check (agent-context docs only): every `#fragment` in a relative
#      link resolves to a real GitHub-slug heading in the target file.
#   3. Style checks (CLAUDE.md + docs root + resources/ + standards/ +
#      _templates/ only): no change-narration phrases (matched across line
#      wraps), no over-long lines, no duplicated long lines, glossary stays
#      alphabetical.
# Exits non-zero (with the offending file:line) on any failure.
# Run: `sh .materia/scripts/check-docs.sh`. Override awk with AWK env var (e.g.
# `AWK='busybox awk' sh .materia/scripts/check-docs.sh`).
#
# Portability floor: strict POSIX sh (dash) + POSIX awk. Runs unmodified under
# mawk 1.3.4, busybox awk 1.36.1, and gawk 5.x (no gawk gensub/IGNORECASE, no
# bashisms).

set -u

# Pin the C locale so every stage — find, sort, and especially awk — is
# BYTE-oriented and deterministic. This checker processes UTF-8 as raw bytes on
# purpose (byte-sequence accent-fold keys, byte-counted code-point length, the
# multibyte-whitespace class), which matches Node's output. A multibyte-aware
# awk (gawk under a UTF-8 locale such as GitHub Actions' default C.UTF-8) would
# instead use CHARACTER semantics and diverge on non-ASCII slugs/glossary sorts;
# LC_ALL=C forces byte semantics everywhere, so the result is identical across
# mawk, busybox awk, and gawk regardless of the ambient locale.
export LC_ALL=C

# File discovery: ROOTS = CLAUDE.md + docs. `find` then LC_ALL=C sort (byte
# order == Node's default String.sort for ASCII paths). Roots are passed
# verbatim so paths come out shaped `CLAUDE.md` / `docs/standards/x.md` with no
# `./` prefix; a defensive strip happens in awk regardless. `-L` follows
# symlinks so symlinked `.md` files/dirs are walked too (mjs statSync/walk
# follows links) — the `N files` count then matches mjs. Same cyclic-symlink
# fragility as mjs, by design.
FILELIST=$(find -L CLAUDE.md docs -type f -name '*.md' 2>/dev/null | LC_ALL=C sort)
export FILELIST

AWK_BIN=${AWK:-awk}

$AWK_BIN '
# ---------------------------------------------------------------- primitives
function shq(s,   q,bs,i,c,out) {
  # single-quote a string for /bin/sh, escaping embedded single quotes.
  q = sprintf("%c", 39); bs = sprintf("%c", 92)
  out = q
  for (i = 1; i <= length(s); i++) {
    c = substr(s, i, 1)
    if (c == q) out = out q bs q q
    else out = out c
  }
  return out q
}
function exists(path) { return system("test -e " shq(path)) == 0 }

function indexFrom(s, needle, from,   p) {
  if (from > length(s)) return 0
  p = index(substr(s, from), needle)
  return p == 0 ? 0 : (from + p - 1)
}

function readFile(path,   s, line, r) {
  # Slurp whole file preserving exact bytes (RS=0x01 makes one record — see the
  # BEGIN note). Trailing newline (or its absence) is preserved. Closes so the
  # next read reopens at 0.
  s = ""
  while ((r = (getline line < path)) > 0) s = s line
  close(path)
  return s
}

function blankSeg(seg) { gsub(/[^\n]/, " ", seg); return seg }

# Blank code fences (``` and ~~~), shortest-match left-to-right, ordered like
# the JS non-greedy alternation /```[\s\S]*?```|~~~[\s\S]*?~~~/g. A fence opener
# pairs with the NEXT same-delimiter run; an opener with no partner is content
# (NOT blanked). Never a greedy regex — that would over-blank between two
# separate fences and silently exempt real violations.
function blankFences(s,   out, pos, L, a, t, op, delim, cl) {
  out = ""; pos = 1; L = length(s)
  while (pos <= L) {
    a = indexFrom(s, "```", pos)
    t = indexFrom(s, "~~~", pos)
    if (a == 0 && t == 0) { out = out substr(s, pos); break }
    if (a == 0) op = t
    else if (t == 0) op = a
    else op = (a < t ? a : t)
    delim = substr(s, op, 3)
    cl = indexFrom(s, delim, op + 3)
    if (cl == 0) {
      # unpaired opener: emit up to and including its first char as content.
      out = out substr(s, pos, op - pos + 1)
      pos = op + 1
      continue
    }
    out = out substr(s, pos, op - pos)
    out = out blankSeg(substr(s, op, cl + 3 - op))
    pos = cl + 3
  }
  return out
}

# Blank inline code /`[^`]*`/g (may span a wrapped line). Applied AFTER fences.
function blankInline(s,   out, pos, L, b1, b2) {
  out = ""; pos = 1; L = length(s)
  while (pos <= L) {
    b1 = indexFrom(s, "`", pos)
    if (b1 == 0) { out = out substr(s, pos); break }
    b2 = indexFrom(s, "`", b1 + 1)
    if (b2 == 0) { out = out substr(s, pos); break }
    out = out substr(s, pos, b1 - pos)
    out = out blankSeg(substr(s, b1, b2 - b1 + 1))
    pos = b2 + 1
  }
  return out
}

# UTF-8 code-point length matching Node String.length for BMP text: total bytes
# minus continuation bytes (0x80-0xBF). NOT awk length() (bytes). (Astral chars
# would count 1 here vs 2 in JS String.length — out of realistic-docs scope.)
function cpLen(s,   t) { t = s; return length(s) - gsub(CONTCLASS, "", t) }

function countNL(s,   t) { t = s; return gsub(/\n/, "", t) }

function trim(s) { gsub(/^[[:space:]]+/, "", s); gsub(/[[:space:]]+$/, "", s); return s }

# JS \s-aware whitespace helpers (see WSRE/WSMB in BEGIN).
# wsNorm: collapse every whitespace code point (ASCII incl. \n AND the Unicode
#   ws sequences) to a single ASCII space — for single-line / newline-free
#   contexts where the mjs `\s` regexes treat every ws (incl. a stray \n) alike
#   (slugify, fragment normalization, glossary term).
function wsNorm(s) { gsub(WSRE, " ", s); return s }
# wsNormNar: replace only the *multibyte* Unicode ws sequences (never \n) with a
#   single ASCII space, leaving ASCII bytes (incl. \n) untouched — for narration
#   prose, where line numbers derive from the \n count and the phraseRe
#   [[:space:]]+ already matches the ASCII ws (and \n line-wraps).
function wsNormNar(s) { gsub(WSMB, " ", s); return s }
# wsTrim: strip the full JS \s class at both ends only, interior bytes intact —
#   for mjs `.trim()` (link target, fragment, glossary term, dup key).
function wsTrim(s) { sub("^(" WSRE ")+", "", s); sub("(" WSRE ")+$", "", s); return s }

# Split on "\n" preserving JS String.split semantics (trailing empty kept).
function mysplit(s, arr,   n, start, p) {
  n = 0; start = 1
  while ((p = index(substr(s, start), "\n")) > 0) {
    n++; arr[n] = substr(s, start, p - 1); start = start + p
  }
  n++; arr[n] = substr(s, start)
  return n
}

# ---------------------------------------------------------------- slugify
# Manual /\[([^\]]*)\]\([^)]*\)/g -> $1 (no gensub). One level, no nesting.
function linkTextStrip(s,   out, i, L, c, br, par) {
  out = ""; i = 1; L = length(s)
  while (i <= L) {
    c = substr(s, i, 1)
    if (c == "[") {
      br = indexFrom(s, "]", i + 1)
      if (br > 0 && substr(s, br + 1, 1) == "(") {
        par = indexFrom(s, ")", br + 2)
        if (par > 0) { out = out substr(s, i + 1, br - (i + 1)); i = par + 1; continue }
      }
      out = out c; i++
    } else { out = out c; i++ }
  }
  return out
}
# GitHub-style heading slug (mirrors mjs slugify): lowercase, strip backticks,
# [text](url)->text, drop [^\w\s-] (\w == ASCII [A-Za-z0-9_], \s == JS Unicode
# ws), trim, [\s-]+->-. wsNorm first folds every ws code point (incl. NBSP and
# the other Unicode ws) to an ASCII space so the ASCII-class steps below are
# exactly the JS `\s` behavior (NBSP interior collapses to `-`, not dropped).
function slugify(s) {
  s = tolower(s)
  gsub(/`/, "", s)
  s = linkTextStrip(s)
  s = wsNorm(s)
  gsub(/[^A-Za-z0-9_ -]/, "", s)
  s = trim(s)
  gsub(/[ -]+/, "-", s)
  return s
}

# Heading detect + extract, mirroring /^#{1,6}\s+(.+)$/m on a single line.
# Sets HTEXT to the captured (.+) text. Returns 1 if the line is a heading.
# The `\s+` run after the hashes is JS-Unicode-aware (WSRE) so `### <NBSP>Title`
# is detected with HTEXT="Title". Residual narrowings (pathological/malformed
# input only, matching the mjs residual note): a *bare* `###` line with no
# same-line text does NOT borrow the next-line text the way the mjs cross-newline
# `\s+(.+)` does, and a line whose only post-hash content is whitespace is a
# non-heading here (mjs would keep the last ws char as a near-empty slug). Also,
# a "line" here is `\n`-delimited only (see mysplit); the mjs `/m` regex also
# treats a lone `\r`, U+2028, and U+2029 as line boundaries, so those three
# terminators (which never appear in a git-managed LF/CRLF repo — CRLF is safe)
# can desync heading detection. Same `\n`-line-model-vs-JS-line-terminator class.
function isHeading(line,   h, rest) {
  h = 0
  while (substr(line, h + 1, 1) == "#") h++
  if (h < 1 || h > 6) return 0
  rest = substr(line, h + 1)
  if (!match(rest, "^(" WSRE ")+")) return 0   # need `\s+` (>= 1 ws after hashes)
  rest = substr(rest, RLENGTH + 1)
  if (rest == "") return 0                      # (.+) needs >= 1 char
  HTEXT = rest
  return 1
}

# Populate SLUG[key SUBSEP slug] for a target .md file, with mjs duplicate-slug
# disambiguation (base, then base-N where N = count of existing slugs in the set
# that START WITH base — the exact, quirk-preserving mjs logic at lines ~70-82).
function computeSlugs(key,   raw, fb, n, i, base, kk, kp, sp, cnt, pre, newslug) {
  if (key in SLUGDONE) return
  SLUGDONE[key] = 1
  raw = readFile(key)
  fb = blankFences(raw)
  n = mysplit(fb, SLINES)
  pre = key SUBSEP
  for (i = 1; i <= n; i++) {
    if (!isHeading(SLINES[i])) continue
    base = slugify(HTEXT)
    if ((key SUBSEP base) in SLUG) {
      cnt = 0
      for (kk in SLUG) {
        if (substr(kk, 1, length(pre)) != pre) continue
        sp = substr(kk, length(pre) + 1)
        if (substr(sp, 1, length(base)) == base) cnt++
      }
      newslug = base "-" cnt
      SLUG[key SUBSEP newslug] = 1
    } else {
      SLUG[key SUBSEP base] = 1
    }
    SLUG[key SUBSEP base] = 1
  }
}

# ---------------------------------------------------------------- paths
function dirname(f,   p) {
  p = f
  if (index(p, "/") == 0) return "."
  sub(/\/[^\/]*$/, "", p)
  if (p == "") return "/"
  return p
}
# join(dir, path) then normalize . / .. == Node relative(cwd, resolve(dir,path)).
function joinNormalize(dir, path,   combined, n, i, tok, sp, res) {
  if (substr(path, 1, 1) == "/") combined = path
  else combined = dir "/" path
  n = split(combined, PARTS, "/")
  sp = 0
  for (i = 1; i <= n; i++) {
    tok = PARTS[i]
    if (tok == "" || tok == ".") continue
    if (tok == "..") {
      if (sp > 0 && STK[sp] != "..") sp--
      else { sp++; STK[sp] = ".." }
    } else { sp++; STK[sp] = tok }
  }
  res = ""
  for (i = 1; i <= sp; i++) res = res (i > 1 ? "/" : "") STK[i]
  if (res == "") res = "."       # resolved == cwd; test -e "." matches existsSync(cwd)
  return res
}

# isStyleChecked / isAnchorChecked (identical): CLAUDE.md, or under
# docs/resources|docs/standards|docs/_templates, or a docs/ root file.
function isStyle(f) {
  if (f == "CLAUDE.md") return 1
  if (f ~ /^docs\/resources\//) return 1
  if (f ~ /^docs\/standards\//) return 1
  if (f ~ /^docs\/_templates\//) return 1
  if (substr(f, 1, 5) == "docs/" && index(substr(f, 6), "/") == 0) return 1
  return 0
}

# ---------------------------------------------------------------- links
# Manual scan of /\[(?:[^[\]]|\[[^\]]*\])*\]\(([^)]+)\)/g. The nested-bracket text
# rule is deterministic (no backtracking freedom), so this is provably equal to
# the JS regex. Fills LURL[k]/LSTART[k] for k=1..LN, in match order.
function scanLinks(text,   i, L, j, ok, c, k, e, p) {
  LN = 0; i = 1; L = length(text)
  while (i <= L) {
    if (substr(text, i, 1) != "[") { i++; continue }
    j = i + 1; ok = 1
    while (j <= L) {
      c = substr(text, j, 1)
      if (c == "]") break
      if (c == "[") {
        k = indexFrom(text, "]", j + 1)
        if (k == 0) { ok = 0; break }
        j = k + 1
        continue
      }
      j++
    }
    if (!ok || j > L || substr(text, j, 1) != "]") { i++; continue }
    if (substr(text, j + 1, 1) != "(") { i++; continue }
    p = j + 2
    e = indexFrom(text, ")", p)
    if (e == 0 || e == p) { i++; continue }     # [^)]+ requires >= 1 char
    LN++
    LURL[LN] = substr(text, p, e - p)
    LSTART[LN] = i
    i = e + 1
  }
}

# ---------------------------------------------------------------- narration
function reEsc(w,   i, c, out, bs) {
  bs = sprintf("%c", 92); out = ""
  for (i = 1; i <= length(w); i++) {
    c = substr(w, i, 1)
    if (c == "(" || c == ")") out = out bs c
    else out = out c
  }
  return out
}
function phraseRe(p,   n, i, re) {
  n = split(p, RW, /[[:space:]]+/)
  re = ""
  for (i = 1; i <= n; i++) re = re (i > 1 ? "[[:space:]]+" : "") reEsc(RW[i])
  return re
}

# ---------------------------------------------------------------- collation
# Glossary uses localeCompare('en',{sensitivity:'base',numeric:true}):
# case-fold + Latin accent-fold (primary weights) + natural-numeric. Whitespace
# now matches JS \s exactly (WSRE). Remaining known narrowing (residual, out of
# realistic-glossary scope): ordering matches ICU for ASCII letters/digits + the
# folded Latin accents in the FOLD table, but high-ASCII punctuation ({ } ~,
# which byte-sort AFTER letters where ICU puts them before) and unfolded
# extended-Latin / other-script terms may order differently.
function foldAccents(s,   k) { for (k in FOLD) gsub(k, FOLD[k], s); return s }
function collKey(s) { return tolower(foldAccents(s)) }
function cmpNum(x, y,   xs, ys) {
  xs = x; ys = y
  sub(/^0+/, "", xs); sub(/^0+/, "", ys)
  if (length(xs) != length(ys)) return length(xs) < length(ys) ? -1 : 1
  if (xs < ys) return -1
  if (xs > ys) return 1
  return 0
}
function naturalCmp(a, b,   ka, kb, i, j, la, lb, ca, cb, na, nb, r) {
  ka = collKey(a); kb = collKey(b)
  i = 1; j = 1; la = length(ka); lb = length(kb)
  while (i <= la && j <= lb) {
    ca = substr(ka, i, 1); cb = substr(kb, j, 1)
    if (ca ~ /[0-9]/ && cb ~ /[0-9]/) {
      na = ""; while (i <= la && substr(ka, i, 1) ~ /[0-9]/) { na = na substr(ka, i, 1); i++ }
      nb = ""; while (j <= lb && substr(kb, j, 1) ~ /[0-9]/) { nb = nb substr(kb, j, 1); j++ }
      r = cmpNum(na, nb)
      if (r != 0) return r
    } else {
      if (ca != cb) return ca < cb ? -1 : 1
      i++; j++
    }
  }
  if (i > la && j > lb) return 0
  return i > la ? -1 : 1
}

function fail(msg) { print "  \342\234\227 " msg > "/dev/stderr"; FAILS++ }

BEGIN {
  # Slurp whole files via a control-byte record separator. NOT "\0": busybox
  # awk truncates the "\0" string literal to "" and falls into paragraph mode
  # (blank-line splitting), corrupting the read. 0x01 never appears in UTF-8
  # docs, so each getline returns the entire file as one record.
  RS = "\001"

  # continuation-byte class 0x80-0xBF (for code-point length).
  CONTCLASS = "["
  for (b = 128; b <= 191; b++) CONTCLASS = CONTCLASS sprintf("%c", b)
  CONTCLASS = CONTCLASS "]"

  # Whitespace classes reproducing the JS `\s` / String.trim() repertoire
  # (Unicode-aware) so parity holds on realistic input (e.g. an NBSP pasted
  # into markdown). WSMB = the multibyte UTF-8 sequences of the non-ASCII
  # members, built with decimal sprintf("%c") (mawk parses hex literals as 0):
  #   U+00A0 C2 A0 · U+1680 E1 9A 80 · U+2000-200A E2 80 80..8A ·
  #   U+2028/2029 E2 80 A8/A9 · U+202F E2 80 AF · U+205F E2 81 9F ·
  #   U+3000 E3 80 80 · U+FEFF EF BB BF. WSRE = WSMB PLUS the ASCII ws class
  #   ([[:space:]] covers space/\t/\n/\v/\f/\r). Verified identical under mawk
  #   1.3.4 and busybox awk 1.36.1 (dynamic multibyte-literal alternation).
  wsE2_80 = sprintf("%c%c", 226, 128)
  wsT3 = "["
  for (b = 128; b <= 138; b++) wsT3 = wsT3 sprintf("%c", b)   # U+2000-200A
  wsT3 = wsT3 sprintf("%c", 168) sprintf("%c", 169) sprintf("%c", 175) "]"  # U+2028/2029/202F
  WSMB = wsE2_80 wsT3 \
    "|" sprintf("%c%c%c", 226, 129, 159) \
    "|" sprintf("%c%c", 194, 160) \
    "|" sprintf("%c%c%c", 225, 154, 128) \
    "|" sprintf("%c%c%c", 227, 128, 128) \
    "|" sprintf("%c%c%c", 239, 187, 191)
  WSRE = "([[:space:]]|" WSMB ")"

  # bounded Latin-1 / Latin-Extended-A accent fold (base letter, en primary).
  buildFold()

  # NARRATION list — verbatim, in mjs order (emission order depends on it).
  NNAR = 0
  NAR[++NNAR] = "renamed from"
  NAR[++NNAR] = "formerly"
  NAR[++NNAR] = "previously"
  NAR[++NNAR] = "used to be"
  NAR[++NNAR] = "was removed"
  NAR[++NNAR] = "were removed"
  NAR[++NNAR] = "no longer"
  NAR[++NNAR] = "left untouched"
  NAR[++NNAR] = "(modified)"
  NAR[++NNAR] = "locked per"
  NAR[++NNAR] = "new exemption"

  # file list (strip a leading ./ defensively; skip blanks).
  M = 0
  cnt = split(ENVIRON["FILELIST"], RAWF, "\n")
  for (i = 1; i <= cnt; i++) {
    f = RAWF[i]
    if (substr(f, 1, 2) == "./") f = substr(f, 3)
    if (f == "") continue
    M++; FILES[M] = f
  }

  FAILS = 0

  # ---- link + anchor check (all files, sorted; in-file match order) --------
  for (fi = 1; fi <= M; fi++) {
    f = FILES[fi]
    text = blankInline(blankFences(readFile(f)))
    scanLinks(text)
    for (li = 1; li <= LN; li++) {
      url = LURL[li]
      hp = index(url, "#")
      if (hp > 0) {
        fragDef = 1
        target = substr(url, 1, hp - 1)
        rest = substr(url, hp + 1)
        hp2 = index(rest, "#")
        fragment = (hp2 > 0) ? substr(rest, 1, hp2 - 1) : rest
      } else {
        fragDef = 0; target = url; fragment = ""
      }
      path = wsTrim(target)
      if (path ~ /^https?:/ || path ~ /^mailto:/) continue
      if (path == "") {
        rkey = f; endsMd = (f ~ /\.md$/)
      } else {
        rkey = joinNormalize(dirname(f), path)
        endsMd = (rkey ~ /\.md$/)
        if (!exists(rkey)) { fail(f " -> " url); continue }
      }
      if (fragDef && isStyle(f) && endsMd) {
        want = wsTrim(fragment); want = tolower(want); want = wsNorm(want); gsub(/[ -]+/, "-", want)
        computeSlugs(rkey)
        want2 = want; sub(/-[0-9]+$/, "", want2)
        if (!((rkey SUBSEP want) in SLUG) && !((rkey SUBSEP want2) in SLUG))
          fail(f " -> " url " (no heading matches #" fragment ")")
      }
    }
  }

  # ---- style checks (style-checked files, sorted) --------------------------
  for (fi = 1; fi <= M; fi++) {
    f = FILES[fi]
    if (!isStyle(f)) continue
    raw = readFile(f)
    fb = blankFences(raw)
    prose = blankInline(fb)
    # Fold the multibyte Unicode ws to a space (\n preserved for line numbers) so
    # the phraseRe [[:space:]]+ assembles narration across an NBSP etc. like JS \s.
    lprose = tolower(wsNormNar(prose))

    # narration — phrases in NARRATION-list order, matches in position order.
    for (pi = 1; pi <= NNAR; pi++) {
      phrase = NAR[pi]
      re = phraseRe(phrase)
      base = 0; restp = lprose
      while (match(restp, re)) {
        st = base + RSTART
        pfx = substr(lprose, 1, st - 1)
        ln = countNL(pfx) + 1
        fail(f ":" ln " change-narration phrase \"" phrase "\" \342\200\224 describe the present state (docs/standards/docs.md)")
        adv = RSTART + (RLENGTH > 0 ? RLENGTH : 1)
        base = base + (adv - 1)
        restp = substr(restp, adv)
      }
    }

    # over-long + duplicated-long-line, in raw line order (per line: overlong
    # then dup — mirrors the mjs forEach).
    nl = mysplit(fb, FL)
    mysplit(raw, RL)
    for (i = 1; i <= nl; i++) {
      if (wsTrim(FL[i]) == "" && wsTrim(RL[i]) != "") continue    # inside a fence
      llen = cpLen(RL[i])
      if (llen > 600)
        fail(f ":" i " line is " llen " chars (max 600) \342\200\224 move detail out of the table cell (docs/standards/docs.md)")
      # dup key = mjs rawLine.trim(): strip Unicode ws at ENDS only, interior
      # bytes (incl. NBSP) intact — a space-vs-NBSP interior pair is not a dup.
      tr = wsTrim(RL[i])
      if (cpLen(tr) >= 100) {
        if ((f SUBSEP tr) in SEEN)
          fail(f ":" i " duplicates line " SEEN[f SUBSEP tr] " \342\200\224 copy-paste drift")
        else SEEN[f SUBSEP tr] = i
      }
    }
  }

  # ---- glossary order ------------------------------------------------------
  GLOSSARY = "docs/glossary.md"
  if (exists(GLOSSARY)) {
    n = mysplit(readFile(GLOSSARY), GL)
    nt = 0
    for (i = 1; i <= n; i++) {
      if (GL[i] !~ /^[|] ?\*\*/) continue
      split(GL[i], gp, "[|]")
      t = gp[2]
      gsub(/[*`]/, "", t)
      t = wsTrim(t)
      nt++; TERM[nt] = t; TLINE[nt] = i
    }
    for (i = 2; i <= nt; i++) {
      if (naturalCmp(TERM[i - 1], TERM[i]) > 0)
        fail(GLOSSARY ":" TLINE[i] " \"" TERM[i] "\" sorts before \"" TERM[i - 1] "\" (line " TLINE[i - 1] ") \342\200\224 keep the table alphabetical")
    }
  }

  # ---- trailer -------------------------------------------------------------
  if (FAILS > 0) {
    print "" > "/dev/stderr"
    printf "%d docs-check failure(s) across %d docs.\n", FAILS, M > "/dev/stderr"
    exit 1
  }
  printf "\342\234\223 docs check: %d files \342\200\224 links, anchors, style, glossary order all clean.\n", M
  exit 0
}

function buildFold() {
  # Latin-1 Supplement uppercase (0xC3 == 195, second byte 0x80..0xBF).
  # (Decimal only — mawk 1.3.4 parses hex literals like 0x80 as 0.)
  fold3(128, "a"); fold3(129, "a"); fold3(130, "a"); fold3(131, "a"); fold3(132, "a"); fold3(133, "a")
  fold3(135, "c")
  fold3(136, "e"); fold3(137, "e"); fold3(138, "e"); fold3(139, "e")
  fold3(140, "i"); fold3(141, "i"); fold3(142, "i"); fold3(143, "i")
  fold3(145, "n")
  fold3(146, "o"); fold3(147, "o"); fold3(148, "o"); fold3(149, "o"); fold3(150, "o"); fold3(152, "o")
  fold3(153, "u"); fold3(154, "u"); fold3(155, "u"); fold3(156, "u")
  fold3(157, "y")
  # Latin-1 lowercase.
  fold3(160, "a"); fold3(161, "a"); fold3(162, "a"); fold3(163, "a"); fold3(164, "a"); fold3(165, "a")
  fold3(167, "c")
  fold3(168, "e"); fold3(169, "e"); fold3(170, "e"); fold3(171, "e")
  fold3(172, "i"); fold3(173, "i"); fold3(174, "i"); fold3(175, "i")
  fold3(177, "n")
  fold3(178, "o"); fold3(179, "o"); fold3(180, "o"); fold3(181, "o"); fold3(182, "o"); fold3(184, "o")
  fold3(185, "u"); fold3(186, "u"); fold3(187, "u"); fold3(188, "u")
  fold3(189, "y"); fold3(191, "y")
  # A subset of Latin Extended-A (macrons / carons / etc.), both cases.
  # 0xC4 == 196, 0xC5 == 197.
  fold2(196, 128, "a"); fold2(196, 129, "a")   # A/a macron
  fold2(196, 146, "e"); fold2(196, 147, "e")   # E/e macron
  fold2(196, 170, "i"); fold2(196, 171, "i")   # I/i macron
  fold2(197, 140, "o"); fold2(197, 141, "o")   # O/o macron
  fold2(197, 170, "u"); fold2(197, 171, "u")   # U/u macron
  fold2(196, 140, "c"); fold2(196, 141, "c")   # C/c caron
  fold2(197, 160, "s"); fold2(197, 161, "s")   # S/s caron
  fold2(197, 189, "z"); fold2(197, 190, "z")   # Z/z caron
  fold2(197, 129, "l"); fold2(197, 130, "l")   # L/l stroke
  fold2(197, 131, "n"); fold2(197, 132, "n")   # N/n acute
  fold2(197, 152, "r"); fold2(197, 153, "r")   # R/r caron
}
function fold3(b, ch) { FOLD[sprintf("%c%c", 195, b)] = ch }
function fold2(lead, b, ch) { FOLD[sprintf("%c%c", lead, b)] = ch }
'
