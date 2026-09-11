'use strict'

/**
 * Integration tests for the review collector: run it against a REAL git fixture
 * with a linked worktree and observe what it collects. The unit-testable parts
 * (numstat parsing, island escaping) are covered inline; everything else needs
 * real git, because the things that have gone wrong here — porcelain's leading
 * space, --numstat's extra lines, untracked files being invisible to `git diff`
 * — are all git's behaviour rather than ours.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  rawGitReader,
  collectReview,
  renderReviewPage,
  reviewOutPath,
  writeReviewPage,
  parseNumstat,
  escapeIsland,
  isNoise,
  PATCH_LIMIT_BYTES,
} = require('../src/env/review.js')

function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8' }).trim()
}

// A main checkout with one commit and a linked worktree branched off it.
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-review-'))
  const main = path.join(root, 'main')
  fs.mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'test@example.com')
  git(main, 'config', 'user.name', 'Test')
  // The installer gitignores `.spec-env/`, and the page lands there — so a real
  // fixture has to as well, or the review would show up as a change to itself.
  fs.writeFileSync(path.join(main, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(main, 'keep.txt'), 'one\ntwo\nthree\n')
  fs.writeFileSync(path.join(main, 'gone.txt'), 'delete me\n')
  fs.mkdirSync(path.join(main, 'specs', 'in-progress', 'feat-x'), { recursive: true })
  fs.writeFileSync(path.join(main, 'specs', 'in-progress', 'feat-x', '00-overview.md'), '# x\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-qm', 'init')
  const wt = path.join(root, 'wt')
  git(main, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  return { root, main, wt }
}

const SPEC = (wt) => ({ folder: 'feat-x', branch: 'feat/x', worktreePath: wt })

function review(wt, opts = {}) {
  return collectReview({
    spec: SPEC(wt),
    git: rawGitReader(wt),
    mode: 'working',
    ref: 'HEAD',
    now: '2020-01-01T00:00:00.000Z',
    ...opts,
  })
}

const byPath = (data, p) => data.files.find((f) => f.path === p)

test('collects modified, untracked and deleted files in one pass', () => {
  const { wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'keep.txt'), 'one\nTWO\nthree\n')
  fs.writeFileSync(path.join(wt, 'brand-new.js'), 'module.exports = 1\n')
  fs.rmSync(path.join(wt, 'gone.txt'))

  const data = review(wt)
  const paths = data.files.map((f) => f.path).sort()
  assert.deepStrictEqual(paths, ['brand-new.js', 'gone.txt', 'keep.txt'])

  assert.strictEqual(byPath(data, 'keep.txt').status, 'modified')
  assert.strictEqual(byPath(data, 'gone.txt').status, 'deleted')
  // An untracked file is the single most review-worthy thing a phase produces
  // and `git diff` cannot see it at all — it arrives via --no-index.
  assert.strictEqual(byPath(data, 'brand-new.js').status, 'new')
  assert.match(byPath(data, 'brand-new.js').patch, /\+module\.exports = 1/)
  // A deletion has no "after" content: whole-file context means the BEFORE file.
  assert.match(byPath(data, 'gone.txt').patch, /-delete me/)
})

test('a path with no staged change is not shifted by porcelain\'s leading space', () => {
  const { wt } = scaffold()
  // An UNSTAGED untracked file: porcelain writes "?? path" — but for tracked
  // unstaged edits the first column is a SPACE, and trimming the whole output
  // eats it and takes a character off every path. Assert the exact name.
  fs.writeFileSync(path.join(wt, 'untouched-name.txt'), 'x\n')
  const data = review(wt)
  assert.ok(byPath(data, 'untouched-name.txt'), 'path survived intact')
})

test('counts come from the file\'s own numstat row, not the whole output', () => {
  const { wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'keep.txt'), 'one\ntwo\nthree\nfour\nfive\n')
  fs.writeFileSync(path.join(wt, 'other.txt'), 'a\nb\nc\nd\ne\nf\ng\n')
  const data = review(wt)
  assert.strictEqual(byPath(data, 'keep.txt').additions, 2)
  assert.strictEqual(byPath(data, 'keep.txt').deletions, 0)
  assert.strictEqual(byPath(data, 'other.txt').additions, 7)
})

test('the patch is the whole file by default', () => {
  const { wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'keep.txt'), 'one\nTWO\nthree\n')
  const f = byPath(review(wt), 'keep.txt')
  assert.strictEqual(f.whole, true)
  // Unchanged neighbours are present — that is what makes the change reviewable.
  assert.match(f.patch, /^ one$/m)
  assert.match(f.patch, /^ three$/m)
})

test('a file past the patch limit falls back to -U3 and says so', () => {
  const { wt } = scaffold()
  const big = Array.from({ length: 24000 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n') + '\n'
  assert.ok(Buffer.byteLength(big, 'utf8') > PATCH_LIMIT_BYTES, 'fixture is past the limit')
  fs.writeFileSync(path.join(wt, 'big.txt'), big)
  execFileSync('git', ['-C', wt, 'add', '-A'])
  execFileSync('git', ['-C', wt, '-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-qm', 'big'])
  fs.writeFileSync(path.join(wt, 'big.txt'), big.replace('line 5 ', 'LINE 5 '))

  const f = byPath(review(wt), 'big.txt')
  assert.strictEqual(f.whole, false, 'reported as truncated context')
  assert.ok(
    Buffer.byteLength(f.patch, 'utf8') < PATCH_LIMIT_BYTES,
    'the -U3 patch is small, not the whole 500KB file',
  )
  assert.match(f.patch, /LINE 5/)
})

test('--branch includes committed work that the default form omits', () => {
  const { wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'committed.txt'), 'landed\n')
  execFileSync('git', ['-C', wt, 'add', '-A'])
  execFileSync('git', ['-C', wt, '-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-qm', 'phase 1'])
  fs.writeFileSync(path.join(wt, 'dirty.txt'), 'in flight\n')

  const working = review(wt)
  assert.deepStrictEqual(working.files.map((f) => f.path), ['dirty.txt'])

  const mergeBase = git(wt, 'merge-base', 'main', 'HEAD')
  const branch = review(wt, { mode: 'branch', ref: mergeBase, base: 'main' })
  const paths = branch.files.map((f) => f.path).sort()
  assert.deepStrictEqual(paths, ['committed.txt', 'dirty.txt'])
})

test('spec bookkeeping is marked as noise for the viewer to collapse', () => {
  const { wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'specs', 'in-progress', 'feat-x', '00-overview.md'), '# x\n\nchanged\n')
  fs.writeFileSync(path.join(wt, 'src.js'), 'code\n')
  const data = review(wt)
  assert.strictEqual(byPath(data, 'specs/in-progress/feat-x/00-overview.md').noise, true)
  assert.strictEqual(byPath(data, 'src.js').noise, false)
})

test('the page is self-contained and its JSON island round-trips', () => {
  const { wt } = scaffold()
  // A patch that contains a closing script tag — not hypothetical: this feature
  // reviews its own source, and the page template contains one.
  fs.writeFileSync(path.join(wt, 'page.html'), '<script>var a = 1</script>\n')
  const data = review(wt)
  const html = renderReviewPage(data)

  assert.match(html, /^<!doctype html>/i)
  assert.ok(html.includes('</html>'), 'document closes')
  assert.ok(!html.includes('__REVIEW_DATA__'), 'data placeholder spliced')
  assert.ok(!html.includes('__REVIEW_BLOCK__'), 'review placeholder spliced')
  assert.deepStrictEqual(
    html.match(/(?:src|href)="https?:[^"]*"/g) || [],
    [],
    'no external stylesheet, script or image',
  )

  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(island, 'the island was not closed early by the patch')
  const back = JSON.parse(island[1])
  assert.strictEqual(back.files.length, data.files.length)
  assert.strictEqual(back.files[0].patch, data.files[0].patch, 'patch text survives the round-trip')
  assert.ok(back.files[0].patch.includes('</script>'), 'and it really did contain one')
})

test('reading a worktree leaves the caller\'s cwd and the primary checkout untouched', () => {
  const { main, wt } = scaffold()
  fs.writeFileSync(path.join(wt, 'keep.txt'), 'one\nTWO\nthree\n')
  fs.writeFileSync(path.join(wt, 'new.txt'), 'x\n')

  const cwdBefore = process.cwd()
  const mainHeadBefore = git(main, 'rev-parse', 'HEAD')
  const mainStatusBefore = git(main, 'status', '--porcelain')

  const data = review(wt)
  writeReviewPage(reviewOutPath(main, 'feat-x'), renderReviewPage(data))

  // The isolation claim, pinned: nothing about the caller moved, and the primary
  // checkout gained only the gitignored page.
  assert.strictEqual(process.cwd(), cwdBefore)
  assert.strictEqual(git(main, 'rev-parse', 'HEAD'), mainHeadBefore)
  assert.strictEqual(
    git(main, 'status', '--porcelain'),
    mainStatusBefore,
    'the page is gitignored — reviewing leaves no change in the branch under review',
  )
  assert.strictEqual(git(main, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')
  assert.ok(fs.existsSync(path.join(main, '.spec-env', 'reviews', 'feat-x.html')))
})

test('a spec with no changes produces an empty, still-valid page', () => {
  const { wt } = scaffold()
  const data = review(wt)
  assert.deepStrictEqual(data.files, [])
  assert.deepStrictEqual(data.totals, { files: 0, additions: 0, deletions: 0 })
  const html = renderReviewPage(data)
  assert.ok(html.includes('</html>'))
  assert.ok(!html.includes('__REVIEW_DATA__'))
})

test('numstat reports a binary file rather than guessing counts', () => {
  assert.deepStrictEqual(parseNumstat('-\t-\timg.png\n'), {
    additions: 0,
    deletions: 0,
    binary: true,
  })
  assert.deepStrictEqual(parseNumstat('3\t1\ta.js\n9\t9\tb.js\n'), {
    additions: 3,
    deletions: 1,
    binary: false,
  })
  assert.deepStrictEqual(parseNumstat(''), { additions: 0, deletions: 0, binary: false })
  assert.deepStrictEqual(parseNumstat(null), { additions: 0, deletions: 0, binary: false })
})

test('island escaping only touches the sequence that could close the tag', () => {
  assert.strictEqual(escapeIsland('{"a":"x</script>y"}'), '{"a":"x<\\/script>y"}')
  assert.strictEqual(escapeIsland('{"a":"1 < 2"}'), '{"a":"1 < 2"}')
  // `\/` is a legal JSON escape for `/`, so the result still parses.
  assert.strictEqual(JSON.parse(escapeIsland(JSON.stringify({ a: '</div>' }))).a, '</div>')
})

test('noise is the engine\'s call, and only covers bookkeeping paths', () => {
  assert.strictEqual(isNoise('specs/in-progress/feat-x/01-a.md'), true)
  assert.strictEqual(isNoise('specs/.core/linear-base/SKS-1.base.json'), true)
  assert.strictEqual(isNoise('.spec-env/reviews/feat-x.html'), true)
  // A STAYS-SILENT case: product code under a folder that merely looks similar
  // must not be collapsed out of the review.
  assert.strictEqual(isNoise('src/specs/parser.js'), false)
  assert.strictEqual(isNoise('packages/common/src/env/review.js'), false)
})
