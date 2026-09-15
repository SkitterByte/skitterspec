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
 * was never the problem. Every one of them is a regression guard: each asserts
 * something a well-meaning later edit would undo while thinking it was tidying
 * up.
 *
 * THE ANCHOR HAS MOVED ONCE, and that is worth reading before moving it again.
 * The offer used to be prose AFTER the report; it is now the `Review` row
 * INSIDE it, because the report became a table and nothing follows a table. The
 * invariant did not change — the offer is findable, it is addressed to someone,
 * and the link and the question are not separated. If a future change finds
 * itself WEAKENING those three rather than re-pointing them, that is the signal
 * the invariant has stopped being real, and the honest move is to delete the
 * guard rather than keep loosening its regexes.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const NEXT = skillText('spec-next')

test('the offer is addressed to someone, in whichever shape it takes', () => {
  // ASKING IMPLIES WAITING. The row no longer asks — a question in a row is
  // unanswerable by construction — so what is addressed to the reader is the
  // banner, which is the shape the run actually waits behind.
  assert.match(NEXT, /I'm holding here until you send a verdict/, 'the waiting banner still tells')
  assert.match(NEXT, /Both shapes are addressed to someone/)
  assert.doesNotMatch(NEXT, /want a written review before you commit\?/, 'the row stopped asking')
  // The shape it must not go back to: engine output quoted at nobody.
  assert.doesNotMatch(NEXT, /```\nPage is rendered:/)
})

// TWO SHAPES, ONE SUBJECT. A run that is waiting promotes the offer into the
// banner and drops the row; a run that is not keeps the row and shows no
// banner. Emitting both would split one page across two places — the same
// failure the one-row rule was written against, with the halves further apart.
test('waiting promotes the offer to a banner and drops the row', () => {
  assert.match(NEXT, /the offer is the banner after the block/i)
  assert.match(NEXT, /\*\*the `Review` row is dropped\*\*/)
  assert.match(NEXT, /Where you are not waiting, it stays the `Review` row/)
  assert.match(NEXT, /## ⏸ Review ready/, 'and the banner shape is written out')
})

test('the position is stated, and stated as the point of it', () => {
  assert.match(NEXT, /The row sits above the last two rows of\s*\n?\s*the block/)
  assert.match(NEXT, /Never bury it and never split it/)
})

// The page and the question are ONE row. Splitting them was tried and rejected:
// two adjacent rows about the same page make the reader resolve a distinction
// before acting on either.
test('one page is named in one place, never two', () => {
  assert.match(NEXT, /the banner\s*\n?replaces the row rather than joining it/i)
  assert.match(NEXT, /Two places naming one page/i)
  // Stated as the SAME failure as the old adjacent-rows one, so a later edit
  // cannot read the banner as permission to have both.
  assert.match(NEXT, /whether the two places are adjacent rows or a row and a\s*\n?banner/i)
})

// The two steps have to agree, because step 5 writes the offer and step 6 writes
// the report it is the end of. They disagreed before: step 5 said "one line",
// step 6 said the report ends on which phase is next.
// Step 5 writes the offer and step 6 writes the block it lives in, so the two
// have to name the same place. They disagreed before, when one said "one line"
// and the other said the report ends on which phase is next.
test('step 6 agrees about which shape the offer takes', () => {
  const six = NEXT.slice(NEXT.indexOf('## 6. Report'))
  assert.match(six, /Step 5's offer lands in one of two shapes, and never both/)
  assert.match(six, /Neither is a paragraph/)
  assert.match(six, /the ban on prose after the\s*\n?block is untouched/)
  assert.match(six, /must not disagree about which shape it\s*\n?takes/)
})

// The contract says nothing follows the block. If the offer were also "the last
// thing on screen" as a paragraph, those two rules would be in direct conflict —
// which is exactly what folding it into a row resolved.
test('nothing is left claiming to follow the block', () => {
  const six = NEXT.slice(NEXT.indexOf('## 6. Report'))
  assert.doesNotMatch(six, /and nothing after it/)
  assert.doesNotMatch(NEXT, /as the final thing on screen/)
})

test('the banner is justified, not merely permitted', () => {
  // Without the reasoning, the next reader deletes it as a violation of the
  // no-prose-after-the-block rule sitting three paragraphs above it.
  const rule = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-reports.md'), 'utf8')
  assert.match(rule, /\*\*This is not the old failure returning\*\*/)
  assert.match(rule, /the run now \*waits\*/)
  assert.match(rule, /A row cannot carry that/)
})

// The phase now WAITS for the verdict rather than asking a question a chained
// run scrolls past — so what is pinned is no longer "never block". It is the
// reason blocking was feared: a chained `/commit && /spec-next` must not be
// stopped mid-way. The wait sits at the end, after the chain has finished.
test('waiting does not break a chained run', () => {
  assert.match(NEXT, /`\/commit && \/spec-next` is typed as\s*\n?\s*one line/i)
  assert.match(NEXT, /the chain has finished/i)
  // And the wait is a watch plus an ended turn, never a held-open one.
  assert.match(NEXT, /\*\*end\s*\n?\s*your turn\*\*/i)
  assert.match(NEXT, /Do not poll/i)
})

// The contract's own scope rule, guarded where it was actually broken: a report
// that volunteers what else is in flight leaves the reader unable to tell what
// followed from the run they just watched.
test('the contract confines the block to the run that produced it', () => {
  const rule = fs.readFileSync(
    path.join(ASSETS, 'rules', 'spec-reports.md'),
    'utf8',
  )
  assert.match(rule, /It reports this run and nothing else/)
  assert.match(rule, /`Next` is the single next action \*\*for this work\*\*/)
  const complete = skillText('spec-complete')
  assert.match(complete, /Report this spec and no other/)
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

// A WAIT THAT CANNOT SEE THE TRANSPORT IS A FALSE PROMISE. The file-watch
// reaches the engine's local store, which is where a SERVED page posts. A
// published page writes to the artifact's own store, which no watch reaches —
// and the banner was handed out with both links under one line claiming to be
// holding. Three verdicts were pressed on the published page and sat unread.
test('the banner only promises a wait the transport can deliver', () => {
  assert.match(NEXT, /nothing pushes from\s*\n?the artifact store/i)
  assert.match(NEXT, /press a verdict, then type `\/spec-reviewed`/)

  const rule = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-reports.md'), 'utf8')
  assert.match(rule, /\*\*Only promise a wait the transport can deliver\.\*\*/)
  assert.match(rule, /I cannot see it until you do/)
  // The wait is real on every transport — only what carries it back varies.
  // "No file-watch" was once an exemption from waiting at all, and that is the
  // hatch a whole class of unanswerable questions came through.
  assert.match(rule, /The wait itself is real in\s*\n?every case/)
  assert.match(rule, /does not get an exemption/)
})

// ONE LINK. Two doors and no way to tell which the run is standing behind is
// the whole failure, not a convenience with a caveat — the caveat existing is
// the bug. The engine's `reader:` line has already picked which page the reader
// can use, so the skill relays that one and publishes only when it could not
// serve at all.
test('exactly one link is offered, and publishing is the unreachable case', () => {
  assert.match(NEXT, /\*\*One link, and the engine has already chosen it\.\*\*/)
  assert.match(NEXT, /\*\*Never offer both\.\*\*/)
  assert.match(NEXT, /for the reader the server cannot reach, and for nobody\s*\n?else/i)
  // The pre-existing rule it leans on, sharpened rather than duplicated.
  assert.match(NEXT, /is not a\s*\n?reason to publish as well/i)

  const rule = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-reports.md'), 'utf8')
  assert.match(rule, /\*\*Exactly one link, never two\.\*\*/)
  assert.match(rule, /it is the caveat existing at all/)
})

test('/spec-diff says which store the wait actually watches', () => {
  const diff = skillText('spec-diff')
  assert.match(diff, /\*\*The wait covers the SERVED page and nothing else\.\*\*/)
  assert.match(diff, /no watch of any kind reaches that/i)
  // And the fallback is named as covering the published case, not just the
  // no-watch case.
  assert.match(diff, /for every\s*\n?published page/i)
})
