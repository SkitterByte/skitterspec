#!/usr/bin/env node
'use strict'

/**
 * Project guard — the harness half.
 *
 * A session belongs to the project it was started in. The skills say so, and a
 * skill is prose: a report that ends on another repo's `/spec-complete` reads
 * as an instruction, and nothing in prose stops a session `cd`-ing over there
 * and doing it. So the rule is also enforced one level down, where a write or a
 * shell command is a tool call the harness has to ask about first.
 *
 * WHAT IT GUARDS: a write tool whose path lands in another skitterspec project,
 * and a Bash command that runs `git` (to change something) or the engine there.
 * Reads, and every other program, pass.
 *
 * THIS SCRIPT DECIDES NOTHING. It hands the call to `spec-env project check`
 * and turns one exit status into an answer, for `main-guard.cjs`'s reason: a
 * hook with its own opinions is a second implementation nothing can test.
 *
 * HOME IS THIS SCRIPT'S PROJECT, NOT THE SESSION'S DIRECTORY. `cwd` is wherever
 * the session has `cd`-ed to — which is exactly the thing being judged — so the
 * project this hook was installed into is the one the session belongs to.
 *
 * IT FAILS OPEN, EVERYWHERE: no engine, an unreadable payload, a crash, a
 * timeout. Being wrong the permissive way costs one act the skills also warn
 * against; being wrong the other way stops ordinary work with no reason given.
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function allow() {
  process.exit(0)
}

// The JSON route rather than exit-2, so the reason reaches Claude — who has to
// act on it by leaving the work to a session in that project.
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
    const parsed = JSON.parse(fs.readFileSync(0, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

// Identical to `main-guard.cjs`'s, deliberately — see the reasons there.
const ENGINES = ['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards']

function findEngine(projectDir, platform = process.platform) {
  if (process.env.SKITTERSPEC_BIN) return process.env.SKITTERSPEC_BIN
  let at = projectDir
  for (let i = 0; i < 6 && at; i++) {
    for (const name of ENGINES) {
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
  return 'skitterspec'
}

function engineCommand(projectDir, platform = process.platform) {
  const engine = findEngine(projectDir, platform)
  return /\.[cm]?js$/i.test(engine) ? { file: process.execPath, args: [engine] } : { file: engine, args: [] }
}

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

function writeTarget(input) {
  if (!input || typeof input !== 'object') return null
  for (const key of ['file_path', 'notebook_path']) {
    if (typeof input[key] === 'string' && input[key]) return input[key]
  }
  return null
}

// A command that cannot be one the guard is about — no git, no engine — is let
// through without starting the engine at all. This hook fires on every Bash
// call, and most of them are neither.
function mayConcern(command) {
  return /\bgit\b|skitterspec/.test(command)
}

// Inside the home checkout itself: certainly home, no engine needed. A
// worktree lives elsewhere, so a path outside this is still asked about.
function insideHome(home, target) {
  const rel = path.relative(home, path.resolve(home, target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isRefusal(stdout) {
  return /^spec-env project: /m.test(stdout || '')
}

function homeDir() {
  // `${CLAUDE_PROJECT_DIR}` is the project the harness started in; the script's
  // own location is the same answer when it is not set.
  return process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..')
}

function main() {
  const payload = readPayload()
  if (!payload) allow()

  const home = homeDir()
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd()
  const session = typeof payload.session_id === 'string' ? payload.session_id : ''
  const argv = ['spec-env', 'project', 'check', '--dir', home, '--cwd', cwd]

  if (WRITE_TOOLS.has(payload.tool_name)) {
    const target = writeTarget(payload.tool_input)
    if (!target || insideHome(home, path.resolve(cwd, target))) allow()
    argv.push('--path', path.resolve(cwd, target))
  } else if (payload.tool_name === 'Bash') {
    const command = payload.tool_input && payload.tool_input.command
    if (typeof command !== 'string' || !mayConcern(command)) allow()
    argv.push('--command', command)
  } else {
    allow()
  }
  if (session) argv.push('--session', session)

  const engine = engineCommand(home)
  const result = spawnSync(engine.file, [...engine.args, ...argv], { cwd: home, encoding: 'utf8', timeout: 8000 })
  if (result.error || result.status !== 1) allow()
  // Exit 1 alone is a crash as often as a refusal; the printed line decides.
  const said = (result.stdout || '').trim()
  if (!isRefusal(said)) allow()
  deny(said)
}

if (require.main === module) {
  try {
    main()
  } catch {
    allow()
  }
}

module.exports = { findEngine, engineCommand, WRITE_TOOLS, writeTarget, mayConcern, insideHome, isRefusal }
