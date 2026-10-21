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
    case 'push':
      if (step.via === 'remote') return `push: ${step.tag || 'the tag'} is already on ${step.remote}`
      if (step.via === 'hold') return `push: held — no consent to push to ${step.remote}`
      return `push: ${step.branch}, then ${step.tag || 'the tag'}, to ${step.remote}`
    case 'target':
      return `target: ${step.base} -> ${step.tag} (cherry-pick, tag)`
    case 'carry': {
      const n = Array.isArray(step.commits) ? step.commits.length : 0
      const what = n === 1 ? '1 commit' : `${n} commits`
      if (step.strategy === 'worktree') return `carry: cherry-pick ${what} onto ${step.base} (throwaway worktree)`
      return `carry: cherry-pick ${what} onto ${step.base}`
    }
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

// Publish the release. The tag is the release's, known only once it has run,
// so the argvs are built here rather than in the plan. `hold` is not a failure:
// it is the operator not having said yes, and it stops the run so nothing after
// it is carried before the deploy tag is public.
function runPush(step, release, ctx) {
  const s = { ...step, tag: release ? release.tag : null }
  if (s.via === 'remote') return { outcome: 'skipped', line: describeStep(s) }
  if (s.via === 'hold') return { outcome: 'held', line: describeStep(s) }
  if (!release) return { outcome: 'failed', line: `${describeStep(s)} — no release to push` }
  for (const ref of [s.branch, s.tag]) {
    const argv = ['-C', s.cwd, 'push', s.remote, ref]
    const res = ctx.spawn('git', argv, { stdio: ['ignore', ctx.childStdout, 'pipe'], encoding: 'utf8' })
    if (res.error || res.status !== 0) {
      return { outcome: 'failed', line: `push ${ref} to ${s.remote} — ${lastLine(res.stderr) || why(res)}` }
    }
  }
  return { outcome: 'pushed', line: `pushed ${s.branch}, then ${s.tag}, to ${s.remote}` }
}

/**
 * Carry the fix onto the base branch, one commit at a time so a conflict can
 * name the commit that caused it.
 *
 * Three strategies, chosen by the caller from where the base branch is:
 *   inplace  — checked out and clean: cherry-pick there.
 *   worktree — not checked out anywhere: a throwaway worktree on it, removed
 *              afterwards, so the branch moves without anyone's checkout moving.
 *   dirty    — checked out with uncommitted work: refuse, and print the command
 *              to run by hand once it is clean. Somebody's work is in that tree.
 * On a conflict the cherry-pick is aborted, which leaves the base branch where
 * it was before that commit, and the hotfix branch and its record untouched —
 * so a re-run tries the carry again.
 */
function runCarry(step, release, ctx) {
  const version = release && release.versionCommit
  // The version commit cannot be in a list made before the release cut it,
  // but a re-run lists the branch after — so it is left out here as well.
  const commits = (step.commits || []).filter((sha) => !version || sha !== version)
  if (!commits.length) {
    return { outcome: 'skipped', line: `carry: nothing to carry — ${step.base} already has the fix`, carried: 0 }
  }
  if (step.strategy === 'dirty') {
    return {
      outcome: 'refused',
      line:
        `carry: ${step.cwd} has uncommitted changes on ${step.base} — commit or stash them, ` +
        `then run: git -C ${step.cwd} cherry-pick ${commits.join(' ')}`,
    }
  }
  const git = (argv) =>
    ctx.spawn('git', argv, { stdio: ['ignore', ctx.childStdout, 'pipe'], encoding: 'utf8' })
  let cwd = step.cwd
  if (step.strategy === 'worktree') {
    cwd = step.tmpPath
    const res = git(['-C', step.root, 'worktree', 'add', cwd, step.base])
    if (res.error || res.status !== 0) {
      return { outcome: 'failed', line: `carry: worktree add ${cwd} — ${lastLine(res.stderr) || why(res)}` }
    }
  }
  const cleanup = () => {
    if (step.strategy === 'worktree') git(['-C', step.root, 'worktree', 'remove', '--force', cwd])
  }
  for (const sha of commits) {
    const res = git(['-C', cwd, 'cherry-pick', sha])
    if (res.error || res.status !== 0) {
      git(['-C', cwd, 'cherry-pick', '--abort'])
      cleanup()
      return {
        outcome: 'failed',
        line:
          `carry: cherry-pick ${sha} onto ${step.base} conflicted — aborted; ` +
          `${lastLine(res.stderr) || why(res)}`,
      }
    }
  }
  cleanup()
  const what = commits.length === 1 ? '1 commit' : `${commits.length} commits`
  return { outcome: 'ran', line: `carried ${what} onto ${step.base}`, carried: commits.length }
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
 * Returns { ok, held, results, failedAt, release } — `release` is what the
 * release step cut (or found recorded), or null if it never got that far.
 * `held` is a run that stopped at the push for want of consent: not a failure,
 * and nothing after it ran.
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
  let carried = null
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    let r
    try {
      if (step.kind === 'release') r = runRelease(step, ctx)
      else if (step.kind === 'push') r = runPush(step, release, ctx)
      else if (step.kind === 'carry') r = runCarry(step, release, ctx)
      else if (step.kind === 'target') {
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
    if (typeof r.carried === 'number') carried = r.carried
    if (r.release) {
      release = r.release
      if (r.outcome === 'released' && io.record) io.record(release)
    }
    if (r.outcome === 'pushed' && release) {
      release = { ...release, pushed: true }
      if (io.record) io.record(release)
    }
    if (r.outcome === 'held') {
      if (r.line) write(r.line)
      return { ok: true, held: true, results, failedAt: null, release, carried }
    }
    if (r.outcome === 'failed' || r.outcome === 'refused') {
      return { ok: false, results, failedAt: i + 1, release, carried }
    }
    if (r.line) write(r.line)
  }
  return { ok: true, held: false, results, failedAt: null, release, carried }
}

module.exports = { parseRelease, runHotfixLand, describeStep, RELEASE_FIELDS }
