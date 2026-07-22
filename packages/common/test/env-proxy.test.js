'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const net = require('node:net')

const { renderRoutes, startProxy, portsInUse, waitListening } = require('../src/env/proxy.js')

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

test('renderRoutes keeps only frontPort procs, mapping frontPort → target port', () => {
  const routes = renderRoutes([
    { name: 'api', port: 3021, frontPort: 8080 },
    { name: 'ui', port: 3020, frontPort: 3000 },
    { name: 'worker', port: 3022 }, // no frontPort → not exposed
  ])
  assert.deepStrictEqual(routes, [
    { name: 'api', frontPort: 8080, targetPort: 3021 },
    { name: 'ui', frontPort: 3000, targetPort: 3020 },
  ])
})

test('renderRoutes on empty / no-frontPort input → []', () => {
  assert.deepStrictEqual(renderRoutes([]), [])
  assert.deepStrictEqual(renderRoutes([{ name: 'x', port: 1 }]), [])
})

test('startProxy forwards HTTP (method + path + body) to the upstream', async () => {
  const upstreamPort = await freePort()
  const frontPort = await freePort()

  const upstream = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/plain', 'x-upstream': 'yes' })
      res.end(`${req.method} ${req.url} body=${body}`)
    })
  })
  await listen(upstream, upstreamPort)
  const proxy = startProxy([{ name: 'ui', frontPort, targetPort: upstreamPort }])

  try {
    const res = await fetch(`http://127.0.0.1:${frontPort}/hello?q=1`, {
      method: 'POST',
      body: 'ping',
    })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.headers.get('x-upstream'), 'yes')
    assert.strictEqual(await res.text(), 'POST /hello?q=1 body=ping')
  } finally {
    await proxy.close()
    await closeServer(upstream)
  }
})

test('startProxy returns 502 when the upstream is down', async () => {
  const frontPort = await freePort()
  const deadPort = await freePort() // nothing listening
  const proxy = startProxy([{ name: 'ui', frontPort, targetPort: deadPort }])
  try {
    const res = await fetch(`http://127.0.0.1:${frontPort}/`)
    assert.strictEqual(res.status, 502)
  } finally {
    await proxy.close()
  }
})

test('startProxy pipes an HTTP upgrade (WebSocket handshake) through', async () => {
  const upstreamPort = await freePort()
  const frontPort = await freePort()

  const upstream = http.createServer()
  upstream.on('upgrade', (req, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    )
    socket.end('ECHO')
  })
  await listen(upstream, upstreamPort)
  const proxy = startProxy([{ name: 'ui', frontPort, targetPort: upstreamPort }])

  try {
    const got = await new Promise((resolve, reject) => {
      const client = net.connect(frontPort, '127.0.0.1', () => {
        client.write(
          'GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
        )
      })
      let buf = ''
      client.setTimeout(3000, () => reject(new Error('upgrade timeout')))
      client.on('data', (d) => (buf += d))
      client.on('end', () => resolve(buf))
      client.on('error', reject)
    })
    assert.match(got, /101 Switching Protocols/)
    assert.match(got, /ECHO/)
  } finally {
    await proxy.close()
    await closeServer(upstream)
  }
})

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
