'use strict'

/**
 * `/spec-epic-next` (spec feat-spec-epic-commands, phase 2): it names the epic
 * member that can start now and starts nothing itself, and `/spec-complete` on
 * a member points at it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = path.join(__dirname, '..', 'assets', 'skills')
const SKILL = fs.readFileSync(path.join(SKILLS, 'spec-epic-next', 'SKILL.md'), 'utf8')
const COMPLETE = fs.readFileSync(path.join(SKILLS, 'spec-complete', 'SKILL.md'), 'utf8')

test('/spec-epic-next reads the engine rather than re-deriving what can start', () => {
  assert.match(SKILL, /skitterspec epic status \[<epic>\] --json/)
  assert.match(SKILL, /Read its `steps`, `groups` and `freeLanes`/)
  assert.match(SKILL, /`where` is `new-tab`/)
})

test('/spec-epic-next is model-invocable', () => {
  assert.doesNotMatch(SKILL, /^disable-model-invocation:/m)
})

test('stays silent: /spec-epic-next starts, provisions and moves nothing', () => {
  const body = SKILL.replace(/^---[\s\S]*?---/, '')
  assert.doesNotMatch(body, /spec-env up|spec-env bootstrap/)
  assert.doesNotMatch(body, /^\s*cd /m)
  assert.match(SKILL, /It writes nothing, provisions nothing, and moves no\nsession/)
  assert.match(SKILL, /\*\*in a new tab\*\*/)
})

test('several startable members are a picker, never a guess, and clashes stay listed', () => {
  assert.match(SKILL, /Offer a picker[\s\S]*\*\*never choose for them\*\*/)
  assert.match(SKILL, /listed\n\*\*with\*\* its clash, not filtered out/)
})

test('the refusals: no free lane, and nothing ready — an unreadable wait included', () => {
  assert.match(SKILL, /\*\*No free lane\.\*\*[\s\S]*?Stop with\n?\s*`⏸`/)
  assert.match(SKILL, /\*\*Nothing ready\.\*\*[\s\S]*?Stop with `⏸`/)
  assert.match(SKILL, /never in `ready`/)
})

test('/spec-complete on an epic member names /spec-epic-next, and only that', () => {
  assert.match(COMPLETE, /`> \*\*Epic:\*\*`[\s\S]{0,200}`Next` is \*\*`\/spec-epic-next`\*\*/)
  assert.match(COMPLETE, /Name the command and nothing else/)
})
