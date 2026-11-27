'use strict'

// The issue forms and `skitterspec report-issue` share a contract: the verb
// fills each form's fields by id, and the form, not the URL, applies the
// labels. A field id renamed on one side alone would open forms with empty
// fields, and nothing else would notice. No YAML parser is installed, so the
// forms are read with line regexes. They are small and written by hand.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { KINDS, FIELD_IDS } = require('../packages/common/src/report-issue.js')

const DIR = path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE')

for (const [kind, { template, labels }] of Object.entries(KINDS)) {
  test(`${template} carries the field ids and labels report-issue relies on (${kind})`, () => {
    const yaml = fs.readFileSync(path.join(DIR, template), 'utf8')
    const ids = [...yaml.matchAll(/^\s+id:\s*(\S+)\s*$/gm)].map((m) => m[1])
    assert.deepStrictEqual(ids.sort(), [...FIELD_IDS].sort())
    const line = yaml.match(/^labels:\s*\[(.*)\]\s*$/m)
    assert.ok(line, 'the form declares its labels on one line')
    assert.deepStrictEqual(line[1].split(',').map((s) => s.trim()), labels)
    assert.ok(labels.includes('triage'))
  })
}

test('the repo intake lists what the forms label', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'specs', '.core', 'github.config.json'), 'utf8'))
  assert.strictEqual(config.intake && config.intake.label, 'triage')
})
