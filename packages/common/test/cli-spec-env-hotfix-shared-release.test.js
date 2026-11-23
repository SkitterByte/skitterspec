'use strict'

/**
 * Two hotfixes from one tag, shipped in one release: B is rebased onto A, B's
 * land cuts the release holding both fixes, and A — which has no release of
 * its own — must then complete without cutting a second one.
 *
 * The positive signal is containment: every fix commit of A (spec documents
 * left out) is already in a release tag on A's base line. Where that cannot be
 * shown, A cuts as it always has (`.claude/rules/negative-checks.md` rule 4).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { shippedCandidates } = require('../src/env/hotfix.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body)
}

const overview = (status) =>
  `# Hotfix\n\n> **Type:** Hotfix\n> **Base version:** v1.0.0\n> **Status:** ${status}\n`

// main tagged v1.0.0 and moved on; hotfix/a forked from the tag with its spec
// and its fix; hotfix/b forked from hotfix/a (the rebase) with its own.
function scaffold(hotfix = { bump: 'hotfix-suffix' }) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hfshared-')))
  const dir = path.join(root, 'repo')
  fs.mkdirSync(dir)
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../wt', folderPattern: '{slug}' }, hotfix }, null, 2),
  )
  write(path.join(dir, '.gitignore'), '/.spec-env/\n')
  write(path.join(dir, 'a.js'), 'a released\n')
  write(path.join(dir, 'b.js'), 'b released\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'release')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'tag', 'v1.0.0')
  const remote = path.join(root, 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', remote])
  git(dir, 'remote', 'add', 'origin', remote)
  write(path.join(dir, 'other.js'), 'main moved on\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'later on main')

  const a = path.join(root, 'wt', 'a')
  git(dir, 'worktree', 'add', '-q', a, '-b', 'hotfix/a', 'v1.0.0')
  write(path.join(a, 'specs', 'in-progress', 'hotfix-a', '00-overview.md'), overview('In Progress'))
  git(a, 'add', '-A')
  git(a, 'commit', '-q', '-m', 'chore(spec): hotfix-a')
  write(path.join(a, 'a.js'), 'a released, fixed\n')
  git(a, 'commit', '-q', '-am', 'fix: a')

  const b = path.join(root, 'wt', 'b')
  git(dir, 'worktree', 'add', '-q', b, '-b', 'hotfix/b', 'hotfix/a')
  write(path.join(b, 'b.js'), 'b released, fixed\n')
  git(b, 'commit', '-q', '-am', 'fix: b')
  write(path.join(b, 'specs', 'complete', 'hotfix-b', '00-overview.md'), overview('Complete'))
  git(b, 'add', '-A')
  git(b, 'commit', '-q', '-m', 'chore(spec): complete hotfix-b')
  return { root, dir, a, b, remote }
}

// A's completion: the spec moves to complete/, committed on A's branch.
function completeA(env) {
  fs.mkdirSync(path.join(env.a, 'specs', 'complete'), { recursive: true })
  git(env.a, 'mv', 'specs/in-progress/hotfix-a', 'specs/complete/hotfix-a')
  write(path.join(env.a, 'specs', 'complete', 'hotfix-a', '00-overview.md'), overview('Complete'))
  git(env.a, 'add', '-A')
  git(env.a, 'commit', '-q', '-m', 'chore(spec): complete hotfix-a')
}

async function hotfix(dir, verb, spec, ...extra) {
  const orig = process.stdout.write
  const origErr = process.stderr.write
  let out = ''
  process.stdout.write = (c) => ((out += c), true)
  process.stderr.write = (c) => ((out += c), true)
  try {
    await run(['spec-env', 'hotfix', verb, spec, '--dir', dir, ...extra])
  } finally {
    process.stdout.write = orig
    process.stderr.write = origErr
  }
  const code = process.exitCode || 0
  process.exitCode = 0
  return { out, code }
}

const tags = (env) => git(env.dir, 'tag', '--list').split('\n').filter(Boolean)

test('A, whose fix shipped in B\'s release, plans no release of its own', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await hotfix(env.dir, 'land', 'hotfix-b', '--push')).code, 0)
    assert.ok(tags(env).includes('v1.0.0-hotfix.1'))
    completeA(env)
    const { out, code } = await hotfix(env.dir, 'land', 'hotfix-a', '--plan')
    assert.strictEqual(code, 0, out)
    assert.match(out, /release: already shipped in v1\.0\.0-hotfix\.1/)
    assert.doesNotMatch(out, /git tag/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('A lands: nothing cut, only its completion carried, then finish tears it down', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await hotfix(env.dir, 'land', 'hotfix-b', '--push')).code, 0)
    completeA(env)
    const before = git(env.dir, 'rev-parse', 'HEAD')
    const landed = await hotfix(env.dir, 'land', 'hotfix-a')
    assert.strictEqual(landed.code, 0, landed.out)
    assert.deepStrictEqual(tags(env), ['v1.0.0', 'v1.0.0-hotfix.1'], 'no second release')
    assert.deepStrictEqual(
      git(env.dir, 'log', '--format=%s', `${before}..HEAD`).split('\n'),
      ['chore(spec): complete hotfix-a'],
    )

    const done = await hotfix(env.dir, 'finish', 'hotfix-a')
    assert.strictEqual(done.code, 0, done.out)
    assert.match(done.out, /release:\s+v1\.0\.0-hotfix\.1/)
    assert.ok(!fs.existsSync(env.a), 'worktree removed')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('under the patch bump, the shared release is found the same way', async () => {
  const env = scaffold({})
  try {
    assert.strictEqual((await hotfix(env.dir, 'land', 'hotfix-b', '--push')).code, 0)
    assert.ok(tags(env).includes('v1.0.1'))
    completeA(env)
    const { out, code } = await hotfix(env.dir, 'land', 'hotfix-a', '--plan')
    assert.strictEqual(code, 0, out)
    assert.match(out, /release: already shipped in v1\.0\.1/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

// --- stays silent -------------------------------------------------------------

test('stays silent: a fix in no release tag still cuts one', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await hotfix(env.dir, 'land', 'hotfix-b', '--push')).code, 0)
    write(path.join(env.a, 'a.js'), 'a released, fixed twice\n')
    git(env.a, 'commit', '-q', '-am', 'fix: a again')
    completeA(env)
    const { out, code } = await hotfix(env.dir, 'land', 'hotfix-a', '--plan')
    assert.strictEqual(code, 0, out)
    assert.doesNotMatch(out, /already shipped/)
    assert.match(out, /release: git tag v1\.0\.0-hotfix\.2/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('stays silent: an untouched hotfix plans exactly the release it always did', async () => {
  const env = scaffold()
  try {
    completeA(env)
    const { out, code } = await hotfix(env.dir, 'land', 'hotfix-a', '--plan')
    assert.strictEqual(code, 0, out)
    assert.match(out, /release: git tag v1\.0\.0-hotfix\.1/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('stays silent: finish still refuses while the shared release is only local', async () => {
  const env = scaffold()
  try {
    assert.strictEqual((await hotfix(env.dir, 'land', 'hotfix-b')).code, 0, 'B cut, held')
    completeA(env)
    const done = await hotfix(env.dir, 'finish', 'hotfix-a')
    assert.strictEqual(done.code, 1, done.out)
    assert.ok(fs.existsSync(env.a), 'nothing removed')
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

// --- the candidates -----------------------------------------------------------

test('shippedCandidates: the base line\'s later releases, oldest first', () => {
  assert.deepStrictEqual(
    shippedCandidates('v1.0.0', ['v1.0.0', 'v1.1.0', 'v1.0.0-hotfix.2', 'v1.0.1', 'v1.0.0-hotfix.1', 'v0.9.9', 'v1.0.1-rc.1', 'x']),
    ['v1.0.0-hotfix.1', 'v1.0.0-hotfix.2', 'v1.0.1'],
  )
  assert.deepStrictEqual(shippedCandidates('v1.0.0-hotfix.1', ['v1.0.0-hotfix.1', 'v1.0.0-hotfix.2']), ['v1.0.0-hotfix.2'])
})

test('stays silent: an unreadable tag list or base names no candidate, so the land cuts', () => {
  assert.deepStrictEqual(shippedCandidates('v1.0.0', null), [])
  assert.deepStrictEqual(shippedCandidates('not-a-tag', ['v1.0.1']), [])
})
