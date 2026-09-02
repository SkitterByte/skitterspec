'use strict'

/**
 * `spec-sync doctor` — one readiness report across every layer of a setup.
 *
 * Setting skitterspec up spans four layers — the `specs/` scaffold and skills,
 * per-spec isolation, the tracker config, and the API key — and each was checked
 * by a different command, or by none. `init` reports the scaffold and isolation;
 * `credentials status` reports the key; the tracker config had no readiness check
 * at all, only commands that write it. So "is this project set up?" had no single
 * answer, and a skill needing to know its own prerequisites had nothing to call.
 *
 * This module is the PURE half. It takes the project's state as an argument —
 * gathered by the caller — and returns rows. No `fs`, no network, no output, so
 * every branch is exercised from a literal rather than a scaffolded temp project.
 *
 * Two distinctions carry the design:
 *
 * 1. **`missing` is not `broken`.** `missing` is an opt-in not taken, which is
 *    fine; `broken` is configured-but-wrong, which is not. `ok` is false only for
 *    `broken`, so declining isolation or a tracker never reads as a failure. The
 *    existing commands blur exactly this.
 * 2. **Every non-`ok` row names the command that fixes it**, so the output is
 *    actionable without reading docs — the shape `credentials status` already
 *    uses.
 *
 * It never prints a secret: the key row carries a masked fingerprint and its
 * source, never the value. This is the command a skill runs, so that has to hold
 * by construction rather than by convention.
 */

const STATES = ['ok', 'missing', 'broken', 'skipped']

// A row is a check. `fix` is the exact command to run, or null when there is
// nothing to fix.
const row = (id, label, state, detail, fix = null) => {
  if (!STATES.includes(state)) throw new Error(`doctor: unknown check state "${state}" for ${id}`)
  return { id, label, state, detail, fix }
}

/**
 * @param {object} state gathered by the caller:
 *   {
 *     scaffold:  { specsDir: bool, buckets: string[], skills: number },
 *     isolation: { present: bool, parsed: bool, error?: string },
 *     tracker:   { present: bool, parsed: bool, teamId?: string, teamKey?: string, error?: string },
 *     key:       { ok: bool, source?: string, fingerprint?: string, error?: string },
 *     remote:    { checked: bool, ok?: bool, teamKey?: string, error?: string },
 *   }
 * @returns {{ok: boolean, checks: Array}}
 */
function runChecks(state = {}) {
  const checks = [
    scaffoldCheck(state.scaffold),
    isolationCheck(state.isolation),
    trackerCheck(state.tracker),
    keyCheck(state.key, state.tracker),
    remoteCheck(state.remote),
  ]
  // `missing` is a declined opt-in, so it must not fail the run. Only a
  // configured-but-wrong layer does.
  return { ok: !checks.some((c) => c.state === 'broken'), checks }
}

function scaffoldCheck(s = {}) {
  if (!s.specsDir) {
    return row('scaffold', 'scaffold', 'missing', 'no specs/ folder', 'skitterspec init')
  }
  const buckets = s.buckets || []
  const missing = ['backlog', 'in-progress', 'complete', 'cancelled'].filter((b) => !buckets.includes(b))
  if (missing.length) {
    // Present but incomplete is a half-install, which is exactly when repair
    // matters — so it is broken, not missing.
    return row('scaffold', 'scaffold', 'broken', `specs/ is missing ${missing.join(', ')}`, 'skitterspec init --resync')
  }
  if (!s.skills) {
    return row('scaffold', 'scaffold', 'broken', 'specs/ exists but no skills are installed', 'skitterspec init --resync')
  }
  return row('scaffold', 'scaffold', 'ok', `specs/ + ${s.skills} skills installed`)
}

function isolationCheck(s = {}) {
  if (!s.present) {
    return row('isolation', 'isolation', 'missing', 'not enabled — every spec builds in place', 'skitterspec init --isolation')
  }
  if (!s.parsed) {
    return row('isolation', 'isolation', 'broken', s.error || 'env.config.json does not parse', 'fix specs/.core/env.config.json')
  }
  return row('isolation', 'isolation', 'ok', 'env.config.json — worktree per spec')
}

function trackerCheck(s = {}) {
  if (!s.present) {
    return row('tracker', 'tracker', 'missing', 'no linear.config.json — sync is opt-in', '/spec-linear-setup')
  }
  if (!s.parsed) {
    return row('tracker', 'tracker', 'broken', s.error || 'linear.config.json does not parse', '/spec-linear-setup')
  }
  if (!s.teamId) {
    // Configured but unusable: every Linear call needs the team id.
    return row('tracker', 'tracker', 'broken', 'linear.config.json has no linear.teamId', '/spec-linear-setup')
  }
  const team = s.teamKey ? `${s.teamId} (${s.teamKey})` : s.teamId
  return row('tracker', 'tracker', 'ok', `linear.config.json — team ${team}`)
}

function keyCheck(s = {}, tracker = {}) {
  // Without a tracker there is nothing for a key to authenticate, so asking for
  // one would be noise.
  if (!tracker.present) return row('key', 'key', 'skipped', 'no tracker configured')
  if (!s.ok) {
    return row(
      'key',
      'key',
      'missing',
      s.error || `no key for ${tracker.teamKey || tracker.teamId || 'this team'}`,
      'skitterspec spec-sync credentials set',
    )
  }
  // Masked fingerprint and source only — never the value.
  return row('key', 'key', 'ok', `${s.fingerprint || 'set'} from ${s.source || 'unknown'}`)
}

function remoteCheck(s = {}) {
  if (!s.checked) {
    return row('remote', 'remote', 'skipped', 'pass --check-remote to verify against Linear')
  }
  if (!s.ok) {
    // Well-formed config is not working config: the id may not resolve, or the
    // key may be revoked. Either way this is configured-but-wrong.
    return row('remote', 'remote', 'broken', s.error || 'Linear did not accept the request', 'skitterspec spec-sync credentials set')
  }
  return row('remote', 'remote', 'ok', `team ${s.teamKey} resolves, key accepted`)
}

module.exports = { runChecks, STATES }
