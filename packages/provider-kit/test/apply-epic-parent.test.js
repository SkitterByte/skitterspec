'use strict'

// The `setParent` seam in the shared apply (spec feat-epics, Decision 6): an
// epic member's issue goes under its epic's, through the provider's op. These
// pin the kit's half — what it does with no op, and that it never fails the
// push — so every provider inherits it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { applySpecPlan } = require('../src/apply.js')
const { neutralConfig } = require('../../sync-core/test/_config.js')

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-epic-'))
  const epic = path.join(dir, 'specs', 'backlog', 'epic-x')
  fs.mkdirSync(epic, { recursive: true })
  fs.writeFileSync(path.join(epic, '00-overview.md'), '---\nlinear_identifier: "EP-1"\n---\n\n# Epic\n\n> **Type:** Epic\n')
  const member = path.join(dir, 'specs', 'backlog', 'feat-a')
  fs.mkdirSync(member, { recursive: true })
  fs.writeFileSync(
    path.join(member, '00-overview.md'),
    '---\nlinear_identifier: "EP-2"\n---\n\n# A\n\n> **Epic:** epic-x\n\n## Problem\n\nP.\n',
  )
  return { dir, snapshotDir: member }
}

function harness(ops = {}) {
  const issue = { id: 'id-2', identifier: 'EP-2', url: 'u', description: '' }
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
  applySpecPlan({ dir: r.dir, config: neutralConfig(), snapshotDir: r.snapshotDir, plan: { subIssues: {} }, ...h })

test('a provider with no setParent op says so, and the push completes', async () => {
  const r = repo()
  const { lines } = await apply(harness(), r)
  assert.ok(lines.includes('  epic EP-1: this tracker cannot express a parent here — skipped'), lines.join('\n'))
})

test('the op is handed the member issue and the epic identifier', async () => {
  const r = repo()
  const seen = []
  const { lines } = await apply(
    harness({
      setParent: async (issue, parent) => {
        seen.push([issue.identifier, parent])
        return { changed: true }
      },
    }),
    r,
  )
  assert.deepStrictEqual(seen, [['EP-2', 'EP-1']])
  assert.ok(lines.includes('  parent set: EP-2 under epic EP-1'))
})

test('an op that throws is a ?? line, never a failed push', async () => {
  const r = repo()
  const { lines } = await apply(
    harness({
      setParent: async () => {
        throw new Error('nope\nmore')
      },
    }),
    r,
  )
  assert.ok(lines.includes('  ?? parent EP-1: nope'))
})
