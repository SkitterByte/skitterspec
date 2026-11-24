'use strict'

// scripts/run-tests.js — `pnpm test` minus the parked sources
// (chore-park-linear-jira).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { isTestFile, discover, testFiles } = require('./run-tests.js')

const ROOT = path.join(__dirname, '..')

// One of each shape Node's default discovery has an opinion on.
const FIXTURE = [
  'a.test.js', 'b-test.cjs', 'c_test.mjs', 'test-d.js', 'test.js', 'sub/test.mjs',
  'test/helper.js', 'test/helpers/deep.js', 'sub/test/g.js', 'packages/x/test/h.test.js',
  'packages/linear/test/l.test.js',
  // Not test files to bare `node --test`:
  'node_modules/m/x.test.js', '.hidden/e.test.js', '.h.test.js', 'sub/f.spec.js', 'notes.js',
]

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-run-tests-'))
  const log = path.join(dir, 'ran.log')
  for (const rel of FIXTURE) {
    const file = path.join(dir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const line = `fs.appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(rel + '\n')})`
    fs.writeFileSync(file, rel.endsWith('.mjs') ? `import fs from 'node:fs'; ${line}\n` : `const fs = require('node:fs'); ${line}\n`)
  }
  return { dir, log }
}

test('discover finds exactly what bare node --test runs (pins the two together)', () => {
  const { dir, log } = fixture()
  try {
    // A child of a test run inherits NODE_TEST_CONTEXT and would report to the
    // parent instead of discovering; drop it so this is a real bare run.
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf8', env })
    const ran = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).sort()
    assert.deepStrictEqual(discover(dir), ran)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('testFiles drops the parked sources and keeps everything else', () => {
  const { dir } = fixture()
  try {
    const all = discover(dir)
    const kept = testFiles(dir)
    assert.ok(all.includes('packages/linear/test/l.test.js'))
    assert.deepStrictEqual(kept, all.filter((f) => f !== 'packages/linear/test/l.test.js'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an empty parked list runs the same set as bare node --test (stays silent)', () => {
  const { dir } = fixture()
  try {
    assert.deepStrictEqual(testFiles(dir, { dists: [], sources: [] }), discover(dir))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('on this repo: no parked test runs, and every other package still does', () => {
  const files = testFiles(ROOT)
  assert.ok(!files.some((f) => f.startsWith('packages/linear/') || f.startsWith('packages/jira/')))
  for (const pkg of ['common', 'github', 'azure-boards', 'sync-core', 'provider-kit']) {
    assert.ok(files.some((f) => f.startsWith(`packages/${pkg}/`)), `${pkg} still tested`)
  }
  assert.ok(files.includes('scripts/run-tests.test.js'))
})

test('isTestFile follows the default name rules', () => {
  assert.strictEqual(isTestFile('x/foo.test.cjs'), true)
  assert.strictEqual(isTestFile('x/test/fixture.mjs'), true)
  assert.strictEqual(isTestFile('x/foo.spec.js'), false)
  assert.strictEqual(isTestFile('x/testing/foo.js'), false)
  assert.strictEqual(isTestFile('x/test/data.json'), false)
})
