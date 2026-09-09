'use strict'

/**
 * The gating check ACCUSES: it tells someone their spec is missing a decision.
 * So most of what follows is the stays-silent half
 * (`.claude/rules/negative-checks.md` §3) — healthy but unusual specs it must
 * say nothing about.
 *
 * The one that matters most is the legacy spec. This feature is adopted by
 * projects with a hundred finished specs that predate it; if adopting gating
 * lit up every one of them, nobody would adopt it. That is why the completed
 * and cancelled buckets are out of range structurally rather than filtered.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { loadGatingConfig, readGatingField, checkGating } = require('../src/gating.js')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function project({ gating = true, specs = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gating-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  if (gating) {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'gating.config.json'),
      JSON.stringify({ guidance: '.claude/rules/feature-flags.md' }),
    )
  }
  for (const { name, bucket, header } of specs) {
    const d = path.join(dir, 'specs', bucket, name)
    fs.mkdirSync(d, { recursive: true })
    const line = header === undefined ? '' : `> **Gating:** ${header}\n`
    fs.writeFileSync(path.join(d, '00-overview.md'), `# S\n\n> **Stack:** worktree\n${line}`)
  }
  return dir
}

const folders = (r) => r.findings.map((f) => f.folder)

// --- the check fires ---------------------------------------------------------

test('an active spec with no header is reported', () => {
  const dir = project({ specs: [{ name: 'feat-a', bucket: 'backlog' }] })
  const r = checkGating(dir)
  assert.deepStrictEqual(folders(r), ['feat-a'])
  assert.strictEqual(r.findings[0].kind, 'missing')
})

test('a bare "none" is reported as saying nothing', () => {
  const dir = project({ specs: [{ name: 'feat-a', bucket: 'in-progress', header: 'none' }] })
  const r = checkGating(dir)
  assert.strictEqual(r.findings[0].kind, 'invalid')
})

test('"none:" with an empty reason is no better than a bare none', () => {
  const dir = project({ specs: [{ name: 'feat-a', bucket: 'backlog', header: 'none:' }] })
  assert.strictEqual(checkGating(dir).findings[0].kind, 'invalid')
})

// --- stays silent ------------------------------------------------------------

test('with no config it checks nothing at all', () => {
  const dir = project({ gating: false, specs: [{ name: 'feat-a', bucket: 'backlog' }] })
  const r = checkGating(dir)
  assert.strictEqual(r.configured, false)
  assert.deepStrictEqual(r.findings, [])
  assert.strictEqual(r.checked, 0, 'no spec is even read')
})

test('a named flag is a decision', () => {
  const dir = project({ specs: [{ name: 'feat-a', bucket: 'backlog', header: 'search-ranking-v2' }] })
  assert.deepStrictEqual(checkGating(dir).findings, [])
})

test('"none: <reason>" is a decision', () => {
  const dir = project({
    specs: [{ name: 'feat-a', bucket: 'backlog', header: 'none: additive, nothing to revert' }],
  })
  assert.deepStrictEqual(checkGating(dir).findings, [])
})

test('specs finished or abandoned before gating existed are never accused', () => {
  // The whole adoption story: 139 completed specs must not light up on day one.
  const dir = project({
    specs: [
      { name: 'feat-old', bucket: 'complete' },
      { name: 'feat-dropped', bucket: 'cancelled' },
    ],
  })
  const r = checkGating(dir)
  assert.deepStrictEqual(r.findings, [])
  assert.strictEqual(r.checked, 0, 'those buckets are not even in range')
})

test('a project with no spec folders at all is silent, not broken', () => {
  // git does not store empty directories, so a missing specs/backlog/ is the
  // ordinary state of a project with nothing queued.
  const dir = project({})
  assert.deepStrictEqual(checkGating(dir).findings, [])
})

// --- the field reader --------------------------------------------------------

test('readGatingField separates missing from invalid', () => {
  const dir = project({
    specs: [
      { name: 'a', bucket: 'backlog' },
      { name: 'b', bucket: 'backlog', header: '' },
    ],
  })
  assert.strictEqual(readGatingField(path.join(dir, 'specs/backlog/a')).kind, 'missing')
  assert.strictEqual(readGatingField(path.join(dir, 'specs/backlog/b')).kind, 'invalid')
})

test('the config falls back to defaults and never throws on absence', () => {
  const dir = project({ gating: false })
  const { config, present } = loadGatingConfig(dir)
  assert.strictEqual(present, false)
  assert.strictEqual(config.guidance, '')
  assert.strictEqual(config.default, 'none: <reason>')
})

// --- it advises, it does not gate -------------------------------------------

test('the CLI exits 0 even when it reports findings', () => {
  // The load-bearing assertion: this check must never be able to stop work.
  const dir = project({
    specs: [
      { name: 'feat-a', bucket: 'backlog' },
      { name: 'feat-b', bucket: 'in-progress', header: 'none' },
    ],
  })
  const out = execFileSync(process.execPath, [BIN, 'gating', 'check'], {
    cwd: dir,
    encoding: 'utf8',
  })
  assert.match(out, /record no decision/)
  assert.match(out, /feat-a/)
  assert.match(out, /feature-flags\.md/, 'cites the project guidance when set')
})

test('the CLI exits 0 with gating unconfigured', () => {
  const dir = project({ gating: false })
  const out = execFileSync(process.execPath, [BIN, 'gating', 'check'], {
    cwd: dir,
    encoding: 'utf8',
  })
  assert.match(out, /not configured/)
})
