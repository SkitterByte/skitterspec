'use strict'

/**
 * A rolling base at the two moments that touch the remote: `up` (forking) and
 * `integrate` (landing). Driven through the real CLI over a real repo with a
 * bare remote, because what matters is git's answer — the fetch that reveals a
 * newly cut rc, the merge-bases that say where a spec forked — and a fake reader
 * would only echo the test's assumptions back.
 *
 * The shape is LSC's: `main`, an older rc `2026/Q4` the primary checkout still
 * has out, and a newer `2027/Q1` cut on the remote by somebody else since.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
// Paths as the engine prints them in a command (forward slashes on Windows).
const { shellPath } = require('../src/env/project.js')
const { assertPrimaryOnMain } = require('../src/env/resolve.js')
const { checkMainWrite } = require('../src/env/mainguard.js')

function git(cwd, args, env = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, ...env },
  })
    .toString()
    .trim()
}

function commit(cwd, file, msg, date) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date })
}

function writeSpec(root, bucket, folder) {
  const d = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
}

// Dates are fixed and long past — never today.
function scaffold({ config = { baseBranchPattern: '20??/Q?' }, spec = true } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-roll-')))
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-roll-remote-')))
  const lead = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-roll-lead-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })

  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ docker: { enabled: false }, guards: { mainIsLandingZone: false }, ...config }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  writeSpec(dir, 'in-progress', 'feat-thing')
  writeSpec(dir, 'backlog', 'feat-other')
  commit(dir, 'seed.txt', 'init', '2020-01-01T00:00:00Z')
  git(dir, ['branch', '-M', 'main'])
  git(dir, ['remote', 'add', 'origin', remote])
  git(dir, ['push', '-q', 'origin', 'main'])

  // The rc this checkout has been working on, with a commit of its own.
  git(dir, ['switch', '-q', '-c', '2026/Q4'])
  commit(dir, 'q4.txt', 'q4 work', '2020-02-01T00:00:00Z')
  git(dir, ['push', '-q', '-u', 'origin', '2026/Q4'])

  // A spec forked from it, with work on top.
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
  if (spec) {
    git(dir, ['worktree', 'add', '-q', '-b', 'feat/thing', worktree, '2026/Q4'])
    git(worktree, ['config', 'user.email', 'test@example.com'])
    commit(worktree, 'work.txt', 'phase 1', '2020-02-15T00:00:00Z')
  }

  // The lead cuts the next rc from main, in another clone. This checkout has
  // never fetched it — only `up` / `integrate` fetching can reveal it.
  execFileSync('git', ['clone', '-q', remote, lead], { stdio: 'ignore' })
  git(lead, ['config', 'user.email', 'lead@example.com'])
  git(lead, ['config', 'user.name', 'Lead'])
  git(lead, ['switch', '-q', '-c', '2027/Q1', 'origin/main'])
  commit(lead, 'q1.txt', 'q1 cut', '2020-03-01T00:00:00Z')
  git(lead, ['push', '-q', 'origin', '2027/Q1'])

  return { dir, remote, lead, worktree }
}

function cleanup({ dir, remote, lead }) {
  try {
    git(dir, ['worktree', 'prune'])
  } catch {}
  for (const p of [dir, path.resolve(dir, `../${path.basename(dir)}-wt`), remote, lead]) {
    fs.rmSync(p, { recursive: true, force: true })
  }
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

function runThese(out) {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.trim().startsWith('run these'))
  assert.ok(start !== -1, `no "run these" heading in:\n${out}`)
  const block = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break
    block.push(line.trim())
  }
  return block
}

// --- integrate ---------------------------------------------------------------

test('integrate: fetches, says the spec is retargeted, and switches the primary checkout first', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    assert.match(out, /base: {6}2027\/Q1/)
    assert.match(out, /retarget: {2}forked from 2026\/Q4 · landing onto 2027\/Q1/)
    assert.match(out, /primary: {3}on 2026\/Q4 — switched to 2027\/Q1 before the land/)
    assert.deepStrictEqual(runThese(out), [
      `git -C ${shellPath(fx.dir)} switch -c 2027/Q1 --track origin/2027/Q1`,
      `git -C ${shellPath(fx.worktree)} rebase 2027/Q1`,
      `git -C ${shellPath(fx.dir)} merge --ff-only feat/thing`,
    ])
  } finally {
    cleanup(fx)
  }
})

test('integrate: the printed plan runs, and lands on the new rc rather than the old', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    for (const cmd of runThese(out)) {
      const [, , cwd, ...args] = cmd.split(' ')
      git(cwd, args)
    }
    assert.strictEqual(git(fx.dir, ['symbolic-ref', '--short', 'HEAD']), '2027/Q1')
    assert.strictEqual(git(fx.dir, ['rev-parse', '2027/Q1']), git(fx.dir, ['rev-parse', 'feat/thing']))
    assert.strictEqual(git(fx.dir, ['rev-parse', '2026/Q4']), git(fx.dir, ['rev-parse', 'origin/2026/Q4']))
  } finally {
    cleanup(fx)
  }
})

test('integrate: a local base branch is switched to, not created', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['fetch', '-q', 'origin'])
    git(fx.dir, ['branch', '-q', '--track', '2027/Q1', 'origin/2027/Q1'])
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    assert.strictEqual(runThese(out)[0], `git -C ${shellPath(fx.dir)} switch 2027/Q1`)
  } finally {
    cleanup(fx)
  }
})

test('integrate: a dirty primary checkout on the old rc refuses, naming both branches', async () => {
  const fx = scaffold()
  try {
    fs.writeFileSync(path.join(fx.dir, 'seed.txt'), 'edited\n')
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    assert.match(
      out,
      /blocked — the primary checkout is on 2026\/Q4, not 2027\/Q1, and has uncommitted changes/,
    )
    assert.doesNotMatch(out, /run these/)
  } finally {
    cleanup(fx)
  }
})

test('integrate: a pin is honoured with no retarget line', async () => {
  const fx = scaffold({ config: { baseBranchPattern: '20??/Q?', baseBranch: '2026/Q4' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    assert.match(out, /base: {6}2026\/Q4/)
    assert.doesNotMatch(out, /retarget:|primary:/)
  } finally {
    cleanup(fx)
  }
})

test('integrate: no pattern → no fetch, no retarget, no switch (stays silent)', async () => {
  const fx = scaffold({ config: { baseBranch: '2026/Q4' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-thing', '--dir', fx.dir])
    assert.doesNotMatch(out, /retarget:|primary:|fetch/)
    assert.deepStrictEqual(runThese(out), [
      `git -C ${shellPath(fx.worktree)} rebase 2026/Q4`,
      `git -C ${shellPath(fx.dir)} merge --ff-only feat/thing`,
    ])
    // Nothing fetched: the rc the lead cut is still unknown here.
    assert.throws(() => git(fx.dir, ['rev-parse', '--verify', 'origin/2027/Q1']))
  } finally {
    cleanup(fx)
  }
})

// --- up ----------------------------------------------------------------------

test('up: fetches and forks from the new rc, not from the checkout\'s old one', async () => {
  const fx = scaffold({ spec: false })
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-other', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b feat\/other origin\/2027\/Q1/)
    assert.match(out, /fork: {6}origin\/2027\/Q1 {2}\(the base — the primary checkout is on 2026\/Q4\)/)
  } finally {
    cleanup(fx)
  }
})

test('up: a primary checkout already on the base forks as it always did', async () => {
  const fx = scaffold({ spec: false })
  try {
    git(fx.dir, ['fetch', '-q', 'origin'])
    git(fx.dir, ['switch', '-q', '-c', '2027/Q1', '--track', 'origin/2027/Q1'])
    const out = await runQuiet(['spec-env', 'up', 'feat-other', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b feat\/other\n/)
    assert.doesNotMatch(out, /fork:/)
  } finally {
    cleanup(fx)
  }
})

test('up: an uncommitted spec on the old rc refuses rather than fork without it', async () => {
  const fx = scaffold({ spec: false })
  try {
    writeSpec(fx.dir, 'backlog', 'feat-new')
    const out = await runQuiet(['spec-env', 'up', 'feat-new', '--dir', fx.dir])
    assert.match(out, /blocked — feat-new is uncommitted on 2026\/Q4, but the base is origin\/2027\/Q1/)
  } finally {
    cleanup(fx)
  }
})

test('up: no pattern → the plan forks from the checkout, and nothing is fetched', async () => {
  const fx = scaffold({ config: {}, spec: false })
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-other', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b feat\/other\n/)
    assert.doesNotMatch(out, /fork:|fetch/)
    assert.throws(() => git(fx.dir, ['rev-parse', '--verify', 'origin/2027/Q1']))
  } finally {
    cleanup(fx)
  }
})

// --- the guard and live overlay read the same resolver ---------------------

function fakeGit(map) {
  return (argv) => {
    const key = argv.join(' ')
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
  }
}

const MATCHES = 'for-each-ref --sort=-committerdate --format=%(refname) refs/remotes/origin/20??/Q?'

test('a checkout left on the old rc is no longer "on base"; the new rc is', () => {
  const config = { baseBranchPattern: '20??/Q?' }
  const refs = 'refs/remotes/origin/2027/Q1\nrefs/remotes/origin/2026/Q4'
  const onOld = fakeGit({ [MATCHES]: refs, 'symbolic-ref --short HEAD': '2026/Q4' })
  const onNew = fakeGit({ [MATCHES]: refs, 'symbolic-ref --short HEAD': '2027/Q1' })
  assert.deepStrictEqual(assertPrimaryOnMain(config, onOld), {
    onBase: false,
    branch: '2026/Q4',
    baseBranch: '2027/Q1',
  })
  assert.strictEqual(assertPrimaryOnMain(config, onNew).onBase, true)
})

test('main-guard: refuses on the new rc, and fails open when no rc resolves', () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-roll-guard-')))
  try {
    const config = { baseBranchPattern: '20??/Q?', guards: { mainIsLandingZone: true } }
    const base = { 'rev-parse --git-common-dir': '.git', 'symbolic-ref --short HEAD': '2027/Q1' }
    const fires = checkMainWrite(dir, config, fakeGit({ ...base, [MATCHES]: 'refs/remotes/origin/2027/Q1' }), {
      present: true,
    })
    assert.strictEqual(fires.refuse, true)
    assert.strictEqual(fires.baseBranch, '2027/Q1')

    // Nothing fetched yet: the resolver refuses, and the guard reads that as
    // cannot-tell — it allows rather than blocking every write in the repo.
    const quiet = checkMainWrite(dir, config, fakeGit({ ...base, [MATCHES]: '' }), { present: true })
    assert.strictEqual(quiet.refuse, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
