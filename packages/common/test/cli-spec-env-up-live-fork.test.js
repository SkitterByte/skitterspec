'use strict'

/**
 * `spec-env up` forks a NEW branch from the base, never from whatever the
 * primary checkout has out (bug-up-forks-from-head).
 *
 * The printed `git worktree add <path> -b <branch>` used to carry no start
 * point, so git used HEAD. `/spec-live` deliberately puts a spec's branch in
 * the primary checkout, so every spec created while one was live started
 * inside it — and `integrate` fast-forwarded the base over both specs' work.
 * The ereqs run that found it landed six unreviewed commits of a live spec on
 * main under a bug fix's name.
 *
 * Driven through the real CLI over a real repo, and the printed command is
 * RUN, because the claim is about what git builds, not about the string.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function commit(cwd, file, msg) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg])
}

function writeSpec(root, bucket, folder) {
  const d = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
}

// main carries two specs; feat/live is spec A's branch, two commits ahead,
// and is checked out in the primary checkout — what `/spec-live` leaves.
function scaffold({ live = true } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-livefork-')))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ docker: { enabled: false }, guards: { mainIsLandingZone: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  writeSpec(dir, 'in-progress', 'feat-live')
  writeSpec(dir, 'backlog', 'feat-next')
  commit(dir, 'seed.txt', 'init')
  git(dir, ['branch', '-M', 'main'])
  git(dir, ['switch', '-q', '-c', 'feat/live'])
  commit(dir, 'a1.txt', 'live work 1')
  commit(dir, 'a2.txt', 'live work 2')
  if (!live) git(dir, ['switch', '-q', 'main'])
  return { dir }
}

function cleanup({ dir }) {
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

// The printed `git worktree add` line, as an argv. Temp paths carry no spaces.
function worktreeAdd(out) {
  const line = out.split('\n').map((l) => l.trim()).find((l) => l.startsWith('git worktree add '))
  assert.ok(line, `no worktree add in:\n${out}`)
  return line.split(/\s+/).slice(1).map((a) => a.replace(/^"|"$/g, ''))
}

function provisioned(dir, out, branch) {
  execFileSync('git', worktreeAdd(out), { cwd: dir, stdio: 'ignore' })
  const mainTip = git(dir, ['rev-parse', 'main'])
  return {
    mergeBase: git(dir, ['merge-base', 'main', branch]),
    mainTip,
    carried: git(dir, ['log', '--format=%s', `main..${branch}`]),
  }
}

test('up: with a spec live in the primary checkout, a new spec still forks from the base', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-next', '--dir', fx.dir])
    assert.deepStrictEqual(worktreeAdd(out).slice(-3), ['-b', 'feat/next', 'main'])
    const r = provisioned(fx.dir, out, 'feat/next')
    assert.strictEqual(r.mergeBase, r.mainTip, 'forked from the base tip')
    assert.strictEqual(r.carried, '', 'none of the live spec\'s commits ride the new branch')
  } finally {
    cleanup(fx)
  }
})

test('up --docs: the authoring lane forks from the base while a spec is live', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'up', 'bug-found-meanwhile', '--docs', '--dir', fx.dir])
    assert.deepStrictEqual(worktreeAdd(out).slice(-3), ['-b', 'bug/found-meanwhile', 'main'])
    const r = provisioned(fx.dir, out, 'bug/found-meanwhile')
    assert.strictEqual(r.carried, '')
  } finally {
    cleanup(fx)
  }
})

test('nospec: a specless branch forks from the base while a spec is live', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', fx.dir])
    const argv = worktreeAdd(out)
    assert.strictEqual(argv[argv.length - 1], 'main')
    const r = provisioned(fx.dir, out, argv[argv.length - 2])
    assert.strictEqual(r.carried, '')
  } finally {
    cleanup(fx)
  }
})

test('up: on the base the start point is still named — never left to HEAD', async () => {
  const fx = scaffold({ live: false })
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-next', '--dir', fx.dir])
    assert.deepStrictEqual(worktreeAdd(out).slice(-3), ['-b', 'feat/next', 'main'])
    // Naming the base is not a change of fork, so it is not announced as one.
    assert.doesNotMatch(out, /^\s*fork:/m)
  } finally {
    cleanup(fx)
  }
})
