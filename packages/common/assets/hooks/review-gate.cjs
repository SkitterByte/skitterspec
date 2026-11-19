#!/usr/bin/env node
'use strict'

/**
 * Review gate — the harness half.
 *
 * `/spec-next` refuses to build the next phase while a review is owed, but a
 * skill is prose: it can be chained past, typed around, or simply not read. So
 * a phase ending is also enforced one level down, where a `git commit` is a
 * tool call the harness has to ask about first.
 *
 * THIS SCRIPT DECIDES NOTHING. It reads the tool call, hands the command line
 * to `spec-env review gate --check --for-command`, and turns one exit status
 * into an answer. Every judgement — is this a commit, is a verdict owed, is
 * this project even using the gate — lives in the engine, where it is unit
 * tested. A hook with its own opinions is a second implementation that nothing
 * can test and nobody remembers to update.
 *
 * IT FAILS OPEN, EVERYWHERE. No engine on the machine, an unreadable payload, a
 * repo with no isolation, a spec it cannot resolve, a crash of its own — all of
 * them allow the commit. Blocking one is an accusation
 * (`.claude/rules/negative-checks.md`), and the only thing worth accusing on is
 * the engine saying, positively, that this spec owes a verdict. Being wrong the
 * other way costs one unreviewed commit, on a gate the skills also enforce;
 * being wrong this way costs someone their commit with no idea why.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Let the call through, saying nothing. Exit 0 with no JSON is "no opinion" —
// the tool proceeds exactly as if this hook did not exist, which is what almost
// every invocation must do.
function allow() {
  process.exit(0)
}

/**
 * Refuse, and say what would clear it.
 *
 * The JSON route rather than exit-2, because the reason reaches **Claude** —
 * which is who has to act on it. A commit blocked with no route onward is how a
 * gate gets switched off wholesale instead of answered, so the three exits are
 * named in the refusal itself.
 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  )
  process.exit(0)
}

function readPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // Unreadable or unparseable stdin is the cannot-tell case, not evidence.
    return null
  }
}

/**
 * Where the engine is, in the order most likely to be right. Pure but for the
 * existence check.
 *
 * A hook process does not inherit a package manager's `node_modules/.bin` on
 * PATH, so the local install is looked for by path first — walking up from the
 * project, because a git worktree's checkout has its own `node_modules`. PATH
 * is the fallback for a global install, and `SKITTERSPEC_BIN` overrides
 * everything for anyone whose layout is neither.
 */
const ENGINES = ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']

function findEngine(projectDir, platform = process.platform) {
  return locateEngine(projectDir, platform).engine
}

/**
 * `findEngine`, plus the directories it walked up from — which is what a hook
 * names when nothing answered.
 *
 * A GIT WORKTREE IS A SIBLING OF ITS PRIMARY CHECKOUT, not a child of it
 * (`worktree.root` is `../{repo}-wt`), so walking up from one never reaches the
 * primary's `node_modules`. A `--docs` worktree has none of its own, so the
 * primary checkout is asked for second — found through git, never guessed from
 * the folder layout.
 */
function locateEngine(projectDir, platform = process.platform) {
  if (process.env.SKITTERSPEC_BIN) return { engine: process.env.SKITTERSPEC_BIN, tried: [] }
  const tried = [projectDir]
  const local = walkUp(projectDir, platform)
  if (local) return { engine: local, tried }
  const primary = primaryCheckoutDir(projectDir)
  if (primary) {
    tried.push(primary)
    const found = walkUp(primary, platform)
    if (found) return { engine: found, tried }
  }
  return { engine: 'skitterspec', tried }
}

/**
 * Where `projectDir` sits in the checkout its worktree was added from, or null
 * when it is not in a linked worktree.
 *
 * WHAT WOULD FOOL THIS: a git directory kept somewhere else
 * (`--separate-git-dir`, a submodule's `.git/modules/<name>`). Its parent then
 * holds no `node_modules`, so the lookup finds nothing and falls through to
 * PATH exactly as it did before — a wasted look, never a wrong engine.
 */
function primaryCheckoutDir(projectDir) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel', '--git-common-dir'], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 2000,
  })
  if (r.error || r.status !== 0) return null
  const [top, common] = (r.stdout || '').split(/\r?\n/)
  if (!top || !common) return null
  const primary = path.dirname(path.resolve(projectDir, common))
  if (path.resolve(primary) === path.resolve(top)) return null
  // A project in a subfolder of its repo has the same subfolder in the primary.
  // A path that will not map (a symlinked spelling of the same tree) is asked
  // about at the primary's root instead.
  const rel = path.relative(top, projectDir)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? path.join(primary, rel) : primary
}

function walkUp(start, platform) {
  let at = start
  for (let i = 0; i < 6 && at; i++) {
    for (const name of ENGINES) {
      // ON WINDOWS, THE PACKAGE'S OWN JS ENTRY, never `.bin/<name>`. That is a
      // shell shim nothing here can execute (spawn refuses it: EFTYPE), and the
      // `.cmd` beside it needs a shell — which a hook handing a tool's command
      // line over as an argument must never use. Unreachable, the hook failed
      // open, and every guard was silently off on Windows (chore-windows-ci).
      const candidate =
        platform === 'win32'
          ? path.join(at, 'node_modules', '@skitterbyte', name, 'bin', `${name}.js`)
          : path.join(at, 'node_modules', '.bin', name)
      if (fs.existsSync(candidate)) return candidate
    }
    const up = path.dirname(at)
    if (up === at) break
    at = up
  }
  return null
}

// How to run what `findEngine` found: a `.js` engine through this node, since
// Windows cannot execute one directly — anything else as itself, as before.
function engineCommand(projectDir, platform = process.platform) {
  const { engine, tried } = locateEngine(projectDir, platform)
  const command = /\.[cm]?js$/i.test(engine) ? { file: process.execPath, args: [engine] } : { file: engine, args: [] }
  return Object.defineProperty(command, 'tried', { value: tried })
}

// Still open, but not silently: an engine nobody can reach turns this guard off
// for as long as it stays unreachable, and the operator is owed one line saying
// so. Stderr with exit 0 is information, never a decision.
function unreachable(hook, engine, result) {
  if (!result.error || result.error.code !== 'ENOENT') return
  const dirs = engine.tried.length ? engine.tried.join(', ') : '(SKITTERSPEC_BIN)'
  process.stderr.write(
    `${hook}: no skitterspec engine found from ${dirs} or on PATH — this guard is off here; set SKITTERSPEC_BIN to fix\n`,
  )
}

// The engine's own refusal line, from `spec-env review gate --check`. Pure.
//
// WHAT WOULD FOOL THIS: an engine that crashes after printing that line. The
// refusal is written last, after every read has succeeded, so a crash before
// it prints nothing — and one after it has already decided.
function isRefusal(stdout) {
  return /^spec-env review gate: /m.test(stdout || '')
}

function main() {
  const payload = readPayload()
  if (!payload) allow()

  // Only Bash runs a commit. A matcher is configured too, but a hook that is
  // reached some other way must still be inert rather than guessing.
  if (payload.tool_name !== 'Bash') allow()

  const command = payload.tool_input && payload.tool_input.command
  if (typeof command !== 'string' || !command.trim()) allow()

  // The commit's own directory decides which spec this is about — a worktree is
  // its own checkout, and the answer differs per worktree.
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()

  const engine = engineCommand(cwd)
  const result = spawnSync(
    engine.file,
    [...engine.args, 'spec-env', 'review', 'gate', '--check', '--for-command', command, '--dir', cwd],
    { cwd, encoding: 'utf8', timeout: 8000 },
  )

  // No engine, a crash, a timeout — all cannot-tell. `status` is null when the
  // process never ran or was killed, and neither is a refusal.
  unreachable('review-gate', engine, result)
  if (result.error || result.status === null) allow()
  if (result.status !== 1) allow()

  // EXIT 1 ALONE IS NOT A REFUSAL. Node exits 1 on an uncaught exception, so an
  // engine that cannot even load looks exactly like one saying "armed" — and
  // once read that way it denied every Bash call in the session, the operator's
  // own `!` commands included. The positive signal is the refusal the engine
  // PRINTS; a crash prints nothing on stdout, so it allows.
  const said = (result.stdout || '').trim()
  if (!isRefusal(said)) allow()

  deny(
    said +
      '\n\nThis phase is waiting on a verdict. Relay these to the operator ' +
      'rather than choosing one: press a verdict on the page, /spec-reviewed if ' +
      'a pass is already waiting, or /spec-skip "<reason>" to move on with the ' +
      'reason recorded.\n\nAll three are theirs to type. /spec-skip is the same ' +
      'exit as \'skitterspec spec-env review skip "<reason>"\' — a command ' +
      'rather than an incantation, because the long form is what nobody retypes ' +
      'and a gate with an unreachable exit gets switched off wholesale instead ' +
      'of answered.',
  )
}

// Guarded so the pieces above can be required and tested without the script
// reading stdin and exiting.
if (require.main === module) {
  try {
    main()
  } catch {
    // Even a bug in this file lets the commit through.
    allow()
  }
}

module.exports = { findEngine, locateEngine, engineCommand, isRefusal }
