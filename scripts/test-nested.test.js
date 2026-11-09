'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { nestedTestFiles } = require('./test-nested.js')

test('the nested run finds the files built on the helper — it is not vacuously green', () => {
  const files = nestedTestFiles().map((f) => path.basename(f))
  assert.ok(files.includes('cli-spec-env-anchor.test.js'), files.join(', '))
})

test('STAYS SILENT: a test that does not use the helper is not rerun', () => {
  const files = nestedTestFiles().map((f) => path.basename(f))
  assert.ok(!files.includes('env-project.test.js'), 'unit tests build no repo')
})

test('STAYS SILENT: a package with no test folder is not a finding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-nested-'))
  fs.mkdirSync(path.join(root, 'packages', 'empty'), { recursive: true })
  assert.deepStrictEqual(nestedTestFiles(root), [])
})
