'use strict'

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

// A real git checkout on `main` with an isolated spec and a worktree on its
// branch — enough to drive `live take` (which branch-switches the primary), so
// we can prove `spec-env up` refuses while the spec is live.
function scaffoldGitWithWorktree(slug = 'x') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-live-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', `feat-${slug}`)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, worktree)
  return { dir, folder: `feat-${slug}`, worktree }
}

function cleanupGit(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Scaffold a project with isolation enabled and one worktree-only spec, so
// `spec-env up` runs its plan (no git/docker needed) and exercises the trust step.
function scaffold(slug = 'x', configExtra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...configExtra },
      null,
      2,
    ),
  )
  const spec = path.join(dir, 'specs', 'backlog', `feat-${slug}`)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n',
  )
  return { dir, folder: `feat-${slug}` }
}

// Run the CLI with stdout suppressed; return what was printed.
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

const readLocal = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))

test('spec-env up trusts the worktree root in settings.local.json', async () => {
  const { dir, folder } = scaffold()
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /trusted:\s+\S+-wt/, 'plan reports the trusted root')
})

test('spec-env up preserves a pre-existing permissions.allow', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ permissions: { allow: ['Bash(git *)'] } }, null, 2))
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const settings = readLocal(dir)
  assert.deepStrictEqual(settings.permissions.allow, ['Bash(git *)'], 'allow survived')
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(settings.permissions.additionalDirectories, [expected], 'root added')
})

test('a second spec-env up is a no-op for the trusted root', async () => {
  const { dir, folder } = scaffold()
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /already in \.claude\/settings\.local\.json/, 'reports already-trusted')
})

test('spec-env up prints configured setup commands under an in-the-worktree head', async () => {
  const { dir, folder } = scaffold('y', { setup: ['pnpm install', 'echo {slug}'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.match(out, /in the worktree, run:/, 'prints the setup heading')
  assert.match(out, /pnpm install/, 'lists the setup command')
  assert.match(out, /echo y/, 'expands tokens in setup commands')
})

test('spec-env up omits the setup head when no setup is configured', async () => {
  const { dir, folder } = scaffold()
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.doesNotMatch(out, /in the worktree, run:/, 'no setup heading without config')
})

test('spec-env up prints seed commands under the in-the-worktree head', async () => {
  const { dir, folder } = scaffold('z', { seedFiles: ['.env'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.match(out, /in the worktree, run:/, 'prints the worktree heading')
  assert.match(out, /git rev-parse --git-common-dir/, 'emits the anchored seed command')
  assert.match(out, /seeded \.env →/, 'the seed command reports what it seeds')
})

test('spec-env up seeds before running setup (files exist before setup uses them)', async () => {
  const { dir, folder } = scaffold('w', { seedFiles: ['.env'], setup: ['pnpm install'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const seedAt = out.indexOf('git rev-parse --git-common-dir')
  const setupAt = out.indexOf('pnpm install')
  assert.ok(seedAt !== -1 && setupAt !== -1, 'both steps present')
  assert.ok(seedAt < setupAt, 'seed command is printed before the setup command')
})

test('spec-env up refuses when the spec is live in the primary checkout', async () => {
  const { dir, folder, worktree } = scaffoldGitWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', folder, '--dir', dir]) // primary → feat/x
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')

    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /is live in the primary checkout/)
    assert.doesNotMatch(out, /git worktree add/, 'no un-runnable worktree-add plan emitted')
    // Guard fired before touching the worktree — it is still where live left it.
    assert.ok(fs.existsSync(worktree))
  } finally {
    cleanupGit(dir)
  }
})

test('spec-env up leaves a malformed settings.local.json untouched, warns in the plan', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json {')
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'not json {', 'file left intact')
  assert.match(out, /trusted:\s+! .*not valid JSON/, 'plan warns about malformed settings')
})
