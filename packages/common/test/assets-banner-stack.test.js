'use strict'

/**
 * The banner carries a labelled STACK, and the rule defines it once.
 *
 * WHAT THIS REPLACES, and why it is not a loosening. The rule read *"exactly one
 * link, never two"*, and it was written on a real failure: two links handed
 * over, the wait standing behind only one of them, and three verdicts pressed on
 * the published page while each sat unread under a line claiming the run was
 * holding. That evidence is about the STORE, not the count — local, network and
 * remote POST to `location.pathname`, so they reach one server and one pending
 * store, and one wait covers them all. The published page, the second store,
 * was retired rather than caveated (feat-tailnet-remote-tier); `remote` is the
 * tailnet address now.
 *
 * So the rule became **one link per door, each labelled, all into one store**, and the
 * stays-silent half of that amendment lives in `assets-offer-last.test.js`:
 * offering two links into DIFFERENT stores without saying which the wait watches
 * is still forbidden, in as many words. Read that test before widening anything
 * here.
 *
 * These tests are about the SHAPE being defined once and copied, rather than
 * improvised per skill. A skill that writes its own version of the stack is a
 * skill that will disagree with the engine about which tiers exist.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
// The banner and its stack moved out of the always-loaded rules into the skill
// file every rendering skill reads (feat-rules-budget).
const RULE = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-diff', 'review-wait.md'), 'utf8')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// Every skill that puts a review page in front of a reader. The first three
// render at the end of their own work; `/spec` and `/spec-review` render the
// spec's documents; `/spec-diff` is the one anyone can call by hand.
const RENDERS = ['spec-next', 'spec-bug', 'spec-hotfix', 'spec', 'spec-review', 'spec-diff']

// --- the rule defines the stack ---------------------------------------------

test('the rule names all three tiers, in the order the engine prints them', () => {
  const at = (tier) => RULE.indexOf(`| \`${tier}\``)
  for (const tier of ['local', 'network', 'remote']) {
    assert.ok(at(tier) > 0, `${tier} has a row of its own`)
  }
  assert.ok(at('local') < at('network'), 'local before network')
  assert.ok(at('network') < at('remote'), 'network before remote')
  assert.match(RULE, /\*\*Three tiers, always all three, in this order\*\*/)
})

test('a tier that is off keeps its line and names what turns it on', () => {
  assert.match(RULE, /A tier that is off \*\*keeps its line\*\*/)
  assert.match(RULE, /naming the one command that turns it on/)
})

// THE LOAD-BEARING REASON. Without it the amendment reads as "more links are
// fine", which is the failure it was careful not to be.
test('the rule records why local, network and remote are one store', () => {
  assert.match(RULE, /every tier reaches the same server and the\nsame pending store/)
  assert.match(RULE, /one wait covers them all/)
})

test('the rule makes remote the tailnet, and keeps no second-store caveat', () => {
  assert.match(RULE, /\| `remote` \| the tailnet URL/)
  // STAYS SILENT: the published tier and its caveat are gone, not reworded.
  assert.doesNotMatch(RULE, /`remote` keeps the caveat it always had/)
  assert.doesNotMatch(RULE, /a verdict here needs `\/spec-reviewed`/)
  assert.doesNotMatch(RULE, /spec-remote-review/)
})

test('the stack is written out once', () => {
  // One `- **local** —` example line in the whole file: the banner's. A second
  // copy is how the two come to disagree about which tiers exist.
  const copies = [...RULE.matchAll(/^- \*\*local\*\* —/gm)]
  assert.equal(copies.length, 1, 'exactly one worked example of the stack')
})

// --- the old wording is gone, everywhere ------------------------------------

test('the absolute one-link wording is gone from the rule and the skills', () => {
  assert.doesNotMatch(RULE, /\*\*Exactly one link, never two\.\*\*/)
  assert.match(RULE, /\*\*One link per door, each labelled, all into one store\*\*/)
  for (const name of RENDERS) {
    const text = skillText(name)
    assert.doesNotMatch(text, /\*\*Never offer both\.\*\*/, `${name} no longer picks one link`)
    assert.doesNotMatch(text, /\*\*One link, and the engine has already chosen it\.\*\*/, name)
  }
})

// The engine stopped printing `open:` when the stack replaced it. A skill still
// telling its reader to relay that line names output that does not exist.
test('no skill still relays an engine line the engine stopped printing', () => {
  for (const name of RENDERS) {
    const text = skillText(name)
    assert.doesNotMatch(text, /the `open:` line/, `${name} names a line the render no longer has`)
    assert.doesNotMatch(text, /\*\*`open:`\*\*/, name)
    assert.doesNotMatch(text, /serveOnRemote/, `${name} names a config key that was renamed`)
  }
})

// --- every rendering skill points at the rule, and inlines nothing ----------

test('every rendering skill relays the engine stack rather than one link', () => {
  for (const name of RENDERS) {
    const text = skillText(name)
    // Each tier named, however the skill spells it — a bullet in a banner or a
    // line in the engine's output.
    const hits = (tier) => [
      ...text.matchAll(new RegExp(`\\*\\*${tier}\\*\\*|\`${tier}:?\``, 'g')),
    ].map((m) => m.index)
    for (const tier of ['local', 'network', 'remote']) {
      assert.ok(hits(tier).length, `${name} names the ${tier} tier`)
    }
    // AND IN THE ENGINE'S ORDER — asserted where the three appear TOGETHER,
    // which is what "in order" can mean. A whole-file first-mention comparison
    // was tried and is wrong: a skill may mention one tier in prose long before
    // it describes the stack (`/spec-diff` names `network` while explaining that
    // there is no action to turn it off), and that says nothing about the order
    // the stack is written in.
    const together = (() => {
      for (const i of hits('local')) {
        const window = text.slice(i, i + 400)
        const n = window.search(/\*\*network\*\*|`network:?`/)
        const r = window.search(/\*\*remote\*\*|`remote:?`/)
        if (n > 0 && r > n) return true
      }
      return false
    })()
    assert.ok(together, `${name}: local, network, remote named together, in that order`)
    assert.match(text, /spec-reports\.md/, `${name} points at the rule that defines the shape`)
  }
})

// The single-link banner is the shape being replaced. Any skill still writing
// `**[Open the page](…)** ·` as its banner has a competing copy of the shape,
// and it is the copy that loses a reader off the network.
test('no skill still inlines the single-link banner', () => {
  for (const name of RENDERS) {
    const text = skillText(name)
    assert.doesNotMatch(
      text,
      /\*\*\[Open the page\]/,
      `${name} must take the banner's stack from the rule, not inline one link`,
    )
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). The skills that LAND
// branches render nothing, so they must gain none of this by someone pasting it
// in for symmetry — the same deliberate decision `assets-phase-end-review.js`
// guards for the render step itself.
test('STAYS SILENT: the skills that land branches gain no stack at all', () => {
  for (const name of ['spec-complete', 'spec-land']) {
    const text = skillText(name)
    assert.doesNotMatch(text, /`local:`, `network:` and `remote:`/, name)
    assert.doesNotMatch(text, /## ⏸ Review ready/, name)
  }
})

// --- the one tier that may be absent ----------------------------------------
//
// The third amendment to the tier rule: a reader on another machine sees no
// `local` line, because 127.0.0.1 is the engine's machine. Pinned so the
// exception keeps its reason and stays the ENGINE's decision — a skill that
// decided it would be the guess one layer up that the stack exists to remove.

test('the rule names the hidden-local exception, its signal and its fallback', () => {
  assert.match(RULE, /\*\*The one exception is the engine's, not yours\.\*\*/)
  assert.match(RULE, /SKITTERSPEC_READER=remote/)
  assert.match(RULE, /only when `network` has a\nURL/)
  assert.match(RULE, /marked `hidden` in `--json` is absent from the\nprinted stack/)
  assert.match(RULE, /names the tiers the engine's `covers` lists/)
  assert.match(RULE, /a Windows session with no `SESSIONNAME`/)
})

test('STAYS SILENT: the off-tier rule itself is unchanged', () => {
  // The exception is for a door that cannot open, not for one that is off.
  assert.match(RULE, /A tier that is off \*\*keeps its line\*\*/)
  assert.match(RULE, /\*\*Three tiers, always all three, in this order\*\*/)
})
