'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { retryDelay, withRateLimitRetry } = require('../src/http.js')

const res = (status, h = {}) => ({ status, headers: { get: (k) => (k in h ? h[k] : null) } })

test('Retry-After wins over X-RateLimit-Reset', () => {
  assert.strictEqual(retryDelay(res(429, { 'retry-after': '3', 'x-ratelimit-reset': '999' }), 0, 60_000, () => 0), 3000)
})

test('X-RateLimit-Reset waits until the named moment, capped', () => {
  assert.strictEqual(retryDelay(res(403, { 'x-ratelimit-reset': '12' }), 0, 60_000, () => 10_000), 2000)
  assert.strictEqual(retryDelay(res(403, { 'x-ratelimit-reset': '9999' }), 0, 60_000, () => 0), 60_000)
})

test('a reset already past falls back to backoff rather than waiting zero', () => {
  assert.strictEqual(retryDelay(res(429, { 'x-ratelimit-reset': '5' }), 2, 60_000, () => 10_000), 4000)
})

test('with no isLimited, only a 429 is retried — the shape every earlier provider relied on', async () => {
  let n = 0
  const got = await withRateLimitRetry(async () => (++n === 1 ? res(403, { 'retry-after': '1' }) : res(200)), {
    sleep: async () => {},
  })
  assert.strictEqual(got.response.status, 403)
  assert.strictEqual(n, 1)
})

test('a provider-supplied isLimited is honoured', async () => {
  let n = 0
  const got = await withRateLimitRetry(async () => (++n === 1 ? res(403) : res(200)), {
    sleep: async () => {},
    isLimited: (r) => r.status === 403,
  })
  assert.strictEqual(got.response.status, 200)
  assert.strictEqual(got.exhausted, false)
})
