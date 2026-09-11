'use strict'

// `spec-env resolve --record-primary` / `--assert-primary-clean` against real
// git: a real primary checkout, a real linked worktree, real writes.
//
// The pure comparison is covered in env-building.test.js. What is proven HERE is
// the part that only a real repo can prove: that the paths survive the round
// trip through git and the reader intact, and that a leak exits non-zero.

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

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-guard-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/thing', worktree)
  return { dir, worktree }
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

const resolveArgs = (dir, ...extra) => [
  'spec-env',
  'resolve',
  'feat-thing',
  '--dir',
  dir,
  ...extra,
]

test('--record-primary writes a baseline into the gitignored state dir', async () => {
  const { dir } = scaffold()
  try {
    const out = await runQuiet(resolveArgs(dir, '--record-primary'))
    assert.match(out, /baseline recorded for feat-thing/)
    const file = path.join(dir, '.spec-env', 'building.json')
    assert.ok(fs.existsSync(file), 'the baseline exists')
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).paths, [])
    // Recording must not itself dirty the tree it is about to police.
    assert.strictEqual(git(dir, 'status', '--porcelain'), '')
  } finally {
    cleanup(dir)
  }
})

test('a clean primary checkout passes and says nothing was written', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    const out = await runQuiet(resolveArgs(dir, '--assert-primary-clean'))
    assert.match(out, /primary checkout clean/)
  } finally {
    cleanup(dir)
  }
})

test('a new file in the primary checkout is named, with its path intact', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    // A nested path: the truncation regression showed up on exactly this shape.
    fs.mkdirSync(path.join(dir, 'packages', 'common', 'test'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'common', 'test', 'leaked.test.js'), 'x\n')
    await assert.rejects(
      () => runQuiet(resolveArgs(dir, '--assert-primary-clean')),
      (err) => {
        assert.match(err.message, /appeared in the PRIMARY checkout/)
        assert.match(err.message, /packages\/common\/test\/leaked\.test\.js/, 'path intact')
        return true
      },
    )
  } finally {
    cleanup(dir)
  }
})

test('an edit to a tracked file in the primary checkout is caught too', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    fs.appendFileSync(path.join(dir, 'README.md'), 'leaked\n')
    await assert.rejects(
      () => runQuiet(resolveArgs(dir, '--assert-primary-clean')),
      /README\.md/,
    )
  } finally {
    cleanup(dir)
  }
})

// STAYS SILENT — the healthy-but-unusual inputs, against real git.

test('stays silent: work done in the WORKTREE is not a leak', async () => {
  // The whole point. The build is supposed to write here.
  const { dir, worktree } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    fs.writeFileSync(path.join(worktree, 'built.js'), 'work\n')
    const out = await runQuiet(resolveArgs(dir, '--assert-primary-clean'))
    assert.match(out, /primary checkout clean/)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a file already dirty before the build', async () => {
  const { dir } = scaffold()
  try {
    fs.appendFileSync(path.join(dir, 'README.md'), 'my own edit\n')
    await runQuiet(resolveArgs(dir, '--record-primary'))
    const out = await runQuiet(resolveArgs(dir, '--assert-primary-clean'))
    assert.match(out, /primary checkout clean/)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: no baseline recorded at all', async () => {
  const { dir } = scaffold()
  try {
    fs.writeFileSync(path.join(dir, 'whatever.md'), 'x\n')
    const out = await runQuiet(resolveArgs(dir, '--assert-primary-clean'))
    assert.match(out, /cannot tell/)
    assert.match(out, /no leak is being claimed/)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: the baseline is unreadable rather than absent', async () => {
  // A truncated or hand-mangled file is still "cannot tell", never "leaked".
  const { dir } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    fs.writeFileSync(path.join(dir, '.spec-env', 'building.json'), '{ not json')
    fs.writeFileSync(path.join(dir, 'whatever.md'), 'x\n')
    const out = await runQuiet(resolveArgs(dir, '--assert-primary-clean'))
    assert.match(out, /cannot tell/)
  } finally {
    cleanup(dir)
  }
})

test('bare spec-env resolve still prints the coordinates, unchanged', async () => {
  const { dir } = scaffold()
  try {
    const out = await runQuiet(resolveArgs(dir))
    assert.match(out, /spec:\s+feat-thing/)
    assert.match(out, /branch:\s+feat\/thing/)
  } finally {
    cleanup(dir)
  }
})

// The guard sees paths, not authors. While this very phase was being built,
// ANOTHER session wrote a new backlog spec into the primary checkout and the
// guard reported it — correctly as an observation, wrongly as an accusation if
// the message had claimed the build put it there. Deleting a colleague's spec
// because a guard said "your build leaked this" is the expensive mistake here.
test('the message states what appeared, never who wrote it', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(resolveArgs(dir, '--record-primary'))
    fs.writeFileSync(path.join(dir, 'someone-elses-work.md'), 'x\n')
    await assert.rejects(
      () => runQuiet(resolveArgs(dir, '--assert-primary-clean')),
      (err) => {
        assert.doesNotMatch(err.message, /written into|this build wrote them\./)
        assert.match(err.message, /appeared in the PRIMARY checkout since the baseline/)
        assert.match(err.message, /if something else did/, 'the innocent reading gets a next step')
        return true
      },
    )
  } finally {
    cleanup(dir)
  }
})
