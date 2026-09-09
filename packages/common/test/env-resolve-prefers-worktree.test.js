'use strict'

/**
 * `resolveSpec` must read the spec FILE from the checkout the caller is standing
 * in, while keeping repo IDENTITY anchored on the primary checkout.
 *
 * Those are two different questions and `bug-spec-env-cwd-anchor` answered both
 * with one anchor. Repo identity — `{repo}`, the worktree path, the registry,
 * the docker project name — must be identical from anywhere, and that fix is
 * correct and stays. But a spec's BUCKET and its `Stack:` / `Base version:`
 * headers are properties of the branch you are on: `/spec-start` moves a spec to
 * `in-progress` on the spec's own branch, so the primary checkout still shows it
 * under `backlog` long after it started.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveSpec } = require('../src/env/resolve.js')

function baseConfig(overrides = {}) {
  return {
    worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
    docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
    branch: { pattern: '{type}/{slug}', identifierField: '' },
    ...overrides,
  }
}

/** Make an empty checkout root. */
const checkout = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${label}-`))

/** Put a spec folder into a checkout root at a given bucket. */
function seedSpec(root, folder, { bucket = 'backlog', stack = null, baseVersion = null } = {}) {
  const specDir = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  const stackLine = stack ? `> **Stack:** ${stack}\n` : ''
  const baseLine = baseVersion ? `> **Base version:** ${baseVersion}\n` : ''
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `# ${folder}\n${stackLine}${baseLine}`)
  return root
}

/**
 * The reported shape: the spec is `backlog` in the primary checkout (where it
 * still sits on the base branch) and `in-progress` in its own worktree.
 */
function splitWorld(folder, { primaryStack = 'worktree', worktreeStack = 'worktree' } = {}) {
  const primary = seedSpec(checkout('primary'), folder, { bucket: 'backlog', stack: primaryStack })
  const worktree = seedSpec(checkout('worktree'), folder, { bucket: 'in-progress', stack: worktreeStack })
  return { primary, worktree }
}

// --- the bug -----------------------------------------------------------------

test('the bucket comes from the checkout the caller is in, not the primary one', () => {
  const { primary, worktree } = splitWorld('feat-linear-spec-list')
  const r = resolveSpec('feat-linear-spec-list', primary, baseConfig(), { preferDirs: [worktree] })
  assert.strictEqual(r.bucket, 'in-progress')
})

test('Stack: is read from the worktree copy, so an escalation there is seen', () => {
  // Escalating a spec to docker is documented as "edit the header, or run
  // spec-env up <name>" — and the edit happens in the worktree, where the work
  // is. Reading main's copy means `up` brings up no stack.
  const { primary, worktree } = splitWorld('feat-needs-db', {
    primaryStack: 'worktree',
    worktreeStack: 'worktree + docker',
  })
  // `readStackField` normalises to 'docker' / 'worktree' rather than echoing the
  // header, so assert on both roots — that difference IS the bug.
  const fromWorktree = resolveSpec('feat-needs-db', primary, baseConfig(), { preferDirs: [worktree] })
  const fromPrimary = resolveSpec('feat-needs-db', primary, baseConfig())
  assert.strictEqual(fromWorktree.stack, 'docker')
  assert.strictEqual(fromPrimary.stack, 'worktree')
})

test('Base version: is read from the worktree copy too', () => {
  const primary = seedSpec(checkout('primary'), 'hotfix-login-crash', { bucket: 'backlog' })
  const worktree = seedSpec(checkout('worktree'), 'hotfix-login-crash', {
    bucket: 'in-progress',
    baseVersion: 'v18.0.0',
  })
  const r = resolveSpec('hotfix-login-crash', primary, baseConfig(), { preferDirs: [worktree] })
  assert.strictEqual(r.baseRef, 'v18.0.0')
})

// --- repo identity must NOT move ---------------------------------------------

// This is the guard on `bug-spec-env-cwd-anchor`'s fix. The worktree path, the
// docker project name and `{repo}` are repo-level facts and must be identical
// from anywhere — only the spec FILE lookup is allowed to prefer the worktree.
test('worktree path, project name and repo still derive from the primary checkout', () => {
  const { primary, worktree } = splitWorld('feat-linear-spec-list')
  const r = resolveSpec('feat-linear-spec-list', primary, baseConfig(), { preferDirs: [worktree] })

  assert.strictEqual(r.repo, path.basename(primary))
  assert.strictEqual(r.worktreePath, path.resolve(primary, `../${r.repo}-wt`, 'linear-spec-list'))
  assert.strictEqual(r.projectName, `${r.repoSlug}_linear-spec-list`)
})

// --- stays silent -------------------------------------------------------------

// A caller standing in the primary checkout passes no preferDirs, and nothing
// about today's answer may change for them.
test('with no preferDirs the answer is exactly as before', () => {
  const { primary } = splitWorld('feat-linear-spec-list')
  const r = resolveSpec('feat-linear-spec-list', primary, baseConfig())
  assert.strictEqual(r.bucket, 'backlog')
})

// A preferred root that simply does not carry this spec is the ordinary case
// when you are in worktree A and ask about spec B. It must fall through, not
// throw — absence in one root is not evidence the spec does not exist.
test('a preferred root without the spec falls back to the primary checkout', () => {
  const { primary } = splitWorld('feat-linear-spec-list')
  const unrelated = checkout('other-worktree')
  const r = resolveSpec('feat-linear-spec-list', primary, baseConfig(), { preferDirs: [unrelated] })
  assert.strictEqual(r.bucket, 'backlog')
})

test('preferDirs and searchDirs coexist — preferred first, fallbacks last', () => {
  const { primary, worktree } = splitWorld('feat-linear-spec-list')
  const fallback = seedSpec(checkout('fallback'), 'feat-linear-spec-list', { bucket: 'complete' })
  const r = resolveSpec('feat-linear-spec-list', primary, baseConfig(), {
    preferDirs: [worktree],
    searchDirs: [fallback],
  })
  assert.strictEqual(r.bucket, 'in-progress')
})
