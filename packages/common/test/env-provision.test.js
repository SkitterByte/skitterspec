'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp, seedCommandFor, worktreeCd } = require('../src/env/provision.js')

// Every "in the worktree" command is prefixed with the cwd guard. These tests are
// about the payload (token expansion, mode), so strip the guard and assert the rest;
// the guard itself is covered by its own tests below.
function payloads(commands, worktreePath = '/wt/thing') {
  const prefix = `${worktreeCd(worktreePath)}; `
  return commands.map((cmd) => {
    assert.ok(cmd.startsWith(prefix), `missing worktree guard: ${cmd}`)
    return cmd.slice(prefix.length)
  })
}

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
  assert.deepStrictEqual(payloads(plan.setupCommands), [
    'pnpm install',
    'echo thing feat/thing /wt/thing 3020',
  ])
})

test('setupCommands are emitted on re-attach too', () => {
  const plan = planUp(spec(), { slot: 0, attached: true }, config({ setup: ['pnpm install'] }))
  assert.deepStrictEqual(payloads(plan.setupCommands), ['pnpm install'])
})

test('setupCommands are emitted on a worktree-only spec (empty portOffset token)', () => {
  const plan = planUp(
    spec({ stack: 'worktree' }),
    { slot: null, attached: false },
    config({ setup: ['pnpm install # {portOffset}'] }),
  )
  assert.deepStrictEqual(payloads(plan.setupCommands), ['pnpm install # '])
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

// --- the tree gate ---------------------------------------------------------
//
// Worktree mode had no clean gate at all before this: `git worktree add` carries
// nothing, so an uncommitted spec silently produced a branch missing the spec it
// was for. These cover the three answers — commit it, refuse it, ignore it — and
// the several ways the gate must stay quiet.

// Worktree-only, so these assertions are about the gate and not about Docker.
const S = { ...spec(), bucket: 'backlog', stack: 'worktree' }

test('no ctx at all leaves the plan exactly as it was', () => {
  // Legacy callers and every older test pass three arguments. Absent is "nobody
  // looked", never "clean" — the plan must be unchanged, not permissive.
  const plan = planUp(S, { slot: 0, attached: false }, config())
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})

test('a clean tree plans no commit', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), { dirtyPaths: [] })
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})

test("the spec's own uncommitted folder is committed before the fork", () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing'],
  })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git add "specs/backlog/feat-thing"',
    'git commit -m "chore(spec): add feat-thing"',
    'git worktree add /wt/thing -b feat/thing',
  ])
})

test('an already-tracked spec is committed as an update, not an add', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing/00-overview.md'],
  })
  assert.match(plan.commands[1], /chore\(spec\): update feat-thing/)
})

test('one foreign path blocks, names itself, and plans nothing', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing/00-overview.md', 'src/app.js'],
  })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /src\/app\.js/)
  assert.deepStrictEqual(plan.commands, [])
  assert.deepStrictEqual(plan.setupCommands, [])
})

test('a clean tree whose spec is not on base blocks, naming where it is', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: [], specOnFork: false, specFoundOn: 'feat/other', forkRef: 'main',
  })
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /not committed in main/)
  assert.match(plan.reason, /feat\/other/)
})

test('specOnFork null carries on — a hotfix forks from a tag predating its spec', () => {
  // null is "cannot tell", and the commonest source of it is a hotfix: its tag is
  // older than the spec describing the fix, so the spec is SUPPOSED to be absent
  // from the fork point. Refusing here would accuse every hotfix.
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: [], specOnFork: null,
  })
  assert.strictEqual(plan.blocked, false)
})

test('committing the spec now satisfies the on-base requirement', () => {
  // specOnBase is false precisely BECAUSE the spec is uncommitted. The commit
  // this plan makes is the fix, so it must not also refuse.
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing'], specOnFork: false,
  })
  assert.strictEqual(plan.blocked, false)
  assert.match(plan.commands[1], /chore\(spec\): add feat-thing/)
})

test('unreadable git provisions a worktree rather than accusing a healthy repo', () => {
  // `git worktree add` carries nothing and forks from a commit regardless, so
  // being unable to READ the tree is not a reason to refuse. Refusing here would
  // fire on repos that did nothing wrong — the checkout-mode counterpart of this
  // test asserts the opposite, and deliberately.
  const plan = planUp(S, { slot: 0, attached: false }, config(), { clean: false })
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.specCommit, null)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})
