'use strict'

/**
 * A REFUSAL MAY DECLARE THE WAY OUT OF ITSELF.
 *
 * A blocked plan and an armed gate both stop the operator, and both used to stop
 * them at a dead end: the reason said what was wrong, and reconstructing the
 * command that fixes it was left to whoever was reading. Met in the wild, that
 * produced an immediate request for a `--force` — which is the failure
 * `spec-planning.md` names, a gate whose exit nobody can reach being switched
 * off wholesale instead of answered.
 *
 * So the engine declares an `offer` beside the reason. Phase 1 is DATA ONLY:
 * nothing reads it yet, no picker exists, and no refusal behaves differently.
 * That is deliberate — it makes the stays-silent half below meaningful before
 * anything can act on a false positive.
 *
 * TWO KINDS, and the distinction is the whole safety argument.
 *   `satisfy` performs what the guard asked for. Nothing is weakened and
 *             nothing is recorded.
 *   `bypass`  steps past a guard that is still unsatisfied, so it is recorded.
 *
 * WHAT WOULD FOOL A READER OF THIS FILE: most refusals SHOULD carry no offer,
 * and an absent `offer` key is the correct, common answer. The tests that assert
 * absence are the load-bearing ones — a refusal that offered to clear work which
 * is not the operator's (a workbench another spec holds) would be a real defect
 * wearing a helpful face.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planTake } = require('../src/env/live.js')
const { gateState, GATE_BYPASS_OFFER, GATE_BYPASS_REASON, DISARMED_BY } = require('../src/env/review.js')

const SPEC = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt', type: 'feature', stack: 'worktree' }

// A context in which nothing is wrong; each test breaks exactly one thing.
const ctx = (over = {}) => ({
  primary: { onBase: true, branch: 'main' },
  base: 'main',
  clean: true,
  worktreeClean: true,
  worktreeExists: true,
  serverUp: null,
  migrationsHit: false,
  ...over,
})

const gate = (over = {}) => ({
  gate: { version: 1, spec: 'feat-x', armed: true, armedAt: '2026-01-01T00:00:00.000Z', phase: 1, log: [] },
  corrupt: false,
  present: true,
  required: true,
  ...over,
})

/* ==========================================================================
 * The offers this phase declares
 * ========================================================================== */

test('a dirty spec worktree offers the commit that would clear it', () => {
  const plan = planTake(SPEC, {}, ctx({ worktreeClean: false }))
  assert.strictEqual(plan.blocked, true)
  assert.deepStrictEqual(plan.offer, {
    kind: 'satisfy',
    label: 'Commit first, then go live',
    command: '/commit',
  })
})

test('an armed gate offers the recorded bypass', () => {
  const judged = gateState(gate())
  assert.strictEqual(judged.state, 'armed')
  assert.strictEqual(judged.offer.kind, 'bypass')
  // The label must not read as the easy path — the reader is stepping past a
  // guard, and the words are what tell them so.
  assert.match(judged.offer.label, /without reading the diff/)
  assert.match(judged.offer.label, /recorded as such/)
  assert.ok(judged.offer.command.includes(GATE_BYPASS_REASON))
})

test('the bypass records a fixed reason, distinct from anything typed', () => {
  // A skip normally carries the operator's words. This one is chosen from a
  // picker with nothing typed, so the record says that for itself.
  assert.match(GATE_BYPASS_REASON, /^none: /)
  assert.match(GATE_BYPASS_OFFER.command, /spec-env review skip/)
})

test('it mints no third disarm verb', () => {
  // A distinct reason string buys the only thing a third verb would have, and
  // the sidecar's vocabulary is versioned.
  assert.deepStrictEqual(DISARMED_BY, ['verdict', 'skip'])
})

/* ==========================================================================
 * Stays silent — the refusals that must declare nothing
 *
 * `.claude/rules/negative-checks.md` rule 3: the positive tests above prove an
 * offer can be declared; only these prove it is not declared at everyone else.
 * ========================================================================== */

test('STAYS SILENT: a workbench another spec holds is never offered up', () => {
  // The one that would be a real defect. Freeing it is that spec's operator's
  // decision, and `/spec-diff` §2b forbids parking someone else's session.
  const plan = planTake(SPEC, {}, ctx({ primary: { onBase: false, branch: 'feat/auth' }, inFlight: 'feat-auth' }))
  assert.strictEqual(plan.blocked, true)
  assert.ok(!('offer' in plan), 'no way out is offered for work that is not theirs')
})

test('STAYS SILENT: the primary checkout being dirty is not offered either', () => {
  // That tree holds whatever the operator has open — not this spec's phase work
  // — so committing it under this spec's ticket is the mis-stamping
  // `commit-trailers.md` exists to prevent.
  const plan = planTake(SPEC, {}, ctx({ clean: false }))
  assert.strictEqual(plan.blocked, true)
  assert.ok(!('offer' in plan))
})

test('STAYS SILENT: the redirections offer nothing, because they are not unblocks', () => {
  // A hotfix, a stateful spec and a migrations branch each send the reader to
  // `/spec-connect` instead. That is a different route, not a way through this
  // one, so none of them declares an offer.
  const cases = [
    ['hotfix', { ...SPEC, type: 'hotfix' }, ctx()],
    ['stateful', { ...SPEC, stack: 'docker' }, ctx()],
    ['migrations', SPEC, ctx({ migrationsHit: true })],
    ['no worktree', SPEC, ctx({ worktreeExists: false })],
    ['no dev server', SPEC, ctx({ serverUp: false })],
  ]
  for (const [name, spec, c] of cases) {
    const plan = planTake(spec, {}, c)
    assert.strictEqual(plan.blocked, true, `${name} still refuses`)
    assert.ok(!('offer' in plan), `${name} declares no offer`)
  }
})

test('STAYS SILENT: a plan that is not blocked carries no offer', () => {
  const plan = planTake(SPEC, {}, ctx())
  assert.strictEqual(plan.blocked, false)
  assert.ok(!('offer' in plan))
})

test('STAYS SILENT: every gate state but armed declares nothing', () => {
  const cases = [
    ['clear', gate({ gate: { version: 1, spec: 'feat-x', armed: false, armedAt: null, phase: null, log: [] } })],
    ['absent', gate({ present: false })],
    ['corrupt', gate({ corrupt: true })],
    ['opted out', gate({ required: false })],
    ['future version', gate({ gate: { version: 99, armed: true, armedAt: null, phase: null, log: [] } })],
  ]
  for (const [name, input] of cases) {
    const judged = gateState(input)
    assert.notStrictEqual(judged.state, 'armed', `${name} is not armed`)
    assert.strictEqual(judged.offer, undefined, `${name} declares no offer`)
  }
})
