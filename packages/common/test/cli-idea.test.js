'use strict'

/**
 * `skitterspec idea` against real git fixtures. What only shows up here: the
 * file store lands on the base branch from anywhere — a spec's worktree
 * included — without leaving the primary checkout dirty, and it refuses rather
 * than writing when it cannot tell where ideas live.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { ideaCommand } = require('../src/ideacmd.js')
const { setProviderConfigFile } = require('../src/env/config.js')
const { setProviderIdeaStore } = require('../src/idea.js')

const NOW = new Date(2026, 0, 2, 9, 0, 0)

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-idea-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Ada')
  git(dir, 'config', 'user.email', 'ada@example.invalid')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'README.md'), 'core\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(`${dir}-wt`, { recursive: true, force: true })
}

async function idea(argv, cwd) {
  let out = ''
  const code = await ideaCommand(argv, { cwd, now: NOW, out: { write: (s) => (out += s) } })
  return { code, out }
}

test('add from a spec worktree lands on base and leaves the primary checkout clean', async () => {
  const dir = repo()
  try {
    const wt = `${dir}-wt`
    git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
    const before = git(dir, 'rev-parse', 'main')

    const { code, out } = await idea(['add', 'Rate-limit the review server'], wt)
    assert.strictEqual(code, 0, out)
    assert.match(out, /added "rate-limit-the-review-server" to specs\/ideas\.md on main/)
    assert.match(out, /pushed:\s+no — git push origin main publishes it/)

    assert.strictEqual(git(dir, 'rev-parse', 'main~1'), before)
    assert.strictEqual(git(dir, 'status', '--porcelain'), '')
    assert.match(fs.readFileSync(path.join(dir, 'specs', 'ideas.md'), 'utf8'), /## rate-limit-the-review-server · 2026-01-02 · Ada/)
    // The worktree's own branch is untouched.
    assert.strictEqual(git(wt, 'rev-parse', 'HEAD'), before)
    assert.match(git(dir, 'log', '-1', '--format=%s'), /^docs\(ideas\): add rate-limit-the-review-server$/)
  } finally {
    cleanup(dir)
  }
})

test('with the base checked out nowhere, the ref moves on its own', async () => {
  const dir = repo()
  try {
    git(dir, 'switch', '-q', '-c', 'feat/live')
    const { code, out } = await idea(['add', 'One'], dir)
    assert.strictEqual(code, 0, out)
    assert.match(git(dir, 'show', 'main:specs/ideas.md'), /## one · /)
    assert.strictEqual(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/live')
    assert.strictEqual(git(dir, 'status', '--porcelain'), '')
  } finally {
    cleanup(dir)
  }
})

test('list and drop read and write the base branch', async () => {
  const dir = repo()
  try {
    await idea(['add', 'One'], dir)
    await idea(['add', 'Two\nwith detail'], dir)

    const listed = await idea(['list', '--json'], dir)
    assert.deepStrictEqual(JSON.parse(listed.out).ideas.map((e) => e.id), ['one', 'two'])
    assert.strictEqual((await idea(['list', '--count'], dir)).out.trim(), '2')

    const dropped = await idea(['drop', 'one', '--reason', 'done elsewhere'], dir)
    assert.strictEqual(dropped.code, 0, dropped.out)
    assert.match(git(dir, 'log', '-1', '--format=%B'), /Discard "One": done elsewhere/)
    assert.strictEqual((await idea(['list', '--count'], dir)).out.trim(), '1')
  } finally {
    cleanup(dir)
  }
})

test('a local edit to the file refuses and moves nothing', async () => {
  const dir = repo()
  try {
    await idea(['add', 'One'], dir)
    const tip = git(dir, 'rev-parse', 'main')
    fs.appendFileSync(path.join(dir, 'specs', 'ideas.md'), 'scribble\n')
    const { code, out } = await idea(['add', 'Two'], dir)
    assert.strictEqual(code, 1)
    assert.match(out, /uncommitted changes/)
    assert.strictEqual(git(dir, 'rev-parse', 'main'), tip)
    assert.match(fs.readFileSync(path.join(dir, 'specs', 'ideas.md'), 'utf8'), /scribble\n$/)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: no ideas file lists zero', async () => {
  const dir = repo()
  try {
    const { code, out } = await idea(['list', '--count'], dir)
    assert.strictEqual(code, 0)
    assert.strictEqual(out.trim(), '0')
    assert.match((await idea(['list'], dir)).out, /nothing waiting on main/)
  } finally {
    cleanup(dir)
  }
})

test('a configured provider that declares no store refuses and never falls back to the file', async () => {
  const dir = repo()
  setProviderConfigFile('specs/.core/tracker.config.json')
  try {
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'tracker.config.json'), '{}\n')
    const tip = git(dir, 'rev-parse', 'main')
    const { code, out } = await idea(['add', 'Keep me'], dir)
    assert.strictEqual(code, 1)
    assert.match(out, /cannot tell where ideas live/)
    assert.match(out, /Keep me/)
    assert.strictEqual(git(dir, 'rev-parse', 'main'), tip)
    assert.match((await idea(['list'], dir)).out, /cannot tell/)
  } finally {
    setProviderConfigFile(null)
    cleanup(dir)
  }
})

test('a provider that says it cannot hold ideas uses the file', async () => {
  const dir = repo()
  setProviderConfigFile('specs/.core/tracker.config.json')
  setProviderIdeaStore({ supports: false })
  try {
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'tracker.config.json'), '{}\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'tracker')
    const { code, out } = await idea(['add', 'Filed'], dir)
    assert.strictEqual(code, 0, out)
    assert.match(git(dir, 'show', 'main:specs/ideas.md'), /## filed · /)
  } finally {
    setProviderIdeaStore(undefined)
    setProviderConfigFile(null)
    cleanup(dir)
  }
})

test('a provider that holds ideas is handed the command', async () => {
  const dir = repo()
  const calls = []
  setProviderConfigFile('specs/.core/tracker.config.json')
  setProviderIdeaStore({ supports: true, run: async (sub, argv, { out }) => (calls.push([sub, ...argv]), out.write('handed\n'), 0) })
  try {
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'tracker.config.json'), '{}\n')
    const { code, out } = await idea(['add', 'Tracked', '--json'], dir)
    assert.strictEqual(code, 0)
    assert.strictEqual(out, 'handed\n', 'the provider writes to the caller\'s stream')
    assert.deepStrictEqual(calls, [['add', 'Tracked', '--json']])
    assert.throws(() => git(dir, 'show', 'main:specs/ideas.md'))
  } finally {
    setProviderIdeaStore(undefined)
    setProviderConfigFile(null)
    cleanup(dir)
  }
})

test('--product is a flag, not part of the idea: the file store names it as not recorded', async () => {
  const dir = repo()
  try {
    const { code, out } = await idea(['add', 'Bid scoring', '--product', 'tendering'], dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /added "bid-scoring"/)
    assert.match(out, /product: tendering not recorded/)
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'specs', 'ideas.md'), 'utf8'), /tendering/)
  } finally {
    cleanup(dir)
  }
})
