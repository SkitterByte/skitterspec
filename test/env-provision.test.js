'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp } = require('../src/env/provision.js')

// A resolved-spec stand-in (planUp only reads these fields).
function spec(overrides = {}) {
  return {
    folder: 'feat-thing',
    slug: 'thing',
    type: 'feat',
    branch: 'feat/thing',
    worktreePath: '/wt/thing',
    projectName: 'app_thing',
    ...overrides,
  }
}

function config(overrides = {}) {
  return {
    docker: {
      enabled: true,
      portBase: 3000,
      portsPerSpec: 10,
      envFile: '.env',
      ...(overrides.docker || {}),
    },
    open: { command: '', ...(overrides.open || {}) },
  }
}

test('fresh spec → -b branch form + docker up, correct port offset', () => {
  const plan = planUp(spec(), { slot: 1, attached: false }, config())
  assert.strictEqual(plan.attached, false)
  assert.strictEqual(plan.portOffset, 3010) // 3000 + 1*10
  assert.deepStrictEqual(plan.commands, [
    'git worktree add /wt/thing -b feat/thing',
    'docker compose --project-name app_thing up -d',
  ])
  assert.strictEqual(plan.envContents, 'COMPOSE_PROJECT_NAME=app_thing\nPORT_OFFSET=3010\n')
})

test('already-provisioned spec → attach form (no -b)', () => {
  const plan = planUp(spec(), { slot: 0, attached: true }, config())
  assert.strictEqual(plan.attached, true)
  assert.strictEqual(plan.portOffset, 3000)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing feat/thing')
})

test('docker.enabled:false omits the docker command', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config({ docker: { enabled: false } }))
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('openCommand expands tokens when open.command is set', () => {
  const plan = planUp(
    spec(),
    { slot: 2, attached: false },
    config({ open: { command: 'code {worktreePath} # {portOffset}' } }),
  )
  assert.strictEqual(plan.openCommand, 'code /wt/thing # 3020')
})

test('openCommand is null when open.command is empty', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config())
  assert.strictEqual(plan.openCommand, null)
})

test('port offset scales with the slot', () => {
  assert.strictEqual(planUp(spec(), { slot: 0, attached: false }, config()).portOffset, 3000)
  assert.strictEqual(planUp(spec(), { slot: 5, attached: false }, config()).portOffset, 3050)
})
