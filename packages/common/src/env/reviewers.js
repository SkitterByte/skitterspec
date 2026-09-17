'use strict'

/**
 * Run the project's configured code reviewers against a spec's diff, and turn
 * what they print into CHECKS for the review page.
 *
 * The whole module is a seam. Skitterspec vendors no reviewer for the same
 * reason it vendors no tracker and no commit skill: the project picks. What
 * lives here is the contract — how a command is spawned, what it is allowed to
 * print, and what is said about it when it does not answer.
 *
 * TWO THINGS IT NEVER DOES, and both are load-bearing:
 *
 * - **It never produces a COMMENT.** A comment is something a person asked for,
 *   and `judgeVerdict` refuses a committing verdict while one is open. Twelve
 *   machine findings are not twelve requests, so they arrive as checks, which
 *   gate nothing. A reader replying to one creates the comment, and that does
 *   gate — because now someone asked.
 * - **It never fails the render.** A reviewer that could not run is an outcome
 *   with a reason on it, never a throw and never a non-zero exit. The page is
 *   the record of the diff; a reviewer is an opinion about it.
 *
 * AND ONE PLACE IT INVERTS THE USUAL RULE. `.claude/rules/negative-checks.md`
 * routes cannot-tell to silence, and here silence is the unsafe branch: a
 * reviewer that was rate-limited renders identically to one that read the diff
 * and found nothing, on the page a commit decision is made from. So every
 * configured reviewer gets an outcome whatever happened to it — a positive
 * signal about the RUN, which is not an accusation about the code.
 */

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

const CHECKS_VERSION = 1

// Beside the page, the notes, the pending store and the gate, under gitignored
// `.spec-env/`. Named once so every reader spells it the same way.
const CHECKS_SUFFIX = '.checks.json'

// What a reviewer's run ended as. Five states rather than two, because "it
// printed nothing" has at least three readings and only one of them is clean.
const OUTCOME_STATES = ['findings', 'clean', 'cached', 'failed', 'timeout', 'missing']

// Past this, a reviewer is printing something other than findings — a help
// text, an HTML error page, a stack trace — and parsing megabytes of it buys
// nothing. Deliberately a constant and not a config key: nobody tunes this.
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/* ==========================================================================
 * The contract — rdjsonl in, checks out
 * ========================================================================== */

/**
 * Parse rdjsonl: one JSON object per line, reviewdog's diagnostic shape.
 *
 *   {"path":"src/a.js","range":{"start":{"line":12}},"severity":"ERROR","message":"…"}
 *
 * A LINE THAT DOES NOT PARSE IS COUNTED, NEVER FATAL. Reviewers prepend
 * progress lines, trailing banners and the occasional warning to stdout, and
 * throwing the other forty findings away over one of them would be a reviewer
 * that works until the day its vendor adds a footer. The count travels out so
 * the caller can say the output was not entirely findings.
 *
 * Pure.
 */
function parseRdjsonl(text) {
  const findings = []
  let malformed = 0
  for (const raw of String(text == null ? '' : text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      malformed++
      continue
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      malformed++
      continue
    }
    const file = typeof obj.path === 'string' ? obj.path.trim() : ''
    const message = typeof obj.message === 'string' ? obj.message.trim() : ''
    // A diagnostic with no file or no message is not one. It is counted as
    // malformed rather than dropped in silence, for the same reason as above.
    if (!file || !message) {
      malformed++
      continue
    }
    findings.push({ file, line: lineOf(obj), severity: obj.severity, message })
  }
  return { findings, malformed }
}

/**
 * The line number a diagnostic points at, or null. Pure.
 *
 * rdjson nests it (`range.start.line`) and several emitters flatten it
 * (`line`). Both are read, because refusing the flat spelling would drop a
 * finding over a shape difference the author never chose.
 */
function lineOf(obj) {
  const nested = obj.range && obj.range.start ? obj.range.start.line : undefined
  for (const v of [nested, obj.line]) {
    if (Number.isInteger(v) && v > 0) return v
  }
  return null
}

/**
 * Map a reviewer's severity onto the page's three check levels. Pure.
 *
 * `good` is deliberately unreachable. It means "I read this and it is right",
 * which is a thing a person says about code they have understood — a machine
 * that emits no finding for a line has not blessed it, it has simply not
 * spoken. Everything a reviewer does say is either a flag or something to
 * confirm.
 */
function levelFor(severity) {
  const s = typeof severity === 'string' ? severity.trim().toLowerCase() : ''
  return s === 'error' ? 'flag' : 'confirm'
}

/**
 * Turn one parsed finding into a check. Pure.
 *
 * `source` is what lets a reader tell CodeRabbit's opinion from Claude's on a
 * page carrying both — the whole reason checks grew the field.
 */
function checkFrom(finding, source) {
  return {
    level: levelFor(finding.severity),
    file: finding.file,
    line: finding.line === undefined ? null : finding.line,
    note: finding.message,
    source,
  }
}

/**
 * Substitute `${…}` placeholders in a configured command. Pure.
 *
 * AN UNKNOWN PLACEHOLDER IS LEFT VERBATIM, not blanked. `${bse}` surviving into
 * the command line makes the failure legible in the error the shell reports;
 * blanking it produces a command that runs, reviews the wrong thing, and looks
 * entirely successful.
 */
function substitute(command, vars) {
  return String(command).replace(/\$\{(\w+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null ? String(vars[key]) : whole,
  )
}

/* ==========================================================================
 * Outcomes — what to say about a run that produced no findings
 * ========================================================================== */

/**
 * Build the outcome for a finished run. Pure.
 *
 * THE BLIND SPOT, named here because this is where someone would be tempted to
 * collapse the states: an exit code of 0 with empty stdout is, from this layer,
 * indistinguishable between "reviewed the diff and found nothing" and "declined
 * silently". Only an adapter knows its own tool well enough to tell those
 * apart, so the generic path calls it `clean` and the page says WHICH reviewer
 * said so — a reader who knows `cr` is unauthenticated can then read the line
 * correctly, where a page with no line at all gives them nothing to read.
 */
function outcomeFor({ name, checks, exitCode, signal, stderr, malformed, timedOut, spawnError }) {
  const detail = (s) => firstLine(s)
  if (spawnError) {
    const missing = spawnError.code === 'ENOENT'
    return {
      name,
      state: missing ? 'missing' : 'failed',
      detail: missing ? 'command not found' : detail(spawnError.message),
      count: 0,
    }
  }
  if (timedOut) return { name, state: 'timeout', detail: null, count: 0 }
  if (exitCode !== 0 || signal) {
    return {
      name,
      state: 'failed',
      // stderr first: a tool that refuses says why there, and that sentence is
      // the entire value of this line to a reader.
      detail: detail(stderr) || (signal ? `killed by ${signal}` : `exit ${exitCode}`),
      count: checks.length,
    }
  }
  // Exit 0 with unparseable output is NOT clean. A tool printing a help text
  // because its flags changed exits 0 and reviews nothing, and calling that
  // clean is the false clean this module exists against.
  if (!checks.length && malformed > 0) {
    return { name, state: 'failed', detail: `printed ${malformed} unparseable line(s)`, count: 0 }
  }
  if (!checks.length) return { name, state: 'clean', detail: null, count: 0 }
  return {
    name,
    state: 'findings',
    detail: malformed > 0 ? `${malformed} unparseable line(s) skipped` : null,
    count: checks.length,
  }
}

function firstLine(s) {
  if (typeof s !== 'string') return null
  const line = s.split('\n').map((l) => l.trim()).find(Boolean)
  return line ? (line.length > 200 ? line.slice(0, 197) + '…' : line) : null
}

/* ==========================================================================
 * Running one
 * ========================================================================== */

/**
 * Spawn one reviewer and read what it printed.
 *
 * NEVER THROWS, NEVER REJECTS. Every failure this can have — a binary that is
 * not there, a crash, a signal, a tool that hangs — resolves to an outcome
 * naming it. The caller is a render, and a render that cannot happen because a
 * third-party CLI was missing is worse than no reviewer at all.
 *
 * `cwd` is the spec's worktree, which is what makes a reviewer's own git
 * reading agree with the diff on the page.
 */
function runReviewer(entry, ctx) {
  const { worktree, base, scope = 'working', spec, adapters = {}, spawnFn = spawn } = ctx
  const vars = { scope, base: base || '', spec: spec || '', worktree: worktree || '' }

  let command = entry.command
  let parse = null
  if (entry.use) {
    const adapter = adapters[entry.use]
    // An unknown adapter is this run's outcome rather than a thrown error: the
    // config named something this build does not have, which is a fact about
    // one reviewer and not a reason to abandon the render.
    if (!adapter) {
      return Promise.resolve({
        checks: [],
        outcome: { name: entry.name, state: 'missing', detail: `no bundled adapter named "${entry.use}"`, count: 0 },
      })
    }
    command = adapter.command(vars)
    parse = adapter.parse
  }

  const rendered = substitute(command, vars)

  return new Promise((resolve) => {
    let child
    try {
      // Through a shell, deliberately: the config holds a command LINE, with
      // pipes and quoting the project chose. It is read from a committed config
      // in the project's own repo — the same trust level as a package script.
      child = spawnFn('/bin/sh', ['-c', rendered], {
        cwd: worktree,
        stdio: ['ignore', 'pipe', 'pipe'],
        // THE CHILD LEADS ITS OWN PROCESS GROUP, and the timeout below depends
        // on it: `process.kill(-pid)` signals a group, and without `detached`
        // that group is OUR OWN — the timeout would kill the render, the CLI
        // and anything else sharing it. `detached` is what makes the negative
        // pid mean "the reviewer and whatever it spawned" instead.
        detached: true,
      })
    } catch (spawnError) {
      resolve({ checks: [], outcome: outcomeFor({ name: entry.name, checks: [], spawnError }) })
      return
    }

    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    let done = false
    let exitCode = 0
    let signal = null

    const timer = setTimeout(() => {
      timedOut = true
      // The group, not the shell: `/bin/sh -c "cr review"` killed on its own
      // leaves the reviewer running and holding the port/rate-limit slot.
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          /* already gone */
        }
      }
    }, entry.timeout * 1000)

    const settle = (spawnError) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const { findings, malformed } = parse ? parse(stdout) : parseRdjsonl(stdout)
      const checks = findings.map((f) => checkFrom(f, entry.name))
      resolve({
        checks,
        outcome: outcomeFor({
          name: entry.name,
          checks,
          exitCode,
          signal,
          stderr,
          malformed: malformed + (truncated ? 1 : 0),
          timedOut,
          spawnError,
        }),
      })
    }

    child.stdout.on('data', (d) => {
      if (stdout.length > MAX_OUTPUT_BYTES) {
        truncated = true
        return
      }
      stdout += d
    })
    child.stderr.on('data', (d) => {
      if (stderr.length > MAX_OUTPUT_BYTES) return
      stderr += d
    })
    child.on('error', (err) => settle(err))
    child.on('close', (code, sig) => {
      exitCode = code === null ? 1 : code
      signal = sig
      settle(null)
    })
  })
}

/**
 * Run every configured reviewer, IN SEQUENCE.
 *
 * Sequential rather than parallel, and it is not laziness: these tools are rate
 * limited per hour on the tiers this feature was built for, and two running at
 * once is how you spend two reviews and get one when the limiter refuses the
 * second. There is no wall-clock prize worth that.
 *
 * Never throws. A reviewer that fails is its own outcome, not the run's.
 */
async function runReviewers(config, ctx) {
  const entries = (config && config.review && config.review.reviewers) || []
  const checks = []
  const outcomes = []
  for (const entry of entries) {
    let result
    try {
      result = await runReviewer(entry, ctx)
    } catch (err) {
      // Belt and braces. `runReviewer` is written not to reject; if a future
      // edit makes it, one reviewer's bug must still not take the render down.
      result = {
        checks: [],
        outcome: { name: entry.name, state: 'failed', detail: firstLine(err && err.message), count: 0 },
      }
    }
    checks.push(...result.checks)
    outcomes.push(result.outcome)
  }
  return { checks, outcomes }
}

/* ==========================================================================
 * The cache — keyed by the diff, not by time
 * ========================================================================== */

/**
 * A stable hash of the diff a render collected. Pure.
 *
 * KEYED ON CONTENT, NEVER ON A CLOCK. A re-render of unchanged work must reuse
 * findings — mid-phase `/spec-diff` runs are cheap to trigger and a review is
 * not — and any change at all must re-run, because findings about code that has
 * moved on are worse than no findings. Paths go in as well as patches so a pure
 * rename is a miss.
 */
function diffHashOf(files) {
  const h = crypto.createHash('sha256')
  for (const f of files || []) {
    h.update(String(f.path || ''))
    h.update('\0')
    h.update(String(f.patch || ''))
    h.update('\0')
  }
  return h.digest('hex').slice(0, 16)
}

function reviewChecksPath(outPath) {
  return outPath.replace(/\.html$/, '') + CHECKS_SUFFIX
}

function emptyChecks(specFolder) {
  return { version: CHECKS_VERSION, spec: specFolder, diffHash: null, at: null, checks: [], outcomes: [] }
}

/**
 * Read the cache. Never throws, and reports `corrupt` rather than hiding it.
 *
 * AN UNREADABLE CACHE IS A MISS, never an empty result — the difference decides
 * whether the reviewers run. Treating it as "no findings" would turn one
 * truncated write into a page that says every reviewer is clean.
 */
function readChecks(outPath, specFolder) {
  let raw
  try {
    raw = fs.readFileSync(reviewChecksPath(outPath), 'utf8')
  } catch {
    // Absent is the ordinary state — most reviews never write one.
    return { cache: emptyChecks(specFolder), corrupt: false, present: false }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || parsed.version !== CHECKS_VERSION) {
      return { cache: emptyChecks(specFolder), corrupt: true, present: true }
    }
    return {
      cache: {
        version: CHECKS_VERSION,
        spec: parsed.spec || specFolder,
        diffHash: typeof parsed.diffHash === 'string' ? parsed.diffHash : null,
        at: parsed.at || null,
        checks: Array.isArray(parsed.checks) ? parsed.checks : [],
        outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
      },
      corrupt: false,
      present: true,
    }
  } catch {
    return { cache: emptyChecks(specFolder), corrupt: true, present: true }
  }
}

function writeChecks(outPath, cache) {
  const p = reviewChecksPath(outPath)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(cache, null, 2) + '\n')
  return p
}

/**
 * Is this cache usable for this diff? Pure.
 *
 * Three states collapse to two safely here, because the unsafe direction is
 * only ever a redundant re-run: a hash that does not match, a cache written for
 * another spec, and a cache with no hash at all are all misses.
 */
function cacheHit(cache, specFolder, diffHash) {
  if (!cache || !cache.diffHash || !diffHash) return false
  if (specFolder && cache.spec && cache.spec !== specFolder) return false
  return cache.diffHash === diffHash
}

/**
 * Mark a set of outcomes as having come from the cache, so the page says
 * `cached` rather than claiming the reviewers just ran. Pure.
 */
function asCached(outcomes) {
  return (outcomes || []).map((o) => (o.state === 'findings' || o.state === 'clean' ? { ...o, state: 'cached' } : o))
}

module.exports = {
  CHECKS_VERSION,
  CHECKS_SUFFIX,
  OUTCOME_STATES,
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
}
