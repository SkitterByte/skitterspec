'use strict'

/**
 * Rate-limit-aware HTTP retry — the transport discipline every provider's API
 * client shares, with none of any tracker's protocol in it.
 *
 * A bulk backfill is exactly the workload that gets throttled, and failing the
 * run would strand a half-mirrored bucket — so a 429 waits and retries rather
 * than surfacing. The server says how long to wait (`Retry-After`, seconds);
 * honour that over guessing, and fall back to exponential backoff (from 1s,
 * capped) when it doesn't.
 */

const MAX_RETRIES = 5
const MAX_BACKOFF_MS = 60_000

// How long to wait before retrying a rate-limited response: `Retry-After`
// (seconds) first, then `X-RateLimit-Reset` (an epoch second — GitHub's
// primary limit names the moment it lifts rather than a duration), then
// exponential backoff. A reset already in the past falls through to backoff
// rather than waiting zero and hammering.
function retryDelay(res, attempt, maxBackoffMs = MAX_BACKOFF_MS, now = Date.now) {
  const get = res.headers && typeof res.headers.get === 'function' ? (h) => res.headers.get(h) : () => null
  const header = get('retry-after')
  const seconds = header != null ? Number(header) : NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxBackoffMs)
  const reset = Number(get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) {
    const wait = reset * 1000 - now()
    if (wait > 0) return Math.min(wait, maxBackoffMs)
  }
  return Math.min(1000 * 2 ** attempt, maxBackoffMs)
}

// The default answer to "is this response a rate limit?": a 429. A provider
// whose tracker also signals limits another way (GitHub: a 403 carrying
// `Retry-After` or a zero `X-RateLimit-Remaining`) passes its own `isLimited`.
const isTooManyRequests = (res) => res.status === 429

/**
 * Run `attempt()` (→ a fetch Response) until it is not rate-limited or the
 * retries run out. Returns `{ response, exhausted }` — `exhausted` true when
 * the LAST response is still rate-limited, so the caller phrases its own
 * refusal (and marks it retryable: rate limiting is the failure where waiting
 * is the whole answer, and the one a refusal must stay distinguishable from).
 */
async function withRateLimitRetry(
  attempt,
  { sleep, maxRetries = MAX_RETRIES, maxBackoffMs = MAX_BACKOFF_MS, isLimited = isTooManyRequests, now } = {},
) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  for (let n = 0; ; n++) {
    const response = await attempt()
    const limited = isLimited(response)
    if (limited && n < maxRetries) {
      await wait(retryDelay(response, n, maxBackoffMs, now))
      continue
    }
    return { response, exhausted: limited }
  }
}

module.exports = { withRateLimitRetry, retryDelay, isTooManyRequests, MAX_RETRIES, MAX_BACKOFF_MS }
