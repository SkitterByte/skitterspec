'use strict'

// The release seam's pure pieces for `reconcile`: version ordering and the npm
// registry probe. The verb itself is exercised end to end in each provider's
// release tests (the GitHub one holds the canonical set).

const { test } = require('node:test')
const assert = require('node:assert')

const { parseVersion, compareVersions, npmLiveVersions } = require('../src/releases.js')

test('versions order numerically, not lexically', () => {
  assert.strictEqual(compareVersions('2.0.0', '10.0.0'), -1)
  assert.strictEqual(compareVersions('1.2.0', '1.10.0'), -1)
  assert.strictEqual(compareVersions('1.0.1', '1.0.0'), 1)
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0)
})

test('a bare version outranks a suffixed one at the same triplet', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.0.0-stage'), 1)
  assert.strictEqual(compareVersions('0.0.0-stage', '1.0.0'), -1)
})

test('an unparseable version sorts below everything parseable', () => {
  assert.strictEqual(parseVersion('not-a-version'), null)
  assert.strictEqual(compareVersions('not-a-version', '0.0.1'), -1)
  assert.strictEqual(compareVersions('0.0.1', 'not-a-version'), 1)
})

test('the probe returns the live version set', async () => {
  const fetch = async (url) => {
    assert.match(url, /^https:\/\/registry\.npmjs\.org\/%40scope%2Fname$/, 'the scoped name is one encoded path segment')
    return { ok: true, status: 200, json: async () => ({ versions: { '1.0.0': {}, '1.1.0': {} } }) }
  }
  const got = await npmLiveVersions('@scope/name', fetch)
  assert.strictEqual(got.ok, true)
  assert.deepStrictEqual([...got.versions].sort(), ['1.0.0', '1.1.0'])
})

// A 404 means unpublished, private, or a package the registry has not settled —
// three states an unauthenticated read cannot tell apart, so the probe refuses
// to answer rather than report "not published" (negative-checks rule 4).
test('STAYS SILENT: a 404, a bad status, a network error and bad JSON are each a cannot-tell', async () => {
  const notFound = await npmLiveVersions('x', async () => ({ ok: false, status: 404, json: async () => ({}) }))
  assert.strictEqual(notFound.ok, false)
  assert.match(notFound.reason, /not on the public registry/)

  const flaky = await npmLiveVersions('x', async () => ({ ok: false, status: 503, json: async () => ({}) }))
  assert.strictEqual(flaky.ok, false)
  assert.match(flaky.reason, /503/)

  const offline = await npmLiveVersions('x', async () => {
    throw new Error('ENOTFOUND')
  })
  assert.strictEqual(offline.ok, false)
  assert.match(offline.reason, /unreachable/)

  const garbled = await npmLiveVersions('x', async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('bad json')
    },
  }))
  assert.strictEqual(garbled.ok, false)
  assert.match(garbled.reason, /unreadable/)
})

test('a registry doc with no versions field is an empty set, not a crash', async () => {
  const got = await npmLiveVersions('x', async () => ({ ok: true, status: 200, json: async () => ({}) }))
  assert.strictEqual(got.ok, true)
  assert.strictEqual(got.versions.size, 0)
})
