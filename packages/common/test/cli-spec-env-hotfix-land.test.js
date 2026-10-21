'use strict'

/**
 * `spec-env hotfix land` end to end, in a real temp repo: a release tag, a
 * hotfix worktree forked from it, a fix on that branch, and a STUB release
 * command standing in for skittership's `release-hotfix.cjs` — it writes a
 * version commit, tags it, and prints the one JSON line in skittership's shape.
 *
 * What is proven is that the engine runs the land itself: the release, the
 * record that lets a re-run carry on, and the refusal that stops everything.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

// The stand-in for skittership's command. `fail` makes it refuse the way
// skittership does: one `✖` line on stderr, exit 1, nothing on stdout.
function writeStub(dir, { fail = false } = {}) {
  const stub = path.join(dir, 'release-stub.js')
  const calls = path.join(dir, 'stub-calls')
  fs.writeFileSync(
    stub,
    `
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
fs.appendFileSync(${JSON.stringify(calls)}, 'x')
if (${fail}) { process.stderr.write('✖ release-hotfix: tree is dirty\\n'); process.exit(1) }
const g = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
const tag = 'v1.0.0-hotfix.1'
fs.writeFileSync('package.json', JSON.stringify({ version: '1.0.0-hotfix.1' }) + '\\n')
g('commit', '-q', '-am', 'chore(release): ' + tag)
g('tag', tag)
process.stdout.write(JSON.stringify({ tag, version: '1.0.0-hotfix.1', baseTag: 'v1.0.0',
  branch: g('rev-parse', '--abbrev-ref', 'HEAD'), versionCommit: g('rev-parse', 'HEAD'), pushed: false }) + '\\n')
`,
  )
  return { command: `node ${stub}`, calls }
}

function scaffold(hotfix = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hfland-')))
  const dir = path.join(root, 'repo')
  fs.mkdirSync(dir)
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../wt', folderPattern: '{slug}' }, hotfix }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }) + '\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'released\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'release')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'tag', 'v1.0.0')
  fs.writeFileSync(path.join(dir, 'other.js'), 'main moved on\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'later on main')

  const wt = path.join(root, 'wt', 'login')
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'hotfix/login', 'v1.0.0')
  fs.writeFileSync(path.join(wt, 'app.js'), 'released, fixed\n')
  git(wt, 'commit', '-q', '-am', 'fix: login')
  const sp = path.join(wt, 'specs', 'complete', 'hotfix-login')
  fs.mkdirSync(sp, { recursive: true })
  fs.writeFileSync(
    path.join(sp, '00-overview.md'),
    '# Hotfix\n\n> **Type:** Hotfix\n> **Base version:** v1.0.0\n> **Status:** Complete\n',
  )
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'chore(spec): complete hotfix-login')
  return { root, dir, wt }
}

async function land(dir, ...extra) {
  const orig = process.stdout.write
  const origErr = process.stderr.write
  let out = ''
  process.stdout.write = (c) => ((out += c), true)
  process.stderr.write = (c) => ((out += c), true)
  try {
    await run(['spec-env', 'hotfix', 'land', 'hotfix-login', '--dir', dir, ...extra])
  } finally {
    process.stdout.write = orig
    process.stderr.write = origErr
  }
  const code = process.exitCode || 0
  process.exitCode = 0
  return { out, code }
}

const record = (dir) => path.join(dir, '.spec-env', 'hotfix', 'hotfix-login.json')

test('releaseWith: the engine runs it, uses its tag, records it, and carries', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stub-')))
  const stub = writeStub(root)
  const env = scaffold({ releaseWith: stub.command })
  try {
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /released v1\.0\.0-hotfix\.1/)
    assert.match(out, /push origin v1\.0\.0-hotfix\.1/)
    assert.strictEqual(git(env.wt, 'tag', '--points-at', 'HEAD'), 'v1.0.0-hotfix.1')
    assert.strictEqual(JSON.parse(fs.readFileSync(record(env.dir), 'utf8')).tag, 'v1.0.0-hotfix.1')
    assert.match(fs.readFileSync(path.join(env.dir, 'app.js'), 'utf8'), /fixed/, 'main gained the fix')
    assert.ok(!git(env.dir, 'tag', '--list').split('\n').includes('v1.0.1'), 'no built-in tag')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a re-run reuses the recorded release rather than cutting a second', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stub-')))
  const stub = writeStub(root)
  const env = scaffold({ releaseWith: stub.command, cherryPickMain: false })
  try {
    assert.strictEqual((await land(env.dir)).code, 0)
    const again = await land(env.dir)
    assert.strictEqual(again.code, 0, again.out)
    assert.match(again.out, /cut earlier — not re-run/)
    assert.strictEqual(fs.readFileSync(stub.calls, 'utf8'), 'x', 'the command ran once')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a refusing releaseWith exits 1, relays its line, and touches nothing', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stub-')))
  const stub = writeStub(root, { fail: true })
  const env = scaffold({ releaseWith: stub.command })
  try {
    const mainBefore = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 1)
    assert.match(out, /release refused — ✖ release-hotfix: tree is dirty/)
    assert.match(out, /nothing after it ran/)
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), mainBefore, 'main untouched')
    assert.ok(!fs.existsSync(record(env.dir)), 'nothing recorded')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('--plan describes the steps and runs nothing', async () => {
  const env = scaffold({ releaseWith: 'node nowhere.js --json' })
  try {
    const { out, code } = await land(env.dir, '--plan')
    assert.strictEqual(code, 0, out)
    assert.match(out, /plan — nothing run/)
    assert.match(out, /1\. release: node nowhere\.js --json/)
    assert.match(out, /2\. carry: cherry-pick onto main/)
    assert.strictEqual(git(env.wt, 'tag', '--points-at', 'HEAD'), '')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('stays silent: with no releaseWith the built-in tagger cuts the next patch', async () => {
  const env = scaffold()
  try {
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.strictEqual(git(env.wt, 'tag', '--points-at', 'HEAD'), 'v1.0.1')
    assert.match(out, /tagged v1\.0\.1/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})
