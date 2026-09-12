'use strict'

/**
 * `refuseTeardownIfUnpushed` (`env/teardown.js`) blocks teardown when a
 * worktree's commits are `unpushed && !landed`. `/spec-cancel` is the only
 * lifecycle skill that meets it: a cancelled spec is unlanded by definition, so
 * its worktree really is the only copy of the work about to be removed.
 *
 * The engine's own refusal names `--force` and nothing else. Relayed verbatim
 * that reads as "type this to proceed", at the exact moment publishing the
 * branch would still have cost nothing — so the skill has to supply the other
 * half. These tests pin both halves being offered, and pin that the skill
 * prints the push rather than running it: publishing abandoned work to a shared
 * remote unasked is the act this workflow exists to remove, and relocating it
 * from `/spec-start` to `/spec-cancel` would not make it wanted.
 *
 * `/spec-complete` is asserted to record why it needs none of this. Without the
 * reasoning written down, the obvious next edit is to paste the same block into
 * it "for symmetry" — where the guard cannot fire, because step 6 lands the
 * branch first.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = (name) =>
  fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'skills', name, 'SKILL.md'),
    'utf8',
  )

test('/spec-cancel relays the unpushed refusal rather than stopping at it', () => {
  const s = read('spec-cancel')
  assert.match(s, /refuses over unpushed commits, relay both ways out/)
  assert.match(s, /relay the engine's reason/)
})

test('/spec-cancel says plainly what would be destroyed', () => {
  // The guard fires about real loss, and a refusal that does not say so gets
  // forced past on the assumption it is protecting a formality.
  const s = read('spec-cancel')
  assert.match(s, /only copy of this work/)
  assert.match(s, /not merged into the base branch/)
})

test('/spec-cancel offers publishing first, with the command', () => {
  const s = read('spec-cancel')
  assert.match(s, /publish it first — keeps the work reachable/)
  assert.match(s, /git -C <worktreePath> push -u origin <branch>/)
  assert.match(s, /then re-run \/spec-cancel/)
})

test('/spec-cancel prints that push and never runs it', () => {
  // The invariant phase 2 generalises: the tooling may print a publish, never
  // perform one. A cancel is the tempting exception — the work is abandoned, so
  // backing it up "helpfully" looks free — and it is not the skill's call.
  const s = read('spec-cancel')
  assert.match(s, /\*\*Print the push; never run it\.\*\*/)
  assert.match(s, /unasked-for act this workflow took out of `\/spec-start`/)
})

test('/spec-cancel offers --force as the other half, and forbids taking it alone', () => {
  const s = read('spec-cancel')
  assert.match(s, /or accept the loss/)
  assert.match(s, /skitterspec spec-env down <name> --force/)
  assert.match(s, /Never reach for `--force` yourself either/)
  assert.match(s, /the choice is\n   a decision about someone's work, and it is theirs/)
})

test('/spec-cancel keeps the two options adjacent in one block', () => {
  // Split across sections, one of them gets read and acted on before the other
  // is seen — and the destructive one is the half the engine already named.
  const s = read('spec-cancel')
  const publish = s.indexOf('publish it first — keeps the work reachable')
  const force = s.indexOf('or accept the loss')
  assert.ok(publish > 0, 'publish option is missing')
  assert.ok(force > publish, 'the --force option should follow the publish option')
  assert.ok(force - publish < 200, 'the two options should sit in the same block')
})

test('/spec-complete records why the unpushed guard cannot fire there', () => {
  const s = read('spec-complete')
  assert.match(s, /unpushed half of that guard cannot fire here, by construction/)
  assert.match(s, /`merged` is true and `planDown` skips the check/)
  assert.match(s, /`\/spec-cancel` is where it does fire/)
})

test('/spec-complete gains no publish-or-force block of its own', () => {
  // The stays-silent half: a skill that cannot meet the guard must not carry
  // instructions for it. Two copies drift, and the copy in the skill that never
  // reaches the refusal is the one nobody notices going stale.
  const s = read('spec-complete')
  assert.doesNotMatch(s, /publish it first — keeps the work reachable/)
  assert.doesNotMatch(s, /push -u origin <branch>/)
})
