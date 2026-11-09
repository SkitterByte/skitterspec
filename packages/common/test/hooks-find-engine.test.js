'use strict'

// Both hooks find the engine by walking up from the session's directory to a
// `node_modules/.bin`. A project in a subfolder of its repo (spec
// feat-subfolder-project) may install skitterspec in that subfolder, or above
// it at the repo root — both must be found, and the nearer one wins.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOOKS = ['main-guard.cjs', 'review-gate.cjs'].map((f) => path.join(__dirname, '..', 'assets', 'hooks', f))

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-findengine-')))
}

function bin(dir, name = 'skitterspec') {
  const p = path.join(dir, 'node_modules', '.bin', name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '')
  return p
}

function withoutOverride(fn) {
  const saved = process.env.SKITTERSPEC_BIN
  delete process.env.SKITTERSPEC_BIN
  try {
    return fn()
  } finally {
    if (saved !== undefined) process.env.SKITTERSPEC_BIN = saved
  }
}

for (const hook of HOOKS) {
  const { findEngine } = require(hook)
  const name = path.basename(hook)

  test(`${name}: an engine installed in the project subfolder is found`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    const want = bin(project)
    assert.strictEqual(withoutOverride(() => findEngine(project)), want)
  })

  test(`${name}: an engine installed at the repo root, above the project, is found`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const want = bin(root, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(project)), want)
  })

  test(`${name}: the nearer install wins`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    bin(root)
    const want = bin(project)
    assert.strictEqual(withoutOverride(() => findEngine(project)), want)
  })

  test(`${name}: STAYS SILENT — nothing installed falls back to the PATH name`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const got = withoutOverride(() => findEngine(project))
    // Either the bare name, or an install found further up this machine's tree
    // (a developer's home directory may hold one) — never a path under `root`.
    assert.ok(got === 'skitterspec' || !got.startsWith(root), got)
  })
}
