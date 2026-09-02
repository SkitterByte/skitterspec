'use strict'

/**
 * `--help` must name every command the distribution actually routes.
 *
 * The bug: the bin routed `spec-sync` while delegating `--help` to the base CLI,
 * whose HELP const cannot know what a provider adds. So the ONE distribution
 * shipping `spec-sync` told users it did not exist — and the base's bare
 * "unknown command: spec-sync" read as "no such feature", naming nothing that
 * had it. Both halves stranded a user; these tests pin both.
 *
 * The first test is the invariant, not an example: it derives its expectations
 * from PROVIDER_COMMANDS, so a command added there without help text fails here.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec-linear.js')
const BASE_BIN = path.join(__dirname, '..', '..', 'common', 'bin', 'skitterspec.js')
const { PROVIDER_COMMANDS } = require('../src/commands.js')

const run = (bin, argv, cwd) =>
  spawnSync(process.execPath, [bin, ...argv], { encoding: 'utf-8', cwd })

for (const trigger of [[], ['--help'], ['-h']]) {
  const label = trigger.length ? trigger[0] : 'no arguments'
  test(`${label} lists every routed provider command`, () => {
    const { stdout, status } = run(BIN, trigger)
    assert.strictEqual(status, 0)
    for (const name of Object.keys(PROVIDER_COMMANDS)) {
      assert.match(stdout, new RegExp(name), `help names ${name}`)
    }
    // …and still carries the base's own commands, since it is a superset.
    for (const base of ['init', 'update', 'spec-env']) {
      assert.match(stdout, new RegExp(`skitterspec ${base}`), `help keeps ${base}`)
    }
  })
}

test('a provider command still handles its own --help, not the top-level one', () => {
  // Regression: matching `--help` anywhere in argv swallowed `spec-sanitise
  // --help` and printed the top-level help instead of the command's usage.
  const { stdout } = run(BIN, ['spec-sanitise', '--help'])
  assert.match(stdout, /spec-sanitise \[paths/, "reaches the command's own usage")
  assert.doesNotMatch(stdout, /Provider commands \(/, 'not the top-level section')
})

test('every documented command is reachable, not just listed', () => {
  // Help that lists a command the bin cannot route would be the same bug
  // inverted, so prove routing from the same table. Run from an empty dir:
  // `spec-sanitise` defaults to scanning `specs/`, and a test has no business
  // walking the real corpus.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-help-'))
  try {
    for (const name of Object.keys(PROVIDER_COMMANDS)) {
      const { stdout, stderr } = run(BIN, [name], empty)
      assert.doesNotMatch(
        stdout,
        /Provider commands \(/,
        `${name} routes to itself, not the top-level help`,
      )
      assert.ok(`${stdout}${stderr}`.trim().length, `${name} produced output`)
    }
  } finally {
    fs.rmSync(empty, { recursive: true, force: true })
  }
})

// --- the base distribution's half -------------------------------------------

test('the base names the distribution that ships a provider command', () => {
  const { stderr, status } = run(BASE_BIN, ['spec-sync', 'status', 'x'])
  assert.notStrictEqual(status, 0, 'still an error')
  assert.match(stderr, /unknown command: spec-sync/, 'still says unknown')
  assert.match(stderr, /@skitterbyte\/skitterspec-linear/, 'names the distribution')
  assert.match(stderr, /superset/, 'says installing it keeps the base commands')
})

test('a genuinely unknown command is unchanged — no distribution to name', () => {
  const { stderr } = run(BASE_BIN, ['wibble'])
  assert.match(stderr, /unknown command: wibble \(try --help\)/)
  assert.doesNotMatch(stderr, /skitterspec-linear/, 'no misleading suggestion')
})

test("the base's own --help stays tracker-free", () => {
  // Naming Linear in an error for a command the user typed is a diagnostic;
  // advertising it in the base's help would make the base look like it ships it.
  const { stdout } = run(BASE_BIN, ['--help'])
  assert.doesNotMatch(stdout, /linear/i)
  assert.doesNotMatch(stdout, /spec-sync/)
})
