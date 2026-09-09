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

function fixtureRepo({ linked = true, assignee = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-assign-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

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
