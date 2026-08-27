'use strict'

/**
 * `spec-sync stamp` — writing returned ids back into a spec.
 *
 * This replaces prose in `/spec-push` that told the agent to hand-edit
 * frontmatter across N files. The failure it exists to prevent is specific: a
 * mistyped `linear_issue_id` makes the next push see an UNLINKED phase and mint
 * a duplicate issue for it. So the contract is all-or-nothing — validate every
 * ref and id first, and on any problem write nothing at all. A half-stamped spec
 * is worse than an unstamped one, because it looks linked while pointing at the
 * wrong object.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function fixtureRepo({ config = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stamp-'))
  if (config) {
    const cfg = path.join(dir, CONFIG_FILE)
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')
  }
  const folder = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, '00-overview.md'), '# X\n', 'utf-8')
  fs.writeFileSync(path.join(folder, '01-a.md'), '# Phase 1 — A ⬜\n\n**Goal:** a.\n', 'utf-8')
  fs.writeFileSync(path.join(folder, '02-b.md'), '# Phase 2 — B ⬜\n\n**Goal:** b.\n', 'utf-8')
  return { dir, folder }
}

function run(argv, cwd) {
  const out = []
  return specSync(argv, { cwd, out: { write: (s) => out.push(s), isTTY: true } }).then((code) => ({
    code,
    out: out.join(''),
  }))
}

const read = (folder, file) => fs.readFileSync(path.join(folder, file), 'utf-8')

// A snapshot of every file, to assert a refused command changed nothing at all.
const snapshotFiles = (folder) =>
  fs.readdirSync(folder).sort().map((f) => [f, read(folder, f)])

test('stamps the overview identifier/url and each phase id', async () => {
  const { dir, folder } = fixtureRepo()
  const r = await run(
    ['stamp', 'feat-x', '--issue', 'SKI-1', '--url', 'https://linear.app/t/issue/SKI-1',
      '--sub', '01-a=SKI-2', '--sub', '02-b=SKI-3'],
    dir,
  )
  assert.strictEqual(r.code, 0, r.out)
  assert.match(read(folder, '00-overview.md'), /linear_identifier: "SKI-1"/)
  assert.match(read(folder, '00-overview.md'), /linear_url: "https:\/\/linear\.app\/t\/issue\/SKI-1"/)
  assert.match(read(folder, '01-a.md'), /linear_issue_id: "SKI-2"/)
  assert.match(read(folder, '02-b.md'), /linear_issue_id: "SKI-3"/)
  assert.match(r.out, /record/, 'points at the next step')
})

test('a --sub ref with no phase file writes nothing and exits non-zero', async () => {
  const { dir, folder } = fixtureRepo()
  const before = snapshotFiles(folder)
  const r = await run(['stamp', 'feat-x', '--issue', 'SKI-1', '--sub', '09-nope=SKI-2'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /09-nope/)
  assert.deepStrictEqual(snapshotFiles(folder), before, 'the valid --issue was NOT applied either')
})

test('a malformed id writes nothing and exits non-zero', async () => {
  const { dir, folder } = fixtureRepo()
  const before = snapshotFiles(folder)
  const r = await run(['stamp', 'feat-x', '--sub', '01-a=oops'], dir)
  assert.strictEqual(r.code, 1)
  assert.deepStrictEqual(snapshotFiles(folder), before)
})

test('every problem is reported at once, not one per run', async () => {
  // Fixing typos one round-trip at a time is the hand-editing this replaces.
  const { dir } = fixtureRepo()
  const r = await run(
    ['stamp', 'feat-x', '--issue', 'nope', '--sub', '09-gone=SKI-2', '--sub', '01-a=bad'],
    dir,
  )
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--issue nope/)
  assert.match(r.out, /09-gone/)
  assert.match(r.out, /01-a=bad/)
})

test('a --sub without = is rejected as a shape error', async () => {
  const { dir } = fixtureRepo()
  const r = await run(['stamp', 'feat-x', '--sub', '01-a'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /<ref>=<id>/, 'shows the expected shape')
})

test('a ref given with its .md extension resolves', async () => {
  const { dir, folder } = fixtureRepo()
  const r = await run(['stamp', 'feat-x', '--sub', '01-a.md=SKI-2'], dir)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(read(folder, '01-a.md'), /linear_issue_id: "SKI-2"/)
})

test('re-stamping an existing id overwrites it and says so', async () => {
  const { dir, folder } = fixtureRepo()
  await run(['stamp', 'feat-x', '--sub', '01-a=SKI-2'], dir)
  const r = await run(['stamp', 'feat-x', '--sub', '01-a=SKI-99'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(read(folder, '01-a.md'), /linear_issue_id: "SKI-99"/)
  assert.doesNotMatch(read(folder, '01-a.md'), /SKI-2"/)
  assert.match(r.out, /SKI-99/, 'reports what it wrote')
})

test('stamping nothing is an error, not a silent no-op', async () => {
  const { dir } = fixtureRepo()
  const r = await run(['stamp', 'feat-x'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /nothing to stamp/)
})

test('an unknown spec exits non-zero', async () => {
  const { dir } = fixtureRepo()
  const r = await run(['stamp', 'feat-missing', '--issue', 'SKI-1'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not found/)
})

test('without linear.config.json it takes the opt-in path, exit 0', async () => {
  const { dir } = fixtureRepo({ config: false })
  const r = await run(['stamp', 'feat-x', '--issue', 'SKI-1'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /not enabled/)
})

test('stamp appears in the usage line', async () => {
  const { dir } = fixtureRepo()
  const r = await run(['bogus'], dir)
  assert.match(r.out, /spec-sync stamp <spec>/)
})
