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
  test(`/${name} names ExitWorktree for a session /spec-start moved`, () => {
    const s = read(name)
    assert.match(s, /ExitWorktree/)
    assert.match(s, /`\/spec-start` moved this session in/)
  })

  test(`/${name} specifies keep, and says why never remove`, () => {
    // `remove` here would be a second deleter racing `spec-env down`, whose
    // guards are the only thing protecting a dirty or unpushed worktree.
    const s = read(name)
    assert.match(s, /action: "keep"/)
    assert.match(s, /Always `keep`, never `remove`/)
    assert.match(s, /single thing that deletes/)
  })

  test(`/${name} still tells a hand-opened terminal to cd out`, () => {
    // The degrade path from phase 1 still exists, so a session that was never
    // moved must keep its own way out — ExitWorktree does nothing for it.
    const s = read(name)
    assert.match(s, /You opened the terminal yourself/)
    assert.match(s, /`cd` to the primary checkout/)
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
