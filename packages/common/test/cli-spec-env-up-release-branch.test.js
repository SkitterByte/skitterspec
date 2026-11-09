'use strict'

/**
 * A BRANCH-BASED hotfix (`hotfix.releaseBranch`) forks from the remote's head of
 * the release branch — fetched first, because prod is whatever that branch holds
 * now, not whatever this clone last saw — and the plan says which commit, in the
 * exact `Base version` form the skill records.
 *
 * Driven over a real repo with a bare remote and a second clone that moves the
 * release branch on, because "fetched first" is only provable by a commit this
 * clone has never seen.
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

function commit(cwd, file, msg) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', msg)
}

function scaffold(hotfix = { releaseBranch: 'master' }) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-relbranch-')))
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-relbranch-remote-')))
  const lead = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-relbranch-lead-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })

  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, docker: { enabled: false }, hotfix },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  commit(dir, 'app.js', 'release')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'tag', 'v1.0.0')
  git(dir, 'branch', 'master')
  git(dir, 'remote', 'add', 'origin', remote)
  git(dir, 'push', '-q', 'origin', 'main', 'master')
  commit(dir, 'app.js', 'main moved on')

  // Prod moves on in someone else's clone: a hotfix merged straight to master.
  execFileSync('git', ['clone', '-q', '-b', 'master', remote, lead], { stdio: 'ignore' })
  git(lead, 'config', 'user.email', 'lead@example.com')
  git(lead, 'config', 'user.name', 'Lead')
  commit(lead, 'prod.txt', 'earlier hotfix on master')
  git(lead, 'push', '-q', 'origin', 'master')

  return { dir, remote, lead, head: git(lead, 'rev-parse', '--short=12', 'HEAD') }
}

function cleanup({ dir, remote, lead }) {
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

test('up --docs: a branch-based hotfix forks from the fetched head of the release branch', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'up', 'hotfix-pay', '--docs', '--dir', fx.dir])
    assert.match(out, new RegExp(`git worktree add \\S+ -b hotfix/pay ${fx.head}\\n`))
    assert.match(out, new RegExp(`fork: {6}master@${fx.head} {2}\\(the head of origin/master\\)`))
    assert.match(out, new RegExp(`record: {4}> \\*\\*Base version:\\*\\* master@${fx.head}`))
  } finally {
    cleanup(fx)
  }
})

test('up --docs: an explicit --from still wins over the release branch', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'up', 'hotfix-pay', '--docs', '--from', 'v1.0.0', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b hotfix\/pay v1\.0\.0\n/)
    assert.doesNotMatch(out, /record:/)
  } finally {
    cleanup(fx)
  }
})

test('up --docs --from <branch>@<sha>: forks from the sha', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, 'fetch', '-q', 'origin')
    const out = await runQuiet([
      'spec-env', 'up', 'hotfix-pay', '--docs', '--from', `master@${fx.head}`, '--dir', fx.dir,
    ])
    assert.match(out, new RegExp(`git worktree add \\S+ -b hotfix/pay ${fx.head}\\n`))
  } finally {
    cleanup(fx)
  }
})

test('up --docs: a release branch the remote does not have refuses, and records nothing', async () => {
  const fx = scaffold({ releaseBranch: 'no-such-branch' })
  try {
    const out = await runQuiet(['spec-env', 'up', 'hotfix-pay', '--docs', '--dir', fx.dir])
    assert.match(out, /^spec-env up: hotfix\.releaseBranch is "no-such-branch", but origin\/no-such-branch is not known here/)
    assert.doesNotMatch(out, /worktree add/)
    assert.ok(!fs.existsSync(path.join(fx.dir, '.spec-env', 'registry.json')), 'no registry record written')
  } finally {
    cleanup(fx)
  }
})

test('up --docs: with releaseBranch unset, a hotfix plans exactly as before (stays silent)', async () => {
  const fx = scaffold({})
  try {
    const out = await runQuiet(['spec-env', 'up', 'hotfix-pay', '--docs', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b hotfix\/pay\n/)
    assert.doesNotMatch(out, /fork:|record:/)
    // Nothing fetched: the lead's commit is still unknown here.
    assert.throws(() => git(fx.dir, 'rev-parse', '--verify', fx.head))
  } finally {
    cleanup(fx)
  }
})

test('up --docs: a non-hotfix spec never forks from the release branch', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-thing', '--docs', '--dir', fx.dir])
    assert.match(out, /git worktree add \S+ -b feat\/thing\n/)
    assert.doesNotMatch(out, /record:/)
  } finally {
    cleanup(fx)
  }
})
