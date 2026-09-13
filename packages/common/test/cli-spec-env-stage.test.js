'use strict'

/**
 * `spec-env stage` — which uncommitted paths are this spec's, and which are not.
 *
 * The verb exists because skills used to write `git add specs/`, staging a
 * directory: with two sessions authoring specs at once that swept a colleague's
 * in-progress spec into this spec's commit. So the tests that matter most are
 * the ones asserting the split is exact, and the STAYS-SILENT half
 * (`.claude/rules/negative-checks.md` §3) asserting it accuses nobody when the
 * tree is healthy but unusual — clean, or dirty with only somebody else's work.
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

const SNAPSHOT = 'specs/.core/linear-base/{identifier}.base.json'

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stage-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        branch: { pattern: '{type}/{slug}', identifierField: 'linear_identifier' },
        spec: { companionPaths: [SNAPSHOT] },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

// A committed spec, so later edits to it show as modifications rather than as
// one untracked directory.
function addSpec(dir, folder, { bucket = 'in-progress', identifier = null } = {}) {
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `${fm}# X\n\n> **Stack:** worktree\n`)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `add ${folder}`)
  return specDir
}

function dirty(dir, rel, body = 'edited\n') {
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.appendFileSync(abs, body)
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
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
  return out
}

const asJson = async (argv) => JSON.parse(await runQuiet([...argv, '--json']))

test('splits the tree into this spec’s paths and everyone else’s', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    dirty(dir, 'specs/in-progress/feat-alpha/00-overview.md')
    dirty(dir, 'specs/in-progress/feat-beta/00-overview.md')
    dirty(dir, 'README.md')

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.deepStrictEqual(r.owned, ['specs/in-progress/feat-alpha/00-overview.md'])
    assert.deepStrictEqual(r.foreign.sort(), [
      'README.md',
      'specs/in-progress/feat-beta/00-overview.md',
    ])
    assert.strictEqual(r.spec, 'feat-alpha')
  } finally {
    cleanup(dir)
  }
})

// Starting a spec MOVES it, so a tree caught mid-`git mv` is dirty in two
// buckets at once and both halves are the same spec's. A classifier checking
// only the current bucket would call one of them foreign and refuse the move it
// is meant to be committing.
test('a spec mid-move is owned in both buckets at once', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha', { bucket: 'backlog' })
    fs.mkdirSync(path.join(dir, 'specs', 'in-progress'), { recursive: true })
    git(dir, 'mv', 'specs/backlog/feat-alpha', 'specs/in-progress/feat-alpha')

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.deepStrictEqual(r.foreign, [], 'nothing about its own move is foreign')
    assert.ok(
      r.owned.some((p) => p.startsWith('specs/in-progress/feat-alpha/')),
      `owned covers the destination: ${JSON.stringify(r.owned)}`,
    )
  } finally {
    cleanup(dir)
  }
})

test('a declared companionPaths entry is owned; another spec’s snapshot is not', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha', { identifier: 'SKS-1' })
    dirty(dir, 'specs/.core/linear-base/SKS-1.base.json', '{}\n')
    dirty(dir, 'specs/.core/linear-base/SKS-2.base.json', '{}\n')

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.ok(
      r.owned.includes('specs/.core/linear-base/SKS-1.base.json'),
      `its own snapshot is owned: ${JSON.stringify(r.owned)}`,
    )
    assert.ok(
      r.foreign.includes('specs/.core/linear-base/SKS-2.base.json'),
      `another spec’s snapshot is foreign: ${JSON.stringify(r.foreign)}`,
    )
  } finally {
    cleanup(dir)
  }
})

// The commits this verb bounds are the lifecycle ones — a status flip and a
// folder move. A caller that read `owned` as "this phase's work" would commit
// the spec file alone and believe it had committed the feature.
test('a phase’s own implementation is foreign, not owned', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    dirty(dir, 'src/thing.js', 'module.exports = 1\n')

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.deepStrictEqual(r.owned, [])
    assert.deepStrictEqual(r.foreign, ['src/thing.js'])
  } finally {
    cleanup(dir)
  }
})

test('--json reports the tree it read, and the human form names it too', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.strictEqual(r.tree, dir)

    const out = await runQuiet(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.match(out, new RegExp(`tree:\\s+${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT. A clean tree is the commonest state there is, and the verb must
// report an empty split rather than complain about one.
test('stays silent on a clean tree', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.match(out, /0 owned, 0 foreign/)
    assert.match(out, /nothing uncommitted/)
    assert.doesNotMatch(out, /blocked|refus|error|cannot/i, `accused something: ${out}`)

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.deepStrictEqual(r.owned, [])
    assert.deepStrictEqual(r.foreign, [])
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT. A tree holding only somebody else's work is the exact case that
// used to refuse; here it is an ordinary answer with an empty owned half.
test('stays silent on a tree dirty with only another spec’s work', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    dirty(dir, 'specs/in-progress/feat-beta/00-overview.md')

    const out = await runQuiet(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.doesNotMatch(out, /blocked|refus|error/i, `accused something: ${out}`)
    assert.doesNotMatch(out, /owned \(/, 'no empty owned heading')

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.deepStrictEqual(r.owned, [])
    assert.deepStrictEqual(r.foreign, ['specs/in-progress/feat-beta/00-overview.md'])
  } finally {
    cleanup(dir)
  }
})

// Three states, not two. An unreadable git is "nobody looked" — it must never
// collapse into the empty owned set a caller would happily stage.
test('an unreadable git yields null, never an empty owned set', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    // Break the repo *after* the spec is on disk, so resolution still works and
    // only the tree read fails.
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true })

    const r = await asJson(['spec-env', 'stage', 'feat-alpha', '--dir', dir])
    assert.strictEqual(r.owned, null, 'owned is null, not []')
    assert.strictEqual(r.foreign, null)
    assert.ok(r.error, 'says why')
  } finally {
    cleanup(dir)
  }
})

// The verb reads the tree in front of you: inside a worktree that is the
// worktree, which is where /spec-complete and /spec-cancel run.
test('run from inside a worktree, it reads that worktree’s tree', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', worktree)
    dirty(worktree, 'specs/in-progress/feat-alpha/00-overview.md')
    dirty(dir, 'specs/in-progress/feat-alpha/00-overview.md', 'primary only\n')

    const r = await asJson(['spec-env', 'stage', '--dir', worktree])
    assert.strictEqual(r.tree, fs.realpathSync(worktree))
    assert.deepStrictEqual(r.owned, ['specs/in-progress/feat-alpha/00-overview.md'])
  } finally {
    cleanup(dir)
  }
})
