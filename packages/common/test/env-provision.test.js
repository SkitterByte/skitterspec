'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp } = require('../src/env/provision.js')

// The worktree steps `spec-env bootstrap` runs, by kind. They are data now, so
// these tests assert on fields rather than on a shell string's text.
const of = (plan, kind) => plan.steps.filter((s) => s.kind === kind)
const setupOf = (plan) => of(plan, 'setup').map((s) => s.command)

// A resolved-spec stand-in (planUp only reads these fields).
function spec(overrides = {}) {
  return {
    folder: 'feat-thing',
    slug: 'thing',
    type: 'feat',
    branch: 'feat/thing',
    worktreePath: '/wt/thing',
    ...overrides,
  }
}

function config(overrides = {}) {
  return {
    open: { command: '', ...(overrides.open || {}) },
    setup: overrides.setup || [],
    seedFiles: overrides.seedFiles || { mode: 'symlink', files: [] },
  }
}

test('fresh spec → -b branch form, a single git command', () => {
  const plan = planUp(spec(), { attached: false }, config())
  assert.strictEqual(plan.attached, false)
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('already-provisioned spec → attach form (no -b)', () => {
  const plan = planUp(spec(), { attached: true }, config())
  assert.strictEqual(plan.attached, true)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing feat/thing')
})

// Per-spec Docker stacks were removed: a spec whose header still asks for one
// is planned exactly like any other (feat-drop-docker-stacks).
test('a legacy docker header plans no stack, no env file and no port block', () => {
  const plan = planUp(spec({ stack: 'docker', legacyDockerStack: true }), { attached: false }, config({ setup: ['pnpm i'] }))
  assert.deepStrictEqual(plan.steps.map((s) => s.kind), ['setup'])
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
  for (const gone of ['slot', 'portOffset', 'envContents', 'projectName']) {
    assert.ok(!(gone in plan), `${gone} is no longer planned`)
  }
})

test('worktree-only attach form: existing worktree → no -b', () => {
  const plan = planUp(spec({ stack: 'worktree' }), { attached: true }, config())
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
  const plan = planUp(hotfix, { attached: false }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b hotfix/login v33.16.4'])
})

test('hotfix: attach form ignores baseRef (branch already forked)', () => {
  const hotfix = spec({ type: 'hotfix', branch: 'hotfix/login', stack: 'worktree', baseRef: 'v33.16.4' })
  const plan = planUp(hotfix, { attached: true }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing hotfix/login'])
})

test('non-hotfix baseRef:null keeps the plain -b form (fork from HEAD)', () => {
  const plan = planUp(spec({ baseRef: null, stack: 'worktree' }), { attached: false }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('worktree-only still expands the opener (empty portOffset token)', () => {
  const plan = planUp(
    spec({ stack: 'worktree' }),
    { attached: false },
    config({ open: { command: 'code {worktreePath} # {portOffset}' } }),
  )
})

test('setup steps defaults to empty when none configured', () => {
  const plan = planUp(spec(), { attached: false }, config())
  assert.deepStrictEqual(setupOf(plan), [])
})

test('setup steps expand tokens (slug/branch/worktreePath)', () => {
  const plan = planUp(
    spec(),
    { attached: false },
    config({ setup: ['pnpm install', 'echo {slug} {branch} {worktreePath}'] }),
  )
  assert.deepStrictEqual(setupOf(plan), ['pnpm install', 'echo thing feat/thing /wt/thing'])
})

test('setup steps are emitted on re-attach too', () => {
  const plan = planUp(spec(), { attached: true }, config({ setup: ['pnpm install'] }))
  assert.deepStrictEqual(setupOf(plan), ['pnpm install'])
})

// `{portOffset}` and `{projectName}` named the Docker stack's port block and
// compose project. Nothing fills them now, so they are left as written.
test('setup steps leave the retired Docker tokens unexpanded', () => {
  const plan = planUp(spec(), { attached: false }, config({ setup: ['echo {portOffset} {projectName}'] }))
  assert.deepStrictEqual(setupOf(plan), ['echo {portOffset} {projectName}'])
})

// --- seedFiles ---

test('no seed steps when no seedFiles configured', () => {
  const plan = planUp(spec(), { attached: false }, config())
  assert.deepStrictEqual(of(plan, 'seed'), [])
})

test('one seed step per file, in order, carrying its mode', () => {
  const plan = planUp(
    spec(),
    { attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env', '.local-secrets.jsonc'] } }),
  )
  assert.deepStrictEqual(of(plan, 'seed'), [
    { kind: 'seed', file: '.env', mode: 'symlink' },
    { kind: 'seed', file: '.local-secrets.jsonc', mode: 'symlink' },
  ])
})

test('seed steps: copy mode is carried through', () => {
  const plan = planUp(
    spec(),
    { attached: false },
    config({ seedFiles: { mode: 'copy', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed')[0].mode, 'copy')
})

test('seed steps: an unknown mode falls back to symlink', () => {
  const plan = planUp(
    spec(),
    { attached: false },
    config({ seedFiles: { mode: 'weird', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed')[0].mode, 'symlink')
})

test('seed steps are planned on re-attach too (idempotent seeding)', () => {
  const plan = planUp(
    spec(),
    { attached: true },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed').length, 1)
})

test('stays silent: the plan carries no shell for a caller to copy', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] }, setup: ['pnpm install'] })
  )
  for (const gone of ['seedCommands', 'envCommands', 'setupCommands', 'dockerCommands']) {
    assert.ok(!(gone in plan), `${gone} is gone`)
  }
  assert.ok(!plan.commands.some((c) => /\.env|ln -s|rev-parse/.test(c)))
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
  const plan = planUp(S, { attached: false }, config())
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})

test('a clean tree plans no commit', () => {
  const plan = planUp(S, { attached: false }, config(), { dirtyPaths: [] })
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})

test("the spec's own uncommitted folder is committed before the fork", () => {
  const plan = planUp(S, { attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing'],
  })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git add -- "specs/backlog/feat-thing"',
    'git commit -m "chore(spec): add feat-thing" -- "specs/backlog/feat-thing"',
    'git worktree add /wt/thing -b feat/thing',
  ])
})

test('an already-tracked spec is committed as an update, not an add', () => {
  const plan = planUp(S, { attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing/00-overview.md'],
  })
  assert.match(plan.commands[1], /chore\(spec\): update feat-thing/)
})

// This USED to refuse, and the refusal was the reason the spec that changed it
// existed: `git worktree add` carries nothing, so another spec's uncommitted work
// cannot reach the new branch, and the only write to the primary checkout is a
// pathspec-limited commit of this spec's own paths. Refusing fired on the
// commonest tree this workflow produces — author spec B while A is uncommitted,
// then start B — and prevented nothing. Checkout mode still refuses; see
// env-provision-checkout.test.js, where `git switch -c` really does carry it.
test('foreign dirt does not block a worktree, and is reported instead', () => {
  const plan = planUp(S, { attached: false }, config(), {
    dirtyPaths: ['specs/backlog/feat-thing/00-overview.md', 'src/app.js'],
  })
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.reason, null)
  assert.deepStrictEqual(plan.untouched, ['src/app.js'], 'the foreign path is reported')
  assert.deepStrictEqual(
    plan.specCommit.paths,
    ['specs/backlog/feat-thing/00-overview.md'],
    'and the commit still names only this spec’s own',
  )
  assert.ok(
    plan.commands.some((c) => c.startsWith('git worktree add')),
    'it provisions',
  )
  assert.ok(
    !plan.commands.some((c) => c.includes('src/app.js')),
    'no command touches the foreign path',
  )
})

// Nothing of this spec's is uncommitted, but somebody else's is. There is no
// commit to plan and still something to report.
test('foreign dirt alone is reported, with no commit planned', () => {
  const plan = planUp(S, { attached: false }, config(), {
    dirtyPaths: ['src/app.js'],
  })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.untouched, ['src/app.js'])
  assert.strictEqual(plan.specCommit, null)
})

// STAYS-SILENT: the healthy tree must not grow a report about nothing.
test('a clean tree reports nothing untouched', () => {
  const plan = planUp(S, { attached: false }, config(), { dirtyPaths: [] })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.untouched, [])
})

test('a clean tree whose spec is not on base blocks, naming where it is', () => {
  const plan = planUp(S, { attached: false }, config(), {
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
  const plan = planUp(S, { attached: false }, config(), {
    dirtyPaths: [], specOnFork: null,
  })
  assert.strictEqual(plan.blocked, false)
})

test('committing the spec now satisfies the on-base requirement', () => {
  // specOnBase is false precisely BECAUSE the spec is uncommitted. The commit
  // this plan makes is the fix, so it must not also refuse.
  const plan = planUp(S, { attached: false }, config(), {
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
  const plan = planUp(S, { attached: false }, config(), { clean: false })
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.specCommit, null)
  assert.strictEqual(plan.commands[0], 'git worktree add /wt/thing -b feat/thing')
})

// STAYS SILENT: no plan writes an env file or starts a stack, --docs included.
test('stays silent: no plan has an env file or a compose step', () => {
  const wt = planUp(spec(), { attached: false }, config())
  const docs = planUp(spec(), { attached: false }, config(), undefined, { docs: true })
  for (const plan of [wt, docs]) {
    assert.deepStrictEqual(of(plan, 'envFile'), [])
    assert.deepStrictEqual(of(plan, 'docker'), [])
  }
})

test('a blocked plan carries no steps', () => {
  const plan = planUp(
    { ...spec({ stack: 'docker' }), bucket: 'backlog' },
    { attached: false },
    config(),
    { dirtyPaths: [], specOnFork: false, specFoundOn: 'feat/other', forkRef: 'main' },
  )
  assert.strictEqual(plan.blocked, true)
  assert.deepStrictEqual(plan.steps, [])
})


