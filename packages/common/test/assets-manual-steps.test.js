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
  assert.match(section, /leave the phase `🔄`/)
  assert.match(section, /no page, no arm, no wait/)
})

// Steps the run wrote itself lived only in the conversation, so a `/clear` lost
// them and the next run listed a different set from the one the reader saw.
test('steps the skill had to write are saved to the phase file before asking', () => {
  assert.match(section, /Steps you had to write are saved first/)
  assert.match(section, /`## Manual steps` section, creating it if\s+there is none, \*\*before\*\* you list them/)
  // Each script in a fenced block, so the ticket renders it copyable.
  assert.match(section, /each\s+script goes in a fenced block under its step/)
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

// Seen in ereqs, 2026-11-24: the run printed the steps and asked "All done /
// Some failed / Not yet" in the same turn. The harness's question dialog hid
// the text before it, so the operator saw the question with no steps, and the
// work was not yet reachable (not live, not on main), so there was nothing to
// test. The first listing therefore ends the turn and asks nothing; the
// question waits for the operator to come back.
//
// WHAT WOULD FOOL THIS: a section that adds "ends the turn" somewhere but still
// tells the run to "Then ask" straight after listing. The ordering assertion
// below is on the instruction that introduces the answers, not on a phrase.
test('the first listing ends the turn and asks no question', () => {
  assert.match(section, /ends the turn/)
  assert.match(section, /asks\s+no\s+(picker\s+)?question/)
  assert.doesNotMatch(section, /Then ask one question/, 'no ask straight after listing')
  const listed = section.indexOf('verbatim and numbered')
  const answers = section.indexOf('**All done**')
  const ends = section.indexOf('ends the turn')
  assert.ok(listed >= 0 && ends > listed && answers > ends, 'list, end the turn, and only then the answers')
})

test('Next names how to reach the work before the steps', () => {
  assert.match(section, /`\/spec-live`/)
  assert.match(section, /`\/spec-to-main`/)
  assert.match(section, /migration/)
})

test('the operator\'s reply resolves it, or a later run asks', () => {
  assert.match(section, /next message/)
  assert.match(section, /come back/)
})

test('a picker carries the steps in its question text', () => {
  assert.match(section, /inside the question text/)
  assert.match(section, /never only in the text before it/)
})

// Same incident: the stop rendered no page, and left the built code
// uncommitted, so `/spec-live` refused a dirty worktree.
test('the stop renders a page with the manual set, and arms nothing', () => {
  assert.match(section, /--buttons manual/)
  assert.match(section, /does not arm/)
})

test('Next commits the built code before it reaches for the work', () => {
  assert.match(section, /`\/commit`, then `\/spec-live`/)
})

// feat-manual-steps-on-ticket: the `## Manual steps` section is the marker the
// tracker projects, so the skills that write phase files write it there, and
// `/spec-next` reads it first while legacy phases keep the judgment.
const asset = (...p) => fs.readFileSync(path.join(__dirname, '..', 'assets', ...p), 'utf8')

test('spec-next reads ## Manual steps first, and falls back to judgment', () => {
  assert.match(section, /`## Manual steps` section is where they are read from first/)
  assert.match(section, /falls back\s+to \*\*judgment\*\*/)
})

test('the /spec phase template carries a ## Manual steps section with a fenced script', () => {
  const spec = asset('skills', 'spec', 'SKILL.md')
  assert.match(spec, /## Manual steps\n\n- \[ \] <a step only a person can do/)
  assert.match(spec, /An \*\*Issue\*\* spec's steps all go\s+there/)
})

test('/spec-bug puts manual steps in a phase file, where they are read', () => {
  assert.match(asset('skills', 'spec-bug', 'SKILL.md'), /go under `## Manual steps` in a phase file/)
})

test('spec-format documents the section, and keeps inline steps valid', () => {
  const fmt = asset('rules', 'spec-format.md')
  assert.match(fmt, /^## Manual steps$/m)
  assert.match(fmt, /inline among a phase's tasks, as older specs do, stay\s+valid/)
})
