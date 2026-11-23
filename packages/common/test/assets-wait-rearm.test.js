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

// The contract moved out of the always-loaded rules into the one skill file
// every waiting skill reads (feat-rules-budget). Its reasoning and the
// incidents behind it are kept in docs/rationale/spec-reports.md.
const RULE = read('skills', 'spec-diff', 'review-wait.md')
const WAITERS = ['spec', 'spec-next', 'spec-bug', 'no-spec']

/* ==========================================================================
 * The contract
 * ========================================================================== */

test('it re-arms on the SAME window, never a fresh one', () => {
  // A pass that arrived during the gap is still inside the original window;
  // re-arming on a new timestamp would strand exactly that pass.
  assert.match(RULE, /re-arm it on the \*\*same\*\* `--since`/)
  assert.match(RULE, /A pass that arrived during the gap is still\nin the window/)
})

test('it re-arms as quietly as the harness allows', () => {
  assert.match(RULE, /Say as little as possible/)
  // Where text is forced, it is one fixed line — never a status that grows.
  assert.match(RULE, /write\n  only `Still waiting for the verdict\.`/)
})

test('every fifth re-arm brings the banner back, from the engine\'s stack', () => {
  assert.match(RULE, /Every fifth re-arm/)
  assert.match(RULE, /`re-show: banner \(re-arm N\)`/)
  assert.match(RULE, /stack from the\n  `re-show:` lines/)
  // The verdict line, never reconstructed; never the table.
  assert.match(RULE, /dropped if\n  not/)
  assert.match(RULE, /Do not repeat the table/)
})

test('STAYS SILENT: the bare "say nothing" wording is gone', () => {
  // It was read as permitting a status line per re-arm, which is what piled up.
  assert.doesNotMatch(RULE, /Say nothing when you do it/)
})

test('a deliberate stop needs positive evidence; a bare kill is a death', () => {
  // The old default read the ambiguous kill as deliberate, which disabled the
  // re-arm in the one case it was shipped for.
  assert.match(RULE, /A deliberate stop has positive evidence/)
  assert.match(RULE, /called\nTaskStop, or the operator said to stop/)
  assert.match(RULE, /A bare killed-task notification is a\ndeath, not a stop/)
})

test('STAYS SILENT: the old ambiguity default is gone, not merely contradicted', () => {
  assert.doesNotMatch(RULE, /treat it as deliberate and leave it/)
})

test('the wait prefers a persistent watch primitive where the harness has one', () => {
  assert.match(RULE, /persistent watch primitive/)
  // Capability first, one named example.
  assert.match(RULE, /`Monitor` with `persistent: true`/)
  assert.match(RULE, /otherwise in the\n   background/)
})

test('the bound is the age of the window, not a count of retries', () => {
  assert.match(RULE, /Stop re-arming once the window is 12 hours old/)
})

test('past the bound the banner degrades to a sentence this file already defines', () => {
  assert.match(RULE, /press a verdict, then type `\/spec-reviewed`/)
  assert.match(RULE, /Only promise a wait the transport can deliver/)
})

/* ==========================================================================
 * One copy, four references
 * ========================================================================== */

test('every skill that waits points at the rule', () => {
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.match(text, /re-armed on the same window/, `${skill} names the behaviour`)
    assert.match(text, /review-wait\.md` carries the contract/, `${skill} points at the rule`)
    assert.match(text, /`re-show:` brings the banner back/, `${skill} names the re-show`)
  }
})

test('every skill that waits names the persistent-primitive preference', () => {
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.match(text, /persistent watch primitive/, `${skill} names the preference`)
  }
})

test('STAYS SILENT: no skill restates the primitive — the example lives in the rule', () => {
  // `Monitor`/`persistent: true` is spec-reports.md's one named example. A
  // skill repeating it is the second copy this file exists to prevent.
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.doesNotMatch(text, /persistent: true/, `${skill} defers the example to the rule`)
  }
})

test('STAYS SILENT: no skill restates the re-show cadence', () => {
  for (const skill of WAITERS) {
    const text = read('skills', skill, 'SKILL.md')
    assert.doesNotMatch(text, /fifth re-arm|every 5/i, `${skill} defers the cadence to the rule`)
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
  assert.match(RULE, /\*\*Pass no timeout\.\*\*/)
  for (const skill of WAITERS) {
    assert.match(read('skills', skill, 'SKILL.md'), /timeout/, `${skill} still discusses the timeout`)
  }
})
