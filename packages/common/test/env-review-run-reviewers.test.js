'use strict'

/**
 * `spec-env review --run-reviewers` — the seam wired into a real render.
 *
 * Driven through the CLI against a real git fixture, because what is under test
 * is the DECISION rather than the parsing: whether reviewers run at all, what
 * scope they are handed, whether the cache spares them, and what the page and
 * the `--json` payload say afterwards. The parsing has its own unit tests in
 * env-reviewers.test.js.
 *
 * The reviewers here are `sh` one-liners. That is not a stub: the contract IS a
 * command line, so a fake that bypassed the shell would prove nothing about the
 * only integration point this feature has.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')


function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

const FINDING = (file, line, severity, message) =>
  JSON.stringify({ path: file, range: { start: { line } }, severity, message })

/**
 * A primary checkout with one in-progress spec and a real linked worktree at
 * the path the config's pattern resolves to, so the CLI finds it the way it
 * finds a spec `/spec-start` provisioned.
 */
function scaffold(reviewers = []) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-runrev-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
        // Stated rather than detected, so a suite run from a bridged session
        // does not stand a real server up mid-test.
        review: { reader: 'local', serve: 'never', reviewers },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# feat-x\n\n> **Stack:** worktree\n')
  fs.writeFileSync(path.join(specDir, '01-first.md'), '# Phase 1 — first ⬜\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'init')

  const wt = path.resolve(dir, `../${path.basename(dir)}-wt/x`)
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  // Something to review.
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nthree\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

/**
 * Run the CLI in its own PROCESS, rather than in-process with
 * `process.stdout.write` swapped out.
 *
 * WHY, because the obvious version is what every other CLI test here does and
 * it does not work for this one: these renders await a SPAWNED CHILD, so the
 * await window is long enough for the test runner's own reporter to write while
 * stdout is patched. The runner's output lands in the capture, the capture is
 * not JSON, and the file aborts. Every existing `runQuiet` is safe only because
 * nothing it calls yields for that long.
 *
 * A subprocess also exercises the real entry point, which for a feature whose
 * entire integration point is spawning things is the more honest test anyway.
 */
const CLI = path.join(__dirname, '..', 'src', 'cli.js')
function runCli(argv) {
  return execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(CLI)}).run(process.argv.slice(1)).catch((e) => { console.error(e); process.exit(1) })`, ...argv],
    // stderr dropped: the config advisories write there, and this reads stdout.
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
}

const render = (dir, ...extra) => runCli(['spec-env', 'review', 'feat-x', '--dir', dir, ...extra])
const renderJson = (dir, ...extra) => JSON.parse(render(dir, '--json', ...extra))
const page = (dir) => fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-x.html'), 'utf8')
const cacheFile = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-x.checks.json')

const sh = (name, command) => ({ name, command, format: 'rdjsonl' })

/* ==========================================================================
 * It fires
 * ========================================================================== */

test('findings land on the page, badged with the reviewer that found them', () => {
  const { dir } = scaffold([sh('fakerabbit', `printf '%s\\n' '${FINDING('app.js', 2, 'ERROR', 'shouty')}'`)])
  try {
    const data = renderJson(dir, '--run-reviewers')
    assert.deepStrictEqual(data.reviewers, [{ name: 'fakerabbit', state: 'findings', detail: null, count: 1 }])
    const html = page(dir)
    assert.ok(html.includes('check-src">fakerabbit'), 'the finding says who found it')
    assert.ok(html.includes('data-goto-line="2"'), 'and which line')
    assert.ok(html.includes('shouty'))
  } finally {
    cleanup(dir)
  }
})

test('the reviewer runs in the spec\'s worktree, not the primary checkout', () => {
  // It must see the same tree the page shows, or its findings describe code the
  // reader is not looking at.
  const { dir, wt } = scaffold([sh('pwd', `printf '%s\\n' "$(cat app.js | head -1)" >&2; exit 9`)])
  try {
    const data = renderJson(dir, '--run-reviewers')
    assert.strictEqual(data.reviewers[0].state, 'failed')
    assert.strictEqual(data.reviewers[0].detail, 'one', 'read the worktree\'s app.js')
    assert.ok(fs.existsSync(wt))
  } finally {
    cleanup(dir)
  }
})

test('the scope matches the render — `working` by default, `branch` with --branch', () => {
  const { dir, wt } = scaffold([sh('echo', `printf 'scope=\${scope}\\n' >&2; exit 4`)])
  try {
    // THE BRANCH NEEDS A COMMIT FOR THE TWO RANGES TO DIFFER. Without one they
    // collect the same files with the same patches — so the cache hits, the
    // second render reuses the first's outcome, and this asserts nothing. That
    // is the cache behaving correctly (same diff, same findings, whichever flag
    // produced it), and it is exactly why this fixture is shaped this way.
    fs.writeFileSync(path.join(wt, 'landed.js'), 'committed on the branch\n')
    git(wt, 'add', '-A')
    git(wt, 'commit', '-qm', 'phase 1')
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nSHOUT\nthree\n')

    const a = renderJson(dir, '--run-reviewers')
    assert.strictEqual(a.totals.files, 1, 'working sees the uncommitted edit')
    assert.strictEqual(a.reviewers[0].detail, 'scope=working')

    const b = renderJson(dir, '--run-reviewers', '--branch')
    assert.strictEqual(b.totals.files, 2, 'branch sees the commit as well')
    assert.strictEqual(b.reviewers[0].detail, 'scope=branch')
  } finally {
    cleanup(dir)
  }
})

test('the cache is keyed on the diff, not on which flag produced it', () => {
  // A branch with no commits collects the same files either way, so the second
  // render must reuse the first rather than spend a review to learn the same
  // thing. Findings are about content; the flag that framed it is not part of
  // the question.
  const { dir } = scaffold([])
  try {
    const counter = path.join(dir, 'runs')
    const cfg = path.join(dir, 'specs', '.core', 'env.config.json')
    const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'))
    parsed.review.reviewers = [sh('counted', `printf 'x' >> ${JSON.stringify(counter)}; true`)]
    fs.writeFileSync(cfg, JSON.stringify(parsed, null, 2))

    renderJson(dir, '--run-reviewers')
    const b = renderJson(dir, '--run-reviewers', '--branch')
    assert.strictEqual(fs.readFileSync(counter, 'utf8'), 'x')
    assert.strictEqual(b.reviewers[0].state, 'cached')
  } finally {
    cleanup(dir)
  }
})

test('a written review and a machine run compose on one page', () => {
  const { dir } = scaffold([sh('bot', `printf '%s\\n' '${FINDING('app.js', 2, 'WARNING', 'from the bot')}'`)])
  try {
    const rf = path.join(dir, 'review.json')
    fs.writeFileSync(rf, JSON.stringify({ summary: 'I read it.', checks: [{ level: 'flag', file: 'app.js', note: 'from me' }] }))
    render(dir, '--run-reviewers', '--review', rf)
    const html = page(dir)
    assert.ok(html.includes('I read it.'))
    assert.ok(html.indexOf('from me') < html.indexOf('from the bot'), 'the person leads')
    assert.ok(html.includes('check-src">bot'))
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * The strip, and the states that are not findings
 * ========================================================================== */

test('a reviewer that found nothing still gets a line', () => {
  // THE POINT. Without this, "read it and approved" and "never ran" are the
  // same page — and the reader is about to decide whether to commit.
  const { dir } = scaffold([sh('quiet', 'true')])
  try {
    const data = renderJson(dir, '--run-reviewers')
    assert.deepStrictEqual(data.reviewers, [{ name: 'quiet', state: 'clean', detail: null, count: 0 }])
    assert.ok(page(dir).includes('reviewer-name">quiet'), 'and it is on the page')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a reviewer that could not run never fails the render', () => {
  const { dir } = scaffold([
    sh('limited', `printf 'rate limited\\n' >&2; exit 1`),
    sh('ghost', 'definitely-not-a-real-binary-xyz'),
  ])
  try {
    const data = renderJson(dir, '--run-reviewers')
    assert.strictEqual(data.totals.files, 1, 'the page is still the page')
    assert.strictEqual(data.reviewers.length, 2)
    assert.strictEqual(data.reviewers[0].detail, 'rate limited')
    assert.ok(['failed', 'missing'].includes(data.reviewers[1].state))
    assert.ok(page(dir).includes('did not run'))
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * Not running them
 * ========================================================================== */

test('stays silent: without --run-reviewers nothing is spawned and no key appears', () => {
  const { dir } = scaffold([sh('noisy', `printf '%s\\n' '${FINDING('app.js', 2, 'ERROR', 'x')}'`)])
  try {
    const data = renderJson(dir)
    assert.ok(!('reviewers' in data), 'a render that did not ask reports nothing')
    assert.ok(!page(dir).includes('class="reviewers"'))
    assert.ok(!fs.existsSync(cacheFile(dir)), 'and wrote no cache')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: --run-reviewers with none configured changes nothing', () => {
  // Every project that exists today is in this state.
  const { dir } = scaffold([])
  try {
    const data = renderJson(dir, '--run-reviewers')
    assert.ok(!('reviewers' in data))
    assert.ok(!page(dir).includes('class="reviewers"'))
    assert.ok(!fs.existsSync(cacheFile(dir)))
  } finally {
    cleanup(dir)
  }
})

test('a --docs render never spends a review on prose', () => {
  const { dir } = scaffold([sh('bot', `printf '%s\\n' '${FINDING('a.md', 1, 'ERROR', 'x')}'`)])
  try {
    // An uncommitted document, which is what `--docs` reads.
    fs.appendFileSync(path.join(dir, 'specs', 'in-progress', 'feat-x', '00-overview.md'), '\nmore\n')
    const data = JSON.parse(runCli(['spec-env', 'review', 'feat-x', '--dir', dir, '--docs', '--json', '--run-reviewers']))
    assert.ok(!('reviewers' in data), 'these tools read code, not specs')
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * The cache
 * ========================================================================== */

test('an unchanged diff reuses the findings instead of spending another review', () => {
  // A free tier is measured in reviews per hour, and a mid-phase re-render is
  // cheap to trigger.
  const { dir, wt } = scaffold([])
  try {
    const counter = path.join(dir, 'runs')
    const cfg = path.join(dir, 'specs', '.core', 'env.config.json')
    const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'))
    parsed.review.reviewers = [
      sh('counted', `printf 'x' >> ${JSON.stringify(counter)}; printf '%s\\n' '${FINDING('app.js', 2, 'ERROR', 'once')}'`),
    ]
    fs.writeFileSync(cfg, JSON.stringify(parsed, null, 2))

    const first = renderJson(dir, '--run-reviewers')
    assert.strictEqual(first.reviewers[0].state, 'findings')
    assert.strictEqual(fs.readFileSync(counter, 'utf8'), 'x')

    const second = renderJson(dir, '--run-reviewers')
    assert.strictEqual(fs.readFileSync(counter, 'utf8'), 'x', 'it did not run again')
    assert.strictEqual(second.reviewers[0].state, 'cached', 'and the page says so')
    assert.ok(page(dir).includes('once'), 'the findings are still there')

    // Any change at all re-runs: findings about code that has moved on are
    // worse than no findings.
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\nTHREE\n')
    const third = renderJson(dir, '--run-reviewers')
    assert.strictEqual(fs.readFileSync(counter, 'utf8'), 'xx')
    assert.strictEqual(third.reviewers[0].state, 'findings')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a corrupt cache re-runs rather than reporting a clean page', () => {
  const { dir } = scaffold([sh('bot', `printf '%s\\n' '${FINDING('app.js', 2, 'ERROR', 'real')}'`)])
  try {
    render(dir, '--run-reviewers')
    fs.writeFileSync(cacheFile(dir), '{ truncated')
    const data = renderJson(dir, '--run-reviewers')
    assert.strictEqual(data.reviewers[0].state, 'findings', 'not "clean", and not "cached"')
    assert.ok(page(dir).includes('real'))
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * The guarantee, through the CLI
 * ========================================================================== */

test('a page full of findings still offers a commit', () => {
  const { dir } = scaffold([
    sh(
      'bot',
      `printf '%s\\n%s\\n%s\\n' '${FINDING('app.js', 1, 'ERROR', 'a')}' '${FINDING('app.js', 2, 'ERROR', 'b')}' '${FINDING('app.js', 3, 'ERROR', 'c')}'`,
    ),
  ])
  try {
    render(dir, '--run-reviewers')
    const data = JSON.parse(
      runCli(['spec-env', 'review', 'feat-x', '--dir', dir, '--json', '--verdict', 'commit']),
    )
    assert.strictEqual(data.verdict.honoured, true, 'three findings gate nothing')
    assert.strictEqual(data.verdict.effective, 'commit')
    assert.strictEqual(data.verdict.openCount, 0)
  } finally {
    cleanup(dir)
  }
})

test('replying to a finding takes the commit away until it is answered', () => {
  const { dir } = scaffold([sh('bot', `printf '%s\\n' '${FINDING('app.js', 2, 'ERROR', 'a')}'`)])
  try {
    render(dir, '--run-reviewers')
    const notes = path.join(dir, 'pass.json')
    fs.writeFileSync(
      notes,
      JSON.stringify({
        version: 1,
        spec: 'feat-x',
        comments: [{ id: 'c1', file: 'app.js', line: 2, note: 'no, keep it', check: 'k0' }],
        verdict: 'commit',
      }),
    )
    const data = JSON.parse(
      runCli(['spec-env', 'review', 'feat-x', '--dir', dir, '--json', '--notes', notes]),
    )
    assert.strictEqual(data.verdict.honoured, false, 'now a person has asked for something')
    assert.strictEqual(data.verdict.effective, 'discuss')
  } finally {
    cleanup(dir)
  }
})
