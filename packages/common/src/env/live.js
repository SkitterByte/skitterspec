'use strict'

/**
 * Live-overlay receipt — the advisory record of which spec currently holds the
 * primary checkout for live testing.
 *
 * The *authority* on "who's live" is the branch checked out in the primary
 * checkout (see `assertPrimaryOnMain` in resolve.js): on the base branch → free;
 * on a feature branch → that spec is in control. This receipt is only metadata —
 * it powers `live status` and crash recovery (`live abort` reads `baseMainCommit`
 * from here to restore the primary checkout). It lives beside the slot registry
 * at the primary checkout root (`.spec-env/live.json`, gitignored).
 *
 * `receiptPath`/`renderReceipt`/`summarizeReceipt` are pure; `read`/`write`/`clear`
 * are the thin IO seam the CLI drives, mirroring env/registry.js. No `Date.now()`
 * — the caller passes `heldSince`.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { globToRegExp } = require('./glob.js')
const { shellPath } = require('./project.js')
const { planTriggered, noTriggered } = require('./triggered.js')

const REQUIRED = ['spec', 'branch', 'holder', 'heldSince', 'baseMainCommit']

// Absolute path to the receipt — a sibling of the configured registry file, so it
// follows wherever `.spec-env` is configured (default `.spec-env/live.json`).
function receiptPath(rootDir, config) {
  return path.resolve(rootDir, path.dirname(config.registry), 'live.json')
}

// Normalize receipt fields into the persisted shape. Pure; throws on a missing
// field so a half-formed receipt is never written.
function renderReceipt(fields) {
  for (const key of REQUIRED) {
    if (!fields || !fields[key]) throw new Error(`live receipt: missing ${key}`)
  }
  const receipt = {}
  for (const key of REQUIRED) receipt[key] = String(fields[key])
  return receipt
}

// Read the receipt. Missing file → null (no one is live). Malformed JSON → Error.
function readReceipt(rootDir, config) {
  const file = receiptPath(rootDir, config)
  let raw
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Invalid live receipt ${path.dirname(config.registry)}/live.json: ${error.message}`,
    )
  }
}

// Persist the receipt, creating its parent dir as needed. Returns the written shape.
function writeReceipt(rootDir, config, fields) {
  const receipt = renderReceipt(fields)
  const file = receiptPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

// Remove the receipt. Idempotent: clearing an absent receipt is a clean no-op.
function clearReceipt(rootDir, config) {
  const file = receiptPath(rootDir, config)
  try {
    fs.unlinkSync(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

// --- the last spec this checkout released ---------------------------------

/**
 * Which spec `live release` last handed back to its worktree
 * (bug-live-release-forgets-spec). Releasing leaves the session standing in the
 * primary checkout, where — with several worktrees — a bare resolve had no way
 * to say which spec was just there, so `/spec-next` refused a spec in flight.
 *
 * A HINT, NEVER AN AUTHORITY. It answers only while the spec it names is still
 * provisioned (the caller checks against `git worktree list`), and anything
 * wrong with the file — missing, malformed, no `spec` — reads as null, never an
 * error: a stale record is cannot-tell and falls through to the rungs below it.
 *
 * WHAT WOULD FOOL THIS: a record naming a spec whose worktree was torn down and
 * then re-provisioned would answer for it again. That spec was released from
 * this checkout and is in flight again, so the answer is still a real one.
 */
function lastLivePath(rootDir, config) {
  return path.resolve(rootDir, path.dirname(config.registry), 'last-live.json')
}

function readLastLive(rootDir, config) {
  try {
    const record = JSON.parse(fs.readFileSync(lastLivePath(rootDir, config), 'utf-8'))
    return record && typeof record.spec === 'string' && record.spec ? record : null
  } catch {
    return null
  }
}

function writeLastLive(rootDir, config, fields) {
  const file = lastLivePath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(fields, null, 2) + '\n')
}

function clearLastLive(rootDir, config) {
  try {
    fs.unlinkSync(lastLivePath(rootDir, config))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

// A one-line human summary of a receipt (or the "free" state when null). Pure.
function summarizeReceipt(receipt) {
  if (!receipt) return 'free — no spec is live'
  return (
    `${receipt.spec} (branch ${receipt.branch}) — ` +
    `held by ${receipt.holder} since ${receipt.heldSince}`
  )
}

// --- is this spec live? ---------------------------------------------------

/**
 * Whether a spec is currently live, in a form a page can carry. Pure.
 *
 * FOUR STATES, NOT TWO, and the fourth is what keeps this quiet in a healthy
 * repo. `on` and `off` are the two a reader acts on; `held` is another spec
 * holding the workbench, which is a refusal with a named way out; and
 * `unavailable` is **cannot tell** — routed to silence rather than to a warning
 * (`.claude/rules/negative-checks.md` rule 4). A project with no isolation and a
 * spec with no worktree both land there, and both are perfectly healthy.
 *
 * THE BRANCH IS THE AUTHORITY, NOT THE RECEIPT, exactly as this file's header
 * says: the receipt is metadata for `live status` and crash recovery. So an
 * unreadable or absent receipt costs the *holder's name* and nothing else — the
 * state still comes from which branch the primary checkout is on. Deriving the
 * state from the receipt instead would report `off` for a checkout plainly
 * sitting on a feature branch, which is the one answer that would let something
 * act.
 *
 * WHAT WOULD FOOL THIS: `onBase` and `primaryBranch` are read from the primary
 * checkout by the caller. A caller that passes a *worktree's* git reader would
 * describe the worktree's HEAD and call it the workbench — so `ctx` is built by
 * `assertPrimaryOnMain` against the repo root and nowhere else.
 *
 * ctx: { isolated, onBase, primaryBranch, receipt, worktreeExists, url }
 * @returns {{state:'on'|'off'|'held'|'unavailable', holder:string|null, url:string|null, reason:string|null}}
 */
function liveStateFor(spec, ctx) {
  const c = ctx || {}
  const unavailable = (reason) => ({ state: 'unavailable', holder: null, url: null, reason })

  if (!spec || !spec.branch) return unavailable('no spec to ask about')
  if (c.isolated === false) return unavailable('isolation is not configured')

  // Not on base — something holds the workbench. Which something is the only
  // question left, and the branch answers it without the receipt.
  if (c.onBase === false) {
    const branch = c.primaryBranch || null
    if (branch && branch === spec.branch) {
      return { state: 'on', holder: null, url: c.url || null, reason: null }
    }
    const holder = c.receipt && c.receipt.spec ? String(c.receipt.spec) : null
    const on = branch || '(detached)'
    return {
      state: 'held',
      holder,
      url: null,
      // Every way out, because this is the only explanation the reader gets —
      // the same reasoning `planTake`'s guard 1 records for its own refusal.
      reason: holder
        ? `${holder} holds the workbench (branch ${on})`
        : `the workbench is on ${on} — no receipt; switched by hand?`,
    }
  }

  // `onBase` is deliberately three-valued: anything but a definite `true` here
  // is a checkout we could not read, and that is not evidence the spec is off.
  if (c.onBase !== true) return unavailable('could not read the primary checkout')
  if (!c.worktreeExists) return unavailable('no worktree to put live')

  return { state: 'off', holder: null, url: null, reason: null }
}

/**
 * The one line the render prints for a live state, or null for `unavailable`.
 * Pure.
 *
 * NULL IS THE POINT. `unavailable` prints nothing at all — not a dash, not an
 * explanation — because every input that produces it is a healthy repo that
 * simply has no live surface, and a line about one is an accusation.
 */
function liveStateLine(live) {
  if (!live || live.state === 'unavailable') return null
  const label = '  live:'.padEnd(11)
  // IT NAMES THE COMMAND, not the capability. This line read
  // `off — the page can put it live`, which told the reader a page somewhere
  // could do it and left them to find the verb — and the verb is the thing they
  // actually need when they are in a terminal rather than on the page. It is
  // `/spec-live` rather than `spec-env live take` because that command is what a
  // person types: it is user-only by its own marking, and the model cannot run
  // it either way.
  if (live.state === 'on') {
    return (
      `${label}on${live.url ? ` — running at ${live.url}` : ''}` +
      '; /spec-live main to restore main'
    )
  }
  if (live.state === 'held') return `${label}held — ${live.reason}`
  return `${label}off — /spec-live to put it live`
}

// --- stateful detection (glob matching) -----------------------------------

// True when any file path matches any of the migration globs. Empty patterns or
// no files → false (nothing configured / nothing changed).
function migrationsHit(files, patterns) {
  if (!Array.isArray(files) || !files.length) return false
  if (!Array.isArray(patterns) || !patterns.length) return false
  const res = patterns.map(globToRegExp)
  return files.some((f) => res.some((r) => r.test(f)))
}

// Lockfiles/manifests whose change means a dev server needs a restart, not HMR.
// Always checked, so a project whose `when` globs name only (say) a schema file
// keeps the warning it had before those globs existed.
const DEPS_RE = /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/

// True when the branch changes a dependency manifest: the npm set above, or any
// file a `setup` entry's `when` globs name. Those globs are the project saying
// "this file changing means setup must re-run" — a .csproj, a go.mod — and a
// change that needs setup re-run needs the running app restarted for the same
// reason. Reading them keeps the engine ignorant of what stack it is in.
function depsChanged(files, setupTriggers) {
  if (!Array.isArray(files) || !files.length) return false
  const globs = (Array.isArray(setupTriggers) ? setupTriggers : []).flatMap((t) =>
    t && Array.isArray(t.when) ? t.when : [],
  )
  const res = globs.map(globToRegExp)
  return files.some((f) => DEPS_RE.test(f) || res.some((r) => r.test(f)))
}

// One reminder per `reload: "restart"` dev entry — an IDE-hosted app sees the
// branch switch on disk but runs the old build until someone restarts it.
function restartReminders(names, when) {
  return names.map((name) => `restart ${name} ${when} — it does not hot-reload`)
}

// `live.afterSwitch` decided for one switch, to run in the primary checkout.
// Anything but a list in `changedFiles` is an unknown range — a caller that
// did not supply it said nothing about what changed.
function afterSwitchFor(config, c) {
  const raw = config && config.live ? config.live.afterSwitch : []
  const range = Array.isArray(c.changedFiles) ? c.changedFiles : null
  return planTriggered(raw, c.primaryPath, range)
}

// --- take planner ---------------------------------------------------------

/**
 * Pure planner for `spec-env live take`. Validates the preconditions for putting
 * a spec live on the running instance by branch-switch, and returns either a
 * structured refusal or the ordered git steps + the receipt to write. All git /
 * port state is probed by the CLI and passed in `ctx`, keeping this deterministic
 * and unit-testable with no live git.
 *
 * ctx:
 *   primary        { onBase, branch, baseBranch } — the guard result for the primary checkout
 *   primaryPath    absolute path of the primary checkout (the checkout target)
 *   inFlight       string|null — folder of the spec holding the primary, from
 *                  its receipt; null when nothing is recorded (a hand-switched
 *                  branch), which degrades the message to the branch name
 *   clean          boolean — primary checkout working tree is clean
 *   worktreeClean  boolean — the SPEC WORKTREE's tree is clean (the rebase runs there)
 *   worktreeExists boolean — the spec's worktree is on disk
 *   base           resolved base branch name (the workbench release returns to)
 *   rebaseOnto     the rebase target — `<remote>/<base>` under PR landing,
 *                  else omitted, meaning `base`
 *   rebaseNote     string|null — why the target fell back to local base
 *   baseMainCommit primary HEAD before the switch (receipt / crash recovery)
 *   serverUp       true | false | null — null = no canonical ports declared → no gate
 *   canonicalPorts number[] — declared canonical (frontPort) ports of the HOT
 *                  dev entries, for messages
 *   restartApps    string[] — names of `reload: "restart"` dev entries; never
 *                  probed, each named in a restart reminder instead
 *   migrationsHit  boolean — the branch diff touches configured migration globs
 *   depsChanged    boolean — the branch diff touches a lockfile/manifest (→ warn)
 *   changedFiles   string[] — the files `onto...branch` changes, or anything
 *                  else (null) when git would not say: decides `afterSwitch`
 *   holder,heldSince receipt provenance (injected by the CLI; no Date.now here)
 *
 * @returns {object} { blocked, reason, commands, warnings, receipt, base, branch,
 *   worktreePath, afterSwitch } — `afterSwitch` is `config.live.afterSwitch`
 *   decided against `changedFiles`, to run in the primary checkout after the
 *   checkout; empty on a refusal, since nothing switched.
 */
function planTake(spec, config, ctx) {
  const c = ctx || {}
  const branch = spec.branch
  const base = c.base
  const result = {
    blocked: false,
    reason: null,
    commands: [],
    warnings: [],
    receipt: null,
    base,
    onto: c.rebaseOnto || base,
    branch,
    worktreePath: spec.worktreePath,
    afterSwitch: noTriggered(),
  }
  /**
   * A refusal, and — only where one exists — the way out of it.
   *
   * AN OFFER IS DECLARED HERE OR NOWHERE. A caller that raises a picker from a
   * refusal is reading this field, never re-deciding from the reason text: the
   * one boundary that matters is that work which is not the operator's must
   * never be offered up (a workbench another spec holds is theirs to free), and
   * a rule in prose is not what should be holding that line.
   *
   * ABSENT STAYS ABSENT. A refusal with no way out carries no `offer` key at
   * all, so every existing consumer sees exactly the shape it saw before.
   *
   * @param {string} reason   what is wrong, unchanged
   * @param {object} [offer]  { kind: 'satisfy'|'bypass', label, command }
   */
  const block = (reason, offer) => ({
    ...result,
    blocked: true,
    reason,
    ...(offer ? { offer } : {}),
  })

  // 1. The lock: the primary checkout must be on base (free). Off-base → a spec
  //    (or you) already holds the live instance.
  if (!c.primary || !c.primary.onBase) {
    const on = c.primary && c.primary.branch ? c.primary.branch : '(detached)'
    // Name the SPEC, not just the branch, and name every way out. `/spec-start`
    // relays this refusal verbatim as its gate, so whatever is missing here is
    // missing from the operator's only explanation of why they are stuck —
    // "release it with /spec-live main" alone reads as the sole option when
    // completing or cancelling the held spec are usually the ones they want.
    const held = c.inFlight ? `${c.inFlight} (branch ${on})` : on
    return block(
      `primary checkout is on ${on}, not ${base} — ${held} already holds it. ` +
        'Free the workbench first: `/spec-complete` if it is finished, ' +
        '`/spec-cancel` if it is not wanted, or `/spec-live main` to park it',
    )
  }
  // 2. Never switch a dirty tree — the checkout is reset back to base on release.
  if (!c.clean) {
    return block('primary checkout has uncommitted changes — commit or stash them first')
  }
  // 3. Need a worktree holding the branch to detach and hand over.
  if (!c.worktreeExists) {
    return block(`${spec.folder} has no worktree — run \`/spec-start ${spec.folder}\` first`)
  }
  // 3b. The WORKTREE's own tree, not the primary checkout's. Check 2 above reads
  //     the checkout we switch INTO; the rebase runs in the worktree, and git
  //     refuses to rebase over uncommitted changes. Checking only the primary
  //     let a dirty worktree through to fail at the rebase, where the failure
  //     was then reported as a merge conflict — a wrong cause for a real
  //     problem, which is worse than no message. Validate the tree the
  //     operation actually touches.
  if (c.worktreeClean === false) {
    return block(
      `${spec.folder}'s worktree has uncommitted changes — commit or stash them in ` +
        `${spec.worktreePath} first (the rebase cannot run over them)`,
      // SATISFYING THE GUARD, not stepping past it. Committing the phase is the
      // precondition `live take` is asking for, so doing it weakens nothing and
      // needs no record — which is what separates this from a `bypass`.
      //
      // Offered for the WORKTREE's tree and never for the primary checkout's
      // (check 2 above): that one holds whatever the operator happens to have
      // open, not this spec's phase work, and committing it under this spec's
      // ticket is the mis-stamping `commit-trailers.md` exists to prevent.
      { kind: 'satisfy', label: 'Commit first, then go live', command: '/commit' },
    )
  }
  // 4. A hotfix is built on an old release tag; checking its branch out under the
  //    running dev server risks schema/DB drift breaking the shared instance.
  //    Always refuse, regardless of Stack — test it in isolation via /spec-connect.
  if (spec.type === 'hotfix') {
    return block(
      `${spec.folder} is a hotfix (built on an old release tag) — live overlay ` +
        'could break the running instance; use `/spec-connect` to test it in isolation',
    )
  }
  // 5. v1 is code-only: refuse a stateful spec (Stack: worktree + docker)…
  if (spec.stack === 'docker') {
    return block(
      `${spec.folder} is stateful (Stack: worktree + docker) — live overlay is ` +
        'code-only; use `/spec-connect` for a Docker-backed spec',
    )
  }
  // 6. …and refuse a branch that changes migrations (would mutate the shared DB).
  if (c.migrationsHit) {
    return block(
      `${spec.folder}'s branch changes migrations — live overlay is code-only; ` +
        'use `/spec-connect`',
    )
  }
  // 7. Verify-only: a dev server must be listening to hot-reload the switch.
  if (c.serverUp === false) {
    return block(
      `no dev server listening on canonical port(s) ${(c.canonicalPorts || []).join(', ')} — ` +
        'start your dev server (or `skitterspec spec-env dev up`) first',
    )
  }

  const warnings = []
  const restartApps = Array.isArray(c.restartApps) ? c.restartApps : []
  if (c.depsChanged) {
    warnings.push('dependencies changed on this branch — restart your dev server after the switch')
  }
  // An app that restarts rather than hot-reloads is the operator's to restart,
  // so its absence from the ports is the normal state — the IDE is closed, or
  // will be restarted anyway — and "nothing to hot-reload" would only mislead.
  if (c.serverUp === null && !restartApps.length) {
    warnings.push('no canonical dev ports configured — nothing to hot-reload; switching anyway')
  }
  warnings.push(...restartReminders(restartApps, 'after the switch'))
  if (c.rebaseNote) warnings.push(c.rebaseNote)

  return {
    ...result,
    commands: [
      `git -C ${shellPath(spec.worktreePath)} rebase ${c.rebaseOnto || base}`,
      `git -C ${shellPath(spec.worktreePath)} switch --detach`,
      `git -C ${shellPath(c.primaryPath)} checkout ${branch}`,
    ],
    warnings,
    afterSwitch: afterSwitchFor(config, c),
    receipt: {
      spec: spec.folder,
      branch,
      holder: c.holder,
      heldSince: c.heldSince,
      baseMainCommit: c.baseMainCommit,
    },
  }
}

// --- release planner ------------------------------------------------------

/**
 * Pure planner for `spec-env live release` — hand the running instance back to
 * base and re-isolate the spec's branch into its worktree (the graceful exit of
 * an unfinished session). All git state is probed by the CLI and passed in.
 *
 * In the branch-switch model `take` never moves the base ref, so release is just
 * `checkout base` (frees the branch) then re-attach it to the worktree — no reset.
 *
 * ctx: { primary:{onBase,branch}, primaryPath, base, clean, worktreeExists, restartApps,
 *        changedFiles }
 * `changedFiles` is `base...branch` — the same files take brought in, which the
 * switch back reverts, so `afterSwitch` is decided against the same set.
 * @returns {object} { blocked, noop, reason, commands, warnings, clears, base, branch,
 *   worktreePath, afterSwitch }
 */
function planRelease(spec, config, ctx) {
  const c = ctx || {}
  const branch = spec.branch
  const base = c.base
  const result = {
    blocked: false,
    noop: false,
    reason: null,
    commands: [],
    warnings: [],
    clears: false,
    base,
    branch,
    worktreePath: spec.worktreePath,
    afterSwitch: noTriggered(),
  }

  // Nothing live — the primary checkout is already on base.
  if (c.primary && c.primary.onBase) {
    return { ...result, noop: true, reason: `nothing is live — the primary checkout is on ${base}` }
  }
  // A different spec holds the instance.
  if (c.primary && c.primary.branch !== branch) {
    return {
      ...result,
      blocked: true,
      reason: `the live spec is ${c.primary.branch}, not ${branch} — release that one`,
    }
  }
  // Fixes made while live must be committed to the branch first (never discarded).
  if (!c.clean) {
    return {
      ...result,
      blocked: true,
      reason: `primary checkout has uncommitted changes — commit your fixes to ${branch} first`,
    }
  }

  const commands = [`git -C ${shellPath(c.primaryPath)} checkout ${base}`]
  if (c.worktreeExists) commands.push(`git -C ${shellPath(spec.worktreePath)} switch ${branch}`)
  const warnings = restartReminders(Array.isArray(c.restartApps) ? c.restartApps : [], `on ${base}`)
  return { ...result, commands, warnings, clears: true, afterSwitch: afterSwitchFor(config, c) }
}

// --- abort planner --------------------------------------------------------

/**
 * Pure planner for `spec-env live abort` — crash recovery. Works from the receipt
 * (not a resolved spec), so it recovers even when the spec folder can't be found.
 * Conservative: it refuses to discard uncommitted work, and won't force anything
 * without a receipt to tell it what "live" was.
 *
 * Like release, recovery is `checkout base` + re-isolate — no `reset --hard`:
 * branch-switch never moved base, and resetting to the receipt's recorded commit
 * would discard any legitimate advance of base. `baseMainCommit` stays a record.
 *
 * ctx: { receipt, primary:{onBase,branch}, primaryPath, base, clean, worktreeExists, worktreePath }
 * @returns {object} { blocked, noop, reason, commands, clears, base, branch }
 */
function planAbort(config, ctx) {
  const c = ctx || {}
  const base = c.base
  const result = { blocked: false, noop: false, reason: null, commands: [], clears: false, base, branch: null }

  if (!c.receipt) {
    if (c.primary && c.primary.onBase) {
      return { ...result, noop: true, reason: `nothing is live — the primary checkout is on ${base}` }
    }
    const on = c.primary && c.primary.branch ? c.primary.branch : '(detached)'
    return {
      ...result,
      blocked: true,
      reason:
        `no live receipt, but the primary checkout is on ${on} — no recorded base ` +
        `to restore; check out ${base} manually once you're sure it's safe`,
    }
  }

  // Receipt present. Never discard uncommitted work — surface it instead.
  if (!c.clean) {
    return {
      ...result,
      blocked: true,
      reason:
        'the primary checkout has uncommitted changes that abort would discard — ' +
        'commit or stash them (or resolve manually) first',
    }
  }

  const branch = c.receipt.branch
  const commands = []
  if (!(c.primary && c.primary.onBase)) commands.push(`git -C ${shellPath(c.primaryPath)} checkout ${base}`)
  if (c.worktreeExists) commands.push(`git -C ${shellPath(c.worktreePath)} switch ${branch}`)
  return { ...result, commands, clears: true, branch }
}

// --- after-switch runner --------------------------------------------------

// How much of a failed command's output to show — enough to see why, not a
// whole install log in a report that is relayed verbatim.
const FAIL_TAIL = 20

/**
 * Run a plan's `afterSwitch` commands in order, in its `cwd` (the primary
 * checkout), and return the lines that report them. The ENGINE runs these,
 * unlike `afterLand`: `/spec-live` and the page's live action are pre-executed
 * with no caller turn to run anything after them.
 *
 * Output is CAPTURED, not streamed — the report is relayed verbatim, so a full
 * install log would bury it. Only a failure shows output, and only its tail.
 *
 * STOPS AT THE FIRST FAILURE AND NEVER UNDOES THE SWITCH. Rolling the branch
 * back over a failed install would hide the cause and swap one broken tree for
 * another; the operator is told what failed and what did not run.
 *
 * An empty list returns no lines at all, so a project without the key prints
 * exactly what it printed before the key existed.
 *
 * @param {object} afterSwitch  a planner's `afterSwitch` ({ cwd, commands, entries, range })
 * @param {function} [spawn]    spawnSync-shaped, injectable for tests
 * @returns {{ lines: string[], failed: boolean }}
 */
function runAfterSwitch(afterSwitch, spawn = spawnSync) {
  const entries = afterSwitch && Array.isArray(afterSwitch.entries) ? afterSwitch.entries : []
  if (!entries.length) return { lines: [], failed: false }
  const cwd = afterSwitch.cwd
  const toRun = entries.filter((e) => e.decision !== 'skipped')
  const skipped = entries.filter((e) => e.decision === 'skipped')
  const width = Math.max(...entries.map((e) => e.run.length))
  // A shell COMMENT for the reason, as `afterLand` prints it, so a line copied
  // out of the report is still one command.
  const why = (e) =>
    e.decision === 'matched' ? `   # ${e.matched} changed` : e.decision === 'unknown' ? '   # range unknown' : ''
  const lines = []
  let failed = false

  if (!toRun.length) {
    lines.push(`  after switch (in ${cwd}): nothing to run.`)
  } else {
    lines.push(`  after switch (in ${cwd}):`)
    for (let i = 0; i < toRun.length; i++) {
      const e = toRun[i]
      const res = spawn(e.run, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
      if (!res.error && res.status === 0) {
        lines.push(`    ran:  ${why(e) ? e.run.padEnd(width) + why(e) : e.run}`)
        continue
      }
      failed = true
      const status = res.error ? res.error.message : res.signal ? `signal ${res.signal}` : `exit ${res.status}`
      lines.push(`  ! after switch: ${e.run} failed (${status}) — the switch stands; fix it in ${cwd}`)
      // Joined on a newline: stdout without a trailing one would otherwise run
      // its last line into stderr's first.
      const output = `${res.stdout || ''}\n${res.stderr || ''}`.split('\n').filter((l) => l.trim())
      for (const l of output.slice(-FAIL_TAIL)) lines.push(`      ${l}`)
      for (const rest of toRun.slice(i + 1)) lines.push(`    not run:  ${rest.run}`)
      break
    }
  }
  if (toRun.some((e) => e.decision === 'unknown')) {
    lines.push("  the switch's changed files are unknown here, so the conditional entries run.")
  }
  if (skipped.length) {
    lines.push('  skipped (nothing in the switch matched):')
    for (const e of skipped) lines.push(`    ${e.run.padEnd(width)}   # when ${e.when.join(', ')}`)
  }
  return { lines, failed }
}

module.exports = {
  runAfterSwitch,
  receiptPath,
  renderReceipt,
  readReceipt,
  writeReceipt,
  clearReceipt,
  lastLivePath,
  readLastLive,
  writeLastLive,
  clearLastLive,
  summarizeReceipt,
  globToRegExp,
  migrationsHit,
  depsChanged,
  planTake,
  planRelease,
  planAbort,
  liveStateFor,
  liveStateLine,
}
