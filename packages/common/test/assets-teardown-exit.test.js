'use strict'

/**
 * `/spec-complete` and `/spec-cancel` remove the worktree — which, once
 * `/spec-start` moves the session into it, is the directory the session is
 * standing in. The prose telling them to leave first is the only thing stopping
 * a finished spec from taking the session down with it: `git worktree remove`
 * SUCCEEDS on the tree you occupy, so nothing errors until every command after
 * it dies with `Unable to read current working directory`.
 *
 * Both skills carry the same block, and it has to stay the same in both — a fix
 * applied to one is the shape this drift takes.
 *
 * The block used to fork on HOW you got in, because `/spec-start` moved the
 * session with `ExitWorktree` and that tool had its own way out. The move is a
 * plain `cd` now, so both ways in leave the same way and the fork collapsed —
 * along with the `action: "keep"` constraint, which only ever existed to bound
 * that call.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = ['spec-complete', 'spec-cancel']
const read = (name) =>
  fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'skills', name, 'SKILL.md'),
    'utf8',
  )

for (const name of SKILLS) {
  test(`/${name} says to cd out, and says it once`, () => {
    // One instruction, not a fork: a `cd`-moved session and a hand-opened
    // terminal want the identical action, so offering two is offering a choice
    // that does not exist.
    const s = read(name)
    assert.match(s, /cd <primary checkout>/)
    assert.match(s, /That is the whole mechanism/)
    assert.doesNotMatch(s, /You opened the terminal yourself/, 'the fork is gone')
    assert.doesNotMatch(s, /`\/spec-start` moved this session in/, 'the fork is gone')
  })

  test(`/${name} names no tool for leaving — the mobile constraint`, () => {
    // Guarded, not merely done. `ExitWorktree` prompts for approval, and that
    // prompt is unusable on a phone; it is also a no-op for a session it did not
    // move, which after phase 1 is every session. Both halves say: do not
    // reintroduce it.
    const s = read(name)
    assert.doesNotMatch(s, /ExitWorktree/)
    assert.doesNotMatch(s, /action: "keep"/)
    assert.match(s, /There is no tool to call here/)
  })

  test(`/${name} keeps spec-env down as the only deleter`, () => {
    // This argument OUTLIVED ExitWorktree. It was never about which tool
    // relocates the session — it is about not having a second thing that
    // deletes, racing the guards that protect a dirty or unpushed worktree.
    const s = read(name)
    assert.match(s, /single thing that deletes/)
    assert.match(s, /a second one is how the teardown guards get\s*\n?bypassed/)
  })

  test(`/${name} keeps the reason the ordering matters`, () => {
    // Without this, "leave first" reads as fussiness and gets dropped as a step
    // that seems to protect nothing — git never complains.
    const s = read(name)
    assert.match(s, /Not because git refuses — it does not/)
    assert.match(s, /Unable to read current working directory/)
  })
}

test('both teardown skills carry the identical leave-first block', () => {
  const block = (s) => {
    const start = s.indexOf('**Standing in the worktree?')
    const end = s.indexOf('only ordering that survives.', start)
    assert.ok(start > 0 && end > start, 'leave-first block is missing')
    return s.slice(start, end)
  }
  assert.strictEqual(block(read('spec-complete')), block(read('spec-cancel')))
})
