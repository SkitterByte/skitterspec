'use strict'

/**
 * Open manual steps on the ticket (feat-manual-steps-on-ticket, phase 2).
 *
 * While a step under a phase's `## Manual steps` is unticked, the phase body
 * reads it first and the parent leads with it, grouped by phase. More than
 * half of what follows feeds the projection a HEALTHY input — no section, a
 * legacy inline step, every step ticked, a phase not started — and asserts it
 * projects exactly as it would without the feature
 * (`.claude/rules/negative-checks.md` rule 3).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, snapshotOf, remoteDescriptionEdited, compareStored } = require('../index.js')
const { neutralConfig } = require('./_config.js')

const config = (extra = {}) => {
  const c = neutralConfig()
  c.mapping = { ...c.mapping, tasks: 'checklist', ...extra }
  return c
}

const OVERVIEW = ['# Order line override', '', '## Summary', '', 'Admins can override a line.', '', '## Problem', '', 'They cannot.', ''].join('\n')

const SQL = "INSERT INTO permissions (code)\n  VALUES ('order-line-override') -- a < b && c > d;"

function phaseFile({ emoji = '🔄', mark = ' ', section = true, legacy = false } = {}) {
  const lines = ['# Phase 1 — Rollout ' + emoji, '', '> Spec: [00-overview.md](00-overview.md) · **Status:** In progress', '', '**Goal:** ship the override.', '', '## Tasks', '', '- [x] Build the override', '']
  if (legacy) lines.push('- [ ] Manual step, by hand: on Prod, run `SELECT 1`', '')
  if (section) {
    lines.push('## Manual steps', '', `- [${mark}] On Prod, grant the permission:`, '', '  ```sql', ...SQL.split('\n').map((l) => `  ${l}`), '  ```', '', '- [x] Tell support', '')
  }
  lines.push('## Notes', '', 'Nothing else.', '')
  return lines.join('\n')
}

function specDir(phases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-manual-proj-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), OVERVIEW, 'utf-8')
  phases.forEach((body, i) => fs.writeFileSync(path.join(dir, `0${i + 1}-phase-${i + 1}.md`), body, 'utf-8'))
  return dir
}

const project = (phases, cfg = config()) => normalizeLocal(specDir(phases), cfg)

// --- it shows -----------------------------------------------------------------

test('an open step with SQL leads the parent, as a fenced block', () => {
  const { description } = project([phaseFile()])
  assert.ok(description.startsWith('# Order line override\n\n## Manual steps (open)\n\n### Phase 1 — Rollout\n\n'), description)
  assert.ok(description.includes('- [ ] On Prod, grant the permission:\n\n  ```sql\n  INSERT INTO permissions (code)\n    VALUES'), description)
  assert.ok(!description.includes('Tell support'), 'a ticked step is not on the parent')
  assert.ok(description.indexOf('## Manual steps (open)') < description.indexOf('## Summary'))
})

test('the phase Task reads the section first, retitled, with ticked steps kept', () => {
  const { subIssues } = project([phaseFile()])
  const body = subIssues[0].goal
  assert.ok(body.indexOf('## Manual steps (open)') < body.indexOf('## Tasks'), body)
  assert.ok(body.indexOf('**Goal:**') < body.indexOf('## Manual steps (open)'), body)
  assert.ok(!/^## Manual steps$/m.test(body), 'the section appears once')
  assert.ok(body.includes('- [x] Tell support'))
  assert.ok(body.includes('  ```sql\n  INSERT INTO permissions (code)'), body)
})

test('phases group under their own heading, in order', () => {
  const { description } = project([phaseFile(), phaseFile()])
  const a = description.indexOf('### Phase 1 — Rollout')
  const b = description.indexOf('### Phase 2 — Rollout')
  assert.ok(a !== -1 && b > a, description)
})

test('a script holding a fence gets a longer fence', () => {
  const body = ['# Phase 1 — Docs 🔄', '', '**Goal:** g.', '', '## Manual steps', '', '- [ ] Paste this:', '', '  ````md', '  ```sh', '  ls', '  ```', '  ````', ''].join('\n')
  const { description } = project([body])
  assert.ok(description.includes('  ````md\n  ```sh\n  ls\n  ```\n  ````'), description)
})

test('summary mode: the block carries the open steps, and the phase block its own', () => {
  const cfg = config({ description: 'summary' })
  const { description, subIssues } = project([phaseFile()], cfg)
  assert.ok(description.includes('**Manual steps (open)**\n\n*Phase 1 — Rollout*\n\n- [ ] On Prod'), description)
  assert.ok(description.includes('```sql'), description)
  assert.ok(subIssues[0].goal.includes('**Manual steps (open)**\n\n- [ ] On Prod'), subIssues[0].goal)
  assert.ok(!subIssues[0].goal.includes('Tell support'))
})

// --- stays silent -------------------------------------------------------------

test('STAYS SILENT: a phase with no section projects as it always has', () => {
  const p = project([phaseFile({ section: false })])
  assert.ok(!p.description.includes('Manual steps'))
  assert.strictEqual(p.subIssues[0].goal.indexOf('## Tasks') < p.subIssues[0].goal.indexOf('## Notes'), true)
})

test('STAYS SILENT: legacy inline steps are not guessed at', () => {
  const legacy = project([phaseFile({ section: false, legacy: true })])
  assert.ok(!legacy.description.includes('Manual steps'))
  assert.ok(legacy.subIssues[0].goal.includes('- [ ] Manual step, by hand: on Prod, run `SELECT 1`'))
  assert.ok(!legacy.subIssues[0].goal.includes('Manual steps (open)'))
})

test('STAYS SILENT: every step ticked — no parent section, and the Task keeps the file order', () => {
  const done = project([phaseFile({ mark: 'x' })])
  const plain = project([phaseFile({ section: false })])
  assert.strictEqual(done.description, plain.description)
  const body = done.subIssues[0].goal
  assert.ok(!body.includes('(open)'))
  assert.ok(body.indexOf('## Tasks') < body.indexOf('## Manual steps'), body)
})

test('STAYS SILENT: open steps in a phase not started stay off the parent', () => {
  const unstarted = project([phaseFile({ emoji: '⬜' })])
  const plain = project([phaseFile({ emoji: '⬜', section: false })])
  assert.strictEqual(unstarted.description, plain.description)
  // Its own Task still reads them first: that body is the phase file.
  assert.ok(unstarted.subIssues[0].goal.includes('## Manual steps (open)'))
})

test('STAYS SILENT: summary mode with nothing open matches the block without the section', () => {
  const cfg = config({ description: 'summary' })
  const done = project([phaseFile({ mark: 'x' })], cfg)
  const plain = project([phaseFile({ section: false })], cfg)
  // The two specs live in different temp folders, and the block names its path.
  const unpath = (d) => d.replace(/skitterspec-manual-proj-\w+/, '<dir>')
  assert.strictEqual(unpath(done.description), unpath(plain.description))
  assert.ok(!done.subIssues[0].goal.includes('Manual steps'))
})

// --- sync safety --------------------------------------------------------------

test('push, tick, push: the section leaves the parent and reads as no hand edit', () => {
  const cfg = config()
  const open = project([phaseFile()], cfg)
  const ticked = project([phaseFile({ mark: 'x' })], cfg)
  assert.ok(open.description.includes('Manual steps (open)'))
  assert.ok(!ticked.description.includes('Manual steps (open)'))
  // Each push records what it sent; the tracker holding exactly that is intact.
  for (const sent of [open, ticked]) {
    const snap = snapshotOf(sent, cfg)
    assert.strictEqual(remoteDescriptionEdited(snap, { description: sent.description }, cfg), false)
    assert.strictEqual(compareStored(sent.description, sent.description, cfg).ok, true)
  }
})
