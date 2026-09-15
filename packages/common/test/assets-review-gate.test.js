'use strict'

/**
 * The gate, as the skills carry it.
 *
 * The engine half is `env-review-gate.test.js`; this is the wiring — which
 * skill arms it, which refuses on it, and which must never do either. Every one
 * of these is a regression guard against an edit that would look like tidying:
 * a render that "helpfully" arms, a refusal that grows into a count, or a
 * cannot-tell that starts being mentioned.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skill = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const NEXT = skill('spec-next')
const DIFF = skill('spec-diff')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

// --- who arms it ------------------------------------------------------------

test('/spec-next arms the gate when a phase ends', () => {
  assert.match(NEXT, /spec-env review arm <spec> --phase <n>/)
  // At the one moment that means something: the page is rendered, the tests are
  // green, and nothing is committed yet.
  const five = NEXT.slice(NEXT.indexOf('## 5.'), NEXT.indexOf('## 6.'))
  assert.match(five, /spec-env review arm/, 'armed in the phase-end step, not elsewhere')
  assert.match(five, /never fatal/i, 'a phase is still built when arming could not happen')
})

// THE COMMON CASE MUST STAY FREE. Reading your own half-finished work is what
// /spec-diff exists for, and if that armed a gate then looking would owe you a
// verdict on what you looked at.
test('/spec-diff never arms it, and says why', () => {
  assert.match(DIFF, /this skill never arms the gate/i)
  assert.match(DIFF, /must not create an obligation/i)
  assert.doesNotMatch(DIFF, /spec-env review arm/, 'it does not run the verb at all')
})

test('/spec-diff keeps its no-preconditions rule intact', () => {
  // The gate is a refusal in /spec-next, never a precondition here — otherwise
  // the one skill that must answer at any moment would start refusing.
  const three = DIFF.slice(DIFF.indexOf('## 3.'), DIFF.indexOf('## 4.'))
  assert.match(three, /has no preconditions and must never grow one/i)
  assert.match(three, /is where that refusal lives/i, 'it points at /spec-next rather than copying it')
})

// --- who refuses on it ------------------------------------------------------

test('/spec-next refuses to build the next phase while a verdict is owed', () => {
  const two = NEXT.slice(NEXT.indexOf('## 2.'), NEXT.indexOf('## 3.'))
  assert.match(two, /spec-env review gate <spec> --json/)
  assert.match(two, /state: "armed"/)
  assert.match(two, /\*\*Refuse, with the `⏸` block\*\*/)
})

test('the refusal names every way out, including moving on', () => {
  const two = NEXT.slice(NEXT.indexOf('## 2.'), NEXT.indexOf('## 3.'))
  assert.match(two, /send a verdict/i)
  assert.match(two, /\/spec-reviewed/)
  assert.match(two, /spec-env review skip "<reason>"/)
  // A gate with no exit gets switched off wholesale instead of answered, so the
  // exit being one command — and one of them being "I am moving on" — is the
  // thing that keeps this a push rather than a wall.
  assert.match(two, /one command/i)
})

// --- what it is NOT ---------------------------------------------------------

test('the refusal counts nothing, and says so where a later edit would look', () => {
  const two = NEXT.slice(NEXT.indexOf('## 2.'), NEXT.indexOf('## 3.'))
  assert.match(two, /counts nothing/i)
  assert.match(two, /not a\s*\n?\s*tally of ticked boxes/i)
  // The marks rule is unchanged, and stated in the canonical place.
  assert.match(PLANNING, /\*\*the marks are information, never a gate\*\*/)
})

// STAYS SILENT (`negative-checks.md` rule 3). Cannot-tell is the ordinary state
// of most repos — no config, an unreadable sidecar, an unresolvable spec — and
// a line about a gate nobody armed is an accusation against a healthy repo.
test('cannot-tell carries on, in silence', () => {
  const two = NEXT.slice(NEXT.indexOf('## 2.'), NEXT.indexOf('## 3.'))
  assert.match(two, /state: "unknown"/)
  assert.match(two, /also carries on, in silence/i)
  assert.match(two, /Do not mention it/i)
  assert.match(two, /accusation against a healthy repo/i)
})

// --- documented where the workflow is documented ----------------------------

test('the canonical rules file describes the gate and its exits', () => {
  assert.match(PLANNING, /\*\*The gate — a phase that ended owes an answer\.\*\*/)
  assert.match(PLANNING, /spec-env review skip "<reason>"/)
  assert.match(PLANNING, /review\.required: false/)
  // On by default is the whole design decision, so it is written down rather
  // than left to be inferred from a config default.
  assert.match(PLANNING, /on by default wherever isolation is configured/i)
})
