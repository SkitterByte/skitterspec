'use strict'

// Links a phone reader can open (spec feat-epic-links-reach-phone): a member
// row links to the network address on a wide bind, and a loopback-bound
// server's network tier names the command that widens it.

const { test } = require('node:test')
const assert = require('node:assert')

const { memberPageLink, reviewServedUrls } = require('../src/cli.js')
const { reviewTierStack, reviewTierLine, tierAction, surfacesFor } = require('../src/env/review.js')

const WIDE = { port: 7760, token: 'tok', loopback: false }
const NARROW = { port: 7760, token: 'tok', loopback: true }
const ADDRS = ['192.168.0.136', '100.126.111.34']
const config = { review: { allowNetwork: true, allowRemote: false } }

const stack = (up, addrs) =>
  reviewTierStack({ served: reviewServedUrls(up, addrs, 'epic-x'), fileUrl: null, publishedUrl: null, config })
const network = (tiers) => tiers.find((t) => t.tier === 'network')

test('a member row links to the network address on a wide bind', () => {
  assert.strictEqual(memberPageLink(WIDE, ADDRS, 'feat-a'), 'http://192.168.0.136:7760/tok/feat-a')
})

test('a member row keeps loopback on a loopback bind', () => {
  assert.strictEqual(memberPageLink(NARROW, ADDRS, 'feat-a'), 'http://127.0.0.1:7760/tok/feat-a')
})

test('a wide bind with no address falls back to loopback, and nothing serving is null', () => {
  assert.strictEqual(memberPageLink(WIDE, [], 'feat-a'), 'http://127.0.0.1:7760/tok/feat-a')
  assert.strictEqual(memberPageLink(null, ADDRS, 'feat-a'), null)
})

test('a loopback bind reads network: off, naming the widen command', () => {
  const tier = network(stack(NARROW, ADDRS))
  assert.strictEqual(
    reviewTierLine(tier),
    '  network: off — turn on with: skitterspec spec-env review serve --host 0.0.0.0',
  )
})

test('the page offers no press for a loopback bind — widening restarts the server', () => {
  const tier = network(stack(NARROW, ADDRS))
  assert.strictEqual(tierAction(tier), null)
  assert.strictEqual(surfacesFor({ live: null, tiers: [tier] }), null)
})

test('stays silent: a wide bind on a machine with no address still says so', () => {
  const tier = network(stack(WIDE, []))
  assert.strictEqual(reviewTierLine(tier), '  network: —   (no network address on this machine)')
})

test('stays silent: network turned off in config still offers allow-network', () => {
  const tiers = reviewTierStack({
    served: reviewServedUrls(NARROW, ADDRS, 'epic-x'),
    fileUrl: null,
    publishedUrl: null,
    config: { review: { allowNetwork: false, allowRemote: false } },
  })
  assert.strictEqual(tierAction(network(tiers)), 'allow-network')
})
