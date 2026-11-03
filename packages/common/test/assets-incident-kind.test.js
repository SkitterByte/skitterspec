'use strict'

/**
 * The incident lifecycle's authored surfaces: /spec-incident captures the
 * outage in flight, fix specs link back with the Incident: header, and
 * /spec-complete ends it in a log pushed as a comment — with the open-fix
 * refusal answered by the operator, never by a count.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = path.join(__dirname, '..', 'assets', 'skills')
const read = (name) => fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8')

test('/spec-incident writes in flight, with the grill and the boundaries', () => {
  const text = read('spec-incident')
  assert.match(text, /specs\/in-progress\//, 'starts in progress — there is no backlog stop')
  assert.match(text, /## Timeline/, 'the Timeline section is in the template')
  assert.match(text, /1 - Critical/, "severity uses Azure's literal values")
  assert.match(text, /separate.*specs/i, 'fixes are separate specs')
  assert.match(text, /never.*phases/i, 'and never phases of the incident')
  assert.match(text, /none: incident record, no code/, 'the gating default is recorded')
})

test('/spec-incident never waits on a review page mid-outage', () => {
  const text = read('spec-incident')
  assert.match(text, /no review page/i)
  assert.ok(!/review arm|review wait/.test(text), 'no gate is armed and no wait is started')
})

test('/spec-complete ends an incident in a log, a comment, and an answered refusal', () => {
  const text = read('spec-complete')
  assert.match(text, /incident-log\.md/)
  assert.match(text, /spec-sync comment .*--file/, 'the log is pushed with the engine, never pasted')
  assert.match(text, /as a comment/i)
  assert.match(text, /description is generated from the spec/, 'and the why is stated: a push would clobber a log in the description')
  assert.match(text, /> \*\*Incident:\*\*/, 'open fixes are found by their header')
  assert.match(text, /complete anyway/i, 'the refusal offers an exit the operator answers')
  assert.match(text, /BLIND SPOT/i, 'the branch-local blind spot is named beside the check')
})

test('/spec proposes the issue kind, with its defaults on the record', () => {
  const text = read('spec')
  assert.match(text, /feature, chore or issue/i)
  assert.match(text, /none: no code/, "an issue's gating default")
  assert.match(text, /`\/spec-incident`/, 'and an outage routes to its own door')
})

// STAYS-SILENT (negative-checks.md rule 3): the incident path is scoped to its
// kind — /spec-complete takes it only for incident- specs, so every other kind
// completes exactly as before.
test('the incident path is gated on the kind, not on every spec', () => {
  assert.match(read('spec-complete'), /Only for `Type: Incident` specs/)
})
