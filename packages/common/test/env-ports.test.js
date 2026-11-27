'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const net = require('node:net')

const { portsInUse, portsAnswering, waitListening } = require('../src/env/ports.js')

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
}
function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

test('waitListening resolves true once a port is bound, false on timeout', async () => {
  const port = await freePort()
  // nothing listening yet → times out quickly
  assert.strictEqual(await waitListening([port], { timeoutMs: 300, intervalMs: 50 }), false)
  const server = net.createServer()
  await listen(server, port)
  try {
    assert.strictEqual(await waitListening([port], { timeoutMs: 1000, intervalMs: 50 }), true)
  } finally {
    await closeServer(server)
  }
})

test('portsInUse reports bound ports and ignores free ones', async () => {
  const busyPort = await freePort()
  const freeOne = await freePort()
  const holder = net.createServer()
  await listen(holder, busyPort)
  try {
    const busy = await portsInUse([busyPort, freeOne])
    assert.deepStrictEqual(busy, [busyPort])
  } finally {
    await closeServer(holder)
  }
})

// A dev server started for phone-on-wifi testing listens on EVERY address
// (Vite `host: true`, Fastify `0.0.0.0`). BSD lets a probe bind 127.0.0.1
// beside it, so a bind-based probe read such a server as absent on macOS
// while Linux, where the two binds conflict, never showed the bug. These
// tests hold on both: the wildcard listener must be seen either way.
function listenAll(server, port) {
  return new Promise((resolve) => server.listen(port, '0.0.0.0', resolve))
}

test('portsAnswering sees a server listening on every address', async () => {
  const port = await freePort()
  const server = net.createServer()
  await listenAll(server, port)
  try {
    assert.deepStrictEqual(await portsAnswering([port], '127.0.0.1'), [port])
  } finally {
    await closeServer(server)
  }
})

test('portsAnswering stays silent on a free port', async () => {
  const port = await freePort()
  assert.deepStrictEqual(await portsAnswering([port], '127.0.0.1'), [])
})
