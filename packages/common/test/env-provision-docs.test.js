'use strict'

/**
 * Documents mode — `spec-env up <spec> --docs`.
 *
 * `/spec` provisions a worktree BEFORE it writes the spec, so that authoring
 * never touches the base branch. What it needs is a checkout on a branch; what
 * it does not need is an install and a database, to write markdown.
 *
 * So these tests assert two things in equal measure: what the mode does, and
 * what it deliberately omits. The second half matters because an omission is
 * indistinguishable from a bug unless something pins it.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { planUp, planCheckoutUp, worktreeCd } = require('../src/env/provision.js')

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

const SETUP = ['pnpm install --frozen-lockfile', 'pnpm build']

test('--docs drops the setup commands', () => {
  const plan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ setup: SETUP }),
    null,
    { docs: true },
  )
  assert.deepStrictEqual(plan.setupCommands, [])
})

test('without --docs the same project still gets its setup commands', () => {
  const plan = planUp(spec(), { slot: null, attached: false }, config({ setup: SETUP }))
  assert.strictEqual(plan.setupCommands.length, 2)
  assert.ok(plan.setupCommands[0].endsWith('pnpm install --frozen-lockfile'))
})

test('--docs keeps the seed commands — they are the cheap half', () => {
  // Seeding links the gitignored files a fresh worktree has none of. A spec
  // author may well want `.env` present; what they do not want is the install.
  const plan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ setup: SETUP, seedFiles: { mode: 'symlink', files: ['.env'] } }),
    null,
    { docs: true },
  )
  assert.strictEqual(plan.seedCommands.length, 1)
  assert.ok(plan.seedCommands[0].startsWith(`${worktreeCd('/wt/thing')}; `))
})

test('--docs brings no docker up, even for a docker spec in a docker project', () => {
  const plan = planUp(
    spec({ stack: 'docker' }),
    { slot: 1, attached: false },
    config(),
    null,
    { docs: true },
  )
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
  assert.strictEqual(plan.slot, null)
  assert.strictEqual(plan.portOffset, null)
  assert.strictEqual(plan.envContents, null)
})

test('the same docker spec without --docs still gets its stack', () => {
  // The pair above and below is the point: one flag is the only difference.
  const plan = planUp(spec({ stack: 'docker' }), { slot: 1, attached: false }, config())
  assert.deepStrictEqual(plan.commands, [
    'git worktree add /wt/thing -b feat/thing',
    'docker compose --project-name app_thing up -d',
  ])
  assert.strictEqual(plan.portOffset, 3010)
})

test('--docs still forks the branch — it is a worktree, not a dry run', () => {
  const plan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ setup: SETUP }),
    null,
    { docs: true },
  )
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('--docs over an existing worktree attaches rather than re-forking', () => {
  const plan = planUp(
    spec(),
    { slot: null, attached: true },
    config({ setup: SETUP }),
    null,
    { docs: true },
  )
  assert.strictEqual(plan.attached, true)
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing feat/thing'])
})

test('the plan says docs mode POSITIVELY', () => {
  // A caller must not have to infer the mode from an empty `setupCommands` —
  // that also describes a project which configured no setup at all.
  const docsPlan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ setup: SETUP }),
    null,
    { docs: true },
  )
  assert.strictEqual(docsPlan.docs, true)

  const noSetup = planUp(spec(), { slot: null, attached: false }, config({ setup: [] }))
  assert.deepStrictEqual(noSetup.setupCommands, [])
  assert.strictEqual(noSetup.docs, false, 'no setup configured is not docs mode')
})

// ---------------------------------------------------------------------------
// Stays-silent — `.claude/rules/negative-checks.md` rule 3. Each of these feeds
// the new option a healthy-but-unusual input and asserts nothing changed.
// ---------------------------------------------------------------------------

test('omitting opts entirely leaves every existing caller byte-identical', () => {
  const withOpts = planUp(
    spec({ stack: 'docker' }),
    { slot: 2, attached: false },
    config({ setup: SETUP, seedFiles: { mode: 'copy', files: ['.env'] } }),
    null,
    {},
  )
  const without = planUp(
    spec({ stack: 'docker' }),
    { slot: 2, attached: false },
    config({ setup: SETUP, seedFiles: { mode: 'copy', files: ['.env'] } }),
  )
  assert.deepStrictEqual(without, withOpts)
  assert.strictEqual(without.docs, false)
})

test('a falsy-but-present docs value is not docs mode', () => {
  // Only `true` turns it on, so a caller threading an undefined flag through
  // cannot silently provision a tree with no dependencies in it.
  for (const value of [undefined, null, false, 0, '']) {
    const plan = planUp(
      spec(),
      { slot: null, attached: false },
      config({ setup: SETUP }),
      null,
      { docs: value },
    )
    assert.strictEqual(plan.docs, false, `docs: ${JSON.stringify(value)}`)
    assert.strictEqual(plan.setupCommands.length, 2)
  }
})

test('--docs on a project with docker disabled says nothing about docker', () => {
  const plan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ docker: { enabled: false } }),
    null,
    { docs: true },
  )
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
  assert.strictEqual(plan.envContents, null)
})

test('--docs on a project with no setup configured is a no-op, not a refusal', () => {
  const plan = planUp(
    spec(),
    { slot: null, attached: false },
    config({ setup: [] }),
    null,
    { docs: true },
  )
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.setupCommands, [])
  assert.deepStrictEqual(plan.commands, ['git worktree add /wt/thing -b feat/thing'])
})

test('checkout mode accepts --docs and is unchanged by it', () => {
  // There is no fresh tree to make runnable, so there is nothing to skip. The
  // flag must be inert rather than a refusal — see planCheckoutUp's header.
  const ctx = {
    current: 'main',
    base: 'main',
    onBase: true,
    clean: true,
    dirtyPaths: [],
    specOnFork: true,
    specFoundOn: 'main',
    forkRef: 'main',
    specUntracked: false,
    branchExists: false,
    checkoutPath: '/repo',
  }
  const plain = planCheckoutUp(spec(), ctx, config({ setup: SETUP }))
  const withDocs = planCheckoutUp(spec(), ctx, config({ setup: SETUP }), { docs: true })
  assert.deepStrictEqual(withDocs, plain)
})
