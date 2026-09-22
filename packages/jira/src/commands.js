'use strict'

/**
 * The commands this provider distribution adds on top of the base CLI.
 *
 * ONE table drives both routing and `--help`, exactly as the Linear provider's
 * does: anything added here is routed and documented in the same edit, so the
 * two cannot drift.
 *
 * `run(rest)` returns an exit code (the bin propagates it); `summary` is the
 * one-line description `--help` prints.
 */

const { specSync } = require('./cli-sync.js')

const DIST = '@skitterbyte/skitterspec-jira'

const PROVIDER_COMMANDS = {
  'spec-sync': {
    run: specSync,
    usage: 'skitterspec spec-sync <cmd>',
    summary:
      'One-way sync to Jira Cloud (repo -> tracker; opt-in, needs\n' +
      'specs/.core/jira.config.json). Run it with no args to\n' +
      'list its subcommands.',
  },
}

// The `--help` section for these commands, in the base HELP's column layout:
// two-space indent, description starting at column 30, continuations aligned.
const COL = 30

function providerHelpSection() {
  const lines = [`Provider commands (${DIST}):`]
  for (const name of Object.keys(PROVIDER_COMMANDS)) {
    const { usage, summary } = PROVIDER_COMMANDS[name]
    const [first, ...rest] = summary.split('\n')
    lines.push(`  ${usage.padEnd(COL - 2)}${first}`)
    for (const line of rest) lines.push(`${' '.repeat(COL)}${line}`)
  }
  return lines.join('\n') + '\n'
}

module.exports = { PROVIDER_COMMANDS, providerHelpSection, DIST }
