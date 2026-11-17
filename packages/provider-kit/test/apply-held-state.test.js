'use strict'

// PR-mode completion in the `branch` lane (spec bug-pr-complete-snapshot-on-base).
// Run 1 commits the move to complete/ so it rides the PR, and the tracker's Done
// waits for the merge. Run 2 sends it from the base branch — where nothing is
// left to commit a snapshot to. So run 1 must record the snapshot run 2 would
// write, and run 2 must send the held state without changing that file.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { applySpecPlan } = require('../src/apply.js')
const { push, recordPush } = require('@skitterbyte/skitterspec-sync-core')
const { neutralConfig } = require('../../sync-core/test/_config.js')

const OVERVIEW = '---\nlinear_identifier: "SP-1"\n---\n\n# Feat X\n\n> **Type:** Feature\n\n## Summary\n\nDoes x.\n'

// A linked spec whose last push happened while it was in flight, then moved to
// complete/ the way §4 moves it.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-held-'))
  const config = neutralConfig()
  const flight = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(flight, { recursive: true })
  fs.writeFileSync(path.join(flight, '00-overview.md'), OVERVIEW)
  recordPush({ dir, snapshotDir: flight, identifier: 'SP-1', config, sent: { issue: true, subIssues: new Set() } })
  const done = path.join(dir, 'specs', 'complete', 'feat-x')
  fs.mkdirSync(path.dirname(done), { recursive: true })
  fs.renameSync(flight, done)
  return { dir, config, snapshotDir: done }
}

function harness() {
  const writes = []
  return {
    writes,
    adapter: { readIssue: async () => ({ id: 'id-1', identifier: 'SP-1', url: 'u', description: '' }) },
    ops: {
      prevalidateStates() {},
      missingIssueMessage: (id) => `no ${id}`,
      remoteEditedLine: (id) => `edited ${id}`,
      updateIssue: async (_existing, issue) => writes.push(issue),
    },
  }
}

const snapshotBytes = (r) => fs.readFileSync(path.join(r.dir, r.config.sync.baseDir, 'SP-1.base.json'), 'utf-8')
const planFor = (r) => push({ dir: r.dir, snapshotDir: r.snapshotDir, identifier: 'SP-1', config: r.config }).plan

test('run 1 holds the Done and records it; run 2 sends it and leaves the snapshot alone', async () => {
  const r = repo()

  const one = harness()
  await applySpecPlan({ dir: r.dir, config: r.config, snapshotDir: r.snapshotDir, plan: planFor(r), holdState: true, ...one })
  assert.ok(
    one.writes.every((w) => w.state == null),
    `run 1 sent a state before the merge: ${JSON.stringify(one.writes)}`,
  )
  const committed = snapshotBytes(r)
  assert.ok(push({ dir: r.dir, snapshotDir: r.snapshotDir, identifier: 'SP-1', config: r.config }).empty)

  const two = harness()
  await applySpecPlan({ dir: r.dir, config: r.config, snapshotDir: r.snapshotDir, plan: planFor(r), sendHeld: true, ...two })
  assert.deepStrictEqual(
    two.writes.map((w) => w.state),
    ['complete'],
    `run 2 did not send the held Done: ${JSON.stringify(two.writes)}`,
  )
  assert.strictEqual(snapshotBytes(r), committed, 'run 2 rewrote the committed snapshot on the base branch')
})

test('a plain apply is untouched: it sends the Done and says nothing about holding', async () => {
  const r = repo()
  const h = harness()
  const { lines } = await applySpecPlan({ dir: r.dir, config: r.config, snapshotDir: r.snapshotDir, plan: planFor(r), ...h })
  assert.deepStrictEqual(
    h.writes.map((w) => w.state),
    ['complete'],
  )
  assert.ok(!lines.some((l) => l.includes('held')), lines.join('\n'))
})

test('a run 1 from before the hold: --send-held sends the whole plan and names the file', async () => {
  const r = repo()
  const h = harness()
  const { lines } = await applySpecPlan({ dir: r.dir, config: r.config, snapshotDir: r.snapshotDir, plan: planFor(r), sendHeld: true, ...h })
  assert.deepStrictEqual(
    h.writes.map((w) => w.state),
    ['complete'],
  )
  assert.ok(
    lines.some((l) => l.startsWith('  !! nothing was held for SP-1') && l.includes('SP-1.base.json')),
    lines.join('\n'),
  )
})

test('holding and sending in one run is refused before anything is written', async () => {
  const r = repo()
  const h = harness()
  await assert.rejects(
    applySpecPlan({ dir: r.dir, config: r.config, snapshotDir: r.snapshotDir, plan: planFor(r), holdState: true, sendHeld: true, ...h }),
    /two runs, not one/,
  )
  assert.deepStrictEqual(h.writes, [])
})
