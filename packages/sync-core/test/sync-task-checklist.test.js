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

// A note written underneath a task is part of that task's content. It used to be
// dropped by the parser entirely (bug-task-subtree-bullets-dropped); now it
// reaches the mirror — as a plain bullet, never as a task that doesn't exist.
const PHASE_WITH_NOTES = [
  '# Phase 1 — Engine ⬜',
  '',
  '**Goal:** make the engine work.',
  '',
  '## Tasks',
  '',
  '- [ ] Wire the CLI',
  '      - [x] Add the --json flag',
  '            wrapped continuation',
  '      - **Note:** the flag is positional',
  '        and its default is off',
  '      2. Second note',
  '- [ ] Add tests',
  '',
].join('\n')

test('a sub-bullet under a task reaches the checklist as a plain bullet', () => {
  const goal = normalizeLocal(specDir(PHASE_WITH_NOTES), withTasks('checklist')).subIssues[0].goal
  const lines = goal.split('\n').filter((l) => /^\s*(-|\d+\.)\s/.test(l))

  assert.deepEqual(lines, [
    '- [ ] Wire the CLI',
    '      - [x] Add the --json flag wrapped continuation',
    '      - **Note:** the flag is positional and its default is off',
    '      2. Second note',
    '- [ ] Add tests',
  ])
})

test('a sub-bullet is never rendered as a checkbox', () => {
  const goal = normalizeLocal(specDir(PHASE_WITH_NOTES), withTasks('checklist')).subIssues[0].goal
  assert.ok(goal.includes('**Note:** the flag is positional'), 'the note is present at all')
  assert.ok(!/\[[ x]\]\s*\*\*Note:\*\*/.test(goal), 'the note did not become a task')
  // Three real checkboxes in the source, three in the mirror — no invention.
  assert.equal((goal.match(/- \[[ x]\]/g) || []).length, 3)
})

test('nothing written under a task is missing from the checklist', () => {
  const goal = normalizeLocal(specDir(PHASE_WITH_NOTES), withTasks('checklist')).subIssues[0].goal
  for (const fragment of ['Wire the CLI', 'Add the --json flag', 'wrapped continuation',
    'the flag is positional', 'its default is off', 'Second note', 'Add tests']) {
    assert.ok(goal.includes(fragment), `"${fragment}" reached the mirror`)
  }
})

// --- task sections survive into the mirror ----------------------------------
//
// Every checkbox used to flatten into one hardcoded `## Tasks` list whatever
// heading it was written under, so criteria under `## Acceptance` arrived
// indistinguishable from the task list above them. Nothing was lost — it was
// unreadable, which is a different bug with the same smell.

const PHASE_WITH_SECTIONS = [
  '# Phase 1 — Engine ⬜',
  '',
  '**Goal:** make the engine work.',
  '',
  '## Tasks',
  '',
  '- [x] Add the parser',
  '- [ ] Wire the CLI',
  '',
  '## Acceptance',
  '',
  '- [ ] the CLI exits non-zero on a bad flag',
  '- [ ] the parser round-trips',
  '',
].join('\n')

test('a task section keeps the heading it was written under', () => {
  const goal = normalizeLocal(specDir(PHASE_WITH_SECTIONS), withTasks('checklist')).subIssues[0].goal

  assert.match(goal, /## Acceptance/, 'the source heading reaches the mirror')
  // Each checkbox sits under the heading it was written beneath — the whole point.
  const [, tasks, acceptance] = goal.split(/^## /m)
  assert.match(tasks, /Wire the CLI/)
  assert.ok(!/Wire the CLI/.test(acceptance), 'a task did not leak into Acceptance')
  assert.match(acceptance, /the parser round-trips/)
  assert.ok(!/round-trips/.test(tasks), 'a criterion did not leak into Tasks')
})

test('sections keep their source order', () => {
  const goal = normalizeLocal(specDir(PHASE_WITH_SECTIONS), withTasks('checklist')).subIssues[0].goal
  assert.ok(goal.indexOf('## Tasks') < goal.indexOf('## Acceptance'))
})

test('a heading is preserved exactly as written', () => {
  const body = PHASE_WITH_SECTIONS.replace('## Tasks', '## Tasks — 2a (read-model) ✅')
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.match(goal, /## Tasks — 2a \(read-model\) ✅/, 'suffix and emoji survive')
})

// Decision 3 — the common case must not move at all.
test('checkboxes under no heading still project as ## Tasks', () => {
  const goal = normalizeLocal(specDir(PHASE), withTasks('checklist')).subIssues[0].goal
  assert.match(goal, /## Tasks/)
  assert.equal((goal.match(/^## /gm) || []).length, 1, 'exactly one heading, as today')
})

test('a heading holding no checkboxes is not emitted', () => {
  const body = PHASE_WITH_SECTIONS + '\n## Notes\n\nJust prose, no boxes.\n'
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.ok(!/## Notes/.test(goal), 'an empty section is noise, not fidelity')
})

test('a heading inside a fence never becomes a section', () => {
  const body = [
    '# Phase 1 — Engine ⬜',
    '',
    '**Goal:** go.',
    '',
    '## Tasks',
    '',
    '- [ ] Document the format',
    '',
    '```md',
    '## Acceptance',
    '- [ ] an example criterion',
    '```',
    '',
  ].join('\n')
  const goal = normalizeLocal(specDir(body), withTasks('checklist')).subIssues[0].goal
  assert.ok(!/## Acceptance/.test(goal), 'an example heading is not a real section')
  assert.ok(!/an example criterion/.test(goal), 'nor is its example checkbox a task')
})
