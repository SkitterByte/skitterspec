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

// Steps the run wrote itself lived only in the conversation, so a `/clear` lost
// them and the next run listed a different set from the one the reader saw.
test('steps the skill had to write are saved to the phase file before asking', () => {
  assert.match(section, /Steps you had to write are saved first/)
  assert.match(section, /numbered sub-checkboxes \*\*before\*\* you\s+ask/)
})

// The report that broke came from `/commit`, not `/spec-next`, so the rule
// lives in the report contract and every skill's block is held to it.
const rule = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'rules', 'spec-reports.md'),
  'utf8',
)
const rows = rule.split('### Open manual steps are rows')[1]?.split('\n## ')[0] ?? ''

test('the report contract lists open manual steps in Next, a row each', () => {
  assert.ok(rows, 'an "Open manual steps are rows" subsection exists')
  assert.ok(
    rule.indexOf('### Open manual steps are rows') < rule.indexOf('## Field vocabulary'),
    'it sits with the other rules about Next',
  )
  assert.match(rows, /one per row/)
  assert.match(rows, /A count is not a list/)
  assert.match(rows, /Copy them from the phase file, never from an earlier message/)
  assert.match(rows, /every skill's block/)
  assert.match(section, /Open manual steps are rows/, '/spec-next points at the rule')
})

test('the example continues Next on label-less rows, and Next stays last', () => {
  const table = rows.split('\n').filter((l) => l.startsWith('|'))
  const next = table.findIndex((l) => l.startsWith('| **Next**'))
  assert.ok(next > 0, 'the example has a Next row')
  const after = table.slice(next + 1)
  assert.ok(after.length >= 2, 'steps follow the Next label')
  for (const l of after) assert.match(l, /^\| \| /, `a continuation row has a blank label: ${l}`)
})

// STAYS SILENT: with nothing manual open, Next is still one row — the
// amendment must not read as "Next always spans rows".
test('stays silent: a report with no open manual steps keeps a one-row Next', () => {
  assert.match(rows, /no\s+open manual steps keeps its one-row `Next`/)
})
