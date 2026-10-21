'use strict'

/**
 * Run a hotfix land's steps — the engine half of `spec-env hotfix land`.
 *
 * `planHotfixLand` (hotfix.js) decides WHAT the land is; this module does it,
 * the way `bootstrap.js` does a worktree's steps. It used to be a printed plan
 * the skill ran by hand, and that stopped being possible the moment the release
 * could be a project's own command: the prod tag is only known once that
 * command has run and said what it cut, so no plan printed beforehand can name
 * it.
 *
 * The run stops at the first step that fails, and the release is reported to
 * `io.record` the moment it succeeds — so a land that stops later (a refused
 * push, a conflicted cherry-pick) can be re-run without cutting a second
 * release. skittership's own command refuses a second one anyway, since HEAD is
 * then already tagged; the record is what lets the re-run carry on instead of
 * stopping there.
 *
 * Every side effect goes through `io.spawn`, so tests drive it with a fake.
 */

const { spawnSync } = require('node:child_process')

// The fields skittership's `release-hotfix.cjs --json` prints, and their types.
// `versionCommit` is null only on its `--dry-run`, which skitterspec never
// passes — so a null here is accepted, and means "no version commit to leave
// behind", exactly as the built-in tagger's.
const RELEASE_FIELDS = {
  tag: 'string',
  version: 'string',
  baseTag: 'string',
  branch: 'string',
  versionCommit: 'string|null',
  pushed: 'boolean',
}

/**
 * Parse a release command's stdout STRICTLY: the whole of it, trimmed, must be
 * one JSON object carrying every field above. Anything else — a package
 * manager's run banner, a stray log line, a missing field — is a refusal rather
 * than a best guess, because a guessed tag is a deploy of the wrong thing.
 */
function parseRelease(stdout) {
  const text = String(stdout || '').trim()
  if (!text) return { ok: false, reason: 'printed nothing on stdout — expected one JSON line' }
  let obj
  try {
    obj = JSON.parse(text)
  } catch {
    const first = text.split('\n')[0].slice(0, 120)
    return { ok: false, reason: `stdout is not one JSON object (starts: ${first})` }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, reason: 'stdout is JSON but not an object' }
  }
  for (const [key, type] of Object.entries(RELEASE_FIELDS)) {
    const v = obj[key]
    const fits = type
      .split('|')
      .some((t) => (t === 'null' ? v === null : typeof v === t && (t !== 'string' || v.length)))
    if (!fits) return { ok: false, reason: `JSON field "${key}" is missing or not ${type}` }
  }
  return { ok: true, release: obj }
}

/** One line describing a step, for `--plan` and the failure report. */
function describeStep(step) {
  switch (step.kind) {
    case 'release':
      if (step.via === 'command') return `release: ${step.command}`
      if (step.via === 'recorded') return `release: ${step.tag} (cut earlier — not re-run)`
      return `release: git tag ${step.tag}`
    case 'target':
      return `target: ${step.base} -> ${step.tag} (cherry-pick, tag)`
    case 'carry':
      return `carry: cherry-pick onto ${step.base}`
    default:
      return `unknown step ${step.kind}`
  }
}

// The last non-blank line a command wrote to stderr — skittership's refusals
// are one `✖ release-hotfix: <reason>` line there, and that is what to relay.
function lastLine(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.length ? lines[lines.length - 1] : null
}

function why(res) {
  if (res.error) return res.error.message
  return res.status === null ? `killed by ${res.signal || 'a signal'}` : `exit ${res.status}`
}

function runRelease(step, ctx) {
  if (step.via === 'recorded') {
    return { outcome: 'skipped', line: describeStep(step), release: step.release }
  }
  if (step.via === 'tag') {
    const res = ctx.spawn('git', ['-C', step.cwd, 'tag', step.tag], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
    if (res.error || res.status !== 0) {
      return { outcome: 'failed', line: `${describeStep(step)} — ${lastLine(res.stderr) || why(res)}` }
    }
    const release = {
      tag: step.tag,
      version: step.tag.replace(/^\D*/, ''),
      baseTag: step.baseTag,
      branch: step.branch,
      versionCommit: null,
      pushed: false,
    }
    return { outcome: 'released', line: `tagged ${step.tag}`, release }
  }
  // A project's own command, through the shell. stdout is captured whole for
  // the JSON; stderr is captured so a refusal can be relayed as its own line,
  // and is passed on to ours so its progress output is not lost.
  const res = ctx.spawn(step.command, {
    cwd: step.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  })
  if (res.stderr) ctx.childStderr(res.stderr)
  if (res.error || res.status !== 0) {
    return { outcome: 'refused', line: `release refused — ${lastLine(res.stderr) || why(res)}` }
  }
  const parsed = parseRelease(res.stdout)
  if (!parsed.ok) return { outcome: 'refused', line: `release refused — ${parsed.reason}` }
  return { outcome: 'released', line: `released ${parsed.release.tag}`, release: parsed.release }
}

// A step that is a list of git argvs run in order — a target's worktree,
// cherry-pick, tag and cleanup, or the carry's cherry-pick.
function runArgvs(step, ctx) {
  for (const argv of step.argvs) {
    const res = ctx.spawn('git', argv, { stdio: ['ignore', ctx.childStdout, 'pipe'], encoding: 'utf8' })
    if (res.error || res.status !== 0) {
      return {
        outcome: 'failed',
        line: `${describeStep(step)} — git ${argv.join(' ')}: ${lastLine(res.stderr) || why(res)}`,
      }
    }
  }
  return { outcome: 'ran', line: describeStep(step) }
}

/**
 * Run `steps` in order, stopping at the first that fails or refuses.
 *
 * io: { spawn?, write?, record?, childStdout?, childStderr? }
 *   - `write(line)` receives every report line as it happens
 *   - `record(release)` is called once, as soon as a release succeeds
 *
 * Returns { ok, results, failedAt, release } — `release` is what the release
 * step cut (or found recorded), or null if it never got that far.
 */
function runHotfixLand(steps, io = {}) {
  const ctx = {
    spawn: io.spawn || spawnSync,
    childStdout: io.childStdout || 'inherit',
    childStderr: io.childStderr || ((t) => process.stderr.write(t)),
  }
  const write = io.write || (() => {})
  const results = []
  let release = null
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    let r
    try {
      if (step.kind === 'release') r = runRelease(step, ctx)
      else if (step.kind === 'target' || step.kind === 'carry') {
        // A project's release command can cut a tag the built-in tagger also
        // planned for a target on the same root. Refuse rather than collide.
        if (step.kind === 'target' && release && release.tag === step.tag) {
          r = { outcome: 'refused', line: `${describeStep(step)} — the release already cut ${step.tag}` }
        } else r = runArgvs(step, ctx)
      } else r = { outcome: 'failed', line: describeStep(step) }
    } catch (err) {
      r = { outcome: 'failed', line: `${describeStep(step)} — ${err.message}` }
    }
    results.push({ step, outcome: r.outcome, line: r.line })
    if (r.release) {
      release = r.release
      if (r.outcome === 'released' && io.record) io.record(release)
    }
    if (r.outcome === 'failed' || r.outcome === 'refused') {
      return { ok: false, results, failedAt: i + 1, release }
    }
    if (r.line) write(r.line)
  }
  return { ok: true, results, failedAt: null, release }
}

module.exports = { parseRelease, runHotfixLand, describeStep, RELEASE_FIELDS }
