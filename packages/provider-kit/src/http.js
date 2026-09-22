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

// How long to wait before retrying a 429.
function retryDelay(res, attempt, maxBackoffMs = MAX_BACKOFF_MS) {
  const header = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null
  const seconds = header != null ? Number(header) : NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, maxBackoffMs)
  return Math.min(1000 * 2 ** attempt, maxBackoffMs)
}

/**
 * Run `attempt()` (→ a fetch Response) until it is not rate-limited or the
 * retries run out. Returns `{ response, exhausted }` — `exhausted` true when
 * the LAST response is still a 429, so the caller phrases its own refusal (and
 * marks it retryable: rate limiting is the failure where waiting is the whole
 * answer, and the one a refusal must stay distinguishable from).
 */
async function withRateLimitRetry(attempt, { sleep, maxRetries = MAX_RETRIES, maxBackoffMs = MAX_BACKOFF_MS } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  for (let n = 0; ; n++) {
    const response = await attempt()
    if (response.status === 429 && n < maxRetries) {
      await wait(retryDelay(response, n, maxBackoffMs))
      continue
    }
    return { response, exhausted: response.status === 429 }
  }
}

module.exports = { withRateLimitRetry, retryDelay, MAX_RETRIES, MAX_BACKOFF_MS }
