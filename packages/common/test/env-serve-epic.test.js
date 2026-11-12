'use strict'

/**
 * The epic page the review server serves (spec feat-epic-next, phase 3),
 * stood up through `serverHooks` — the production wiring — against a live git
 * repo: an epic with one member in flight in its own worktree and one waiting.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer, renderIndex } = require('../src/env/serve.js')
const { renderEpicPage } = require('../src/env/epicpage.js')
const { loadEnvConfig } = require('../src/env/config.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-page-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  write(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
  write(path.join(dir, '.gitignore'), '/.spec-env/\n')
  write(path.join(dir, 'specs', 'backlog', 'epic-x', '00-overview.md'), '# X\n\n> **Type:** Epic\n')
  const a = path.join(dir, 'specs', 'backlog', 'feat-a')
  write(path.join(a, '00-overview.md'), '# A\n\n> **Epic:** epic-x\n> **Waits on:** none\n')
  write(path.join(a, '01-one.md'), '# Phase 1 ✅\n\n> **Status:** Done\n')
  write(path.join(a, '02-two.md'), '# Phase 2 ⬜\n\n> **Status:** Not started\n')
  write(path.join(dir, 'specs', 'backlog', 'feat-b', '00-overview.md'), '# B\n\n> **Epic:** epic-x\n> **Waits on:** feat-a\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'a')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/a', worktree)
  fs.mkdirSync(path.join(worktree, 'specs', 'in-progress'), { recursive: true })
  git(worktree, 'mv', 'specs/backlog/feat-a', 'specs/in-progress/feat-a')
  git(worktree, 'commit', '-q', '-m', 'start')
  return { dir, worktree }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/`
  return { get: (p = '') => fetch(base + p), close: () => new Promise((r) => server.close(r)) }
}

test('an epic address serves the epic page, rows and all', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const res = await s.get('epic-x')
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    assert.match(html, /<title>epic-x<\/title>/)
    assert.match(html, /<code>\/spec-next<\/code>/)
    assert.match(html, /waits on feat-a/)
    assert.match(html, /<meta http-equiv="refresh" content="30">/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a waiting page is a RELATIVE link, and a waiting pass shows no code', async () => {
  const { dir } = scaffold()
  write(path.join(dir, '.spec-env', 'reviews', 'feat-a.gate.json'), JSON.stringify({ version: 1, spec: 'feat-a', armed: true, phase: 2 }))
  const s = await serve(dir)
  try {
    let html = await (await s.get('epic-x')).text()
    assert.match(html, /<a href="feat-a">press a verdict on feat-a's page →<\/a>/)
    assert.doesNotMatch(html, /href="http/)

    write(path.join(dir, '.spec-env', 'reviews', 'feat-a.pending.json'), JSON.stringify({ version: 1, spec: 'feat-a', passes: [{ code: '324199' }, { code: '555123' }] }))
    html = await (await s.get('epic-x')).text()
    assert.match(html, /verdict waiting — <code>\/spec-reviewed<\/code>/)
    assert.doesNotMatch(html, /324199|555123/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('the index lists an epic with a member in flight, linked', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const html = await (await s.get('')).text()
    assert.match(html, /<a href="\/epic-x">epic-x<\/a>/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('an epic nobody names is still a 404', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual((await s.get('epic-nope')).status, 404)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

// ── pure renderings ──────────────────────────────────────────────────────────

const answer = (over = {}) => ({
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
  ...over,
})

test('an epic with no members renders its empty state, not a failure', () => {
  const html = renderEpicPage(answer())
  assert.match(html, /No member yet/)
})

test('the epic\'s own completion shows once every member is finished', () => {
  const html = renderEpicPage(answer({ members: [{ spec: 'feat-a', bucket: 'complete' }], next: { command: '/spec-complete epic-x' } }))
  assert.match(html, /<code>\/spec-complete epic-x<\/code>/)
})

test('STAYS SILENT: an index with no epic in flight carries no epics heading', () => {
  assert.doesNotMatch(renderIndex([]), /<h2>epics<\/h2>/)
  assert.match(renderIndex([], { epics: ['epic-x'], token: 't' }), /<a href="\/t\/epic-x">epic-x<\/a>/)
})

test('an epic being WRITTEN keeps its authoring page at the same address', async () => {
  const { dir } = scaffold()
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'y')
  git(dir, 'worktree', 'add', '-q', '-b', 'epic/y', wt)
  write(path.join(wt, 'specs', 'backlog', 'epic-y', '00-overview.md'), '# Y\n\n> **Type:** Epic\n')
  const s = await serve(dir)
  try {
    const res = await s.get('epic-y')
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    assert.doesNotMatch(html, /http-equiv="refresh"/, 'not the epic page')
    assert.match(html, /00-overview\.md/, 'its own documents, for a verdict')
  } finally {
    await s.close()
    cleanup(dir)
  }
})
