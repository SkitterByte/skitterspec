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
// So these tests hold the OFFER's shape: both endings real, the decline
// undamaged, and the build reached only the explicit way.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const SKILL = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-start', 'SKILL.md'), 'utf8')
const STEP6 = SKILL.slice(SKILL.indexOf('## 6. Build phase 1'), SKILL.indexOf('## Opt-outs'))

test('worktree mode offers the build rather than announcing it', () => {
  assert.match(STEP6, /offer it, then do what they say/i)
  assert.match(STEP6, /build phase 1 now from here, or hand off/i)
})

// A "question" with only one real answer is a notification. The decline has to
// carry its own outcome, or the reader treats it as a formality to click past.
test('the decline is a real ending, described in full', () => {
  assert.match(STEP6, /Hand off/)
  assert.match(STEP6, /from a session in\s*\n?\s*it/, 'it still says where to run /spec-next')
  assert.match(STEP6, /the ending `\/spec-start` has always had/)
  assert.match(STEP6, /perfectly good place to leave things/i)
})

test('it says why the build gets its own yes', () => {
  // Without the reason this reads as a redundant prompt and gets optimised away.
  assert.match(STEP6, /Provisioning is cheap and\s*\n?reversible/i)
  assert.match(STEP6, /one yes should not cover both/i)
  assert.match(STEP6, /context budget/i, 'the other real reason to start fresh')
})

test('the build path is the explicit flag, never a bare name argument', () => {
  assert.match(STEP6, /`\/spec-next --worktree <worktreePath>`/)
  assert.match(STEP6, /Never reach for a bare name\s*\n?argument instead/i)
  assert.match(STEP6, /never build the phase inline here/i)
})

test('it still says a bare /spec-next from here would refuse, and rightly', () => {
  assert.match(STEP6, /would refuse/)
  assert.match(STEP6, /not a way around that refusal/i)
  assert.match(STEP6, /not a path anything guessed/i)
})

test('the offer names what the build does about leaking', () => {
  assert.match(STEP6, /records a baseline/i)
  assert.match(STEP6, /nothing reached the primary checkout/i)
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
})
