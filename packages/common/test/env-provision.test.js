'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp, resolveStack } = require('../src/env/provision.js')

// The worktree steps `spec-env bootstrap` runs, by kind. They are data now, so
// these tests assert on fields rather than on a shell string's text.
const of = (plan, kind) => plan.steps.filter((s) => s.kind === kind)
const dockerLine = (plan) => of(plan, 'docker').map((s) => s.argv.join(' '))
const setupOf = (plan) => of(plan, 'setup').map((s) => s.command)

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
      composeFile: 'docker-compose.yml',
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

// A header-less spec now needs the compose file present before it inherits
// `docker.enabled` — the master switch alone is a project-wide default, not
// evidence that there is a stack to bring up. These tests are about the legacy
// fallback in a project that genuinely has one, so they say so.
const HAS_COMPOSE = { composeFilePresent: true }

test('fresh spec → -b branch form + docker up, correct port offset', () => {
  const plan = planUp(spec(), { slot: 1, attached: false }, config(), HAS_COMPOSE)
  assert.strictEqual(plan.attached, false)
  assert.strictEqual(plan.portOffset, 3010) // 3000 + 1*10
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
  assert.deepStrictEqual(dockerLine(plan), [
    "docker compose -f docker-compose.yml --env-file .env --project-name app_thing up -d",
  ])
  assert.strictEqual(plan.envContents, 'COMPOSE_PROJECT_NAME=app_thing\nPORT_OFFSET=3010\n')
})

test('already-provisioned spec → attach form (no -b)', () => {
  const plan = planUp(spec(), { slot: 0, attached: true }, config(), HAS_COMPOSE)
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
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config(), HAS_COMPOSE)
  assert.deepStrictEqual(dockerLine(plan), [
    "docker compose -f docker-compose.yml --env-file .env --project-name app_thing up -d",
  ])
})

// --- the compose-file gate ---------------------------------------------------
//
// `docker.composeFile` was read, normalised and then never used. Decision 7 is
// the first thing that reads it, so these cover both halves at once: what the
// gate decides, and that the flag reaches docker.

test('a header-less spec with a compose file present still inherits docker', () => {
  const plan = planUp(spec(), { slot: 1, attached: false }, config(), HAS_COMPOSE)
  assert.strictEqual(
    of(plan, 'docker').length, 1,
    'the legacy fallback still works where there is a stack to bring up',
  )
})

test('a header-less spec with no compose file resolves to worktree', () => {
  const plan = planUp(spec(), { slot: null, attached: false }, config(), { composeFilePresent: false })
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
  assert.strictEqual(plan.envContents, null, 'no .env for a worktree-only spec')
})

// Cannot-tell is not false, but it routes the same way: a caller that did not
// look must not cause a stack to be brought up on no evidence.
test('a header-less spec resolves to worktree when nobody looked for a compose file', () => {
  const plan = planUp(spec(), { slot: null, attached: false }, config())
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

// STAYS SILENT: the gate is about the FALLBACK. An explicit header is checked
// first and must never be second-guessed by a file that happens to be absent —
// a generated compose file is an ordinary, healthy setup.
test('stays silent: an explicit docker header is never downgraded by a missing compose file', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config(),
    { composeFilePresent: false },
  )
  assert.strictEqual(
    of(plan, 'docker').length, 1,
    'the header wins; the gate never sees this spec',
  )
})

// STAYS SILENT: a project relying on docker's own discovery (its file is named
// `compose.yaml` while this key sits at its default) must not gain a `-f` that
// names a file it does not have.
test('stays silent: no -f is passed when the compose file was not found', () => {
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config())
  const [cmd] = dockerLine(plan)
  assert.doesNotMatch(cmd, /-f /, 'docker discovery is left exactly as it was')
})

test('resolveStack and the CLI cannot disagree about a header-less spec', () => {
  const cfg = config()
  assert.strictEqual(resolveStack(spec(), cfg, {}).stack, 'worktree')
  assert.strictEqual(resolveStack(spec(), cfg, { composeFilePresent: true }).stack, 'docker')
  assert.strictEqual(
    resolveStack(spec(), cfg, { composeFilePresent: true, docs: true }).wantsDocker,
    false,
    'documents mode brings no stack up, whatever the gate says',
  )
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
  assert.strictEqual(planUp(spec(), { slot: 0, attached: false }, config(), HAS_COMPOSE).portOffset, 3000)
  assert.strictEqual(planUp(spec(), { slot: 5, attached: false }, config(), HAS_COMPOSE).portOffset, 3050)
})

test('setup steps defaults to empty when none configured', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config())
  assert.deepStrictEqual(setupOf(plan), [])
})

test('setup steps expand tokens (slug/branch/worktreePath/portOffset)', () => {
  const plan = planUp(
    spec(),
    { slot: 2, attached: false },
    config({ setup: ['pnpm install', 'echo {slug} {branch} {worktreePath} {portOffset}'] }),
    HAS_COMPOSE,
  )
  assert.deepStrictEqual(setupOf(plan), [
    'pnpm install',
    'echo thing feat/thing /wt/thing 3020',
  ])
})

test('setup steps are emitted on re-attach too', () => {
  const plan = planUp(spec(), { slot: 0, attached: true }, config({ setup: ['pnpm install'] }), HAS_COMPOSE)
  assert.deepStrictEqual(setupOf(plan), ['pnpm install'])
})

test('setup steps are emitted on a worktree-only spec (empty portOffset token)', () => {
  const plan = planUp(
    spec({ stack: 'worktree' }),
    { slot: null, attached: false },
    config({ setup: ['pnpm install # {portOffset}'] }),
  )
  assert.deepStrictEqual(setupOf(plan), ['pnpm install # '])
})

// --- seedFiles ---

test('no seed steps when no seedFiles configured', () => {
  const plan = planUp(spec(), { slot: 0, attached: false }, config())
  assert.deepStrictEqual(of(plan, 'seed'), [])
})

test('one seed step per file, in order, carrying its mode', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: false },
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
    { slot: 0, attached: false },
    config({ seedFiles: { mode: 'copy', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed')[0].mode, 'copy')
})

test('seed steps: an unknown mode falls back to symlink', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: false },
    config({ seedFiles: { mode: 'weird', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed')[0].mode, 'symlink')
})

test('seed steps are planned on re-attach too (idempotent seeding)', () => {
  const plan = planUp(
    spec(),
    { slot: 0, attached: true },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] } }),
  )
  assert.strictEqual(of(plan, 'seed').length, 1)
})

test('stays silent: the plan carries no shell for a caller to copy', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] }, setup: ['pnpm install'] }),
    HAS_COMPOSE,
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
    'git add -- "specs/backlog/feat-thing"',
    'git commit -m "chore(spec): add feat-thing" -- "specs/backlog/feat-thing"',
    'git worktree add /wt/thing -b feat/thing',
  ])
})

test('an already-tracked spec is committed as an update, not an add', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
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
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
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
  const plan = planUp(S, { slot: 0, attached: false }, config(), {
    dirtyPaths: ['src/app.js'],
  })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.untouched, ['src/app.js'])
  assert.strictEqual(plan.specCommit, null)
})

// STAYS-SILENT: the healthy tree must not grow a report about nothing.
test('a clean tree reports nothing untouched', () => {
  const plan = planUp(S, { slot: 0, attached: false }, config(), { dirtyPaths: [] })
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.untouched, [])
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

// --- compose after setup, from the worktree (bug-compose-before-env) ---------
//
// Compose used to sit in `commands`, run from the primary checkout before the
// worktree existed — so it read the primary checkout's env file and collided
// with the main stack. It is now the last worktree step, after the env file and
// setup, and it is told which env file to read.

test('compose is never planned from the primary checkout', () => {
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config(), HAS_COMPOSE)
  assert.ok(
    !plan.commands.some((c) => c.startsWith('docker compose')),
    'no primary-checkout command brings a stack up',
  )
})

test('the docker step: compose up, with --env-file .env by default', () => {
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config(), HAS_COMPOSE)
  assert.deepStrictEqual(dockerLine(plan), [
    "docker compose -f docker-compose.yml --env-file .env --project-name app_thing up -d",
  ])
})

test('the docker step: a configured envFile reaches compose', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config({ docker: { envFile: '.worktree.env' } }),
    HAS_COMPOSE,
  )
  assert.match(dockerLine(plan)[0], /--env-file \.worktree\.env /)
})

test('the env file step names the configured file, project and offset', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config({ docker: { envFile: '.worktree.env' } }),
    HAS_COMPOSE,
  )
  assert.deepStrictEqual(of(plan, 'envFile'), [
    { kind: 'envFile', file: '.worktree.env', projectName: 'app_thing', offset: 3010 },
  ])
  assert.strictEqual(plan.envContents, 'COMPOSE_PROJECT_NAME=app_thing\nPORT_OFFSET=3010\n')
})

test('the steps run seeds, env file, setup, then the stack', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config({ seedFiles: { mode: 'symlink', files: ['.env'] }, setup: ['pnpm install'] }),
    HAS_COMPOSE,
  )
  assert.deepStrictEqual(plan.steps.map((s) => s.kind), ['seed', 'envFile', 'setup', 'docker'])
})

// STAYS SILENT: a spec with no stack writes no env file and starts nothing.
test('stays silent: worktree-only and --docs plan no env file and no compose', () => {
  const wt = planUp(spec({ stack: 'worktree' }), { slot: null, attached: false }, config())
  assert.deepStrictEqual(of(wt, 'envFile'), [])
  assert.deepStrictEqual(of(wt, 'docker'), [])
  const docs = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config(), HAS_COMPOSE, {
    docs: true,
  })
  assert.deepStrictEqual(of(docs, 'envFile'), [])
  assert.deepStrictEqual(of(docs, 'docker'), [])
})

test('a blocked plan carries no steps', () => {
  const plan = planUp(
    { ...spec({ stack: 'docker' }), bucket: 'backlog' },
    { slot: 1, attached: false },
    config(),
    { ...HAS_COMPOSE, dirtyPaths: [], specOnFork: false, specFoundOn: 'feat/other', forkRef: 'main' },
  )
  assert.strictEqual(plan.blocked, true)
  assert.deepStrictEqual(plan.steps, [])
})

// The env file's behaviour on disk — fresh, re-run, kept values, a refused
// symlink — is pinned where it now runs: `env-bootstrap.test.js`.
