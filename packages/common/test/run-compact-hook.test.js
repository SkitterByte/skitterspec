'use strict'

/**
 * The compaction hook (feat-autonomous-run, phase 4): registered under
 * PreCompact, removed with the rest, and silent on every cannot-tell.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { ensureHooks, removeHooks, HOOKS } = require('../src/env/hooks.js')

const HOOK = path.join(__dirname, '..', 'assets', 'hooks', 'run-compact.cjs')
const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function tmp(prefix) {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}
const settings = (dir) => JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))

test('the hook is one of ours, under PreCompact, with no matcher', () => {
  const h = HOOKS.find((k) => k.key === 'run-compact')
  assert.ok(h)
  assert.strictEqual(h.event, 'PreCompact')
  assert.ok(HOOKS.filter((k) => k.key !== 'run-compact').every((k) => k.event === 'PreToolUse'))
})

test('a fresh install registers it under PreCompact, idempotently', () => {
  const dir = tmp('skitterspec-hooks-')
  assert.strictEqual(ensureHooks(dir).reason, 'created')
  const pre = settings(dir).hooks.PreCompact
  assert.strictEqual(pre.length, 1)
  assert.strictEqual(pre[0].matcher, undefined)
  assert.match(pre[0].hooks[0].command, /run-compact\.cjs/)
  assert.strictEqual(ensureHooks(dir).reason, 'present')
  assert.strictEqual(settings(dir).hooks.PreCompact.length, 1)
})

test('an existing settings file gains it beside the project’s own PreCompact hook', () => {
  const dir = tmp('skitterspec-hooks-')
  fs.mkdirSync(path.join(dir, '.claude'))
  const theirs = { hooks: [{ type: 'command', command: 'echo theirs' }] }
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: { PreCompact: [theirs] } }))
  assert.strictEqual(ensureHooks(dir).reason, 'added')
  assert.strictEqual(settings(dir).hooks.PreCompact.length, 2)
  // And removing ours leaves theirs exactly as it was.
  removeHooks(dir)
  assert.deepStrictEqual(settings(dir).hooks.PreCompact, [theirs])
  assert.strictEqual(settings(dir).hooks.PreToolUse, undefined)
})

/* ---- the script ------------------------------------------------------------ */

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function repo({ auto = false } = {}) {
  const dir = tmp('skitterspec-compact-')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.mkdirSync(path.join(dir, 'specs', 'in-progress', 'feat-x'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', 'in-progress', 'feat-x', '00-overview.md'), `# X\n${auto ? '\n> **Run:** auto\n' : ''}`)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

function fire(cwd, payload) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: BIN },
    cwd,
  })
}

const record = (dir) => path.join(dir, '.spec-env', 'runs', 'feat-x.json')

test('with an active run, a compaction is recorded against the phase being built', () => {
  const dir = repo({ auto: true })
  execFileSync(process.execPath, [BIN, 'spec-env', 'run', 'resolve', 'feat-x', '--dir', dir], { stdio: 'ignore' })
  const r = fire(dir, { hook_event_name: 'PreCompact', trigger: 'auto', cwd: dir })
  assert.strictEqual(r.status, 0)
  assert.strictEqual(r.stdout, '')
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(record(dir), 'utf8')).compactions.map((c) => c.phase), [1])
})

test('stays silent: no run, garbage stdin, another event, no engine', () => {
  const dir = repo()
  for (const payload of [{ hook_event_name: 'PreCompact', cwd: dir }, 'not json', { hook_event_name: 'PreToolUse', cwd: dir }]) {
    const r = fire(dir, payload)
    assert.strictEqual(r.status, 0)
    assert.strictEqual(r.stdout, '')
    assert.strictEqual(r.stderr, '')
  }
  assert.strictEqual(fs.existsSync(record(dir)), false)
  const none = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ hook_event_name: 'PreCompact', cwd: dir }),
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: path.join(dir, 'no-such-engine') },
  })
  assert.deepStrictEqual([none.status, none.stdout, none.stderr], [0, '', ''])
})

test('stays silent: two active runs and no spec named is cannot-tell', () => {
  const dir = repo({ auto: true })
  execFileSync(process.execPath, [BIN, 'spec-env', 'run', 'resolve', 'feat-x', '--dir', dir], { stdio: 'ignore' })
  const other = path.join(dir, '.spec-env', 'runs', 'feat-y.json')
  fs.writeFileSync(other, JSON.stringify({ active: true, mode: 'auto', then: 'pause', phases: [], compactions: [] }))
  fire(dir, { hook_event_name: 'PreCompact', cwd: dir })
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(record(dir), 'utf8')).compactions, [])
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(other, 'utf8')).compactions, [])
})
