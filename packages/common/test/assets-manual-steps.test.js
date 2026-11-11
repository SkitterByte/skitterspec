'use strict'

/**
 * `/spec-next` shows a phase's manual steps in the terminal and asks whether
 * they are done, rather than pointing at the phase file.
 *
 * It once met a phase of manual testing, said the next steps were manual and
 * named the file — the reader had to leave the terminal to learn what to do,
 * and nothing recorded what happened. The rule is prose, so what is checkable
 * is that the prose names the list, the three answers, and the stop.
 *
 * WHAT WOULD FOOL A LOOSER VERSION OF THIS FILE: asserting only that "manual"
 * appears. The skill already said "manual" before this rule existed — in the
 * manual-parallel path — so the assertions are on the shape, not the word.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const text = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'skills', 'spec-next', 'SKILL.md'),
  'utf8',
)
const section = text.split('### Manual steps')[1]?.split('\n## ')[0] ?? ''

test('spec-next has a manual-steps section inside §3', () => {
  assert.ok(section, 'a "### Manual steps" subsection exists')
  assert.ok(text.indexOf('### Manual steps') < text.indexOf('## 4. Record progress'))
})

test('the steps are listed verbatim, never only pointed at', () => {
  assert.match(section, /verbatim and numbered/)
  assert.match(section, /never only the phase file's path/)
  assert.match(section, /never fenced/)
})

test('it asks with exactly the three answers', () => {
  for (const answer of ['All done', 'Some failed', 'Not yet']) {
    assert.match(section, new RegExp(`\\*\\*${answer}\\*\\*`), answer)
  }
  assert.match(section, /\/spec-bug/, 'a defect is offered the bug door')
})

// The stays-silent half: an unconfirmed step must not end the phase, arm the
// gate, or ask for a verdict on work nobody finished.
test('an unconfirmed step leaves the phase open and arms nothing', () => {
  assert.match(section, /leaves the phase `🔄`/)
  assert.match(section, /no page, no arm, no wait/)
})
