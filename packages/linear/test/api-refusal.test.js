'use strict'

/**
 * What Linear refused, and whether waiting could ever help.
 *
 * A push failed twice with one line — `Linear API error: usage limit exceeded` —
 * and it cost an hour of wrong diagnosis. It reads like a rate limit, so the
 * advice was *wait for the window to reset*; the reset was then checked
 * (2,499 of 2,500 requests remaining) which ruled throttling out and named
 * nothing. The answer was in the response the whole time:
 *
 *   "extensions": {
 *     "code": "USAGE_LIMIT_EXCEEDED", "userError": true,
 *     "userPresentableMessage": "You've exceeded the free issue limit for this
 *        workspace. Please upgrade or contact sales@linear.app...",
 *     "meta": { "usageMetric": "activeIssueCount" } }
 *
 * `api.js` mapped every GraphQL error to `e.message` and dropped `extensions`,
 * so a message Linear wrote FOR THE USER — naming the cause and the fix — never
 * reached them.
 *
 * TWO FAILURES THAT WANT OPPOSITE RESPONSES. `userError: true` says retrying is
 * pointless; HTTP 429 says retrying is the entire answer. Both printed as
 * "Linear API error", and that collapse is what produced the hour.
 *
 * Note the HTTP status on the real failure was **200** — the error was in the
 * body. Anything keying off `res.status` cannot see this at all, which is
 * exactly why the 429 tests below are kept beside these.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { makeClient } = require('../src/api.js')

const KEY = 'lin_api_secret_value_do_not_leak'

// The real payload, captured from the failure this phase exists for.
const USAGE_LIMIT = {
  message: 'usage limit exceeded',
  path: ['issueCreate'],
  extensions: {
    type: 'usage limit exceeded',
    code: 'USAGE_LIMIT_EXCEEDED',
    statusCode: 400,
    userError: true,
    userPresentableMessage:
      "You've exceeded the free issue limit for this workspace. Please upgrade or contact sales@linear.app for a free trial.",
    meta: { usageMetric: 'activeIssueCount' },
  },
}

// A fetch that answers HTTP 200 with a GraphQL `errors` body — the real shape.
function erroringFetch(errors, { status = 200 } = {}) {
  let calls = 0
  const fn = async () => {
    calls++
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Map(),
      async json() {
        return { errors }
      },
    }
  }
  fn.count = () => calls
  return fn
}

async function refusal(fetchImpl, opts = {}) {
  const call = makeClient({ apiKey: KEY, fetch: fetchImpl, sleep: async () => {}, ...opts })
  try {
    await call('mutation { issueCreate { success } }', {})
  } catch (err) {
    return err
  }
  throw new Error('expected the call to throw')
}

test('a refusal carries what Linear said, not just a joined message', async () => {
  const err = await refusal(erroringFetch([USAGE_LIMIT]))
  assert.strictEqual(err.code, 'USAGE_LIMIT_EXCEEDED')
  assert.strictEqual(err.userError, true)
  assert.match(err.userPresentableMessage, /free issue limit/)
  assert.deepStrictEqual(err.meta, { usageMetric: 'activeIssueCount' })
})

// EVERY EXISTING CALLER PRINTS `error.message`, and this phase must not require
// them all to change to keep working. The fields are added beside it.
test('the joined message survives as error.message', async () => {
  const err = await refusal(erroringFetch([USAGE_LIMIT]))
  assert.match(err.message, /usage limit exceeded/)
})

// The retry loop exists for throttling. A usage cap retried three times is
// three identical refusals and a slower failure.
test('a userError is not retried — it can never succeed on retry', async () => {
  const fetchImpl = erroringFetch([USAGE_LIMIT])
  await refusal(fetchImpl, { maxRetries: 3 })
  assert.strictEqual(fetchImpl.count(), 1, 'asked exactly once')
})

test('a refusal says plainly that waiting will not help', async () => {
  const err = await refusal(erroringFetch([USAGE_LIMIT]))
  assert.strictEqual(err.retryable, false)
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). An error with no
// `extensions` is every error the MCP path and older Linear responses produce.
// An absent field is not evidence, so it must read as neither retryable nor
// unretryable — and it must report exactly as it did before this phase.
test('stays silent: an error with no extensions reports as it always did', async () => {
  const err = await refusal(erroringFetch([{ message: 'something went wrong' }]))
  assert.match(err.message, /Linear API error: something went wrong/)
  assert.strictEqual(err.code, null, 'no code claimed')
  assert.strictEqual(err.userError, null, 'and no verdict on retryability')
  assert.strictEqual(err.retryable, null)
  assert.strictEqual(err.userPresentableMessage, null)
})

test('stays silent: several errors still join, as before', async () => {
  const err = await refusal(erroringFetch([{ message: 'first' }, { message: 'second' }]))
  assert.match(err.message, /first; second/)
})

// The classification reads `userError` first and falls back to a known-
// unretryable code — a payload carrying one and not the other is still decided.
test('a known unretryable code decides it even without userError', async () => {
  const err = await refusal(
    erroringFetch([{ message: 'usage limit exceeded', extensions: { code: 'USAGE_LIMIT_EXCEEDED' } }]),
  )
  assert.strictEqual(err.retryable, false)
})

// --- the throttle path is correct today and must not be disturbed ------------

function throttlingFetch({ until = 1, retryAfter = null } = {}) {
  let calls = 0
  const fn = async () => {
    calls++
    if (calls <= until) {
      return {
        ok: false,
        status: 429,
        headers: new Map(retryAfter == null ? [] : [['retry-after', String(retryAfter)]]),
        async json() {
          return {}
        },
      }
    }
    return { ok: true, status: 200, headers: new Map(), async json() { return { data: { ok: true } } } }
  }
  fn.count = () => calls
  return fn
}

test('stays silent: a 429 still retries and still recovers', async () => {
  const fetchImpl = throttlingFetch({ until: 2, retryAfter: 0 })
  const call = makeClient({ apiKey: KEY, fetch: fetchImpl, sleep: async () => {}, maxRetries: 5 })
  assert.deepStrictEqual(await call('{ viewer { id } }', {}), { ok: true })
  assert.strictEqual(fetchImpl.count(), 3, 'two refusals, then the answer')
})

test('stays silent: a 429 that never recovers still says it was rate-limited', async () => {
  const fetchImpl = throttlingFetch({ until: Infinity })
  const call = makeClient({ apiKey: KEY, fetch: fetchImpl, sleep: async () => {}, maxRetries: 2 })
  await assert.rejects(() => call('{ viewer { id } }', {}), /rate-limited/)
})

// The two failures are told apart by the one field a caller branches on. This
// is the whole point of the phase in a single assertion.
test('a throttle and a refusal are distinguishable', async () => {
  const refused = await refusal(erroringFetch([USAGE_LIMIT]))
  const fetchImpl = throttlingFetch({ until: Infinity })
  const call = makeClient({ apiKey: KEY, fetch: fetchImpl, sleep: async () => {}, maxRetries: 1 })
  const throttled = await call('{ viewer { id } }', {}).then(
    () => { throw new Error('expected a throw') },
    (e) => e,
  )
  assert.strictEqual(refused.retryable, false, 'waiting will not help')
  assert.strictEqual(throttled.retryable, true, 'waiting is the whole answer')
})
