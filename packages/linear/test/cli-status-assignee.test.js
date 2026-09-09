'use strict'

/**
 * `spec-sync status --remote` reporting the assignee.
 *
 * The line has to say what will ACTUALLY happen, which is not the same as
 * whether the two sides differ. A spec with no recorded assignee never
 * overwrites Linear's, so printing "repo wins on next push" against a PM's
 * assignment would be both an accusation and a lie — the same trap the
 * deployment-stage line was written to avoid. The plan is the only honest
 * witness, so it is what the report asks.
 *
 * And a repo that never opted the field in must see no trace of any of it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const OWNERSHIP = { description: 'push', subIssues: 'push', workflowState: 'push' }

function fixtureRepo({ optIn = true, assignee = null, bucket = 'in-progress' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-assigneestatus-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  const fieldOwnership = optIn ? { ...OWNERSHIP, assignee: 'push' } : { ...OWNERSHIP }
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, sync: { fieldOwnership } }), 'utf-8')

  const folder = path.join(dir, 'specs', bucket, 'feat-owned')
  fs.mkdirSync(folder, { recursive: true })
  const fm = ['---', 'linear_identifier: "SKI-7"']
  if (assignee) fm.push(`linear_assignee_id: "${assignee}"`)
  fm.push('---')
  fs.writeFileSync(path.join(folder, '00-overview.md'), `${fm.join('\n')}\n\n# Owned\n\n## Problem\n\nProse.\n`, 'utf-8')
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine 🔄\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

function remoteFile(dir, { state = 'In Progress', assignee = null } = {}) {
  const file = path.join(dir, 'remote.json')
  const payload = { state: { name: state, type: 'started' } }
  if (assignee) payload.assignee = assignee
  fs.writeFileSync(file, JSON.stringify(payload), 'utf-8')
  return file
}

function run(argv, cwd) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: {},
  }).then((code) => ({ code, out: out.join('') }))
}

test('a matching assignee is reported as matching', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const remote = remoteFile(dir, { assignee: { id: 'user-1', name: 'Jane Dev' } })
  const r = await run(['status', 'feat-owned', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /assignee: Jane Dev — matches the spec/)
})

test('nobody on either side is reported as nobody', async () => {
  const dir = fixtureRepo()
  const r = await run(['status', 'feat-owned', '--remote', remoteFile(dir)], dir)
  assert.match(r.out, /assignee: none — the spec records nobody, and neither does Linear/)
})

test('a never-pushed spec with an assignee reports drift, because it will push', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const r = await run(['status', 'feat-owned', '--remote', remoteFile(dir)], dir)
  assert.match(r.out, /drift: Linear assignee is nobody but the spec records user-1 \(repo wins on next push\)/)
})

test('someone unassigning in Linear AFTER a push is not promised a correction', async () => {
  // The snapshot says this assignee is already pushed, so nothing re-asserts it.
  // "repo wins on next push" would be a promise the engine will not keep.
  const dir = fixtureRepo({ assignee: 'user-1' })
  await run(['record', 'feat-owned'], dir)
  const r = await run(['status', 'feat-owned', '--remote', remoteFile(dir)], dir)
  assert.match(r.out, /assignee: Linear shows nobody but the spec records user-1 — already pushed, so it will not be re-sent/)
  assert.ok(!/repo wins/.test(r.out), 'no correction is promised that will not come')
})

// --- the honest line ---------------------------------------------------------

test("a PM's assignment on an unassigned spec is NOT reported as drift", async () => {
  // The spec records nobody, so the next push sends no assignee — saying "repo
  // wins" here would promise an overwrite that will never happen.
  const dir = fixtureRepo({ assignee: null })
  const remote = remoteFile(dir, { assignee: { id: 'user-9', name: 'Priya PM' } })
  const r = await run(['status', 'feat-owned', '--remote', remote], dir)
  assert.match(r.out, /assignee: Linear has Priya PM; the spec records nobody and will not overwrite it/)
  assert.ok(!/drift: Linear assignee/.test(r.out), 'informational, not an accusation')
})

test('a genuine disagreement the repo WILL overwrite is reported as drift', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const remote = remoteFile(dir, { assignee: { id: 'user-9', name: 'Priya PM' } })
  const r = await run(['status', 'feat-owned', '--remote', remote], dir)
  assert.match(r.out, /drift: Linear assignee is Priya PM but the spec records user-1 \(repo wins on next push\)/)
})

// --- stays silent ------------------------------------------------------------

test('a repo that never opted in gets no assignee line at all', async () => {
  const dir = fixtureRepo({ optIn: false, assignee: 'user-1' })
  const remote = remoteFile(dir, { assignee: { id: 'user-9', name: 'Priya PM' } })
  const r = await run(['status', 'feat-owned', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.ok(!/assignee/i.test(r.out), 'inert means invisible, not merely inactive')
})

test('the workflow-state drift line is untouched by any of this', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const remote = remoteFile(dir, { state: 'Backlog', assignee: { id: 'user-1', name: 'Jane Dev' } })
  const r = await run(['status', 'feat-owned', '--remote', remote], dir)
  assert.match(r.out, /drift: Linear workflow-state is "backlog" but the spec is "in-progress"/)
})
