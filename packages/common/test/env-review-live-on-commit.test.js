'use strict'

/**
 * `live-on` needs one commit, and the gate used to refuse it.
 *
 * The page offers "▶ Commit & put it live" only on a non-midrun render, which
 * is what a finished phase produces — and a finished phase arms the gate. The
 * action is deliberately not a verdict, so it clears nothing; but `live take`
 * refuses a dirty worktree, so handling the press means committing the phase
 * first. That commit is a `git commit` in the spec's own worktree, which is
 * precisely what the armed gate denies. The button could therefore never
 * succeed in the only state it was offered in.
 *
 * The fix is a PERMIT: claiming a `live-on` pass records that one commit is
 * this action's mechanical precondition, and `gate --check --for-command`
 * honours it. Nothing else changes — the gate stays armed, the phase still
 * owes a verdict, and `ACTIONS` stays disjoint from `VERDICTS`.
 *
 * MOST OF THIS SUITE IS THE STAYS-SILENT HALF (`.claude/rules/negative-checks.md`
 * rule 3). A permit widens the one thing in this engine that refuses, so every
 * way it could be too wide has a test: it is not granted without a live-on, not
 * granted on a clean worktree, dies the moment a commit lands, never reaches
 * `/spec-next`, never discharges the obligation, and never covers a commit
 * outside that spec's own worktree.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { readPending, writePending, addPending, readGate } = require('../src/env/review.js')
const { HOOK_SCRIPT } = require('../src/env/hooks.js')

const HOOK = path.join(__dirname, '..', 'assets', 'hooks', path.basename(HOOK_SCRIPT))
const ENGINE = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-on-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  // The phase's work, uncommitted — which is the state `/spec-next` leaves and
  // the only state the deadlock occurs in.
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
  return { dir, wt }
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

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')

const blobOf = (over = {}) => ({
  version: 1,
  spec: 'feat-alpha',
  accepted: [],
  unaccepted: [],
  comments: [],
  ...over,
})

// Put a pass in the holding area the way the serve endpoint does.
function hold(dir, blob, { render = 'R1', at = '2020-01-01T00:00:00.000Z' } = {}) {
  const out = outPath(dir)
  const { pending } = readPending(out, 'feat-alpha')
  const added = addPending(pending, { blob, at, render })
  writePending(out, added.pending)
  return added.code
}

// Run the hook exactly as the harness runs it: JSON on stdin, decision on stdout.
function runHook({ cwd, command = 'git commit -m "phase 2"' }) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      session_id: 's',
      cwd,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    }),
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: ENGINE },
  })
  let decision = null
  try {
    decision = JSON.parse(res.stdout).hookSpecificOutput
  } catch {
    /* no JSON is "no opinion" */
  }
  return { status: res.status, decision }
}

// The whole flow a press produces: render, arm, hold the action pass, claim it.
async function pressLiveOn(dir, { arm = true, action = 'live-on' } = {}) {
  await review(dir)
  if (arm) await runQuiet(['spec-env', 'review', 'arm', 'feat-alpha', '--dir', dir, '--phase', '2'])
  const code = hold(dir, blobOf(action ? { action } : {}))
  return JSON.parse(await review(dir, '--claim', code, '--json'))
}

/* ==========================================================================
 * The defect
 * ========================================================================== */

test('the commit a claimed live-on needs is permitted', async () => {
  // RED BEFORE THE FIX: denied. The button is offered only at the end of a
  // phase, a phase that ended arms the gate, and the gate denied the one commit
  // the action depends on — so every press of it ended in a refusal.
  const { dir, wt } = scaffold()
  try {
    await pressLiveOn(dir)
    const got = runHook({ cwd: wt })
    assert.strictEqual(got.decision, null, 'no opinion — the commit goes ahead')
  } finally {
    cleanup(dir)
  }
})

test('the gate reports the permit, and still reports itself armed', async () => {
  // The permit covers one commit; it is not an answer. `/spec-next` reads this
  // same `state`, and must still refuse to build the next phase.
  const { dir } = scaffold()
  try {
    await pressLiveOn(dir)
    const gate = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(gate.state, 'armed', 'the phase still owes an answer')
    assert.ok(gate.permit, 'and the permit is visible rather than a hidden hole')
    assert.strictEqual(gate.permit.for, 'live-on')
  } finally {
    cleanup(dir)
  }
})

test('the phase still owes a verdict after the permitted commit lands', async () => {
  const { dir, wt } = scaffold()
  try {
    await pressLiveOn(dir)
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'phase 2')
    const gate = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(gate.state, 'armed', 'live-on concluded nothing')
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * Stays silent — a permit is one commit, not a lifted gate
 * ========================================================================== */

test('the permit dies the moment its commit lands', async () => {
  // Bound to the worktree HEAD it was granted against, so it covers exactly the
  // one commit it was the precondition for. A second commit is refused again.
  const { dir, wt } = scaffold()
  try {
    await pressLiveOn(dir)
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'phase 2')
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTHREE\n')

    const got = runHook({ cwd: wt })
    assert.strictEqual(got.decision && got.decision.permissionDecision, 'deny')
    assert.match(got.decision.permissionDecisionReason, /awaiting a verdict/)
  } finally {
    cleanup(dir)
  }
})

test('no live-on, no permit', async () => {
  // The ordinary end of a phase: rendered, armed, nothing pressed. Unchanged.
  const { dir, wt } = scaffold()
  try {
    await pressLiveOn(dir, { action: null })
    const got = runHook({ cwd: wt })
    assert.strictEqual(got.decision && got.decision.permissionDecision, 'deny')
  } finally {
    cleanup(dir)
  }
})

test('a tier action grants nothing', async () => {
  // `allow-network` and `allow-remote` write a config key and commit nothing,
  // so neither has a commit to be the precondition of.
  const { dir, wt } = scaffold()
  try {
    await pressLiveOn(dir, { action: 'allow-remote' })
    const got = runHook({ cwd: wt })
    assert.strictEqual(got.decision && got.decision.permissionDecision, 'deny')
  } finally {
    cleanup(dir)
  }
})

test('a clean worktree grants nothing', async () => {
  // Nothing to commit means no precondition, so there is no permit to go stale
  // and cover a commit made later for some other reason.
  const { dir, wt } = scaffold()
  try {
    git(wt, 'checkout', '-q', '--', 'app.js')
    await pressLiveOn(dir)
    const gate = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(gate.permit, undefined, 'absent stays absent')

    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nLATER\n')
    const got = runHook({ cwd: wt })
    assert.strictEqual(got.decision && got.decision.permissionDecision, 'deny')
  } finally {
    cleanup(dir)
  }
})

test('the permit covers this spec\'s worktree and nowhere else', async () => {
  // The `--for-command` check already wants a positive signal that the commit is
  // running inside the spec's own tree; a permit must not widen that to the
  // primary checkout, where another session's work lives.
  const { dir } = scaffold()
  try {
    await pressLiveOn(dir)
    const got = runHook({ cwd: dir })
    assert.strictEqual(got.decision, null, 'allowed as a cannot-tell, exactly as before')

    const gate = JSON.parse(
      await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']),
    )
    assert.ok(gate.permit, 'and unspent — a commit elsewhere is not this permit\'s commit')
  } finally {
    cleanup(dir)
  }
})

test('a live-on on an unarmed gate records nothing', async () => {
  // Nothing refuses, so there is nothing to permit past — and a permit written
  // onto a clear gate would be waiting for the next phase to arm.
  const { dir } = scaffold()
  try {
    await pressLiveOn(dir, { arm: false })
    const read = readGate(outPath(dir), 'feat-alpha')
    assert.ok(!read.gate.permit, 'no obligation, no permit')
  } finally {
    cleanup(dir)
  }
})

test('arming the next phase drops a permit the last one left', async () => {
  // Each phase that ends is its own obligation, so a permit never outlives the
  // arming it was granted under.
  const { dir } = scaffold()
  try {
    await pressLiveOn(dir)
    await runQuiet(['spec-env', 'review', 'arm', 'feat-alpha', '--dir', dir, '--phase', '3'])
    const read = readGate(outPath(dir), 'feat-alpha')
    assert.ok(!read.gate.permit, 'a new obligation starts with no way past it')
  } finally {
    cleanup(dir)
  }
})
