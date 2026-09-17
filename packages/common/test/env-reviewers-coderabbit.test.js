'use strict'

/**
 * The CodeRabbit adapter, against RECORDED STREAMS.
 *
 * Fixtures rather than a live `cr`, deliberately: the suite must not need an
 * account, a network, or a slot from an hourly rate limit. What is under test
 * is the reading — which events matter, which fields a finding is built from,
 * and above all which no-findings outcomes are CLEAN and which are a review
 * that never happened.
 *
 * That last one is the whole reason a bundled adapter exists rather than a
 * shell script. The generic runner sees an exit code and some bytes; it cannot
 * tell a review that found nothing from a CLI that declined because nobody is
 * logged in — and the difference decides whether someone about to commit reads
 * `clean` or `did not run — not authenticated`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const cr = require('../src/env/reviewers/coderabbit.js')
const { BUNDLED_ADAPTERS, runReviewer, reconcile, outcomeFor } = require('../src/env/reviewers.js')

const stream = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', 'coderabbit', `${name}.jsonl`), 'utf8')
const ok = { exitCode: 0, stderr: '' }

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cr-'))
}

/* ==========================================================================
 * The command line
 * ========================================================================== */

test('the command matches the render\'s scope', () => {
  // A phase-end render is `working` — the page is written BEFORE the commit, so
  // what it shows is uncommitted and untracked.
  assert.equal(cr.command({ scope: 'working' }), 'cr review --agent --uncommitted --include-untracked')
  assert.equal(cr.command({ scope: 'branch', base: 'main' }), "cr review --agent --base 'main'")
})

test('a branch scope with no base falls back rather than emitting a bare --base', () => {
  // `cr review --agent --base` with nothing after it would consume the next
  // token, or error. Reviewing the working tree is the wrong answer but a safe
  // one; a malformed command line is neither.
  assert.equal(cr.command({ scope: 'branch', base: '' }), 'cr review --agent --uncommitted --include-untracked')
  assert.equal(cr.command({ scope: 'branch' }), 'cr review --agent --uncommitted --include-untracked')
})

test('a branch name cannot break out of the command line', () => {
  const out = cr.command({ scope: 'branch', base: "main'; rm -rf /; echo '" })
  assert.ok(!/rm -rf \/;\s*$/.test(out))
  assert.ok(out.includes(`'\\''`), 'the quote is escaped, not closed')
})

/* ==========================================================================
 * Reading findings
 * ========================================================================== */

test('a review with findings reads every one, in order', () => {
  const { findings, malformed, said } = cr.parse(stream('findings'), ok)
  assert.equal(malformed, 0)
  assert.equal(said, null, 'nothing for the adapter to sharpen')
  assert.equal(findings.length, 3)

  // `codegenInstructions` leads, per the CLI's own guidance.
  assert.deepEqual(findings[0], {
    file: 'src/orders.js',
    line: 42,
    severity: 'error',
    message: 'Guard against a null `customer` before reading `.id`.',
  })
  // …and `comment` is the fallback when it is absent.
  assert.equal(findings[1].message, 'This variable shadows the outer `total`.')
  assert.equal(findings[1].severity, 'warning', 'minor is not a flag')
  // A finding with no line is KEPT. It loses its jump button, not its place.
  assert.equal(findings[2].line, null)
  assert.equal(findings[2].severity, 'error', 'major is')
})

test('severity maps critical and major to a flag, everything else to confirm', () => {
  assert.equal(cr.severityOf('critical'), 'error')
  assert.equal(cr.severityOf('major'), 'error')
  for (const s of ['minor', 'trivial', 'info', 'none', 'CATASTROPHIC', '', null, undefined]) {
    assert.equal(cr.severityOf(s), 'warning', `${s} must not shout`)
  }
})

test('a finding with no file or no message is malformed, not a finding', () => {
  const text = [
    JSON.stringify({ type: 'finding', severity: 'critical', comment: 'nowhere' }),
    JSON.stringify({ type: 'finding', severity: 'critical', fileName: 'a.js' }),
  ].join('\n')
  const { findings, malformed } = cr.parse(text, ok)
  assert.equal(findings.length, 0)
  assert.equal(malformed, 2)
})

test('unknown events and unknown fields are ignored, never fatal', () => {
  // The stream is additive by design. Refusing a whole review because one line
  // carried a field we had not seen would break the adapter on every release.
  const { findings, malformed, said } = cr.parse(stream('future-events'), ok)
  assert.equal(malformed, 0)
  assert.equal(said, null)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].message, 'Still readable.')
})

/* ==========================================================================
 * The no-findings readings — the reason this file exists
 * ========================================================================== */

test('a review that ran and found nothing is clean', () => {
  const { findings, said } = cr.parse(stream('clean'), ok)
  assert.equal(findings.length, 0)
  assert.equal(said, null, 'the generic rules reach `clean` on their own')
  assert.equal(outcomeFor({ name: 'cr', checks: [], exitCode: 0, stderr: '', malformed: 0 }).state, 'clean')
})

test('a review skipped for having nothing to look at is clean, and says why', () => {
  const { findings, said } = cr.parse(stream('skipped'), ok)
  assert.equal(findings.length, 0)
  assert.deepEqual(said, { state: 'clean', detail: 'nothing to review' })
})

test('an auth failure is `did not run`, NEVER clean', () => {
  // THE LOAD-BEARING ASSERTION. `cr` exits and prints an error event; without
  // this the page would read as a reviewer that looked and approved.
  const { findings, said } = cr.parse(stream('auth-failure'), { exitCode: 1, stderr: '' })
  assert.equal(findings.length, 0)
  assert.equal(said.state, 'failed')
  assert.equal(said.detail, 'not authenticated')
})

test('a rate limit is named as a rate limit', () => {
  const { said } = cr.parse(stream('rate-limited'), { exitCode: 1, stderr: '' })
  assert.equal(said.state, 'failed')
  assert.equal(said.detail, 'rate limited')
})

test('an error nobody anticipated still reports, with its own words', () => {
  const text = JSON.stringify({ type: 'error', message: 'The frobnicator is misaligned.\nsecond line' })
  const { said } = cr.parse(text, { exitCode: 1, stderr: '' })
  assert.equal(said.state, 'failed')
  assert.equal(said.detail, 'The frobnicator is misaligned.', 'a reason nobody anticipated beats silence')
})

test('a non-zero exit with a recognisable stderr is named rather than echoed', () => {
  const { said } = cr.parse('', { exitCode: 1, stderr: 'error: 429 Too Many Requests\nretry after 1200s' })
  assert.equal(said.detail, 'rate limited')
})

test('a non-zero exit with nothing recognisable defers to the generic reading', () => {
  const { said } = cr.parse('', { exitCode: 2, stderr: 'something went wrong' })
  assert.equal(said, null, 'the generic path echoes stderr, which is the best available')
})

test('exit 0 with no events at all is NOT read as clean', () => {
  // Cannot-tell routed to the branch that does not claim the code was read —
  // the inversion this whole feature turns on.
  const { said } = cr.parse('', ok)
  assert.equal(said.state, 'failed')
  assert.match(said.detail, /no review events/)
})

test('a truncated stream keeps what it read and does not call it a clean review', () => {
  const { findings, malformed, said } = cr.parse(stream('truncated'), { exitCode: 1, stderr: '' })
  assert.equal(findings.length, 1, 'the finding that arrived is kept')
  assert.equal(malformed, 1, 'and the half-line is counted')
  assert.equal(said, null, 'exit 1 — the generic path already calls it failed')
})

test('every classified reason is a reason, and an unrelated sentence is not', () => {
  assert.equal(cr.classify('Please run `cr auth login`'), 'not authenticated')
  assert.equal(cr.classify('HTTP 429'), 'rate limited')
  assert.equal(cr.classify('getaddrinfo ENOTFOUND api.coderabbit.ai'), 'no network')
  assert.equal(cr.classify('Windows is not supported on this build'), 'unsupported platform')
  // Stays silent: an ordinary review comment must not be read as a refusal.
  assert.equal(cr.classify('This function has too many parameters'), null)
  assert.equal(cr.classify(''), null)
  assert.equal(cr.classify(undefined), null)
})

/* ==========================================================================
 * Reconciling — an adapter may sharpen, never launder
 * ========================================================================== */

test('an adapter cannot turn a failure into a clean run', () => {
  // This is the layer where a vendor-specific guess could produce the false
  // clean the whole feature exists against, so the asymmetry is asserted.
  const failed = { name: 'cr', state: 'failed', detail: 'exit 1', count: 0 }
  const out = reconcile(failed, { state: 'clean', detail: 'looked fine to me' }, { name: 'cr', count: 0 })
  assert.equal(out.state, 'failed', 'the generic failure stands')
})

test('an adapter may sharpen a failure, and may report one the generic path missed', () => {
  const generic = { name: 'cr', state: 'failed', detail: 'exit 1', count: 0 }
  assert.equal(reconcile(generic, { state: 'failed', detail: 'rate limited' }, { name: 'cr', count: 0 }).detail, 'rate limited')

  const looksClean = { name: 'cr', state: 'clean', detail: null, count: 0 }
  const out = reconcile(looksClean, { state: 'failed', detail: 'not authenticated' }, { name: 'cr', count: 0 })
  assert.equal(out.state, 'failed')
})

test('a timeout and a failed spawn are never overridden', () => {
  // No amount of parsing tells you anything about a process that was killed or
  // never started.
  const t = { name: 'cr', state: 'timeout', detail: null, count: 0 }
  assert.equal(reconcile(t, { state: 'clean' }, { timedOut: true, name: 'cr', count: 0 }).state, 'timeout')
  const m = { name: 'cr', state: 'missing', detail: 'command not found', count: 0 }
  assert.equal(reconcile(m, { state: 'clean' }, { spawnError: new Error('x'), name: 'cr', count: 0 }).state, 'missing')
})

test('no `said` leaves the generic outcome exactly as it was', () => {
  const generic = { name: 'cr', state: 'findings', detail: null, count: 3 }
  assert.strictEqual(reconcile(generic, null, { name: 'cr', count: 3 }), generic)
  assert.strictEqual(reconcile(generic, undefined, { name: 'cr', count: 3 }), generic)
})

/* ==========================================================================
 * Through the runner
 * ========================================================================== */

test('`use: "coderabbit"` resolves to the bundled adapter', () => {
  assert.ok(BUNDLED_ADAPTERS.coderabbit, 'the registry carries it')
  assert.equal(typeof BUNDLED_ADAPTERS.coderabbit.command, 'function')
  assert.equal(typeof BUNDLED_ADAPTERS.coderabbit.parse, 'function')
})

test('the runner drives the adapter end to end, replaying a recorded stream', async () => {
  const dir = tmpdir()
  const file = path.join(__dirname, 'fixtures', 'coderabbit', 'findings.jsonl')
  const adapters = { coderabbit: { command: () => `cat ${JSON.stringify(file)}`, parse: cr.parse } }
  const entry = { name: 'coderabbit', use: 'coderabbit', command: null, format: null, timeout: 10 }
  const { checks, outcome } = await runReviewer(entry, { worktree: dir, scope: 'working', adapters })
  assert.equal(outcome.state, 'findings')
  assert.equal(outcome.count, 3)
  assert.deepEqual(checks[0], {
    level: 'flag',
    file: 'src/orders.js',
    line: 42,
    note: 'Guard against a null `customer` before reading `.id`.',
    source: 'coderabbit',
  })
  assert.equal(checks[1].level, 'confirm')
})

test('the runner reports an auth failure as `did not run`, through the adapter', async () => {
  const dir = tmpdir()
  const file = path.join(__dirname, 'fixtures', 'coderabbit', 'auth-failure.jsonl')
  const adapters = { coderabbit: { command: () => `cat ${JSON.stringify(file)}; exit 1`, parse: cr.parse } }
  const entry = { name: 'coderabbit', use: 'coderabbit', command: null, format: null, timeout: 10 }
  const { checks, outcome } = await runReviewer(entry, { worktree: dir, adapters })
  assert.equal(checks.length, 0)
  assert.equal(outcome.state, 'failed')
  assert.equal(outcome.detail, 'not authenticated')
})

test('stays silent: `cr` not installed is that reviewer\'s outcome, not a crash', async () => {
  const dir = tmpdir()
  const entry = { name: 'coderabbit', use: 'coderabbit', command: null, format: null, timeout: 10 }
  const { checks, outcome } = await runReviewer(entry, { worktree: dir, adapters: BUNDLED_ADAPTERS })
  assert.equal(checks.length, 0)
  // `sh -c` reports a missing command as exit 127; either reading is a "did not
  // run", which is the only thing the page needs to be right about.
  assert.ok(['failed', 'missing'].includes(outcome.state), outcome.state)
  assert.notEqual(outcome.state, 'clean', 'and never, ever clean')
})

test('a `use` naming an adapter this build does not have is said at config-read time', () => {
  // Reported where the run is asked for, not left for the run to discover: the
  // config module knows shapes and the runner knows the registry, so the one
  // place that can see both is where this belongs.
  // `spawnSync`, not `execFileSync`: this advisory is on STDERR, and
  // `execFileSync` returns stdout only.
  const { spawnSync } = require('node:child_process')
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cruse-')))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ review: { reviewers: [{ use: 'coderabbit' }, { use: 'coderabbat' }] } }),
  )
  const CLI = path.join(__dirname, '..', 'src', 'cli.js')
  const res = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(CLI)}).run(process.argv.slice(1)).catch(() => {})`, 'spec-env', 'status', '--dir', dir],
    { encoding: 'utf8' },
  ).stderr
  assert.match(res, /coderabbat.*not a bundled adapter/)
  assert.ok(!res.includes('"coderabbit" is not'), 'and the real one is not accused')
  fs.rmSync(dir, { recursive: true, force: true })
})
