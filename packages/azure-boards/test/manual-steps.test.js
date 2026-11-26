'use strict'

// Open manual steps on a Boards work item (feat-manual-steps-on-ticket): the
// User Story and the phase Task both carry the SQL as a fenced block, and the
// read-back Boards returns — HTML specials entity-encoded, tag-shaped tokens
// stripped — compares intact, before and after the steps are ticked.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, snapshotOf, remoteDescriptionEdited, compareStored } = require('@skitterbyte/skitterspec-sync-core')
const { loadAzureConfig } = require('../src/config.js')

const SQL = ["UPDATE lines SET override = 1", "  WHERE qty < 10 AND price > 0 AND note <> 'x & y';"]

function specTree(mark) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'azure-manual-'))
  const dir = path.join(root, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '---\nazure_identifier: "AB#7"\n---\n\n# Demo\n\n## Summary\n\nOverride a line.\n\n## Problem\n\nBody prose.\n',
  )
  fs.writeFileSync(
    path.join(dir, '01-rollout.md'),
    [
      '---', 'azure_item_id: "AB#8"', '---', '', '# Phase 1 — Rollout 🔄', '', '**Goal:** ship it.', '', '## Tasks', '', '- [x] Build it', '',
      '## Manual steps', '', `- [${mark}] On Prod, run:`, '', '  ```sql', ...SQL.map((l) => `  ${l}`), '  ```', '',
    ].join('\n'),
  )
  return dir
}

// What Boards hands back for a markdown description it stored.
const boardsStored = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

for (const mode of ['spec', 'summary']) {
  test(`${mode} mode: the Story and the Task carry the SQL as a fenced block`, () => {
    const cfg = loadAzureConfig('/nonexistent').config
    cfg.mapping = { ...cfg.mapping, description: mode }
    const local = normalizeLocal(specTree(' '), cfg)
    for (const body of [local.description, local.subIssues[0].goal]) {
      assert.ok(body.includes('Manual steps (open)'), body)
      assert.ok(body.includes('```sql\n  UPDATE lines SET override = 1'), body)
    }
  })

  test(`${mode} mode: open then ticked, each read-back compares intact`, () => {
    const cfg = loadAzureConfig('/nonexistent').config
    cfg.mapping = { ...cfg.mapping, description: mode }
    const open = normalizeLocal(specTree(' '), cfg)
    const ticked = normalizeLocal(specTree('x'), cfg)
    assert.ok(!ticked.description.includes('Manual steps (open)'), ticked.description)
    for (const sent of [open, ticked]) {
      const stored = boardsStored(sent.description)
      assert.strictEqual(compareStored(sent.description, stored, cfg).ok, true)
      assert.strictEqual(remoteDescriptionEdited(snapshotOf(sent, cfg), { description: stored }, cfg), false)
    }
    // The check can fire: a real edit inside the repo's text is still reported
    // (in summary mode, text after the block is the team's and never counts).
    const edited = boardsStored(open.description).replace('On Prod, run:', 'On Prod and Demo, run:')
    assert.strictEqual(remoteDescriptionEdited(snapshotOf(open, cfg), { description: edited }, cfg), true)
  })
}
