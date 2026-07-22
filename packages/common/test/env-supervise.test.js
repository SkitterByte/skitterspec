'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const net = require('node:net')
const path = require('node:path')

const { startProcess, stopProcess, waitHealthy, readPid } = require('../src/env/supervise.js')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-superv-'))
}

// Grab a free TCP port by binding to 0, then releasing it.
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

// A planned proc that starts a tiny HTTP fixture on `port`, answering any path.
function fixtureProc(port, { name = 'fix' } = {}) {
  const script = "require('http').createServer((q,r)=>r.end('ok')).listen(" + port + ")"
  return {
    name,
    command: `node -e "${script}"`,
    env: {},
    logFile: `.spec-env/logs/${name}.log`,
    pidFile: `.spec-env/pids/${name}.pid`,
    health: `http://127.0.0.1:${port}/health`,
  }
}

test('startProcess spawns detached, writes a pid file, becomes healthy; stopProcess kills it', async () => {
  const rootDir = tmpDir()
  const port = await freePort()
  const proc = fixtureProc(port)
  try {
    const res = startProcess(proc, { cwd: rootDir, rootDir })
    assert.strictEqual(res.started, true)
    assert.ok(Number.isInteger(res.pid))
    assert.ok(fs.existsSync(res.pidFile), 'pid file written')
    assert.strictEqual(readPid(res.pidFile), res.pid)

    const healthy = await waitHealthy(proc.health, { timeoutMs: 5000, intervalMs: 100 })
    assert.strictEqual(healthy, true, 'fixture became reachable')
  } finally {
    const res = await stopProcess(proc, { rootDir, graceMs: 2000 })
    assert.strictEqual(res.stopped, true)
  }

  // pid file removed and the port is free again (unreachable within the window).
  assert.strictEqual(fs.existsSync(path.resolve(rootDir, proc.pidFile)), false)
  const stillUp = await waitHealthy(proc.health, { timeoutMs: 800, intervalMs: 100 })
  assert.strictEqual(stillUp, false, 'fixture no longer reachable after stop')
})

test('startProcess is idempotent — a live pid file means "already running"', async () => {
  const rootDir = tmpDir()
  const port = await freePort()
  const proc = fixtureProc(port, { name: 'idem' })
  try {
    const first = startProcess(proc, { cwd: rootDir, rootDir })
    assert.strictEqual(first.started, true)
    await waitHealthy(proc.health, { timeoutMs: 5000, intervalMs: 100 })

    const second = startProcess(proc, { cwd: rootDir, rootDir })
    assert.strictEqual(second.started, false)
    assert.strictEqual(second.pid, first.pid)
  } finally {
    await stopProcess(proc, { rootDir, graceMs: 2000 })
  }
})

test('stopProcess is a clean no-op when nothing is running', async () => {
  const rootDir = tmpDir()
  const proc = fixtureProc(12345, { name: 'ghost' })
  const res = await stopProcess(proc, { rootDir })
  assert.strictEqual(res.stopped, false)
  assert.strictEqual(res.pid, null)
})

test('waitHealthy returns false when the URL never answers (within timeout)', async () => {
  const port = await freePort() // nothing is listening here
  const ok = await waitHealthy(`http://127.0.0.1:${port}/`, { timeoutMs: 600, intervalMs: 100 })
  assert.strictEqual(ok, false)
})

test('waitHealthy short-circuits true when there is no health url', async () => {
  assert.strictEqual(await waitHealthy(null), true)
  assert.strictEqual(await waitHealthy(''), true)
})
