'use strict'

/**
 * The half of the wait fix that lives in prose, and why it has to.
 *
 * A wait that dies is re-armed by the SKILL, because the process being killed
 * IS the engine — there is nothing left alive to hold the rule. So everything
 * testable was pushed down (the heartbeat, in `env-wait-heartbeat.test.js`) and
 * what remains is asserted the only way prose can be: the contract exists in one
 * place, it says the load-bearing things, and the four skills that wait point AT
 * it rather than restating it.
 *
 * ONE COPY, FOUR REFERENCES. The stack in this same rule is written once for
 * exactly this reason; four copies of a re-arm rule is how the four come to
 * disagree about when to stop.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const read = (...p) => fs.readFileSync(path.join(ASSETS, ...p), 'utf8')

const RULE = read('rules', 'spec-reports.md')
const WAITERS = ['spec', 'spec-next', 'spec-bug', 'no-spec']

/* ==========================================================================
 * The contract
 * ========================================================================== */

test('it re-arms on the SAME window, never a fresh one', () => {
  // A pass that arrived during the gap is still inside the original window;
  // re-arming on a new timestamp would strand exactly that pass.
  assert.match(RULE, /re-armed, silently, on the same window/)
  assert.match(RULE, /started\nagain on the \*\*same\*\* `--since`/)
  assert.match(RULE, /would strand exactly that pass/)
})

test('it re-arms silently', () => {
  assert.match(RULE, /Say nothing when you do it/)
  assert.match(RULE, /stream of non-events/)
})

test('a deliberate stop is not a death', () => {
  // Re-arming over one makes the wait unstoppable, which is worse than a wait
  // that stops.
  assert.match(RULE, /not a death/)
  assert.match(RULE, /unstoppable/)
  assert.match(RULE, /negative-checks\.md` rule 4/)
})

test('the bound is the age of the window, not a count of retries', () => {
  assert.match(RULE, /bounded by the age of the window, not by a count of retries/)
  assert.match(RULE, /\*\*12 hours\*\*/)
  // The trade is named rather than left as an accident.
  assert.match(RULE, /deliberately does not cover an overnight gap/)
})

test('past the bound the banner degrades to a sentence this file already defines', () => {
  assert.match(RULE, /press a verdict, then type `\/spec-reviewed`/)
  assert.match(RULE, /new \*\*state\*\* for an existing sentence, not a new sentence/)
  // The rule it is an instance of, unchanged.
  assert.match(RULE, /only promise a wait the transport can\ndeliver/)
})

test('it cites the evidence rather than asserting the behaviour', () => {
  assert.match(RULE, /three sessions lost theirs over one\nlunch break/)
  assert.match(RULE, /43 and 30 minutes/)
})

/* ==========================================================================
 * One copy, four references
 * ========================================================================== */

test('every skill that waits points at the rule', () => {
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.match(text, /re-armed on the same window/, `${skill} names the behaviour`)
    assert.match(text, /spec-reports\.md` carries the contract/, `${skill} points at the rule`)
  }
})

test('STAYS SILENT: no skill restates the bound', () => {
  // The number lives in one place. A skill repeating it is the drift this
  // reference exists to prevent.
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.doesNotMatch(text, /12 hours/, `${skill} does not carry its own copy of the bound`)
  }
})

test('STAYS SILENT: the no-timeout rule is untouched', () => {
  // Re-arming is not a timeout by another name — each individual wait still has
  // none, and the skills still say so.
  assert.match(RULE, /Give the wait no timeout/)
  for (const skill of WAITERS) {
    assert.match(read('skills', skill, 'SKILL.md'), /timeout/, `${skill} still discusses the timeout`)
  }
})
