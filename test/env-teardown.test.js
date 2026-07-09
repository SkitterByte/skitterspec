'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planDown } = require('../src/env/teardown.js')

function spec(overrides = {}) {
  return {
    folder: 'feat-thing',
    slug: 'thing',
    worktreePath: '/wt/thing',
    projectName: 'app_thing',
    ...overrides,
  }
}

function config(overrides = {}) {
  return {
    docker: {
      enabled: true,
      backupCommand: '',
      ...(overrides.docker || {}),
    },
    guards: {
      refuseTeardownIfDirty: true,
      refuseTeardownIfUnpushed: true,
      ...(overrides.guards || {}),
    },
  }
}

const CTX = (worktreeState = {}) => ({ worktreeState, timestamp: '20260708-120000' })

test('blocks on a dirty worktree', () => {
  const p = planDown(spec(), config(), {}, CTX({ dirty: true }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /uncommitted/)
  assert.deepStrictEqual(p.commands, [])
})

test('blocks on unpushed commits', () => {
  const p = planDown(spec(), config(), {}, CTX({ unpushed: true }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /unpushed/)
})

test('--force overrides the guards (and uses git worktree remove --force)', () => {
  const p = planDown(spec(), config(), { force: true }, CTX({ dirty: true, unpushed: true }))
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git worktree remove --force /wt/thing'))
})

test('clean worktree → down --volumes + worktree remove, volumes dropped', () => {
  const p = planDown(spec(), config(), {}, CTX())
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.volumesDropped, true)
  assert.deepStrictEqual(p.commands, [
    'docker compose --project-name app_thing down --volumes',
    'git worktree remove /wt/thing',
  ])
})

test('--keep-volumes → plain down, no backup, volumes kept', () => {
  const p = planDown(
    spec(),
    config({ docker: { backupCommand: 'pg_dump > {backupPath}' } }),
    { keepVolumes: true },
    CTX(),
  )
  assert.strictEqual(p.volumesDropped, false)
  assert.strictEqual(p.backupCommand, null)
  assert.deepStrictEqual(p.commands, [
    'docker compose --project-name app_thing down',
    'git worktree remove /wt/thing',
  ])
})

test('backupCommand set → pre-drop backup command with expanded path', () => {
  const p = planDown(
    spec(),
    config({ docker: { backupCommand: 'pg_dump app > {backupPath}' } }),
    {},
    CTX(),
  )
  assert.strictEqual(p.backupPath, '.spec-env/backups/thing-20260708-120000.dump')
  assert.strictEqual(p.backupCommand, 'pg_dump app > .spec-env/backups/thing-20260708-120000.dump')
  // backup runs BEFORE the down
  assert.strictEqual(p.commands[0], p.backupCommand)
  assert.strictEqual(p.commands[1], 'docker compose --project-name app_thing down --volumes')
})

test('backupCommand unset → no backup command', () => {
  const p = planDown(spec(), config(), {}, CTX())
  assert.strictEqual(p.backupCommand, null)
  assert.strictEqual(p.backupPath, null)
})

test('docker.enabled:false → no backup, no down, just worktree remove', () => {
  const p = planDown(
    spec(),
    config({ docker: { enabled: false, backupCommand: 'pg_dump > {backupPath}' } }),
    {},
    CTX(),
  )
  assert.strictEqual(p.volumesDropped, false)
  assert.strictEqual(p.backupCommand, null)
  assert.deepStrictEqual(p.commands, ['git worktree remove /wt/thing'])
})

test('guard toggles: dirty allowed when refuseTeardownIfDirty is false', () => {
  const p = planDown(spec(), config({ guards: { refuseTeardownIfDirty: false } }), {}, CTX({ dirty: true }))
  assert.strictEqual(p.blocked, false)
})

test('worktree-only spec → only worktree remove, even with the master switch on', () => {
  const p = planDown(spec({ stack: 'worktree' }), config(), {}, CTX())
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.volumesDropped, false)
  assert.strictEqual(p.backupCommand, null)
  assert.deepStrictEqual(p.commands, ['git worktree remove /wt/thing'])
})

test('docker spec → down --volumes + worktree remove (Stack drives it)', () => {
  const p = planDown(spec({ stack: 'docker' }), config(), {}, CTX())
  assert.strictEqual(p.volumesDropped, true)
  assert.deepStrictEqual(p.commands, [
    'docker compose --project-name app_thing down --volumes',
    'git worktree remove /wt/thing',
  ])
})
