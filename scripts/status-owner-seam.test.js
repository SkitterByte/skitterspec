'use strict'

/**
 * The `spec-status-owner` seam: every provider fills it, and the base
 * distribution fills it with nothing — so a repo with no tracker reads the
 * header-writing steps exactly as it always has (a stays-silent test for the
 * base, `.claude/rules/negative-checks.md` rule 3).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { composeText, loadFragments } = require('./compose.js')

const PKGS = path.join(__dirname, '..', 'packages')
const PROVIDERS = ['github', 'linear', 'jira', 'azure-boards']
const startSkill = () => fs.readFileSync(path.join(PKGS, 'common', 'assets', 'skills', 'spec-start', 'SKILL.md'), 'utf8')

for (const p of PROVIDERS) {
  test(`${p} fills spec-status-owner, and its fragment asks the engine`, () => {
    const frags = loadFragments(path.join(PKGS, p, 'assets', 'seams'))
    assert.ok(frags['spec-status-owner'], 'the fragment exists')
    assert.match(frags['spec-status-owner'], /skitterspec spec-sync ownership --json/)
    assert.match(frags['spec-status-owner'], /cannot-tell/, 'the unknown case is routed, not left implicit')
    const composed = composeText(startSkill(), frags)
    assert.ok(composed.indexOf('spec-sync ownership') < composed.indexOf('Set the **Status** header'))
  })
}

test('stays silent: the base distribution says nothing about ownership', () => {
  const composed = composeText(startSkill(), {})
  assert.doesNotMatch(composed, /spec-sync ownership/)
  assert.doesNotMatch(composed, /seam:spec-status-owner/)
  assert.match(composed, /Set the \*\*Status\*\* header/, 'the base still writes its header')
})
