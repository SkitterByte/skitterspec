'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { retiredKeys, retiredKeysRow } = require('../src/config.js')
const { doctorRow } = require('../src/doctor.js')

function file(json) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retired-')), 'c.json')
  fs.writeFileSync(p, typeof json === 'string' ? json : JSON.stringify(json))
  return p
}

test('a config still carrying releases names it', () => {
  assert.deepStrictEqual(retiredKeys({ releases: { series: [] } }), ['releases'])
  assert.deepStrictEqual(retiredKeys({ release: { stages: [], ignorePaths: [] } }), ['release.stages'])
  const row = retiredKeysRow(file({ releases: {} }), 'x.json', doctorRow)
  assert.strictEqual(row.state, 'warn', 'stale, not broken')
  assert.match(row.fix, /remove releases from x\.json/)
})

test('STAYS SILENT: a config without retired keys, or one that cannot be read', () => {
  assert.deepStrictEqual(retiredKeys({ release: { ignorePaths: [] } }), [], 'release (singular) is still read')
  assert.deepStrictEqual(retiredKeys(null), [])
  assert.strictEqual(retiredKeysRow(file({ github: {} }), 'x.json', doctorRow), null)
  assert.strictEqual(retiredKeysRow(file('{ not json'), 'x.json', doctorRow), null, 'the loader reports a bad file')
  assert.strictEqual(retiredKeysRow('/no/such/file.json', 'x.json', doctorRow), null)
})
