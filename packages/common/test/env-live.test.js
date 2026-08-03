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
  planTake,
} = require('../src/env/live.js')
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

test('planTake refuses a stateful (docker) spec', () => {
  const plan = planTake({ ...SPEC, stack: 'docker' }, {}, okCtx())
  assert.match(plan.reason, /Stack: worktree \+ docker/)
  assert.match(plan.reason, /spec-connect/)
})

test('planTake refuses a branch that changes migrations', () => {
  const plan = planTake(SPEC, {}, okCtx({ migrationsHit: true }))
  assert.match(plan.reason, /changes migrations/)
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
