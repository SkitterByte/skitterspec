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

test('stack:worktree omits the docker command even with the master switch on', () => {
  const plan = planUp(spec({ stack: 'worktree' }), { slot: 0, attached: false }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('worktree-only: no slot/portOffset/env, single git command', () => {
  const plan = planUp(spec({ stack: 'worktree' }), { slot: null, attached: false }, config())
  assert.strictEqual(plan.slot, null)
  assert.strictEqual(plan.portOffset, null)
  assert.strictEqual(plan.envContents, null)
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('worktree-only attach form: existing worktree → no -b', () => {
  const plan = planUp(spec({ stack: 'worktree' }), { slot: null, attached: true }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing feat/thing'])
})

test('worktree-only still expands the opener (empty portOffset token)', () => {
  const plan = planUp(
    spec({ stack: 'worktree' }),
    { slot: null, attached: false },
    config({ open: { command: 'code {worktreePath} # {portOffset}' } }),
  )
  assert.strictEqual(plan.openCommand, 'code /wt/thing # ')
})

test('stack:docker emits the docker command when the master switch is on', () => {
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config())
  assert.deepStrictEqual(plan.commands, [
    'git worktree add /wt/thing -b feat/thing',
    'docker compose --project-name app_thing up -d',
  ])
})

test('stack:docker is still suppressed when the master switch is off', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 0, attached: false },
    config({ docker: { enabled: false } }),
  )
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
