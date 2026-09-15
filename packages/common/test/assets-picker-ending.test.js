'use strict'

/**
 * The report may end in a picker — and the guard that makes that safe.
 *
 * A review is the guard in front of an action, and the page has said so since
 * `feat-review-verdict`: four buttons, each naming what it does. The terminal
 * was the one place you could be standing where the ending was prose — a `Next`
 * row to retype.
 *
 * THE ONE THAT MATTERS is `nothing claims a pass without a pick`. `/spec-reviewed`
 * is user-only by harness enforcement because prose alone once failed to stop an
 * agent claiming a pass nobody asked it to. A picker keeps the PROPERTY that
 * made that safe — a person in the conversation chose — while routing around the
 * MECHANISM. That trade is deliberate, and it holds only while the condition
 * below is written down.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'assets', ...p), 'utf8')
const RULE = read('rules', 'spec-reports.md')
const NEXT = read('skills', 'spec-next', 'SKILL.md')
const DIFF = read('skills', 'spec-diff', 'SKILL.md')
const REVIEWED = read('skills', 'spec-reviewed', 'SKILL.md')

// THE ONE THAT MATTERS. Without this condition on the record, a later edit
// reads the picker as permission to go and fetch a waiting pass.
test('nothing may claim a pass without a pick, and the trade is explained', () => {
  assert.match(NEXT, /\*\*Nothing may claim a pass without a pick\.\*\*/)
  assert.match(NEXT, /a run that\s*\n?\s*shows no picker claims nothing/i)
  assert.match(NEXT, /picker nobody answered claims nothing/i)
  // The property/mechanism distinction is the whole argument. Lose it and the
  // picker reads as a loosening rather than a deliberate trade.
  assert.match(NEXT, /keeps the \*\*property\*\*/)
  assert.match(NEXT, /routing around the \*\*mechanism\*\*/)
})

test('the rule permits a picker after the block, and still bans prose', () => {
  assert.match(RULE, /\*\*One control may follow the block: a picker\.\*\*/)
  assert.match(RULE, /Prose after the block stays banned/)
  // The reasoning, so the next reader does not delete the picker as a violation
  // of the sentence three paragraphs above it.
  assert.match(RULE, /A\s*\n?\s*picker does not compete/i)
})

// The rule was stated and broken repeatedly, which makes it a missing
// DESTINATION rather than a missing prohibition.
test('the rule names where that content goes, not only that it may not follow', () => {
  assert.match(RULE, /\*\*if it is worth telling the reader, it is a row\.\*\*/)
  assert.match(RULE, /\*\*If it is not a row, it is not worth telling them\.\*\*/)
  assert.match(RULE, /^\| `Snags` \|/m, 'and the row exists')
  // Distinguished from the two fields it would otherwise be confused with.
  assert.match(RULE, /Not a caveat on the outcome/)
  assert.match(RULE, /not future work/)
})

test('both skills that offer the picker declare Snags', () => {
  assert.match(NEXT, /\*\*Fields:\*\*[^\n]*`Snags`/)
  assert.match(DIFF, /\*\*Fields:\*\*[^\n]*`Snags`/)
})

test('the four endings are named, with what each does', () => {
  assert.match(NEXT, /\| `Reviewed` \| Claims the waiting pass/)
  assert.match(NEXT, /\| `Commit` \| Runs the project's commit skill, and stops \|/)
  assert.match(NEXT, /\| `Commit & Continue` \| Commits, then `\/spec-next` — and \*\*stops there\*\* \|/)
  assert.match(NEXT, /\| `Discuss` \| Asks what is up; changes nothing \|/)
})

test('Reviewed is offered only when a pass is waiting', () => {
  assert.match(NEXT, /\*\*`Reviewed` only when a pass is actually waiting\.\*\*/)
  assert.match(NEXT, /the other three stand on their own/)
})

// The routing lives in one place. Two copies is how the two come to disagree —
// the same reason `/spec-reviewed` points at `/spec-diff` rather than copying.
test('neither skill restates the routing', () => {
  assert.match(NEXT, /\*\*Do not restate the routing\.\*\*/)
  assert.match(DIFF, /That section owns the wording; do not restate it/)
})

test('a pick supersedes an unclaimed pass, and says what it dropped', () => {
  assert.match(DIFF, /\*\*supersedes\*\* it/)
  assert.match(DIFF, /--drop <code>/)
  assert.match(DIFF, /\*\*Never carry both\.\*\*/)
  assert.match(DIFF, /\*\*Say what was dropped rather than dropping it quietly\.\*\*/)
  // Why it matters: the deliberate change of mind and the forgotten vote look
  // identical unless the report separates them.
  assert.match(DIFF, /someone who forgot they had voted has not/i)
})

// A picker at the END of a run cannot interrupt a chain that has already
// finished. This was feared as a cost and is not one — recorded so the fear is
// not re-litigated into a restriction.
test('the chaining cost is addressed rather than assumed', () => {
  assert.match(NEXT, /\*\*It does not break a chained run\.\*\*/)
  assert.match(NEXT, /by which point the chain has already\s*\n?\s*finished/i)
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). The picker narrows
// what `/spec-reviewed` is FOR; it must not have touched what makes it safe.
test('stays silent: spec-reviewed keeps its harness enforcement', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(REVIEWED)
  assert.match(fm[1], /^disable-model-invocation:\s*true$/m, 'the model still cannot invoke it')
  assert.match(REVIEWED, /not ergonomics here/i)
  assert.match(REVIEWED, /\*\*the model cannot invoke this skill\*\*/)
})

test('spec-reviewed says what it is for now, and why it was not deleted', () => {
  assert.match(REVIEWED, /## What this is for, now that the picker exists/)
  // The mechanical reason, which is the one that does not depend on taste.
  assert.match(REVIEWED, /\*\*A picker is consumed when the turn ends\.\*\*/)
  assert.match(REVIEWED, /read over lunch, a session cleared, a fresh terminal/i)
  assert.match(REVIEWED, /only claim path the harness itself enforces/i)
  assert.match(REVIEWED, /only paths that have the property/)
})

// The page and the terminal must not disagree about one verb.
test('Commit & Continue means the same thing in both places', () => {
  assert.match(NEXT, /\*\*stops there\*\*/)
  assert.match(REVIEWED, /`commit-continue` runs `\/spec-next` and \*\*stops there\*\*/)
  assert.match(REVIEWED, /never completes,\s*\n?\s*lands or tears anything down/i)
})
