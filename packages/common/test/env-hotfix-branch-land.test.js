'use strict'

/**
 * A branch-based hotfix (`Base version: <branch>@<sha>`) lands ON the release
 * branch by `land.strategy` — the planner over plain facts, then the real CLI
 * and runner over a real repo with a bare remote for the fast-forward path,
 * because "landed" there means the remote branch moved, which only git can say.
 *
 * The tag-based land is untouched by any of this; `env-hotfix*.test.js` still
 * pins it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { planBranchHotfixLand } = require('../src/env/hotfix.js')
const { runHotfixLand } = require('../src/env/hotfixland.js')
const { run } = require('../src/cli.js')

// --- planner -----------------------------------------------------------------

const SPEC = {
  folder: 'hotfix-pay',
  slug: 'pay',
  branch: 'hotfix/pay',
  worktreePath: '/wt/pay',
  baseRef: '1a2b3c4d5e6f',
  baseVersion: { kind: 'branch', branch: 'master', sha: '1a2b3c4d5e6f', ref: '1a2b3c4d5e6f' },
}
const config = (hotfix = {}) => ({ hotfix: { bump: 'patch', tag: true, releaseWith: '', ...hotfix } })
const FRESH = { remote: 'origin', behind: true, onRelease: false, lastTag: 'v2.4.0', existingTags: ['v2.4.0'] }
const kinds = (plan) => plan.steps.map((s) => (s.via ? `${s.kind}:${s.via}` : s.kind))

test('ff: rebase, tag from the release branch\'s newest tag, then push the head onto it', () => {
  const plan = planBranchHotfixLand(SPEC, config(), { ...FRESH, strategy: 'ff', push: true })
  assert.deepStrictEqual(kinds(plan), ['rebase', 'release:tag', 'push:push'])
  assert.strictEqual(plan.steps[0].onto, 'origin/master')
  assert.strictEqual(plan.steps[1].tag, 'v2.4.1')
  assert.deepStrictEqual(plan.steps[2].refs, ['hotfix/pay:master'])
  assert.strictEqual(plan.steps[2].withTag, true)
})

test('ff: without consent the push holds — the land is the push', () => {
  const plan = planBranchHotfixLand(SPEC, config(), { ...FRESH, strategy: 'ff' })
  assert.strictEqual(plan.steps.at(-1).via, 'hold')
})

test('ff: hotfix.tag false lands with no release step and no tag push', () => {
  const plan = planBranchHotfixLand(SPEC, config({ tag: false }), { ...FRESH, strategy: 'ff', push: true })
  assert.deepStrictEqual(kinds(plan), ['rebase', 'push:push'])
  assert.strictEqual(plan.steps[1].withTag, false)
})

test('ff: no tag on the release branch to bump from refuses, naming the two ways out', () => {
  const plan = planBranchHotfixLand(SPEC, config(), { ...FRESH, strategy: 'ff', lastTag: null })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /no release tag on master to bump from — set hotfix\.tag false, or hotfix\.releaseWith/)
})

test('ff: landed and tag published is a no-op on re-run', () => {
  const plan = planBranchHotfixLand(SPEC, config(), {
    ...FRESH,
    strategy: 'ff',
    behind: false,
    onRelease: true,
    released: { tag: 'v2.4.1' },
    tagPushed: true,
  })
  assert.strictEqual(plan.noop, true)
})

test('ff: landed but the tag never pushed publishes only the tag', () => {
  const plan = planBranchHotfixLand(SPEC, config(), {
    ...FRESH,
    strategy: 'ff',
    push: true,
    behind: false,
    onRelease: true,
    released: { tag: 'v2.4.1' },
    tagPushed: false,
  })
  assert.deepStrictEqual(kinds(plan), ['release:recorded', 'push:push'])
  assert.deepStrictEqual(plan.steps[1].refs, [])
})

test('ff: a recorded release is discarded when the branch must rebase', () => {
  const plan = planBranchHotfixLand(SPEC, config(), { ...FRESH, strategy: 'ff', released: { tag: 'v2.4.1' } })
  assert.strictEqual(plan.steps[1].via, 'tag')
})

test('pr: rebase, force-push the branch, open a READY PR, then wait for the merge', () => {
  const plan = planBranchHotfixLand(SPEC, config(), {
    ...FRESH,
    strategy: 'pr',
    push: true,
    pr: { state: 'none', id: null, url: null },
    prCommand: 'gh pr create --head hotfix/pay --base master --fill',
  })
  assert.deepStrictEqual(kinds(plan), ['rebase', 'push:push', 'pr', 'wait'])
  assert.strictEqual(plan.steps[1].force, true)
  assert.deepStrictEqual(plan.steps[1].refs, ['hotfix/pay'])
  assert.strictEqual(plan.steps[1].withTag, false)
  assert.doesNotMatch(plan.steps[2].command, /--draft/)
})

test('pr: once merged, tag the release branch as the host left it and push the tag', () => {
  const plan = planBranchHotfixLand(SPEC, config(), {
    ...FRESH,
    strategy: 'pr',
    push: true,
    behind: false,
    pr: { state: 'merged', id: 14, url: null },
  })
  assert.deepStrictEqual(kinds(plan), ['release:tag', 'push:push'])
  assert.strictEqual(plan.steps[0].at, 'origin/master')
  assert.deepStrictEqual(plan.steps[1].refs, [])
})

test('pr: merged with hotfix.tag false is landed — nothing to do', () => {
  const plan = planBranchHotfixLand(SPEC, config({ tag: false }), {
    ...FRESH,
    strategy: 'pr',
    pr: { state: 'merged', id: 14, url: null },
  })
  assert.strictEqual(plan.noop, true)
})

test('pr: a project release command refuses — its tag would not survive the merge', () => {
  const plan = planBranchHotfixLand(SPEC, config({ releaseWith: 'node release.cjs --json' }), {
    ...FRESH,
    strategy: 'pr',
  })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /hotfix\.releaseWith cannot release a branch-based hotfix landed by PR/)
})

test('runner: the wait step holds, and nothing after it runs', () => {
  const calls = []
  const spawn = (cmd, args) => {
    calls.push([cmd, ...(Array.isArray(args) ? args : [])].join(' '))
    return { status: 0, stdout: 'https://example.invalid/pr/14\n', stderr: '' }
  }
  const plan = planBranchHotfixLand(SPEC, config(), {
    ...FRESH,
    strategy: 'pr',
    push: true,
    pr: { state: 'none', id: null, url: null },
    prCommand: 'gh pr create --head hotfix/pay --base master --fill',
  })
  const r = runHotfixLand(plan.steps, { spawn, childStderr: () => {} })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.held, true)
  assert.ok(calls.includes('git -C /wt/pay push --force-with-lease -u origin hotfix/pay'))
  assert.ok(calls.includes('gh pr create --head hotfix/pay --base master --fill'))
})

test('runner: a conflicted rebase is aborted and stops the run', () => {
  const calls = []
  const spawn = (cmd, args) => {
    const line = [cmd, ...(Array.isArray(args) ? args : [])].join(' ')
    calls.push(line)
    return { status: /rebase origin\/master$/.test(line) ? 1 : 0, stdout: '', stderr: 'CONFLICT (content)\n' }
  }
  const plan = planBranchHotfixLand(SPEC, config(), { ...FRESH, strategy: 'ff', push: true })
  const r = runHotfixLand(plan.steps, { spawn, childStderr: () => {} })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 1)
  assert.ok(calls.includes('git -C /wt/pay rebase --abort'))
  assert.ok(!calls.some((c) => c.includes(' push ')))
})

// --- CLI over a real repo, ff ---------------------------------------------------

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

// master on a bare remote carrying v2.4.0; a branch-based hotfix worktree forked
// from master's head with a fix on it; then master moves on in another clone,
// so the land has to rebase.
function scaffold(hotfix = { releaseBranch: 'master' }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hfland-')))
  const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hfland-remote-')))
  const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hfland-other-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, docker: { enabled: false }, hotfix }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  commit(dir, 'app.js', 'release')
  git(dir, 'branch', '-M', 'master')
  git(dir, 'tag', 'v2.4.0')
  git(dir, 'remote', 'add', 'origin', remote)
  git(dir, 'push', '-q', 'origin', 'master', 'v2.4.0')
  git(dir, 'switch', '-q', '-c', 'main')

  const sha = git(dir, 'rev-parse', '--short=12', 'master')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'pay')
  git(dir, 'worktree', 'add', '-q', '-b', 'hotfix/pay', wt, sha)
  const specDir = path.join(wt, 'specs', 'in-progress', 'hotfix-pay')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    `# Pay\n\n> **Type:** Hotfix\n> **Base version:** master@${sha}\n> **Stack:** worktree\n`,
  )
  commit(wt, 'fix.txt', 'fix the crash')

  execFileSync('git', ['clone', '-q', '-b', 'master', remote, other], { stdio: 'ignore' })
  git(other, 'config', 'user.email', 'o@example.com')
  git(other, 'config', 'user.name', 'Other')
  commit(other, 'other.txt', 'another hotfix merged first')
  git(other, 'push', '-q', 'origin', 'master')
  return { dir, wt, remote, other }
}

function cleanup({ dir, remote, other }) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  for (const p of [dir, path.resolve(dir, `../${path.basename(dir)}-wt`), remote, other]) {
    fs.rmSync(p, { recursive: true, force: true })
  }
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  const origErr = process.stderr.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  process.stderr.write = () => true
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
    process.stderr.write = origErr
  }
  return out
}

test('hotfix land (ff): without --push it plans, cuts the tag, and holds before anything leaves', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'hotfix', 'land', 'hotfix-pay', '--dir', fx.dir])
    assert.match(out, /release: {3}origin\/master {2}\(fast-forward\)/)
    assert.match(out, /rebased onto origin\/master/)
    assert.match(out, /tagged v2\.4\.1/)
    assert.match(out, /held: {6}nothing pushed/)
    assert.match(out, /push origin hotfix\/pay:master/)
    assert.notStrictEqual(git(fx.remote, 'rev-parse', 'master'), git(fx.wt, 'rev-parse', 'HEAD'))
  } finally {
    cleanup(fx)
  }
})

test('hotfix land (ff) --push: lands on master, publishes the tag, and a re-run is a no-op', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'hotfix', 'land', 'hotfix-pay', '--push', '--dir', fx.dir])
    assert.match(out, /landed: {4}on origin\/master · tagged v2\.4\.1/)
    const head = git(fx.wt, 'rev-parse', 'HEAD')
    assert.strictEqual(git(fx.remote, 'rev-parse', 'master'), head)
    assert.strictEqual(git(fx.remote, 'rev-parse', 'v2.4.1^{commit}'), head)
    // The other hotfix is still there: the land rebased, it did not overwrite.
    git(fx.remote, 'cat-file', '-e', 'master:other.txt')

    const again = await runQuiet(['spec-env', 'hotfix', 'land', 'hotfix-pay', '--push', '--dir', fx.dir])
    assert.match(again, /already on origin\/master — nothing to land/)
  } finally {
    cleanup(fx)
  }
})

test('hotfix land (ff) --push, hotfix.tag false: lands with no tag cut', async () => {
  const fx = scaffold({ releaseBranch: 'master', tag: false })
  try {
    const out = await runQuiet(['spec-env', 'hotfix', 'land', 'hotfix-pay', '--push', '--dir', fx.dir])
    assert.match(out, /landed: {4}on origin\/master\n/)
    assert.strictEqual(git(fx.wt, 'tag', '--list', 'v2.4.1'), '')
  } finally {
    cleanup(fx)
  }
})

test('hotfix land --plan: the pr strategy plans a ready PR and the wait, running nothing', async () => {
  const fx = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'hotfix', 'land', 'hotfix-pay', '--strategy', 'pr', '--plan', '--dir', fx.dir])
    assert.match(out, /\(by pull request\)/)
    assert.match(out, /1\. rebase: onto origin\/master/)
    assert.match(out, /2\. push: held/)
    assert.match(out, /4\. wait: the PR into master is not merged yet/)
    assert.doesNotMatch(out, /--draft/)
  } finally {
    cleanup(fx)
  }
})
