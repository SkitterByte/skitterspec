'use strict'

/**
 * A PAGE THAT OPENS WITH NOTHING ON IT.
 *
 * The reader opened a freshly authored spec's review page and the main column
 * held the WHY card, the surfaces block and the verdict strip — and no diff at
 * all. Clicking any file in the tree made that file appear, because `reveal()`
 * ticks the bookkeeping box on the way past. Seven files changed, seven files
 * folded away, and nothing on screen saying so.
 *
 * Two independent causes, both of which end in the same empty page, so both are
 * pinned here.
 *
 * ONE — the served view. `/spec` writes the spec in its own `--docs` worktree
 * and the CLI renders the documents page correctly. The daemon re-derives the
 * view per request, and `docsWorktree` disqualified the tree over ANY path that
 * is not this spec's own documents. The linking push writes a tracker snapshot
 * into that same tree (`specs/.core/linear-base/<ID>.base.json`), and a project
 * that never declared it in `spec.companionPaths` therefore has one foreign
 * path sitting beside the spec at exactly the moment the page is opened. The
 * view fell through to `worktree`, where every `specs/**` path is bookkeeping.
 *
 * TWO — the collector. Bookkeeping is defined RELATIVE TO the code beside it:
 * the spec's own checkbox edits are not what anyone came to read when there is
 * a diff to read. With nothing else in the change there is no relative left,
 * and folding all of it away renders a page whose subject is invisible. That
 * one is reachable without any of cause one — a phase that only edits its own
 * spec documents lands on it from the ordinary worktree view.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer } = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { collectReview, rawGitReader } = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

/**
 * A repo with one spec authored in its own `--docs` worktree, exactly as
 * `/spec` leaves it — and, when asked, the tracker snapshot the linking push
 * drops beside it in a project that declares no `companionPaths`.
 */
function scaffold({ snapshot = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-empty-')))
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
      review: { reader: 'local', serve: 'never' },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const root = path.resolve(dir, `../${path.basename(dir)}-wt`)
  const docsWt = path.join(root, 'authored')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/authored', docsWt)
  const authored = path.join(docsWt, 'specs', 'backlog', 'feat-authored')
  fs.mkdirSync(authored, { recursive: true })
  fs.writeFileSync(path.join(authored, '00-overview.md'), '# feat-authored\n\n> **Status:** Ready\n')
  fs.writeFileSync(path.join(authored, '01-first.md'), '# Phase 1 — first ⬜\n\nGoal\n')
  if (snapshot) {
    const base = path.join(docsWt, 'specs', '.core', 'linear-base')
    fs.mkdirSync(base, { recursive: true })
    fs.writeFileSync(path.join(base, 'ABC-1.base.json'), '{"spec":"feat-authored"}\n')
  }
  return { dir, root, docsWt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// The real server, through the production wiring the daemon uses.
async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  return {
    get: (p = '') => fetch(`http://127.0.0.1:${addr.port}/${p}`),
    close: () => new Promise((r) => server.close(r)),
  }
}

// What the page's data island holds: the button set, and each file's path with
// the flag that decides whether it is open when the page loads.
async function pageOf(s, folder) {
  const res = await s.get(folder)
  assert.strictEqual(res.status, 200, `${folder} must serve`)
  const html = await res.text()
  const buttons = (html.match(/"buttons":"([a-z-]+)"/) || [null, 'committing'])[1]
  const files = [...html.matchAll(/"path":"([^"]+)"[\s\S]{0,600}?"noise":(true|false)/g)].map((m) => ({
    path: m[1],
    noise: m[2] === 'true',
  }))
  return { buttons, files, html }
}

/* ==========================================================================
 * Cause one — one undeclared path beside the spec loses the whole page
 * ========================================================================== */

test('a tracker snapshot beside an authored spec does not cost it its page', async () => {
  // RED BEFORE THE FIX: `committing`, and all three files folded away.
  const { dir } = scaffold({ snapshot: true })
  const s = await serve(dir)
  try {
    const { buttons, files } = await pageOf(s, 'feat-authored')
    assert.strictEqual(buttons, 'authoring', 'it is still a spec being written')
    const open = files.filter((f) => !f.noise).map((f) => f.path)
    assert.deepStrictEqual(
      open.sort(),
      ['specs/backlog/feat-authored/00-overview.md', 'specs/backlog/feat-authored/01-first.md'],
      'the documents are the subject of an authoring page',
    )
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('the served page shows the same files the CLI rendered — the snapshot is not one', async () => {
  // `--docs` renders `owned` only, so a page that suddenly listed the snapshot
  // would be a different page from the one the run reported.
  const { dir } = scaffold({ snapshot: true })
  const s = await serve(dir)
  try {
    const { files } = await pageOf(s, 'feat-authored')
    assert.deepStrictEqual(
      files.map((f) => f.path).sort(),
      ['specs/backlog/feat-authored/00-overview.md', 'specs/backlog/feat-authored/01-first.md'],
    )
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('STAYS SILENT: an authoring tree with no snapshot in it is unchanged', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const { buttons, files } = await pageOf(s, 'feat-authored')
    assert.strictEqual(buttons, 'authoring')
    assert.ok(files.length && files.every((f) => !f.noise))
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('STAYS SILENT: real code beside the spec is still a worktree view', async () => {
  // Rule 3, and the line this fix must not cross. `specs/.core/**` is project
  // bookkeeping; a source file is somebody's unfinished work, and a tree
  // holding one is not a spec being written.
  const { dir, docsWt } = scaffold({ snapshot: true })
  fs.writeFileSync(path.join(docsWt, 'app.js'), 'one\ntwo\nthree\n')
  const s = await serve(dir)
  try {
    const { buttons } = await pageOf(s, 'feat-authored')
    assert.strictEqual(buttons, 'committing', 'code in the tree is not an authoring page')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * Cause two — a change that is ALL bookkeeping has nothing to be beside
 * ========================================================================== */

function phaseScaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-allnoise-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-x\n\n> **Status:** In Progress\n')
  fs.writeFileSync(path.join(dir, 'src.js'), 'one\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return { dir, sd }
}

function collect(dir) {
  return collectReview({
    spec: { folder: 'feat-x', slug: 'x', worktreePath: dir },
    git: rawGitReader(dir),
    ref: 'HEAD',
    now: new Date().toISOString(),
    buttons: 'committing',
  })
}

test('a change that is nothing but bookkeeping is the thing to read', () => {
  // RED BEFORE THE FIX: every file `noise: true`, so the page opened empty.
  const { dir, sd } = phaseScaffold()
  try {
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-x\n\n> **Status:** In Progress\n\n- [x] one\n')
    const data = collect(dir)
    assert.ok(data.files.length, 'there is a change')
    assert.ok(
      data.files.every((f) => !f.noise),
      'with nothing else in the diff, the bookkeeping IS the diff',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: bookkeeping beside code is still folded away', () => {
  // Rule 3. The whole point of the flag survives: one source file in the change
  // and the spec's own edits go back to being the margin notes they are.
  const { dir, sd } = phaseScaffold()
  try {
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-x\n\n> **Status:** In Progress\n\n- [x] one\n')
    fs.writeFileSync(path.join(dir, 'src.js'), 'one\ntwo\n')
    const data = collect(dir)
    const byPath = Object.fromEntries(data.files.map((f) => [f.path, f]))
    assert.strictEqual(byPath['specs/in-progress/feat-x/00-overview.md'].noise, true)
    assert.strictEqual(byPath['src.js'].noise, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: a change with no files at all is not made noisy', () => {
  // An empty diff has no flags to invert, and the clean-tree fallback above it
  // is what answers that case.
  const { dir } = phaseScaffold()
  try {
    const data = collect(dir)
    assert.strictEqual(data.files.length, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
