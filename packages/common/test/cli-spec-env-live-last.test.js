'use strict'

// bug-live-release-forgets-spec: after `/spec-live off` the session stands in
// the primary checkout, and with several worktrees provisioned a bare resolve
// could not say which spec had just been released — so `/spec-next` refused a
// spec that was plainly in flight. `live release` now records the spec it
// released as this checkout's last-live spec, and a bare resolve from the
// primary checkout takes it as a rung before "the sole provisioned spec".

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { shellPath } = require('../src/env/project.js')
const { makeRepo, repoFor } = require('./helpers/repo.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  return makeRepo({
    name: 'skitterspec-lastlive-',
    config: { baseBranch: 'main', docker: { enabled: false } },
  }).dir
}

function addSpec(dir, folder) {
  const specDir = path.join(dir, 'specs', 'in-progress', folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  repoFor(dir).commit(`add ${folder}`)
}

// Two specs, each with a worktree, so "the sole provisioned spec" never answers.
function twoSpecs() {
  const dir = scaffold()
  addSpec(dir, 'feat-alpha')
  addSpec(dir, 'feat-beta')
  const alpha = repoFor(dir).addWorktree('feat-alpha')
  const beta = repoFor(dir).addWorktree('feat-beta')
  return { dir, alpha, beta }
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

// Every resolve below runs FROM the primary checkout — the place `/spec-live
// main` leaves the session — since that is the only cwd the record speaks for.
async function inPrimary(dir, fn) {
  const cwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn()
  } finally {
    process.chdir(cwd)
  }
}

const lastLiveFile = (dir) => path.join(dir, '.spec-env', 'last-live.json')

test('take → release → a bare resolve names the released spec', async () => {
  const { dir } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--dir', dir]))
    assert.match(out, /^spec:\s+feat-alpha/m)
    assert.match(out, /^via:\s+last live on this checkout/m)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('take A → release → take B → release → resolve names B', async () => {
  const { dir } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'take', 'feat-beta', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--dir', dir]))
    assert.match(out, /^spec:\s+feat-beta/m)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('taking another spec clears the record of the last one', async () => {
  const { dir } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.ok(fs.existsSync(lastLiveFile(dir)), 'release wrote the record')
    await runQuiet(['spec-env', 'live', 'take', 'feat-beta', '--dir', dir])
    assert.ok(!fs.existsSync(lastLiveFile(dir)), 'the take of another spec cleared it')
  } finally {
    repoFor(dir).cleanup()
  }
})

test('stays silent: a recorded spec whose worktree was torn down falls through', async () => {
  const { dir } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    git(dir, 'worktree', 'remove', '--force', repoFor(dir).worktreeFor('alpha').wt)
    // One worktree left: the stale record is cannot-tell, and the sole rung
    // answers exactly as it would with no record at all.
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--dir', dir]))
    assert.match(out, /^spec:\s+feat-beta/m)
    assert.doesNotMatch(out, /alpha/)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('stays silent: an unreadable record falls through, never an error', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    repoFor(dir).addWorktree('feat-alpha')
    fs.mkdirSync(path.join(dir, '.spec-env'), { recursive: true })
    fs.writeFileSync(lastLiveFile(dir), '{ not json')
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--dir', dir]))
    assert.match(out, /^spec:\s+feat-alpha/m)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('stays silent: no record and one worktree resolves as it always did', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    repoFor(dir).addWorktree('feat-alpha')
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--dir', dir]))
    assert.match(out, /^spec:\s+feat-alpha/m)
    assert.doesNotMatch(out, /last live/)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('the record does not speak from inside another spec’s worktree', async () => {
  const { dir, beta } = twoSpecs()
  const cwd = process.cwd()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    process.chdir(beta)
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /^spec:\s+feat-beta/m, 'the worktree you stand in still wins')
  } finally {
    process.chdir(cwd)
    repoFor(dir).cleanup()
  }
})

test('release names the worktree and the /spec-next line that builds there', async () => {
  const { dir, alpha } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /feat-alpha released/)
    assert.ok(out.includes(`worktree:  ${alpha}`), out)
    assert.ok(out.includes(`/spec-next --worktree ${shellPath(alpha)}`), out)
  } finally {
    repoFor(dir).cleanup()
  }
})

test('resolve --json tells several worktrees from none', async () => {
  const { dir, alpha, beta } = twoSpecs()
  try {
    const out = await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--json', '--dir', dir]))
    const r = JSON.parse(out)
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.reason, 'ambiguous')
    assert.deepStrictEqual(
      r.candidates.map((c) => c.spec),
      ['feat-alpha', 'feat-beta'],
    )
    assert.deepStrictEqual(
      r.candidates.map((c) => fs.realpathSync.native(c.worktree)),
      [alpha, beta].map((p) => fs.realpathSync.native(p)),
    )
  } finally {
    repoFor(dir).cleanup()
  }

  const empty = scaffold()
  try {
    addSpec(empty, 'feat-alpha')
    const r = JSON.parse(await runQuiet(['spec-env', 'resolve', '--json', '--dir', empty]))
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.reason, 'none')
    assert.deepStrictEqual(r.candidates, [])
  } finally {
    repoFor(empty).cleanup()
  }
})

test('resolve --json names the spec and how it was resolved', async () => {
  const { dir } = twoSpecs()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir])
    await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    const r = JSON.parse(
      await inPrimary(dir, () => runQuiet(['spec-env', 'resolve', '--json', '--dir', dir])),
    )
    assert.strictEqual(r.ok, true)
    assert.strictEqual(r.spec, 'feat-alpha')
    assert.strictEqual(r.via, 'last-live')
  } finally {
    repoFor(dir).cleanup()
  }
})
