#!/usr/bin/env node
'use strict'

/**
 * Main guard — the harness half.
 *
 * `main` is where work **lands**, not where it happens. The skills say so, and
 * a skill is prose: it can be chained past, typed around, or simply not read.
 * So the rule is also enforced one level down, where an `Edit` or a `Write` is
 * a tool call the harness has to ask about first.
 *
 * IT REFUSES THE FIRST WRITE, NOT THE COMMIT, and that is the whole reason it
 * is a different hook from `review-gate.cjs` rather than another branch inside
 * it. Nothing has been written when this fires, so the fix costs one command —
 * `/no-spec <name>` and carry on. A commit-time gate fires once the work
 * already exists in the primary checkout, and in worktree mode moving it is the
 * genuinely painful part: the primary checkout cannot `switch -c` out from
 * under the other worktrees.
 *
 * THIS SCRIPT DECIDES NOTHING. It reads the tool call, hands the directory to
 * `spec-env main check`, and turns one exit status into an answer. Every
 * judgement — is isolation configured, is this the primary checkout, is HEAD
 * the base branch, is an allow in force — lives in the engine, where it is unit
 * tested. A hook with its own opinions is a second implementation that nothing
 * can test and nobody remembers to update.
 *
 * IT FAILS OPEN, EVERYWHERE, for the same reasons `review-gate.cjs` does and
 * with more at stake, because this one fires far more often. No engine, an
 * unreadable payload, a repo with no isolation, a crash of its own — all of
 * them allow the write. Being wrong the permissive way costs one edit on a rule
 * the skills also carry; being wrong the other way costs someone their work
 * with no idea why (`.claude/rules/negative-checks.md`).
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Let the call through, saying nothing. Exit 0 with no JSON is "no opinion" —
// the tool proceeds exactly as if this hook did not exist, which is what the
// overwhelming majority of invocations must do.
function allow() {
  process.exit(0)
}

/**
 * Refuse, and say what to do instead.
 *
 * The JSON route rather than exit-2, because the reason reaches **Claude** —
 * which is who has to act on it, by moving the work rather than by asking the
 * user to switch the guard off. The exits are named in the refusal itself.
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
 * existence check. Identical to `review-gate.cjs`'s, deliberately: a hook
 * process does not inherit a package manager's `node_modules/.bin` on PATH, so
 * the local install is looked for by path first — walking up from the project,
 * because a git worktree's checkout has its own `node_modules`.
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

// The tools that write a file. A matcher is configured too, but a hook that is
// reached some other way must still be inert rather than guessing.
//
// WHAT WOULD FOOL THIS: a write that does not go through a write TOOL — a shell
// heredoc, `sed -i`, an editor outside the session. Those are left unguarded on
// purpose. Covering them would mean parsing arbitrary shell for filesystem
// effects, which cannot be done reliably, and the failure mode of getting it
// wrong is refusing a command that has nothing to do with writing files. The
// skills carry the rule for everything this matcher cannot see.
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

// The path a write tool names: `file_path` for Edit, Write and MultiEdit,
// `notebook_path` for NotebookEdit. Anything else is no path at all.
function writeTarget(input) {
  if (!input || typeof input !== 'object') return null
  for (const key of ['file_path', 'notebook_path']) {
    if (typeof input[key] === 'string' && input[key]) return input[key]
  }
  return null
}

// The engine's own refusal line, from `spec-env main check`. Pure.
//
// WHAT WOULD FOOL THIS: an engine that crashes after printing that line. The
// refusal is the last thing `check` writes, so a crash before it prints nothing
// — and one after it has already decided.
function isRefusal(stdout) {
  return /^spec-env main: /m.test(stdout || '')
}

function main() {
  const payload = readPayload()
  if (!payload) allow()

  if (!WRITE_TOOLS.has(payload.tool_name)) allow()

  // A worktree is its own checkout, and only the primary one is this guard's
  // business. `cwd` is where the session stands; the target below is where the
  // write lands, and the engine prefers it.
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const session = typeof payload.session_id === 'string' ? payload.session_id : ''

  const argv = ['spec-env', 'main', 'check', '--dir', cwd]
  if (session) argv.push('--session', session)
  // The FILE decides where the write lands, not the session's directory. Judged
  // on `cwd` alone, a session on the base branch was refused its own scratchpad
  // under /tmp, and a session in a worktree could write into the primary
  // checkout unseen. No path in the payload → the engine judges `cwd`, as before.
  const target = writeTarget(payload.tool_input)
  if (target) argv.push('--path', target)

  const engine = engineCommand(cwd)
  const result = spawnSync(engine.file, [...engine.args, ...argv], { cwd, encoding: 'utf8', timeout: 8000 })

  // No engine, a crash, a timeout — all cannot-tell. `status` is null when the
  // process never ran or was killed, and neither is a refusal.
  unreachable('main-guard', engine, result)
  if (result.error || result.status === null) allow()
  if (result.status !== 1) allow()

  // EXIT 1 ALONE IS NOT A REFUSAL. Node exits 1 on an uncaught exception, so an
  // engine that cannot even load looks exactly like one refusing — and read
  // that way it denied every Edit and Write in the session. The positive signal
  // is the refusal the engine PRINTS; a crash prints nothing on stdout.
  const said = (result.stdout || '').trim()
  if (!isRefusal(said)) allow()

  deny(said)
}

// Guarded so the pieces above can be required and tested without the script
// reading stdin and exiting.
if (require.main === module) {
  try {
    main()
  } catch {
    // Even a bug in this file lets the write through.
    allow()
  }
}

module.exports = { findEngine, locateEngine, engineCommand, WRITE_TOOLS, writeTarget, isRefusal }
