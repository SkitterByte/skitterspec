'use strict'

// Phase 2b: the phase-file denormalizer writes pulled milestone edits back into
// the body — updating a matched phase file in place, creating a phase file for a
// Linear-only milestone, and stamping ids — leaving unrelated content untouched.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  findPhaseFileByMilestoneId,
  findPhaseFileByTitle,
  writeMilestoneFields,
  stampMilestoneId,
  createPhaseFileForMilestone,
  applyMilestonesPull,
} = require('../src/write.js')

const PHASE = `---
linear_milestone_id: "M-1"
---

# Phase 1 — Old title ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** old goal

## Tasks

- [ ] keep me
`

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-denorm-'))
  fs.writeFileSync(path.join(dir, '01-first.md'), PHASE, 'utf-8')
  return dir
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf-8')

test('finds a phase file by its milestone id and by its title', () => {
  const dir = fixture()
  assert.strictEqual(findPhaseFileByMilestoneId(dir, 'M-1'), '01-first.md')
  assert.strictEqual(findPhaseFileByMilestoneId(dir, 'nope'), null)
  assert.strictEqual(findPhaseFileByTitle(dir, 'Old title'), '01-first.md')
})

test('writeMilestoneFields updates title + goal, preserves prefix/emoji/tasks', () => {
  const dir = fixture()
  writeMilestoneFields(dir, '01-first.md', { name: 'New title', goal: 'new goal' })
  const out = read(dir, '01-first.md')
  assert.match(out, /^# Phase 1 — New title ⬜$/m) // prefix + emoji kept
  assert.match(out, /^\*\*Goal:\*\* new goal$/m)
  assert.match(out, /^- \[ \] keep me$/m) // body untouched
  assert.doesNotMatch(out, /Old title/)
})

test('stampMilestoneId adds the id to a phase file with no frontmatter', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stamp-'))
  fs.writeFileSync(path.join(dir, '01-x.md'), '# Phase 1 — X ⬜\n\n**Goal:** g\n', 'utf-8')
  stampMilestoneId(dir, '01-x.md', 'M-9')
  const out = read(dir, '01-x.md')
  assert.match(out, /^linear_milestone_id: "M-9"$/m)
  assert.match(out, /^# Phase 1 — X ⬜$/m) // original body preserved
})

test('createPhaseFileForMilestone writes a numbered, linked phase file', () => {
  const dir = fixture()
  const file = createPhaseFileForMilestone(dir, { id: 'M-2', name: 'Second phase', goal: 'do it' })
  assert.strictEqual(file, '02-second-phase.md')
  const out = read(dir, file)
  assert.match(out, /^linear_milestone_id: "M-2"$/m)
  assert.match(out, /^# Phase 2 — Second phase ⬜$/m)
  assert.match(out, /^\*\*Goal:\*\* do it$/m)
})

test('applyMilestonesPull edits matches, creates new, reports removals', () => {
  const dir = fixture()
  const items = [
    { id: 'M-1', status: 'edited', side: 'remote', pullable: true, report: false, remote: { id: 'M-1', name: 'Edited', goal: 'edited goal' } },
    { id: 'M-2', status: 'added', side: 'remote', pullable: true, report: false, remote: { id: 'M-2', name: 'Brand new', goal: 'new' } },
    { id: 'M-3', status: 'removed', side: 'remote', pullable: false, report: true, remote: null },
  ]
  const res = applyMilestonesPull(dir, items)
  assert.deepStrictEqual(res.applied, ['M-1'])
  assert.deepStrictEqual(res.reported, ['M-3'])
  assert.strictEqual(res.created.length, 1)
  assert.match(read(dir, '01-first.md'), /New title|Edited/) // M-1 edited
  assert.match(read(dir, res.created[0].file), /Brand new/) // M-2 created
})
