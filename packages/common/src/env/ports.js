'use strict'

/**
 * Port probes, dependency-free. `portsInUse` and `portsInUseOn` BIND (may a new
 * listener have this port?), used by the review server before it starts.
 * `portsAnswering` and `waitListening` CONNECT (is something serving it?),
 * used by `live take`'s dev-server probe and by the review server's start-up
 * proof. They lived in the connect proxy's module until the proxy was removed.
 */

const net = require('node:net')

/**
 * Which of `ports` are already bound on `host`, found by trying to bind each.
 * Resolves to the list of busy ports.
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
 * Poll until every port in `ports` accepts a connection (a detached server has
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


/**
 * Ask whether `port` is free on EVERY host it will need, one host at a time.
 *
 * SEQUENTIAL IS THE WHOLE POINT, and it is not a style choice. The probe works
 * by binding, so two probes of the same port running concurrently contend with
 * each other — and on Linux a wildcard bind and a loopback bind of one port are
 * mutually exclusive, so the pair reports a completely free port as busy. The
 * review server then refused to start on every Linux machine, which is to say
 * on CI, while every macOS run stayed green because BSD lets the two coexist.
 *
 * Probing one host at a time asks the question that was always intended — is
 * anything ELSE holding this port — instead of racing the caller against
 * itself. Verified on node:24-alpine: parallel reports busy on a free port,
 * sequential does not; both still refuse a real squatter on either address.
 *
 * `probe` is injectable so the concurrency can be asserted without sockets.
 */
async function portsInUseOn(port, hosts, probe = portsInUse) {
  const busy = []
  for (const host of [...new Set(hosts)]) {
    busy.push(...(await probe([port], host)))
  }
  return [...new Set(busy)]
}

/**
 * Which of `ports` accept a connection on `host` — "is a dev server running?".
 *
 * CONNECTS, never binds. A bind probe on 127.0.0.1 SUCCEEDS on macOS beside a
 * server listening on every address (Vite `host: true`, Fastify `0.0.0.0`),
 * because BSD lets the two coexist, so it read a running phone-on-wifi dev
 * server as absent. Linux refuses the second bind, which is why CI never saw
 * it. A server that answers is running on any OS. What could still fool it: a
 * server bound only to a non-loopback address, which `host` does not reach.
 */
async function portsAnswering(ports, host = '127.0.0.1') {
  const results = await Promise.all(ports.map((p) => checkListening(p, host)))
  return ports.filter((_, i) => results[i])
}

module.exports = {
  portsInUse,
  portsInUseOn,
  portsAnswering,
  waitListening,
}
