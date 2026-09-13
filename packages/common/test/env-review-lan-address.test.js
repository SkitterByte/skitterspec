'use strict'

/**
 * Which LAN address the reader is offered.
 *
 * `rankLanAddresses` takes the interface map as an argument rather than reading
 * `os.networkInterfaces()`, so every test STATES the machine it describes. A
 * test that read the real one would pass or fail depending on whether the
 * developer running it had a VM, a VPN or Docker up — which is precisely the
 * variation being ranked.
 *
 * Getting this wrong is not a cosmetic miss: an address the reader's phone
 * cannot route to is the same dead link this whole spec exists to remove, just
 * with a different scheme on the front.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { rankLanAddresses } = require('../src/cli.js')

const v4 = (address) => ({ family: 'IPv4', address, internal: false })

// The exact machine this bug was found on: Parallels installs two bridges, and
// `networkInterfaces()` returns the real wifi first only by accident of order.
const THIS_MACHINE = {
  lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  en0: [v4('192.168.0.241')],
  bridge100: [v4('10.211.55.2')],
  bridge101: [v4('10.37.129.2')],
}

test('the wifi adapter outranks the virtual bridges beside it', () => {
  const ranked = rankLanAddresses(THIS_MACHINE)
  assert.strictEqual(ranked[0].address, '192.168.0.241')
  assert.strictEqual(ranked[0].iface, 'en0')
  assert.strictEqual(ranked.length, 3, 'the runners-up are kept, not discarded')
})

// Order alone must not be what saves us — the bug is still there if the real
// address only wins by being listed first.
test('it still wins when discovery order puts it last', () => {
  const reordered = {
    bridge100: [v4('10.211.55.2')],
    bridge101: [v4('10.37.129.2')],
    en0: [v4('192.168.0.241')],
  }
  assert.strictEqual(rankLanAddresses(reordered)[0].address, '192.168.0.241')
})

test('loopback and IPv6 are not candidates', () => {
  const ranked = rankLanAddresses({
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    en0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('10.0.0.9')],
  })
  assert.deepStrictEqual(
    ranked.map((e) => e.address),
    ['10.0.0.9'],
  )
})

// Rule 4: cannot tell is not the same as no. An unrecognised adapter name is
// ranked below a known-physical one and above a known-virtual one — never
// dropped, because dropping it could leave the reader with nothing at all.
test('an unrecognised adapter sits between physical and virtual', () => {
  const ranked = rankLanAddresses({
    docker0: [v4('172.17.0.1')],
    weird9: [v4('192.168.5.5')],
    en0: [v4('192.168.1.10')],
  })
  assert.deepStrictEqual(
    ranked.map((e) => e.iface),
    ['en0', 'weird9', 'docker0'],
  )
})

test('a machine with only virtual adapters still offers something', () => {
  const ranked = rankLanAddresses({
    bridge100: [v4('10.211.55.2')],
    docker0: [v4('172.17.0.1')],
  })
  assert.strictEqual(ranked.length, 2, 'an unrankable set is not an excuse to offer nothing')
  // Within one tier the range tie-break applies: 172.16/12 is likelier to be a
  // network a phone is on than 10/8 behind a VM bridge.
  assert.strictEqual(ranked[0].address, '172.17.0.1')
})

test('no non-internal address at all ranks to nothing', () => {
  assert.deepStrictEqual(rankLanAddresses({ lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }), [])
  assert.deepStrictEqual(rankLanAddresses({}), [])
  assert.deepStrictEqual(rankLanAddresses(null), [])
})

// The range rule is a TIE-BREAK and must never outrank the interface name: a
// corporate LAN is legitimately 10/8, and ranking a Docker bridge above the
// wifi because 172.17 looks tidier would reintroduce the bug.
test('the range tie-break never outranks the interface name', () => {
  const ranked = rankLanAddresses({
    docker0: [v4('192.168.1.1')],
    en0: [v4('10.1.2.3')],
  })
  assert.strictEqual(ranked[0].iface, 'en0', 'a physical adapter wins on any range')
})

test('ranking is stable, so the offered URL does not move between runs', () => {
  const nets = { en0: [v4('192.168.1.10')], en1: [v4('192.168.1.11')] }
  const a = rankLanAddresses(nets).map((e) => e.address)
  const b = rankLanAddresses(nets).map((e) => e.address)
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(a, ['192.168.1.10', '192.168.1.11'], 'a tie keeps discovery order')
})
