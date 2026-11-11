'use strict'

/**
 * The migration paragraph in `spec-planning.md` covers a whole conversion of a
 * plan spec to an epic (spec feat-epic-migration, phase 3): a phase that is not
 * a wave, the check before landing, and the wave sub-issues left behind.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const PLANNING = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rules', 'spec-planning.md'), 'utf8')

test('a phase that is not a wave becomes a member, usually an Issue', () => {
  assert.match(PLANNING, /\*\*A phase that is not a wave becomes a member\.\*\*/)
  assert.match(PLANNING, /usually an \*\*Issue\*\*/)
})

test('the conversion is checked with epic status --here before it lands', () => {
  assert.match(PLANNING, /`skitterspec epic status <epic> --here`/)
  assert.match(PLANNING, /`\/no-spec` branch/)
})

test('the epic\'s first push retires the wave sub-issues', () => {
  assert.match(PLANNING, /\*\*The epic's first push retires the wave sub-issues\.\*\*/)
  assert.match(PLANNING, /closes each as not planned and unlinks it/)
})
