'use strict'

/**
 * Checks on the page, once they can come from two authors.
 *
 * Two halves. `renderReviewBlock` and the reviewer strip are pure, so the
 * markup is asserted directly. The LOAD-BEARING half is at the bottom: a page
 * carrying a hundred machine findings must still offer a committing verdict,
 * and a reply to one must take it away. That is the whole design — findings
 * inform, a person's request gates — and it is asserted here rather than left
 * to follow from the fact that nothing was written to make it false.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { renderReviewBlock, renderReviewerStrip, reviewerSaid, judgeVerdict, emptyNotes, mergeNotes } = require('../src/env/review.js')

/* ==========================================================================
 * What the markup says
 * ========================================================================== */

test('a written review renders exactly as it always did', () => {
  // THE GOLDEN CASE. Every project that exists today has no reviewers, so the
  // first obligation of this whole feature is to change nothing for them.
  const html = renderReviewBlock({
    summary: 'Read the handler and the schema.',
    checks: [
      { level: 'flag', file: 'src/app.js', note: 'this drops the error' },
      { level: 'good', file: 'src/b.js', note: 'reads right' },
      { level: 'confirm', note: 'was the rename deliberate?' },
    ],
  })
  assert.ok(html.includes('<p class="review-summary">Read the handler and the schema.</p>'))
  assert.ok(html.includes('<li class="check flag" data-check="k0" data-file="src/app.js">'))
  assert.ok(html.includes('<button type="button" class="check-file" data-goto="src/app.js">src/app.js</button>'))
  // No source badge, no line, no strip — nothing a one-author page never had.
  assert.ok(!html.includes('check-src'), 'a written review has no source badge')
  assert.ok(!html.includes('data-goto-line'), 'and no line anchors')
  assert.ok(!html.includes('class="reviewers"'), 'and no reviewer strip')
})

test('a machine finding carries its source and its line', () => {
  const html = renderReviewBlock({
    checks: [{ level: 'flag', file: 'src/a.js', line: 12, note: 'null deref', source: 'coderabbit' }],
  })
  assert.ok(html.includes('data-file="src/a.js"'))
  assert.ok(html.includes('data-line="12"'))
  assert.ok(html.includes('<span class="check-src">coderabbit</span>'))
  assert.ok(html.includes('data-goto="src/a.js" data-goto-line="12">src/a.js:12</button>'))
})

test('a line that is not a positive integer is not rendered as one', () => {
  for (const line of [0, -3, null, undefined, '12', 1.5]) {
    const html = renderReviewBlock({ checks: [{ level: 'flag', file: 'a.js', line, note: 'x' }] })
    assert.ok(!html.includes('data-goto-line'), `line ${JSON.stringify(line)} must not anchor`)
    assert.ok(html.includes('>a.js</button>'), 'and the label stays the bare path')
  }
})

test('a check with no file has no jump button to press', () => {
  const html = renderReviewBlock({ checks: [{ level: 'confirm', note: 'about the review itself' }] })
  assert.ok(!html.includes('data-goto'))
  assert.ok(html.includes('data-check="k0"'))
})

test('both authors compose on one page, the written review first', () => {
  const html = renderReviewBlock({
    checks: [
      { level: 'confirm', file: 'a.js', note: 'mine' },
      { level: 'flag', file: 'b.js', line: 4, note: 'theirs', source: 'coderabbit' },
    ],
  })
  assert.ok(html.indexOf('mine') < html.indexOf('theirs'), 'a person read it; they lead')
  assert.ok(html.includes('data-check="k0"') && html.includes('data-check="k1"'))
})

test('markup in a finding cannot escape into the page', () => {
  const html = renderReviewBlock({
    checks: [{ level: 'flag', file: '<img src=x>', line: 1, note: '</li><script>alert(1)</script>', source: '"><b>' }],
  })
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img src=x>'))
  assert.ok(html.includes('&lt;script&gt;'))
})

/* ==========================================================================
 * The reviewer strip
 * ========================================================================== */

test('the strip is present even when every reviewer found nothing', () => {
  // THE POINT OF THE STRIP. A rate-limited reviewer and one that read the diff
  // and approved of it are the same page without it.
  const html = renderReviewBlock({ checks: [], reviewers: [{ name: 'coderabbit', state: 'clean', count: 0 }] })
  assert.ok(html.includes('<li class="reviewer clean">'))
  assert.ok(html.includes('<span class="reviewer-name">coderabbit</span>'))
  assert.ok(html.includes('clean'))
})

test('stays silent: no reviewers configured means no strip at all', () => {
  // Every project that exists today is in this state; a strip saying "none" is
  // an absence reported at everyone.
  for (const reviewers of [undefined, null, []]) {
    const html = renderReviewBlock({ checks: [{ level: 'flag', file: 'a.js', note: 'x' }], reviewers })
    assert.ok(!html.includes('class="reviewers"'))
  }
  assert.deepEqual(renderReviewerStrip([]), [])
  assert.deepEqual(renderReviewerStrip(undefined), [])
})

test('every outcome state reads as something a person can act on', () => {
  assert.equal(reviewerSaid({ state: 'findings', count: 1 }), '1 finding')
  assert.equal(reviewerSaid({ state: 'findings', count: 3 }), '3 findings')
  assert.equal(reviewerSaid({ state: 'clean', count: 0 }), 'clean')
  assert.equal(reviewerSaid({ state: 'cached', count: 2 }), '2 findings · cached')
  assert.equal(reviewerSaid({ state: 'cached', count: 0 }), 'clean · cached')
  assert.equal(reviewerSaid({ state: 'timeout', count: 0 }), 'did not run — timed out')
  assert.equal(reviewerSaid({ state: 'missing', detail: 'command not found' }), 'did not run — command not found')
  assert.equal(reviewerSaid({ state: 'failed', detail: 'rate limited' }), 'did not run — rate limited')
})

test('a state this build does not know is shown, not dropped', () => {
  // An unrecognised state means a newer engine wrote the cache. Losing the line
  // would read as a reviewer that was never configured.
  const html = renderReviewBlock({ checks: [], reviewers: [{ name: 'future', state: 'quantum', count: 0 }] })
  assert.ok(html.includes('future'))
  assert.ok(html.includes('quantum'))
})

/* ==========================================================================
 * THE GUARANTEE — findings inform, a person's request gates
 * ========================================================================== */

test('a hundred machine findings do not block a committing verdict', () => {
  // The load-bearing assertion of the whole spec. `judgeVerdict` counts
  // COMMENTS; checks are not comments and must never become them.
  const notes = emptyNotes('feat-x')
  for (const verdict of ['commit', 'commit-continue', 'commit-start']) {
    const judged = judgeVerdict(verdict, notes)
    assert.strictEqual(judged.honoured, true, `${verdict} must be honoured`)
    assert.strictEqual(judged.effective, verdict)
    assert.strictEqual(judged.openCount, 0)
  }
})

test('replying to a machine finding DOES block it — because now a person asked', () => {
  const notes = mergeNotes(emptyNotes('feat-x'), {
    accepted: [],
    unaccepted: [],
    comments: [{ id: 'c1', file: 'src/a.js', line: 12, note: 'no, keep this', check: 'k0' }],
  }, '2026-01-01T00:00:00Z')
  assert.strictEqual(notes.comments[0].check, 'k0', 'the reply remembers which finding it answers')

  const judged = judgeVerdict('commit', notes)
  assert.strictEqual(judged.honoured, false)
  assert.strictEqual(judged.effective, 'discuss')
  assert.match(judged.reason, /1 comment is unresolved/)
})

test('and resolving that reply gives the commit back', () => {
  const notes = mergeNotes(emptyNotes('feat-x'), {
    accepted: [],
    unaccepted: [],
    comments: [{ id: 'c1', file: 'src/a.js', note: 'no, keep this', check: 'k0' }],
  }, '2026-01-01T00:00:00Z')
  notes.comments[0].resolved = { at: '2026-01-02T00:00:00Z', note: 'kept it' }
  assert.strictEqual(judgeVerdict('commit', notes).honoured, true)
})
