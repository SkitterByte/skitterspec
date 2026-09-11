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

// STAYS-SILENT: the alias arm must not swallow the verbs it sits beside.
//
// This test used to assert the opposite of its first case — that a bare `live`
// is a read-only status report. `feat-bare-argument-parity` changed that
// deliberately: every other spec-env verb reads a missing spec as "the one you
// are standing on", and `live` was one of two exceptions. The verb forms below
// are untouched by that, and this is what proves it.
test('the alias arm leaves the verb forms alone', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    const explicit = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    assert.match(explicit, /feat-x is live on the primary checkout/)

    const query = await runQuiet(['spec-env', 'live', 'status', 'feat-x', '--dir', dir])
    assert.match(query, /live:\s+yes — feat-x holds the primary checkout/)

    // And the explicit report still reports rather than acting.
    const report = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(report, /receipt:/)
  } finally {
    cleanup(dir)
  }
})

// --- the bare form -----------------------------------------------------------
//
// One rule: take when there is exactly one answer AND the workbench is free;
// print the report otherwise. The four tests after the first are the
// cannot-tell cases, and every one of them must produce the REPORT — not a
// refusal, and above all not a branch switch.

test('bare live takes the sole provisioned spec', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  try {
    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.strictEqual(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD')
  } finally {
    cleanup(dir)
  }
})

test('bare live takes the spec whose worktree you are standing in', async () => {
  const { dir, worktree } = scaffoldRepoWithSpecWorktree()
  const cwd = process.cwd()
  try {
    // `--dir` still anchors on the primary checkout; cwd is what names the spec.
    process.chdir(worktree)
    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
  } finally {
    process.chdir(cwd)
    cleanup(dir)
  }
})

test('stays silent: several worktrees fall back to the report, and name them', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    // A second provisioned spec makes the bare form ambiguous.
    const specDir = path.join(dir, 'specs', 'in-progress', 'feat-y')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '00-overview.md'), '# Y\n\n> **Stack:** worktree\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'second spec')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/y', path.resolve(dir, `../${path.basename(dir)}-wt`, 'y'))

    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    // The ambiguity is the one cannot-tell the report cannot describe, so it is
    // named ABOVE the report — and the report still prints.
    assert.match(out, /2 specs have worktrees/)
    assert.match(out, /feat-x/)
    assert.match(out, /feat-y/)
    assert.match(out, /primary:\s+main/, 'the report still ran')
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main', 'nothing was taken')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: no provisioned spec falls back to the report, quietly', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(out, /in-flight:\s+none — the workbench is free/)
    // No extra line: the report's own in-flight row already says this.
    assert.doesNotMatch(out, /specs have worktrees/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a spec already holding the instance falls back to the report', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    // Now the workbench is busy — and busy with THIS spec. The honest answer to
    // a bare command is the report that says so, not a refusal to take.
    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(out, /in-flight:\s+feat-x/)
    assert.doesNotMatch(out, /blocked/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x', 'unchanged')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a hand-switched primary checkout falls back to the report', async () => {
  const { dir } = scaffoldRepoWithSpecWorktree()
  try {
    // Off base with NO receipt — the state `spec-env live status` calls
    // "unknown". Taking from here would move work nobody recorded.
    git(dir, 'checkout', '-q', '-b', 'scratch')
    const out = await runQuiet(['spec-env', 'live', '--dir', dir])
    assert.match(out, /in-flight:\s+unknown/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'scratch', 'unchanged')
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

// --- the gate's refusal is /spec-start's only explanation ---------------------
//
// `/spec-start` relays this text verbatim as its gate, so anything missing here
// is missing from the operator's sole account of why they are stuck. It used to
// name only the branch and only `/spec-live main` — which reads as the one way
// out when completing or cancelling the held spec are usually what they want.

test('the off-base refusal names the spec in flight, not just the branch', () => {
  const { planTake } = require('../src/env/live.js')
  const spec = { folder: 'feat-new', branch: 'feat/new', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const plan = planTake(spec, {}, {
    primary: { onBase: false, branch: 'feat/old' },
    base: 'main', clean: true, worktreeClean: true, worktreeExists: true,
    serverUp: null, migrationsHit: false,
    inFlight: 'feat-old',
  })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /feat-old/, 'names the spec, which is what the operator recognises')
  assert.match(plan.reason, /feat\/old/, 'and its branch')
})

test('the refusal names all three ways to free the workbench', () => {
  const { planTake } = require('../src/env/live.js')
  const spec = { folder: 'feat-new', branch: 'feat/new', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const plan = planTake(spec, {}, {
    primary: { onBase: false, branch: 'feat/old' },
    base: 'main', clean: true, worktreeClean: true, worktreeExists: true,
    serverUp: null, migrationsHit: false, inFlight: 'feat-old',
  })
  for (const way of ['/spec-complete', '/spec-cancel', '/spec-live main']) {
    assert.ok(plan.reason.includes(way), `offers ${way}`)
  }
})

test('with no receipt the refusal degrades to the branch, and still refuses', () => {
  // A hand-switched branch has no receipt. The message must stay useful rather
  // than claiming a spec it cannot name — and must not stop refusing.
  const { planTake } = require('../src/env/live.js')
  const spec = { folder: 'feat-new', branch: 'feat/new', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const plan = planTake(spec, {}, {
    primary: { onBase: false, branch: 'feat/hand' },
    base: 'main', clean: true, worktreeClean: true, worktreeExists: true,
    serverUp: null, migrationsHit: false, inFlight: null,
  })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /feat\/hand/)
  assert.doesNotMatch(plan.reason, /undefined|null/, 'no placeholder leaked into the text')
})

test('a free workbench is not refused — the gate stays silent when it should', () => {
  const { planTake } = require('../src/env/live.js')
  const spec = { folder: 'feat-new', branch: 'feat/new', worktreePath: '/wt', type: 'feature', stack: 'worktree' }
  const plan = planTake(spec, {}, {
    primary: { onBase: true, branch: 'main' },
    base: 'main', clean: true, worktreeClean: true, worktreeExists: true,
    serverUp: null, migrationsHit: false, inFlight: null,
  })
  assert.strictEqual(plan.blocked, false)
})
