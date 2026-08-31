'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  resolveSpec,
  resolveBaseBranch,
  resolvePrimaryCheckout,
  splitPrefix,
  expandTokens,
  repoInfo,
  readStackField,
  readBaseVersionField,
} = require('../src/env/resolve.js')

// A fake git reader: maps a joined-args key → return value (string, '' , or null).
function fakeGit(map) {
  return (argv) => {
    const key = argv.join(' ')
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
  }
}

const ORIGIN_HEAD = 'symbolic-ref --short refs/remotes/origin/HEAD'
const HAS_MAIN = 'show-ref --verify --quiet refs/heads/main'
const HAS_MASTER = 'show-ref --verify --quiet refs/heads/master'

test('resolveBaseBranch: explicit config.baseBranch wins over everything', () => {
  const git = fakeGit({ [ORIGIN_HEAD]: 'origin/develop', [HAS_MAIN]: '' })
  assert.strictEqual(resolveBaseBranch({ baseBranch: 'trunk' }, git), 'trunk')
})

test('resolveBaseBranch: blank baseBranch falls through to detection', () => {
  const git = fakeGit({ [ORIGIN_HEAD]: 'origin/develop' })
  assert.strictEqual(resolveBaseBranch({ baseBranch: '  ' }, git), 'develop')
})

test('resolveBaseBranch: uses origin/HEAD when present (strips origin/)', () => {
  const git = fakeGit({ [ORIGIN_HEAD]: 'origin/main', [HAS_MAIN]: '' })
  assert.strictEqual(resolveBaseBranch({}, git), 'main')
})

test('resolveBaseBranch: no origin/HEAD → main if it exists', () => {
  const git = fakeGit({ [HAS_MAIN]: '' }) // '' = show-ref success (branch exists)
  assert.strictEqual(resolveBaseBranch({}, git), 'main')
})

test('resolveBaseBranch: no origin/HEAD, no main → master if it exists', () => {
  const git = fakeGit({ [HAS_MASTER]: '' })
  assert.strictEqual(resolveBaseBranch({}, git), 'master')
})

test('resolveBaseBranch: nothing detectable → defaults to main', () => {
  assert.strictEqual(resolveBaseBranch({}, fakeGit({})), 'main')
})

const COMMON_DIR = 'rev-parse --git-common-dir'

test('resolvePrimaryCheckout: from the primary checkout (.git) → dir itself', () => {
  // git-common-dir is relative (".git") when run from the primary checkout.
  const git = fakeGit({ [COMMON_DIR]: '.git' })
  assert.strictEqual(resolvePrimaryCheckout('/repo', git), '/repo')
})

test('resolvePrimaryCheckout: from a worktree (absolute /main/.git) → the primary root', () => {
  // this is the bug: run from a worktree, dir basename would mis-drive {repo}.
  const git = fakeGit({ [COMMON_DIR]: '/main/.git' })
  assert.strictEqual(resolvePrimaryCheckout('/main-wt/thing', git), '/main')
})

test('resolvePrimaryCheckout: not a git repo (null) → falls back to dir', () => {
  assert.strictEqual(resolvePrimaryCheckout('/somewhere', fakeGit({})), '/somewhere')
})

function baseConfig(overrides = {}) {
  return {
    worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
    docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
    branch: { pattern: '{type}/{slug}', identifierField: '' },
    ...overrides,
  }
}

// Scaffold a project dir with one spec folder + overview, return the dir.
function scaffold(folder, { bucket = 'backlog', frontmatter = '', stack = null, baseVersion = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resolve-'))
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  const stackLine = stack ? `> **Stack:** ${stack}\n` : ''
  const baseLine = baseVersion ? `> **Base version:** ${baseVersion}\n` : ''
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `${frontmatter}# ${folder}\n${stackLine}${baseLine}`)
  return dir
}

test('splitPrefix splits feat-/bug-/hotfix- prefixes', () => {
  assert.deepStrictEqual(splitPrefix('feat-linear-hybrid-sync'), {
    type: 'feat',
    slug: 'linear-hybrid-sync',
  })
  assert.deepStrictEqual(splitPrefix('bug-crash-on-save'), { type: 'bug', slug: 'crash-on-save' })
  assert.deepStrictEqual(splitPrefix('hotfix-login-crash'), { type: 'hotfix', slug: 'login-crash' })
})

test('splitPrefix defaults type to feat when unprefixed', () => {
  assert.deepStrictEqual(splitPrefix('legacy-spec'), { type: 'feat', slug: 'legacy-spec' })
})

test('expandTokens replaces known tokens and leaves unknown intact', () => {
  assert.strictEqual(expandTokens('{repo}_{slug}', { repo: 'app', slug: 'x' }), 'app_x')
  assert.strictEqual(expandTokens('{missing}', { repo: 'app' }), '{missing}')
})

test('repoInfo slugifies the repo basename', () => {
  assert.deepStrictEqual(repoInfo('/tmp/My App'), { repo: 'My App', repoSlug: 'my-app' })
})

test('resolveSpec: feat- spec with {type}/{slug} branch fallback', () => {
  const dir = scaffold('feat-linear-hybrid-sync')
  const r = resolveSpec('feat-linear-hybrid-sync', dir, baseConfig())
  assert.strictEqual(r.type, 'feat')
  assert.strictEqual(r.slug, 'linear-hybrid-sync')
  assert.strictEqual(r.bucket, 'backlog')
  assert.strictEqual(r.branch, 'feat/linear-hybrid-sync')
  assert.strictEqual(r.worktreeFolder, 'linear-hybrid-sync')
  // projectName expands {repoSlug}_{slug}
  assert.strictEqual(r.projectName, `${r.repoSlug}_linear-hybrid-sync`)
  // worktree is a resolved sibling path
  assert.strictEqual(r.worktreePath, path.resolve(dir, `../${r.repo}-wt`, 'linear-hybrid-sync'))
})

test('resolveSpec: bug- spec across a non-backlog bucket', () => {
  const dir = scaffold('bug-crash-on-save', { bucket: 'in-progress' })
  const r = resolveSpec('bug-crash-on-save', dir, baseConfig())
  assert.strictEqual(r.type, 'bug')
  assert.strictEqual(r.bucket, 'in-progress')
  assert.strictEqual(r.branch, 'bug/crash-on-save')
})

test('resolveSpec: {identifier} branch pattern uses the tracker id when configured', () => {
  const dir = scaffold('feat-hybrid-sync', {
    frontmatter: '---\ntracker_id: SKI-42\n---\n',
  })
  const r = resolveSpec(
    'feat-hybrid-sync',
    dir,
    baseConfig({ branch: { pattern: '{identifier}-{slug}', identifierField: 'tracker_id' } }),
  )
  assert.strictEqual(r.branch, 'SKI-42-hybrid-sync')
})

test('resolveSpec: {identifier} pattern falls back to {type}/{slug} when no field is configured', () => {
  const dir = scaffold('feat-hybrid-sync', {
    frontmatter: '---\ntracker_id: SKI-42\n---\n',
  })
  const r = resolveSpec(
    'feat-hybrid-sync',
    dir,
    baseConfig({ branch: { pattern: '{identifier}-{slug}', identifierField: '' } }),
  )
  assert.strictEqual(r.branch, 'feat/hybrid-sync')
})

test('resolveSpec: {identifier} pattern falls back when the id field is absent from the spec', () => {
  const dir = scaffold('feat-hybrid-sync')
  const r = resolveSpec(
    'feat-hybrid-sync',
    dir,
    baseConfig({ branch: { pattern: '{identifier}-{slug}', identifierField: 'tracker_id' } }),
  )
  assert.strictEqual(r.branch, 'feat/hybrid-sync')
})

test('resolveSpec: accepts a path argument (uses its basename)', () => {
  const dir = scaffold('feat-thing')
  const r = resolveSpec(path.join('specs', 'backlog', 'feat-thing'), dir, baseConfig())
  assert.strictEqual(r.slug, 'thing')
})

test('resolveSpec throws a clear error when the spec is not found', () => {
  const dir = scaffold('feat-thing')
  assert.throws(() => resolveSpec('feat-missing', dir, baseConfig()), /spec not found/)
})

test('resolveSpec names every root it searched when the spec is not found', () => {
  // The usual cause is a spec that only exists on its own branch, so the message
  // has to say which checkouts were looked in — "not found" alone sent a field
  // report chasing the wrong root.
  const dir = scaffold('feat-thing')
  const wt = path.join(dir, 'nope-wt')
  assert.throws(() => resolveSpec('feat-missing', dir, baseConfig(), { searchDirs: [wt] }), (err) => {
    assert.match(err.message, /spec not found under specs\/\*\*: feat-missing/)
    assert.ok(err.message.includes(dir), 'names the primary checkout')
    assert.ok(err.message.includes(wt), 'names the fallback search dir')
    return true
  })
})

test('resolveSpec: searchDirs finds a spec that lives only in a worktree', () => {
  // The integrate bug: a spec authored entirely on its branch was never
  // committed to the primary checkout, so its folder is absent there and
  // present only in the worktree. resolveSpec must still resolve it — while
  // keeping the worktree path + branch anchored to the PRIMARY checkout.
  const primary = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-primary-'))
  fs.mkdirSync(path.join(primary, 'specs', 'backlog'), { recursive: true })
  const worktree = scaffold('feat-branch-only', { bucket: 'complete' })

  // Reproduces the failure: without a fallback dir, integrate can't see it.
  assert.throws(() => resolveSpec('feat-branch-only', primary, baseConfig()), /spec not found/)

  // The fix: pass the worktree as a fallback search dir.
  const r = resolveSpec('feat-branch-only', primary, baseConfig(), { searchDirs: [worktree] })
  assert.strictEqual(r.slug, 'branch-only')
  assert.strictEqual(r.bucket, 'complete')
  assert.strictEqual(r.branch, 'feat/branch-only')
  // Coordinates still derive from the primary checkout, not the worktree.
  assert.strictEqual(r.worktreePath, path.resolve(primary, `../${r.repo}-wt`, 'branch-only'))
})

// --- Stack field (per-spec Docker escalation) -------------------------------

const dockerCfg = (enabled) =>
  baseConfig({ docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10, enabled } })

test('readStackField: explicit worktree/docker forms', () => {
  const wt = scaffold('feat-a', { stack: 'worktree' })
  const dk = scaffold('feat-b', { stack: 'worktree + docker' })
  assert.strictEqual(readStackField(path.join(wt, 'specs', 'backlog', 'feat-a'), dockerCfg(true)), 'worktree')
  assert.strictEqual(readStackField(path.join(dk, 'specs', 'backlog', 'feat-b'), dockerCfg(true)), 'docker')
})

test('readStackField: an explicit worktree suppresses Docker even when available', () => {
  const wt = scaffold('feat-a', { stack: 'worktree' })
  assert.strictEqual(readStackField(path.join(wt, 'specs', 'backlog', 'feat-a'), dockerCfg(true)), 'worktree')
})

test('readStackField: missing field follows the master switch (legacy behaviour)', () => {
  const p = (dir) => path.join(dir, 'specs', 'backlog', 'feat-a')
  assert.strictEqual(readStackField(p(scaffold('feat-a')), dockerCfg(true)), 'docker')
  assert.strictEqual(readStackField(p(scaffold('feat-a')), dockerCfg(false)), 'worktree')
})

test('resolveSpec: populates spec.stack from the header', () => {
  const dir = scaffold('feat-thing', { stack: 'worktree + docker' })
  assert.strictEqual(resolveSpec('feat-thing', dir, dockerCfg(true)).stack, 'docker')
  const wt = scaffold('feat-thing', { stack: 'worktree' })
  assert.strictEqual(resolveSpec('feat-thing', wt, dockerCfg(true)).stack, 'worktree')
})

// --- Hotfix: Base version tag (fork-from-tag provisioning) -------------------

test('readBaseVersionField: reads the tag, strips surrounding quotes/backticks', () => {
  const plain = scaffold('hotfix-a', { baseVersion: 'v33.16.4' })
  assert.strictEqual(readBaseVersionField(path.join(plain, 'specs', 'backlog', 'hotfix-a')), 'v33.16.4')
  const quoted = scaffold('hotfix-b', { baseVersion: '`v1.2.3`' })
  assert.strictEqual(readBaseVersionField(path.join(quoted, 'specs', 'backlog', 'hotfix-b')), 'v1.2.3')
})

test('readBaseVersionField: null when the field (or file) is absent', () => {
  const none = scaffold('feat-a')
  assert.strictEqual(readBaseVersionField(path.join(none, 'specs', 'backlog', 'feat-a')), null)
  assert.strictEqual(readBaseVersionField('/no/such/spec'), null)
})

test('resolveSpec: a hotfix resolves baseRef + hotfix/<slug> branch', () => {
  const dir = scaffold('hotfix-login-crash', { bucket: 'in-progress', baseVersion: 'v33.16.4' })
  const r = resolveSpec('hotfix-login-crash', dir, baseConfig())
  assert.strictEqual(r.type, 'hotfix')
  assert.strictEqual(r.slug, 'login-crash')
  assert.strictEqual(r.branch, 'hotfix/login-crash')
  assert.strictEqual(r.baseRef, 'v33.16.4')
})

test('resolveSpec: non-hotfix specs resolve baseRef:null (fork from HEAD)', () => {
  assert.strictEqual(resolveSpec('feat-thing', scaffold('feat-thing'), baseConfig()).baseRef, null)
  // Even a Base version line on a non-hotfix spec is ignored — only hotfix reads it.
  const dir = scaffold('bug-thing', { baseVersion: 'v9.9.9' })
  assert.strictEqual(resolveSpec('bug-thing', dir, baseConfig()).baseRef, null)
})
