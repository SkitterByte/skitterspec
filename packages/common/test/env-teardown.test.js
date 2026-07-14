'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planDown } = require('../src/env/teardown.js')

function spec(overrides = {}) {
  return {
    folder: 'feat-thing',
    slug: 'thing',
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

test('blocks on unpushed, unmerged commits', () => {
  const p = planDown(spec(), config(), {}, CTX({ unpushed: true, merged: false }))
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /unpushed/)
})

test('a branch merged into base tears down without --force', () => {
  // unpushed but already landed on base → nothing to lose, guard passes.
  const p = planDown(spec(), config(), {}, CTX({ unpushed: true, merged: true }))
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git branch -d feat/thing'))
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
    'git branch -d feat/thing',
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
    'git branch -d feat/thing',
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
  assert.deepStrictEqual(p.commands, ['git worktree remove /wt/thing', 'git branch -d feat/thing'])
})

test('guard toggles: dirty allowed when refuseTeardownIfDirty is false', () => {
  const p = planDown(spec(), config({ guards: { refuseTeardownIfDirty: false } }), {}, CTX({ dirty: true }))
  assert.strictEqual(p.blocked, false)
})

test('worktree-only spec → only worktree remove + branch delete, master switch on', () => {
  const p = planDown(spec({ stack: 'worktree' }), config(), {}, CTX())
  assert.strictEqual(p.blocked, false)
  assert.strictEqual(p.volumesDropped, false)
  assert.strictEqual(p.backupCommand, null)
  assert.deepStrictEqual(p.commands, ['git worktree remove /wt/thing', 'git branch -d feat/thing'])
})

test('docker spec → down --volumes + worktree remove + branch delete (Stack drives it)', () => {
  const p = planDown(spec({ stack: 'docker' }), config(), {}, CTX())
  assert.strictEqual(p.volumesDropped, true)
  assert.deepStrictEqual(p.commands, [
    'docker compose --project-name app_thing down --volumes',
    'git worktree remove /wt/thing',
    'git branch -d feat/thing',
  ])
})

test('branch delete is -d (merged-only), never -D', () => {
  const p = planDown(spec(), config(), {}, CTX())
  assert.ok(p.commands.some((c) => c === 'git branch -d feat/thing'), 'plans a -d branch delete')
  assert.ok(!p.commands.some((c) => /branch -D/.test(c)), 'never uses -D')
  // branch delete runs AFTER the worktree remove (which frees the branch)
  const removeIdx = p.commands.findIndex((c) => c.startsWith('git worktree remove'))
  const deleteIdx = p.commands.findIndex((c) => c.startsWith('git branch -d'))
  assert.ok(removeIdx < deleteIdx, 'worktree remove precedes branch delete')
})

test('a spec with no branch → no branch-delete command', () => {
  const p = planDown(spec({ branch: undefined }), config(), {}, CTX())
  assert.ok(!p.commands.some((c) => c.startsWith('git branch')), 'no branch delete without a branch')
})
