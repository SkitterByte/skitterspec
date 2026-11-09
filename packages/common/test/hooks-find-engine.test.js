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
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-findengine-')))
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
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: an engine installed at the repo root, above the project, is found`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const want = bin(root, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: the nearer install wins`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    bin(root)
    const want = bin(project)
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: STAYS SILENT — nothing installed falls back to the PATH name`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const got = withoutOverride(() => findEngine(project, 'linux'))
    // Either the bare name, or an install found further up this machine's tree
    // (a developer's home directory may hold one) — never a path under `root`.
    assert.ok(got === 'skitterspec' || !got.startsWith(root), got)
  })
}

// --- Windows: the package's JS entry, run through node -------------------------
//
// chore-windows-ci: on Windows the hooks spawned `.bin/<name>` — a shell shim
// spawn cannot execute (EFTYPE) — failed open, and every guard was silently off.

function jsEntry(dir, name = 'skitterspec') {
  const p = path.join(dir, 'node_modules', '@skitterbyte', name, 'bin', `${name}.js`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '')
  return p
}

for (const hook of HOOKS) {
  const { findEngine, engineCommand } = require(hook)
  const name = path.basename(hook)

  test(`${name}: on win32 the package's JS entry is found, in the project or above`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const want = jsEntry(root, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(project, 'win32')), want)
  })

  test(`${name}: on win32 it runs through node, never as the file itself`, () => {
    const root = tmp()
    const js = jsEntry(root)
    assert.deepStrictEqual(withoutOverride(() => engineCommand(root, 'win32')), { file: process.execPath, args: [js] })
  })

  test(`${name}: STAYS SILENT — a .bin shim is not what win32 runs, and POSIX is unchanged`, () => {
    const root = tmp()
    const shim = bin(root)
    const got = withoutOverride(() => findEngine(root, 'win32'))
    assert.ok(got === 'skitterspec' || !got.startsWith(root), 'the shim is not picked on win32')
    assert.deepStrictEqual(withoutOverride(() => engineCommand(root, 'linux')), { file: shim, args: [] })
  })

  test(`${name}: a .js SKITTERSPEC_BIN runs through node`, () => {
    const saved = process.env.SKITTERSPEC_BIN
    process.env.SKITTERSPEC_BIN = '/x/engine.js'
    try {
      assert.deepStrictEqual(engineCommand('/anywhere'), { file: process.execPath, args: ['/x/engine.js'] })
    } finally {
      if (saved === undefined) delete process.env.SKITTERSPEC_BIN
      else process.env.SKITTERSPEC_BIN = saved
    }
  })
}
