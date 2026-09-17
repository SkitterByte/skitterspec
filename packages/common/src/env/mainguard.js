'use strict'

/**
 * The main guard — is this write about to land on the base branch?
 *
 * `main` is where work **lands**, not where it happens. Two routes reach it
 * otherwise, and both cost someone else something: a dirty base branch that
 * every in-flight spec has to replay over and no release can be cut through,
 * and — worse — work that renders no review page at all, because nothing in
 * this workflow renders one for the primary checkout.
 *
 * Both routes now have somewhere to go: `/spec` authors in its own `--docs`
 * worktree, and `/no-spec` gives mechanical work a branch of its own. So the
 * guard is a push toward a path that exists rather than a refusal with no exit.
 *
 * THE ACCUSATION IS POSITIVE, AND ALL FOUR PARTS MUST HOLD. It is
 * `.claude/rules/negative-checks.md` rule 1 applied to a check that stops
 * someone working: isolation is configured, the guard is not switched off, this
 * directory IS the primary checkout, and HEAD IS the base branch. Anything the
 * engine cannot establish — no repo, no config, an unresolvable base, a
 * worktree, an unreadable allow file — allows the write and says nothing.
 * Being wrong the permissive way costs one unguarded edit on a rule the skills
 * also carry; being wrong the other way costs someone their work with no idea
 * why.
 */

const fs = require('node:fs')
const path = require('node:path')

const { assertPrimaryOnMain, resolvePrimaryCheckout } = require('./resolve.js')

// Where the allow lives. Gitignored, machine-local and beside the registry —
// this is one person's decision about one session, never the project's policy.
const ALLOW_FILE = 'main-allow.json'

function allowPath(rootDir, config) {
  return path.resolve(rootDir, path.dirname(config.registry), ALLOW_FILE)
}

/**
 * Read the recorded allow. Pure but for the read.
 *
 * MISSING AND MALFORMED BOTH READ AS "NO ALLOW", which is the *strict* answer
 * here rather than the lenient one — and that is the right way round only
 * because the strict answer is also the safe one. An unreadable allow file
 * makes the guard fire, and firing costs a refusal naming two exits; silently
 * treating it as permission would let a stale file switch the guard off
 * forever.
 */
function readAllow(rootDir, config) {
  try {
    const parsed = JSON.parse(fs.readFileSync(allowPath(rootDir, config), 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function writeAllow(rootDir, config, value) {
  const file = allowPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function clearAllow(rootDir, config) {
  try {
    fs.unlinkSync(allowPath(rootDir, config))
    return true
  } catch {
    return false
  }
}

/**
 * Does `allow` permit a write from `sessionId`? Pure.
 *
 * TWO KINDS, AND THEY MUST NOT LOOK ALIKE. A **session** allow names the
 * session that asked for it, so it lapses the moment that conversation ends —
 * which is what "temporary" has to mean for something nobody will remember to
 * switch back. A **repo** allow is the degraded form for a harness that exposes
 * no session id; it outlives the session and is cleared only by hand, so
 * `mainGuardStatus` says which kind is in force rather than reporting a bare
 * "allowed".
 *
 * A session allow with no session id to compare against does NOT apply. The
 * alternative — treating "cannot tell whose session this is" as a match — would
 * turn every session allow into a repo one the moment a caller forgot to pass
 * the id.
 */
function allowApplies(allow, sessionId) {
  if (!allow) return false
  if (allow.scope === 'repo') return true
  if (allow.scope === 'session') return Boolean(sessionId) && allow.session === sessionId
  return false
}

/**
 * Should a write in `dir` be refused? Pure — every fact arrives in `ctx`.
 *
 * ctx: { configured, enabled, isPrimary, onBase, allow, sessionId }
 *
 * Returns `{ refuse, reason }`. `reason` is for the operator and names both
 * exits; `refuse: false` always carries a null reason, because a guard that
 * explains why it is NOT firing is the narration this codebase bans.
 *
 * WHAT WOULD FOOL THIS: nothing here inspects the *file* being written. A write
 * to `specs/`, to `.claude/`, to a scratch file — all refused alike, and that is
 * the decision rather than an oversight. An allowlist was considered and is
 * empty by construction: with `/spec` authoring into its own worktree and
 * `/no-spec` catching ad-hoc work, no legitimate writer to the base branch is
 * left. `/spec-init` is the apparent exception and is not one — it bootstraps a
 * repo that has no `env.config.json` yet, so `configured` is false and the
 * guard never reaches this function.
 */
function judgeMainWrite(ctx) {
  const { configured, enabled, isPrimary, onBase, allow, sessionId } = ctx || {}

  // Every one of these is a CANNOT-TELL or a NOT-APPLICABLE, and each routes to
  // the harmless branch on its own rather than through a combined condition —
  // so a later reader can delete one without silently widening the others.
  if (!configured) return { refuse: false, reason: null }
  if (enabled === false) return { refuse: false, reason: null }
  if (!isPrimary) return { refuse: false, reason: null }
  if (!onBase) return { refuse: false, reason: null }
  if (allowApplies(allow, sessionId)) return { refuse: false, reason: null }

  return {
    refuse: true,
    reason:
      'the primary checkout is on the base branch, and the base branch is a landing zone — ' +
      'work lands there, it does not happen there.\n\n' +
      'Move the work instead of writing here:\n' +
      '  /no-spec <name>      a one-off with no spec — its own branch, worktree and review page\n' +
      '  /spec-start <name>   a spec that is ready to be built\n' +
      '  /spec                a change that wants grilling first\n\n' +
      'If this really does belong on the base branch, the USER types /allow-main — ' +
      'it is theirs to run, not yours.',
  }
}

/**
 * Gather the facts and judge. The only IO in the module's hot path.
 *
 * `git` is an injected reader, as everywhere in this package: the caller owns
 * the child-process boundary, which is what keeps `judgeMainWrite` testable
 * without one.
 */
function checkMainWrite(dir, config, git, opts = {}) {
  // `present` from `loadEnvConfig` — the caller has it and this module must not
  // re-read the file to find out. A defaults-only config is indistinguishable
  // from a configured one that happens to match the defaults, so asking the
  // config object would answer the wrong question.
  const configured = opts.present === true
  const enabled = !(config && config.guards && config.guards.mainIsLandingZone === false)

  // IS THIS THE PRIMARY CHECKOUT? A worktree is somebody's spec branch and none
  // of this guard's business, so the question is asked positively rather than by
  // looking for the absence of a worktree marker.
  let isPrimary = false
  let primary = null
  try {
    primary = resolvePrimaryCheckout(dir, git)
    isPrimary = Boolean(primary) && path.resolve(primary) === path.resolve(dir)
  } catch {
    // Not a git repo, or git unreadable. Cannot tell → allow.
    return { refuse: false, reason: null, branch: null, baseBranch: null }
  }

  let onBase = false
  let branch = null
  let baseBranch = null
  try {
    const state = assertPrimaryOnMain(config, git)
    onBase = state.onBase
    branch = state.branch
    baseBranch = state.baseBranch
  } catch {
    return { refuse: false, reason: null, branch: null, baseBranch: null }
  }

  const root = isPrimary ? dir : primary || dir
  const verdict = judgeMainWrite({
    configured,
    enabled,
    isPrimary,
    onBase,
    allow: readAllow(root, config),
    sessionId: opts.sessionId || null,
  })
  return { ...verdict, branch, baseBranch }
}

/**
 * Record an allow. `sessionId` present → a session allow; absent → a repo one.
 * Returns what was written, so the caller can report which kind it is.
 */
function recordAllow(rootDir, config, { sessionId = null, reason = null, at = null } = {}) {
  const value = sessionId
    ? { scope: 'session', session: sessionId, reason, at }
    : { scope: 'repo', reason, at }
  writeAllow(rootDir, config, value)
  return value
}

/**
 * What is in force, as data. Four states, and the caller reports all four —
 * `off` (the project switched the guard off), `unconfigured`, `allowed` (with
 * its scope and reason), or `guarded`.
 */
function mainGuardStatus(rootDir, config, opts = {}) {
  if (opts.present !== true) return { state: 'unconfigured' }
  if (config && config.guards && config.guards.mainIsLandingZone === false) {
    return { state: 'off' }
  }
  const allow = readAllow(rootDir, config)
  if (allowApplies(allow, opts.sessionId || null)) {
    return { state: 'allowed', scope: allow.scope, reason: allow.reason || null, at: allow.at || null }
  }
  // A session allow belonging to ANOTHER session is reported rather than hidden:
  // the operator asked for one somewhere, and a bare "guarded" would send them
  // hunting for why their /allow-main did nothing.
  if (allow && allow.scope === 'session') {
    return { state: 'guarded', otherSession: true }
  }
  return { state: 'guarded' }
}

module.exports = {
  ALLOW_FILE,
  allowPath,
  readAllow,
  writeAllow,
  clearAllow,
  allowApplies,
  judgeMainWrite,
  checkMainWrite,
  recordAllow,
  mainGuardStatus,
}
