'use strict'

// Phase 3b: the task-line denormalizer writes pulled issue edits back into the
// checkbox lines, and push emits an issue create/update plan. Covers the pure
// line ops plus a pull and a push integration.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { pull } = require('../src/pull.js')
const { push } = require('../src/push.js')
const { normalizeLocal, normalizeRemote } = require('../src/normalize.js')
const { classify } = require('../src/compare.js')
const { writeBase, readBase } = require('../src/base.js')
const {
  updateTaskLine,
  addTaskLine,
  stampIssueId,
  applyTasksPull,
} = require('../src/write.js')
const { neutralConfig } = require('./_config.js')

const TS = '2026-01-02T03:04:05.000Z'
const ID = 'SPEC-1'
const PROJECT_ID = 'proj_1'

function config() {
  const c = neutralConfig()
  for (const k of ['milestones', 'phaseBodies', 'acceptanceCriteria', 'taskBreakdown']) {
    delete c.sync.fieldOwnership[k]
  }
  c.sync.fieldOwnership.tasks = 'both'
  c.sync.keyedFields = { tasks: 'id' }
  return c
}

const OVERVIEW = `---\nspec_status: "backlog"\npriority: 0\n---\n\n# Demo\n\n## Problem\n\nx\n`
const PHASE = `# Phase 1 — P ⬜\n\n**Goal:** g\n\n## Tasks\n\n- [ ] first (SKI-11)\n- [x] second (SKI-12)\n- [ ] idless\n`

function fixtureDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-tw-'))
  fs.writeFileSync(path.join(dir, '01-first.md'), PHASE, 'utf-8')
  return dir
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf-8')

// --- pure line ops ---------------------------------------------------------

test('updateTaskLine rewrites text + checkbox of the matching id, preserves others', () => {
  const dir = fixtureDir()
  assert.strictEqual(updateTaskLine(dir, 'SKI-11', { text: 'first edited', done: true }), true)
  const out = read(dir, '01-first.md')
  assert.match(out, /^- \[x\] first edited \(SKI-11\)$/m)
  assert.match(out, /^- \[x\] second \(SKI-12\)$/m) // untouched
})

test('addTaskLine appends a new task after the last task line', () => {
  const dir = fixtureDir()
  addTaskLine(dir, { id: 'SKI-13', text: 'new one', done: false })
  const lines = read(dir, '01-first.md').split('\n').filter((l) => l.startsWith('- ['))
  assert.strictEqual(lines[lines.length - 1], '- [ ] new one (SKI-13)')
})

test('stampIssueId appends an inline id to the matching idless line', () => {
  const dir = fixtureDir()
  assert.strictEqual(stampIssueId(dir, 'idless', 'SKI-99'), '01-first.md')
  assert.match(read(dir, '01-first.md'), /^- \[ \] idless \(SKI-99\)$/m)
})

test('applyTasksPull edits, adds, and reports removals', () => {
  const dir = fixtureDir()
  const res = applyTasksPull(dir, [
    { id: 'SKI-11', status: 'edited', pullable: true, report: false, remote: { id: 'SKI-11', text: 'e', done: true } },
    { id: 'SKI-20', status: 'added', pullable: true, report: false, remote: { id: 'SKI-20', text: 'added', done: false } },
    { id: 'SKI-12', status: 'removed', pullable: false, report: true, remote: null },
  ])
  assert.deepStrictEqual(res.applied, ['SKI-11'])
  assert.deepStrictEqual(res.reported, ['SKI-12'])
  assert.strictEqual(res.created.length, 1)
})

// --- pull / push integration ----------------------------------------------

function setup() {
  const cfg = config()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-twint-'))
  const specDir = path.join(dir, 'spec')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), OVERVIEW, 'utf-8')
  fs.writeFileSync(path.join(specDir, '01-first.md'), PHASE, 'utf-8')
  const base = normalizeLocal(specDir, cfg)
  writeBase(dir, ID, cfg, { ...base, __meta: { updatedAt: 't0', syncedAt: 't0' } })
  const remoteBase = {
    id: PROJECT_ID,
    updatedAt: 't0',
    description: base.description,
    status: { name: 'Backlog', type: 'backlog' },
    priority: { value: 0, name: 'No priority' },
    labels: [],
    // issues matching the two linked local tasks (open / done).
    issues: [
      { identifier: 'SKI-11', title: 'first', state: { type: 'unstarted' } },
      { identifier: 'SKI-12', title: 'second', state: { type: 'completed' } },
    ],
  }
  return { dir, specDir, cfg, remoteBase }
}

test('pull: an issue closed in Linear ticks its task checkbox', async () => {
  const ctx = setup()
  const remote = { ...ctx.remoteBase, issues: [
    { identifier: 'SKI-11', title: 'first', state: { type: 'completed' } }, // closed in Linear
    { identifier: 'SKI-12', title: 'second', state: { type: 'completed' } },
  ] }
  const adapter = { async readProject() { return remote } }
  const r = await pull({ dir: ctx.dir, snapshotDir: ctx.specDir, identifier: ID, projectId: PROJECT_ID, adapter, config: ctx.cfg, force: false, timestamp: TS })
  assert.deepStrictEqual(r.keyedApplied, ['tasks'])
  assert.match(read(ctx.specDir, '01-first.md'), /^- \[x\] first \(SKI-11\)$/m)

  // base advanced → in sync
  const local = normalizeLocal(ctx.specDir, ctx.cfg)
  const base = readBase(ctx.dir, ID, ctx.cfg)
  const f = classify(local, normalizeRemote(remote, ctx.cfg), base, ctx.cfg).find((x) => x.field === 'tasks')
  assert.ok(f.items.every((i) => i.status === 'unchanged'))
})

test('push: editing a task locally yields an issue update plan; a new task → create', async () => {
  const ctx = setup()
  // edit SKI-11 text + add a brand-new idless task
  fs.writeFileSync(
    path.join(ctx.specDir, '01-first.md'),
    `# Phase 1 — P ⬜\n\n**Goal:** g\n\n## Tasks\n\n- [ ] first EDITED (SKI-11)\n- [x] second (SKI-12)\n- [ ] a fresh task\n`,
    'utf-8',
  )
  const adapter = { async readProject() { return ctx.remoteBase }, async updateProject() { return ctx.remoteBase } }
  const r = await push({ dir: ctx.dir, snapshotDir: ctx.specDir, identifier: ID, projectId: PROJECT_ID, adapter, config: ctx.cfg, force: false, timestamp: TS })
  assert.deepStrictEqual(r.issuesPush.update, [{ id: 'SKI-11', text: 'first EDITED', done: false }])
  assert.deepStrictEqual(r.issuesPush.create, [{ text: 'a fresh task', done: false }])
})
