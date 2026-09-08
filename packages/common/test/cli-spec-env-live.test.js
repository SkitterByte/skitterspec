'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { writeReceipt } = require('../src/env/live.js')

// Live-git tests for `spec-env live status`. Exercise the real anchor path: the
// authority on "who's live" is the branch checked out in the PRIMARY checkout,
// regardless of the cwd the command is invoked from.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
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

function scaffoldRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n')
  // Gitignore the runtime state dir (as the real repo does) so the receipt the
  // engine writes under .spec-env doesn't read as an uncommitted change.
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main') // guarantee the base branch is `main`
  return dir
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('live status reports free when the primary checkout is on main', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(out, /primary:\s+main\s+\(on base — free\)/)
    assert.match(out, /receipt:\s+free — no spec is live/)
  } finally {
    cleanup(dir)
  }
})

test('live status anchors on the primary checkout when run from a worktree', async () => {
  const dir = scaffoldRepo()
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  try {
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
    // Primary is still on main → free, whichever checkout we invoke from.
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', worktree])
    assert.match(out, /primary:\s+main\s+\(on base — free\)/)
  } finally {
    cleanup(dir)
  }
})

test('live status shows the feature in control and the receipt when held', async () => {
  const dir = scaffoldRepo()
  try {
    // Simulate a live session: primary switched to the feature branch + a receipt.
    git(dir, 'checkout', '-q', '-b', 'feat/x')
    writeReceipt(dir, { registry: '.spec-env/registry.json' }, {
      spec: 'feat-x',
      branch: 'feat/x',
      holder: 'Test',
      heldSince: '2026-08-03T10:00:00Z',
      baseMainCommit: git(dir, 'rev-parse', 'HEAD'),
    })
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(out, /primary:\s+feat\/x\s+\(feature in control — not on main\)/)
    assert.match(out, /receipt:\s+feat-x \(branch feat\/x\)/)
    assert.match(out, /held by Test/)
  } finally {
    cleanup(dir)
  }
})

// A primary checkout on main with a spec + a worktree on feat/x, one commit ahead.
function scaffoldRepoWithSpecWorktree() {
  const dir = scaffoldRepo()
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'spec')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
  fs.writeFileSync(path.join(worktree, 'change.txt'), 'work\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'phase work')
  return { dir, worktree }
}

test('live take switches the primary checkout to the branch and writes a receipt', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
    // No dev ports configured → warns rather than blocks.
    assert.match(out, /nothing to hot-reload/)

    // The primary checkout is now on the feature branch (the lock is held)…
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    // …the worktree was detached to free the branch (rev-parse → "HEAD")…
    assert.strictEqual(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD')
    // …and a receipt records the live spec.
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'live.json'), 'utf-8'))
    assert.strictEqual(receipt.spec, 'feat-x')
    assert.strictEqual(receipt.branch, 'feat/x')
  } finally {
    cleanup(dir)
  }
})

test('a second live take is refused while a spec holds the instance', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // now live
    const again = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    assert.match(again, /blocked — primary checkout is on feat\/x, not main/)
  } finally {
    cleanup(dir)
  }
})

test('live release hands the instance back to base and re-isolates the branch', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // now live on feat/x
    // No spec arg → resolves the live spec from the receipt. `/spec-live main`
    // reaches this through the alias arm (covered below).
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /feat-x released — primary back on main/)

    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main') // base back
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x') // re-isolated
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'live.json'))) // receipt cleared
  } finally {
    cleanup(dir)
  }
})

test('live release refuses to discard uncommitted fixes on the branch', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    fs.writeFileSync(path.join(dir, 'README.md'), '# edited while live\n') // uncommitted fix
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /blocked — primary checkout has uncommitted changes/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x') // still live
  } finally {
    cleanup(dir)
  }
})

test('live status <spec> reports "live: no" when the spec is not live', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    const out = await runQuiet(['spec-env', 'live', 'status', 'feat-x', '--dir', dir])
    assert.match(out, /spec-env live status: feat-x/)
    assert.match(out, /spec:\s+feat-x\s+\(branch feat\/x\)/)
    assert.match(out, /live:\s+no — primary is on main/)
  } finally {
    cleanup(dir)
  }
})

test('live status <spec> reports "live: yes" once the spec holds the primary checkout', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    // Anchors on the primary checkout — the verdict holds even queried from the worktree.
    const out = await runQuiet(['spec-env', 'live', 'status', 'feat-x', '--dir', dir])
    assert.match(out, /live:\s+yes — feat-x holds the primary checkout/)
  } finally {
    cleanup(dir)
  }
})

test('live abort recovers a crashed session; refuses to discard dirty work', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // live, receipt present

    // Dirty → abort refuses (won't blow away work).
    fs.writeFileSync(path.join(dir, 'README.md'), '# uncommitted\n')
    const blocked = await runQuiet(['spec-env', 'live', 'abort', '--dir', dir])
    assert.match(blocked, /blocked — .*would discard/)

    // Clean it up, then abort recovers.
    git(dir, 'checkout', '--', 'README.md')
    const out = await runQuiet(['spec-env', 'live', 'abort', '--dir', dir])
    assert.match(out, /recovered — primary back on main/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'live.json')))
  } finally {
    cleanup(dir)
  }
})

// --- front-door grammar ----------------------------------------------------
//
// Every doc says to type `/spec-live <spec>` and `/spec-live main`, and the
// command relays its arguments to `spec-env live` untranslated — so the engine
// must accept the spec-name and base-branch forms, not verbs alone.

test('live <spec> means take', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    const out = await runQuiet(['spec-env', 'live', 'feat-x', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.strictEqual(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD')
  } finally {
    cleanup(dir)
  }
})

test('live main means release', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    const out = await runQuiet(['spec-env', 'live', 'main', '--dir', dir])
    assert.match(out, /feat-x released — primary back on main/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT: the alias arm must not swallow the verbs it sits beside. A bare
// `live` is still a read-only status report — the form most people type first,
// and the one where guessing `take` would branch-switch the repo under them.
test('the alias arm leaves the verb forms alone', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    const bare = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(bare, /primary:\s+main\s+\(on base — free\)/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')

    const explicit = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    assert.match(explicit, /feat-x is live on the primary checkout/)

    const query = await runQuiet(['spec-env', 'live', 'status', 'feat-x', '--dir', dir])
    assert.match(query, /live:\s+yes — feat-x holds the primary checkout/)
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT: a repo whose base branch is not called `main`. The alias arm
// must read its OWN base branch as the release word — and still honour the
// literal `main` the docs print, so the muscle memory works in either repo.
test('live <base branch> releases where the base is not named main', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'trunk', docker: { enabled: false } }, null, 2),
    )
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'rename base')
    git(dir, 'branch', '-M', 'trunk')

    await runQuiet(['spec-env', 'live', 'feat-x', '--dir', dir])
    const byBase = await runQuiet(['spec-env', 'live', 'trunk', '--dir', dir])
    assert.match(byBase, /feat-x released — primary back on trunk/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'trunk')

    // The literal `main` still means release, even though no such branch exists.
    await runQuiet(['spec-env', 'live', 'feat-x', '--dir', dir])
    const byLiteral = await runQuiet(['spec-env', 'live', 'main', '--dir', dir])
    assert.match(byLiteral, /feat-x released — primary back on trunk/)
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
  } finally {
    cleanup(dir)
  }
})

// --- the rebase that could not start is not a conflict -----------------------
//
// Observed 2026-09-08: `/spec-live` reported "hit conflicts — resolve them in
// <worktree>" when the real cause was one unstaged file. Two people then went
// looking for a conflict that did not exist. Two things were wrong and both are
// fixed here — the planner now validates the tree the rebase actually runs in,
// and the CLI reports git's own words when the rebase never began.

test('live take refuses a dirty WORKTREE, not just a dirty primary checkout', () => {
  const { planTake } = require("../src/env/live.js")
  const spec = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const ctx = {
    primary: { onBase: true, branch: 'main' },
    base: 'main',
    clean: true, // the primary checkout is spotless...
    worktreeClean: false, // ...and the worktree, where the rebase runs, is not
    worktreeExists: true,
    serverUp: null,
    migrationsHit: false,
  }
  const plan = planTake(spec, {}, ctx)
  assert.strictEqual(plan.blocked, true, 'refused before any rebase runs')
  assert.match(plan.reason, /worktree has uncommitted changes/i)
  assert.match(plan.reason, /\/wt/, 'names the tree to clean up')
})

test('a clean worktree still passes, so the new guard is not a blanket refusal', () => {
  // The stays-silent half: this check must not fire on the ordinary case.
  const { planTake } = require("../src/env/live.js")
  const spec = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const plan = planTake(spec, {}, {
    primary: { onBase: true, branch: 'main' },
    base: 'main',
    clean: true,
    worktreeClean: true,
    worktreeExists: true,
    serverUp: null,
    migrationsHit: false,
  })
  assert.strictEqual(plan.blocked, false)
})
