'use strict'

// `/spec-start` brings the review server up from the PRIMARY CHECKOUT, first.
//
// Phases 1 and 2 made a worktree-started server survive its worktree and stop
// lying about its bind. This step makes a worktree-started server unlikely in
// the first place: the one moment `/spec-start` is guaranteed to be standing in
// the primary checkout is before it provisions, and that is where the daemon
// should be born.
//
// The ordering is the whole content of the step, so it is what these tests
// hold. A step that reads correctly but sits after the `cd` would start the
// server from the worktree again and pass a prose-only check.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const SKILL = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-start', 'SKILL.md'), 'utf8')

const at = (needle) => {
  const i = SKILL.indexOf(needle)
  assert.notStrictEqual(i, -1, `the skill should contain ${JSON.stringify(needle)}`)
  return i
}

test('the skill has a review-server step, and names the engine command', () => {
  assert.match(SKILL, /review server/i, 'it says what is being started')
  assert.match(SKILL, /skitterspec spec-env review serve/, 'it names the command, not a description of it')
})

test('the server comes up BEFORE the worktree is provisioned', () => {
  // The defect this closes is entirely one of ordering. Run after the `cd` and
  // the daemon is born in the worktree — exactly what phases 1 and 2 spent
  // their time repairing.
  const server = at('spec-env review serve')
  const provision = at('## 3. Build its branch')
  assert.ok(
    server < provision,
    'the review-server step must come before "## 3. Build its branch"',
  )
})

test('it says which checkout the server is started from', () => {
  // "Before provisioning" is only meaningful because that is when the session
  // is still standing in the primary checkout. If the reason goes, someone
  // reorders the step and the ordering test above is the only thing left.
  const step = SKILL.slice(at('spec-env review serve') - 1200, at('## 3. Build its branch'))
  assert.match(step, /primary checkout/i, 'it names where the server is started from')
})

test('it is never fatal and never a gate', () => {
  const step = SKILL.slice(at('spec-env review serve') - 1200, at('## 3. Build its branch'))
  assert.match(step, /never fatal/i, 'a failed start must not stop a spec being started')
  assert.match(step, /carr(y|ies) on|provisioning (still )?carries on/i)
})

test('it says nothing when there is nothing to say', () => {
  // The report contract forbids narration, and a line per `/spec-start` about a
  // daemon that was already up is exactly that.
  const step = SKILL.slice(at('spec-env review serve') - 1200, at('## 3. Build its branch'))
  assert.match(step, /already (up|running)/i, 'adoption is the quiet case')
})

test('a project that never serves gains no step at all', () => {
  // Same rule as every other opt-in seam in these skills: with the config
  // absent there must be no trace of the feature.
  const step = SKILL.slice(at('spec-env review serve') - 1200, at('## 3. Build its branch'))
  assert.match(step, /env\.config\.json|isolation/i, 'the step is conditional on isolation')
})
