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
const RULE = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-reports.md'), 'utf8')
const DIFF = skillText('spec-diff')
const NEXT = skillText('spec-next')

// --- /spec-diff owns the routing ------------------------------------------

test('/spec-diff routes all three actions, and each loops back', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  for (const action of ['live-on', 'allow-network', 'allow-remote']) {
    assert.match(sec, new RegExp('`' + action + '`'), `${action} has a route`)
  }
  assert.match(sec, /\*\*all three end the same way\*\*:\s*\n?do the thing, re-render/)
  assert.match(sec, /wait again/)
})

// `live-off` WAS REMOVED, and the routing says so rather than going quiet about
// it: a later reader finding three actions where the page has one press needs to
// know the fourth was a decision, not an oversight.
test('/spec-diff records that live-off is absent on purpose', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*THERE IS NO `live-off`, and its absence is deliberate\.\*\*/)
  assert.match(sec, /`\/spec-live main` for it/)
})

// THE CLAIM THIS FILE EXISTS FOR. The gate is discharged by a committing verdict
// or a recorded skip and by nothing else, so a phase that ended still owes an
// answer after the reader has looked at it running.
test('/spec-diff says the gate is untouched by every action', () => {
  const sec = DIFF.slice(DIFF.indexOf('## 2b.'), DIFF.indexOf('## 3. Gate it on nothing'))
  assert.match(sec, /\*\*AN ACTION IS NOT A VERDICT, and the gate is untouched by all three\.\*\*/)
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
  // Permitting is not publishing — the one that leaves something behind stays
  // an explicit ask.
  assert.match(sec, /permits publishing\. It does not publish/)
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
  // And the tier line names its command too, for the same reason.
  assert.match(banner, /`\/spec-remote-review` turns it on/)
})

test('the rule says the live line is the engine\'s, from one function', () => {
  assert.match(RULE, /It is the engine's line, copied like the stack/)
  assert.match(RULE, /`--json` carries the same answer as `live`, from one function/)
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). `unavailable` is
// cannot-tell — no isolation, no worktree — and both are healthy. A line about
// a surface that does not exist is an accusation.
test('STAYS SILENT: the rule requires no line for an unavailable state', () => {
  assert.match(RULE, /The fourth, `unavailable`,\s*\n?\*\*prints nothing at all\*\*/)
  assert.match(RULE, /an accusation against a\s*\n?healthy repo/)
})

// A RIGID CONTRACT TOOK TWO AMENDMENTS IN TWO SPECS, and that is worth being
// unable to forget. The contract earns its rigidity from real failures; two in a
// row is how it becomes negotiable.
test('the rule names its own second amendment and raises the bar', () => {
  assert.match(RULE, /This is the second amendment to this section in two specs/)
  assert.match(RULE, /\*\*A third should have to argue harder than either did\.\*\*/)
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

// WHY A COMMAND AND NOT A LINK, recorded in the rule so the next reader does not
// re-propose it. A clickable banner means a URL that acts when FETCHED, and a
// link previewer or a browser prefetcher fetches URLs with nobody involved.
test('the rule records why the lines are commands rather than links', () => {
  assert.match(RULE, /\*\*Each line names a command a person types\*\*/)
  assert.match(RULE, /a URL that acts when it is \*\*fetched\*\*/)
  assert.match(RULE, /a link previewer or a prefetcher/)
})

// The command is documented where the other two are, or it is a control nobody
// discovers: `spec-planning.md` is the canonical list every spec skill points at.
test('/spec-remote-review is listed beside the other two commands', () => {
  const planning = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')
  assert.match(planning, /`\/spec-connect`, `\/spec-live` and `\/spec-remote-review` are/)
  assert.match(planning, /It \*\*permits\*\* publishing; it publishes\s*\n?nothing/)
})
