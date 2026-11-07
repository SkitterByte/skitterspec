'use strict'

// Assignment under `sync.fieldOwnership.assignee: "pull"`: the issue is the
// record, so `assign` writes GitHub directly and the spec file is never touched.
// `--if-unassigned` claims an issue only on a positive "nobody holds it".

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repo({ assignee = 'pull', stamp = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-assign-pull-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ github: { owner: 'SkitterByte', repo: 'demo', project: 7 }, sync: { fieldOwnership: { assignee } } }),
  )
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), `---\ngithub_identifier: "#101"\n${stamp}---\n\n# Demo\n\n## Problem\n\nBody.\n`)
  fs.writeFileSync(path.join(spec, '01-a.md'), '# Phase 1 — A ⬜\n\n**Goal:** a.\n')
  return dir
}
const overview = (dir) => fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')

class Sink {
  constructor() {
    this.text = ''
  }
  write(s) {
    this.text += s
  }
}
async function run(args, dir, io = {}) {
  const out = new Sink()
  const env = { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) }
  const code = await specSync(args, { cwd: dir, out, err: new Sink(), env, ...io })
  return { code, out: out.text }
}

// Records every write; `holder` is who GitHub says has the issue now.
function fakeAdapter({ holder = null, read = 'ok' } = {}) {
  const writes = []
  return {
    writes,
    async checkAssignable() {
      return true
    },
    async readIssue() {
      if (read === 'throw') throw new Error('offline')
      return { identifier: '#101', state: { name: 'In Progress' }, assignee: holder, open: true }
    },
    async updateIssue(ref, updates) {
      writes.push({ ref, updates })
      return {}
    },
  }
}

test('pull: --to writes the issue and stamps nothing', async () => {
  const dir = repo()
  const before = overview(dir)
  const adapter = fakeAdapter()
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--name', 'Skitter Byte'], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(adapter.writes, [{ ref: '#101', updates: { assigneeId: 'skitterbyte' } }])
  assert.strictEqual(overview(dir), before, 'the spec file is not a copy of the tracker')
  assert.match(r.out, /#101 assigned to Skitter Byte \(skitterbyte\) on GitHub/)
  assert.doesNotMatch(r.out, /push it/)
})

test('pull: --release clears it on the issue', async () => {
  const dir = repo()
  const adapter = fakeAdapter({ holder: { id: 'skitterbyte', name: 'Skitter Byte' } })
  const r = await run(['assign', 'feat-demo', '--release'], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(adapter.writes, [{ ref: '#101', updates: { assigneeId: null } }])
})

test('stays silent: --if-unassigned leaves an issue someone holds alone', async () => {
  const dir = repo()
  const adapter = fakeAdapter({ holder: { id: 'teammate', name: 'Team Mate' } })
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--if-unassigned'], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(adapter.writes, [])
  assert.match(r.out, /already assigned to Team Mate — left alone/)
})

test('--if-unassigned claims an issue nobody holds', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--if-unassigned'], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(adapter.writes, [{ ref: '#101', updates: { assigneeId: 'skitterbyte' } }])
})

test('stays silent: --if-unassigned that cannot read the issue assigns nobody', async () => {
  const dir = repo()
  const adapter = fakeAdapter({ read: 'throw' })
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--if-unassigned'], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(adapter.writes, [])
  assert.match(r.out, /could not read #101 \(offline\) — assigned nobody/)
})

test('pull with no token writes nothing anywhere, and says where to do it', async () => {
  const dir = repo()
  const before = overview(dir)
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(overview(dir), before)
  assert.match(r.out, /GitHub owns the assignee here.*nothing was written/)
})

test('pull --json reports the write', async () => {
  const dir = repo()
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--json'], dir, { adapter: fakeAdapter() })
  const body = JSON.parse(r.out)
  assert.strictEqual(body.owner, 'tracker')
  assert.strictEqual(body.written, true)
  assert.strictEqual(body.id, 'skitterbyte')
})

test('push: --if-unassigned leaves a spec that already records someone alone', async () => {
  const dir = repo({ assignee: 'push', stamp: 'github_assignee_id: "teammate"\ngithub_assignee_name: "Team Mate"\n' })
  const before = overview(dir)
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--if-unassigned'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.strictEqual(overview(dir), before)
  assert.match(r.out, /already assigned to Team Mate — left alone/)
})

test('push: --if-unassigned on an unstamped spec stamps as before', async () => {
  const dir = repo({ assignee: 'push' })
  const r = await run(['assign', 'feat-demo', '--to', 'skitterbyte', '--if-unassigned'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(overview(dir), /github_assignee_id: "?skitterbyte"?/)
})

test('--release with --if-unassigned is refused, nothing changed', async () => {
  const dir = repo()
  const adapter = fakeAdapter()
  const r = await run(['assign', 'feat-demo', '--release', '--if-unassigned'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.deepStrictEqual(adapter.writes, [])
})
