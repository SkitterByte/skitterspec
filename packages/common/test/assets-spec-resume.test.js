'use strict'

/**
 * `/spec-resume` (spec feat-spec-resume, phase 2): it goes back into a spec in
 * flight and starts nothing, and the intake doors offer it for a ticket that
 * already has a spec rather than starting a second one.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const PACKAGES = path.join(__dirname, '..', '..')
const SKILL = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', 'spec-resume', 'SKILL.md'), 'utf8')
const BODY = SKILL.replace(/^---[\s\S]*?---/, '')

test('/spec-resume asks the engine, then attaches only what the engine planned', () => {
  assert.match(BODY, /skitterspec spec-env resume <name\|#N> --json/)
  assert.match(BODY, /Never add a `-b` of your own/)
  assert.match(BODY, /`skitterspec spec-env resolve` with no\nargument must name this spec/)
})

test('/spec-resume is model-invocable, so the doors can hand off to it', () => {
  assert.doesNotMatch(SKILL, /^disable-model-invocation:/m)
})

// STAYS SILENT: resuming must not become starting. None of the start's
// side effects may appear as instructions here.
test('stays silent: /spec-resume moves no bucket, assigns nobody and pushes no status', () => {
  assert.doesNotMatch(BODY, /git mv/)
  assert.doesNotMatch(BODY, /spec-sync assign/)
  assert.doesNotMatch(BODY, /\/spec-push/)
})

test('a blocker is cleared on the message or one question, never in silence', () => {
  assert.match(BODY, /\*\*ask once\*\*/)
  assert.match(BODY, /Never clear a blocker in silence/)
})

test('code is only ever written through /spec-next, under its gate', () => {
  assert.match(BODY, /Hand off to a bare\n\*\*`\/spec-next`\*\*/)
  assert.match(BODY, /It is\nnever stepped past/)
})

test('every provider\'s intake door offers /spec-resume for an already-adopted ticket', () => {
  for (const provider of ['github', 'linear', 'jira', 'azure-boards']) {
    const seam = fs.readFileSync(path.join(PACKAGES, provider, 'assets', 'seams', 'spec-tracker-intake.md'), 'utf8')
    assert.match(seam, /\*\*Offer `\/spec-resume <ref>`\*\*/, provider)
    assert.doesNotMatch(seam, /\*\*stop\*\* and point them at that spec/, provider)
  }
})
