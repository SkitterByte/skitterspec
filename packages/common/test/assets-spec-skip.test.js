'use strict'

/**
 * `/spec-skip` — the gate's exit, as something a person types.
 *
 * The exit always existed: `skitterspec spec-env review skip "<reason>"`. What
 * it lacked was reachability. It was delivered to Claude inside a hook refusal,
 * in a form nobody retypes — and an operator who is blocked and cannot see the
 * way out does not answer the gate, they look for how to turn it off.
 *
 * WHAT THIS IS NOT. It is not a `--force`, and it is not a second exit: the two
 * things that discharge a phase's obligation are still a committing verdict and
 * a recorded skip. This is the same skip, with a shorter address.
 *
 * THE REASON IS STILL COMPULSORY, and the engine is what enforces it — a bare
 * skip refuses. Asserted here as the property the command must not soften,
 * because a reasonless skip is indistinguishable from nobody having looked,
 * which is what the whole gate exists to make visible.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const COMMAND = path.join(ASSETS, 'commands', 'spec-skip.md')
const TEXT = fs.readFileSync(COMMAND, 'utf8')
const HOOK = fs.readFileSync(path.join(ASSETS, 'hooks', 'review-gate.cjs'), 'utf8')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

// --- the marking -------------------------------------------------------------

test('it is user-only, for the same reason /allow-main is', () => {
  assert.match(TEXT, /^disable-model-invocation: true$/m)
  assert.match(TEXT, /lifts a guard aimed at Claude/)
})

test('it pre-executes one engine verb and relays it, like the other commands', () => {
  assert.match(TEXT, /^!`\{\{exec\}\} skitterspec spec-env review skip "\$ARGUMENTS"`$/m)
  assert.match(TEXT, /Relay the engine output above verbatim\. Add nothing and run nothing else\./)
  assert.match(TEXT, /^allowed-tools: Bash\(\{\{exec\}\} skitterspec spec-env review skip:\*\)$/m)
})

// --- what it must not soften -------------------------------------------------

test('it refuses with no reason, and says the refusal is the feature', () => {
  assert.match(TEXT, /refuses with no reason, and that refusal is the feature/)
  assert.match(TEXT, /do not supply one on the\noperator's behalf/)
})

test('it does not claim to be a third exit', () => {
  assert.match(TEXT, /exactly two exits/)
  assert.doesNotMatch(TEXT, /--force/)
})

// --- the refusal that sends you here -----------------------------------------

test('the hook names the command rather than the incantation', () => {
  assert.match(HOOK, /\/spec-skip "<reason>"/)
  assert.match(HOOK, /\/spec-reviewed/)
  // And it hands all three to the operator rather than picking one itself: a
  // hook that told Claude to skip would be the gate lifting itself.
  assert.match(HOOK, /Relay these to the operator \'? ?\+?\s*\'?rather than choosing one/)
})

test('the long form is still named, so the refusal works outside the harness too', () => {
  assert.match(HOOK, /skitterspec spec-env review skip "<reason>"/)
})

// --- the rule that lists the commands ---------------------------------------

test('spec-planning lists it with the other user-only commands', () => {
  assert.match(PLANNING, /`\/spec-skip`/)
})
