'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  resolveSpec,
  splitPrefix,
  expandTokens,
  repoInfo,
  readStackField,
} = require('../src/env/resolve.js')

function baseConfig(overrides = {}) {
  return {
    worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
    docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
    linkLinear: true,
    ...overrides,
  }
}

// Scaffold a project dir with one spec folder + overview, return the dir.
function scaffold(folder, { bucket = 'backlog', frontmatter = '', linear = null, stack = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-resolve-'))
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  const stackLine = stack ? `> **Stack:** ${stack}\n` : ''
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `${frontmatter}# ${folder}\n${stackLine}`)
  if (linear) {
    const coreDir = path.join(dir, 'specs', '.core')
    fs.mkdirSync(coreDir, { recursive: true })
    fs.writeFileSync(path.join(coreDir, 'linear.config.json'), JSON.stringify(linear))
  }
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

test('resolveSpec: Linear branch pattern used when config + identifier present', () => {
  const dir = scaffold('feat-hybrid-sync', {
    frontmatter: '---\nlinear_identifier: SKI-42\n---\n',
    linear: { branch: { pattern: '{identifier}-{slug}' } },
  })
  const r = resolveSpec('feat-hybrid-sync', dir, baseConfig())
  assert.strictEqual(r.branch, 'SKI-42-hybrid-sync')
})

test('resolveSpec: falls back to {type}/{slug} when linkLinear is off', () => {
  const dir = scaffold('feat-hybrid-sync', {
    frontmatter: '---\nlinear_identifier: SKI-42\n---\n',
    linear: { branch: { pattern: '{identifier}-{slug}' } },
  })
  const r = resolveSpec('feat-hybrid-sync', dir, baseConfig({ linkLinear: false }))
  assert.strictEqual(r.branch, 'feat/hybrid-sync')
})

test('resolveSpec: falls back when identifier is missing despite a Linear config', () => {
  const dir = scaffold('feat-hybrid-sync', {
    linear: { branch: { pattern: '{identifier}-{slug}' } },
  })
  const r = resolveSpec('feat-hybrid-sync', dir, baseConfig())
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
