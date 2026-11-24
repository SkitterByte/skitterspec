'use strict'

/**
 * `spec-env run` against a real repo (feat-autonomous-run): the record lands
 * in the primary checkout's state dir, a supervised run writes nothing, and the
 * hook's `compacted` stays silent on every cannot-tell.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  const code = process.exitCode
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  const exit = process.exitCode
  process.exitCode = code
  return { out, exit }
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}

function scaffold({ header = '', auto = null } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-run-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(dir, 'specs/.core/env.config.json', JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, ...(auto ? { auto } : {}) }))
  write(dir, '.gitignore', '/.spec-env/\n')
  write(dir, 'specs/in-progress/feat-x/00-overview.md', `# X\n\n> **Type:** Feature\n${header}\n`)
  write(dir, 'specs/in-progress/feat-x/01-one.md', '# Phase 1 — one ⬜\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

const recordOf = (dir) => path.join(dir, '.spec-env', 'runs', 'feat-x.json')
const spec = (dir, ...a) => runQuiet(['spec-env', 'run', ...a, '--dir', dir])

test('a supervised resolve writes no record', async () => {
  const dir = scaffold()
  const { out } = await spec(dir, 'resolve', 'feat-x', '--json')
  const r = JSON.parse(out)
  assert.deepStrictEqual([r.mode, r.modeFrom, r.record], ['supervised', 'default', null])
  assert.strictEqual(fs.existsSync(recordOf(dir)), false)
})

test('the header opts a spec in; the flag opts it back out', async () => {
  const dir = scaffold({ header: '> **Run:** auto' })
  const inn = JSON.parse((await spec(dir, 'resolve', 'feat-x', '--json')).out)
  assert.deepStrictEqual([inn.mode, inn.modeFrom], ['auto', 'header'])
  assert.ok(fs.existsSync(recordOf(dir)))
  // The active run now speaks for the mode; only a flag overrides it.
  const out = JSON.parse((await spec(dir, 'resolve', 'feat-x', '--supervised', '--json')).out)
  assert.deepStrictEqual([out.mode, out.modeFrom], ['supervised', 'flag'])
})

test('config default and --then ending', async () => {
  const dir = scaffold({ auto: { default: 'auto', then: 'push' } })
  const r = JSON.parse((await spec(dir, 'resolve', 'feat-x', '--then', 'pr', '--json')).out)
  assert.deepStrictEqual([r.mode, r.modeFrom, r.then, r.thenFrom], ['auto', 'config', 'pr', 'flag'])
})

test('a bad --then refuses with exit 1 and writes nothing', async () => {
  const dir = scaffold({ header: '> **Run:** auto' })
  const { exit, out } = await spec(dir, 'resolve', 'feat-x', '--then', 'merge')
  assert.strictEqual(exit, 1)
  assert.match(out, /not an ending/)
  assert.strictEqual(fs.existsSync(recordOf(dir)), false)
})

test('phase, stop, compacted and end build the record; the phase logs auto-commit', async () => {
  const dir = scaffold({ header: '> **Run:** auto' })
  await spec(dir, 'resolve', 'feat-x')
  await spec(dir, 'phase', 'feat-x', '1', '--commit', 'abc1234')
  await spec(dir, 'compacted', 'feat-x')
  await spec(dir, 'stop', 'feat-x', '--reason', 'manual steps')
  const ended = await spec(dir, 'end', 'feat-x', '--outcome', 'pr')
  assert.match(ended.out, /ended \(pr\) · compacted 1×, during phase 2/)
  const rec = JSON.parse(fs.readFileSync(recordOf(dir), 'utf8'))
  assert.deepStrictEqual(rec.phases.map((p) => [p.n, p.commit]), [[1, 'abc1234']])
  assert.deepStrictEqual(rec.stops.map((s) => [s.phase, s.reason]), [[2, 'manual steps']])
  assert.strictEqual(rec.active, false)
  const notes = JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-x.notes.json'), 'utf8'))
  assert.strictEqual(notes.decisions.at(-1).verdict, 'auto-commit')
})

test('compacted is silent with no run, no spec, or a corrupt record', async () => {
  const dir = scaffold()
  assert.deepStrictEqual(await spec(dir, 'compacted'), { out: '', exit: undefined })
  assert.strictEqual(fs.existsSync(recordOf(dir)), false)
  write(dir, '.spec-env/runs/feat-x.json', '{not json')
  assert.strictEqual((await spec(dir, 'compacted', 'feat-x')).out, '')
  assert.strictEqual(fs.readFileSync(recordOf(dir), 'utf8'), '{not json')
  assert.strictEqual((await spec(dir, 'compacted', 'feat-nope')).out, '')
})

test('phase with no active run records nothing', async () => {
  const dir = scaffold()
  const { out } = await spec(dir, 'phase', 'feat-x', '1')
  assert.match(out, /no active run/)
  assert.strictEqual(fs.existsSync(recordOf(dir)), false)
})
