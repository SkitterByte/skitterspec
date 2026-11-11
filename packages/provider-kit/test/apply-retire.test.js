'use strict'

// The `retireSubIssue` seam in the shared apply (spec feat-epic-migration,
// Decision 3): an epic's leftover phase sub-issues are retired through the
// provider's op, a tracker without it names the ids, and a retire that fails
// keeps its id in the snapshot so the next push tries again.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { applySpecPlan } = require('../src/apply.js')
const { readBase, writeBase } = require('@skitterbyte/skitterspec-sync-core')
const { neutralConfig } = require('../../sync-core/test/_config.js')

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-retire-'))
  const epic = path.join(dir, 'specs', 'backlog', 'epic-x')
  fs.mkdirSync(epic, { recursive: true })
  fs.writeFileSync(path.join(epic, '00-overview.md'), '---\nlinear_identifier: "EP-1"\n---\n\n# Epic\n\n> **Type:** Epic\n')
  writeBase(dir, 'EP-1', neutralConfig(), { subIssues: { 'EP-7': 'h7', 'EP-8': 'h8' } })
  return { dir, snapshotDir: epic }
}

function harness(ops = {}) {
  const issue = { id: 'id-1', identifier: 'EP-1', url: 'u', description: '' }
  return {
    adapter: { readIssue: async () => ({ ...issue }) },
    ops: {
      prevalidateStates() {},
      missingIssueMessage: (id) => `no ${id}`,
      remoteEditedLine: (id) => `edited ${id}`,
      updateIssue: async () => {},
      ...ops,
    },
  }
}

const apply = (h, r) =>
  applySpecPlan({
    dir: r.dir,
    config: neutralConfig(),
    snapshotDir: r.snapshotDir,
    plan: { subIssues: { create: [], update: [], retire: ['EP-7', 'EP-8'] } },
    ...h,
  })

const remembered = (r) => Object.keys((readBase(r.dir, 'EP-1', neutralConfig()) || {}).subIssues || {}).sort()

test('each leftover is retired through the op, and the snapshot forgets it', async () => {
  const r = repo()
  const seen = []
  const { lines } = await apply(harness({ retireSubIssue: async (id) => seen.push(id) }), r)
  assert.deepStrictEqual(seen, ['EP-7', 'EP-8'])
  assert.ok(lines.includes('  sub-issue retired: EP-7 (no phase claims it on an epic)'), lines.join('\n'))
  assert.deepStrictEqual(remembered(r), [])
})

test('a tracker with no op names the ids once, and the push completes', async () => {
  const r = repo()
  const { lines } = await apply(harness(), r)
  assert.ok(lines.includes('  this tracker cannot retire sub-issues here — close by hand: EP-7, EP-8'), lines.join('\n'))
  assert.deepStrictEqual(remembered(r), [])
})

test('a retire that throws is a ?? line, and its id stays for the next push', async () => {
  const r = repo()
  const { lines } = await apply(
    harness({
      retireSubIssue: async (id) => {
        if (id === 'EP-8') throw new Error('nope\nmore')
      },
    }),
    r,
  )
  assert.ok(lines.includes('  ?? retire EP-8: nope'), lines.join('\n'))
  assert.deepStrictEqual(remembered(r), ['EP-8'])
})
