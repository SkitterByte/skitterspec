'use strict'

/**
 * `spec-sync assign` — recording and releasing ownership in the repo.
 *
 * It is the counterpart to `spec-sync stamp`, and it writes the REPO ONLY. That
 * split is deliberate: the repo is the source of truth, so an ownership change
 * is an ordinary edit that the next push mirrors — and a push that fails leaves
 * the claim recorded rather than lost.
 *
 * The release path is the interesting one. `writeFrontmatter` skips nullish
 * values by design (that is what lets callers send sparse patches), so "remove
 * this key" is inexpressible there and a release needs `deleteFrontmatter`.
 * Setting the field empty instead would leave a spec claiming to be assigned to
 * nobody in particular, and the projection reads presence, not emptiness.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

// `owns` is the repo's `sync.fieldOwnership.assignee`. It defaults to owning the
// field because that is the only state in which this verb does anything — and
// the fixture SAYING SO is the point: it was previously silent, which meant
// every test below ran against a repo whose push would have dropped the stamp,
// and asserted the success line promising otherwise.
function fixtureRepo({ linked = true, assignee = null, owns = 'push' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-assign-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  const tracker = { linear: { teamId: 'T1' } }
  if (owns) tracker.sync = { fieldOwnership: { assignee: owns } }
  fs.writeFileSync(cfg, JSON.stringify(tracker), 'utf-8')

  const folder = path.join(dir, 'specs', 'in-progress', 'feat-owned')
  fs.mkdirSync(folder, { recursive: true })
  const fm = []
  if (linked) fm.push('linear_identifier: "SKI-7"')
  if (assignee) {
    fm.push(`linear_assignee_id: "${assignee}"`, 'linear_assignee_name: "Jane Dev"')
  }
  const head = fm.length ? `---\n${fm.join('\n')}\n---\n\n` : ''
  fs.writeFileSync(path.join(folder, '00-overview.md'), `${head}# Owned\n\n## Problem\n\nProse.\n`, 'utf-8')
  fs.writeFileSync(path.join(folder, '01-engine.md'), '# Phase 1 — Engine ⬜\n\n**Goal:** go.\n', 'utf-8')
  return dir
}

const overview = (dir) => fs.readFileSync(path.join(dir, 'specs/in-progress/feat-owned/00-overview.md'), 'utf-8')

function run(argv, cwd) {
  const out = []
  return specSync([...argv, '--dir', cwd], {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: {},
  }).then((code) => ({ code, out: out.join('') }))
}

// --- taking ------------------------------------------------------------------

test('--to stamps the id and the display name', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-owned', '--to', 'user-1', '--name', 'Jane Dev'], dir)
  assert.equal(r.code, 0)
  assert.match(overview(dir), /linear_assignee_id: "user-1"/)
  assert.match(overview(dir), /linear_assignee_name: "Jane Dev"/)
  assert.match(r.out, /assigned to Jane Dev \(user-1\)/)
})

test('--to without a name records the id alone', async () => {
  const dir = fixtureRepo()
  await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.match(overview(dir), /linear_assignee_id: "user-1"/)
  assert.doesNotMatch(overview(dir), /linear_assignee_name/)
})

test('a handover overwrites the previous owner', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  await run(['assign', 'feat-owned', '--to', 'user-2', '--name', 'Sam Ops'], dir)
  const text = overview(dir)
  assert.match(text, /linear_assignee_id: "user-2"/)
  assert.doesNotMatch(text, /user-1/, 'no stale id left behind')
})

test('the linear_identifier is left untouched', async () => {
  const dir = fixtureRepo()
  await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.match(overview(dir), /linear_identifier: "SKI-7"/)
})

test('--json reports the write for a skill to relay', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-owned', '--to', 'user-1', '--name', 'Jane Dev', '--json'], dir)
  const payload = JSON.parse(r.out)
  assert.equal(payload.id, 'user-1')
  assert.equal(payload.name, 'Jane Dev')
  assert.equal(payload.issue, 'SKI-7')
})

// --- releasing ---------------------------------------------------------------

test('--release removes both keys, not merely blanks them', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const r = await run(['assign', 'feat-owned', '--release'], dir)
  assert.equal(r.code, 0)
  const text = overview(dir)
  assert.doesNotMatch(text, /linear_assignee_id/, 'the key is gone, not emptied')
  assert.doesNotMatch(text, /linear_assignee_name/)
  assert.match(text, /linear_identifier: "SKI-7"/, 'and the link survives')
})

test('--release on a spec nobody owns is a clean no-op', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-owned', '--release'], dir)
  assert.equal(r.code, 0, 'nothing to release is not a failure')
  assert.match(r.out, /nothing to release/)
})

test('a release says the push is what tells the tracker', async () => {
  const dir = fixtureRepo({ assignee: 'user-1' })
  const r = await run(['assign', 'feat-owned', '--release'], dir)
  assert.match(r.out, /next: push it/, 'this verb writes the repo only')
})

// --- refusing ----------------------------------------------------------------

test('an unlinked spec is refused rather than stamped into the void', async () => {
  const dir = fixtureRepo({ linked: false })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /not linked to Linear/)
  assert.doesNotMatch(overview(dir), /linear_assignee_id/, 'nothing was written')
})

test('--to and --release together are refused as opposites', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-owned', '--to', 'user-1', '--release'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /opposites/)
  assert.doesNotMatch(overview(dir), /linear_assignee_id/)
})

test('neither flag is refused rather than guessed at', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-owned'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /nothing to do/)
})

test('an unknown spec name is refused', async () => {
  const dir = fixtureRepo()
  const r = await run(['assign', 'feat-nope', '--to', 'user-1'], dir)
  assert.equal(r.code, 1)
})

test('every refusal says nothing was changed', async () => {
  const dir = fixtureRepo({ linked: false })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.match(r.out, /nothing was changed/, 'the operator should not have to check')
})

// --- the field this verb writes has to be one the repo owns -------------------
//
// `toFieldSet` drops a field the repo does not own, so a stamp written into a
// repo that declined `assignee` never reaches the tracker. What made that worth
// a guard is not the drop — it is that this command then printed
// `next: push it, so Linear agrees`, which is a true-sounding sentence with
// nothing downstream to contradict it. `/spec-claim` refused on this already;
// the engine beneath it did not, and the engine is what a script calls.

test('--to refuses when the repo does not own the assignee field', async () => {
  const dir = fixtureRepo({ owns: 'none' })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1', '--name', 'Jane Dev'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /refusing to write — nothing was changed/)
  assert.match(r.out, /sync\.fieldOwnership\.assignee/, 'the exit is one config line')
  assert.ok(!/linear_assignee_id/.test(overview(dir)), 'and nothing was written')
})

test('a repo that never listed the field refuses the same way', async () => {
  // Declining and never listing are one state to every other reader, so they
  // must be one state here too.
  const dir = fixtureRepo({ owns: null })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /sync\.fieldOwnership\.assignee/)
})

test('--release refuses too, rather than clearing a stamp nothing pushed', async () => {
  const dir = fixtureRepo({ owns: 'none', assignee: 'user-1' })
  const r = await run(['assign', 'feat-owned', '--release'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /sync\.fieldOwnership\.assignee/)
  assert.match(overview(dir), /linear_assignee_id: "user-1"/, 'the stamp is left where it is')
})

test('the refusal reads like the others in this verb', async () => {
  // It joins the existing `problems` list, so an unlinked spec that ALSO does
  // not own the field reports both reasons at once rather than the first only.
  const dir = fixtureRepo({ linked: false, owns: 'none' })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /not linked to Linear/)
  assert.match(r.out, /sync\.fieldOwnership\.assignee/)
})

// --- stays silent ------------------------------------------------------------

test('a repo that owns the field assigns and releases exactly as before', async () => {
  // The healthy input. This guard must fire at nobody who is using the feature
  // — and it is the test that fails if the check is written as
  // `'assignee' in fieldOwnership`, which reads correct and becomes always-true
  // the moment the field is owned by default.
  const dir = fixtureRepo()
  const took = await run(['assign', 'feat-owned', '--to', 'user-1', '--name', 'Jane Dev'], dir)
  assert.equal(took.code, 0)
  assert.match(overview(dir), /linear_assignee_id: "user-1"/)
  assert.match(took.out, /next: push it/)

  const released = await run(['assign', 'feat-owned', '--release'], dir)
  assert.equal(released.code, 0)
  assert.ok(!/linear_assignee_id/.test(overview(dir)))
})

test('"both" owns the field as surely as "push" does', async () => {
  // The guard asks whether the field is owned, not whether it is owned in one
  // particular direction. Narrowing it to `=== 'push'` would refuse a config
  // that is perfectly entitled to write.
  const dir = fixtureRepo({ owns: 'both' })
  const r = await run(['assign', 'feat-owned', '--to', 'user-1'], dir)
  assert.equal(r.code, 0)
  assert.match(overview(dir), /linear_assignee_id: "user-1"/)
})
