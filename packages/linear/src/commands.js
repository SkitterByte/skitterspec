'use strict'

/**
 * The commands this provider distribution adds on top of the base CLI.
 *
 * ONE table drives both routing and `--help`. That pairing is the point: the bug
 * this fixes was `spec-sync` being routed by the bin while the base's `HELP`
 * const knew nothing about it, so the one distribution that ships the command
 * told users it did not exist. Anything added here is routed and documented in
 * the same edit — the two cannot drift, and a test asserts it.
 *
 * `run(rest)` returns an exit code (the bin propagates it); `summary` is the
 * one-line description `--help` prints.
 */

const { specSync } = require('./cli-sync.js')
const { specSanitise } = require('./cli-sanitise.js')

const DIST = '@skitterbyte/skitterspec-linear'

const PROVIDER_COMMANDS = {
  'spec-sync': {
    run: specSync,
    usage: 'skitterspec spec-sync <cmd>',
    summary:
      'One-way sync to Linear (repo -> tracker; opt-in, needs\n' +
      'specs/.core/linear.config.json). Run it with no args to\n' +
      'list its subcommands.',
  },
  'spec-sanitise': {
    run: specSanitise,
    usage: 'skitterspec spec-sanitise',
    summary:
      'Rewrite spec markdown so no emphasis or link straddles a\n' +
      'line break. Dry-run; --write to apply.',
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
