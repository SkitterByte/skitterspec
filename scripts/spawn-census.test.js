'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const census = require('./spawn-census.js')

test('a git spawn is counted by its verb, past any -C and -c pairs', () => {
  assert.strictEqual(census.kindOf('git', ['-C', '/r', '-c', 'x=y', 'worktree', 'list']), 'git worktree')
  assert.strictEqual(census.kindOf('/usr/bin/git.exe', ['status']), 'git status')
  assert.strictEqual(census.kindOf(process.execPath, ['-e', '1']), 'node')
  assert.strictEqual(census.kindOf('bash', ['-c', 'x']), 'sh')
})

test('the census folds lines by kind, costliest first', () => {
  const rows = census.summarize('git status\t10.4\ngit status\t9.6\nnode\t300\n')
  assert.deepStrictEqual(rows, [
    { kind: 'node', count: 1, ms: 300 },
    { kind: 'git status', count: 2, ms: 20 },
  ])
  assert.deepStrictEqual(census.table(rows, 1), ['3 spawns', '     0.3s       1  node'])
})

// STAYS SILENT: blank and malformed lines are not spawns.
test('blank and malformed lines count as nothing', () => {
  assert.deepStrictEqual(census.summarize('\nnot-a-row\n\n'), [])
})

test('loaded with --require, it records the spawns a child process makes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-census-'))
  const out = path.join(dir, 'spawns.tsv')
  try {
    execFileSync(process.execPath, ['--require', path.join(__dirname, 'spawn-census.js'), '-e', "require('node:child_process').execFileSync('git', ['--version'])"], {
      env: { ...process.env, SPAWN_CENSUS: out, NODE_OPTIONS: '' },
      stdio: 'ignore',
    })
    const rows = census.summarize(fs.readFileSync(out, 'utf8'))
    assert.deepStrictEqual(rows.map((r) => [r.kind, r.count]), [['git --version', 1]])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
