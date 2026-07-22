'use strict'

/**
 * Front-door reverse proxy for `spec-env connect` — a small, dependency-free
 * Node proxy that exposes the ONE connected spec's warm dev servers on the
 * canonical ports (exclusive model: no cookie, one target at a time).
 *
 * `renderRoutes` is pure (procs → routes). `startProxy` builds one `http` server
 * per route, forwarding HTTP and `upgrade` (WebSocket/HMR) to the spec's port.
 * Run directly (`node proxy.js <routesFile>`) it becomes the long-lived,
 * detached proxy process the CLI supervises with the Phase 1 seam.
 */

const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs')

/**
 * The connected spec's `dev` processes that declare a `frontPort` → proxy routes.
 * @param {Array} procs  from `planDev(...).procs`
 * @returns {Array<{name, frontPort, targetPort}>}
 */
function renderRoutes(procs) {
  return (procs || [])
    .filter((p) => typeof p.frontPort === 'number')
    .map((p) => ({ name: p.name, frontPort: p.frontPort, targetPort: p.port }))
}

// Build (but don't listen on) one proxy server: frontPort → targetPort. Forwards
// regular requests and transparently pipes `upgrade` (WebSocket) connections.
function createRouteServer(route, host = '127.0.0.1') {
  const { targetPort } = route

  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host, port: targetPort, method: req.method, path: req.url, headers: req.headers },
      (ur) => {
        res.writeHead(ur.statusCode || 502, ur.headers)
        ur.pipe(res)
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`spec-connect: upstream 127.0.0.1:${targetPort} not reachable\n`)
    })
    req.pipe(upstream)
  })

  // WebSocket / HTTP upgrade passthrough — reconstruct the request line + headers
  // onto a raw TCP connection to the upstream, then pipe both ways.
  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(targetPort, host, () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
      }
      raw += '\r\n'
      upstream.write(raw)
      if (head && head.length) upstream.write(head)
      socket.pipe(upstream)
      upstream.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  return server
}

/**
 * Start every route's server listening. Returns `{ servers, close() }` where
 * `close()` resolves once all servers are shut. Rejects (via the returned
 * promise on the server 'error') if a port can't be bound.
 */
function startProxy(routes, { host = '127.0.0.1' } = {}) {
  const servers = routes.map((route) => {
    const server = createRouteServer(route, host)
    server.listen(route.frontPort, host)
    return server
  })
  return {
    servers,
    close() {
      return Promise.all(
        servers.map((s) => new Promise((resolve) => s.close(() => resolve()))),
      )
    },
  }
}

/**
 * Which of `ports` are already bound (so `connect` can tell the operator to stop
 * main first). Resolves to the list of busy ports. `host` scopes the check.
 */
function portsInUse(ports, host = '127.0.0.1') {
  return Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve) => {
          const tester = net
            .createServer()
            .once('error', () => resolve(port)) // EADDRINUSE → busy
            .once('listening', () => tester.close(() => resolve(null)))
            .listen(port, host)
        }),
    ),
  ).then((results) => results.filter((p) => p !== null))
}

// Does `port` accept a TCP connection right now?
function checkListening(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect(port, host)
    sock.once('connect', () => {
      sock.destroy()
      resolve(true)
    })
    sock.once('error', () => {
      sock.destroy()
      resolve(false)
    })
  })
}

/**
 * Poll until every port in `ports` accepts a connection (the detached proxy has
 * finished binding), or `timeoutMs` elapses. Resolves true when all are up.
 * `now`/`wait` are injectable for tests.
 */
async function waitListening(
  ports,
  { host = '127.0.0.1', timeoutMs = 3000, intervalMs = 50, now = () => Date.now(), wait } = {},
) {
  const sleep = wait || ((ms) => new Promise((r) => setTimeout(r, ms)))
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    const results = await Promise.all(ports.map((p) => checkListening(p, host)))
    if (results.every(Boolean)) return true
    await sleep(intervalMs)
  }
  return false
}

module.exports = { renderRoutes, createRouteServer, startProxy, portsInUse, waitListening }

// Entry point: run as a detached process by the CLI. Reads its routes from a
// file so a re-`connect` just rewrites the file and restarts this (tiny) process.
if (require.main === module) {
  const routesFile = process.argv[2]
  if (!routesFile) {
    process.stderr.write('proxy: usage: node proxy.js <routesFile>\n')
    process.exit(1)
  }
  const routes = JSON.parse(fs.readFileSync(routesFile, 'utf-8'))
  const { close } = startProxy(routes)
  const shutdown = () => close().then(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
