#!/usr/bin/env node
'use strict'

/**
 * Docs freshness — when to re-read a docs page, asked of git.
 *
 * `docs-claims.test.js` verifies the pages' claims (named verbs and skills
 * exist, links resolve); nothing verifies the prose is still TRUE, and nothing
 * says when to re-read it. Each `docs/*.html` carries a coverage block —
 * `covers` globs naming the code it describes, and `verified`, the commit
 * someone last read it against — and this script turns those into three
 * advisory reports:
 *
 *   check          active specs with no `> **Docs:**` answer
 *   impact [base]  pages whose covered code this branch changed, page untouched
 *   stale          pages with commits in <verified>..HEAD touching their covers
 *
 * ALL THREE ALWAYS EXIT 0. A hit means "re-read this page", never "this page
 * is wrong" — lots of changes inside covered code leave the prose as it was,
 * and a report that fired as a failure on every refactor would be ignored
 * within a week. The one blocking check in this feature — a covers glob that
 * matches no file — lives in docs-freshness.test.js, because a dead glob
 * silences impact AND stale for that page for good.
 *
 * "Cannot tell" is a third state (.claude/rules/negative-checks.md rule 4):
 * a `verified` commit missing from the clone (a shallow CI checkout), a page
 * with no coverage block, an unresolvable base — each is reported as
 * `cannot tell — <reason>`, never as fresh, and still exits 0.
 *
 * What none of this checks: that a page is correct, or that `covers` lists
 * everything the concept depends on. Those are review questions. A quiet
 * `stale` means someone looked, not that the page is right.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const DOCS_DIR = 'docs'

// Only these two buckets are ever read by `check`.
//
// A SPEC WRITTEN BEFORE THIS CONVENTION EXISTED HAS NO HEADER AND IS NOT
// BROKEN. "No Docs: line" is evidence of an unanswered question only for a
// spec that could have been asked, and every finished or abandoned spec
// predates the question by definition. They are excluded STRUCTURALLY rather
// than by a filter someone must remember — a completed spec is not in range,
// so no future edit can make it fire. Pre-existing specs still in flight ARE
// reported, deliberately: they are live work and the question still applies.
// (Same reasoning as ACTIVE_BUCKETS in packages/common/src/gating.js.)
const ACTIVE_BUCKETS = ['backlog', 'in-progress']

// --- coverage block ---------------------------------------------------------

const BLOCK_RE = /<!--\s*coverage\s*\n([\s\S]*?)-->/

/**
 * Read the `<!-- coverage … -->` block out of a page's HTML.
 * Returns `{ covers, verified }` or `{ error }` — it never throws, because
 * every caller routes a malformed block to "cannot tell" or (in the test
 * file's validator) to a named assertion, not to a crash.
 */
function parseCoverage(html) {
  const m = BLOCK_RE.exec(html)
  if (!m) return { error: 'no coverage block' }
  const covers = []
  let verified = null
  for (const raw of m[1].split('\n')) {
    const line = raw.trim()
    if (!line || line === 'covers:') continue
    if (line.startsWith('- ')) {
      covers.push(line.slice(2).trim())
      continue
    }
    const v = /^verified:\s*(\S+)$/.exec(line)
    if (v) {
      verified = v[1]
      continue
    }
    return { error: `unrecognised line in coverage block: "${line}"` }
  }
  if (covers.length === 0) return { error: 'coverage block lists no covers' }
  if (!verified) return { error: 'coverage block has no verified commit' }
  return { covers, verified }
}

// --- glob matching ----------------------------------------------------------

/**
 * `*` matches within a path segment, `**` crosses segments — the same
 * semantics git gives a `:(glob)` pathspec, which is what `stale` hands these
 * globs to. Keeping the two matchers aligned is what lets `impact` (matching
 * in JS against a changed-file list) and `stale` (matching in git) answer the
 * same question about the same block.
 */
function globToRegExp(glob) {
  let re = ''
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` may match nothing at all (so `a/**/b` matches `a/b`)
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        re += '[^/]*'
        i += 1
      }
    } else {
      re += /[a-zA-Z0-9_\-/]/.test(c) ? c : '\\' + c
      i += 1
    }
  }
  return new RegExp(`^${re}$`)
}

function matchesAny(filePath, globs) {
  return globs.some((g) => globToRegExp(g).test(filePath))
}

// --- page discovery ---------------------------------------------------------

/** Every docs page, with its parsed block or its parse error. */
function listPages(root = process.cwd()) {
  const dir = path.join(root, DOCS_DIR)
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return [] // a tree with no docs/ has no pages to be stale — not an error
  }
  return names
    .filter((n) => n.endsWith('.html'))
    .sort()
    .map((name) => {
      const html = fs.readFileSync(path.join(dir, name), 'utf8')
      return { name, page: `${DOCS_DIR}/${name}`, ...parseCoverage(html) }
    })
}

// --- git --------------------------------------------------------------------

function git(root, args) {
  // stderr is piped, not inherited: a cannot-tell path reports its own one-line
  // reason, and git's usage dump underneath it would read as a crash.
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function resolveCommit(root, ref) {
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return true
  } catch {
    return false
  }
}

/** Changed paths: merge-base diff against `base`, plus the working tree. */
function changedFiles(root, base) {
  const changed = new Set()
  for (const line of git(root, ['diff', '--name-only', `${base}...HEAD`]).split('\n')) {
    if (line) changed.add(line)
  }
  for (const line of git(root, ['status', '--porcelain']).split('\n')) {
    if (!line) continue
    const entry = line.slice(3)
    // a rename reads `old -> new`; both sides are changes
    for (const p of entry.split(' -> ')) changed.add(p.trim().replace(/^"|"$/g, ''))
  }
  return changed
}

// --- check ------------------------------------------------------------------

const DOCS_HEADER_RE = /^> \*\*Docs:\*\*\s*(.*)$/m

/**
 * Active specs with no usable `Docs:` answer. A bare `none` is listed too:
 * the reason is what a reviewer can argue with, so `none` without one is a
 * shrug, not a decision (the same rule the Gating header has).
 */
function checkSpecs(root = process.cwd()) {
  const findings = []
  for (const bucket of ACTIVE_BUCKETS) {
    const dir = path.join(root, 'specs', bucket)
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue // AN EMPTY BUCKET IS NOT ON DISK: git drops empty directories
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      let specFile
      if (entry.isDirectory()) {
        specFile = path.join(dir, entry.name, '00-overview.md')
      } else if (entry.name.endsWith('.md')) {
        specFile = path.join(dir, entry.name) // legacy bare-file spec
      } else {
        continue
      }
      let text
      try {
        text = fs.readFileSync(specFile, 'utf8')
      } catch {
        continue // a folder with no overview is not this check's business
      }
      const name = entry.isDirectory() ? entry.name : entry.name.replace(/\.md$/, '')
      const m = DOCS_HEADER_RE.exec(text)
      if (!m) {
        findings.push({ spec: name, bucket, reason: 'no Docs: header' })
      } else if (!m[1].trim() || m[1].trim() === 'none' || m[1].trim() === 'none:') {
        findings.push({ spec: name, bucket, reason: 'bare none — the reason is the point' })
      }
    }
  }
  return findings
}

// --- impact -----------------------------------------------------------------

/**
 * Pages whose covered code this branch changed without the page itself being
 * edited. Changing a page alongside its code is the healthy case and stays
 * silent; so does a branch that touches nothing a page covers.
 */
function impact(root = process.cwd(), base) {
  const pages = listPages(root)
  const results = { flagged: [], cannotTell: [] }
  if (pages.length === 0) return results
  let changed
  try {
    changed = changedFiles(root, base)
  } catch (error) {
    results.cannotTell.push({ page: '(all)', reason: `git could not diff against '${base}': ${firstLine(error)}` })
    return results
  }
  for (const p of pages) {
    if (p.error) {
      results.cannotTell.push({ page: p.name, reason: p.error })
      continue
    }
    if (changed.has(p.page)) continue // page edited too — the healthy case
    const hits = [...changed].filter((f) => matchesAny(f, p.covers)).sort()
    if (hits.length > 0) results.flagged.push({ page: p.name, hits })
  }
  return results
}

// --- stale ------------------------------------------------------------------

/**
 * Pages with commits since their `verified` watermark touching their covers.
 * The globs go to git as `:(glob)` pathspecs — the same semantics
 * `globToRegExp` implements for `impact`.
 */
function stale(root = process.cwd()) {
  const results = { stale: [], cannotTell: [], fresh: [] }
  for (const p of listPages(root)) {
    if (p.error) {
      results.cannotTell.push({ page: p.name, reason: p.error })
      continue
    }
    // A SHALLOW CLONE HAS NO HISTORY TO ANSWER FROM: the verified commit not
    // resolving means "cannot tell", never "fresh" — reporting fresh here is
    // exactly the silent lie negative-checks.md rule 4 exists against.
    if (!resolveCommit(root, p.verified)) {
      results.cannotTell.push({ page: p.name, reason: `verified '${p.verified}' is not in this clone` })
      continue
    }
    let log
    try {
      log = git(root, [
        'log',
        '--oneline',
        `${p.verified}..HEAD`,
        '--',
        ...p.covers.map((g) => `:(glob)${g}`),
      ])
    } catch (error) {
      results.cannotTell.push({ page: p.name, reason: firstLine(error) })
      continue
    }
    const commits = log.split('\n').filter(Boolean)
    if (commits.length > 0) {
      results.stale.push({ page: p.name, verified: p.verified, commits: commits.length })
    } else {
      results.fresh.push(p.name)
    }
  }
  return results
}

// --- CLI --------------------------------------------------------------------

function firstLine(error) {
  const text = (error && error.stderr && String(error.stderr).trim()) || String((error && error.message) || error)
  return text.split('\n')[0]
}

function baseBranch(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'specs', '.core', 'env.config.json'), 'utf8'))
    if (typeof cfg.baseBranch === 'string' && cfg.baseBranch) return cfg.baseBranch
  } catch {
    // no isolation config — the default below answers
  }
  return 'main'
}

function main(argv) {
  const [cmd, arg] = argv
  const root = process.cwd()
  if (cmd === 'check') {
    const findings = checkSpecs(root)
    console.log('docs:check — active specs with no Docs: answer (advisory, exits 0)')
    if (findings.length === 0) {
      console.log('  every active spec has a Docs: answer')
    } else {
      for (const f of findings) console.log(`  ${f.bucket}/${f.spec} — ${f.reason}`)
    }
    return 0
  }
  if (cmd === 'impact') {
    const base = arg || baseBranch(root)
    const r = impact(root, base)
    console.log(`docs:impact — covered code changed vs ${base}, page untouched (advisory, exits 0)`)
    for (const c of r.cannotTell) console.log(`  ${c.page} — cannot tell — ${c.reason}`)
    if (r.flagged.length === 0) {
      console.log('  nothing to flag — re-read nothing')
    } else {
      for (const f of r.flagged) {
        console.log(`  ${f.page} — re-read it: ${f.hits.length} covered change(s)`)
        for (const h of f.hits.slice(0, 5)) console.log(`      ${h}`)
        if (f.hits.length > 5) console.log(`      … and ${f.hits.length - 5} more`)
      }
    }
    return 0
  }
  if (cmd === 'stale') {
    const r = stale(root)
    console.log('docs:stale — commits since each page was verified (advisory, exits 0)')
    for (const c of r.cannotTell) console.log(`  ${c.page} — cannot tell — ${c.reason}`)
    for (const s of r.stale) {
      console.log(`  ${s.page} — re-read it: ${s.commits} commit(s) since ${s.verified}`)
    }
    if (r.stale.length === 0 && r.cannotTell.length === 0) {
      console.log('  every page is fresh at its verified commit')
    }
    if (r.stale.length > 0) {
      console.log('  after re-reading, bump that page\'s `verified:` to the current HEAD')
    }
    return 0
  }
  console.log('usage: node scripts/docs-freshness.js <check | impact [base] | stale>')
  console.log('  advisory reports over the coverage blocks in docs/*.html — always exit 0')
  return 0
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)))
}

module.exports = {
  parseCoverage,
  globToRegExp,
  matchesAny,
  listPages,
  checkSpecs,
  impact,
  stale,
  DOCS_HEADER_RE,
}
