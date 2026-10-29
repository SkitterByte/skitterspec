'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { expandStateArgs, specColumn, specCell } = require('../src/list-rows.js')
const { makeSpecHelpers } = require('../src/specs.js')
const { resolveSpec } = require('@skitterbyte/skitterspec-common/src/env/resolve.js')
const { loadEnvConfig } = require('@skitterbyte/skitterspec-common/src/env/config.js')

const CONFIG = {
  states: { backlog: 'New', 'in-progress': 'Active', complete: 'Closed', cancelled: 'Removed' },
  stateAliases: { 'in-progress': ['Blocked'] },
  fields: { identifier: 'demo_identifier', url: 'demo_url', issueId: 'demo_issue_id', assigneeId: 'demo_assignee_id' },
}

test('--state expands a bucket to every name it has, and keeps a tracker name as is', () => {
  assert.deepStrictEqual(expandStateArgs(['in-progress', 'Next Sprint'], CONFIG), ['Active', 'Blocked', 'Next Sprint'])
})

test('a mapped board state that differs from the spec disagrees', () => {
  const c = specColumn('Active', { bucket: 'backlog' }, CONFIG)
  assert.deepStrictEqual(c, { specStatus: 'backlog', disagrees: true })
  assert.strictEqual(specCell(c), '≠ backlog')
})

test('an alias agrees with its bucket', () => {
  assert.strictEqual(specColumn('Blocked', { bucket: 'in-progress' }, CONFIG).disagrees, false)
})

// STAYS-SILENT: an unmapped state, and a spec not on this machine, never flag.
test('an unmapped state or a missing spec never disagrees', () => {
  assert.strictEqual(specColumn('Next Sprint', { bucket: 'backlog' }, CONFIG).disagrees, false)
  const none = specColumn('Active', null, CONFIG)
  assert.deepStrictEqual(none, { specStatus: null, disagrees: false })
  assert.strictEqual(specCell(none), '—')
})

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' })

function writeSpec(root, bucket, name, id) {
  const d = path.join(root, 'specs', bucket, name)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), `---\ndemo_identifier: "${id}"\n---\n\n# ${name}\n`)
}

test("a spec's bucket is read from its own worktree, not the base branch", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'list-live-'))
  const repo = path.join(base, 'repo')
  fs.mkdirSync(path.join(repo, 'specs', '.core'), { recursive: true })
  git(base, 'init', '-q', '-b', 'main', repo)
  git(repo, 'config', 'user.email', 't@x.io')
  git(repo, 'config', 'user.name', 'T')
  fs.writeFileSync(path.join(repo, 'specs', '.core', 'env.config.json'), '{}')
  writeSpec(repo, 'backlog', 'feat-wip', '#1')
  writeSpec(repo, 'backlog', 'feat-idle', '#2')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-qm', 'init')

  const { config: env } = loadEnvConfig(repo)
  const wt = resolveSpec('feat-wip', repo, env).worktreePath
  git(repo, 'worktree', 'add', '-q', wt, '-b', 'feat/wip')
  fs.mkdirSync(path.join(wt, 'specs', 'in-progress'), { recursive: true })
  fs.renameSync(path.join(wt, 'specs', 'backlog', 'feat-wip'), path.join(wt, 'specs', 'in-progress', 'feat-wip'))
  writeSpec(wt, 'backlog', 'feat-only-there', '#3')

  const { listSpecs, listSpecsLive } = makeSpecHelpers()
  const plain = Object.fromEntries(listSpecs(repo, CONFIG).map((s) => [s.spec, s.bucket]))
  assert.strictEqual(plain['feat-wip'], 'backlog', 'the base branch alone is wrong about it')

  const live = Object.fromEntries(listSpecsLive(repo, CONFIG).map((s) => [s.spec, s]))
  assert.strictEqual(live['feat-wip'].bucket, 'in-progress')
  assert.strictEqual(live['feat-wip'].source, 'worktree')
  assert.strictEqual(live['feat-idle'].source, 'here')
  assert.strictEqual(live['feat-only-there'].source, 'other-tree')
})

// STAYS-SILENT: without isolation configured, it is exactly listSpecs.
test('with no env.config.json it reads the current tree only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-live-plain-'))
  writeSpec(dir, 'backlog', 'feat-a', '#1')
  const { listSpecs, listSpecsLive } = makeSpecHelpers()
  assert.deepStrictEqual(
    listSpecsLive(dir, CONFIG).map(({ spec, bucket }) => ({ spec, bucket })),
    listSpecs(dir, CONFIG).map(({ spec, bucket }) => ({ spec, bucket })),
  )
})
