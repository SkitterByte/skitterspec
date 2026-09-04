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
    // Only present when a test asks for it — a bare config() models the existing
    // configs in the wild, which have no teardown block at all.
    ...(overrides.teardown ? { teardown: overrides.teardown } : {}),
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

test('a branch merged into base tears down without --force, and force-deletes', () => {
  // unpushed but already landed on base → nothing to lose, guard passes.
  //
  // `-D`, not `-d`: this is the exact shape /spec-complete leaves behind, and
  // `-d` refuses it. /spec-go pushed the branch at provision time and the phase
  // commits after it were landed rather than pushed, so `origin/feat/thing` is
  // behind — and `-d` declines a branch ahead of its upstream even when every
  // commit of it is already on `main`.
  const p = planDown(spec(), config(), {}, CTX({ unpushed: true, merged: true }))
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git branch -D feat/thing'))
  assert.ok(!p.commands.some((c) => c === 'git branch -d feat/thing'))
})

test('--force overrides the guards (and uses git worktree remove --force)', () => {
  const p = planDown(spec(), config(), { force: true }, CTX({ dirty: true, unpushed: true }))
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git worktree remove --force /wt/thing'))
})

test('a tag-landed hotfix branch tears down without --force, force-deletes the branch', () => {
  // A hotfix is never an ancestor of base, but its head is captured by the deploy
  // tag → safe. Guard passes with no --force, and the branch drop uses -D (the tag
  // holds the commits) since -d would refuse the unmerged branch.
  const p = planDown(
    spec({ branch: 'hotfix/login' }),
    config({ docker: { enabled: false } }),
    {},
    CTX({ unpushed: true, merged: false, reachableFromTag: true }),
  )
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git branch -D hotfix/login'))
  assert.ok(!p.commands.some((c) => c === 'git branch -d hotfix/login'))
})

test('an unpushed hotfix branch NOT yet tagged is still blocked (nothing captures it)', () => {
  const p = planDown(
    spec({ branch: 'hotfix/login' }),
    config(),
    {},
    CTX({ unpushed: true, merged: false, reachableFromTag: false }),
  )
  assert.strictEqual(p.blocked, true)
  assert.match(p.reason, /unpushed/)
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

test('branch delete stays -d for a branch that has NOT landed', () => {
  // The flag tracks one question — are these commits recoverable without the
  // branch? Nothing landed here, so `-d` keeps its veto and a forced teardown
  // fails loudly rather than dropping work.
  const p = planDown(spec(), config(), {}, CTX())
  assert.ok(p.commands.some((c) => c === 'git branch -d feat/thing'), 'plans a -d branch delete')
  assert.ok(!p.commands.some((c) => /branch -D/.test(c)), 'never -D what is not landed')
  // branch delete runs AFTER the worktree remove (which frees the branch)
  const removeIdx = p.commands.findIndex((c) => c.startsWith('git worktree remove'))
  const deleteIdx = p.commands.findIndex((c) => c.startsWith('git branch -d'))
  assert.ok(removeIdx < deleteIdx, 'worktree remove precedes branch delete')
})

test('--force on an unlanded branch still plans -d, so git refuses it', () => {
  // --force overrides OUR guards, never git's. Forcing teardown of work that was
  // never landed removes the worktree and then stops at the branch, which is the
  // point: the commits are still reachable from the branch ref.
  const p = planDown(spec(), config(), { force: true }, CTX({ dirty: true, unpushed: true }))
  assert.strictEqual(p.blocked, false)
  assert.ok(p.commands.some((c) => c === 'git branch -d feat/thing'))
})

test('the delete flag and the unpushed guard read the same landed verdict', () => {
  // They answer one question. If they could disagree, teardown would either block
  // work it could safely drop, or -D work it had just called unsafe.
  for (const state of [{ merged: true }, { reachableFromTag: true }]) {
    const p = planDown(spec(), config(), {}, CTX({ unpushed: true, ...state }))
    assert.strictEqual(p.blocked, false, JSON.stringify(state))
    assert.ok(p.commands.some((c) => c === 'git branch -D feat/thing'), JSON.stringify(state))
  }
})

test('a spec with no branch → no branch-delete command', () => {
  const p = planDown(spec({ branch: undefined }), config(), {}, CTX())
  assert.ok(!p.commands.some((c) => c.startsWith('git branch')), 'no branch delete without a branch')
})

// --- the remote branch ------------------------------------------------------
//
// `/spec-go` pushes the branch at provision time, so without this a completed
// spec leaves a merged branch on the remote forever. The delete is planned into
// `remoteCommands`, NEVER `commands`: a caller running `plan.commands` blind must
// not reach a shared remote.

const LANDED = (over = {}) => CTX({ merged: true, remoteBranch: 'origin/feat/thing', ...over })

test('a landed branch plans the remote delete OUTSIDE the run-blind commands', () => {
  const p = planDown(spec(), config(), {}, LANDED())
  assert.deepStrictEqual(p.remoteCommands, ['git push origin --delete feat/thing'])
  assert.ok(
    !p.commands.some((c) => c.includes('push')),
    'commands must stay safe to run without asking anyone',
  )
  assert.ok(p.commands.some((c) => c === 'git branch -D feat/thing'))
})

test('an unlanded branch plans no remote delete, even under --force', () => {
  // The remote copy is the only backup until the work has landed. --force means
  // "I accept losing this worktree", not "delete my backup too".
  const p = planDown(spec(), config(), { force: true }, CTX({ merged: false, unpushed: true, remoteBranch: 'origin/feat/thing' }))
  assert.strictEqual(p.blocked, false)
  assert.deepStrictEqual(p.remoteCommands, [])
})

test('a hotfix captured by a tag counts as landed', () => {
  // Never an ancestor of base, but the deploy tag holds its commits — the same
  // predicate that earns `-D` earns the remote delete.
  const p = planDown(spec(), config(), {}, CTX({ reachableFromTag: true, remoteBranch: 'origin/feat/thing' }))
  assert.deepStrictEqual(p.remoteCommands, ['git push origin --delete feat/thing'])
})

// --- stays silent -----------------------------------------------------------
//
// The healthy-but-unusual input: a landed spec whose branch was simply never
// pushed. There is nothing to delete and nothing to warn about, and an absence is
// not evidence — the branch may sit on a remote this clone cannot see.

test('a landed branch with NO remote ref plans nothing and says nothing', () => {
  const p = planDown(spec({ stack: 'worktree' }), config(), {}, CTX({ merged: true, remoteBranch: null }))
  assert.strictEqual(p.blocked, false)
  assert.deepStrictEqual(p.remoteCommands, [])
  assert.strictEqual(p.reason, null)
  assert.deepStrictEqual(p.commands, [
    'git worktree remove /wt/thing',
    'git branch -D feat/thing',
  ], 'byte-identical to a teardown that never knew about remotes')
})

test('a spec with no branch at all plans nothing', () => {
  const p = planDown(spec({ branch: null }), config(), {}, LANDED())
  assert.deepStrictEqual(p.remoteCommands, [])
})

// --- policy -----------------------------------------------------------------

test('"never" omits the remote delete entirely', () => {
  const p = planDown(spec(), config({ teardown: { deleteRemoteBranch: 'never' } }), {}, LANDED())
  assert.deepStrictEqual(p.remoteCommands, [])
  assert.ok(!p.commands.some((c) => c.includes('push')))
})

test('"always" folds the push into run-these and leaves no second section', () => {
  const p = planDown(spec(), config({ teardown: { deleteRemoteBranch: 'always' } }), {}, LANDED())
  assert.deepStrictEqual(p.remoteCommands, [])
  assert.strictEqual(p.commands[p.commands.length - 1], 'git push origin --delete feat/thing')
})

test('an absent teardown block behaves as "prompt"', () => {
  const cfg = config()
  assert.ok(!('teardown' in cfg), 'fixture has no teardown block, like every existing config')
  assert.deepStrictEqual(planDown(spec(), cfg, {}, LANDED()).remoteCommands, [
    'git push origin --delete feat/thing',
  ])
})

// --- remotes other than origin ----------------------------------------------

test('a non-origin remote is honoured', () => {
  const p = planDown(spec(), config(), {}, CTX({ merged: true, remoteBranch: 'upstream/feat/thing' }))
  assert.deepStrictEqual(p.remoteCommands, ['git push upstream --delete feat/thing'])
})

test('a slashed branch name splits on the branch, not the first slash', () => {
  const p = planDown(
    spec({ branch: 'feat/deep/nested/thing' }),
    config(),
    {},
    CTX({ merged: true, remoteBranch: 'origin/feat/deep/nested/thing' }),
  )
  assert.deepStrictEqual(p.remoteCommands, ['git push origin --delete feat/deep/nested/thing'])
})

test('a remote ref that maps to a different branch name plans nothing', () => {
  // A push refspec can map local `feat/thing` to something else on the remote.
  // We cannot tell what to delete, so we guess at nothing on a shared remote.
  const p = planDown(spec(), config(), {}, CTX({ merged: true, remoteBranch: 'origin/renamed-elsewhere' }))
  assert.deepStrictEqual(p.remoteCommands, [])
})

test('a blocked plan carries an empty remoteCommands', () => {
  const p = planDown(spec(), config(), {}, CTX({ dirty: true, merged: true, remoteBranch: 'origin/feat/thing' }))
  assert.strictEqual(p.blocked, true)
  assert.deepStrictEqual(p.remoteCommands, [])
})
