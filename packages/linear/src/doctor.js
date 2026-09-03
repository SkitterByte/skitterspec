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
    projectCheck(state.project, state.tracker, state.remote),
    keyCheck(state.key, state.tracker),
    remoteCheck(state.remote),
    mcpCheck(state.mcp, state.tracker, state.project, state.remote),
  ]
  // `missing` is a declined opt-in, so it must not fail the run. Only a
  // configured-but-wrong layer does.
  return { ok: !checks.some((c) => c.state === 'broken'), checks }
}

function scaffoldCheck(s = {}) {
  if (!s.specsDir) {
    return row('scaffold', 'scaffold', 'missing', 'no specs/ folder', 'skitterspec init')
  }
  // A LIFECYCLE BUCKET IS NOT CHECKED, deliberately. git does not track empty
  // directories, so `specs/in-progress/` disappears whenever no spec is in
  // progress and returns the moment one starts — every lifecycle skill runs
  // `mkdir -p` before it moves a spec. Checking for it reported a healthy repo
  // as broken, and exited 1 under any skill branching on the code.
  //
  // `.core` is the signal that survives: `init` always writes the config
  // templates and the manifest into it, so it is never an empty directory.
  if (!s.core) {
    return row(
      'scaffold',
      'scaffold',
      'broken',
      'specs/ exists but specs/.core/ is missing — a half-installed scaffold',
      'skitterspec init --resync',
    )
  }
  if (!s.skills) {
    return row('scaffold', 'scaffold', 'broken', 'specs/ exists but no skills are installed', 'skitterspec init --resync')
  }
  return row('scaffold', 'scaffold', 'ok', `specs/ + ${s.skills} skills installed`)
}

// Isolation and tracker have NO false-positive mode, and no test is added for
// one: each only says `broken` on positive evidence — a file that is present and
// does not parse, or a config that parses and holds no teamId. Absence is
// reported as `missing`, an opt-in not taken, which never fails the run.
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

// BLIND SPOT: `s.ok` collapses three sources — the env var, the store, and a
// `keyCommand` the store runs. An absent env var is not an absent key, and the
// caller resolves all three before this sees it. `s.error` carries WHY when one
// of them failed; passing it through is what keeps a broken keyCommand from
// being reported as a key the user never set.
// Where specs get filed. `projectId` is the picker's DEFAULT, not a mandate
// (`config.js`), so an unset one is a declined opt-in and NEVER fails the run —
// filing to the team and choosing a project each push is a supported way to work.
//
// BLIND SPOT: offline this can only see that a string is present. A well-formed
// id naming a deleted project, or one belonging to another team, reads `ok`
// until `--check-remote` resolves it — so the detail says which of the two was
// actually established rather than implying the stronger one.
function projectCheck(s = {}, tracker = {}, remote = {}) {
  if (!tracker.present) return row('project', 'project', 'skipped', 'no tracker configured')
  if (!s.configured) {
    return row(
      'project',
      'project',
      'missing',
      'no linear.projectId — specs file to the team, and the picker asks each push',
      '/spec-linear-setup',
    )
  }

  const found = remote && remote.project
  // Configured but unexamined — either --check-remote was not passed, or it was
  // and Linear never answered. Both are "we did not look", not "it is wrong".
  if (!found) {
    return row('project', 'project', 'ok', `${s.configured} — configured, not checked against Linear`)
  }
  if (!found.resolved) {
    return row(
      'project',
      'project',
      'broken',
      found.reason || `linear.projectId ${s.configured} does not resolve in this workspace`,
      '/spec-linear-setup',
    )
  }
  if (!found.belongsToTeam) {
    return row(
      'project',
      'project',
      'broken',
      `"${found.name}" is not a project of team ${tracker.teamKey || tracker.teamId} — specs would file out of the team`,
      '/spec-linear-setup',
    )
  }
  return row('project', 'project', 'ok', `"${found.name}" (${s.configured}) in team ${tracker.teamKey || tracker.teamId}`)
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
  // Asked for, but the check did not run — either there was nothing to ask WITH
  // (no key, no team id; the row that owns that already reported it), or the
  // request never got an answer (unreachable, rate-limited). Neither says this
  // project is misconfigured, and `broken` here exits 1 for every skill
  // branching on the code. The caller decides which failures land here.
  if (s.skipped) {
    return row('remote', 'remote', 'skipped', s.reason || 'nothing to check against')
  }
  if (!s.ok) {
    // Well-formed config is not working config: the id may not resolve, or the
    // key may be revoked. Either way this is configured-but-wrong.
    //
    // `reason` is composed by the caller from a CLASSIFIED failure, never from a
    // raw API message — an error body can echo the request back, and this is the
    // command a skill prints.
    return row('remote', 'remote', 'broken', s.reason || 'Linear did not accept the request', s.fix || 'skitterspec spec-sync credentials set')
  }
  if (s.teamKey && s.recordedKey && s.teamKey !== s.recordedKey) {
    // The team resolved and the key worked — but it is not the team this repo
    // thinks it files into. That is a rename, and every stamped identifier in
    // the repo is now stale.
    return row(
      'remote',
      'remote',
      'broken',
      `team resolves as ${s.teamKey}, but the config records ${s.recordedKey} — the team was renamed`,
      'skitterspec spec-sync retarget',
    )
  }
  return row('remote', 'remote', 'ok', `team ${s.teamKey} resolves, key accepted`)
}

/**
 * Do the two transports point at the same place?
 *
 * A repo reaches Linear over the API or over MCP, chosen per invocation, and
 * they are configured independently: the API key belongs to whatever workspace
 * issued it, the MCP server to whatever workspace it was connected to. Nothing
 * made them agree, so the destination could depend on which transport ran.
 *
 * `s` is what a skill read over MCP (see `readMcpFacts`). Three sources are
 * compared — the repo's config, the API key's workspace, and the MCP server's —
 * and a disagreement is `broken` because writes would land in the wrong place.
 *
 * IDS, NEVER NAMES: a renamed workspace, team or project keeps its id, and
 * `retarget` exists precisely because a team KEY is not identity.
 *
 * BLIND SPOT: the file is a snapshot the skill took, so `ok` means the sources
 * agreed WHEN IT WAS FETCHED. And a field the skill could not fetch is absent —
 * absence is unchecked, so it never produces `broken`. The row can only speak
 * about pairs it holds both halves of, which is why it names them.
 */
function mcpCheck(s, tracker = {}, project = {}, remote = {}) {
  if (!s) {
    return row('mcp', 'mcp', 'skipped', 'pass --mcp <file> to check the MCP server points at the same place')
  }

  const apiOrg = remote && remote.organization
  const pairs = [
    ['workspace', s.workspace && s.workspace.id, apiOrg && apiOrg.id, s.workspace && s.workspace.name, apiOrg && apiOrg.name, "the API key's workspace"],
    ['team', s.team && s.team.id, tracker.teamId, s.team && s.team.key, tracker.teamKey, 'the config'],
    ['project', s.project && s.project.id, project && project.configured, s.project && s.project.name, null, 'the config'],
  ]

  const checked = []
  for (const [what, mcpId, otherId, mcpName, otherName, whose] of pairs) {
    // Both halves, or nothing to compare. An absent id is a question nobody
    // asked, not an answer of "no".
    if (!mcpId || !otherId) continue
    checked.push(what)
    if (mcpId !== otherId) {
      return row(
        'mcp',
        'mcp',
        'broken',
        `${what} mismatch — the MCP server says ${describe(mcpName, mcpId)}, ${whose} says ` +
          `${describe(otherName, otherId)}; writes land wherever the transport does`,
        '/spec-linear-setup',
      )
    }
  }

  if (!checked.length) {
    return row('mcp', 'mcp', 'skipped', 'the --mcp file names nothing that can be compared yet')
  }
  const where = (s.workspace && s.workspace.name) || (s.team && s.team.key) || 'the same place'
  return row('mcp', 'mcp', 'ok', `${where} — ${checked.join(', ')} agree across both transports`)
}

// `Name (id)` when a name is known, the bare id otherwise — the id is what was
// compared, so it is always shown.
const describe = (name, id) => (name ? `"${name}" (${id})` : String(id))

module.exports = { runChecks, STATES }
