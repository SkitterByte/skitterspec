'use strict'

/**
 * The gate — the one thing in this engine that refuses.
 *
 * Two halves. The pure functions carry the transitions: armed by a phase
 * ending, cleared by a committing verdict or a recorded skip, and by nothing
 * else. The CLI cases carry the part that only exists end to end — the exit
 * status a commit hook reads.
 *
 * MOST OF THIS SUITE IS THE STAYS-SILENT HALF, deliberately. A check that
 * blocks a commit is an accusation (`.claude/rules/negative-checks.md` rule 3),
 * so every way it could be wrong about a healthy repo — an absent sidecar, an
 * unreadable one, a version it does not know, a project that opted out, a spec
 * it could not resolve — has a test asserting it says nothing and exits 0.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  GATE_VERSION,
  emptyGate,
  readGate,
  writeGate,
  armGate,
  disarmGate,
  gateState,
  reviewGatePath,
  readPending,
  writePending,
  addPending,
} = require('../src/env/review.js')

const judge = (over = {}) =>
  gateState({ gate: emptyGate('feat-alpha'), corrupt: false, present: false, required: true, ...over })

// --- arming: idempotent within a phase, renewed across one ------------------

test('arming twice for the same phase does not move the clock', () => {
  // A re-render is not a new obligation. `armedAt` answers "how long has this
  // been waiting", and re-rendering the page must not reset that answer.
  const first = armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' })
  const again = armGate(first, { at: 'T2', phase: '2' })
  assert.strictEqual(again.armedAt, 'T1')
  assert.strictEqual(again, first, 'unchanged, so nothing downstream sees a write')
})

test('arming for a different phase is a new obligation', () => {
  const first = armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' })
  const next = armGate(first, { at: 'T2', phase: '3' })
  assert.strictEqual(next.armedAt, 'T2')
  assert.strictEqual(next.phase, '3')
})

// --- disarming: only by something someone did -------------------------------

test('a disarm records who cleared it and why', () => {
  const armed = armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' })
  const { gate, logged } = disarmGate(armed, { at: 'T2', by: 'skip', reason: 'docs only' })
  assert.strictEqual(logged, true)
  assert.strictEqual(gate.armed, false)
  assert.deepStrictEqual(gate.log, [{ by: 'skip', at: 'T2', phase: '2', reason: 'docs only' }])
})

test('disarming a gate that owes nothing records nothing', () => {
  // There was no obligation, so there is no outcome. A log entry here would be
  // a record of a decision nobody had to take.
  const { gate, logged } = disarmGate(emptyGate('feat-alpha'), { at: 'T2', by: 'skip', reason: 'x' })
  assert.strictEqual(logged, false)
  assert.deepStrictEqual(gate.log, [])
})

test('the log is append-only across several cycles', () => {
  let gate = emptyGate('feat-alpha')
  gate = armGate(gate, { at: 'T1', phase: '1' })
  gate = disarmGate(gate, { at: 'T2', by: 'verdict', reason: 'commit' }).gate
  gate = armGate(gate, { at: 'T3', phase: '2' })
  gate = disarmGate(gate, { at: 'T4', by: 'skip', reason: 'trivial' }).gate
  assert.deepStrictEqual(gate.log.map((e) => e.by), ['verdict', 'skip'])
})

// --- what the gate SAYS: one armed state, and several that claim nothing ----

test('armed is reached only by a present, parseable sidecar that says so', () => {
  const armed = armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' })
  assert.strictEqual(judge({ gate: armed, present: true }).state, 'armed')
})

test('an absent sidecar is clear, not armed', () => {
  assert.strictEqual(judge().state, 'clear')
})

test('an unreadable sidecar is cannot-tell, and refuses nothing', () => {
  const got = judge({ corrupt: true, present: true })
  assert.strictEqual(got.state, 'unknown')
  assert.match(got.reason, /not readable JSON/)
})

test('a gate written by a newer engine is cannot-tell, not armed', () => {
  // The unknown case routes to the harmless branch. A version this engine
  // cannot interpret must never be read as an obligation it can enforce.
  const future = { ...armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' }), version: GATE_VERSION + 1 }
  assert.strictEqual(judge({ gate: future, present: true }).state, 'unknown')
})

test('required:false answers cannot-tell even with the gate armed', () => {
  const armed = armGate(emptyGate('feat-alpha'), { at: 'T1', phase: '2' })
  const got = judge({ gate: armed, present: true, required: false })
  assert.strictEqual(got.state, 'unknown')
  assert.match(got.reason, /review\.required is false/)
})

// --- the sidecar on disk ----------------------------------------------------

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-gate-')))
}

test('the gate round-trips, and an absent one is ordinary', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    const before = readGate(out, 'feat-alpha')
    assert.strictEqual(before.present, false)
    assert.strictEqual(before.corrupt, false)

    writeGate(out, armGate(before.gate, { at: 'T1', phase: '2' }))
    const after = readGate(out, 'feat-alpha')
    assert.strictEqual(after.present, true)
    assert.strictEqual(after.gate.armed, true)
    assert.strictEqual(after.gate.phase, '2')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unreadable gate reads as corrupt rather than as empty', () => {
  const dir = tmp()
  try {
    const out = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(reviewGatePath(out), '{ not json')
    const got = readGate(out, 'feat-alpha')
    assert.strictEqual(got.corrupt, true)
    assert.strictEqual(got.gate.armed, false, 'and never as armed — that would refuse on an unreadable file')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- through the real CLI, where the exit status is the whole interface -----

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function scaffold({ config } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-gatecli-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  // `reader: local` so these tests never stand a real server up when the suite
  // runs from a bridged or ssh session.
  if (config !== null) {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({
        baseBranch: 'main',
        docker: { enabled: false },
        review: { reader: 'local', serve: 'never', ...(config || {}) },
      }),
    )
  }
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

// Runs the CLI and hands back BOTH halves — what it said, and the exit status a
// hook would read. `process.exitCode` is reset around each call so one refusal
// cannot leak into the next assertion, or out into the test runner's own exit.
async function runCli(argv) {
  const origWrite = process.stdout.write
  const origCode = process.exitCode
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  process.exitCode = 0
  let code
  try {
    await run(argv)
  } finally {
    code = process.exitCode
    process.stdout.write = origWrite
    process.exitCode = origCode
  }
  return { out, code }
}

const cli = (dir, ...args) => runCli(['spec-env', 'review', ...args, '--dir', dir])
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')

test('an armed gate is the one thing --check refuses on', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    const clean = await cli(dir, 'gate', 'feat-alpha', '--check')
    assert.strictEqual(clean.code, 0, 'nothing owed yet')

    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    const armed = await cli(dir, 'gate', 'feat-alpha', '--check')
    assert.strictEqual(armed.code, 1)
    assert.match(armed.out, /awaiting a verdict/)
    // It says how to get past it. A refusal with no exit is how a gate gets
    // switched off wholesale instead of answered.
    assert.match(armed.out, /review skip/)
  } finally {
    cleanup(dir)
  }
})

test('--check stays silent on an unreadable gate', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    fs.writeFileSync(reviewGatePath(outPath(dir)), '{ not json')
    const got = await cli(dir, 'gate', 'feat-alpha', '--check')
    assert.strictEqual(got.code, 0, 'an unreadable file is not evidence of an obligation')
    assert.match(got.out, /cannot tell/)
  } finally {
    cleanup(dir)
  }
})

test('--check stays silent when the project opted out', async () => {
  const { dir } = scaffold({ config: { required: false } })
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha')
    const got = await cli(dir, 'gate', 'feat-alpha', '--check')
    assert.strictEqual(got.code, 0)
    assert.match(got.out, /review\.required is false/)
  } finally {
    cleanup(dir)
  }
})

test('--check stays silent on a spec it cannot resolve', async () => {
  const { dir } = scaffold()
  try {
    const got = await cli(dir, 'gate', 'feat-nope', '--check')
    assert.strictEqual(got.code, 0, 'a repo it could not read is not a repo to block')
    assert.match(got.out, /cannot tell/)
  } finally {
    cleanup(dir)
  }
})

test('--check stays silent where isolation is not enabled at all', async () => {
  // The commonest healthy repo of the lot: no env.config.json, so no gate, no
  // review, nothing. A hook installed here must let every commit through.
  const { dir } = scaffold({ config: null })
  try {
    const got = await cli(dir, 'gate', '--check')
    assert.strictEqual(got.code, 0)
    assert.match(got.out, /isolation not enabled/)
  } finally {
    cleanup(dir)
  }
})

test('a skip needs a reason, and refusing one leaves the gate armed', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    const bare = await cli(dir, 'skip')
    assert.strictEqual(bare.code, 1)
    assert.match(bare.out, /needs a reason/)
    // THE REASON IS THE FEATURE. A skip that defaulted to silence is the drift
    // this gate exists to replace.
    assert.strictEqual((await cli(dir, 'gate', 'feat-alpha', '--check')).code, 1)
  } finally {
    cleanup(dir)
  }
})

test('a skip with a reason clears the gate and keeps the reason', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    const skipped = await cli(dir, 'skip', 'docs only, nothing to read')
    assert.strictEqual(skipped.code, 0)
    assert.strictEqual((await cli(dir, 'gate', 'feat-alpha', '--check')).code, 0)

    const json = JSON.parse((await cli(dir, 'gate', 'feat-alpha', '--json')).out)
    assert.strictEqual(json.state, 'clear')
    assert.deepStrictEqual(json.log.map((e) => [e.by, e.reason]), [['skip', 'docs only, nothing to read']])
  } finally {
    cleanup(dir)
  }
})

// --- the verdict half: only a COMMITTING one clears it ----------------------

const blobOf = (over = {}) => ({
  version: 1,
  spec: 'feat-alpha',
  accepted: [],
  unaccepted: [],
  comments: [],
  ...over,
})

// Put a pass in the holding area the way the served page does.
function hold(dir, blob, { render = 'R1', at = '2020-01-01T00:00:00.000Z' } = {}) {
  const out = outPath(dir)
  const { pending } = readPending(out, 'feat-alpha')
  const added = addPending(pending, { blob, at, render })
  writePending(out, added.pending)
  return added.code
}

test('a commit verdict clears the gate', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    const code = hold(dir, blobOf({ verdict: 'commit' }))
    await cli(dir, 'feat-alpha', '--claim', code)
    assert.strictEqual((await cli(dir, 'gate', 'feat-alpha', '--check')).code, 0)

    const json = JSON.parse((await cli(dir, 'gate', 'feat-alpha', '--json')).out)
    assert.deepStrictEqual(json.log.map((e) => e.by), ['verdict'])
  } finally {
    cleanup(dir)
  }
})

test('a changes verdict leaves it armed — the work is not the verdict', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    const code = hold(dir, blobOf({ verdict: 'changes' }))
    await cli(dir, 'feat-alpha', '--claim', code)
    // The changes get worked, the page re-renders, and the NEXT verdict is the
    // exit. Clearing here would let a phase through on a request for changes.
    assert.strictEqual((await cli(dir, 'gate', 'feat-alpha', '--check')).code, 1)
  } finally {
    cleanup(dir)
  }
})

test('a refused commit does not clear it', async () => {
  const { dir } = scaffold()
  try {
    await cli(dir, 'feat-alpha')
    await cli(dir, 'arm', 'feat-alpha', '--phase', '2')
    // A commit asked for with an open comment is refused and routed to
    // `discuss`. It did not happen, so it clears no obligation.
    const code = hold(
      dir,
      blobOf({
        verdict: 'commit',
        comments: [{ id: 'c1', file: 'app.js', note: 'why this?' }],
      }),
    )
    const said = await cli(dir, 'feat-alpha', '--claim', code, '--json')
    assert.strictEqual(JSON.parse(said.out).verdict.honoured, false)
    assert.strictEqual((await cli(dir, 'gate', 'feat-alpha', '--check')).code, 1)
  } finally {
    cleanup(dir)
  }
})
