'use strict'

/**
 * A shallow clone must not silently undercount a release.
 *
 * `readCommitRange` asks git for `<base>..HEAD` and trusts the answer. On a
 * shallow clone whose history is truncated BEFORE the base tag, `git log` does
 * not fail — it succeeds and returns only the commits it happens to have. So a
 * release reports fewer tickets than it contains, exits 0, and reads as a clean
 * run.
 *
 * The trap is that the obvious guards do not fire:
 *
 *   - the tag RESOLVES (`git rev-parse v1.0.0^{commit}` exits 0), so checking
 *     that the base exists proves nothing;
 *   - `0 commit(s) carry no ref` is reported, so the counter that exists to make
 *     a missed trailer visible confirms everything is accounted for.
 *
 * The positive signal is `git merge-base --is-ancestor <base> <head>`: it asks
 * whether the base is genuinely in THIS history, which is the question the range
 * depends on. It stays silent on a shallow clone deep enough to contain the base
 * — a blanket "is this repo shallow?" refusal would accuse that healthy case.
 * See `.claude/rules/negative-checks.md`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// An origin with six commits, each carrying a ref, tagged four commits back.
// `v1.0.0..HEAD` is therefore four commits and four tickets, always.
function origin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-shallow-origin-'))
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q', '.')
  git('config', 'user.email', 't@e.com')
  git('config', 'user.name', 'T')
  for (let i = 1; i <= 6; i++) {
    fs.appendFileSync(path.join(dir, 'f.txt'), `l${i}\n`)
    git('add', '-A')
    git('commit', '-q', '-m', `feat: change ${i}\n\nRefs: SKS-${i}`)
  }
  git('tag', 'v1.0.0', 'HEAD~4')
  writeConfig(dir)
  return dir
}

function writeConfig(dir) {
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS' } }), 'utf-8')
}

// Clone `src` at `depth`, then fetch tags — exactly what a CI job does.
function clone(src, depth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-shallow-ci-'))
  const target = path.join(dir, 'repo')
  execFileSync('git', ['clone', '-q', '--depth', String(depth), `file://${src}`, target], { stdio: 'ignore' })
  execFileSync('git', ['-C', target, 'fetch', '-q', '--tags', '--force'], { stdio: 'ignore' })
  writeConfig(target)
  return target
}

function run(argv, cwd) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: {},
  }).then((code) => ({ code, out: out.join('') }))
}

const json = (r) => JSON.parse(r.out)

test('the full clone is the truth: four tickets in the range', async () => {
  const r = await run(['released', 'v1.0.0..HEAD', '--json'], origin())
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(json(r).tickets.map((t) => t.ref).sort(), ['SKS-3', 'SKS-4', 'SKS-5', 'SKS-6'])
})

test('released refuses rather than undercount when the base is outside a shallow history', async () => {
  const repo = clone(origin(), 2)
  // Precondition: the tag resolves, so "does the base exist?" is not the guard.
  assert.doesNotThrow(() =>
    execFileSync('git', ['-C', repo, 'rev-parse', '-q', '--verify', 'v1.0.0^{commit}'], { stdio: 'ignore' }),
  )

  const r = await run(['released', 'v1.0.0..HEAD'], repo)
  assert.strictEqual(r.code, 1, 'must not report a partial range as a clean run')
  assert.match(r.out, /shallow/i, 'names the cause')
  assert.match(r.out, /v1\.0\.0/, 'names the base it could not reach')
  assert.ok(!/ticket\(s\) in /.test(r.out), 'no confident count is printed')
})

test('stage refuses too — it would move only the tickets it happened to see', async () => {
  const repo = clone(origin(), 2)
  fs.writeFileSync(
    path.join(repo, CONFIG_FILE),
    JSON.stringify({
      linear: { teamId: 'T1', teamKey: 'SKS' },
      release: { stages: [{ key: 'test', state: 'On Test' }] },
    }),
    'utf-8',
  )
  const r = await run(['stage', 'test', 'v1.0.0..HEAD'], repo)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /shallow/i)
})

// The STAYS-SILENT case, and the reason the check is not "is this repo shallow?":
// a shallow clone deep enough to contain the base has a COMPLETE range, and must
// behave exactly like a full one.
test('a shallow clone deep enough to contain the base is not accused', async () => {
  const repo = clone(origin(), 6)
  assert.strictEqual(
    execFileSync('git', ['-C', repo, 'rev-parse', '--is-shallow-repository']).toString().trim(),
    'true',
    'still a shallow repository',
  )
  const r = await run(['released', 'v1.0.0..HEAD', '--json'], repo)
  assert.strictEqual(r.code, 0, 'a complete range is a clean run')
  assert.deepStrictEqual(json(r).tickets.map((t) => t.ref).sort(), ['SKS-3', 'SKS-4', 'SKS-5', 'SKS-6'])
})

test('a full clone is never accused', async () => {
  const repo = clone(origin(), 100)
  const r = await run(['released', 'v1.0.0..HEAD', '--json'], repo)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(json(r).tickets.length, 4)
})
