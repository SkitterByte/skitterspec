'use strict'

// The project's name on generated pages (spec feat-project-name-on-pages):
// `review.projectName` when set, else the primary project folder's name — never
// the worktree's, which is named after the spec.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { loadEnvConfig, CONFIG_FILE } = require('../src/env/config.js')
const { primaryAnchor, attachProject, projectName } = require('../src/env/project.js')
const { rawGitReader, collectReview, renderReviewPage, renderReviewFragment } = require('../src/env/review.js')

function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8' }).trim()
}

function reader(cwd) {
  return (args) => {
    try {
      return git(cwd, ...args)
    } catch {
      return null
    }
  }
}

// A primary checkout named `acme` with a linked worktree named after a spec.
function scaffold() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-name-')))
  const main = path.join(root, 'acme')
  fs.mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'test@example.com')
  git(main, 'config', 'user.name', 'Test')
  fs.writeFileSync(path.join(main, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(main, 'keep.txt'), 'one\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-qm', 'init')
  const wt = path.join(root, 'acme-wt', 'feat-x')
  git(main, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  return { main, wt }
}

function configFrom(dir, review) {
  if (review) {
    const file = path.join(dir, CONFIG_FILE)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ review }), 'utf-8')
  }
  const anchor = primaryAnchor(dir, reader(dir))
  const { config } = loadEnvConfig(anchor.dir)
  return attachProject(config, anchor)
}

function data(wt, project) {
  return collectReview({
    spec: { folder: 'feat-x', branch: 'feat/x', worktreePath: wt },
    git: rawGitReader(wt),
    mode: 'working',
    ref: 'HEAD',
    now: '2020-01-01T00:00:00.000Z',
    project,
  })
}

const tabOf = (html) => /<title>([\s\S]*?)<\/title>/.exec(html)[1]

test('rendered from a worktree, the name is the primary checkout\'s', () => {
  const { wt } = scaffold()
  assert.strictEqual(projectName(configFrom(wt)), 'acme')
})

test('review.projectName wins over the folder name, trimmed', () => {
  const { main } = scaffold()
  assert.strictEqual(projectName(configFrom(main, { projectName: '  Acme Web  ' })), 'Acme Web')
})

test('a blank review.projectName falls back to the folder name', () => {
  const { main } = scaffold()
  assert.strictEqual(projectName(configFrom(main, { projectName: '   ' })), 'acme')
})

test('a subfolder project is named after its own folder', () => {
  assert.strictEqual(projectName({ review: {}, project: { root: '/r/mono', prefix: 'apps/web' } }), 'web')
})

test('no anchor and no override is cannot-tell: null', () => {
  assert.strictEqual(projectName({ review: { projectName: '' } }), null)
  assert.strictEqual(projectName(null), null)
})

test('the tab reads <project> · <spec>, and the island carries the name', () => {
  const { wt } = scaffold()
  const d = data(wt, 'acme')
  assert.strictEqual(d.project, 'acme')
  assert.strictEqual(d.title, 'feat-x', 'the heading stays the spec')
  assert.strictEqual(tabOf(renderReviewPage(d)), 'acme · feat-x')
  assert.strictEqual(tabOf(renderReviewFragment(d)), 'acme · feat-x', 'the published page too')
})

test('a name carrying markup is escaped in the tab', () => {
  const { wt } = scaffold()
  const html = renderReviewPage(data(wt, '<b>&co'))
  assert.strictEqual(tabOf(html), '&lt;b&gt;&amp;co · feat-x')
})

test('stays silent: no name renders the tab and data exactly as before', () => {
  const { wt } = scaffold()
  const d = data(wt, null)
  assert.ok(!('project' in d))
  assert.strictEqual(tabOf(renderReviewPage(d)), 'feat-x')
})
