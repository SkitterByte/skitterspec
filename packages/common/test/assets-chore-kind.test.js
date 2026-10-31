'use strict'

/**
 * The chore kind lives in prose across two assets, and prose is what drifts:
 * a later edit to either file could quietly drop the fourth kind while the
 * engine goes on resolving it. These pin the three properties the kind
 * depends on (spec feat-chore-kind-bug-bodies).
 *
 * 1. `/spec` PROPOSES the kind — there is no `/spec-chore` entry skill, and
 *    the proposal (not a new door) is the recorded decision.
 * 2. The planning rule names all four prefixes, so a reader grepping for the
 *    convention finds `chore-` beside the other three.
 * 3. A chore's gating default is on the record in the skill, because
 *    `none: not user-facing` is the decision reviewers argue with.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const asset = (...parts) =>
  fs.readFileSync(path.join(__dirname, '..', 'assets', ...parts), 'utf8')

test('/spec proposes feature-or-chore and never ships a /spec-chore door', () => {
  const skill = asset('skills', 'spec', 'SKILL.md')
  assert.match(skill, /Propose the kind/i, 'the proposal step exists')
  assert.match(skill, /chore-/, 'the chore- prefix is named')
  assert.doesNotMatch(skill, /\/spec-chore\b.*\n.*run/i, 'no chore entry skill is pointed at')
})

test('spec-planning names all four kinds, prefixes and header values', () => {
  const rule = asset('rules', 'spec-planning.md')
  for (const prefix of ['feat-<name>', 'chore-<name>', 'bug-<name>', 'hotfix-<name>']) {
    assert.ok(rule.includes(prefix), `${prefix} is listed`)
  }
  assert.match(rule, /> \*\*Type:\*\* Chore/, 'the Chore header value is shown')
})

test('a chore defaults its gating answer to none: not user-facing', () => {
  const skill = asset('skills', 'spec', 'SKILL.md')
  assert.match(skill, /none: not user-facing/, 'the chore gating default is recorded')
})
