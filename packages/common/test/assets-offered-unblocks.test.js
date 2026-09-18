'use strict'

/**
 * The contract for offering the way out of a refusal.
 *
 * Phases 1 and 2 put the mechanism in the engine — a declared `offer`, and a
 * gate that spends it. This is the half that lives in prose, and it lives in
 * prose for a reason that is worth stating rather than apologising for: the
 * behaviour is a skill reacting to its own refusal, and there is no engine
 * process left to hold it — the thing being refused IS the engine.
 *
 * So everything testable was pushed down. What is left is asserted the only way
 * prose can be: the rule ships, it says the load-bearing things, and the skills
 * point AT it rather than restating it. Two copies of a routing rule is how the
 * two come to disagree.
 *
 * THE COMMANDS ARE ASSERTED UNCHANGED, and that is the point of them being
 * here. `/spec-connect`, `/spec-live` and `/spec-remote-review` keep "Add
 * nothing and run nothing else" and keep their narrow `allowed-tools` — this
 * spec deliberately did not widen them, and a later edit that quietly does
 * should fail here.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const read = (...p) => fs.readFileSync(path.join(ASSETS, ...p), 'utf8')

const RULE = read('rules', 'offered-unblocks.md')
const PLANNING = read('rules', 'spec-planning.md')
const DIFF = read('skills', 'spec-diff', 'SKILL.md')
const NEXT = read('skills', 'spec-next', 'SKILL.md')

const { RULES } = require('../src/init.js')

/* ==========================================================================
 * It ships, and it installs
 * ========================================================================== */

test('the rule is shipped and installed like every other rule', () => {
  assert.ok(RULES.includes('offered-unblocks.md'), 'discovered from the assets tree')
})

test('it defines both kinds, and only one of them is recorded', () => {
  assert.match(RULE, /`satisfy`/)
  assert.match(RULE, /`bypass`/)
  assert.match(RULE, /do what the guard asked for/)
  assert.match(RULE, /step past a guard still unsatisfied/)
})

test('it says relay first, then offer — in that order and never instead', () => {
  assert.match(RULE, /Relay first, then offer/)
  assert.match(RULE, /never instead/)
})

test('it forbids inferring an offer the engine did not declare', () => {
  assert.match(RULE, /Never infer one/)
  // The boundary that matters most, stated where it cannot be re-litigated.
  assert.match(RULE, /work that is not the operator's is never offered up/i)
})

test('it names the three properties the bypass rests on', () => {
  assert.match(RULE, /The operator answers/)
  assert.match(RULE, /The choice is recorded/)
  assert.match(RULE, /offered once/)
  assert.match(RULE, /Remove any one of those and the objection returns/)
})

test('it names the rejected --force, so it is not re-proposed', () => {
  assert.match(RULE, /Not a `--force`/)
  assert.match(RULE, /indistinguishable from nobody having looked/)
})

test('it says a read must not spend the offer', () => {
  // `/spec-next` asks the gate on every run; a spending read would burn the
  // offer before any picker was raised.
  assert.match(RULE, /Do not spend it by reading/)
  assert.match(RULE, /--offered/)
})

test('it says the engine and the hook keep refusing regardless', () => {
  assert.match(RULE, /Not a replacement for the refusal/)
  // Wrapped in the source, so the assertion tolerates the line break rather
  // than forcing the prose to fit the test.
  assert.match(RULE, /layer on\s+top of a guard and never the guard itself/)
})

/* ==========================================================================
 * The skills point at it rather than restating it
 * ========================================================================== */

test('spec-diff routes the live refusal through the rule', () => {
  assert.match(DIFF, /offered-unblocks\.md/)
  assert.match(DIFF, /live take <spec> --json/)
})

test('spec-next routes the gate refusal through the rule, and spends it', () => {
  assert.match(NEXT, /offered-unblocks\.md/)
  assert.match(NEXT, /review gate <spec> --offered/)
})

test('spec-planning points at it beside the guard it argues with', () => {
  assert.match(PLANNING, /offered-unblocks\.md/)
})

/* ==========================================================================
 * Stays silent — what this spec deliberately did NOT change
 * ========================================================================== */

test('STAYS SILENT: the commands keep their verbatim-relay contract', () => {
  // Widening these was considered and rejected: it reintroduces judgment to the
  // surface the skills-vs-commands split exists to keep free of it.
  for (const name of ['spec-connect.md', 'spec-live.md', 'spec-remote-review.md']) {
    const text = read('commands', name)
    assert.match(
      text,
      /Relay the engine output above verbatim\. Add nothing and run nothing else\./,
      `${name} is unchanged`,
    )
    assert.doesNotMatch(text, /offered-unblocks/, `${name} raises no picker`)
  }
})

test('STAYS SILENT: the commands keep their narrow allowed-tools', () => {
  const narrow = {
    'spec-connect.md': /^allowed-tools: Bash\(\{\{exec\}\} skitterspec spec-env connect:\*\)$/m,
    'spec-live.md': /^allowed-tools: Bash\(\{\{exec\}\} skitterspec spec-env live:\*\)$/m,
    'spec-remote-review.md': /^allowed-tools: Bash\(\{\{exec\}\} skitterspec spec-env review allow remote:\*\)$/m,
  }
  for (const [name, re] of Object.entries(narrow)) {
    assert.match(read('commands', name), re, `${name} was not widened`)
  }
})

test('STAYS SILENT: the rule does not invent a third option', () => {
  // Two options and no more. A third — "remind me later" — is a bypass by
  // default wearing a question mark.
  assert.match(RULE, /put \*\*two\*\* options to the operator/)
  assert.match(RULE, /never add a third option/)
})
