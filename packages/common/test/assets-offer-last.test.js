'use strict'

/**
 * The phase-end offer has to be an offer.
 *
 * `/spec-next` step 5 has rendered the page and printed a link for a long time,
 * and it was never once taken up: it emitted two quoted lines into the tail of a
 * long report, under the test counts, and the report then closed on "commit this
 * first". Nothing in it was addressed to anyone, and the last instruction the
 * reader got was to move on.
 *
 * So these tests are about SHAPE and POSITION rather than presence — presence
 * was never the problem. The offer is prose, it ends in a question, and it is
 * the last thing in the report. Every one of them is a regression guard: each
 * asserts something a well-meaning later edit would undo while thinking it was
 * tidying up.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const NEXT = skillText('spec-next')

test('the offer is prose ending in a question, not a block of engine output', () => {
  assert.match(NEXT, /Want a written review of it before you commit\?/)
  assert.match(NEXT, /Write it as prose ending in a question/)
})

test('the position is stated, and stated as the point of it', () => {
  assert.match(NEXT, /put it LAST/)
  assert.match(NEXT, /after the\s*\n?`Next: phase N` line/)
  assert.match(NEXT, /being\s*\n?last is the whole fix/)
})

// The two steps have to agree, because step 5 writes the offer and step 6 writes
// the report it is the end of. They disagreed before: step 5 said "one line",
// step 6 said the report ends on which phase is next.
test('step 6 agrees about what comes last', () => {
  const six = NEXT.slice(NEXT.indexOf('## 6. Report'))
  assert.match(six, /Then step 5's offer, and nothing after it/)
  assert.match(six, /what was\s*\n?built, the test result, `Next: phase N`, then the page and the question/)
})

test('a later edit that reorders it back is named a regression', () => {
  assert.match(NEXT, /Never bury it and never reorder it back/)
  assert.match(NEXT, /read as a\s*\n?regression rather than tidying/)
})

test('the offer does not block the run', () => {
  assert.match(NEXT, /Non-blocking, deliberately/)
  assert.match(NEXT, /Do not end your turn waiting on the answer/)
  assert.match(NEXT, /`\/commit && \/spec-next` typed as one line/)
})

test('the clickable URL is still what gets relayed, not the bare path', () => {
  assert.match(NEXT, /Relay the \*\*`open:`\*\* line/)
  assert.match(NEXT, /a path is not\s*\n?clickable in any terminal/)
})

// --- the rules that were already load-bearing, still there -----------------

test('the render still happens after green and before the commit', () => {
  assert.match(NEXT, /\*\*after\*\* the tests pass and\s*\n?\*\*before\*\* the commit/)
})

test('the review is never written unasked and never published unprompted', () => {
  assert.match(NEXT, /\*\*Never write the review unasked\*\*, and \*\*never publish\*\*/)
  assert.match(NEXT, /always something\s*\n?someone asks for/)
})

// A phone cannot open file://, and that complaint is the ask — it should not be
// met by a second copy of the publishing rules living here.
test('an operator who cannot open the file:// link is pointed at the skill that publishes', () => {
  assert.match(NEXT, /A `file:\/\/` link is no use on a phone/)
  assert.match(NEXT, /`\/spec-diff` §6 owns how/)
})

test('a failed render is one line, never fatal', () => {
  assert.match(NEXT, /\*\*Never fatal\.\*\* A failed render/)
  assert.match(NEXT, /the phase is still done/)
})

// --- stays silent -----------------------------------------------------------

// The offer only exists because there is a worktree to read. A project without
// isolation is not misconfigured, and must not be told about a feature it does
// not have — an explanation of an absence is the noise version of a false
// accusation (`.claude/rules/negative-checks.md`).
test('a project with no isolation gets no offer and no explanation of why', () => {
  assert.match(NEXT, /Only when the project has per-spec isolation/)
  assert.match(NEXT, /skip the whole step in silence rather\s*\n?than explaining an absence/)
})

test('the offer is not turned into a gate on anything', () => {
  const step5 = NEXT.slice(NEXT.indexOf('## 5.'), NEXT.indexOf('## 6.'))
  assert.doesNotMatch(step5, /do not commit until/i)
  assert.doesNotMatch(step5, /must be reviewed/i)
  assert.doesNotMatch(step5, /\brequire[sd]?\b.*review/i)
})
