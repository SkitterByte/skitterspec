#!/usr/bin/env node
'use strict'

/**
 * Run compaction — the harness half of feat-autonomous-run's context record.
 *
 * An autonomous run builds every phase in one session, and nothing lets the
 * agent read its own context usage — so instead of a "pause at N%" that could
 * not be built honestly, a compaction is made SAFE (each phase re-reads the
 * spec and git) and VISIBLE: this `PreCompact` hook tells the engine, which
 * notes it against the phase being built, and the run's final report says
 * "compacted 2×, during phases 3 and 5".
 *
 * THIS SCRIPT DECIDES NOTHING, and it can never stop a compaction. It hands
 * the session's directory to `spec-env run compacted`, which writes only when
 * a run is active there and is silent on every cannot-tell. No engine, an
 * unreadable payload, no run, a crash of its own — every path exits 0 and
 * prints nothing, because a compaction hook that speaks or fails would be
 * noise on every session that is not an autonomous run, which is nearly all
 * of them.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function done() {
  process.exit(0)
}

function readPayload() {
  try {
    const parsed = JSON.parse(fs.readFileSync(0, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
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

function main() {
  const payload = readPayload()
  if (!payload) done()
  // Only a compaction. A hook reached on some other event stays inert.
  if (payload.hook_event_name && payload.hook_event_name !== 'PreCompact') done()
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const engine = engineCommand(cwd)
  // Output discarded on purpose: the record is the engine's, and the session
  // that is compacting has nothing to act on.
  spawnSync(engine.file, [...engine.args, 'spec-env', 'run', 'compacted', '--dir', cwd], {
    cwd,
    encoding: 'utf8',
    timeout: 8000,
  })
  done()
}

if (require.main === module) {
  try {
    main()
  } catch {
    done()
  }
}

module.exports = { findEngine, locateEngine, engineCommand }
