'use strict'

/**
 * The epic kind lives in `/spec`'s prose, and prose is what drifts. These pin
 * what the engine relies on (spec feat-epics): `/spec` proposes the kind with
 * no door of its own, names its prefix, writes it with no phase files, and
 * puts the order on the members rather than the epic.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const skill = () => fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', 'spec', 'SKILL.md'), 'utf8')

test('/spec proposes the epic kind and ships no /spec-epic door', () => {
  const text = skill()
  assert.match(text, /several specs with an order between them → epic/)
  assert.match(text, /`epic-` for an epic/, 'the epic- prefix is named')
  assert.match(text, /no `\/spec-chore`, `\/spec-issue` or `\/spec-epic`/)
})

test('an epic is written with no phase files, the one kind for which that is valid', () => {
  assert.match(skill(), /### Writing an epic[\s\S]*no\s+phase files[\s\S]*the one kind for which that is valid/)
})

test('the order lives on the members: Epic and Waits on are member headers', () => {
  const text = skill()
  assert.match(text, /> \*\*Epic:\*\* <epic-<name>/)
  assert.match(text, /> \*\*Waits on:\*\* <what must land first/)
  assert.match(text, /The order itself is \*\*not\*\* written in the epic/)
})
