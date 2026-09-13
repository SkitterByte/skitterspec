'use strict'

/**
 * `--publish-copy` — the body-only copy an artifact host can accept.
 *
 * The whole correctness argument is WHERE the split happens. The template has
 * exactly one `<head>`/`<body>` pair and nothing but placeholders where content
 * goes, so splitting it is unambiguous. A rendered page is the opposite: this
 * feature reviews its own source, so `<!doctype html>`, `<html>` and `<body>`
 * turn up inside it as ordinary patch text. The tests therefore assert by
 * POSITION — a wrapper tag inside the data island is fine, one outside it is the
 * bug — because a presence check would pass on a fragment cut in the wrong
 * place and fail on a perfectly good one.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  fragmentTemplate,
  renderReviewFragment,
  reviewPublishPath,
  loadTemplate,
} = require('../src/env/review.js')
const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

// Every wrapper-looking tag in `html`, paired with whether it sits inside a
// `<script>` block — i.e. whether it is markup or diff text.
function wrapperTags(html) {
  const spans = [...html.matchAll(/<script\b[\s\S]*?<\/script>/g)].map((m) => [
    m.index,
    m.index + m[0].length,
  ])
  const inside = (i) => spans.some(([a, b]) => i >= a && i < b)
  return [...html.matchAll(/<\/?(?:html|head|body)\b|<!doctype/gi)].map((m) => ({
    tag: m[0],
    inScript: inside(m.index),
  }))
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pubcopy-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    // `reader: local` is STATED, not inherited. These tests are about notes,
    // publish copies and fallback — not about where the operator is sitting —
    // and left to `detect` they resolve to `remote` whenever the suite runs
    // from a bridged or ssh session, which stands a real server up mid-test.
    JSON.stringify(
      { baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local' } },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

const review = (dir, ...extra) =>
  runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])

// --- the fragment shape ----------------------------------------------------

test('the fragment leads with the title a host reads for the tab name', () => {
  assert.match(fragmentTemplate(), /^<title>/)
})

test('the fragment carries the styles, or it publishes unstyled', () => {
  const f = fragmentTemplate()
  const inTemplate = (loadTemplate().match(/<style\b/g) || []).length
  assert.strictEqual((f.match(/<style\b/g) || []).length, inTemplate)
  assert.ok(inTemplate > 0, 'the template has styles to carry in the first place')
})

test('the fragment keeps all three placeholders, so it still renders', () => {
  const f = fragmentTemplate()
  for (const ph of ['__REVIEW_TITLE__', '__REVIEW_BLOCK__', '__REVIEW_DATA__']) {
    assert.ok(f.includes(ph), `${ph} survived the split`)
  }
})

test('the fragment has no wrapper of its own', () => {
  const loose = wrapperTags(fragmentTemplate()).filter((t) => !t.inScript)
  assert.deepStrictEqual(loose, [], 'the host supplies doctype/html/head/body')
})

test('a template with no body to split fails loudly rather than half-cutting', () => {
  assert.throws(() => fragmentTemplate('<p>not a document</p>'), /no <head>\/<body> to split/)
})

// THE case this feature exists to get right.
test('wrapper tags inside the diff are left alone, not mistaken for the wrapper', () => {
  const data = {
    title: 'feat-alpha',
    mode: 'working',
    totals: { files: 1, additions: 1, deletions: 0 },
    files: [
      {
        path: 'page.html',
        status: 'new',
        // A patch that is itself a whole HTML document — which is exactly what
        // this repo's own review page looks like when it reviews the template.
        patch: '+<!doctype html>\n+<html lang="en">\n+<head></head>\n+<body></body>\n+</html>\n',
        additions: 1,
        deletions: 0,
        whole: true,
        noise: false,
      },
    ],
    notes: { totals: { accepted: 0, lapsed: 0, unresolved: 0, resolved: 0 }, unanchored: [] },
    review: null,
  }
  const html = renderReviewFragment(data)
  const tags = wrapperTags(html)
  assert.ok(tags.length >= 4, `the diff's own wrapper tags are present (${tags.length})`)
  assert.deepStrictEqual(
    tags.filter((t) => !t.inScript),
    [],
    'every one of them is inside the data island, where it belongs',
  )
})

// --- the flag --------------------------------------------------------------

test('--publish-copy writes the copy and names its path', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
    const out = await review(dir, '--publish-copy')
    const expected = reviewPublishPath(
      path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html'),
    )
    assert.match(out, /publish: /)
    assert.ok(fs.existsSync(expected), 'the copy is on disk beside the page')
    assert.match(fs.readFileSync(expected, 'utf8'), /^<title>/)
    const data = JSON.parse(await review(dir, '--publish-copy', '--json'))
    assert.strictEqual(data.publishCopy, expected, 'reported as data, never built by the caller')
  } finally {
    cleanup(dir)
  }
})

// --- stays silent ----------------------------------------------------------

test('an ordinary render writes no copy and never mentions publishing', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
    const out = await review(dir)
    const copy = reviewPublishPath(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html'))
    assert.ok(!fs.existsSync(copy), 'no second copy of the diff for a path not taken')
    assert.doesNotMatch(out, /publish/i)
    const data = JSON.parse(await review(dir, '--json'))
    assert.strictEqual(data.publishCopy, null)
  } finally {
    cleanup(dir)
  }
})

test('the page itself is byte-identical whether or not the flag was passed', async () => {
  const { dir, wt } = scaffold()
  try {
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
    const page = path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')
    await review(dir)
    const without = fs.readFileSync(page)
    await review(dir, '--publish-copy')
    const with_ = fs.readFileSync(page)
    // `generatedAt` is the only field that legitimately differs between renders.
    const strip = (b) => b.toString().replace(/"generatedAt":"[^"]*"/, '"generatedAt":"X"')
    assert.strictEqual(strip(with_), strip(without), 'the flag adds a file; it changes none')
  } finally {
    cleanup(dir)
  }
})
