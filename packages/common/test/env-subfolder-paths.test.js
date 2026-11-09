'use strict'

// Repo-relative path matching for a project that may sit in a subfolder of its
// repo (spec feat-subfolder-project, phase 3). Git prints paths from the repo
// root; the spec's folders are the project's. Every check here used to compare
// the two directly and failed SILENTLY: spec documents classified as code, or
// as somebody else's work.
//
// The pure half pins a fixed prefix; the repo half is built on
// test/helpers/repo.js, so `pnpm test:nested` runs it nested as well.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { classifyDirtyTree } = require('../src/env/classify.js')
const { isNoise } = require('../src/env/review.js')
const { attachProject, projectRelative } = require('../src/env/project.js')
const { makeRepo } = require('./helpers/repo.js')

const P = 'FF.CSC.Solution'
const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function configFor(prefix, extra = {}) {
  return attachProject({ branch: { identifierField: '' }, spec: { companionPaths: [] }, ...extra }, { root: '/r', prefix })
}

// --- classifyDirtyTree ------------------------------------------------------

test('a nested spec document is the spec\'s; a sibling folder is not', () => {
  const { owned, foreign } = classifyDirtyTree(
    { folder: 'feat-x', slug: 'x' },
    [`${P}/specs/backlog/feat-x/00-overview.md`, 'Sql/schema.sql', `${P}/src/app.cs`],
    configFor(P),
  )
  assert.deepStrictEqual(owned, [`${P}/specs/backlog/feat-x/00-overview.md`])
  assert.deepStrictEqual(foreign, ['Sql/schema.sql', `${P}/src/app.cs`])
})

test('a companion path matches inside the project only', () => {
  const config = configFor(P, { spec: { companionPaths: ['specs/.core/snap-{slug}.json'] } })
  const { owned, foreign } = classifyDirtyTree(
    { folder: 'feat-x', slug: 'x' },
    [`${P}/specs/.core/snap-x.json`, 'specs/.core/snap-x.json'],
    config,
  )
  assert.deepStrictEqual(owned, [`${P}/specs/.core/snap-x.json`])
  assert.deepStrictEqual(foreign, ['specs/.core/snap-x.json'])
})

test('stays silent: a folder sharing the prefix as a string is not the project', () => {
  const { owned } = classifyDirtyTree(
    { folder: 'feat-x', slug: 'x' },
    [`${P}.Tests/specs/backlog/feat-x/00-overview.md`],
    configFor(P),
  )
  assert.deepStrictEqual(owned, [])
})

test('stays silent: prefix "" classifies exactly as before', () => {
  const paths = ['specs/backlog/feat-x/00-overview.md', 'app.js']
  assert.deepStrictEqual(classifyDirtyTree({ folder: 'feat-x', slug: 'x' }, paths, configFor('')), {
    owned: ['specs/backlog/feat-x/00-overview.md'],
    foreign: ['app.js'],
  })
  // And with no anchor on the config at all — every caller that predates it.
  assert.deepStrictEqual(
    classifyDirtyTree({ folder: 'feat-x', slug: 'x' }, paths, { spec: { companionPaths: [] } }),
    { owned: ['specs/backlog/feat-x/00-overview.md'], foreign: ['app.js'] },
  )
})

// --- isNoise ------------------------------------------------------------------

test('only the project\'s own specs/ and .spec-env/ are bookkeeping', () => {
  assert.strictEqual(isNoise(`${P}/specs/backlog/x/00-overview.md`, P), true)
  assert.strictEqual(isNoise(`${P}/.spec-env/reviews/x.html`, P), true)
  assert.strictEqual(isNoise('Sql/schema.sql', P), false, 'a sibling is code')
  assert.strictEqual(isNoise('specs/elsewhere.md', P), false, 'a root specs/ is not this project\'s')
})

test('stays silent: isNoise at prefix "" is unchanged', () => {
  assert.strictEqual(isNoise('specs/backlog/x/00-overview.md'), true)
  assert.strictEqual(isNoise('app.js'), false)
})

test('projectRelative walks out of the project for a sibling', () => {
  assert.strictEqual(projectRelative(`${P}/specs/a.md`, P), 'specs/a.md')
  assert.strictEqual(projectRelative('Sql/schema.sql', P), '../Sql/schema.sql')
  assert.strictEqual(projectRelative('Sql/schema.sql', ''), 'Sql/schema.sql')
})

// --- end to end, both layouts --------------------------------------------------

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [BIN, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

function scaffold() {
  return makeRepo({
    name: 'skitterspec-subpaths-',
    config: { baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } },
    files: {
      'app.js': 'one\n',
      'specs/backlog/feat-x/00-overview.md': '# X\n\n> **Stack:** worktree\n',
    },
  })
}

test('on a worktree page, a change beside the project is code and the spec is bookkeeping', () => {
  const repo = scaffold()
  try {
    const project = repo.addWorktree('feat-x')
    const wt = repo.worktreeFor('x').wt
    fs.mkdirSync(path.join(wt, 'Sql'), { recursive: true })
    fs.writeFileSync(path.join(wt, 'Sql', 'new.sql'), '-- new\n')
    fs.appendFileSync(path.join(project, 'specs', 'backlog', 'feat-x', '00-overview.md'), '- [x] done\n')
    const data = JSON.parse(cli(repo.dir, 'spec-env', 'review', 'feat-x', '--json'))
    const byRel = (rel) => data.files.find((f) => projectRelative(f.path, repo.prefix) === rel)
    const sql = byRel(repo.prefix ? '../Sql/new.sql' : 'Sql/new.sql')
    assert.ok(sql, data.files.map((f) => f.path).join(', '))
    assert.strictEqual(sql.noise, false, 'code')
    assert.strictEqual(byRel('specs/backlog/feat-x/00-overview.md').noise, true, 'bookkeeping')
  } finally {
    repo.cleanup()
  }
})

test('a docs render hands back pathspecs that stage from the project folder', () => {
  const repo = scaffold()
  try {
    const doc = path.join(repo.dir, 'specs', 'backlog', 'feat-y', '00-overview.md')
    fs.mkdirSync(path.dirname(doc), { recursive: true })
    fs.writeFileSync(doc, '# Y\n')
    const data = JSON.parse(cli(repo.dir, 'spec-env', 'review', 'feat-y', '--docs', '--json'))
    assert.deepStrictEqual(data.docs.paths, ['specs/backlog/feat-y/00-overview.md'])
    // The pathspec a committing verdict hands /commit — run from where a session stands.
    execFileSync('git', ['add', '--', ...data.docs.paths], { cwd: repo.dir })
    assert.match(repo.git('diff', '--cached', '--name-only'), /feat-y\/00-overview\.md/)
  } finally {
    repo.cleanup()
  }
})

test('stage never owns a change beside the project, and names it from the project folder', () => {
  const repo = scaffold()
  try {
    fs.mkdirSync(path.join(repo.root, 'Sql'), { recursive: true })
    fs.writeFileSync(path.join(repo.root, 'Sql', 'schema.sql'), '-- changed\n')
    fs.appendFileSync(path.join(repo.dir, 'specs', 'backlog', 'feat-x', '00-overview.md'), 'more\n')
    const r = JSON.parse(cli(repo.dir, 'spec-env', 'stage', 'feat-x', '--json'))
    assert.deepStrictEqual(r.owned, ['specs/backlog/feat-x/00-overview.md'])
    assert.deepStrictEqual(r.foreign, [repo.prefix ? '../Sql/schema.sql' : 'Sql/schema.sql'])
  } finally {
    repo.cleanup()
  }
})

test('the primary leak check sees a file written beside the project', () => {
  const repo = scaffold()
  try {
    repo.addWorktree('feat-x')
    cli(repo.dir, 'spec-env', 'resolve', 'feat-x', '--record-primary')
    fs.mkdirSync(path.join(repo.root, 'Sql'), { recursive: true })
    fs.writeFileSync(path.join(repo.root, 'Sql', 'leak.sql'), '-- leaked\n')
    let said = ''
    try {
      cli(repo.dir, 'spec-env', 'resolve', 'feat-x', '--assert-primary-clean')
    } catch (err) {
      said = `${err.stdout}${err.stderr}`
    }
    assert.match(said, /Sql\/leak\.sql/, 'the leak is reported')
  } finally {
    repo.cleanup()
  }
})
