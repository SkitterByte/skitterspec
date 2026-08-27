'use strict'

/**
 * Phase tasks projected into the sub-issue description (`mapping.tasks`).
 *
 * Tasks stopped being individually-synced issues for good reason — the old
 * mapping exploded one spec into 92 issues. But the sub-issue left behind is a
 * title and one `**Goal:**` sentence, which is too thin for anyone actually
 * working in the tracker. A read-only checklist in the description brings the
 * content back without the objects: nothing is created per task, nothing is read
 * back, and a box ticked in the tracker is overwritten by the next push.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { planChanges, snapshotOf } = require('../src/compare.js')
const { projectionOf } = require('../src/push.js')
const { neutralConfig } = require('./_config.js')

const withTasks = (mode) => {
  const c = neutralConfig()
  c.mapping = { ...(c.mapping || {}), tasks: mode }
  return c
}

// A one-phase spec whose phase file body is supplied verbatim.
function specDir(phaseBody, { file = '01-engine.md', name = 'Engine' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-tasks-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    ['# Spec', '', '## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|',
      `| 1 | ${name} | ⬜ | [${file}](${file}) |`, ''].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(path.join(dir, file), phaseBody, 'utf-8')
  return dir
}

const PHASE = [
  '# Phase 1 — Engine ⬜',
  '',
  '**Goal:** make the engine work.',
  '',
  '## Tasks',
  '',
  '- [x] Add the parser',
  '- [ ] Wire the CLI',
  '  - [ ] Add the --json flag',
  '- [ ] Add tests',
  '',
].join('\n')

test('checklist mode carries the tasks, their state and their nesting', () => {
  const goal = normalizeLocal(specDir(PHASE), withTasks('checklist')).subIssues[0].goal
  assert.match(goal, /^make the engine work\./, 'goal still leads')
  assert.match(goal, /^## Tasks$/m, 'has a Tasks heading')
  assert.match(goal, /^- \[x\] Add the parser$/m, 'a done task stays done')
  assert.match(goal, /^- \[ \] Wire the CLI$/m, 'an open task stays open')
  assert.match(goal, /^ {2}- \[ \] Add the --json flag$/m, 'nesting is preserved')
})

test('none mode leaves the sub-issue description as the Goal alone', () => {
  const goal = normalizeLocal(specDir(PHASE), withTasks('none')).subIssues[0].goal
  assert.strictEqual(goal, 'make the engine work.')
})

test('a legacy inline (KEY-123) is stripped from the mirrored task', () => {
  // Those ids named per-task issues we no longer create; leaving them in the
  // mirror points readers at objects that may not exist.
  const body = PHASE.replace('- [x] Add the parser', '- [x] Add the parser (SKI-7)')
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.match(goal, /^- \[x\] Add the parser$/m)
  assert.doesNotMatch(goal, /SKI-7/)
})

test('a phase with no tasks gets no empty Tasks heading', () => {
  const body = ['# Phase 1 — Engine ⬜', '', '**Goal:** make the engine work.', ''].join('\n')
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.strictEqual(goal, 'make the engine work.')
})

test('an example checkbox inside a fenced block is not mirrored as a task', () => {
  const body = [
    '# Phase 1 — Engine ⬜',
    '',
    '**Goal:** make the engine work.',
    '',
    '## Tasks',
    '',
    '- [ ] Wire the CLI',
    '',
    '```markdown',
    '- [ ] not a real task',
    '```',
    '',
  ].join('\n')
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.doesNotMatch(goal, /not a real task/)
})

test('the checklist joins the diff, so editing a task alone is an update', () => {
  // The checklist lives in `goal`, which subIssueHash already covers — this
  // asserts that rather than trusting it.
  const config = withTasks('checklist')
  const before = specDir(PHASE.replace('linear_issue_id', 'x'))
  fs.writeFileSync(
    path.join(before, '01-engine.md'),
    '---\nlinear_issue_id: "SKI-9"\n---\n\n' + PHASE,
    'utf-8',
  )
  const snapshot = snapshotOf(projectionOf(before, config))

  fs.writeFileSync(
    path.join(before, '01-engine.md'),
    '---\nlinear_issue_id: "SKI-9"\n---\n\n' + PHASE.replace('- [ ] Add tests', '- [x] Add tests'),
    'utf-8',
  )
  const plan = planChanges(projectionOf(before, config), snapshot)
  assert.deepStrictEqual(plan.subIssues.create, [], 'never recreates a linked sub-issue')
  assert.strictEqual(plan.subIssues.update.length, 1, 'the ticked box is an update')
})

test('a snapshot recorded before checklists plans updates, never creates', () => {
  // The one-time churn from turning checklists on: every already-linked
  // sub-issue reports as `update` on the first push. It must NOT report as
  // `create` — that would mint a duplicate issue for every phase in the repo.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-churn-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    ['# Spec', '', '## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|',
      '| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |', ''].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(path.join(dir, '01-engine.md'), '---\nlinear_issue_id: "SKI-9"\n---\n\n' + PHASE, 'utf-8')

  // What the old code would have recorded: goal-only, same id.
  const old = snapshotOf(projectionOf(dir, withTasks('none')))
  const plan = planChanges(projectionOf(dir, withTasks('checklist')), old)

  assert.deepStrictEqual(plan.subIssues.create, [], 'no duplicate issues minted')
  assert.strictEqual(plan.subIssues.update.length, 1)
  assert.strictEqual(plan.subIssues.update[0].id, 'SKI-9', 'updates the existing sub-issue')
})

test('turning checklists off again is also just an update', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-churn-off-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    ['# Spec', '', '## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|',
      '| 1 | Engine | ⬜ | [01-engine.md](01-engine.md) |', ''].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(path.join(dir, '01-engine.md'), '---\nlinear_issue_id: "SKI-9"\n---\n\n' + PHASE, 'utf-8')

  const on = snapshotOf(projectionOf(dir, withTasks('checklist')))
  const plan = planChanges(projectionOf(dir, withTasks('none')), on)
  assert.deepStrictEqual(plan.subIssues.create, [])
  assert.strictEqual(plan.subIssues.update.length, 1)
})
