'use strict'

/**
 * `/spec-start`'s gate is prose describing engine behaviour, and the two drift
 * apart silently. These are the claims that would be WRONG rather than merely
 * stale — a skill that still promises a uniform refusal will have the model
 * relay a refusal the engine did not make, and a skill that drops the
 * foreign-work rule invites exactly the commit this gate exists to prevent.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'skills', 'spec-start', 'SKILL.md'),
  'utf8',
)

test('the gate still refuses to move work that is not the spec being started', () => {
  assert.match(SKILL, /Never get past the gate yourself/)
  assert.match(SKILL, /another\s*\n?spec's\*{0,2} work/)
})

test('the gate no longer claims one refusal whatever the cause', () => {
  // It was true until the engine learned to commit the spec you are starting;
  // left standing, it tells the model to refuse a tree the engine accepts.
  assert.doesNotMatch(SKILL, /same words whatever the cause/)
})

test('the gate names every engine outcome, in both modes', () => {
  for (const outcome of [/clean/, /every path is this spec's/, /some path is not/]) {
    assert.match(SKILL, outcome)
  }
  // Both modes appear as columns, because the last outcome differs between them.
  assert.match(SKILL, /\|\s*`worktree`\s*\|\s*`checkout`\s*\|/)
})

/**
 * THE CLAIM THAT WOULD BE WRONG, NOT MERELY STALE. The engine stopped refusing
 * foreign dirt in worktree mode; a skill still promising that refusal has the
 * model relay one the engine did not make, and send someone off to commit work
 * that was never in the way.
 *
 * The pair is the point: prose that dropped the checkout half would invite the
 * opposite mistake, where `git switch -c` really does carry the tree.
 */
test('the gate reports foreign dirt in worktree mode and refuses it in checkout', () => {
  const flat = SKILL.replace(/\s+/g, ' ')
  assert.match(flat, /reports the rest/i, 'worktree mode reports rather than refuses')
  assert.match(flat, /refuses, naming them/i, 'checkout mode still refuses')
  assert.match(flat, /git worktree add`? carries nothing/i, 'and says why the two differ')
  assert.match(flat, /keep the verdict `?✅/i, 'reporting it is not a caveat')
})

test('the gate says the commit is membership, not a judgement about importance', () => {
  assert.match(SKILL, /exactly-known set/)
  assert.match(SKILL, /not\*{0,2} a judgement/)
})

test('the gate carries the fork-point refusal', () => {
  assert.match(SKILL, /fork from/)
})
