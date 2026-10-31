'use strict'

// A bug or hotfix spec's ticket body leads with the bug sections — Symptom,
// Root cause, Fix — rather than the feature overview order, so the Bug form
// opens on the repro (spec feat-chore-kind-bug-bodies phase 5). The render is
// a REORDER of the same sections: nothing is invented, nothing dropped, and a
// feature spec's body is byte-identical to before.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { neutralConfig } = require('./_config.js')

function specNamed(name, overview) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bugbody-'))
  const dir = path.join(root, 'specs', 'in-progress', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), overview)
  fs.writeFileSync(path.join(dir, '01-fix.md'), '# Phase 1 — Fix ⬜\n\n**Goal:** fix it.\n')
  return dir
}

const BUG_OVERVIEW = [
  '# Crash on save',
  '',
  '## Impact',
  '',
  'Everyone saving.',
  '',
  '## Symptom',
  '',
  'Saving a draft crashes.',
  '',
  '## Root cause',
  '',
  'Null id in the writer.',
  '',
  '## Fix',
  '',
  'Guard the id.',
  '',
].join('\n')

function headings(description) {
  return (description.match(/^## .+$/gm) || []).map((h) => h.slice(3))
}

test('a bug- spec leads with Symptom / Root cause / Fix, rest in document order', () => {
  const dir = specNamed('bug-crash-on-save', BUG_OVERVIEW)
  const { description } = normalizeLocal(dir, neutralConfig())
  assert.deepStrictEqual(headings(description), ['Symptom', 'Root cause', 'Fix', 'Impact'])
})

test('a hotfix- spec renders bug-shaped too', () => {
  const dir = specNamed('hotfix-crash-on-save', BUG_OVERVIEW)
  const { description } = normalizeLocal(dir, neutralConfig())
  assert.deepStrictEqual(headings(description)[0], 'Symptom')
})

// STAYS-SILENT (negative-checks.md rule 3): the reorder never fires at a
// healthy feature spec, and a bug spec with none of the bug sections renders
// exactly as it always did.
test('a feat- spec with the same sections keeps document order', () => {
  const dir = specNamed('feat-crash-on-save', BUG_OVERVIEW)
  const { description } = normalizeLocal(dir, neutralConfig())
  assert.deepStrictEqual(headings(description), ['Impact', 'Symptom', 'Root cause', 'Fix'])
})

test('a bug spec with feature-shaped sections is untouched', () => {
  const featureShaped = '# X\n\n## Problem\n\nP.\n\n## Decisions\n\nD.\n'
  const dir = specNamed('bug-legacy', featureShaped)
  const { description } = normalizeLocal(dir, neutralConfig())
  assert.deepStrictEqual(headings(description), ['Problem', 'Decisions'])
})
