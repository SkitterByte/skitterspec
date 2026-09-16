'use strict'

/**
 * Every document that waits on a verdict names the engine's wait, and none of
 * them leaves the agent to compose one.
 *
 * The rule is prose, and prose alone is what failed — three times in two days,
 * each reaching the operator as *"I pressed the button and nothing happened"*.
 * What makes this version checkable is that phase 1 gave the prose something to
 * point AT: the rule is now "call this command", not "be careful", and a test
 * can assert the command is named where a test could never assert care.
 *
 * WHAT WOULD FOOL A LOOSER VERSION OF THIS FILE: asserting only that
 * `review wait` is mentioned. A document can name the command in one paragraph
 * and describe composing a loop in the next, which is exactly the drift that
 * would reintroduce the bug — so the forbidden shapes are asserted absent too.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skill = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const rule = (name) => fs.readFileSync(path.join(ASSETS, 'rules', name), 'utf8')

// The four documents that stand behind a wait: the three skills that ask for a
// verdict, and the contract that defines the sentence they print while waiting.
const DOCS = {
  'spec-next/SKILL.md': skill('spec-next'),
  'spec-bug/SKILL.md': skill('spec-bug'),
  'spec-diff/SKILL.md': skill('spec-diff'),
  'rules/spec-reports.md': rule('spec-reports.md'),
}

for (const [name, text] of Object.entries(DOCS)) {
  test(`${name} names the engine's wait`, () => {
    assert.match(text, /spec-env review wait/, 'the command is named, so there is nothing to invent')
  })

  // A duration is the failure that lost a verdict to a lunch break: a watch
  // bounded at an hour against a reader who came back at two. The lifetime is
  // the session, and the documents must not hand out a number instead.
  test(`${name} gives the wait no duration of its own`, () => {
    const forbidden = [
      /--timeout\s+\d/,
      /wait (?:for )?(?:up to )?\d+\s*(?:s\b|sec|min|hour)/i,
      /timeout_ms/,
    ]
    for (const re of forbidden) {
      assert.doesNotMatch(text, re, `${name} must not bound the wait: ${re}`)
    }
  })
}

// The account travels with the rule. A rule with the incident attached is the
// shape every other rule in this repo takes, and it is what stops the next
// reader treating "do not compose one" as fussiness.
test('the reasoning names the silence, not just the bug', () => {
  const next = DOCS['spec-next/SKILL.md']
  assert.match(next, /zsh/i, 'the shell divergence is named')
  assert.match(next, /five minutes/i, 'and how long it looked like patience')
  // The LESSON, which is the half that generalises: a broken watcher and a
  // patient one are indistinguishable from outside.
  assert.match(next, /indistinguishable|silence/i)
})

test('the report contract ties the banner to the wait actually running', () => {
  const reports = DOCS['rules/spec-reports.md']
  assert.match(reports, /I'm holding here until you send a verdict/, 'the promise is still there')
  assert.match(
    reports,
    /only true for as long as the wait is actually running/i,
    'and what makes it true is stated beside it',
  )
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). Two healthy things
// this must not accuse:
//
// - a harness with no background execution, whose wait IS the turn ending. That
//   path is untouched by this phase and must keep its wording.
// - `/spec-hotfix`, which renders a page and defers the whole sequence to
//   `/spec-next` §5. It never described a watcher, so it needs no wait command
//   of its own, and requiring one would be a rule invented for symmetry.
test('stays silent: the turn-ending wait survives, and spec-hotfix is untouched', () => {
  assert.match(
    DOCS['spec-next/SKILL.md'],
    /the turn ending is\s*\n?the wait/i,
    'the harness with nothing to run in the background still waits',
  )
  const hotfix = skill('spec-hotfix')
  assert.doesNotMatch(hotfix, /spec-env review wait/, 'it defers rather than restating')
  assert.match(hotfix, /spec-next/, 'and says where the sequence lives')
})
