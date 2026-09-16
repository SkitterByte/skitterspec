'use strict'

/**
 * `--help` lists every `spec-env` verb the dispatcher handles, and no others.
 *
 * `live` and `stage` were both absent from the help while working perfectly,
 * appearing in the dispatcher's own usage line, and — for `live` — carrying a
 * shipped `/spec-live` command. They went missing separately, months apart,
 * which is what makes this a missing constraint rather than two slips. An
 * undocumented verb reads as a removed one, and the reader's next move is to
 * stop using it.
 *
 * Three ends, held together by one list:
 *   1. every verb in SPEC_ENV_VERBS is described in HELP
 *   2. HELP describes no spec-env verb that is not in SPEC_ENV_VERBS
 *   3. SPEC_ENV_VERBS matches the `case` labels the dispatcher actually handles
 *
 * (2) is not symmetry for its own sake: a verb documented but not dispatched is
 * the same lie in the other direction, and the reader only finds out by running
 * it. (3) is what makes the other two mean anything — without it the list and
 * the help could agree perfectly while both describing a verb the engine
 * dropped.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { SPEC_ENV_VERBS, HELP } = require('../src/cli.js')

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')

// The `spec-env` block of HELP: from its heading down to the next top-level
// `skitterspec <cmd>` entry. Scoping matters — `status` and `review` are words
// that appear all over the rest of the help.
function specEnvHelpBlock() {
  const start = HELP.indexOf('skitterspec spec-env <cmd>')
  assert.ok(start >= 0, 'HELP has no spec-env section')
  const rest = HELP.slice(start + 1)
  const end = rest.search(/\n {2}skitterspec \S/)
  assert.ok(end >= 0, 'could not find the end of the spec-env section')
  return rest.slice(0, end)
}

// The `case 'x':` labels of the dispatcher's own switch. Scoped to the switch so
// a `case` elsewhere in the file cannot wander in.
function dispatchedVerbs() {
  const start = SOURCE.indexOf('  switch (sub) {')
  assert.ok(start >= 0, 'could not find the spec-env dispatch switch')
  const block = SOURCE.slice(start, SOURCE.indexOf('\n}', start))
  const found = [...block.matchAll(/^    case '([a-z-]+)':/gm)].map((m) => m[1])
  assert.ok(found.length > 5, `expected the switch to hold the verbs, found ${found.length}`)
  return found
}

test('every verb the engine dispatches is described in --help', () => {
  const block = specEnvHelpBlock()
  const missing = SPEC_ENV_VERBS.filter(
    (verb) => !new RegExp(`^ +${verb}\\b`, 'm').test(block),
  )
  assert.deepStrictEqual(missing, [], `--help does not describe: ${missing.join(', ')}`)
})

test('--help describes no spec-env verb the engine does not dispatch', () => {
  // Each described verb starts its own line in the block, at the indent the
  // subcommand column sits at. A continuation line is indented further.
  const described = [...specEnvHelpBlock().matchAll(/^ {32}([a-z-]+)[ <[]/gm)].map((m) => m[1])
  assert.ok(described.length >= SPEC_ENV_VERBS.length, 'the line scan found nothing to check')

  const phantom = [...new Set(described)].filter((v) => !SPEC_ENV_VERBS.includes(v))
  assert.deepStrictEqual(phantom, [], `--help describes verbs nothing handles: ${phantom.join(', ')}`)
})

test('the verb list matches the dispatcher, so adding a case cannot skip the help', () => {
  assert.deepStrictEqual([...SPEC_ENV_VERBS].sort(), dispatchedVerbs().sort())
})

test('the usage line is built from the list, not typed out beside it', () => {
  // The failure this guards is precise: a verb added to the list and the switch,
  // and the usage line left spelling out the old set.
  assert.ok(
    SOURCE.includes("`Usage: skitterspec spec-env <${SPEC_ENV_VERBS.join('|')}>"),
    'the usage line no longer interpolates SPEC_ENV_VERBS',
  )
})

test('review sub-actions are not verbs, and are not expected to be', () => {
  // They are arguments to `review`. Asserting this keeps the two tests above
  // honest: a future reader adding `arm` to SPEC_ENV_VERBS to make a test pass
  // would break this one instead.
  for (const sub of ['serve', 'arm', 'gate', 'skip']) {
    assert.ok(!SPEC_ENV_VERBS.includes(sub), `${sub} is a review sub-action, not a verb`)
  }
})
