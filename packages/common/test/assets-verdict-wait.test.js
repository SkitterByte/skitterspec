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

// ── phase 3: found on the way back in ────────────────────────────────────────
//
// A wait that never ran cannot be recovered by a better wait. These two skills
// are the realistic ways back in — you either start a spec or continue one — so
// they are where a pass nobody heard gets surfaced. It is deliberately NOT
// every spec skill: a rule nobody needs is a rule that teaches people to skim.

const ENTRY_POINTS = ['spec-next', 'spec-start']

for (const name of ENTRY_POINTS) {
  const text = skill(name)

  test(`/${name} reports a pass nobody heard`, () => {
    assert.match(text, /spec-env review waiting/, 'it asks the engine on the way in')
    assert.match(text, /information, not a gate/i, 'and does not refuse on what it finds')
  })

  // The one thing it must never do. `/spec-diff` §0 is the rule a stranger's
  // POST stands behind, and a skill that surfaced a pass AND took it would walk
  // straight through it.
  // ANCHORED TO THE BLOCK IT IS ABOUT, not to the skill at large. A first
  // version allowed `/never claim/` anywhere in the file, and these skills say
  // that in other contexts — so weakening the rule to "you may claim one" left
  // the test green. A guard that matches something else is not a guard.
  test(`/${name} claims nothing it finds`, () => {
    const block = /review waiting[\s\S]{0,1200}/.exec(text)
    assert.ok(block, 'the waiting block is there to anchor on')
    assert.match(block[0], /\*\*you never claim one\*\*/, 'the rule is stated in the block itself')
    assert.match(block[0], /spec-diff.{0,12}§0/i, 'and names the rule it is standing on')
  })
}

// ── the teardown skills: the last moment a verdict can be honoured ───────────
//
// THIS REVERSES A DECISION THIS FILE USED TO ASSERT, and the reversal is the
// point rather than an oversight. `/spec-cancel` and `/spec-complete` were
// deliberately left out on the grounds that a line about waiting reviews is
// noise beside the thing the operator asked for — which is right for a skill
// that merely PASSES a pass by.
//
// These two do not pass it by: they destroy the worktree. Nothing becomes
// unreachable (a pass can be disowned long after its spec is gone — that is
// phase 1), but the last moment the verdict can be HONOURED does pass, because
// after teardown there is no branch left to commit to. That is a different
// claim from the one the old exclusion was written against, and it is why these
// two earn the line where `/spec-review` still does not.

const TEARDOWNS = ['spec-complete', 'spec-cancel']

for (const name of TEARDOWNS) {
  const text = skill(name)
  const block = () => /review waiting[\s\S]{0,2000}/.exec(text)

  test(`/${name} names a pass before it destroys the worktree`, () => {
    assert.match(text, /spec-env review waiting/, 'it asks the engine before tearing down')
    const b = block()
    assert.ok(b, 'the waiting block is there to anchor on')
    assert.match(b[0], /--drop <code>/, 'and names the disown exit')
    assert.match(b[0], /spec-reviewed <code>/, 'and the claim-it-now exit')
  })

  // FILTERED TO THIS SPEC. `spec-reports.md` is explicit that a run reports
  // itself and nothing else — a teardown that listed another spec's pass would
  // leave the reader unable to tell whether it followed from what just
  // happened.
  test(`/${name} reports only the spec it is finishing`, () => {
    const b = block()
    assert.match(b[0], /THIS spec|to the spec being (completed|cancelled)/i)
    assert.match(b[0], /nothing about any other|and nothing else/i)
  })

  // WHY NOW, rather than a bare warning. The old reading — "you will lose
  // this" — is false after phase 1, and a caveat that is not true is worse than
  // none.
  test(`/${name} says why this moment and not another`, () => {
    const b = block()
    assert.match(b[0], /last moment/i)
    assert.match(b[0], /honoured/i)
  })

  test(`/${name} reports without blocking`, () => {
    const b = block()
    assert.match(b[0], /never blocks?/i, 'no refusal of its own')
    assert.match(b[0], /no non-zero exit/i)
  })

  // The one thing it must never do — anchored to the block, for the reason the
  // entry-point version records above.
  test(`/${name} claims nothing it finds`, () => {
    const b = block()
    assert.match(b[0], /\*\*it never\s*\n?\s*claims\*\*|\*\*it never claims\*\*/i, 'the rule is in the block')
    assert.match(b[0], /spec-diff.{0,12}§0/i, 'and names the rule it is standing on')
  })
}

// STAYS SILENT. Two healthy things this must not accuse:
//
// - a repo with nothing waiting, where the engine prints nothing and so does
//   the skill. Reporting that there was nothing to report is the noise
//   `spec-reports.md` bans.
// - the skill still deliberately left out. Requiring the check everywhere would
//   be a rule invented for symmetry, which is how a findable line becomes one
//   people skim past — `/spec-review` neither enters the lifecycle nor destroys
//   anything, so it has no moment to report at.
test('stays silent: nothing waiting says nothing, and spec-review is untouched', () => {
  for (const name of [...ENTRY_POINTS, ...TEARDOWNS]) {
    assert.match(skill(name), /[Ss]ilent when nothing is waiting/, `${name} says nothing when there is nothing`)
  }
  assert.doesNotMatch(skill('spec-review'), /spec-env review waiting/, 'spec-review is still left out')
})
