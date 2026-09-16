'use strict'

/**
 * How a refusal reaches the person who has to fix it.
 *
 * `apply` printed one line — `!! Linear API error: usage limit exceeded` —
 * followed by `ids stamped so far are saved — re-run to resume without
 * duplicating`. Both were wrong for this failure: it reads like a throttle, and
 * nothing had been stamped because nothing was created.
 *
 * So the report answers the two questions the reader actually has: **what was
 * refused**, in Linear's own words, and **can waiting help**.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { LinearRefusal } = require('../src/api.js')
const { describeRefusal } = require('../src/cli-sync.js')

const usageCap = () =>
  new LinearRefusal('Linear API error: usage limit exceeded', {
    code: 'USAGE_LIMIT_EXCEEDED',
    userError: true,
    userPresentableMessage:
      "You've exceeded the free issue limit for this workspace. Please upgrade or contact sales@linear.app for a free trial.",
    meta: { usageMetric: 'activeIssueCount' },
    retryable: false,
  })

test("it relays Linear's own words rather than paraphrasing them", () => {
  const lines = describeRefusal(usageCap()).join('\n')
  assert.match(lines, /free issue limit for this workspace/, 'the presentable message, verbatim')
  assert.match(lines, /sales@linear\.app/, 'including the fix it names')
})

test('it says whether waiting can help, because that decides the next move', () => {
  assert.match(describeRefusal(usageCap()).join('\n'), /waiting will not help/i)
  const throttled = new LinearRefusal('Linear rate-limited this request', { retryable: true })
  const lines = describeRefusal(throttled).join('\n')
  assert.match(lines, /rate-limited/)
  assert.doesNotMatch(lines, /waiting will not help/i, 'here waiting is the whole answer')
})

test('the code and the metric are named, so the cause is greppable', () => {
  const lines = describeRefusal(usageCap()).join('\n')
  assert.match(lines, /USAGE_LIMIT_EXCEEDED/)
  assert.match(lines, /activeIssueCount/)
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rules 3 and 4). An error that
// said nothing about itself must report exactly as it did before this phase —
// one line, the message, and NO verdict on retryability in either direction.
test('stays silent: a bare error reports as one line and claims nothing', () => {
  const lines = describeRefusal(new Error('Linear API error: something went wrong'))
  assert.deepStrictEqual(lines, ['Linear API error: something went wrong'])
})

test('stays silent: a refusal with no extensions is also just its message', () => {
  const bare = new LinearRefusal('Linear API error: something went wrong', {})
  assert.deepStrictEqual(describeRefusal(bare), ['Linear API error: something went wrong'])
})

// The presentable message often repeats the short one. Printing both would read
// as two problems.
test('it does not print the short message twice when the long one says it', () => {
  const lines = describeRefusal(usageCap())
  const count = lines.filter((l) => /usage limit exceeded/i.test(l)).length
  assert.ok(count <= 1, `the phrase appears ${count} times`)
})
