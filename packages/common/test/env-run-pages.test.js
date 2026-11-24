'use strict'

/**
 * The pages an autonomous run leaves behind (feat-autonomous-run, phase 3):
 * kept phase snapshots, the served run index, and the final page's aggregate.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { execFileSync } = require('node:child_process')

const { carriedItems, renderAggregate, renderRunIndex, snapshotPath, snapshotPhases } = require('../src/env/runpage.js')
const { routeFor, createReviewServer } = require('../src/env/serve.js')
const { BUTTON_SETS, COMMITTING } = require('../src/env/review.js')

const report = {
  phases: {
    2: { phase: '2', at: 't2', rows: [{ field: 'Follow-ups', value: 'parser `x` needs a guard', more: [] }, { field: 'Notes', value: 'none', more: [] }] },
    1: { phase: '1', at: 't1', rows: [{ field: 'Notes', value: 'hit a <flaky> test', more: [] }, { field: 'Follow-ups', value: 'none', more: [] }, { field: 'Built', value: 'the parser', more: [] }] },
  },
}
const run = { active: false, mode: 'auto', then: 'pause', outcome: 'pause', phases: [{ n: 1, commit: 'abcdef1234' }, { n: 2, commit: '1234567' }], stops: [{ phase: 2, reason: 'red after 3' }], compactions: [{ phase: 2, at: 't' }] }

/* ---- pure ---------------------------------------------------------------- */

test('the aggregate carries every phase’s Notes and Follow-ups in order, dropping "none"', () => {
  assert.deepStrictEqual(
    carriedItems(report).map((i) => [i.phase, i.field]),
    [['1', 'Notes'], ['2', 'Follow-ups']],
  )
  const html = renderAggregate({ report, run, spec: 'feat-x', snapshots: [1, 2] })
  assert.ok(html.indexOf('Follow-ups, bugs and suggestions') < html.indexOf('Notes'))
  assert.match(html, /<code>x<\/code>/)
  assert.ok(!html.includes('<flaky>'))
  assert.match(html, /red after 3/)
  assert.match(html, /compacted 1×, during phase 2/)
  assert.match(html, /href="feat-x\/phase-2"/)
  assert.match(html, /href="feat-x\/run"/)
})

test('stays silent: no run and no report renders no aggregate', () => {
  assert.strictEqual(renderAggregate({ report: { phases: {} }, run: null, spec: 'x' }), '')
})

test('the run index lists phases with their commit and what each built', () => {
  const html = renderRunIndex({ spec: 'feat-x', run, report, snapshots: [1], token: 'tok', project: 'proj' })
  assert.match(html, /<a href="\/tok\/feat-x\/phase-1">phase 1<\/a>/)
  assert.match(html, /abcdef12/)
  assert.match(html, /the parser/)
  // Phase 2 was committed but has no snapshot: named, not linked.
  assert.match(html, /<li>phase 2<span/)
  assert.match(html, /ended · pause/)
})

test('the run index with no run says so', () => {
  assert.match(renderRunIndex({ spec: 'feat-x' }), /no run recorded/)
})

test('routes: <spec>/run and <spec>/phase-<n> are reads; anything else two deep is not found', () => {
  assert.deepStrictEqual(routeFor('/t/feat-x/run', { token: 't' }), { kind: 'run', spec: 'feat-x' })
  assert.deepStrictEqual(routeFor('/t/feat-x/phase-3', { token: 't' }), { kind: 'snapshot', spec: 'feat-x', phase: 3 })
  assert.deepStrictEqual(routeFor('/t/feat-x/phase-x', { token: 't' }), { kind: 'notfound' })
  assert.deepStrictEqual(routeFor('/t/feat-x/a/b', { token: 't' }), { kind: 'notfound' })
})

test('the final and snapshot sets exist; the endings clear the gate like any committing verdict', () => {
  assert.ok(BUTTON_SETS.includes('snapshot') && BUTTON_SETS.includes('final'))
  for (const v of ['complete', 'push', 'pr']) assert.ok(COMMITTING.includes(v))
})

/* ---- served --------------------------------------------------------------- */

function get(server, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const { port } = server.address()
    const req = http.request({ port, path: url, method }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end(method === 'POST' ? '{}' : undefined)
  })
}

test('the server answers the run and snapshot routes through its hooks, and refuses a POST to them', async (t) => {
  const server = createReviewServer({
    resolveEntries: () => [],
    render: () => null,
    receive: () => ({ code: '123456' }),
    runPage: (spec) => (spec === 'feat-x' ? { html: '<p>run</p>' } : null),
    snapshot: (spec, n) => (spec === 'feat-x' && n === 1 ? { html: '<p>one</p>' } : null),
    token: 'tok',
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  assert.deepStrictEqual(await get(server, '/tok/feat-x/run'), { status: 200, body: '<p>run</p>' })
  assert.deepStrictEqual(await get(server, '/tok/feat-x/phase-1'), { status: 200, body: '<p>one</p>' })
  assert.strictEqual((await get(server, '/tok/feat-x/phase-2')).status, 404)
  assert.strictEqual((await get(server, '/tok/feat-y/run')).status, 404)
  assert.strictEqual((await get(server, '/tok/feat-x/run', 'POST')).status, 404)
})

test('an older server built without the hooks says not found', async (t) => {
  const server = createReviewServer({ resolveEntries: () => [], render: () => null, token: 'tok' })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  assert.strictEqual((await get(server, '/tok/feat-x/run')).status, 404)
})

/* ---- through the CLI ------------------------------------------------------- */

function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-runpages-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, review: { reader: 'local', serve: 'never' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# feat-x\n\n> **Run:** auto\n')
  fs.writeFileSync(path.join(specDir, '01-first.md'), '# Phase 1 — first ⬜\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt/x`)
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  fs.writeFileSync(path.join(wt, 'app.js'), 'ONE\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const CLI = path.join(__dirname, '..', 'src', 'cli.js')
const cli = (dir, ...argv) =>
  execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(CLI)}).run(process.argv.slice(1)).catch((e) => { console.error(e); process.exit(1) })`, ...argv, '--dir', dir],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-x.html')

test('--snapshot keeps the phase page read-only and out of the next render’s way', (t) => {
  const { dir, wt } = scaffold()
  t.after(() => cleanup(dir))
  const said = cli(dir, 'spec-env', 'review', 'feat-x', '--snapshot', '--phase', '1')
  assert.match(said, /snapshot: phase 1/)
  const snap = snapshotPath(outPath(dir), 1)
  assert.match(fs.readFileSync(snap, 'utf8'), /"buttons":"snapshot"/)
  // The next phase's render overwrites the page, never the snapshot.
  fs.writeFileSync(path.join(wt, 'app.js'), 'ONE TWO\n')
  cli(dir, 'spec-env', 'review', 'feat-x')
  assert.match(fs.readFileSync(snap, 'utf8'), /"buttons":"snapshot"/)
  assert.deepStrictEqual(snapshotPhases(outPath(dir)), [1])
})

test('--snapshot without --phase keeps nothing and says why', (t) => {
  const { dir } = scaffold()
  t.after(() => cleanup(dir))
  assert.match(cli(dir, 'spec-env', 'review', 'feat-x', '--snapshot'), /--snapshot needs --phase/)
  assert.deepStrictEqual(snapshotPhases(outPath(dir)), [])
})

test('--final renders the whole branch under the ending’s buttons, headed by the run', (t) => {
  const { dir, wt } = scaffold()
  t.after(() => cleanup(dir))
  cli(dir, 'spec-env', 'run', 'resolve', 'feat-x')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-qm', 'phase 1')
  cli(dir, 'spec-env', 'run', 'phase', 'feat-x', '1', '--commit', git(wt, 'rev-parse', 'HEAD'))
  const json = JSON.parse(cli(dir, 'spec-env', 'review', 'feat-x', '--final', '--json'))
  assert.strictEqual(json.mode, 'branch')
  const html = fs.readFileSync(outPath(dir), 'utf8')
  assert.match(html, /"buttons":"final"/)
  assert.match(html, /The whole run/)
})

test('--final with a contradicting --buttons refuses and renders nothing', (t) => {
  const { dir } = scaffold()
  t.after(() => cleanup(dir))
  assert.match(cli(dir, 'spec-env', 'review', 'feat-x', '--final', '--buttons', 'midrun'), /contradict/)
  assert.strictEqual(fs.existsSync(outPath(dir)), false)
})
