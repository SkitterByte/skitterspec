'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp, seedCommandFor } = require('../src/env/provision.js')

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
    setup: overrides.setup || [],
    seedFiles: overrides.seedFiles || { mode: 'symlink', files: [] },
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

// --- Hotfix: fork the fresh branch from the base tag ---

test('hotfix: fresh branch forks from baseRef (the release tag)', () => {
  const hotfix = spec({
    folder: 'hotfix-login',
    slug: 'login',
    type: 'hotfix',
    branch: 'hotfix/login',
    stack: 'worktree',
    baseRef: 'v33.16.4',
  })
  const plan = planUp(hotfix, { slot: null, attached: false }, config({ docker: { enabled: false } }))
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b hotfix/login v33.16.4'])
})

test('hotfix: attach form ignores baseRef (branch already forked)', () => {
  const hotfix = spec({ type: 'hotfix', branch: 'hotfix/login', stack: 'worktree', baseRef: 'v33.16.4' })
  const plan = planUp(hotfix, { slot: null, attached: true }, config({ docker: { enabled: false } }))
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing hotfix/login'])
})

test('non-hotfix baseRef:null keeps the plain -b form (fork from HEAD)', () => {
  const plan = planUp(spec({ baseRef: null, stack: 'worktree' }), { slot: null, attached: false }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
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

test('setupCommands defaults to empty when none configured', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config())
  assert.deepStrictEqual(plan.setupCommands, [])
})

test('setupCommands expand tokens (slug/branch/worktreePath/portOffset)', () => {
  const plan = planUp(
    spec(),
    { slot: 2, attached: false },
    config({ setup: ['pnpm install', 'echo {slug} {branch} {worktreePath} {portOffset}'] }),
  )
  assert.deepStrictEqual(plan.setupCommands, [
    'pnpm install',
    'echo thing feat/thing /wt/thing 3020',
  ])
})

test('setupCommands are emitted on re-attach too', () => {
  const plan = planUp(spec(), { slot: 0, attached: true }, config({ setup: ['pnpm install'] }))
  assert.deepStrictEqual(plan.setupCommands, ['pnpm install'])
})

test('setupCommands are emitted on a worktree-only spec (empty portOffset token)', () => {
  const plan = planUp(
    spec({ stack: 'worktree' }),
    { slot: null, attached: false },
    config({ setup: ['pnpm install # {portOffset}'] }),
  )
  assert.deepStrictEqual(plan.setupCommands, ['pnpm install # '])
})

// --- seedFiles ---

test('seedCommands defaults to empty when no seedFiles configured', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config())
  assert.deepStrictEqual(plan.seedCommands, [])
})

test('seedCommands: one idempotent, git-common-dir-anchored command per file', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env', '.local-secrets.jsonc'] } }),
  )
  assert.strictEqual(plan.seedCommands.length, 2)
  for (const cmd of plan.seedCommands) {
    // resolves the main checkout from inside the worktree — never a hardcoded hop
    assert.match(cmd, /m="\$\(dirname "\$\(git rev-parse --git-common-dir\)"\)"/)
    assert.match(cmd, /not in main — skipped/) // missing-source no-op
    assert.match(cmd, /exists — skipped/) // target-exists idempotency
  }
  assert.match(plan.seedCommands[0], /ln -s "\$m\/\.env" "\.env"/)
  assert.match(plan.seedCommands[0], /seeded \.env → \$m\/\.env/)
})

test('seedCommands: copy mode uses cp, not ln -s', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: false },
    config({ seedFiles: { mode: 'copy', files: ['.env'] } }),
  )
  assert.match(plan.seedCommands[0], /cp "\$m\/\.env" "\.env"/)
  assert.doesNotMatch(plan.seedCommands[0], /ln -s/)
})

test('seedCommands: array shorthand defaults to symlink mode', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] } }),
  )
  assert.match(plan.seedCommands[0], /ln -s /)
})

test('seedCommands are emitted on re-attach too (idempotent seeding)', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: true },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] } }),
  )
  assert.strictEqual(plan.seedCommands.length, 1)
})

test('seedCommandFor: symlink vs copy op selection', () => {
  assert.match(seedCommandFor('.env', 'symlink'), /ln -s "\$m\/\.env" "\.env"/)
  assert.match(seedCommandFor('.env', 'copy'), /cp "\$m\/\.env" "\.env"/)
  // unknown mode falls back to symlink
  assert.match(seedCommandFor('.env', 'weird'), /ln -s /)
})
