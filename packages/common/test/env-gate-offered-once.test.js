'use strict'

/**
 * THE BYPASS IS SPENT BY BEING OFFERED, not by being taken.
 *
 * A reader who declines still saw it. Re-offering on the next refused commit is
 * how a bypass stops being a deliberate step and becomes the default — a
 * one-tap lift presented over and over is the `--force` this design rejected,
 * arriving one refusal at a time.
 *
 * PROSE CANNOT HOLD THIS. "Claude may raise it once, after the refusal" is a
 * rule that survives exactly as long as one conversation: a `/clear`, a
 * compaction or a fresh session loses the memory that it was already offered.
 * So the memory is the sidecar's, where it outlives all three.
 *
 * WHAT IS WITHHELD IS THE OFFER, NEVER THE GUARD, and that is the distinction
 * the tests below exist to pin. A second refused commit still refuses, still
 * names its exits in the text, and still exits non-zero for the hook. The
 * operator simply is not asked again.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  armGate,
  disarmGate,
  markGateOffered,
  gateState,
  emptyGate,
  GATE_VERSION,
} = require('../src/env/review.js')

const judged = (gate) => gateState({ gate, corrupt: false, present: true, required: true })
const armed = () => armGate(emptyGate('feat-x'), { at: '2026-01-01T00:00:00.000Z', phase: 1 })

/* ==========================================================================
 * Once per arming
 * ========================================================================== */

test('an armed gate offers the bypass, and says so once', () => {
  const gate = armed()
  assert.strictEqual(judged(gate).offer.kind, 'bypass')

  const marked = markGateOffered(gate, { at: '2026-01-01T00:05:00.000Z' })
  assert.strictEqual(marked.marked, true)
  assert.strictEqual(marked.gate.offeredAt, '2026-01-01T00:05:00.000Z')
  assert.strictEqual(judged(marked.gate).offer, undefined, 'not offered twice')
})

test('withholding the offer does not soften the refusal', () => {
  // The easy implementation gets this backwards and quietly stops refusing.
  const spent = markGateOffered(armed(), { at: '2026-01-01T00:05:00.000Z' }).gate
  const state = judged(spent)
  assert.strictEqual(state.state, 'armed', 'still armed')
  assert.strictEqual(state.reason, 'a phase is awaiting a verdict')
})

test('marking twice is inert — the first offer is the one that counts', () => {
  const once = markGateOffered(armed(), { at: '2026-01-01T00:05:00.000Z' }).gate
  const twice = markGateOffered(once, { at: '2026-01-01T09:00:00.000Z' })
  assert.strictEqual(twice.marked, false)
  assert.strictEqual(twice.gate.offeredAt, '2026-01-01T00:05:00.000Z', 'not moved')
})

test('a new arming gets a new offer', () => {
  // Each phase that ends is its own obligation, so the once-only rule is scoped
  // to the arming and not to the file.
  const spent = markGateOffered(armed(), { at: '2026-01-01T00:05:00.000Z' }).gate
  const cleared = disarmGate(spent, { at: '2026-01-01T01:00:00.000Z', by: 'verdict', reason: 'commit' }).gate
  const rearmed = armGate(cleared, { at: '2026-01-02T00:00:00.000Z', phase: 2 })

  assert.strictEqual(rearmed.offeredAt, null)
  assert.strictEqual(judged(rearmed).offer.kind, 'bypass', 'phase 2 is asked in its own right')
})

test('a re-render within the same phase does not hand the offer back', () => {
  // `review arm` is idempotent within a phase, and that must extend to this —
  // otherwise re-rendering the same page is a way to be asked again.
  const spent = markGateOffered(armed(), { at: '2026-01-01T00:05:00.000Z' }).gate
  const again = armGate(spent, { at: '2026-01-01T00:10:00.000Z', phase: 1 })
  assert.strictEqual(again.offeredAt, '2026-01-01T00:05:00.000Z')
  assert.strictEqual(judged(again).offer, undefined)
})

/* ==========================================================================
 * Stays silent
 * ========================================================================== */

test('STAYS SILENT: a gate written before this field existed reads as never-offered', () => {
  // These sidecars are gitignored, so there is no fleet to migrate — the field
  // is additive and the version does not move. Absent must mean "not yet
  // offered", which is the harmless reading.
  const old = { version: GATE_VERSION, spec: 'feat-x', armed: true, armedAt: '2026-01-01T00:00:00.000Z', phase: 1, log: [] }
  assert.strictEqual(old.offeredAt, undefined)
  assert.strictEqual(judged(old).offer.kind, 'bypass')
})

test('STAYS SILENT: the version is unchanged, so no reader is locked out', () => {
  assert.strictEqual(GATE_VERSION, 1)
  assert.strictEqual(emptyGate('feat-x').version, 1)
})

test('STAYS SILENT: marking an unarmed gate changes nothing', () => {
  // No obligation means nothing to have offered a way out of.
  const clear = emptyGate('feat-x')
  const marked = markGateOffered(clear, { at: '2026-01-01T00:05:00.000Z' })
  assert.strictEqual(marked.marked, false)
  assert.strictEqual(marked.gate.offeredAt, null)
})

test('STAYS SILENT: a gate we cannot read offers nothing, and still accuses nobody', () => {
  // Both cannot-tells go the harmless way — `.claude/rules/negative-checks.md`
  // rule 4 — and an unreadable sidecar must not produce an offer any more than
  // it produces a refusal.
  for (const input of [
    { gate: armed(), corrupt: true, present: true, required: true },
    { gate: armed(), corrupt: false, present: true, required: false },
  ]) {
    const state = gateState(input)
    assert.strictEqual(state.state, 'unknown')
    assert.strictEqual(state.offer, undefined)
  }
})
