'use strict'

/**
 * The clean-tree fallback: `spec-env review` on a committed phase shows the
 * branch range instead of an empty page.
 *
 * Driven through the CLI rather than `collectReview`, because the fallback IS
 * the decision about which mode to collect in — testing the collector would
 * test the thing the decision calls, not the decision.
 *
 * Half of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3). The fallback reads a clean tree as "this phase was committed", and a
 * clean tree also means "nothing has happened yet" and "the caller asked for
 * something else" — so most of the cost of getting this wrong lands on inputs
 * that are perfectly healthy, and each of those gets a test that asserts the
 * fallback says nothing.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-fallback-')))
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
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
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

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
const reviewJson = async (dir, ...extra) => JSON.parse(await review(dir, '--json', ...extra))

// Do the work of a phase and commit it, which is the state the page has to keep
// answering in — `/spec-next` renders before the commit, and the operator
// commits straight after.
function commitAPhase(wt) {
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\nthree\nfour\n')
  fs.writeFileSync(path.join(wt, 'added.js'), 'new file\n')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'phase 1')
}

// --- it fires ---------------------------------------------------------------

test('a committed phase falls back to the branch instead of an empty page', async () => {
  const { dir, wt } = scaffold()
  try {
    commitAPhase(wt)
    const data = await reviewJson(dir)
    assert.strictEqual(data.mode, 'branch', 'the empty working view is replaced')
    assert.strictEqual(data.fellBack, true)
    assert.strictEqual(data.base, 'main')
    assert.ok(data.totals.files >= 2, `expected the committed files, got ${data.totals.files}`)
    assert.ok(
      data.files.some((f) => f.path === 'added.js'),
      'a file added and committed in the phase is in the fallback view',
    )
  } finally {
    cleanup(dir)
  }
})

test('the header line says the tree was clean, not that this is uncommitted work', async () => {
  const { dir, wt } = scaffold()
  try {
    commitAPhase(wt)
    const out = await review(dir)
    assert.match(out, /working tree clean — since main/)
    assert.doesNotMatch(out, /\(uncommitted\)/, 'never claim uncommitted work when there is none')
    assert.doesNotMatch(out, /nothing to review/)
  } finally {
    cleanup(dir)
  }
})

test('the page itself carries the reason, for a reader who never saw the terminal', async () => {
  const { dir, wt } = scaffold()
  try {
    commitAPhase(wt)
    await review(dir)
    const page = fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html'), 'utf8')
    assert.match(page, /"fellBack":true/, 'the data island records the fallback')
    assert.match(page, /working tree clean/, 'and the page says so in words')
  } finally {
    cleanup(dir)
  }
})

// --- it stays silent --------------------------------------------------------

test('real uncommitted work is never swapped out from under the reader', async () => {
  const { dir, wt } = scaffold()
  try {
    commitAPhase(wt)
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\nthree\nfour\nfive\n')
    const data = await reviewJson(dir)
    assert.strictEqual(data.mode, 'working', 'the question is still "what did this phase just do"')
    assert.strictEqual(data.fellBack, false)
    const out = await review(dir)
    assert.match(out, /\(uncommitted\)/)
  } finally {
    cleanup(dir)
  }
})

test('an explicit --branch is never re-interpreted as a fallback', async () => {
  const { dir, wt } = scaffold()
  try {
    commitAPhase(wt)
    const data = await reviewJson(dir, '--branch')
    assert.strictEqual(data.mode, 'branch')
    assert.strictEqual(data.fellBack, false, 'the caller asked for this; nothing fell back')
    const out = await review(dir, '--branch')
    assert.match(out, /\(since main\)/)
    assert.doesNotMatch(out, /working tree clean/)
  } finally {
    cleanup(dir)
  }
})

test('a branch with no work at all reports exactly what it always reported', async () => {
  const { dir } = scaffold()
  try {
    const out = await review(dir)
    assert.match(out, /0 files, \+0 -0/)
    assert.match(out, /nothing to review — no changes found/)
    assert.doesNotMatch(out, /working tree clean/, 'a fresh branch is not a committed phase')
    const data = await reviewJson(dir)
    assert.strictEqual(data.mode, 'working')
    assert.strictEqual(data.fellBack, false)
  } finally {
    cleanup(dir)
  }
})

test('no merge-base means cannot tell, so the fallback does nothing', async () => {
  const { dir, wt } = scaffold()
  try {
    // An orphan branch shares no history with `main`, so there is no range to
    // compute. Diffing against the base tip anyway would report every file in
    // the project as changed — the exact accusation `--branch` already refuses.
    git(wt, 'checkout', '-q', '--orphan', 'lone')
    fs.writeFileSync(path.join(wt, 'solo.js'), 'alone\n')
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'orphan')
    const data = await reviewJson(dir)
    assert.strictEqual(data.fellBack, false)
    assert.strictEqual(data.totals.files, 0, 'silence, rather than the whole project as a diff')
  } finally {
    cleanup(dir)
  }
})

// --- a hotfix measures from its base tag ------------------------------------

// A hotfix forks its worktree from a release tag, so the base branch is the
// wrong ruler. `spec.baseRef` (the `> **Base version:**` header) was already
// resolved and simply unused here.
function hotfixScaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hotfix-')))
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
  const specDir = path.join(dir, 'specs', 'in-progress', 'hotfix-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    '# H\n\n> **Type:** Hotfix\n> **Stack:** worktree\n> **Base version:** v1.0.1\n',
  )
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'A')
  git(dir, 'branch', '-M', 'main')
  const a = git(dir, 'rev-parse', 'HEAD')

  // A release line that diverges at A and never merges back, tagged v1.0.1.
  git(dir, 'checkout', '-q', '-b', 'release', a)
  fs.writeFileSync(path.join(dir, 'release-only.js'), 'shipped\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'R (a prior hotfix, never merged to main)')
  git(dir, 'tag', 'v1.0.1')

  // main advances independently of the release line.
  git(dir, 'checkout', '-q', 'main')
  fs.writeFileSync(path.join(dir, 'main-only.js'), 'later\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'M')

  // The hotfix forks from the TAG, not from main.
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'hotfix/alpha', wt, 'v1.0.1')
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nfixed\n')
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', 'the hotfix')
  return { dir, wt }
}

const hotfixReview = (dir, ...extra) =>
  runQuiet(['spec-env', 'review', 'hotfix-alpha', '--dir', dir, ...extra])

test('a hotfix reports its base tag, not the base branch', async () => {
  const { dir } = hotfixScaffold()
  try {
    const out = await hotfixReview(dir)
    assert.match(out, /since v1\.0\.1/, 'the header names the tag the work forked from')
    assert.doesNotMatch(out, /since main/)
    const data = JSON.parse(await hotfixReview(dir, '--json'))
    assert.strictEqual(data.base, 'v1.0.1')
    assert.strictEqual(data.fellBack, true, 'the tree is clean, so this is the fallback')
  } finally {
    cleanup(dir)
  }
})

test('measuring a hotfix from the base branch would widen the range', async () => {
  const { dir, wt } = hotfixScaffold()
  try {
    const paths = JSON.parse(await hotfixReview(dir, '--json')).files.map((f) => f.path)
    assert.deepStrictEqual(paths, ['app.js'], 'only the hotfix\'s own change')

    // And the counterfactual, computed rather than asserted: the tag is NOT an
    // ancestor of main here, so merge-base(main, HEAD) sits back at the fork
    // point and the range swallows a release commit the hotfix never touched.
    // This is the case where the wrong ruler is not merely mislabelled.
    const forkPoint = git(dir, 'merge-base', 'main', 'hotfix/alpha')
    const fromMain = git(wt, 'diff', '--name-only', forkPoint).split('\n').filter(Boolean)
    assert.ok(
      fromMain.includes('release-only.js'),
      `the base branch would have shown ${JSON.stringify(fromMain)}`,
    )
    assert.ok(!paths.includes('release-only.js'))
  } finally {
    cleanup(dir)
  }
})
