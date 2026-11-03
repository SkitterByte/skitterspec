'use strict'

/**
 * Signal-based kind routing: every entry skill watches its grill for the
 * signals that mark the other kinds and proposes a hand-off — confirm-first,
 * in-session, context carried. The matrix lives once in spec-planning.md.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skill = (name) =>
  fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')
const planning = () =>
  fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

test('/spec watches for the other doors, mid-grill', () => {
  const text = skill('spec')
  assert.match(text, /### Watch for the other doors/, 'the watch is a named section of the grill')
  assert.match(text, /the moment one appears/i, 'raised mid-grill, not at the end')
  assert.match(text, /`\/spec-bug`/)
  assert.match(text, /`\/spec-hotfix`/)
  assert.match(text, /`\/spec-incident`/)
})

test('the watch confirms first and never silently switches', () => {
  const text = skill('spec')
  assert.match(text, /Always confirm; never silently switch/)
  assert.match(text, /question, never a verdict/i, 'a signal is raised, not acted on')
  assert.match(text, /incident > hotfix > bug/, 'precedence picks the most specific destination')
})

test('a confirmed switch hands off in-session with the context', () => {
  const text = skill('spec')
  assert.match(text, /hand off in-session/i)
  assert.match(text, /seed, don't skip, the grill/i, 'the destination grills only what it still needs')
  assert.match(text, /label routing/i, "and Phase 0's stop-and-retype shape is named as the other case")
})

test('the routing matrix lives once, in spec-planning.md', () => {
  const text = planning()
  assert.match(text, /### Kind routing/, 'the canonical section exists')
  assert.match(text, /\| `\/spec` \| defect · defect on a released version · live outage \|/, "/spec's row")
  assert.match(text, /\| `\/spec-bug` \| on a released version · live outage · not a defect \|/, "/spec-bug's row")
  assert.match(text, /\| `\/spec-hotfix` \| live outage · not on a released version · not a defect \|/, "/spec-hotfix's row")
  assert.match(text, /\| `\/spec-incident` \| no live outage to record \|/, "/spec-incident's row")
  assert.match(text, /incident > hotfix > bug/, 'precedence is recorded beside the matrix')
})

// STAYS-SILENT (negative-checks.md rule 3): the watch is judgment that asks,
// never a gate that acts — nothing is switched, refused or rewritten on a
// signal alone, and the label routing keeps its own, earlier check.
test('the watch gates nothing and reads no labels', () => {
  const text = planning()
  assert.match(text, /judgment, not configuration/i, 'no signal lists, no config keys')
  assert.match(text, /separate, earlier check and is unchanged/i, 'label routing is untouched')
})
