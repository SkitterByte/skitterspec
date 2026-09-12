'use strict'

// `/spec-start` in worktree mode ends with a QUESTION, not a decision.
//
// The asymmetry this closes is old: `checkout` mode has always carried straight
// on into `/spec-next`, while `worktree` mode stopped and handed off — not
// because the modes should differ, but because the machinery that bridged them
// (a live-take, then a session move) kept being removed for good reasons. The
// bridge now is an explicit `--worktree` path, and the thing guarding it is that
// the operator is asked before it is used.
//
// The bridge is now the session itself: step 3's `cd` leaves it in the worktree,
// so both endings land there and the build is a bare `/spec-next`. What the offer
// still guards is that provisioning's yes does not silently buy a phase build.
//
// So these tests hold the OFFER's shape: both endings real, the decline
// undamaged, and the build never taken without being asked for.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const SKILL = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-start', 'SKILL.md'), 'utf8')
const STEP6 = SKILL.slice(SKILL.indexOf('## 6. Build phase 1'), SKILL.indexOf('## Opt-outs'))

test('worktree mode offers the build rather than announcing it', () => {
  assert.match(STEP6, /offer it, then do what they say/i)
  assert.match(STEP6, /build phase 1 now\?/i)
  // The question no longer offers to hand off, because there is nobody to hand
  // to — the operator is already standing in the worktree.
  assert.doesNotMatch(STEP6, /or hand off to a session in the worktree/i)
})

// A "question" with only one real answer is a notification. The decline has to
// carry its own outcome, or the reader treats it as a formality to click past.
test('the decline is a real ending, described in full', () => {
  assert.match(STEP6, /\*\*Stop here\*\*/)
  assert.match(STEP6, /perfectly good place to leave things/i)
  // The decline used to cost the operator a session move. It costs nothing now,
  // and saying so is what stops it reading as the discouraged answer.
  assert.match(STEP6, /Nothing has to be\s*\n?\s*reopened/i)
  // The clause widened rather than went: the decline is durable across sessions
  // now, not merely across an hour of this one, because /spec-next rule 4
  // resolves the sole provisioned spec from anywhere.
  assert.match(STEP6, /an hour later[\s\S]{0,60}?does exactly/i)
  assert.match(STEP6, /from this\s*\n?\s*session or a fresh one/i)
})

test('it says why the build gets its own yes', () => {
  // Without the reason this reads as a redundant prompt and gets optimised away.
  assert.match(STEP6, /Provisioning is cheap and\s*\n?reversible/i)
  assert.match(STEP6, /one yes should not cover both/i)
  assert.match(STEP6, /context budget/i, 'the other real reason to start fresh')
})

test('the build path is a BARE /spec-next, and says why bare is right', () => {
  // The inversion this spec is for. It used to be `--worktree <path>`, because a
  // session in the primary checkout could not resolve anything; the session is in
  // the worktree now, so rule 2 answers and the flag would be noise.
  assert.match(STEP6, /carry on into a bare \*\*`\/spec-next`\*\*/)
  assert.match(STEP6, /rule 2 resolves this spec/)
  assert.match(STEP6, /nothing\s*\n?\s*passed and nothing guessed/i)
})

test('--worktree survives as the exception, not the normal path', () => {
  // Removing it would be unrelated churn: it is still the only way to build a
  // spec the session is not standing in, including when the `cd` did not take.
  assert.match(STEP6, /`--worktree <path>` is still there/)
  assert.match(STEP6, /the\s*\n?\s*exception rather than the normal path/i)
  assert.match(STEP6, /the `cd` did not take/)
})

test('the refusal is still respected — --worktree is not a way around it', () => {
  // The claim narrowed rather than went: a bare /spec-next resolves from here
  // now, but only because the SESSION moved. The rules did not loosen, and an
  // explicit path is still not a guess.
  assert.doesNotMatch(STEP6, /a bare\s*\n?`?\/spec-next`? typed from this session would refuse/i)
  assert.match(STEP6, /not a way around the refusal/i)
  assert.match(STEP6, /not a path\s*\n?anything guessed/i)
})

test('the offer no longer promises a leak check it cannot make', () => {
  // The baseline + --assert-primary-clean pair belongs to the `--worktree` path
  // in /spec-next. An in-session build does not run it, so step 6 must stop
  // advertising it — a promised check that never runs is worse than none.
  assert.doesNotMatch(STEP6, /records a baseline/i)
  assert.doesNotMatch(STEP6, /nothing reached the primary checkout/i)
})

test('--plan never reaches the offer', () => {
  assert.match(STEP6, /On \*\*`--plan`\*\* this step\s*\n?does not run at all/i)
})

test('checkout mode is untouched — it carries straight on, unasked', () => {
  assert.match(STEP6, /`checkout` mode — carry straight on into `\/spec-next`/)
  assert.match(STEP6, /Do not stop and ask the operator to run it/)
})

// The offer must not become a second PROVISIONING path. Worktree mode still has
// exactly one of those; what step 6 adds is a choice about what happens after it
// is finished, which is why `assets-spec-start-one-path.test.js` still passes.
test('the offer comes after provisioning, not instead of a step of it', () => {
  const provision = SKILL.indexOf('**One path.')
  const housekeep = SKILL.indexOf('## 4. Move the spec into development')
  const offer = SKILL.indexOf('offer it, then do what they say')
  assert.ok(provision !== -1 && housekeep !== -1 && offer !== -1)
  assert.ok(provision < housekeep, 'provisioning first')
  assert.ok(housekeep < offer, 'the spec is in flight before anything is offered')
})

test('step 3 hands to step 6 rather than ending the skill itself', () => {
  // Two places telling the operator what happens next is how they drift apart.
  const step3 = SKILL.slice(SKILL.indexOf('### `worktree` mode'), SKILL.indexOf('### `checkout` mode'))
  assert.match(step3, /What happens next is step 6/)
  assert.doesNotMatch(step3, /say to run \*\*`\/spec-next`\*\* from a session/)
  // Step 3 may only send the operator elsewhere on the one failure it detects.
  assert.match(step3, /fall back\s*\n?\s*to the stop-here ending in step 6/)
})
