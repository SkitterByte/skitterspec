'use strict'

/**
 * `passState` — what became of one pass, answered from POSITIVE signals only.
 *
 * The served page asks this after it POSTs, so it can say either "Claude picked
 * it up" or "here is the command" instead of saying the second one always. That
 * makes it an ACCUSING check in both directions, and each direction gets its
 * own present-thing to assert:
 *
 * - `waiting`  — the code IS in the pending store.
 * - `claimed`  — the code IS in the notes sidecar's decision log.
 * - `unknown`  — neither could be established. A corrupt store, a spec with no
 *   sidecar yet, a code from another machine. The caller keeps the command.
 *
 * WHAT WOULD FOOL A CHEAPER VERSION: reading `claimed` off the code being
 * absent from the pending store. A store that moved, a folder name typo, a
 * sidecar too corrupt to parse and a pass dropped with `--drop` are all
 * absences, and three of those four mean nobody has the pass. So the claim is
 * what writes the code down, and the absence alone never speaks.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  emptyNotes,
  emptyPending,
  addPending,
  appendDecision,
  writeNotes,
  writePending,
  passState,
} = require('../src/env/review.js')

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-state-'))
  return path.join(dir, 'feat-x.html')
}

const pass = (code) => ({ blob: { version: 1, spec: 'feat-x', verdict: 'commit' }, at: '2026-09-16T09:46:40.865Z', render: null, code })

test('a code sitting in the holding area is waiting', () => {
  const out = scratch()
  const added = addPending(emptyPending('feat-x'), pass())
  writePending(out, added.pending)
  assert.deepStrictEqual(passState(out, 'feat-x', added.code), { state: 'waiting' })
})

test('a code the decision log names was claimed', () => {
  const out = scratch()
  writePending(out, emptyPending('feat-x'))
  const notes = appendDecision(emptyNotes('feat-x'), {
    verdict: 'commit',
    at: '2026-09-16T09:47:09.089Z',
    code: '418207',
  })
  writeNotes(out, notes)
  assert.deepStrictEqual(passState(out, 'feat-x', '418207'), { state: 'claimed' })
})

// THE WHOLE POINT, in one test. Absent from both is not "claimed" — it is not
// knowing, and the caller is told so rather than told the comfortable thing.
test('a code in neither place is unknown, never claimed', () => {
  const out = scratch()
  writePending(out, emptyPending('feat-x'))
  writeNotes(out, emptyNotes('feat-x'))
  assert.deepStrictEqual(passState(out, 'feat-x', '418207'), { state: 'unknown' })
})

test('a dropped pass reads as unknown — nobody claimed it', () => {
  const out = scratch()
  const added = addPending(emptyPending('feat-x'), pass())
  // `--drop` removes it from the store and writes no decision, which is exactly
  // the absence a cheaper check would have called `claimed`.
  writePending(out, emptyPending('feat-x'))
  writeNotes(out, emptyNotes('feat-x'))
  assert.deepStrictEqual(passState(out, 'feat-x', added.code), { state: 'unknown' })
})

// Rule 4: a file we cannot read is a state we cannot establish.
test('an unreadable store is unknown, and reads nothing into it', () => {
  const out = scratch()
  fs.writeFileSync(path.join(path.dirname(out), 'feat-x.pending.json'), '{ not json')
  assert.deepStrictEqual(passState(out, 'feat-x', '418207'), { state: 'unknown' })
})

test('a spec that was never reviewed is unknown, not an error', () => {
  assert.deepStrictEqual(passState(scratch(), 'feat-x', '418207'), { state: 'unknown' })
})

// A code that is not six digits never reaches the files at all: it can only be
// junk or a probe, and answering it from disk would make this a scanner.
test('a malformed code is unknown without touching the store', () => {
  const out = scratch()
  const added = addPending(emptyPending('feat-x'), pass())
  writePending(out, added.pending)
  for (const bad of ['', null, 'abcdef', '41820', '../../etc', '4182070']) {
    assert.deepStrictEqual(passState(out, 'feat-x', bad), { state: 'unknown' }, String(bad))
  }
})

// The decision log gains a code WITHOUT losing what it already recorded — the
// history a reader sees on the next render is the same history.
test('a decision logged without a code is still a decision', () => {
  const notes = appendDecision(emptyNotes('feat-x'), { verdict: 'commit', at: '2026-09-16T09:47:09.089Z' })
  const last = notes.decisions[notes.decisions.length - 1]
  assert.strictEqual(last.verdict, 'commit')
  assert.strictEqual(last.note, null)
  assert.strictEqual(last.code, null, 'the field is present and honestly empty')
})
