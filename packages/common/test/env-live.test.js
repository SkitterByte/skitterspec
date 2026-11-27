'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  receiptPath,
  renderReceipt,
  readReceipt,
  writeReceipt,
  clearReceipt,
  summarizeReceipt,
  globToRegExp,
  migrationsHit,
  depsChanged,
  planTake,
  planRelease,
  planAbort,
  bypassOffered,
  recordBypass,
  readBypass,
  writeBypass,
} = require('../src/env/live.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { assertPrimaryOnMain } = require('../src/env/resolve.js')

const CONFIG = { registry: '.spec-env/registry.json' }

const FIELDS = {
  spec: 'feat-x',
  branch: 'feat/x',
  holder: 'Test',
  heldSince: '2026-08-03T10:00:00Z',
  baseMainCommit: 'abc1234',
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-live-'))
}

// --- receipt: pure + IO ---------------------------------------------------

test('receiptPath is a sibling of the registry (.spec-env/live.json)', () => {
  assert.strictEqual(receiptPath('/repo', CONFIG), path.resolve('/repo', '.spec-env/live.json'))
})

test('renderReceipt normalizes fields and throws on a missing one', () => {
  assert.deepStrictEqual(renderReceipt(FIELDS), { ...FIELDS })
  assert.throws(() => renderReceipt({ ...FIELDS, holder: '' }), /missing holder/)
  assert.throws(() => renderReceipt(null), /missing spec/)
})

test('readReceipt returns null when absent, the object after write', () => {
  const dir = tmpDir()
  assert.strictEqual(readReceipt(dir, CONFIG), null)
  assert.deepStrictEqual(writeReceipt(dir, CONFIG, FIELDS), { ...FIELDS })
  assert.deepStrictEqual(readReceipt(dir, CONFIG), { ...FIELDS })
})

test('readReceipt throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = receiptPath(dir, CONFIG)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ not json')
  assert.throws(() => readReceipt(dir, CONFIG), /Invalid live receipt/)
})

test('clearReceipt removes the file and is idempotent', () => {
  const dir = tmpDir()
  writeReceipt(dir, CONFIG, FIELDS)
  clearReceipt(dir, CONFIG)
  assert.strictEqual(readReceipt(dir, CONFIG), null)
  assert.doesNotThrow(() => clearReceipt(dir, CONFIG)) // absent → clean no-op
})

test('summarizeReceipt describes the free state and a held one', () => {
  assert.match(summarizeReceipt(null), /free/)
  assert.match(summarizeReceipt(FIELDS), /feat-x/)
  assert.match(summarizeReceipt(FIELDS), /held by Test/)
})

// --- the guard ------------------------------------------------------------

// Fake git: only answers the current-branch query, like the real reader.
function fakeGit(branch) {
  return (argv) => (argv.join(' ') === 'symbolic-ref --short HEAD' ? branch : null)
}

test('assertPrimaryOnMain reports free when on the base branch', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit('main'))
  assert.deepStrictEqual(r, { onBase: true, branch: 'main', baseBranch: 'main' })
})

test('assertPrimaryOnMain reports a feature in control off base', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit('feat/x'))
  assert.deepStrictEqual(r, { onBase: false, branch: 'feat/x', baseBranch: 'main' })
})

test('assertPrimaryOnMain treats a detached HEAD as not-on-base', () => {
  const r = assertPrimaryOnMain({ baseBranch: 'main' }, fakeGit(null))
  assert.strictEqual(r.onBase, false)
  assert.strictEqual(r.branch, null)
})

// --- glob matching --------------------------------------------------------

test('globToRegExp handles **, *, ? and literal separators', () => {
  assert.ok(globToRegExp('**/migrations/**').test('db/migrations/001.sql'))
  assert.ok(globToRegExp('**/migrations/**').test('a/b/migrations/c/x.sql'))
  assert.ok(globToRegExp('prisma/migrations/**').test('prisma/migrations/x.sql'))
  assert.ok(!globToRegExp('prisma/migrations/**').test('db/migrations/x.sql'))
  assert.ok(globToRegExp('*.sql').test('001.sql'))
  assert.ok(!globToRegExp('*.sql').test('db/001.sql')) // * stays within a segment
})

test('migrationsHit is false for empty files/patterns, true on a match', () => {
  assert.strictEqual(migrationsHit([], ['**/migrations/**']), false)
  assert.strictEqual(migrationsHit(['db/migrations/1.sql'], []), false)
  assert.strictEqual(migrationsHit(['src/app.js'], ['**/migrations/**']), false)
  assert.strictEqual(migrationsHit(['src/app.js', 'db/migrations/1.sql'], ['**/migrations/**']), true)
})

// --- depsChanged ----------------------------------------------------------

const DOTNET_TRIGGERS = [
  { run: 'dotnet restore', when: ['**/*.csproj', 'Directory.Packages.props'] },
]

test('depsChanged fires on a file a setup `when` glob names', () => {
  assert.strictEqual(depsChanged(['src/Api/Api.csproj'], DOTNET_TRIGGERS), true)
  assert.strictEqual(depsChanged(['Api.csproj'], DOTNET_TRIGGERS), true)
  assert.strictEqual(depsChanged(['Directory.Packages.props'], DOTNET_TRIGGERS), true)
})

test('depsChanged stays silent on ordinary source changes', () => {
  assert.strictEqual(depsChanged(['src/Api/Program.cs', 'src/Api/Orders.cs'], DOTNET_TRIGGERS), false)
  assert.strictEqual(depsChanged([], DOTNET_TRIGGERS), false)
})

test('depsChanged keeps the npm set with or without `when` globs', () => {
  assert.strictEqual(depsChanged(['web/package.json'], []), true)
  assert.strictEqual(depsChanged(['pnpm-lock.yaml'], undefined), true)
  // A project whose triggers name only a schema still warns on a lockfile.
  const prisma = [{ run: 'pnpm db:generate', when: ['prisma/schema.prisma'] }]
  assert.strictEqual(depsChanged(['pnpm-lock.yaml'], prisma), true)
  assert.strictEqual(depsChanged(['prisma/schema.prisma'], prisma), true)
  assert.strictEqual(depsChanged(['src/app.js'], prisma), false)
})

// --- planTake -------------------------------------------------------------

const SPEC = { folder: 'feat-x', branch: 'feat/x', worktreePath: '/wt/x', stack: 'worktree' }

// A ctx where every precondition passes (server up, clean, on base, worktree there).
function okCtx(over = {}) {
  return {
    primary: { onBase: true, branch: 'main', baseBranch: 'main' },
    primaryPath: '/repo',
    clean: true,
    worktreeExists: true,
    base: 'main',
    baseMainCommit: 'abcdef1234567',
    serverUp: true,
    canonicalPorts: [3000],
    migrationsHit: false,
    depsChanged: false,
    holder: 'Test',
    heldSince: '2026-08-03T10:00:00Z',
    ...over,
  }
}

test('planTake emits rebase → detach → checkout and a receipt when clear', () => {
  const plan = planTake(SPEC, {}, okCtx())
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git -C /wt/x rebase main',
    'git -C /wt/x switch --detach',
    'git -C /repo checkout feat/x',
  ])
  assert.deepStrictEqual(plan.receipt, {
    spec: 'feat-x',
    branch: 'feat/x',
    holder: 'Test',
    heldSince: '2026-08-03T10:00:00Z',
    baseMainCommit: 'abcdef1234567',
  })
  assert.deepStrictEqual(plan.warnings, [])
})

test('planTake refuses when the primary checkout is off base (lock held)', () => {
  const plan = planTake(SPEC, {}, okCtx({ primary: { onBase: false, branch: 'feat/y', baseBranch: 'main' } }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /on feat\/y, not main/)
})

test('planTake refuses a dirty primary checkout', () => {
  const plan = planTake(SPEC, {}, okCtx({ clean: false }))
  assert.match(plan.reason, /uncommitted changes/)
})

test('planTake refuses when the worktree is missing', () => {
  const plan = planTake(SPEC, {}, okCtx({ worktreeExists: false }))
  assert.match(plan.reason, /no worktree/)
})

// Per-spec Docker stacks were removed (feat-drop-docker-stacks), so a spec
// whose header still asks for one is code like any other — the migrations
// refusal is the stateful guard that remains.
test('STAYS SILENT: a legacy docker header is not refused for it', () => {
  const plan = planTake({ ...SPEC, stack: 'docker', legacyDockerStack: true }, {}, okCtx())
  assert.strictEqual(plan.blocked, false)
})

test('planTake always refuses a hotfix, regardless of stack', () => {
  // A code-only (worktree) hotfix still passes every other precondition, yet is
  // refused — its branch is built on an old release tag.
  const plan = planTake({ ...SPEC, folder: 'hotfix-x', type: 'hotfix', stack: 'worktree' }, {}, okCtx())
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /hotfix/)
  assert.match(plan.reason, /spec-connect/)
})

test('planTake refuses a branch that changes migrations', () => {
  const plan = planTake(SPEC, {}, okCtx({ migrationsHit: true }))
  assert.match(plan.reason, /changes migrations/)
})

// --- live.refusedReach (feat-pr-mode-verbs) -----------------------------------

const reachCfg = (refusedReach) => ({ live: { refusedReach } })

test('migrations refusal names the project\'s reach: worktree, pr, live-confirm', () => {
  const wt = planTake(SPEC, reachCfg('worktree'), okCtx({ migrationsHit: true }))
  assert.match(wt.reason, /from the worktree: run it from its worktree \(\/wt\/x/)
  const pr = planTake(SPEC, reachCfg('pr'), okCtx({ migrationsHit: true }))
  assert.match(pr.reason, /by PR: .*`\/spec-pr`/)
  const lc = planTake(SPEC, reachCfg('live-confirm'), okCtx({ migrationsHit: true }))
  assert.match(lc.reason, /--allow-migrations/)
  for (const plan of [wt, pr, lc]) {
    assert.strictEqual(plan.blocked, true)
    assert.doesNotMatch(plan.reason, /spec-to-main|spec-land/)
  }
})

test('unset reach lists every route and never guesses one', () => {
  const plan = planTake(SPEC, {}, okCtx({ migrationsHit: true }))
  assert.match(plan.reason, /run it from its worktree/)
  assert.match(plan.reason, /`\/spec-pr`/)
  assert.match(plan.reason, /set `live\.refusedReach`/)
})

// Stays silent: no project chose the bypass, so no refusal may declare it.
test('only live-confirm declares a bypass offer — worktree, pr and unset carry none', () => {
  for (const reach of [undefined, 'worktree', 'pr']) {
    const plan = planTake(SPEC, reachCfg(reach), okCtx({ migrationsHit: true }))
    assert.strictEqual(plan.offer, undefined, String(reach))
  }
  const lc = planTake(SPEC, reachCfg('live-confirm'), okCtx({ migrationsHit: true }))
  assert.strictEqual(lc.offer.kind, 'bypass')
  assert.match(lc.offer.command, /live take feat-x --allow-migrations/)
})

test('the bypass offer is spent once per HEAD', () => {
  const spent = planTake(SPEC, reachCfg('live-confirm'), okCtx({ migrationsHit: true, migrationsOfferSpent: true }))
  assert.strictEqual(spent.blocked, true)
  assert.strictEqual(spent.offer, undefined)
  let ledger = recordBypass({}, 'feat-x', { kind: 'offered', head: 'abc' })
  assert.strictEqual(bypassOffered(ledger, 'feat-x', 'abc'), true)
  assert.strictEqual(bypassOffered(ledger, 'feat-x', 'later'), false, 'new commits are asked again')
  ledger = recordBypass(ledger, 'feat-x', { kind: 'allowed', head: 'abc', at: 't', by: 'Test' })
  assert.deepStrictEqual(ledger['feat-x'].allowed, [{ head: 'abc', at: 't', by: 'Test' }])
})

test('--allow-migrations takes it live only under live-confirm, with a warning', () => {
  const ok = planTake(SPEC, reachCfg('live-confirm'), okCtx({ migrationsHit: true, allowMigrations: true }))
  assert.strictEqual(ok.blocked, false)
  assert.match(ok.warnings.join('\n'), /shared database changes/)
  for (const reach of [undefined, 'worktree', 'pr']) {
    const no = planTake(SPEC, reachCfg(reach), okCtx({ migrationsHit: true, allowMigrations: true }))
    assert.strictEqual(no.blocked, true, String(reach))
    assert.match(no.reason, /needs `live\.refusedReach: "live-confirm"`/)
  }
})

test('a code-only branch is untouched by refusedReach (stays silent)', () => {
  const plan = planTake(SPEC, reachCfg('live-confirm'), okCtx({ migrationsHit: false, allowMigrations: true }))
  assert.strictEqual(plan.blocked, false)
  assert.doesNotMatch(plan.warnings.join('\n'), /database/)
})

test('a corrupt bypass ledger reads as never offered', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bypass-'))
  try {
    const cfg = { registry: '.spec-env/registry.json' }
    assert.deepStrictEqual(readBypass(dir, cfg), {})
    writeBypass(dir, cfg, recordBypass({}, 'feat-x', { kind: 'offered', head: 'abc' }))
    assert.strictEqual(bypassOffered(readBypass(dir, cfg), 'feat-x', 'abc'), true)
    fs.writeFileSync(path.join(dir, '.spec-env', 'live-bypass.json'), '{not json')
    assert.deepStrictEqual(readBypass(dir, cfg), {})
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('config: live.refusedReach takes the three values; anything else reads as unset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reach-'))
  const write = (live) => {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ live }))
  }
  try {
    for (const v of ['worktree', 'pr', 'live-confirm']) {
      write({ refusedReach: v })
      assert.strictEqual(loadEnvConfig(dir).config.live.refusedReach, v)
    }
    write({ refusedReach: 'Live-Confirm' })
    const typo = loadEnvConfig(dir).config
    assert.strictEqual(typo.live.refusedReach, null, 'a typo never becomes the bypass')
    assert.strictEqual(typo.live.refusedReachInvalid, 'Live-Confirm')
    write({})
    assert.strictEqual(loadEnvConfig(dir).config.live.refusedReach, null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('planTake refuses when no dev server is listening', () => {
  const plan = planTake(SPEC, {}, okCtx({ serverUp: false, canonicalPorts: [3000, 8080] }))
  assert.match(plan.reason, /no dev server listening on canonical port\(s\) 3000, 8080/)
})

test('planTake warns on a dependency change and on no configured dev ports', () => {
  const deps = planTake(SPEC, {}, okCtx({ depsChanged: true }))
  assert.match(deps.warnings.join('\n'), /dependencies changed/)

  const noPorts = planTake(SPEC, {}, okCtx({ serverUp: null, canonicalPorts: [] }))
  assert.strictEqual(noPorts.blocked, false)
  assert.match(noPorts.warnings.join('\n'), /nothing to hot-reload/)
})

test('planTake lets a restart-only project through, naming each app to restart', () => {
  const plan = planTake(SPEC, {}, okCtx({ serverUp: null, canonicalPorts: [], restartApps: ['api'] }))
  assert.strictEqual(plan.blocked, false)
  const text = plan.warnings.join('\n')
  assert.match(text, /restart api after the switch — it does not hot-reload/)
  assert.doesNotMatch(text, /nothing to hot-reload; switching anyway/)
})

test('planTake still refuses when a HOT server is down beside a restart app', () => {
  const plan = planTake(SPEC, {}, okCtx({ serverUp: false, canonicalPorts: [3000], restartApps: ['api'] }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /no dev server listening on canonical port\(s\) 3000/)
})

test('planTake rebases onto rebaseOnto when given, and onto base otherwise', () => {
  const pr = planTake(SPEC, {}, okCtx({ rebaseOnto: 'origin/main' }))
  assert.strictEqual(pr.commands[0], 'git -C /wt/x rebase origin/main')
  assert.strictEqual(pr.onto, 'origin/main')
  assert.strictEqual(pr.base, 'main')

  const trunk = planTake(SPEC, {}, okCtx())
  assert.strictEqual(trunk.commands[0], 'git -C /wt/x rebase main')
  assert.strictEqual(trunk.onto, 'main')
})

test('planTake carries a fallback note as a warning, never a refusal', () => {
  const plan = planTake(SPEC, {}, okCtx({ rebaseNote: 'could not fetch origin/main — rebased onto local main' }))
  assert.strictEqual(plan.blocked, false)
  assert.match(plan.warnings.join('\n'), /could not fetch origin\/main/)
})

test('planTake adds no restart reminder when no entry declares restart', () => {
  const plan = planTake(SPEC, {}, okCtx())
  assert.deepStrictEqual(plan.warnings, [])
})

// --- planRelease ----------------------------------------------------------

// A ctx where release proceeds: primary on the spec's branch, clean, worktree there.
function relCtx(over = {}) {
  return {
    primary: { onBase: false, branch: 'feat/x', baseBranch: 'main' },
    primaryPath: '/repo',
    base: 'main',
    clean: true,
    worktreeExists: true,
    ...over,
  }
}

test('planRelease emits checkout base + re-isolate and clears the receipt', () => {
  const plan = planRelease(SPEC, {}, relCtx())
  assert.strictEqual(plan.blocked, false)
  assert.strictEqual(plan.noop, false)
  assert.deepStrictEqual(plan.commands, [
    'git -C /repo checkout main',
    'git -C /wt/x switch feat/x',
  ])
  assert.strictEqual(plan.clears, true)
  assert.deepStrictEqual(plan.warnings, [])
})

test('planRelease reminds to restart each restart app on base', () => {
  const plan = planRelease(SPEC, {}, relCtx({ restartApps: ['api', 'worker'] }))
  assert.deepStrictEqual(plan.warnings, [
    'restart api on main — it does not hot-reload',
    'restart worker on main — it does not hot-reload',
  ])
})

test('planRelease is a no-op when the primary checkout is already on base', () => {
  const plan = planRelease(SPEC, {}, relCtx({ primary: { onBase: true, branch: 'main', baseBranch: 'main' } }))
  assert.strictEqual(plan.noop, true)
})

test('planRelease refuses when a different spec holds the instance', () => {
  const plan = planRelease(SPEC, {}, relCtx({ primary: { onBase: false, branch: 'feat/y', baseBranch: 'main' } }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /live spec is feat\/y/)
})

test('planRelease refuses a dirty primary checkout (fixes not committed)', () => {
  const plan = planRelease(SPEC, {}, relCtx({ clean: false }))
  assert.match(plan.reason, /commit your fixes to feat\/x first/)
})

test('planRelease omits the re-isolate step when the worktree is gone', () => {
  const plan = planRelease(SPEC, {}, relCtx({ worktreeExists: false }))
  assert.deepStrictEqual(plan.commands, ['git -C /repo checkout main'])
})

// --- afterSwitch ----------------------------------------------------------

const SWITCH = {
  live: {
    afterSwitch: [
      { run: 'pnpm install', when: ['pnpm-lock.yaml'] },
      { run: 'pnpm gen', when: ['prisma/schema.prisma'] },
      { run: 'echo always', when: null },
    ],
  },
}

test('planTake decides afterSwitch against the changed files, run in the primary', () => {
  const plan = planTake(SPEC, SWITCH, okCtx({ changedFiles: ['prisma/schema.prisma', 'src/a.js'] }))
  assert.strictEqual(plan.afterSwitch.cwd, '/repo')
  assert.deepStrictEqual(plan.afterSwitch.commands, ['pnpm gen', 'echo always'])
  assert.deepStrictEqual(
    plan.afterSwitch.entries.map((e) => [e.run, e.decision, e.matched]),
    [
      ['pnpm install', 'skipped', null],
      ['pnpm gen', 'matched', 'prisma/schema.prisma'],
      ['echo always', 'always', null],
    ],
  )
})

test('planTake runs every conditional entry when the range is unknown', () => {
  const plan = planTake(SPEC, SWITCH, okCtx({ changedFiles: null }))
  assert.strictEqual(plan.afterSwitch.range, null)
  assert.deepStrictEqual(plan.afterSwitch.commands, ['pnpm install', 'pnpm gen', 'echo always'])
  assert.ok(plan.afterSwitch.entries.slice(0, 2).every((e) => e.decision === 'unknown'))
})

test('planTake skips every conditional entry on an empty known range', () => {
  const plan = planTake(SPEC, SWITCH, okCtx({ changedFiles: [] }))
  assert.deepStrictEqual(plan.afterSwitch.commands, ['echo always'])
})

test('planTake carries an empty afterSwitch on a refusal — nothing switched', () => {
  const plan = planTake(SPEC, SWITCH, okCtx({ clean: false, changedFiles: ['pnpm-lock.yaml'] }))
  assert.strictEqual(plan.blocked, true)
  assert.deepStrictEqual(plan.afterSwitch, { cwd: null, commands: [], entries: [], range: null })
})

test('planRelease decides afterSwitch against the same files, run in the primary', () => {
  const plan = planRelease(SPEC, SWITCH, relCtx({ changedFiles: ['pnpm-lock.yaml'] }))
  assert.strictEqual(plan.afterSwitch.cwd, '/repo')
  assert.deepStrictEqual(plan.afterSwitch.commands, ['pnpm install', 'echo always'])
})

test('planRelease carries an empty afterSwitch when nothing is live or it refuses', () => {
  const empty = { cwd: null, commands: [], entries: [], range: null }
  const noop = planRelease(SPEC, SWITCH, relCtx({ primary: { onBase: true, branch: 'main', baseBranch: 'main' } }))
  assert.deepStrictEqual(noop.afterSwitch, empty)
  assert.deepStrictEqual(planRelease(SPEC, SWITCH, relCtx({ clean: false })).afterSwitch, empty)
})

// STAYS SILENT: a project with no `live.afterSwitch` gets an empty list and a
// plan otherwise identical to the one it got before the key existed.
test('afterSwitch unset → empty, and every other plan field unchanged', () => {
  const empty = { cwd: null, commands: [], entries: [], range: [] }
  const ctx = okCtx({ changedFiles: [], depsChanged: true })
  const take = planTake(SPEC, {}, ctx)
  assert.deepStrictEqual(take.afterSwitch, empty)
  const { afterSwitch: _a, ...takeRest } = take
  const { afterSwitch: _b, ...takeWithLive } = planTake(SPEC, { live: { afterSwitch: [] } }, ctx)
  assert.deepStrictEqual(takeRest, takeWithLive)
  assert.deepStrictEqual(planRelease(SPEC, {}, relCtx({ changedFiles: [] })).afterSwitch, empty)
})

// --- planAbort ------------------------------------------------------------

const RECEIPT = {
  spec: 'feat-x',
  branch: 'feat/x',
  holder: 'Test',
  heldSince: '2026-08-03T10:00:00Z',
  baseMainCommit: 'abcdef1234567',
}

function abortCtx(over = {}) {
  return {
    receipt: RECEIPT,
    primary: { onBase: false, branch: 'feat/x', baseBranch: 'main' },
    primaryPath: '/repo',
    base: 'main',
    clean: true,
    worktreeExists: true,
    worktreePath: '/wt/x',
    ...over,
  }
}

test('planAbort recovers from the receipt: checkout base + re-isolate + clear', () => {
  const plan = planAbort({}, abortCtx())
  assert.strictEqual(plan.blocked, false)
  assert.deepStrictEqual(plan.commands, [
    'git -C /repo checkout main',
    'git -C /wt/x switch feat/x',
  ])
  assert.strictEqual(plan.clears, true)
  assert.strictEqual(plan.branch, 'feat/x')
})

test('planAbort skips the checkout when the primary is already on base (stale receipt)', () => {
  const plan = planAbort({}, abortCtx({ primary: { onBase: true, branch: 'main', baseBranch: 'main' } }))
  assert.deepStrictEqual(plan.commands, ['git -C /wt/x switch feat/x'])
  assert.strictEqual(plan.clears, true)
})

test('planAbort refuses to discard uncommitted work', () => {
  const plan = planAbort({}, abortCtx({ clean: false }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /would discard/)
})

test('planAbort is a no-op with no receipt and the primary on base', () => {
  const plan = planAbort({}, abortCtx({ receipt: null, primary: { onBase: true, branch: 'main', baseBranch: 'main' } }))
  assert.strictEqual(plan.noop, true)
})

test('planAbort refuses with no receipt but the primary off base', () => {
  const plan = planAbort({}, abortCtx({ receipt: null }))
  assert.strictEqual(plan.blocked, true)
  assert.match(plan.reason, /no live receipt/)
})

// --- runAfterSwitch -------------------------------------------------------

const { runAfterSwitch } = require('../src/env/live.js')

function fakeSpawn(results) {
  const calls = []
  const spawn = (cmd, opts) => {
    calls.push({ cmd, cwd: opts.cwd, shell: opts.shell })
    return results[cmd] || { status: 0, stdout: '', stderr: '' }
  }
  return { spawn, calls }
}

test('runAfterSwitch prints nothing and runs nothing for an empty plan', () => {
  const { spawn, calls } = fakeSpawn({})
  assert.deepStrictEqual(runAfterSwitch({ cwd: null, commands: [], entries: [], range: [] }, spawn), {
    lines: [],
    failed: false,
  })
  assert.deepStrictEqual(calls, [])
})

test('runAfterSwitch runs the non-skipped entries in the plan cwd, through the shell', () => {
  const plan = planTake(SPEC, SWITCH, okCtx({ changedFiles: ['prisma/schema.prisma'] }))
  const { spawn, calls } = fakeSpawn({})
  const { lines, failed } = runAfterSwitch(plan.afterSwitch, spawn)
  assert.strictEqual(failed, false)
  assert.deepStrictEqual(calls, [
    { cmd: 'pnpm gen', cwd: '/repo', shell: true },
    { cmd: 'echo always', cwd: '/repo', shell: true },
  ])
  assert.deepStrictEqual(lines, [
    '  after switch (in /repo):',
    '    ran:  pnpm gen       # prisma/schema.prisma changed',
    '    ran:  echo always',
    '  skipped (nothing in the switch matched):',
    '    pnpm install   # when pnpm-lock.yaml',
  ])
})

test('runAfterSwitch says when the range is unknown, and when nothing is left to run', () => {
  const unknown = runAfterSwitch(planTake(SPEC, SWITCH, okCtx({ changedFiles: null })).afterSwitch, fakeSpawn({}).spawn)
  assert.ok(unknown.lines.includes('    ran:  pnpm install   # range unknown'))
  assert.ok(unknown.lines.some((l) => /changed files are unknown here/.test(l)))
  const onlyConditional = { live: { afterSwitch: [{ run: 'pnpm gen', when: ['x'] }] } }
  const none = runAfterSwitch(planTake(SPEC, onlyConditional, okCtx({ changedFiles: [] })).afterSwitch)
  assert.strictEqual(none.lines[0], '  after switch (in /repo): nothing to run.')
})

test('runAfterSwitch stops at the first failure with the tail of its output', () => {
  const noisy = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const { spawn, calls } = fakeSpawn({ 'pnpm gen': { status: 2, stdout: noisy, stderr: 'ERR boom\n' } })
  const plan = planTake(SPEC, SWITCH, okCtx({ changedFiles: ['prisma/schema.prisma'] }))
  const { lines, failed } = runAfterSwitch(plan.afterSwitch, spawn)
  assert.strictEqual(failed, true)
  assert.deepStrictEqual(calls.map((c) => c.cmd), ['pnpm gen'])
  assert.ok(lines.includes('  ! after switch: pnpm gen failed (exit 2) — the switch stands; fix it in /repo'))
  assert.ok(lines.includes('      ERR boom'))
  assert.ok(!lines.includes('      line 10')) // only the last 20 lines
  assert.ok(lines.includes('      line 11'))
  assert.ok(lines.includes('    not run:  echo always'))
})
