'use strict'

/**
 * The bare `skitterspec` bin in a project with a ticketing provider configured.
 * Providers stopped answering to `skitterspec` (#278), so the base bin is what
 * every skill's `spec-env` call runs — and it has to pick up the provider the
 * project configured, or `land.specDocs` silently stays "trunk" (and the idea
 * store and env defaults go missing) while the provider's own bin says
 * "branch".
 *
 * The provider is found the way a global install finds it: installed beside
 * the base, here the workspace's own `@skitterbyte/skitterspec-provider-github`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const BASE_BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function project({ github }) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-basebin-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Ada')
  git(dir, 'config', 'user.email', 'ada@example.invalid')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'specs', 'backlog', 'feat-x'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), '{}\n')
  if (github) {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'github.config.json'),
      JSON.stringify({ github: { owner: 'o', repo: 'r' } }),
    )
  }
  fs.writeFileSync(path.join(dir, 'specs', 'backlog', 'feat-x', '00-overview.md'), '# Feature: x\n\n> **Type:** Feature\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

// `integrate --docs` takes the branch lane ("publish") only under
// `land.specDocs: "branch"`; the trunk lane says "integrate".
function integrateDocs(cwd) {
  return spawnSync(process.execPath, [BASE_BIN, 'spec-env', 'integrate', 'feat-x', '--docs'], { cwd, encoding: 'utf8' })
}

test('base bin: a configured provider installed beside it puts spec docs on the branch lane', (t) => {
  const dir = project({ github: true })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = integrateDocs(dir)
  assert.match(r.stdout, /nothing to publish/, `expected the branch lane, got:\n${r.stdout}${r.stderr}`)
})

test('base bin: no provider configured stays on trunk and says nothing (stays-silent)', (t) => {
  const dir = project({ github: false })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = integrateDocs(dir)
  assert.match(r.stdout, /nothing to integrate/)
  assert.strictEqual(r.stderr, '')
})

// --- registerConfiguredProvider, with the engine modules stubbed -------------

const { registerConfiguredProvider } = require('../src/provider.js')

function recorder() {
  const calls = { configFile: [], envDefaults: [], ideaStore: [] }
  return {
    calls,
    envConfig: {
      setProviderConfigFile: (f) => calls.configFile.push(f),
      setProviderEnvDefaults: (d) => calls.envDefaults.push(d),
    },
    idea: { setProviderIdeaStore: (s) => calls.ideaStore.push(s) },
  }
}

function bareProject(files) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-provider-')))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  for (const f of files) fs.writeFileSync(path.join(dir, 'specs', '.core', f), '{}\n')
  return dir
}

test('registerConfiguredProvider: runs the installed provider register on the given modules, from a subdirectory too', (t) => {
  const dir = bareProject(['github.config.json'])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const sub = path.join(dir, 'specs', 'backlog')
  fs.mkdirSync(sub, { recursive: true })

  const r = recorder()
  const warned = []
  const out = registerConfiguredProvider({ cwd: sub, ...r, warn: (l) => warned.push(l) })
  assert.deepStrictEqual(out, { provider: 'github', registered: 'full' })
  assert.match(r.calls.configFile[0], /github\.config\.json$/)
  assert.ok(r.calls.envDefaults[0].spec.companionPaths.length > 0)
  assert.strictEqual(r.calls.ideaStore[0].supports, true)
  assert.deepStrictEqual(warned, [])
})

test('registerConfiguredProvider: a published superset is found by its vendored register module', (t) => {
  const dir = bareProject(['jira.config.json'])
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-dist-'))
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(pkg, { recursive: true, force: true })
  })
  const vendored = path.join(pkg, 'src', 'vendor', 'jira')
  fs.mkdirSync(vendored, { recursive: true })
  fs.writeFileSync(
    path.join(vendored, 'register.js'),
    "module.exports = { register: ({ envConfig }) => envConfig.setProviderConfigFile('from-dist') }\n",
  )

  const r = recorder()
  const asked = []
  const out = registerConfiguredProvider({
    cwd: dir,
    ...r,
    resolve: (name) => (asked.push(name), name === '@skitterbyte/skitterspec-jira' ? pkg : null),
  })
  assert.deepStrictEqual(out, { provider: 'jira', registered: 'full' })
  assert.deepStrictEqual(r.calls.configFile, ['from-dist'])
  assert.deepStrictEqual(asked, ['@skitterbyte/skitterspec-jira'])
})

test('registerConfiguredProvider: a provider not installed still registers its config file, and warns', (t) => {
  const dir = bareProject(['azure-boards.config.json'])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = recorder()
  const warned = []
  const out = registerConfiguredProvider({ cwd: dir, ...r, resolve: () => null, warn: (l) => warned.push(l) })
  assert.deepStrictEqual(out, { provider: 'azure-boards', registered: 'config' })
  assert.match(r.calls.configFile[0], /azure-boards\.config\.json$/)
  assert.deepStrictEqual(r.calls.envDefaults, [])
  assert.deepStrictEqual(r.calls.ideaStore, [])
  assert.match(warned[0], /@skitterbyte\/skitterspec-azure-boards is not installed/)

  // The config file alone flips the lane, through the real config loader.
  const { setProviderConfigFile, loadEnvConfig } = require('../src/env/config.js')
  t.after(() => setProviderConfigFile(null))
  setProviderConfigFile(r.calls.configFile[0])
  assert.strictEqual(loadEnvConfig(dir).config.land.specDocs, 'branch')
})

test('registerConfiguredProvider: two providers configured registers neither, and warns', (t) => {
  const dir = bareProject(['github.config.json', 'linear.config.json'])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = recorder()
  const warned = []
  const out = registerConfiguredProvider({ cwd: dir, ...r, warn: (l) => warned.push(l) })
  assert.deepStrictEqual(out, { provider: null, registered: null })
  assert.deepStrictEqual(r.calls, { configFile: [], envDefaults: [], ideaStore: [] })
  assert.match(warned[0], /more than one ticketing provider/)
})

test('registerConfiguredProvider: outside any project does nothing (stays-silent)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-noproject-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = recorder()
  const warned = []
  assert.deepStrictEqual(registerConfiguredProvider({ cwd: dir, ...r, warn: (l) => warned.push(l) }), {
    provider: null,
    registered: null,
  })
  assert.deepStrictEqual(warned, [])
})

// --- provider verbs through the bare bin -------------------------------------
//
// The skills and seams still call `skitterspec spec-sync …`, and since #278
// that name runs the base, which does not ship spec-sync. With a provider
// configured and installed beside it, the base hands the verb to that
// provider's own bin, so both names give the same answer.

const PKGS = path.join(__dirname, '..', '..')

function providerBin(name) {
  return path.join(PKGS, name, 'bin', `skitterspec-${name}.js`)
}

function runBin(bin, cwd, args) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

for (const name of ['github', 'jira', 'linear', 'azure-boards']) {
  test(`base bin: spec-sync answers as skitterspec-${name} where ${name} is configured`, (t) => {
    const dir = bareProject([`${name}.config.json`])
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    git(dir, 'init', '-q', '-b', 'main')

    const args = ['spec-sync', 'ref', 'no-such-spec']
    const base = runBin(BASE_BIN, dir, args)
    assert.doesNotMatch(base.stderr, /unknown command/)
    assert.deepStrictEqual(base, runBin(providerBin(name), dir, args))
  })
}

test('base bin: spec-sync with no provider configured is still refused, naming the providers (stays-silent)', (t) => {
  const dir = bareProject([])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const r = runBin(BASE_BIN, dir, ['spec-sync', 'ref'])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /unknown command: spec-sync — this is the base distribution, which does not ship it/)
})

test('base bin: spec-sync with the provider configured but not installed names the package to install', (t) => {
  const dir = bareProject(['azure-boards.config.json'])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const { forwardProviderCommand } = require('../src/provider.js')
  const err = []
  const status = forwardProviderCommand({
    cwd: dir,
    argv: ['spec-sync', 'ref'],
    commands: ['spec-sync'],
    resolve: () => null,
    warn: (l) => err.push(l),
  })
  assert.strictEqual(status, 1)
  assert.match(err.join('\n'), /spec-sync needs @skitterbyte\/skitterspec-azure-boards installed beside this one/)
})

test('forwardProviderCommand: a verb the base ships is never forwarded (stays-silent)', (t) => {
  const dir = bareProject(['github.config.json'])
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const { forwardProviderCommand } = require('../src/provider.js')
  assert.strictEqual(forwardProviderCommand({ cwd: dir, argv: ['spec-env', 'resolve'], commands: ['spec-sync'] }), null)
})
