'use strict'

/**
 * Completion checks — the project's own end-of-spec questions, run by
 * `spec-env checks` for `/spec-complete` before it lands (`complete.checks`).
 *
 * ADVISORY, ALWAYS. A check reports and never refuses: a command that exits
 * non-zero is `failed`, the next still runs, and the verb exits 0. A check that
 * stopped a land would be the counting gate this workflow rejects, and what a
 * check prints is a reason to look again, not proof of a fault.
 *
 * Every side effect goes through `io`, so the tests drive it with a fake spawn.
 */

const { spawnSync } = require('node:child_process')

/**
 * Run each command in `cwd`, in order, capturing its output.
 * Returns `[{ command, status: 'ok' | 'failed', exit, output }]`.
 */
function runChecks(commands, { cwd, spawn = spawnSync } = {}) {
  const results = []
  for (const command of commands) {
    const res = spawn(command, { cwd, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const output = [res.stdout, res.stderr].filter(Boolean).join('').replace(/\s+$/, '')
    if (res.error) {
      results.push({ command, status: 'failed', exit: null, output: res.error.message })
      continue
    }
    const exit = res.status === null ? null : res.status
    results.push({ command, status: exit === 0 ? 'ok' : 'failed', exit, output })
  }
  return results
}

/** The text report: one block per command, its output indented beneath. */
function formatChecks(spec, results) {
  if (!results.length) return `spec-env checks: ${spec} — no completion checks configured`
  const failed = results.filter((r) => r.status === 'failed').length
  const lines = [`spec-env checks: ${spec} — ${results.length} check(s), ${failed} failed (advisory — never blocks a land)`]
  for (const r of results) {
    const state = r.status === 'ok' ? 'ok' : `failed (${r.exit === null ? 'did not run' : `exit ${r.exit}`})`
    lines.push('', `  ${state} · ${r.command}`)
    for (const l of (r.output || '').split('\n')) if (l) lines.push(`    ${l}`)
  }
  return lines.join('\n')
}

module.exports = { runChecks, formatChecks }
