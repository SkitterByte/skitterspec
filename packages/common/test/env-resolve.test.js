'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  resolveSpec,
  resolveBaseBranch,
  splitPrefix,
  expandTokens,
  repoInfo,
  readStackField,
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

function baseConfig(overrides = {}) {
  return {
    worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
    docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
    branch: { pattern: '{type}/{slug}', identifierField: '' },
    ...overrides,
  }
}

// Scaffold a project dir with one spec folder + overview, return the dir.
function scaffold(folder, { bucket = 'backlog', frontmatter = '', stack = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resolve-'))
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  const stackLine = stack ? `> **Stack:** ${stack}\n` : ''
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `${frontmatter}# ${folder}\n${stackLine}`)
  return dir
}

test('splitPrefix splits feat-/bug- prefixes', () => {
  assert.deepStrictEqual(splitPrefix('feat-linear-hybrid-sync'), {
    type: 'feat',
    slug: 'linear-hybrid-sync',
  })
  assert.deepStrictEqual(splitPrefix('bug-crash-on-save'), { type: 'bug', slug: 'crash-on-save' })
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
