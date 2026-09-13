'use strict'

/**
 * The address printed must be one the server is reachable at.
 *
 * Two halves that were each defensible alone and wrong together. `spec-env
 * review` asks for a `0.0.0.0` bind on a remote reader; `ensureReviewServer`
 * adopts whatever server is already running rather than restarting it, because
 * a restart mints a fresh token and kills the URL already open on someone's
 * phone. Both correct. But nothing reconciled them: the render printed
 * `lanAddresses()` regardless, so a loopback-bound server was advertised at
 * `http://192.168.0.241:7777/…` and the phone got "location can't be opened",
 * with no line anywhere saying the server was loopback-only.
 *
 * And `review serve --restart` with no `--host` re-bound to `127.0.0.1` rather
 * than keeping the host the running server had — so the narrowing that caused
 * it was itself invisible.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { reviewServedUrls, restartHost } = require('../src/cli.js')

const UP = { port: 7777, token: null, loopback: true }
const WIDE = { port: 7777, token: 'abc123', loopback: false }
const ADDRS = ['192.168.0.241', '10.211.55.2']

// --- what `review` prints --------------------------------------------------

test('a loopback server is never advertised at a LAN address', () => {
  // The exact failure: this returned a 192.168.x URL for a server listening
  // only on 127.0.0.1.
  const served = reviewServedUrls(UP, ADDRS, 'feat-alpha')
  assert.ok(served, 'there is still something to print')
  assert.ok(
    !ADDRS.some((a) => served.url.includes(a)),
    `printed a LAN address for a loopback server: ${served.url}`,
  )
  assert.ok(served.url.includes('127.0.0.1'), 'it prints the address that does work')
  assert.deepStrictEqual(served.alternates, [], 'and offers no LAN runners-up either')
})

test('a loopback server says how to widen it, rather than leaving a dead end', () => {
  const served = reviewServedUrls(UP, ADDRS, 'feat-alpha')
  assert.ok(served.loopback, 'the caller can tell this is the narrow case')
  assert.match(
    served.widen,
    /review serve --host 0\.0\.0\.0/,
    'the line names the command that fixes it',
  )
})

test('a widely-bound server still prints its LAN URLs, best guess first', () => {
  // The fix must not cost the working case anything. The ranking can be wrong,
  // so the runners-up are still offered rather than discarded.
  const served = reviewServedUrls(WIDE, ADDRS, 'feat-alpha')
  assert.ok(served.url.startsWith('http://192.168.0.241:7777/abc123/'))
  assert.strictEqual(served.alternates.length, 1)
  assert.ok(served.alternates[0].includes('10.211.55.2'))
  assert.ok(!served.widen, 'nothing to widen — it is already wide')
})

test('the spec name is encoded, loopback or not', () => {
  for (const up of [UP, WIDE]) {
    assert.ok(reviewServedUrls(up, ADDRS, 'feat/odd name').url.includes(encodeURIComponent('feat/odd name')))
  }
})

test('a wide server with no addresses to offer has nothing to print', () => {
  // A machine with no network address. The `file://` fallback is the honest
  // answer, and inventing a URL would be worse than saying nothing.
  assert.strictEqual(reviewServedUrls(WIDE, [], 'feat-alpha'), null)
})

test('a loopback server still prints, even with no LAN addresses at all', () => {
  // Loopback does not depend on having a network — this is the one case that
  // works on a machine with no addresses.
  const served = reviewServedUrls(UP, [], 'feat-alpha')
  assert.ok(served && served.url.includes('127.0.0.1'))
})

// --- what `serve --restart` binds to ---------------------------------------

test('a restart keeps the host the running server had', () => {
  // The narrowing that started all this: `--restart` with no `--host` went
  // back to loopback, silently, while the render went on claiming LAN.
  assert.strictEqual(restartHost(undefined, { host: '0.0.0.0' }), '0.0.0.0')
})

test('an explicit --host still wins, in both directions', () => {
  assert.strictEqual(restartHost('127.0.0.1', { host: '0.0.0.0' }), '127.0.0.1')
  assert.strictEqual(restartHost('0.0.0.0', { host: '127.0.0.1' }), '0.0.0.0')
})

test('with nothing running and no --host, it is loopback', () => {
  // STAYS SILENT, and the direction matters: widening a bind by inference is
  // the one move that must never happen by accident, so the unknown case takes
  // the narrow branch (`.claude/rules/negative-checks.md` rule 4).
  assert.strictEqual(restartHost(undefined, null), '127.0.0.1')
  assert.strictEqual(restartHost(undefined, {}), '127.0.0.1')
  assert.strictEqual(restartHost(undefined, { port: 7777 }), '127.0.0.1')
})
