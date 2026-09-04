'use strict'

/**
 * `push` refuses unless the configured issue states have been validated.
 *
 * A state name that isn't in the workspace is the quietest failure in the whole
 * sync: Linear accepts the push, applies the description, and **silently ignores
 * the unknown state**. Nothing errors, so the mirror looks pushed and the issue
 * never moves. The 8→9 remap makes it easy to hit, because the correct value
 * inverts — project status `Completed` became issue state `Done`.
 *
 * The check already existed on `status`, but `/spec-push` only *asked* the agent
 * to run it. This makes it a precondition of `push` itself. The engine is
 * offline, so the workspace's names arrive in a file the skill fetches over MCP.
 *
 * This is a BREAKING change to the CLI: a `push` that worked before now needs
 * `--workspace-states` or an explicit `--skip-state-check`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// A minimal linked-config repo with one pushable spec. No `states` block, so the
// defaults apply: Backlog / In Progress / Done / Canceled.
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-gate-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-gated')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    path.join(folder, '00-overview.md'),
    '# Gated\n\n## Phases\n\n| # | Phase | Status | File |\n|---|-------|--------|------|\n| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n\n- [ ] Do it\n', 'utf-8')
  return dir
}

function statesFile(dir, names) {
  const file = path.join(dir, 'states.json')
  fs.writeFileSync(file, JSON.stringify(names), 'utf-8')
  return file
}

function run(argv, cwd) {
  const out = []
  const err = []
  const io = { cwd, out: { write: (s) => out.push(s), isTTY: true }, err: { write: (s) => err.push(s) } }
  return specSync(argv, io).then((code) => ({ code, out: out.join(''), err: err.join('') }))
}

const GOOD = ['Backlog', 'In Progress', 'Done', 'Canceled', 'Triage']

test('push refuses when the states were never validated', async () => {
  const dir = fixtureRepo()
  const r = await run(['push', 'feat-gated'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /refusing/)
  assert.match(r.out, /--workspace-states/, 'says how to satisfy it')
  assert.match(r.out, /silently ignores/, 'says why it matters')
  assert.ok(!/sub-issues create/.test(r.out), 'no plan is printed')
})

test('push refuses on a state name the workspace does not have', async () => {
  const dir = fixtureRepo()
  // The 8.x value: project status "Completed", which is not an ISSUE state.
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Completed', 'Canceled'])
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /states\.complete: "Done" is not an issue state/, 'names the offender and its key')
})

// An error that only says what is wrong makes you go and look up what is right.
test('the refusal says what IS available, and what to use instead', async () => {
  const dir = fixtureRepo()
  // The exact 8→9 trap: the workspace calls it "Completed", the v9 default is
  // "Done". No string-distance measure gets you from one to the other.
  const file = statesFile(dir, ['Backlog', 'In Progress', 'Completed', 'Canceled'])
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)

  assert.match(r.out, /use "Completed" instead/, 'suggests the replacement by bucket')
  assert.match(r.out, /available: Backlog, In Progress, Completed, Canceled/, 'lists the real states')
  assert.match(r.out, /linear\.config\.json/, 'says where to fix it')
})

test('with no sensible match it still lists what exists', async () => {
  const dir = fixtureRepo()
  const file = statesFile(dir, ['Icebox', 'Cooking', 'Shipped it', 'Nope'])
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)

  assert.strictEqual(r.code, 1)
  assert.ok(!/use "/.test(r.out), 'no invented suggestion')
  assert.match(r.out, /available: Icebox, Cooking, Shipped it, Nope/)
})

test('push proceeds once the states check passes', async () => {
  const dir = fixtureRepo()
  const r = await run(['push', 'feat-gated', '--workspace-states', statesFile(dir, GOOD)], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /sub-issues create: Engine/)
})

test('--skip-state-check is the deliberate way past it', async () => {
  const dir = fixtureRepo()
  const r = await run(['push', 'feat-gated', '--skip-state-check'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /sub-issues create: Engine/)
})

test('a missing or malformed states file refuses rather than passing', async () => {
  const dir = fixtureRepo()
  const absent = await run(['push', 'feat-gated', '--workspace-states', path.join(dir, 'nope.json')], dir)
  assert.strictEqual(absent.code, 1)
  assert.match(absent.out, /no such --workspace-states file/)

  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, '{ not json', 'utf-8')
  const malformed = await run(['push', 'feat-gated', '--workspace-states', bad], dir)
  assert.strictEqual(malformed.code, 1)
  assert.match(malformed.out, /not valid JSON/)
})

// The refusal is worthless if the exit code is swallowed on the way out — it was
// once, and only a spawn catches it.
test('the refusal reaches the shell as a non-zero exit', () => {
  const dir = fixtureRepo()
  const bin = path.join(__dirname, '..', 'bin', 'skitterspec-linear.js')
  const r = spawnSync(process.execPath, [bin, 'spec-sync', 'push', 'feat-gated'], { cwd: dir, encoding: 'utf-8' })
  assert.strictEqual(r.status, 1, `exited ${r.status}:\n${r.stdout}${r.stderr}`)
  assert.match(r.stdout, /refusing/)
})

// --- the ladder is gated by the same check ----------------------------------
//
// A `release.stages` rung reaches Linear exactly the way a bucket state does,
// and fails exactly the way one does — silently. So it goes through the same
// gate rather than a parallel one.

function withStages(dir, stages) {
  const cfg = path.join(dir, CONFIG_FILE)
  const parsed = JSON.parse(fs.readFileSync(cfg, 'utf-8'))
  parsed.release = { stages }
  fs.writeFileSync(cfg, JSON.stringify(parsed), 'utf-8')
  return dir
}

test('push refuses on a deployment-stage name the workspace does not have', async () => {
  const dir = withStages(fixtureRepo(), [
    { key: 'test', state: 'On Test' },
    { key: 'prod', state: 'Done' },
  ])
  const file = statesFile(dir, GOOD)
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /release\.stages\[test\]: "On Test" is not an issue state/, 'names the rung by key')
  assert.ok(!/states\.complete/.test(r.out), 'the bucket map is fine and is not accused')
})

// The STAYS-SILENT case: a healthy ladder must not make a push that worked
// before start refusing.
test('push proceeds when every rung is a real workspace state', async () => {
  const dir = withStages(fixtureRepo(), [
    { key: 'test', state: 'Triage' },
    { key: 'prod', state: 'Done' },
  ])
  const file = statesFile(dir, GOOD)
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)
  assert.strictEqual(r.code, 0)
  assert.ok(!/refusing/.test(r.out), 'no refusal')
})

test('push with no ladder declared is unaffected by the check', async () => {
  const dir = fixtureRepo()
  const file = statesFile(dir, GOOD)
  const r = await run(['push', 'feat-gated', '--workspace-states', file], dir)
  assert.strictEqual(r.code, 0)
  assert.ok(!/release\.stages/.test(r.out), 'says nothing about a ladder that does not exist')
})
