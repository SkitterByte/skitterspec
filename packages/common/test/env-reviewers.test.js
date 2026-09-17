'use strict'

/**
 * The external-reviewer seam: the rdjsonl contract, the runner, and the cache.
 *
 * Two halves. The pure functions (parse/level/substitute/outcome/hash) are unit
 * tested, because they are the contract anyone writing an adapter writes
 * against. The runner is tested against REAL SPAWNED PROCESSES — `sh` scripts
 * that print, refuse, crash, hang and lie — because every interesting failure
 * this module has lives at the process boundary, and a stubbed spawn would
 * prove none of them.
 *
 * THE STAYS-SILENT TESTS ARE THE POINT (`.claude/rules/negative-checks.md`
 * rule 3). Half of the assertions below feed the runner a healthy-but-unusual
 * input and assert it produced no findings, threw nothing, and named what
 * happened. The one thing this module must never do is turn a reviewer that
 * could not run into a page that reads as clean.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  CHECKS_VERSION,
  parseRdjsonl,
  lineOf,
  levelFor,
  checkFrom,
  substitute,
  outcomeFor,
  runReviewer,
  runReviewers,
  diffHashOf,
  reviewChecksPath,
  emptyChecks,
  readChecks,
  writeChecks,
  cacheHit,
  asCached,
} = require('../src/env/reviewers.js')
const { mergeConfig, collectBadReviewers, DEFAULT_CONFIG, DEFAULT_REVIEWER_TIMEOUT } = require('../src/env/config.js')

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reviewers-'))
}

// A reviewer that is a shell command, so the runner is exercised end to end.
function sh(name, command, timeout = 10) {
  return { name, use: null, command, format: 'rdjsonl', timeout }
}

const FINDING = (file, line, severity, message) =>
  JSON.stringify({ path: file, range: { start: { line } }, severity, message })

/* ==========================================================================
 * The contract
 * ========================================================================== */

test('parseRdjsonl reads one diagnostic per line', () => {
  const text = [FINDING('src/a.js', 12, 'ERROR', 'null deref'), FINDING('src/b.js', 3, 'WARNING', 'unused')].join('\n')
  const { findings, malformed } = parseRdjsonl(text)
  assert.equal(malformed, 0)
  assert.deepEqual(findings, [
    { file: 'src/a.js', line: 12, severity: 'ERROR', message: 'null deref' },
    { file: 'src/b.js', line: 3, severity: 'WARNING', message: 'unused' },
  ])
})

test('one unparseable line is counted, and the rest survive', () => {
  const text = ['Analyzing 12 files...', FINDING('src/a.js', 1, 'ERROR', 'boom'), 'Done.'].join('\n')
  const { findings, malformed } = parseRdjsonl(text)
  assert.equal(findings.length, 1)
  assert.equal(malformed, 2)
})

test('a diagnostic with no file or no message is malformed, not a finding', () => {
  const text = [JSON.stringify({ path: 'a.js' }), JSON.stringify({ message: 'x' }), '[]'].join('\n')
  const { findings, malformed } = parseRdjsonl(text)
  assert.equal(findings.length, 0)
  assert.equal(malformed, 3)
})

test('blank lines are not malformed', () => {
  const { findings, malformed } = parseRdjsonl(`\n\n${FINDING('a.js', 1, 'ERROR', 'x')}\n\n`)
  assert.equal(findings.length, 1)
  assert.equal(malformed, 0)
})

test('parseRdjsonl survives null and empty input', () => {
  for (const input of [null, undefined, '', '   ']) {
    const { findings, malformed } = parseRdjsonl(input)
    assert.equal(findings.length, 0)
    assert.equal(malformed, 0)
  }
})

test('a flat `line` is read as well as a nested range', () => {
  assert.equal(lineOf({ range: { start: { line: 9 } } }), 9)
  assert.equal(lineOf({ line: 4 }), 4)
  assert.equal(lineOf({}), null)
  assert.equal(lineOf({ line: 0 }), null)
  assert.equal(lineOf({ line: 'x' }), null)
})

test('severity maps to flag or confirm, and never to good', () => {
  assert.equal(levelFor('ERROR'), 'flag')
  assert.equal(levelFor('error'), 'flag')
  assert.equal(levelFor('WARNING'), 'confirm')
  assert.equal(levelFor('INFO'), 'confirm')
  assert.equal(levelFor(undefined), 'confirm')
  // `good` means "I read this and it is right" — a person's word, not a tool's.
  for (const s of ['ERROR', 'WARNING', 'INFO', 'good', 'GOOD', '', null]) {
    assert.notEqual(levelFor(s), 'good')
  }
})

test('a check carries its source, so two reviewers are tellable apart', () => {
  const c = checkFrom({ file: 'a.js', line: 3, severity: 'ERROR', message: 'boom' }, 'coderabbit')
  assert.deepEqual(c, { level: 'flag', file: 'a.js', line: 3, note: 'boom', source: 'coderabbit' })
})

test('substitute fills the known placeholders', () => {
  const out = substitute('rev --scope ${scope} --base ${base} --at ${worktree}', {
    scope: 'branch',
    base: 'main',
    worktree: '/tmp/wt',
  })
  assert.equal(out, 'rev --scope branch --base main --at /tmp/wt')
})

test('an unknown placeholder is left verbatim, never blanked', () => {
  // Blanking would produce a command that runs and reviews the wrong thing.
  assert.equal(substitute('rev --base ${bse}', { base: 'main' }), 'rev --base ${bse}')
})

/* ==========================================================================
 * Outcomes
 * ========================================================================== */

test('exit 0 with findings is `findings`', () => {
  const o = outcomeFor({ name: 'r', checks: [1, 2], exitCode: 0, stderr: '', malformed: 0 })
  assert.equal(o.state, 'findings')
  assert.equal(o.count, 2)
})

test('exit 0 with nothing at all is `clean`', () => {
  const o = outcomeFor({ name: 'r', checks: [], exitCode: 0, stderr: '', malformed: 0 })
  assert.equal(o.state, 'clean')
  assert.equal(o.count, 0)
})

test('exit 0 with only unparseable output is `failed`, not clean', () => {
  // A tool printing a help text because its flags changed exits 0 and reviews
  // nothing. Calling that clean is the false clean this module exists against.
  const o = outcomeFor({ name: 'r', checks: [], exitCode: 0, stderr: '', malformed: 14 })
  assert.equal(o.state, 'failed')
  assert.match(o.detail, /unparseable/)
})

test('a non-zero exit takes its detail from stderr', () => {
  const o = outcomeFor({ name: 'r', checks: [], exitCode: 1, stderr: 'rate limit exceeded\nretry later', malformed: 0 })
  assert.equal(o.state, 'failed')
  assert.equal(o.detail, 'rate limit exceeded')
})

test('a missing binary is `missing`, not `failed`', () => {
  const err = new Error('spawn nope ENOENT')
  err.code = 'ENOENT'
  const o = outcomeFor({ name: 'r', checks: [], spawnError: err })
  assert.equal(o.state, 'missing')
  assert.equal(o.detail, 'command not found')
})

/* ==========================================================================
 * Running one — real processes
 * ========================================================================== */

test('a reviewer that prints rdjsonl produces checks', async () => {
  const dir = tmpdir()
  const cmd = `printf '%s\\n' '${FINDING('src/a.js', 12, 'ERROR', 'null deref')}'`
  const { checks, outcome } = await runReviewer(sh('fake', cmd), { worktree: dir })
  assert.equal(outcome.state, 'findings')
  assert.equal(checks.length, 1)
  assert.deepEqual(checks[0], { level: 'flag', file: 'src/a.js', line: 12, note: 'null deref', source: 'fake' })
})

test('a reviewer runs in the worktree it was given', async () => {
  const dir = fs.realpathSync(tmpdir())
  const cmd = `printf '%s\\n' "$(pwd)" >&2; exit 3`
  const { outcome } = await runReviewer(sh('pwd', cmd), { worktree: dir })
  assert.equal(outcome.state, 'failed')
  assert.equal(outcome.detail, dir)
})

test('the placeholders reach the spawned command', async () => {
  const dir = tmpdir()
  const cmd = `printf '%s\\n' 'scope=${'${scope}'} base=${'${base}'}' >&2; exit 2`
  const { outcome } = await runReviewer(sh('vars', cmd), { worktree: dir, scope: 'branch', base: 'main' })
  assert.equal(outcome.detail, 'scope=branch base=main')
})

/* --- stays-silent: a healthy repo, a reviewer that cannot answer ---------- */

test('stays silent: a binary that is not installed', async () => {
  const dir = tmpdir()
  const { checks, outcome } = await runReviewer(sh('ghost', 'definitely-not-a-real-binary-xyz review'), {
    worktree: dir,
  })
  assert.equal(checks.length, 0)
  // `sh -c` reports a missing command as exit 127 rather than ENOENT on the
  // spawn itself, so this lands in `failed` with the shell's own sentence.
  assert.ok(outcome.state === 'failed' || outcome.state === 'missing', outcome.state)
  assert.ok(outcome.detail, 'a reviewer that could not run must say why')
})

test('stays silent: exit 1 with a rate-limit message', async () => {
  const dir = tmpdir()
  const { checks, outcome } = await runReviewer(sh('limited', `printf 'rate limited\\n' >&2; exit 1`), {
    worktree: dir,
  })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'failed')
  assert.equal(outcome.detail, 'rate limited')
})

test('stays silent: exit 0 with empty stdout is clean and says so', async () => {
  const dir = tmpdir()
  const { checks, outcome } = await runReviewer(sh('quiet', 'true'), { worktree: dir })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'clean')
  assert.equal(outcome.count, 0)
})

test('stays silent: exit 0 with HTML on stdout is failed, not clean', async () => {
  const dir = tmpdir()
  const cmd = `printf '<html><body>502 Bad Gateway</body></html>\\n'`
  const { checks, outcome } = await runReviewer(sh('proxy', cmd), { worktree: dir })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'failed')
  assert.match(outcome.detail, /unparseable/)
})

test('stays silent: a command that never returns is killed and named', async () => {
  const dir = tmpdir()
  const started = Date.now()
  const { checks, outcome } = await runReviewer(sh('hang', 'sleep 60', 0.4), { worktree: dir })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'timeout')
  assert.ok(Date.now() - started < 10000, 'the timeout must actually fire')
})

test('stays silent: a crashing reviewer keeps the findings it managed to print', async () => {
  const dir = tmpdir()
  const cmd = `printf '%s\\n' '${FINDING('a.js', 1, 'ERROR', 'real')}'; printf 'segfault\\n' >&2; exit 139`
  const { checks, outcome } = await runReviewer(sh('crasher', cmd), { worktree: dir })
  assert.equal(checks.length, 1)
  assert.equal(outcome.state, 'failed')
  assert.equal(outcome.detail, 'segfault')
})

test('stays silent: `use` naming an adapter this build does not have', async () => {
  const dir = tmpdir()
  const entry = { name: 'coderabbit', use: 'coderabbit', command: null, format: null, timeout: 10 }
  const { checks, outcome } = await runReviewer(entry, { worktree: dir, adapters: {} })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'missing')
  assert.match(outcome.detail, /no bundled adapter/)
})

test('a bundled adapter owns its own command line and parser', async () => {
  const dir = tmpdir()
  const adapters = {
    fakerabbit: {
      command: (vars) => `printf '%s\\n' 'scope:${vars.scope}'`,
      parse: (stdout) => ({
        findings: stdout.trim() ? [{ file: 'x.js', line: 1, severity: 'ERROR', message: stdout.trim() }] : [],
        malformed: 0,
      }),
    },
  }
  const entry = { name: 'fakerabbit', use: 'fakerabbit', command: null, format: null, timeout: 10 }
  const { checks, outcome } = await runReviewer(entry, { worktree: dir, scope: 'branch', adapters })
  assert.equal(outcome.state, 'findings')
  assert.equal(checks[0].note, 'scope:branch')
  assert.equal(checks[0].source, 'fakerabbit')
})

/* ==========================================================================
 * Running several
 * ========================================================================== */

test('two reviewers both contribute, each carrying its own source', async () => {
  const dir = tmpdir()
  const config = {
    review: {
      reviewers: [
        sh('alpha', `printf '%s\\n' '${FINDING('a.js', 1, 'ERROR', 'from alpha')}'`),
        sh('beta', `printf '%s\\n' '${FINDING('b.js', 2, 'WARNING', 'from beta')}'`),
      ],
    },
  }
  const { checks, outcomes } = await runReviewers(config, { worktree: dir })
  assert.equal(checks.length, 2)
  assert.deepEqual(
    checks.map((c) => c.source),
    ['alpha', 'beta'],
  )
  assert.deepEqual(
    outcomes.map((o) => [o.name, o.state]),
    [
      ['alpha', 'findings'],
      ['beta', 'findings'],
    ],
  )
})

test('one reviewer failing is its own outcome, not the run falling over', async () => {
  const dir = tmpdir()
  const config = {
    review: {
      reviewers: [
        sh('broken', `printf 'nope\\n' >&2; exit 7`),
        sh('working', `printf '%s\\n' '${FINDING('b.js', 2, 'ERROR', 'still here')}'`),
      ],
    },
  }
  const { checks, outcomes } = await runReviewers(config, { worktree: dir })
  assert.equal(checks.length, 1)
  assert.equal(checks[0].note, 'still here')
  assert.equal(outcomes[0].state, 'failed')
  assert.equal(outcomes[1].state, 'findings')
})

test('stays silent: no reviewers configured does nothing at all', async () => {
  const dir = tmpdir()
  for (const config of [{}, { review: {} }, { review: { reviewers: [] } }]) {
    const { checks, outcomes } = await runReviewers(config, { worktree: dir })
    assert.deepEqual(checks, [])
    assert.deepEqual(outcomes, [])
  }
})

test('reviewers run in sequence, not in parallel', async () => {
  // Parallel is how you spend two reviews against an hourly limit and get one.
  const dir = tmpdir()
  const marker = path.join(dir, 'order')
  const config = {
    review: {
      reviewers: [
        sh('first', `printf 'a' >> ${JSON.stringify(marker)}; sleep 0.25; printf 'A' >> ${JSON.stringify(marker)}`),
        sh('second', `printf 'b' >> ${JSON.stringify(marker)}`),
      ],
    },
  }
  await runReviewers(config, { worktree: dir })
  assert.equal(fs.readFileSync(marker, 'utf8'), 'aAb')
})

/* ==========================================================================
 * The cache
 * ========================================================================== */

test('the diff hash is stable, and moves with content or path', () => {
  const files = [{ path: 'a.js', patch: '@@ -1 +1 @@' }]
  assert.equal(diffHashOf(files), diffHashOf([{ path: 'a.js', patch: '@@ -1 +1 @@' }]))
  assert.notEqual(diffHashOf(files), diffHashOf([{ path: 'a.js', patch: '@@ -2 +2 @@' }]))
  // A pure rename must miss: findings name files.
  assert.notEqual(diffHashOf(files), diffHashOf([{ path: 'b.js', patch: '@@ -1 +1 @@' }]))
  assert.equal(diffHashOf([]), diffHashOf([]))
})

test('a cache round-trips beside the page', () => {
  const dir = tmpdir()
  const out = path.join(dir, 'reviews', 'feat-x.html')
  assert.equal(reviewChecksPath(out), path.join(dir, 'reviews', 'feat-x.checks.json'))

  const cache = { ...emptyChecks('feat-x'), diffHash: 'abc123', at: '2026-01-01T00:00:00Z', checks: [{ note: 'x' }] }
  writeChecks(out, cache)
  const read = readChecks(out, 'feat-x')
  assert.equal(read.corrupt, false)
  assert.equal(read.present, true)
  assert.equal(read.cache.diffHash, 'abc123')
  assert.equal(read.cache.checks.length, 1)
})

test('stays silent: an absent cache is a miss, and says nothing', () => {
  const dir = tmpdir()
  const read = readChecks(path.join(dir, 'reviews', 'nothing.html'), 'feat-x')
  assert.equal(read.present, false)
  assert.equal(read.corrupt, false)
  assert.equal(read.cache.diffHash, null)
  assert.equal(cacheHit(read.cache, 'feat-x', 'abc123'), false)
})

test('a corrupt cache is a miss, never an empty result', () => {
  // Reading it as "no findings" would turn one truncated write into a page
  // claiming every reviewer was clean.
  const dir = tmpdir()
  const out = path.join(dir, 'reviews', 'feat-x.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(reviewChecksPath(out), '{ not json')
  const read = readChecks(out, 'feat-x')
  assert.equal(read.corrupt, true)
  assert.equal(cacheHit(read.cache, 'feat-x', 'abc123'), false)
})

test('a cache from a future version is a miss', () => {
  const dir = tmpdir()
  const out = path.join(dir, 'reviews', 'feat-x.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(reviewChecksPath(out), JSON.stringify({ version: CHECKS_VERSION + 1, diffHash: 'abc123' }))
  assert.equal(readChecks(out, 'feat-x').corrupt, true)
})

test('a cache hit needs the same spec and the same diff', () => {
  const cache = { ...emptyChecks('feat-x'), diffHash: 'abc123' }
  assert.equal(cacheHit(cache, 'feat-x', 'abc123'), true)
  assert.equal(cacheHit(cache, 'feat-x', 'zzz999'), false)
  assert.equal(cacheHit(cache, 'feat-other', 'abc123'), false)
  assert.equal(cacheHit(cache, 'feat-x', null), false)
})

test('cached outcomes say `cached`, and a failure stays a failure', () => {
  // A reused failure must not read as a successful cached run — the reader
  // still needs to know that reviewer never answered.
  const out = asCached([
    { name: 'a', state: 'findings', count: 2 },
    { name: 'b', state: 'clean', count: 0 },
    { name: 'c', state: 'failed', count: 0, detail: 'rate limited' },
  ])
  assert.deepEqual(
    out.map((o) => o.state),
    ['cached', 'cached', 'failed'],
  )
})

/* ==========================================================================
 * Config
 * ========================================================================== */

test('no reviewers is the default, everywhere', () => {
  assert.deepEqual(DEFAULT_CONFIG.review.reviewers, [])
  assert.deepEqual(mergeConfig(freshDefaults(), {}).review.reviewers, [])
})

function freshDefaults() {
  // `mergeConfig` mutates its base, so every call gets its own.
  return JSON.parse(JSON.stringify({ ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, reviewers: [] } }))
}

test('both entry shapes are read, and timeouts default', () => {
  const merged = mergeConfig(freshDefaults(), {
    review: { reviewers: [{ use: 'coderabbit' }, { name: 'semgrep', command: 'semgrep --rdjsonl' }] },
  })
  assert.deepEqual(merged.review.reviewers, [
    { name: 'coderabbit', use: 'coderabbit', command: null, format: null, timeout: DEFAULT_REVIEWER_TIMEOUT },
    {
      name: 'semgrep',
      use: null,
      command: 'semgrep --rdjsonl',
      format: 'rdjsonl',
      timeout: DEFAULT_REVIEWER_TIMEOUT,
    },
  ])
})

test('an explicit timeout is kept; a nonsense one falls back', () => {
  const merged = mergeConfig(freshDefaults(), {
    review: {
      reviewers: [
        { use: 'a', timeout: 30 },
        { use: 'b', timeout: 0 },
        { use: 'c', timeout: 'soon' },
      ],
    },
  })
  assert.deepEqual(
    merged.review.reviewers.map((r) => r.timeout),
    [30, DEFAULT_REVIEWER_TIMEOUT, DEFAULT_REVIEWER_TIMEOUT],
  )
})

test('a malformed entry is dropped AND reported, never dropped in silence', () => {
  // `collectUnknownKeys` cannot see this: the default is an array, and it
  // deliberately does not walk into one.
  const parsed = {
    review: {
      reviewers: [
        { use: 'ok' },
        { command: 'rev' },
        { name: 'n' },
        { name: 'n', command: 'rev', format: 'sarif' },
        { use: 'a', command: 'b' },
        'not an object',
      ],
    },
  }
  const merged = mergeConfig(freshDefaults(), parsed)
  assert.equal(merged.review.reviewers.length, 1)
  const bad = collectBadReviewers(parsed)
  assert.deepEqual(
    bad.map((b) => b.index),
    [1, 2, 3, 4, 5],
  )
  assert.match(bad[0].reason, /no name/)
  assert.match(bad[2].reason, /sarif/)
  assert.match(bad[3].reason, /both use and command/)
})

test('stays silent: a config with no reviewers key reports no bad entries', () => {
  assert.deepEqual(collectBadReviewers({}), [])
  assert.deepEqual(collectBadReviewers({ review: {} }), [])
  assert.deepEqual(collectBadReviewers({ review: { reviewers: [] } }), [])
  assert.deepEqual(collectBadReviewers(null), [])
})
