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
const { updateTaskLine, stampIssueId } = require('../src/write.js')
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
  assert.deepStrictEqual(local.tasks[0], {
    id: 'SKI-1',
    done: true,
    text:
      'Add `DbProcessEventOutbox` to `prisma/schema.prisma`, modelled on ' +
      '`DbNotificationOutbox`: status, attempts, `nextAttemptAt`, plus the event payload.',
  })
  assert.strictEqual(local.tasks[1].id, null)
  assert.match(local.tasks[1].text, /double-applying\.$/)
})

test('a wrapped goal keeps its continuation line', () => {
  const local = normalizeLocal(snapshot(), config())
  assert.strictEqual(
    local.milestones[0].goal,
    'a durable place to put a cross-boundary event, and one way to write it. ' +
      'Inert — nothing enqueues yet, so this ships with no behaviour change.',
  )
})

test('pulling an edited title replaces the whole block, leaving no orphans', () => {
  const dir = snapshot()
  const ok = updateTaskLine(dir, 'SKI-1', { text: 'Much shorter title now', done: true })
  assert.strictEqual(ok, true)

  const body = fs.readFileSync(path.join(dir, '01-outbox.md'), 'utf-8')
  assert.match(body, /- \[x\] Much shorter title now \(SKI-1\)/)
  // the replaced bullet's continuation lines must be gone, not stranded
  assert.doesNotMatch(body, /DbNotificationOutbox/)
  assert.doesNotMatch(body, /event payload/)
  // the untouched sibling task survives intact
  assert.match(body, /idempotencyKey/)
  assert.match(body, /double-applying\./)

  // and it still reads back as exactly two tasks
  assert.strictEqual(normalizeLocal(dir, config()).tasks.length, 2)
})

test('stamping an id onto a wrapped, idless task re-wraps it in place', () => {
  const dir = snapshot()
  const local = normalizeLocal(dir, config())
  const file = stampIssueId(dir, local.tasks[1].text, 'SKI-2')
  assert.strictEqual(file, '01-outbox.md')

  const after = normalizeLocal(dir, config())
  assert.strictEqual(after.tasks[1].id, 'SKI-2')
  assert.strictEqual(after.tasks[1].text, local.tasks[1].text)

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
