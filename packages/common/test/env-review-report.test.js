'use strict'

/**
 * The phase report on the review page (feat-autonomous-run, phase 2): the
 * terminal block's rows, stored per phase and rendered at the top of the page.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  validateReport,
  recordReport,
  latestReport,
  renderReportBlock,
  emptyReport,
  readReport,
  CARRIED,
} = require('../src/env/report.js')

/* ---- pure ---------------------------------------------------------------- */

test('rows are ordered as spec-reports.md defines, with Follow-ups and Next last', () => {
  const v = validateReport([
    { field: 'Next', value: '/commit' },
    { field: 'Follow-ups', value: 'none' },
    { field: 'Mystery', value: 'kept' },
    { field: '**Built**', value: 'a thing' },
    { field: 'Tracker', value: '#1' },
  ])
  assert.ok(v.ok)
  assert.deepStrictEqual(v.rows.map((r) => r.field), ['Tracker', 'Built', 'Mystery', 'Follow-ups', 'Next'])
})

test('an empty field continues the row above — Next with its manual steps', () => {
  const v = validateReport({
    title: '⚠️ **Phase 2 code built** — `feat-x`',
    rows: [
      { field: 'Next', value: '`/spec-live`, then:' },
      { field: '', value: '1. Open Settings' },
      { field: '', value: 'then `/spec-next`' },
    ],
  })
  assert.deepStrictEqual(v.rows[0].more, ['1. Open Settings', 'then `/spec-next`'])
  assert.strictEqual(v.title, '⚠️ **Phase 2 code built** — `feat-x`')
})

test('malformed reports are refused with a reason', () => {
  assert.strictEqual(validateReport('nope').ok, false)
  assert.strictEqual(validateReport([{ field: '', value: 'orphan' }]).ok, false)
  assert.strictEqual(validateReport([{ field: 'Built', value: 3 }]).ok, false)
})

test('the latest recorded phase is what the page shows', () => {
  let r = emptyReport('feat-x')
  r = recordReport(r, { phase: 1, rows: [{ field: 'Built', value: 'one', more: [] }], at: '2026-01-01T00:00:00Z' })
  r = recordReport(r, { phase: 2, rows: [{ field: 'Built', value: 'two', more: [] }], at: '2026-01-02T00:00:00Z' })
  assert.strictEqual(latestReport(r).phase, '2')
  r = recordReport(r, { phase: 1, rows: [{ field: 'Built', value: 'one again', more: [] }], at: '2026-01-03T00:00:00Z' })
  assert.strictEqual(Object.keys(r.phases).length, 2)
  assert.strictEqual(latestReport(r).rows[0].value, 'one again')
})

test('values are escaped; only code and bold marks become markup', () => {
  const html = renderReportBlock({ phase: '1', title: null, rows: [{ field: 'Notes', value: '<script>x</script> `a<b` **ok**', more: ['<img>'] }] })
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<img>'))
  assert.match(html, /<code>a&lt;b<\/code>/)
  assert.match(html, /<strong>ok<\/strong>/)
  assert.match(html, /Phase 1 report/)
})

test('stays silent: no report renders nothing', () => {
  assert.strictEqual(renderReportBlock(null), '')
  assert.strictEqual(renderReportBlock({ rows: [] }), '')
  assert.strictEqual(latestReport(emptyReport('x')), null)
})

test('Notes and Follow-ups are the fields a later page carries', () => {
  assert.deepStrictEqual([...CARRIED], ['Notes', 'Follow-ups'])
})

/* ---- through the CLI ------------------------------------------------------- */

function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function scaffold() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-report-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
      review: { reader: 'local', serve: 'never' },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# feat-x\n')
  fs.writeFileSync(path.join(specDir, '01-first.md'), '# Phase 1 — first ⬜\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt/x`)
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  fs.writeFileSync(path.join(wt, 'app.js'), 'ONE\n')
  return dir
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const CLI = path.join(__dirname, '..', 'src', 'cli.js')
const render = (dir, ...extra) =>
  execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(CLI)}).run(process.argv.slice(1)).catch((e) => { console.error(e); process.exit(1) })`, 'spec-env', 'review', 'feat-x', '--dir', dir, ...extra],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
const page = (dir) => fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-x.html'), 'utf8')

test('--report stores the rows per phase and puts the table on the page', (t) => {
  const dir = scaffold()
  t.after(() => cleanup(dir))
  const file = path.join(dir, 'report.json')
  fs.writeFileSync(file, JSON.stringify({ title: '✅ **Phase 1 built**', rows: [{ field: 'Follow-ups', value: 'tidy the parser' }, { field: 'Built', value: 'the thing' }] }))
  render(dir, '--report', file, '--phase', '1')
  const html = page(dir)
  assert.match(html, /<section class="report">/)
  assert.match(html, /Phase 1 report/)
  assert.ok(html.indexOf('>Built<') < html.indexOf('>Follow-ups<'))
  const stored = readReport(path.join(dir, '.spec-env', 'reviews', 'feat-x.html'), 'feat-x')
  assert.strictEqual(stored.report.phases['1'].rows.length, 2)
  // A later render without --report still shows it: the served page re-renders
  // from disk, so the rows must survive without being passed again.
  render(dir)
  assert.match(page(dir), /tidy the parser/)
})

test('stays silent: no --report and no sidecar renders the page as before', (t) => {
  const dir = scaffold()
  t.after(() => cleanup(dir))
  render(dir)
  assert.ok(!page(dir).includes('<section class="report">'))
  assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-x.report.json')))
})

test('an unreadable --report is said and the page still renders', (t) => {
  const dir = scaffold()
  t.after(() => cleanup(dir))
  const file = path.join(dir, 'bad.json')
  fs.writeFileSync(file, '{nope')
  const out = render(dir, '--report', file)
  assert.match(out, /not readable JSON — page rendered without it/)
  assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-x.html')))
})
