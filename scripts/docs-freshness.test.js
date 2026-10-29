'use strict'

/**
 * docs-freshness — unit tests.
 *
 * Every report here ACCUSES (it tells someone their docs need re-reading), so
 * per .claude/rules/negative-checks.md each firing case is paired with a
 * stays-silent test feeding it a healthy-but-unusual input, and every
 * cannot-tell is asserted to land in inaction — reported as such, exit 0,
 * never "fresh".
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  parseCoverage,
  globToRegExp,
  matchesAny,
  checkSpecs,
  impact,
  stale,
} = require('./docs-freshness.js')

const SCRIPT = path.join(__dirname, 'docs-freshness.js')

// --- fixtures ----------------------------------------------------------------

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-freshness-'))
}

function write(root, rel, content) {
  const file = path.join(root, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function git(root, ...args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args],
    { cwd: root, encoding: 'utf8' },
  )
}

function makeRepo() {
  const root = tmpdir()
  git(root, 'init', '-q', '-b', 'main')
  return root
}

function commitAll(root, msg) {
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '--no-verify', '-m', msg)
  return git(root, 'rev-parse', 'HEAD').trim()
}

function pageHtml(covers, verified) {
  const lines = covers.map((c) => `  - ${c}`).join('\n')
  return `<!-- coverage\ncovers:\n${lines}\nverified: ${verified}\n-->\n<!doctype html><title>t</title>\n`
}

// --- parser -------------------------------------------------------------------

test('parseCoverage reads covers and verified', () => {
  const p = parseCoverage(pageHtml(['src/**', 'lib/a.js'], 'abc1234'))
  assert.deepStrictEqual(p.covers, ['src/**', 'lib/a.js'])
  assert.strictEqual(p.verified, 'abc1234')
  assert.strictEqual(p.error, undefined)
})

test('parseCoverage names what is wrong, never throws', () => {
  assert.match(parseCoverage('<!doctype html>').error, /no coverage block/)
  assert.match(parseCoverage('<!-- coverage\nverified: a\n-->').error, /no covers/)
  assert.match(parseCoverage('<!-- coverage\ncovers:\n  - a\n-->').error, /no verified/)
  assert.match(
    parseCoverage('<!-- coverage\ncovers:\n  - a\nwat?\nverified: b\n-->').error,
    /unrecognised line/,
  )
})

// --- glob matcher -------------------------------------------------------------

test('* stays within a path segment; ** crosses them', () => {
  assert.ok(globToRegExp('packages/x/*.js').test('packages/x/a.js'))
  assert.ok(!globToRegExp('packages/x/*.js').test('packages/x/y/a.js'))
  assert.ok(globToRegExp('packages/x/**').test('packages/x/y/z/a.js'))
  assert.ok(globToRegExp('a/**/b.js').test('a/b.js'), '`**/` may match nothing')
  assert.ok(globToRegExp('a/**/b.js').test('a/x/y/b.js'))
})

test('a trailing * matches sibling files sharing the prefix', () => {
  // the shape the real blocks use: packages/common/src/env/review*
  assert.ok(matchesAny('src/env/review.js', ['src/env/review*']))
  assert.ok(matchesAny('src/env/review-serve.js', ['src/env/review*']))
  assert.ok(!matchesAny('src/env/gating.js', ['src/env/review*']))
})

test('a dot in a glob is a literal dot, not a regex any', () => {
  assert.ok(!matchesAny('src/axjs', ['src/a.js']))
  assert.ok(matchesAny('src/a.js', ['src/a.js']))
})

// --- check --------------------------------------------------------------------

test('check flags an active spec with no Docs: header, and a bare none', () => {
  const root = tmpdir()
  write(root, 'specs/backlog/feat-a/00-overview.md', '# a\n\n> **Status:** Ready\n')
  write(root, 'specs/in-progress/feat-b/00-overview.md', '# b\n\n> **Docs:** none\n')
  const found = checkSpecs(root)
  assert.deepStrictEqual(
    found.map((f) => f.spec).sort(),
    ['feat-a', 'feat-b'],
  )
})

test('STAYS SILENT: an answered Docs: header, either shape', () => {
  const root = tmpdir()
  write(root, 'specs/backlog/feat-a/00-overview.md', '> **Docs:** review, reference\n')
  write(root, 'specs/backlog/feat-b/00-overview.md', '> **Docs:** none: internal refactor, no reader-visible behaviour\n')
  assert.deepStrictEqual(checkSpecs(root), [])
})

test('STAYS SILENT: a completed spec with no header is out of range by construction', () => {
  // A spec written before the convention existed has no header and is not
  // broken — complete/ and cancelled/ are never read, so no edit can make
  // this fire on history.
  const root = tmpdir()
  write(root, 'specs/complete/feat-old/00-overview.md', '# old\n')
  write(root, 'specs/cancelled/feat-older/00-overview.md', '# older\n')
  assert.deepStrictEqual(checkSpecs(root), [])
})

test('STAYS SILENT: missing buckets are not findings', () => {
  // AN EMPTY BUCKET IS NOT ON DISK — git drops empty directories, so a repo
  // with nothing in flight has no specs/in-progress/ at all.
  assert.deepStrictEqual(checkSpecs(tmpdir()), [])
})

test('check reads a legacy bare-file spec', () => {
  const root = tmpdir()
  write(root, 'specs/backlog/feat-legacy.md', '# legacy, no header\n')
  assert.deepStrictEqual(checkSpecs(root).map((f) => f.spec), ['feat-legacy'])
})

// --- impact -------------------------------------------------------------------

function impactRepo() {
  const root = makeRepo()
  write(root, 'src/f.js', 'one\n')
  write(root, 'other.txt', 'one\n')
  write(root, 'docs/a.html', pageHtml(['src/**'], 'HEAD'))
  commitAll(root, 'base')
  git(root, 'switch', '-q', '-c', 'feature')
  return root
}

test('impact flags a page whose covered code changed without the page', () => {
  const root = impactRepo()
  write(root, 'src/f.js', 'two\n')
  commitAll(root, 'change covered code')
  const r = impact(root, 'main')
  assert.deepStrictEqual(r.flagged.map((f) => f.page), ['a.html'])
  assert.deepStrictEqual(r.flagged[0].hits, ['src/f.js'])
})

test('impact sees uncommitted and untracked changes too', () => {
  const root = impactRepo()
  write(root, 'src/new-file.js', 'untracked\n')
  const r = impact(root, 'main')
  assert.deepStrictEqual(r.flagged.map((f) => f.page), ['a.html'])
})

test('STAYS SILENT: the page was edited alongside its code — the healthy case', () => {
  const root = impactRepo()
  write(root, 'src/f.js', 'two\n')
  write(root, 'docs/a.html', pageHtml(['src/**'], 'HEAD') + '<!-- updated -->\n')
  commitAll(root, 'code and page together')
  assert.deepStrictEqual(impact(root, 'main').flagged, [])
})

test('STAYS SILENT: a change outside every cover', () => {
  const root = impactRepo()
  write(root, 'other.txt', 'two\n')
  commitAll(root, 'unrelated')
  assert.deepStrictEqual(impact(root, 'main').flagged, [])
})

test('impact reports a malformed page as cannot tell, not as clean', () => {
  const root = impactRepo()
  write(root, 'docs/broken.html', '<!doctype html>no block\n')
  commitAll(root, 'add pageless page')
  const r = impact(root, 'main')
  assert.deepStrictEqual(r.cannotTell.map((c) => c.page), ['broken.html'])
})

test('impact cannot diff an unknown base — cannot tell, not a crash', () => {
  const root = impactRepo()
  const r = impact(root, 'no-such-branch')
  assert.strictEqual(r.flagged.length, 0)
  assert.match(r.cannotTell[0].reason, /no-such-branch/)
})

// --- stale --------------------------------------------------------------------

test('stale flags commits since verified touching the covers', () => {
  const root = makeRepo()
  write(root, 'src/f.js', 'one\n')
  write(root, 'docs/a.html', 'placeholder\n')
  const first = commitAll(root, 'base')
  write(root, 'docs/a.html', pageHtml(['src/**'], first))
  commitAll(root, 'add coverage block')
  write(root, 'src/f.js', 'two\n')
  commitAll(root, 'drift')
  const r = stale(root)
  assert.deepStrictEqual(r.stale.map((s) => s.page), ['a.html'])
  assert.strictEqual(r.stale[0].commits, 1)
})

test('STAYS SILENT: verified at HEAD is fresh', () => {
  const root = makeRepo()
  write(root, 'src/f.js', 'one\n')
  write(root, 'docs/a.html', pageHtml(['src/**'], 'x'))
  const head = commitAll(root, 'base')
  write(root, 'docs/a.html', pageHtml(['src/**'], head))
  commitAll(root, 'verify page')
  const r = stale(root)
  assert.deepStrictEqual(r.stale, [])
  assert.deepStrictEqual(r.fresh, ['a.html'])
})

test('STAYS SILENT: commits since verified that touch nothing covered', () => {
  const root = makeRepo()
  write(root, 'docs/a.html', 'placeholder\n')
  const first = commitAll(root, 'base')
  write(root, 'docs/a.html', pageHtml(['src/**'], first))
  commitAll(root, 'add coverage block')
  write(root, 'elsewhere.txt', 'two\n')
  commitAll(root, 'unrelated drift')
  assert.deepStrictEqual(stale(root).stale, [])
})

test('an unknown verified commit is cannot tell — never fresh', () => {
  // A shallow CI checkout is the real case: the SHA exists upstream but not
  // in this clone, and "fresh" would be a silent lie about an unread page.
  const root = makeRepo()
  write(root, 'docs/a.html', pageHtml(['src/**'], 'ffffffffffffffffffffffffffffffffffffffff'))
  commitAll(root, 'base')
  const r = stale(root)
  assert.deepStrictEqual(r.fresh, [])
  assert.deepStrictEqual(r.stale, [])
  assert.match(r.cannotTell[0].reason, /not in this clone/)
})

// --- CLI: advisory means exit 0, including on cannot-tell ----------------------

function runCli(root, ...args) {
  // execFileSync throws on a non-zero exit, so returning at all asserts exit 0
  return execFileSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' })
}

test('every subcommand exits 0, hit or miss or cannot-tell', () => {
  const root = makeRepo()
  write(root, 'src/f.js', 'one\n')
  write(root, 'docs/a.html', pageHtml(['src/**'], 'ffffffffffffffffffffffffffffffffffffffff'))
  write(root, 'specs/backlog/feat-x/00-overview.md', '# x, no Docs header\n')
  commitAll(root, 'base')
  git(root, 'switch', '-q', '-c', 'feature')
  write(root, 'src/f.js', 'two\n')
  commitAll(root, 'drift')

  const check = runCli(root, 'check')
  assert.match(check, /feat-x/)

  const imp = runCli(root, 'impact', 'main')
  assert.match(imp, /a\.html — re-read it/)

  const st = runCli(root, 'stale')
  assert.match(st, /cannot tell/)
  assert.doesNotMatch(st, /fresh at its verified commit/)

  assert.match(runCli(root), /usage/)
})
