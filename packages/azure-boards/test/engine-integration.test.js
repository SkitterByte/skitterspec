'use strict'

// The engine (sync-core) running over THIS provider's config: azure_* stamps
// are read, the markdown dialect shapes the projection, and the adapter's
// normalised item satisfies the engine's remote accessors — no hooks needed.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, remoteWorkflowState, detectLegacyMirror, push, recordPush, stampSubIssueId } = require('@skitterbyte/skitterspec-sync-core')
const { loadAzureConfig } = require('../src/config.js')

function specTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-engine-'))
  const dir = path.join(root, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '---\nazure_identifier: "AB#7"\nazure_url: "https://dev.azure.com/acme/web/_workitems/edit/7"\n---\n\n# Demo\n\n## Problem\n\nBody prose.\n',
  )
  fs.writeFileSync(
    path.join(dir, '01-outbox.md'),
    '---\nazure_item_id: "AB#8"\n---\n\n# Phase 1 — Outbox ⬜\n\n**Goal:** a durable place.\n\n## Tasks\n\n- [ ] Add the outbox table\n',
  )
  return { root, dir }
}

const config = () => loadAzureConfig('/nonexistent').config

test('azure_* stamps drive the projection — the phase reads as linked', () => {
  const { dir } = specTree()
  const local = normalizeLocal(dir, config())
  assert.strictEqual(local.subIssues.length, 1)
  assert.strictEqual(local.subIssues[0].id, 'AB#8')
  assert.strictEqual(local.workflowState, 'in-progress')
})

test('push → stamp → record closes the loop to an empty plan', () => {
  const { root, dir } = specTree()
  const cfg = config()
  const first = push({ dir: root, snapshotDir: dir, identifier: 'AB#7', config: cfg })
  assert.strictEqual(first.empty, false)
  recordPush({ dir: root, snapshotDir: dir, identifier: 'AB#7', config: cfg })
  const second = push({ dir: root, snapshotDir: dir, identifier: 'AB#7', config: cfg })
  assert.strictEqual(second.empty, true, 'an unchanged spec plans nothing')
})

test("the adapter's normalised item satisfies the engine's remote accessors", () => {
  const cfg = config()
  const item = { state: { name: 'Doing' } }
  assert.strictEqual(remoteWorkflowState(item, cfg), 'in-progress')
  assert.strictEqual(remoteWorkflowState({ state: { name: 'Done' } }, cfg), 'complete')
})

test('stays silent: legacy-mirror detection reports nothing for this provider', () => {
  const { root, dir } = specTree()
  // Even over a repo carrying the OTHER provider's pre-9.0 keys.
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '---\nlinear_project_id: "old"\n---\n\n# Demo\n\n## Problem\n\nx\n',
  )
  assert.strictEqual(
    detectLegacyMirror({ dir: root, snapshotDir: dir, identifier: 'AB#7', config: config() }),
    null,
  )
})

test('stampSubIssueId writes the azure id', () => {
  const { dir } = specTree()
  fs.writeFileSync(path.join(dir, '02-api.md'), '# Phase 2 — Api ⬜\n\n**Goal:** endpoints.\n')
  stampSubIssueId(dir, '02-api.md', 'AB#9', config())
  assert.match(fs.readFileSync(path.join(dir, '02-api.md'), 'utf-8'), /^azure_item_id: "AB#9"$/m)
})
