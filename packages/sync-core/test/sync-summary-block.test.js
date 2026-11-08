'use strict'

// The summary block (feat-tracker-held-specs phase 3): the delimited block a
// ticket carries under `mapping.description: "summary"`, the splice that
// writes it beside the team's own text, and the drift check scoped to it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  normalizeLocal,
  blockOf,
  wrapBlock,
  spliceBlock,
  comparableDescription,
  descriptionMode,
  remoteDescriptionEdited,
  snapshotOf,
  DELIMITERS,
} = require('../index.js')
const { neutralConfig } = require('./_config.js')

const summaryConfig = (delimiter = 'comment', extra = {}) => {
  const c = neutralConfig()
  c.mapping = { ...c.mapping, description: 'summary', ...extra }
  c.summary = { delimiter }
  return c
}

function specDir({ overview, phases = { '01-build.md': '# Phase 1 — Build ⬜\n\n**Goal:** make the thing.\n\n## Tasks\n\n- [x] one\n- [ ] two\n' }, bucket = 'in-progress' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-'))
  const dir = path.join(root, 'specs', bucket, 'feat-inbox-sort')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), overview)
  for (const [name, text] of Object.entries(phases)) fs.writeFileSync(path.join(dir, name), text)
  return dir
}

const FULL = `# Inbox sort

> **Type:** Feature
> **Gating:** flag inbox-sort

## Summary

Sort the task inbox by when an item entered its state.

## Problem

People cannot find what moved recently.

## Decisions

1. A long decision nobody on the board reads.

## Acceptance criteria

- Both dates show on every row
- [x] Sort order survives a reload

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Endpoint | update | GET /tasks |
| DB | update | tasks.state_entered_at |

## Open questions

- None
`

// --- descriptionMode ----------------------------------------------------------

test('a config with no mapping.description is spec mode', () => {
  assert.strictEqual(descriptionMode(neutralConfig()), 'spec')
  assert.strictEqual(descriptionMode({}), 'spec')
  assert.strictEqual(descriptionMode(summaryConfig()), 'summary')
})

// --- the block ----------------------------------------------------------------

test('the spec block carries summary, criteria, touches, gating and the path — and nothing else', () => {
  const p = normalizeLocal(specDir({ overview: FULL }), summaryConfig())
  const d = p.description
  assert.ok(d.startsWith(DELIMITERS.comment.begin), d)
  assert.ok(d.endsWith(DELIMITERS.comment.end), d)
  assert.match(d, /Sort the task inbox by when an item entered its state\./)
  assert.match(d, /\*\*Acceptance criteria\*\*/)
  assert.match(d, /- \[ \] Both dates show on every row/)
  assert.match(d, /- \[x\] Sort order survives a reload/)
  assert.match(d, /\*\*Touches\*\* GET \/tasks · tasks\.state_entered_at/)
  assert.match(d, /\*\*Gating\*\* flag inbox-sort/)
  assert.match(d, /\*\*Spec\*\* `specs\/in-progress\/feat-inbox-sort`/)
  assert.doesNotMatch(d, /long decision/)
  assert.doesNotMatch(d, /People cannot find/, 'Summary wins over Problem')
})

test('a spec with none of the optional parts still gets its Problem and its path', () => {
  const p = normalizeLocal(specDir({ overview: '# Bare\n\n## Problem\n\nFirst para.\n\nSecond para.\n' }), summaryConfig())
  const inner = p.description.split('\n').slice(1, -1).join('\n')
  assert.strictEqual(inner, 'First para.\n\n**Spec** `specs/in-progress/feat-inbox-sort`')
})

test('a phase sub-issue carries its goal in a block, not its task list', () => {
  const p = normalizeLocal(specDir({ overview: FULL }), summaryConfig())
  assert.strictEqual(p.subIssues[0].goal, wrapBlock('make the thing.', summaryConfig()))
  assert.doesNotMatch(p.subIssues[0].goal, /two/)
})

test('heading delimiters are used where the config says so', () => {
  const p = normalizeLocal(specDir({ overview: FULL }), summaryConfig('heading'))
  assert.ok(p.description.startsWith(DELIMITERS.heading.begin))
  assert.ok(p.description.endsWith(DELIMITERS.heading.end))
})

test('phases: none projects no unlinked phase, but keeps a linked one', () => {
  const unlinked = normalizeLocal(specDir({ overview: FULL }), summaryConfig('comment', { phases: 'none' }))
  assert.deepStrictEqual(unlinked.subIssues, [])
  const linked = normalizeLocal(
    specDir({
      overview: FULL,
      phases: { '01-build.md': '---\nlinear_issue_id: "ERQ-9"\n---\n\n# Phase 1 — Build ⬜\n\n**Goal:** make the thing.\n' },
    }),
    summaryConfig('comment', { phases: 'none' }),
  )
  assert.deepStrictEqual(
    linked.subIssues.map((s) => s.id),
    ['ERQ-9'],
  )
})

// STAYS-SILENT: spec mode is untouched by any of this.
test('spec mode projects the overview exactly as it did before summary mode existed', () => {
  const dir = specDir({ overview: FULL })
  const plain = normalizeLocal(dir, neutralConfig())
  const pinned = neutralConfig()
  pinned.mapping = { ...pinned.mapping, description: 'spec' }
  pinned.summary = { delimiter: 'comment' }
  assert.deepStrictEqual(normalizeLocal(dir, pinned), plain)
  assert.match(plain.description, /long decision/)
})

// --- splice -------------------------------------------------------------------

const C = summaryConfig()
const v1 = wrapBlock('version one', C)
const v2 = wrapBlock('version two', C)

test('an absent block is put above the team’s text, which is kept byte for byte', () => {
  const live = 'PM note.\n\n![shot](https://x.invalid/a.png)\n'
  assert.strictEqual(spliceBlock(live, v1, C), `${v1}\n\n${live}`)
  assert.strictEqual(spliceBlock('', v1, C), v1)
})

test('a present block is replaced in place, whatever surrounds it', () => {
  for (const [before, after] of [
    ['', ''],
    ['above\n\n', ''],
    ['', '\n\nbelow'],
    ['above edited\n[link](https://x.invalid)\n\n', '\n\nmore\nTEXT AT THE BOTTOM\n'],
  ]) {
    assert.strictEqual(spliceBlock(before + v1 + after, v2, C), before + v2 + after)
  }
})

test('a damaged block is never spliced', () => {
  const { begin, end } = DELIMITERS.comment
  for (const live of [`${begin}\nno end`, `no begin\n${end}`, `${end}\n${begin}`, `${v1}\n\n${v1}`]) {
    assert.strictEqual(blockOf(live, C).state, 'damaged', live)
    assert.strictEqual(spliceBlock(live, v2, C), null, live)
  }
})

// --- what is compared ---------------------------------------------------------

test('summary mode compares the block alone; spec mode the whole body', () => {
  assert.strictEqual(comparableDescription(`note\n\n${v1}\n\ntail`, C), v1)
  assert.strictEqual(comparableDescription('no block here', C), null)
  assert.strictEqual(comparableDescription('whole body', neutralConfig()), 'whole body')
})

test('text added outside the block is not drift; an edit inside it is', () => {
  const dir = specDir({ overview: FULL })
  const p = normalizeLocal(dir, C)
  const snap = snapshotOf(p, C)
  // STAYS-SILENT: the team wrote around the block.
  assert.strictEqual(remoteDescriptionEdited(snap, { description: `PM context.\n\n${p.description}\n\nQuote.` }, C), false)
  // Someone edited inside it.
  const edited = p.description.replace('Sort the task inbox', 'Sort the whole inbox')
  assert.strictEqual(remoteDescriptionEdited(snap, { description: `PM context.\n\n${edited}` }, C), true)
  // A block that is gone or damaged is cannot-tell, never an accusation.
  assert.strictEqual(remoteDescriptionEdited(snap, { description: 'PM rewrote everything' }, C), null)
})
