'use strict'

// Regression: hand-wrapped task bullets and goals.
//
// Real spec files wrap prose at ~80 columns with indented continuation lines.
// The original normalizer matched tasks with /^-\s*\[[ x]\]\s*.*$/gm and goals
// with a /m-flagged non-greedy scan — under /m, `$` matches end-of-LINE, so both
// stopped at the first newline and silently truncated mid-sentence. Every
// fixture here is deliberately WRAPPED; single-line fixtures cannot catch it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { stampIssueId } = require('../src/write.js')
const { findTaskBlocks, renderTaskBlock } = require('../src/task-block.js')
const { neutralConfig } = require('./_config.js')

function config() {
  const c = neutralConfig()
  for (const k of ['phaseBodies', 'acceptanceCriteria', 'taskBreakdown']) {
    delete c.sync.fieldOwnership[k]
  }
  c.sync.fieldOwnership.tasks = 'both'
  c.sync.fieldOwnership.milestones = 'both'
  c.sync.keyedFields = { tasks: 'id', milestones: 'id' }
  return c
}

const OVERVIEW = `# Demo\n\n## Problem\n\nx\n`

// A wrapped goal (two lines, no blank between) and two wrapped task bullets.
const PHASE = `# Phase 1 — Outbox ⬜

**Goal:** a durable place to put a cross-boundary event, and one way to write
it. Inert — nothing enqueues yet, so this ships with no behaviour change.

## Tasks

- [x] Add \`DbProcessEventOutbox\` to \`prisma/schema.prisma\`, modelled on
      \`DbNotificationOutbox\`: status, attempts, \`nextAttemptAt\`, plus the
      event payload. (SKI-1)
- [ ] Add \`idempotencyKey\` with a unique index, so a duplicate enqueue
      collapses to one row rather than double-applying.
`

function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapped-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), OVERVIEW)
  fs.writeFileSync(path.join(dir, '01-outbox.md'), PHASE)
  return dir
}

test('a wrapped task keeps its continuation lines in the normalized text', () => {
  const local = normalizeLocal(snapshot(), config())
  assert.strictEqual(local.tasks.length, 2)
  assert.strictEqual(local.tasks[0].id, 'SKI-1')
  assert.strictEqual(local.tasks[0].done, true)
  assert.strictEqual(
    local.tasks[0].description,
    'Add `DbProcessEventOutbox` to `prisma/schema.prisma`, modelled on ' +
      '`DbNotificationOutbox`: status, attempts, `nextAttemptAt`, plus the event payload.',
  )
  assert.strictEqual(local.tasks[1].id, null)
  assert.match(local.tasks[1].description, /double-applying\.$/)
})

test('a wrapped goal keeps its continuation line', () => {
  const local = normalizeLocal(snapshot(), config())
  assert.strictEqual(
    local.milestones[0].goal,
    'a durable place to put a cross-boundary event, and one way to write it. ' +
      'Inert — nothing enqueues yet, so this ships with no behaviour change.',
  )
})

test('stamping an id onto a wrapped, idless task re-wraps it in place', () => {
  const dir = snapshot()
  const local = normalizeLocal(dir, config())
  const file = stampIssueId(dir, local.tasks[1].description, 'SKI-2')
  assert.strictEqual(file, '01-outbox.md')

  const after = normalizeLocal(dir, config())
  assert.strictEqual(after.tasks[1].id, 'SKI-2')
  assert.strictEqual(after.tasks[1].description, local.tasks[1].description)

  // still wrapped, and no line blew past the file's width
  const lines = fs.readFileSync(path.join(dir, '01-outbox.md'), 'utf-8').split('\n')
  assert.ok(lines.every((l) => l.length <= 80))
})

test('render → parse is a round trip for a long task', () => {
  const text = 'word '.repeat(60).trim()
  const lines = renderTaskBlock({ indent: '', done: false, text, id: 'SKI-3' })
  assert.ok(lines.length > 1, 'expected the long task to wrap')
  const [block] = findTaskBlocks(lines)
  assert.strictEqual(block.text, `${text} (SKI-3)`)
  assert.strictEqual(block.mark, ' ')
})

test('an indented sub-task is read and rewritten at its own indent', () => {
  const lines = [
    '  - [ ] a nested task whose text is long enough that it has to wrap onto',
    '        a continuation line below it',
  ]
  const [block] = findTaskBlocks(lines)
  assert.strictEqual(block.indent, '  ')
  assert.match(block.text, /wrap onto a continuation line below it$/)
  const rendered = renderTaskBlock({ indent: block.indent, done: false, text: block.text })
  assert.ok(rendered.every((l) => l.startsWith('  ')))
})

// A wrapped continuation that begins with -/*/+/N. sits AT the hanging indent; a
// genuine nested bullet is SHALLOWER. Break only on the latter — else the task is
// truncated, its stamped id stops matching, and the next push creates a duplicate.

test('a continuation beginning with +/-/* at the hang is kept, not truncated', () => {
  const [block] = findTaskBlocks([
    '- [x] Task text ending here',
    '      + continuation with a plus',
    '      - and a minus-led one',
    '      normal tail',
  ])
  assert.strictEqual(
    block.text,
    'Task text ending here + continuation with a plus - and a minus-led one normal tail',
  )
})

test('a stamped task with a marker-led continuation still reads back its id', () => {
  // The inline id sits on the LAST line; a truncating continuation drops it, so
  // the task reads back id:null and the next push creates a duplicate issue.
  const { parseTaskLine } = require('../src/normalize.js')
  const [b] = findTaskBlocks([
    '- [x] Do the thing',
    '      + a wrapped continuation',
    '      that ends here (SKI-42)',
  ])
  const parsed = parseTaskLine(`[${b.mark}] ${b.text}`)
  assert.strictEqual(parsed.id, 'SKI-42', 'id survives so push updates, not duplicates')
})

test('a genuine nested child (shallower than the hang) still breaks', () => {
  const blocks = findTaskBlocks([
    '- [x] Parent task with enough text to be real',
    '  - [ ] Genuine nested child',
    '  - [ ] Second nested child',
  ])
  assert.strictEqual(blocks.length, 3)
  assert.strictEqual(blocks[0].text, 'Parent task with enough text to be real')
  assert.match(blocks[1].text, /Genuine nested child/)
})

// Regression (8.0.4): the marker-continuation fix keyed on indent, so a nested
// checkbox AT the hanging indent (6, the default shape for hand-wrapped specs)
// was swallowed into its parent — the parent then held the children's ids
// mid-text (reading back id:null) and a push would orphan the live issues and
// duplicate the parent. A checkbox is unambiguously a task: it must break at
// ANY indent, while a bare `+`/`-`/`*` at the hang stays a continuation.
for (const indent of [2, 4, 6]) {
  test(`a nested checkbox at indent ${indent} breaks (never swallowed)`, () => {
    const blocks = findTaskBlocks([
      '- [x] Parent task with enough text to be real (REU-1)',
      `${' '.repeat(indent)}- [x] Nested child (REU-2)`,
      `${' '.repeat(indent)}- [ ] Second nested child (REU-3)`,
    ])
    assert.strictEqual(blocks.length, 3, `indent ${indent} must break, not swallow`)
    assert.strictEqual(blocks[0].text, 'Parent task with enough text to be real (REU-1)')
    assert.match(blocks[1].text, /Nested child \(REU-2\)$/)
    assert.match(blocks[2].text, /Second nested child \(REU-3\)$/)
  })
}

// A spec often documents a checklist FORMAT inside a fenced code block. Those
// example bullets are not real tasks — harvesting them would push phantom
// tracker issues. findTaskBlocks must skip anything inside a ``` / ~~~ fence.

test('example checkboxes inside a ``` fence are not harvested as tasks', () => {
  const blocks = findTaskBlocks([
    '## Tasks',
    '',
    '- [ ] Real task one',
    '- [x] Real task two',
    '',
    'The format we use looks like:',
    '',
    '```markdown',
    '- [ ] Example placeholder task',
    '- [ ] Another example',
    '```',
    '',
    '- [ ] Real task three',
  ])
  assert.strictEqual(blocks.length, 3, 'only the three real tasks, no fenced examples')
  assert.deepStrictEqual(
    blocks.map((b) => b.text),
    ['Real task one', 'Real task two', 'Real task three'],
  )
})

test('example checkboxes inside a ~~~ fence are skipped too', () => {
  const blocks = findTaskBlocks([
    '- [ ] Real one',
    '~~~',
    '- [ ] fenced example',
    '~~~',
    '- [ ] Real two',
  ])
  assert.strictEqual(blocks.length, 2)
  assert.deepStrictEqual(blocks.map((b) => b.text), ['Real one', 'Real two'])
})

test('a bare + continuation at the hang (indent 6) still joins', () => {
  // The 8.0.4 fix must survive: a bare marker at the hanging indent is prose.
  const [block] = findTaskBlocks([
    '- [x] Parent task with enough text to be real',
    '      + prose tail that wrapped onto the next line',
  ])
  assert.strictEqual(block.text, 'Parent task with enough text to be real + prose tail that wrapped onto the next line')
})
