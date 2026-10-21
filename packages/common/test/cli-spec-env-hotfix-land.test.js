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
  // A bare remote, so a push has somewhere real to go.
  const remote = path.join(root, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', remote])
  git(dir, 'remote', 'add', 'origin', remote)
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
  return { root, dir, wt, remote }
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

const onRemote = (env, ref) => {
  try {
    return git(env.remote, 'rev-parse', '--verify', '--quiet', ref)
  } catch {
    return null
  }
}

test('releaseWith + --push: released, branch then tag pushed, then carried', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stub-')))
  const stub = writeStub(root)
  const env = scaffold({ releaseWith: stub.command })
  try {
    const { out, code } = await land(env.dir, '--push')
    assert.strictEqual(code, 0, out)
    assert.match(out, /released v1\.0\.0-hotfix\.1/)
    assert.match(out, /pushed hotfix\/login, then v1\.0\.0-hotfix\.1, to origin/)
    assert.ok(onRemote(env, 'refs/heads/hotfix/login'), 'the branch reached the remote')
    assert.ok(onRemote(env, 'refs/tags/v1.0.0-hotfix.1'), 'and so did the tag')
    assert.strictEqual(JSON.parse(fs.readFileSync(record(env.dir), 'utf8')).pushed, true)
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
    assert.match(out, /2\. push: held — no consent to push to origin/)
    assert.match(out, /3\. carry: cherry-pick 2 commits onto main/)
    assert.strictEqual(git(env.wt, 'tag', '--points-at', 'HEAD'), '')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('without --push the land holds: tagged, nothing pushed, main untouched', async () => {
  const env = scaffold()
  try {
    const mainBefore = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.strictEqual(git(env.wt, 'tag', '--points-at', 'HEAD'), 'v1.0.1')
    assert.match(out, /tagged v1\.0\.1/)
    assert.match(out, /push origin hotfix\/login\n.*push origin v1\.0\.1/s)
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), mainBefore, 'nothing carried')
    assert.strictEqual(onRemote(env, 'refs/tags/v1.0.1'), null, 'nothing pushed')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('a push run by hand is found on the remote, and the re-run carries', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await land(env.dir)).code, 0)
    git(env.wt, 'push', '-q', 'origin', 'hotfix/login')
    git(env.wt, 'push', '-q', 'origin', 'v1.0.1')
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /cut earlier — not re-run/)
    assert.match(out, /already on origin/)
    assert.match(fs.readFileSync(path.join(env.dir, 'app.js'), 'utf8'), /fixed/, 'main gained the fix')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('stays silent: an unreachable remote is cannot-tell, so the re-run holds', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await land(env.dir)).code, 0)
    git(env.dir, 'remote', 'set-url', 'origin', path.join(env.root, 'nowhere.git'))
    const mainBefore = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /held — no consent/)
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), mainBefore, 'nothing carried')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

// --- the carry -----------------------------------------------------------------

const subjects = (cwd, range) => git(cwd, 'log', '--format=%s', range).split('\n').filter(Boolean)

test('main gains the fix and the spec commits, and never the version commit', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stub-')))
  const stub = writeStub(root)
  const env = scaffold({ releaseWith: stub.command })
  try {
    const before = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir, '--push')
    assert.strictEqual(code, 0, out)
    assert.deepStrictEqual(subjects(env.dir, `${before}..HEAD`), [
      'chore(spec): complete hotfix-login',
      'fix: login',
    ])
    assert.match(fs.readFileSync(path.join(env.dir, 'package.json'), 'utf8'), /"1\.0\.0"/, 'main keeps its version')
    assert.ok(fs.existsSync(path.join(env.dir, 'specs', 'complete', 'hotfix-login', '00-overview.md')))
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a re-run after the carry finds nothing left to carry', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await land(env.dir, '--push')).code, 0)
    const head = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /nothing to carry — main already has the fix/)
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), head)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('main not checked out: carried through a throwaway worktree, then removed', async () => {
  const env = scaffold()
  try {
    git(env.dir, 'checkout', '-q', '-b', 'elsewhere')
    const { out, code } = await land(env.dir, '--push')
    assert.strictEqual(code, 0, out)
    assert.match(out, /carried 2 commits onto main/)
    assert.deepStrictEqual(subjects(env.dir, 'elsewhere..main'), [
      'chore(spec): complete hotfix-login',
      'fix: login',
    ])
    assert.ok(!fs.existsSync(path.join(env.root, 'wt', 'login-carry-main')), 'throwaway removed')
    assert.strictEqual(git(env.dir, 'rev-parse', '--abbrev-ref', 'HEAD'), 'elsewhere', 'checkout untouched')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('main checked out and dirty: the carry refuses and prints the command', async () => {
  const env = scaffold()
  try {
    fs.writeFileSync(path.join(env.dir, 'other.js'), 'someone is mid-edit\n')
    const head = git(env.dir, 'rev-parse', 'HEAD')
    const { out, code } = await land(env.dir, '--push')
    assert.strictEqual(code, 1)
    assert.match(out, /has uncommitted changes on main — .*then run: git -C \S+ cherry-pick [0-9a-f]{40} [0-9a-f]{40}/)
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), head, 'main did not move')
    assert.match(fs.readFileSync(path.join(env.dir, 'other.js'), 'utf8'), /mid-edit/, 'their work is intact')
    assert.ok(onRemote(env, 'refs/tags/v1.0.1'), 'the release and push still happened')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('a conflicting carry is aborted, names the commit, and leaves main where it was', async () => {
  const env = scaffold()
  try {
    fs.writeFileSync(path.join(env.dir, 'app.js'), 'main rewrote this line\n')
    git(env.dir, 'commit', '-q', '-am', 'main edits app.js')
    const head = git(env.dir, 'rev-parse', 'HEAD')
    const fix = git(env.wt, 'rev-parse', 'HEAD~1')
    const { out, code } = await land(env.dir, '--push')
    assert.strictEqual(code, 1)
    assert.match(out, new RegExp(`cherry-pick ${fix} onto main conflicted — aborted`))
    assert.strictEqual(git(env.dir, 'rev-parse', 'HEAD'), head)
    assert.strictEqual(git(env.dir, 'status', '--porcelain'), '', 'no half-applied pick left behind')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})
