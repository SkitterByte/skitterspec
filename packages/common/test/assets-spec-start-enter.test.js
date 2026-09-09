'use strict'

/**
 * `/spec-start`'s worktree mode is prose telling the model to move the session
 * into the worktree it just provisioned. The claims below are the ones whose
 * loss is silent: a skill that drops the entry goes back to opening a terminal
 * nobody asked for, and one that drops the ORDER tells the model to make a call
 * that cannot succeed — `EnterWorktree` refuses a path that is already cwd, so
 * a bootstrap `cd` placed before it turns the whole feature into an error.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = (...p) =>
  fs.readFileSync(path.join(__dirname, '..', 'assets', ...p), 'utf8')

const SKILL = read('skills', 'spec-start', 'SKILL.md')
const PLANNING = read('rules', 'spec-planning.md')

test('worktree mode enters the worktree in this session', () => {
  assert.match(SKILL, /EnterWorktree/)
  assert.match(SKILL, /this session, no new window/)
})

test('the entry is ordered before bootstrap and housekeeping', () => {
  assert.match(SKILL, /immediately after `git worktree add`/)
  assert.match(SKILL, /before bootstrap and before the\s*\n?\s*step 4 housekeeping/)
})

test('the skill warns that a cd before the call makes it fail', () => {
  // The failure mode is an error, not a wasted step — the wording has to keep
  // saying so or the ordering above reads as mere tidiness and gets reordered.
  assert.match(SKILL, /Never `cd` into the worktree first/)
  assert.match(SKILL, /is the current working directory/)
})

test('both degrade cases are named, and chosen from cwd rather than caught', () => {
  assert.match(SKILL, /decide from cwd\*{0,2}\s*\n?\s*before calling/)
  assert.match(SKILL, /already inside a worktree/)
  assert.match(SKILL, /`EnterWorktree` is unavailable/)
})

test('the degrade path still hands off exactly as it used to', () => {
  // Everything the entered path retires has to survive on this branch, or a
  // harness without the tool is left with no way to reach the worktree at all.
  for (const kept of [/cd "<worktreePath>"/, /git -C <worktreePath>/, /open\.command/, /\/add-dir/]) {
    assert.match(SKILL, kept)
  }
})

test('the non-degraded path does not tell the operator to open a session', () => {
  // The bug this fixes: a start that ends by pointing at a terminal you have to
  // go and find. That instruction is legitimate ONLY under the hand-off branch.
  const handoff = SKILL.indexOf('When you cannot enter, hand off as before')
  assert.ok(handoff > 0, 'hand-off branch is missing')
  const entered = SKILL.slice(SKILL.indexOf('Enter the worktree'), handoff)
  assert.doesNotMatch(entered, /from a session in it/)
})

test('/spec-next resolution is declared unchanged', () => {
  // Loosening rule 2 is the tempting "fix" when a start lands somewhere else.
  // The skill has to keep saying it is not the lever.
  assert.match(SKILL, /`\/spec-next` is unchanged by this/)
  assert.match(SKILL, /nothing about\s*\n?its resolution is loosened/i)
})

test('the rules file no longer promises a terminal session per spec', () => {
  assert.doesNotMatch(PLANNING, /one\s*\n?terminal session per spec/)
  assert.match(PLANNING, /same terminal/)
})
