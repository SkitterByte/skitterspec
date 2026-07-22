'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planDev, stateDir } = require('../src/env/dev.js')

// A minimal config like loadEnvConfig produces (only the fields planDev reads).
function cfg(dev, over = {}) {
  return {
    docker: { portBase: 3000, portsPerSpec: 10 },
    registry: '.spec-env/registry.json',
    dev,
    ...over,
  }
}

const SPEC = { folder: 'feat-demo', slug: 'demo' }

test('planDev assigns ports base + slot*portsPerSpec + index', () => {
  const config = cfg([
    { name: 'api', command: 'run-api', portVar: 'API_PORT' },
    { name: 'ui', command: 'run-ui', portVar: 'PORT' },
  ])
  const plan = planDev(SPEC, 2, config) // slot 2 → base 3020
  assert.strictEqual(plan.slot, 2)
  assert.strictEqual(plan.portOffset, 3020)
  assert.strictEqual(plan.procs[0].port, 3020)
  assert.strictEqual(plan.procs[1].port, 3021)
})

test('planDev injects the port env var and expands {portVar}/{port} tokens', () => {
  const config = cfg([
    {
      name: 'api',
      command: 'serve --port {API_PORT}',
      portVar: 'API_PORT',
      health: 'http://localhost:{API_PORT}/health',
    },
  ])
  const proc = planDev(SPEC, 0, config).procs[0] // base 3000
  assert.deepStrictEqual(proc.env, { API_PORT: '3000' })
  assert.strictEqual(proc.command, 'serve --port 3000')
  assert.strictEqual(proc.health, 'http://localhost:3000/health')
})

test('planDev derives log/pid paths beside the registry, keyed by folder', () => {
  const proc = planDev(SPEC, 0, cfg([{ name: 'ui', command: 'run', portVar: 'PORT' }])).procs[0]
  assert.strictEqual(proc.logFile, '.spec-env/logs/feat-demo-ui.log')
  assert.strictEqual(proc.pidFile, '.spec-env/pids/feat-demo-ui.pid')
})

test('planDev passes frontPort through (null when unset) and health null when absent', () => {
  const config = cfg([
    { name: 'api', command: 'run', portVar: 'PORT', frontPort: 8080 },
    { name: 'worker', command: 'run', portVar: 'WPORT' },
  ])
  const [api, worker] = planDev(SPEC, 0, config).procs
  assert.strictEqual(api.frontPort, 8080)
  assert.strictEqual(worker.frontPort, null)
  assert.strictEqual(worker.health, null)
})

test('planDev with no dev entries → empty procs', () => {
  assert.deepStrictEqual(planDev(SPEC, 0, cfg([])).procs, [])
})

test('stateDir follows a custom registry location', () => {
  assert.strictEqual(stateDir({ registry: '.spec-env/registry.json' }), '.spec-env')
  assert.strictEqual(stateDir({ registry: 'var/isolation/reg.json' }), 'var/isolation')
})
