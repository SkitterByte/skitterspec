'use strict'

/**
 * A rolling base reaches the operator through the skills they already run.
 *
 * The engine prints the lines (`cli-spec-env-rolling-base.test.js`); a skill
 * relays them. These pin the prose to feat-rolling-base: the landing skills
 * relay the `retarget:` line and run the primary-checkout switch first,
 * `/spec-start` relays the `fork:` line, and all three send a no-match refusal
 * to `spec-env base` — the verb that fetches — rather than past it.
 *
 * WHAT A LATER EDIT WOULD UNDO is the refusal's exit. A skill that treated
 * "no branch matches" as a failure to work around would reach for a fallback,
 * and the fallback is the default branch — the one place a rolling base must
 * never land.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

for (const name of ['spec-complete', 'spec-to-main']) {
  test(`/${name} relays the retarget line and runs the switch first`, () => {
    const text = skillText(name)
    assert.ok(text.includes('retarget:  forked from <old> · landing onto <new>'), 'quotes the engine line')
    assert.match(text, /relay it verbatim in the `Landed` row/)
    assert.match(text, /switch <base>`[^]*\*\*first\*\*/)
  })
}

for (const name of ['spec-complete', 'spec-to-main', 'spec-start']) {
  test(`/${name} sends a no-match refusal to spec-env base, and stops`, () => {
    const text = skillText(name)
    assert.ok(text.includes('no branch matches <pattern>'), 'names the refusal')
    assert.match(text, /stop with `⏸`, and name\s+`skitterspec spec-env base`/)
  })
}

// The gap between release branches: the refusal carries an offer, and every
// skill that can meet it relays the refusal FIRST and then offers the fix —
// never the fix in place of the refusal (`offered-unblocks.md`).
for (const name of ['spec-complete', 'spec-to-main', 'spec-start', 'spec-diff', 'no-spec', 'spec-idea']) {
  test(`/${name} relays a base refusal, then offers --use-fallback when it carries an offer`, () => {
    const text = skillText(name)
    assert.match(text, /carries an `offer:` line/)
    assert.match(text, /relay\s+it, then offer it as\s+`\.claude\/rules\/offered-unblocks\.md`/)
    assert.ok(text.includes('`skitterspec spec-env base --use-fallback`'))
  })
}

test('offered-unblocks.md works the base-gap offer as its satisfy example', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'rules', 'offered-unblocks.md'), 'utf8')
  assert.match(text, /### A worked `satisfy`: the gap between release branches/)
  assert.ok(text.includes('"label": "Use master as the base for now"'))
  assert.ok(text.includes('"command": "skitterspec spec-env base --use-fallback"'))
})

test('env.config.md documents baseBranchFallback and the self-clearing pin', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'env.config.md'), 'utf8')
  assert.ok(text.includes('"baseBranchFallback": ""'))
  assert.match(text, /clears\s+\/\/\s+itself the moment a branch matches again/)
  assert.match(text, /refusal OFFERS `baseBranchFallback`/)
})

test('/spec-start relays the fork line up prints under a rolling base', () => {
  const text = skillText('spec-start')
  assert.ok(text.includes('fork:  <base>  (the base — the primary checkout is on <old>)'))
  assert.match(text, /Relay that line in the `Branch` row/)
})

test('env.config.md documents baseBranchPattern: precedence, refusal, the glob, the pin', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'env.config.md'), 'utf8')
  assert.ok(text.includes('"baseBranchPattern": ""'))
  assert.match(text, /baseBranch \(pin\) → this pattern → origin\/HEAD →\s+\/\/\s+main → master/)
  assert.match(text, /No match REFUSES/)
  assert.match(text, /glob does not cross "\/"/)
  assert.match(text, /If your rcs overlap, pin `baseBranch`/)
})
