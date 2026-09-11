'use strict'

/**
 * Guards for `/spec-diff` — the skill text, and the two engine behaviours it
 * depends on.
 *
 * The skill assertions are not pedantry about prose. Each one pins a property
 * that a later edit would plausibly "tidy" away: the no-gate rule (the third
 * cancelled spec in this line existed because someone reached for a gate), the
 * token cost (an unpriced offer is not a choice), and never publishing
 * unprompted (publishing leaves something behind the tooling cannot remove).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  renderReviewBlock,
  renderReviewPage,
  reviewUrlPath,
  readReviewUrl,
  CHECK_LEVELS,
} = require('../src/env/review.js')

const ROOT = path.join(__dirname, '..', '..', '..')
const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'skills', 'spec-diff', 'SKILL.md'),
  'utf8',
)

// --- the skill text ---------------------------------------------------------

test('the skill is model-invocable, so /spec-next can offer it', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)
  assert.ok(fm, 'parseable frontmatter')
  assert.match(fm[1], /^name:\s*spec-diff$/m)
  assert.match(fm[1], /^description:\s*\S/m)
  assert.doesNotMatch(fm[1], /disable-model-invocation/, 'not user-only')
})

test('it documents all three resolution rules, in order', () => {
  assert.match(SKILL, /\*\*The name argument\*\*/, 'the argument')
  assert.match(SKILL, /spec-env live status/, 'the spec in flight for this session')
  assert.match(SKILL, /worktree this session is standing in/, 'the worktree cwd is inside')
  // An unknown name must refuse rather than fall back — a review of the wrong
  // spec is indistinguishable from a review of the right one.
  assert.match(SKILL, /unknown name \*\*refuses\*\*/)
})

test('it states the no-gate rule, and says not to add one', () => {
  assert.match(SKILL, /Gate it on nothing/i)
  assert.match(SKILL, /no preconditions and must never grow one/)
  for (const gate of ['tests passing', 'the phase being finished', 'a clean\ntree']) {
    assert.ok(SKILL.includes(gate), `names "${gate}" as a gate it does not have`)
  }
})

test('it names what the written review costs before offering it', () => {
  assert.match(SKILL, /700 output\ntokens|700 output tokens/, 'the price is stated')
  assert.match(SKILL, /The page is free/)
  assert.match(SKILL, /--page-only/, 'and there is a way to decline it')
})

test('it never instructs an unprompted publish', () => {
  assert.match(SKILL, /\*\*Never publish unprompted\.\*\*/)
  assert.match(SKILL, /only when the user asks|When the user asks/i)
  assert.match(SKILL, /cannot remove/, 'says why: publishing is not undoable by the tooling')
  // One spec is one page — a second entry per phase is the failure mode.
  assert.match(SKILL, /update that URL|One spec is one page/i)
  assert.match(SKILL, /Never construct the path yourself/)
})

test('it protects the property the whole design rests on', () => {
  assert.match(SKILL, /never passes through the model/i)
  assert.match(SKILL, /zero\*\* context tokens|\*\*zero\*\*/)
})

test('the check levels the skill documents are the ones the engine renders', () => {
  for (const level of CHECK_LEVELS) {
    assert.ok(SKILL.includes(`"level": "${level}"`), `the skill shows a ${level} check`)
  }
})

test('every distribution ships the skill', () => {
  for (const pkg of ['skitterspec', 'skitterspec-linear']) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets')
    if (!fs.existsSync(dir)) continue
    assert.ok(
      fs.existsSync(path.join(dir, 'skills', 'spec-diff', 'SKILL.md')),
      `${pkg} ships /spec-diff`,
    )
  }
})

// --- the engine half --------------------------------------------------------

test('the review block is rendered by the engine, with every field escaped', () => {
  const html = renderReviewBlock({
    summary: 'It <works> & reads well',
    checks: [{ level: 'flag', file: 'a<b>.js', note: 'careful with "this"' }],
  })
  assert.ok(html.includes('It &lt;works&gt; &amp; reads well'))
  assert.ok(html.includes('a&lt;b&gt;.js'))
  assert.ok(html.includes('&quot;this&quot;'))
  assert.ok(!html.includes('<b>'), 'no model-authored markup reaches the page')
})

test('an unknown check level is shown neutrally, never dropped', () => {
  // Losing a reviewer's note because it was tagged oddly is worse than showing
  // it under a neutral heading.
  const html = renderReviewBlock({ checks: [{ level: 'shout', note: 'keep me' }] })
  assert.ok(html.includes('keep me'))
  assert.ok(html.includes('check confirm'))
})

test('no review at all renders nothing, not an empty box', () => {
  assert.strictEqual(renderReviewBlock(null), '')
  assert.strictEqual(renderReviewBlock(undefined), '')
  const page = renderReviewPage(
    {
      title: 't', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
      totals: { files: 0, additions: 0, deletions: 0 }, files: [], review: null,
    },
    { reviewHtml: renderReviewBlock(null) },
  )
  assert.ok(!page.includes('__REVIEW_BLOCK__'))
  assert.ok(!page.includes('class="review"'))
})

test('the review block lands in the page when there is one', () => {
  const review = { summary: 'A clean phase.', checks: [{ level: 'good', file: 'x.js', note: 'nice' }] }
  const page = renderReviewPage(
    {
      title: 't', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
      totals: { files: 0, additions: 0, deletions: 0 }, files: [], review,
    },
    { reviewHtml: renderReviewBlock(review) },
  )
  assert.ok(page.includes('A clean phase.'))
  assert.ok(page.includes('check good'))
})

test('splicing is one pass — nothing spliced in is ever rescanned', () => {
  // Found by dogfooding: the page reviews its OWN source, so the data island
  // legitimately contains every placeholder string. Sequential replaces spliced
  // the whole JSON blob into the middle of a patch — and into any review note
  // that happened to quote a placeholder name.
  const data = {
    title: '__REVIEW_DATA__', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
    totals: { files: 1, additions: 1, deletions: 0 }, review: null,
    files: [{
      path: 'page.html', status: 'modified', additions: 1, deletions: 0,
      whole: true, noise: false, binary: false,
      patch: '@@ -1 +1 @@\n+<div>__REVIEW_BLOCK__</div>',
    }],
  }
  const page = renderReviewPage(data, { reviewHtml: '<p>quoting __REVIEW_DATA__ verbatim</p>' })

  assert.ok(page.includes('<p>quoting __REVIEW_DATA__ verbatim</p>'), 'the note survives as written')
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(page)
  assert.ok(island, 'the island is intact')
  const back = JSON.parse(island[1])
  assert.strictEqual(back.files[0].patch, data.files[0].patch, 'the patch survives as written')
  assert.strictEqual(back.title, '__REVIEW_DATA__')
  // Exactly one island, not one plus a copy pasted into the review block.
  assert.strictEqual((page.match(/id="review-data"/g) || []).length, 1)
})

test('the url file sits beside the page and is absent until someone publishes', () => {
  const out = path.join(os.tmpdir(), 'skitterspec-url-test', 'feat-x.html')
  assert.strictEqual(reviewUrlPath(out), path.join(path.dirname(out), 'feat-x.url'))
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
  // Cannot tell → null. An unpublished spec and an unreadable file are the same
  // answer here, and both mean "do not claim this has a URL".
  assert.strictEqual(readReviewUrl(out), null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(reviewUrlPath(out), 'https://example.test/abc\n')
  assert.strictEqual(readReviewUrl(out), 'https://example.test/abc')
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

// --- the stays-silent case --------------------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

// A repo with a spec in the backlog and NO worktree — a spec nobody has started.
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-diff-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const backlog = path.join(dir, 'specs', 'backlog', 'feat-x')
  fs.mkdirSync(backlog, { recursive: true })
  fs.writeFileSync(path.join(backlog, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

test('stays silent: a spec with no worktree is reported, not accused', async () => {
  const dir = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'review', 'feat-x', '--dir', dir])
    // Not started is an ORDINARY state. It must not read as breakage, and it
    // must say what to do about it.
    assert.match(out, /has no worktree/)
    assert.match(out, /spec-start/)
    assert.doesNotMatch(out, /error|failed|invalid/i)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'reviews')), 'and writes no page')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown spec name refuses rather than falling back to the branch', async () => {
  const dir = scaffold()
  try {
    await assert.rejects(
      () => runQuiet(['spec-env', 'review', 'feat-nope', '--dir', dir]),
      /spec not found/,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
