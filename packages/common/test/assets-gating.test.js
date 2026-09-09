'use strict'

/**
 * Release gating is prose in three skills, and prose is exactly what already
 * failed at this once: a project rule saying "offer a feature flag" sat in
 * context through a whole spec and never got asked. The header is the fix
 * because its absence is visible — so these guard the two properties that make
 * it work, and that a later edit could quietly undo.
 *
 * 1. It is CONFIG-GATED. Without `gating.config.json` nothing appears; a skill
 *    that dropped the gate would start demanding a header from every project.
 * 2. It is an OFFER. The user decides; the skill raises it. A skill rewritten to
 *    impose a flag would be worse than the silence it replaced.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = ['spec', 'spec-bug', 'spec-hotfix']
const read = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', name, 'SKILL.md'), 'utf8')

test('every authoring skill emits the Gating header in its template', () => {
  for (const name of SKILLS) {
    assert.match(read(name), /^> \*\*Gating:\*\*/m, `${name} template carries the header`)
  }
})

test('every authoring skill gates it on the config existing', () => {
  for (const name of SKILLS) {
    assert.match(
      read(name).replace(/\s+/g, ' '),
      /only when `specs\/\.core\/gating\.config\.json` exists/i,
      `${name} names the config gate`,
    )
  }
})

test('every authoring skill says to omit the line when unconfigured', () => {
  // The stays-silent half: an unadopted project's specs must look exactly as
  // they do today, not carry an empty header.
  for (const name of SKILLS) {
    assert.match(read(name).replace(/\s+/g, ' '), /omit the line|do not write the line|Skip entirely/i)
  }
})

test('/spec and /spec-bug offer rather than impose', () => {
  for (const name of ['spec', 'spec-bug']) {
    assert.match(read(name).replace(/\s+/g, ' '), /Offer, don't impose/i, `${name} offers`)
  }
})

test('the grammar rejects a bare none, in the skill that writes it', () => {
  const flat = read('spec').replace(/\s+/g, ' ')
  assert.match(flat, /none: <one-line reason>/)
  assert.match(flat, /bare\s*"?none"? is not a valid outcome|"No" is a decision/i)
})

test('/spec-hotfix pre-fills, and says why it differs', () => {
  const flat = read('spec-hotfix').replace(/\s+/g, ' ')
  assert.match(flat, /none: hotfix — restoring released behaviour/)
  assert.match(flat, /default, not a rule/i, 'the pre-fill is overridable')
  assert.match(flat, /nothing to gate|nothing to roll back/i, 'says why a hotfix differs')
})

test('the rules file documents the header and the check that never blocks', () => {
  const flat = fs
    .readFileSync(path.join(__dirname, '..', 'assets', 'rules', 'spec-planning.md'), 'utf8')
    .replace(/\s+/g, ' ')
  assert.match(flat, /> \*\*Gating:\*\*/)
  assert.match(flat, /always exits 0/i)
  assert.match(flat, /the offer, never the mechanism/i)
})
