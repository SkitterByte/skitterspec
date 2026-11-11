'use strict'

// The project's name on the pages the review server renders itself — the
// index, a spec's page and the epic page (spec feat-project-name-on-pages).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer, renderIndex } = require('../src/env/serve.js')
const { renderEpicPage } = require('../src/env/epicpage.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { primaryAnchor, attachProject } = require('../src/env/project.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

// A primary checkout named `acme` with one spec in its own worktree.
function scaffold(review = {}) {
  const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-served-name-')))
  const dir = path.join(parent, 'acme')
  fs.mkdirSync(dir)
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      branch: { pattern: '{type}/{slug}' },
      review: { reader: 'local', serve: 'never', ...review },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-alpha\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.join(parent, 'acme-wt', 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
  return { parent, dir }
}

// The daemon's own wiring: load, attach the anchor, build from `serverHooks`.
async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  attachProject(config, primaryAnchor(dir, (argv) => {
    try {
      return git(dir, ...argv)
    } catch {
      return null
    }
  }))
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/`
  return {
    get: async (p = '') => (await fetch(base + p)).text(),
    close: () => new Promise((r) => server.close(r)),
  }
}

const tabOf = (html) => /<title>([\s\S]*?)<\/title>/.exec(html)[1]
const h1Of = (html) => /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)[1]

test('the served index and a served spec page name the project', async () => {
  const { parent, dir } = scaffold()
  const s = await serve(dir)
  try {
    const index = await s.get()
    assert.strictEqual(tabOf(index), 'acme · spec diffs')
    assert.strictEqual(h1Of(index), 'acme · spec diffs')
    assert.strictEqual(tabOf(await s.get('feat-alpha')), 'acme · feat-alpha')
  } finally {
    await s.close()
    fs.rmSync(parent, { recursive: true, force: true })
  }
})

test('review.projectName reaches the served pages, escaped', async () => {
  const { parent, dir } = scaffold({ projectName: 'Acme <web>' })
  const s = await serve(dir)
  try {
    assert.strictEqual(tabOf(await s.get()), 'Acme &lt;web&gt; · spec diffs')
    assert.strictEqual(tabOf(await s.get('feat-alpha')), 'Acme &lt;web&gt; · feat-alpha')
  } finally {
    await s.close()
    fs.rmSync(parent, { recursive: true, force: true })
  }
})

test('stays silent: an index with no name reads as it always did', () => {
  const html = renderIndex([])
  assert.strictEqual(tabOf(html), 'spec diffs')
  assert.strictEqual(h1Of(html), 'spec diffs')
})

const answer = {
  epic: 'epic-x',
  found: true,
  lanes: null,
  freeLanes: null,
  members: [],
  rows: [],
  next: null,
  waves: [],
  syncPoints: [],
  clashes: [],
  cycles: [],
}

test('the epic page names the project in its tab and above its heading', () => {
  const html = renderEpicPage(answer, { project: 'a&b' })
  assert.strictEqual(tabOf(html), 'a&amp;b · epic-x')
  assert.match(html, /<p class="eyebrow">a&amp;b<\/p>\n<h1>epic-x<\/h1>/)
})

test('stays silent: an epic page with no name reads as it always did', () => {
  const html = renderEpicPage(answer)
  assert.strictEqual(tabOf(html), 'epic-x')
  assert.ok(!html.includes('class="eyebrow"'))
})
