'use strict'

/**
 * A phase with no `linear_issue_id` is not proof that the phase is new.
 *
 * The stamp lives in the phase file's frontmatter, so anything that rewrites
 * that file without preserving it — a hand edit, a bad merge, a tool that
 * overwrites rather than patches — silently unstamps a phase that already has a
 * sub-issue. The planner read that absence as "create", minted a second
 * sub-issue, and orphaned the first: observed on SKS-97, where phase 4 was
 * stamped SKS-101, lost its stamp to a file rewrite, and came back as SKS-102.
 * SKS-101 had to be cancelled by hand.
 *
 * The snapshot is the evidence the planner already holds: it still lists the
 * sub-issue ids from the last push. An unclaimed id sitting beside an unstamped
 * phase is the signature of a lost stamp, and `.claude/rules/negative-checks.md`
 * §4 says the unknown case routes to the harmless branch — do not mint.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planChanges, snapshotOf } = require('../src/compare.js')

const phase = (ref, id) => ({ ref, id, name: ref, goal: `goal ${ref}`, state: 'Todo' })

// Four phases, all stamped and pushed — the state before the file rewrite.
const PUSHED = [phase('01-a', 'SKS-98'), phase('02-b', 'SKS-99'), phase('03-c', 'SKS-100'), phase('04-d', 'SKS-101')]
const projection = (subIssues) => ({ description: 'd', status: 'In Progress', subIssues })

test('an unstamped phase beside an unclaimed snapshot id does not mint', () => {
  const snap = snapshotOf(projection(PUSHED))
  // Phase 4 lost its stamp; SKS-101 is still in the snapshot, claimed by nobody.
  const lost = [...PUSHED.slice(0, 3), phase('04-d', null)]
  const plan = planChanges(projection(lost), snap)
  assert.deepStrictEqual(
    plan.subIssues.create,
    [],
    'a lost stamp must not become a second sub-issue',
  )
})

test('the ambiguity is reported, not silently swallowed', () => {
  const snap = snapshotOf(projection(PUSHED))
  const lost = [...PUSHED.slice(0, 3), phase('04-d', null)]
  const plan = planChanges(projection(lost), snap)
  assert.ok(plan.unstamped, 'plan carries the unstamped phases')
  assert.deepStrictEqual(plan.unstamped.map((u) => u.ref), ['04-d'])
  assert.deepStrictEqual(plan.unstamped[0].candidates, ['SKS-101'], 'names the id it could be')
})

// --- stays silent: the cases that must still create ------------------------

test('a genuinely new phase on a fully-claimed snapshot still creates', () => {
  // Every snapshot id is claimed, so nothing was lost — the unstamped phase is
  // new, and refusing here would break adding a phase to a linked spec.
  const snap = snapshotOf(projection(PUSHED))
  const plan = planChanges(projection([...PUSHED, phase('05-e', null)]), snap)
  assert.deepStrictEqual(plan.subIssues.create.map((c) => c.ref), ['05-e'])
  assert.ok(!plan.unstamped, 'nothing ambiguous to report')
})

test('an unlinked spec creates every phase, as it always did', () => {
  // No snapshot at all: the first push of a new spec. There is no evidence of a
  // lost stamp because there was never a push.
  const plan = planChanges(projection([phase('01-a', null), phase('02-b', null)]), null)
  assert.deepStrictEqual(plan.subIssues.create.map((c) => c.ref), ['01-a', '02-b'])
  assert.ok(!plan.unstamped)
})

test('a deleted phase alone does not make the others ambiguous', () => {
  // An unclaimed snapshot id with NO unstamped phase is just a removed phase.
  const snap = snapshotOf(projection(PUSHED))
  const plan = planChanges(projection(PUSHED.slice(0, 3)), snap)
  assert.deepStrictEqual(plan.subIssues.create, [])
  assert.ok(!plan.unstamped)
})
