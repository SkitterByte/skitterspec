'use strict'

/**
 * The action's routing, and the rule that holds the banner's shape.
 *
 * WHAT THESE GUARD is a single claim, and it is the one a well-meaning later
 * edit would undo: **an action is not a verdict**. It changes what is running
 * and hands the reader back the same page with the same options, so a run
 * answering one has concluded nothing — and the gate a finished phase armed
 * must survive it.
 *
 * The engine already makes that structural (`env-review-actions.test.js`
 * asserts `ACTIONS` is disjoint from `VERDICTS` and `COMMITTING`). These tests
 * are about the PROSE agreeing with it, because a skill that reads an action as
 * an approval would commit on it whatever the vocabulary says.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
// The banner moved into the skill file every rendering skill reads
// (feat-rules-budget); its amendment history is in docs/rationale.
const RULE = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-diff', 'review-wait.md'), 'utf8')
const DIFF = skillText('spec-diff')
const NEXT = skillText('spec-next')

// --- /spec-diff owns the routing ------------------------------------------

test('/spec-diff routes both actions, and each loops back', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  for (const action of ['live-on', 'allow-network']) {
    assert.match(sec, new RegExp('`' + action + '`'), `${action} has a route`)
  }
  assert.match(sec, /\*\*both end the same way\*\*:\s*\n?do the thing, re-render/)
  assert.match(sec, /wait again/)
})

// `allow-remote` WENT WITH THE PUBLISHED TIER (feat-tailnet-remote-tier), and
// the routing says so for the same reason it says so about `live-off`.
test('/spec-diff records that allow-remote is absent on purpose', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*There is no `allow-remote` either\.\*\*/)
  assert.doesNotMatch(sec, /\| `allow-remote` \|/, 'no route for it')
})

// `live-off` WAS REMOVED, and the routing says so rather than going quiet about
// it: a later reader finding three actions where the page has one press needs to
// know the fourth was a decision, not an oversight.
test('/spec-diff records that live-off is absent on purpose', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*THERE IS NO `live-off`, and its absence is deliberate\.\*\*/)
  assert.match(sec, /`\/spec-live off` for it/)
})

// THE CLAIM THIS FILE EXISTS FOR. The gate is discharged by a committing verdict
// or a recorded skip and by nothing else, so a phase that ended still owes an
// answer after the reader has looked at it running.
test('/spec-diff says the gate is untouched by every action', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*AN ACTION IS NOT A VERDICT, and the gate is untouched by both\.\*\*/)
  assert.match(sec, /discharged by a committing verdict or a\s*\n?recorded skip/)
  assert.match(sec, /`ACTIONS` is disjoint from\s*\n?`VERDICTS` and `COMMITTING`/)
})

// The commit `live-on` performs is the mechanical precondition for `live take`,
// which refuses a dirty worktree — not the reader's answer. Losing that
// distinction is how a look-at-it-running press comes to clear a gate.
test('/spec-diff calls live-on\'s commit a precondition, not an answer', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /commits first, and the commit is a precondition rather than an answer/)
  assert.match(sec, /refuses a dirty worktree/)
  assert.match(sec, /The reader has not approved anything by pressing it/)
})

// The press was unachievable in the only state it is offered in: the page
// offers it at the end of a phase, a phase that ended arms the gate, and the
// gate denied the commit the press depends on. The skill has to say the permit
// exists, or the next reader of a refusal here goes looking for a flag.
test('/spec-diff says the gate permits live-on\'s commit, and only that', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /The gate permits that one commit, and nothing more/)
  assert.match(sec, /bound to\s*\n?the worktree's HEAD/)
  // And it must not read as a lift: the obligation outlives the press.
  assert.match(sec, /the gate stays\s*\n?\*\*armed\*\* throughout/)
})

// Half a phase committed to look at it running splits one phase across two
// commits — a mess nobody asked for, and the opposite of what the commit-first
// rule is for at a phase END.
test('/spec-diff refuses to commit half a phase for a mid-run press', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /A mid-phase page does not get the commit/)
  assert.match(sec, /splits one phase across two commits/)
})

// Every refusal `live take` makes names its own way out. Working around one
// means parking someone else's live session, which is their decision.
test('/spec-diff relays refusals and parks nobody else\'s work', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*Relay every refusal, and work around none of them\.\*\*/)
  assert.match(sec, /\*\*Never park another spec's live session\*\*/)
  assert.doesNotMatch(sec, /--force/)
})

test('/spec-diff says allow writes a committed file, and is enable-only', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /writes a committed file/)
  assert.match(sec, /primary checkout/)
  assert.match(sec, /\*\*enable-only\*\*/)
  // STAYS SILENT: nothing here permits publishing any more.
  assert.doesNotMatch(sec, /permits publishing/)
})

// A pass carries one answer. The engine refuses both, so the skill never has to
// choose — and must not grow a rule about which wins.
test('/spec-diff never invents a rule for a pass carrying both', () => {
  assert.match(DIFF, /A pass may carry an `action:` instead/)
  assert.match(DIFF, /The engine refuses a pass\s*\n?\s*carrying both/)
})

// --- the rule carries the banner's live line ------------------------------

test('the rule puts the live line in the banner, with the stack', () => {
  const banner = RULE.slice(RULE.indexOf('## ⏸ Review ready — 7 files'), RULE.indexOf('**Only promise a wait'))
  // IT NAMES THE COMMAND, not the capability — the verb is what a reader in a
  // terminal needs, and `the page can put it live` made them go and find it.
  assert.match(banner, /^live: off — \/spec-live to put it live$/m)
  // In the banner's own order: after the stack, before the holding line.
  assert.ok(banner.indexOf('- **remote**') < banner.indexOf('live: off'))
  assert.ok(banner.indexOf('live: off') < banner.indexOf("I'm holding here"))
  // `remote` is the tailnet URL now, labelled — not a command to publish.
  assert.match(banner, /^- \*\*remote\*\* — \[http:\/\/100\.[^\]]*\]\([^)]*\) \(tailnet\)$/m)
  assert.doesNotMatch(banner, /spec-remote-review/)
})

test('the rule says the live line is the engine\'s, from one function', () => {
  assert.match(RULE, /\*\*`live:`\*\* is the engine's line, copied as printed/)
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). `unavailable` is
// cannot-tell — no isolation, no worktree — and both are healthy. A line about
// a surface that does not exist is an accusation.
test('STAYS SILENT: the rule requires no line for an unavailable state', () => {
  assert.match(RULE, /When the engine prints none,\nleave it out/)
})

// --- the skills point at the rule, and inline no second shape -------------

for (const name of ['spec-next', 'spec-bug', 'spec-hotfix']) {
  test(`/${name} relays the live line, and nothing when there is none`, () => {
    const text = skillText(name)
    assert.match(text, /`live:`\s*\n?line/, `${name} names the line`)
    assert.match(text, /spec-reports\.md/, `${name} points at the rule`)
    // The absence is stated, not left to be inferred — that is the whole of the
    // stays-silent behaviour reaching the report.
    assert.match(
      text,
      /absent when the engine printed none|nothing where it did not/,
      `${name} says nothing is printed when the engine printed nothing`,
    )
  })
}

// The banner's shape lives in the rule. A skill writing its own version of the
// live line is how the two come to disagree about which states exist — the
// lesson the tier stack taught, where six skills had each grown their own.
test('no skill inlines its own list of live states', () => {
  for (const name of ['spec-next', 'spec-bug', 'spec-hotfix', 'spec-diff']) {
    const text = skillText(name)
    assert.doesNotMatch(
      text,
      /`on` · `off` · `held` · `unavailable`/,
      `${name} must point at the rule rather than restate the states`,
    )
  }
})

// /spec-next arms the gate, so it is the skill where reading an action as an
// approval would cost the most — and the one that must say so.
test('/spec-next says an action never clears the gate it armed', () => {
  assert.match(NEXT, /\*\*never clears the gate this phase armed\*\*/)
  assert.match(NEXT, /`\/spec-diff` §2b's routing and not this skill's/)
})

// `/spec-remote-review` was retired with the published tier, and the canonical
// list every spec skill points at says so rather than going quiet about it.
test('/spec-remote-review is not listed as a command, and does not ship', () => {
  const planning = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')
  assert.match(planning, /`\/spec-connect` and `\/spec-live` each pre-run one `spec-env` verb/)
  assert.doesNotMatch(planning, /spec-remote-review/)
  assert.ok(!fs.existsSync(path.join(ASSETS, 'commands', 'spec-remote-review.md')), 'the command no longer ships')
})
