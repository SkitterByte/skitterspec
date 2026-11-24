'use strict'

/**
 * `skitterspec init` / `update` in a project with a ticketing provider
 * configured (bug-base-update-clobbers-provider).
 *
 * The base distribution installs its OWN asset set, so a bare `skitterspec
 * update` in a provider project used to prune the provider-only skills,
 * rewrite the shared skills without their tracker seams, delete the provider
 * docs from specs/.core/ and record the base in the manifest — reporting
 * nothing. Now the install verbs go to the provider's own bin, and both names
 * leave the same tree.
 *
 * The provider is found the way a local install finds it: a symlink in the
 * fixture's node_modules to the workspace's composed distribution. Parked
 * distributions (scripts/parked.json) are not built, so not tested.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { active } = require('../../../scripts/parked.js')

const PKGS = path.join(__dirname, '..', '..')
const BASE_BIN = path.join(PKGS, 'skitterspec', 'bin', 'skitterspec.js')
const PROVIDERS = active(['github', 'linear', 'jira', 'azure-boards'].map((n) => `skitterspec-${n}`)).map((d) =>
  d.replace(/^skitterspec-/, ''),
)

const distDir = (name) => path.join(PKGS, `skitterspec-${name}`)
const providerBin = (name) => path.join(distDir(name), 'bin', `skitterspec-${name}.js`)

function run(bin, cwd, args) {
  const r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', stdin: 'ignore' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

function fixture({ provider, installed = true }) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-instprov-')))
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'])
  if (provider && installed) {
    fs.mkdirSync(path.join(dir, 'node_modules', '@skitterbyte'), { recursive: true })
    fs.symlinkSync(distDir(provider), path.join(dir, 'node_modules', '@skitterbyte', `skitterspec-${provider}`), 'junction')
  }
  return dir
}

function configure(dir, provider) {
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', `${provider}.config.json`), '{}\n')
}

// Every file under `dir` (not .git, not node_modules) → sha1 of its content,
// with the fixture's own path normalised so two fixtures compare.
function snapshot(dir) {
  const out = {}
  const walk = (at) => {
    for (const e of fs.readdirSync(at, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue
      const p = path.join(at, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) {
        const text = fs.readFileSync(p, 'utf8').split(dir).join('<dir>')
        out[path.relative(dir, p).split(path.sep).join('/')] = crypto.createHash('sha1').update(text).digest('hex')
      }
    }
  }
  walk(dir)
  return out
}

const skills = (dir) => fs.readdirSync(path.join(dir, '.claude', 'skills')).sort()
const providerOnlySkills = (name) => {
  const base = new Set(fs.readdirSync(path.join(PKGS, 'skitterspec', 'assets', 'skills')))
  return fs.readdirSync(path.join(distDir(name), 'assets', 'skills')).filter((s) => !base.has(s))
}

for (const name of PROVIDERS) {
  test(`base bin: update in a ${name} project leaves exactly what skitterspec-${name} update leaves`, (t) => {
    const dir = fixture({ provider: name })
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
    assert.strictEqual(run(providerBin(name), dir, ['init', '--local', '--yes']).status, 0)
    configure(dir, name)
    assert.strictEqual(run(providerBin(name), dir, ['update']).status, 0)
    const before = snapshot(dir)

    const r = run(BASE_BIN, dir, ['update'])
    assert.strictEqual(r.status, 0, r.stderr)
    assert.deepStrictEqual(snapshot(dir), before)

    const only = providerOnlySkills(name)
    assert.ok(only.length > 0, `${name} ships provider-only skills`)
    for (const s of only) assert.ok(skills(dir).includes(s), `${s} survives`)
    assert.match(fs.readFileSync(path.join(dir, '.claude', 'skills', 'spec-next', 'SKILL.md'), 'utf8'), /spec-sync/)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), 'utf8'))
    assert.strictEqual(manifest.distribution, `@skitterbyte/skitterspec-${name}`)
  })

  test(`base bin: init in a ${name} project writes what skitterspec-${name} init writes`, (t) => {
    const viaProvider = fixture({ provider: name })
    const viaBase = fixture({ provider: name })
    t.after(() => {
      fs.rmSync(viaProvider, { recursive: true, force: true })
      fs.rmSync(viaBase, { recursive: true, force: true })
    })
    configure(viaProvider, name)
    configure(viaBase, name)
    assert.strictEqual(run(providerBin(name), viaProvider, ['init', '--local', '--yes']).status, 0)
    const r = run(BASE_BIN, viaBase, ['init', '--local', '--yes'])
    assert.strictEqual(r.status, 0, r.stderr)

    const a = snapshot(viaProvider)
    const b = snapshot(viaBase)
    assert.deepStrictEqual(Object.keys(b).sort(), Object.keys(a).sort())
    assert.deepStrictEqual(b, a)
  })
}

test('base bin: update with the provider configured but not installed refuses and writes nothing', (t) => {
  const name = PROVIDERS[0]
  const dir = fixture({ provider: name })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  assert.strictEqual(run(providerBin(name), dir, ['init', '--local', '--yes']).status, 0)
  configure(dir, name)
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true })
  const before = snapshot(dir)

  const r = run(BASE_BIN, dir, ['update'])
  assert.notStrictEqual(r.status, 0)
  assert.match(r.stderr, new RegExp(`@skitterbyte/skitterspec-${name}`))
  assert.deepStrictEqual(snapshot(dir), before)
})

test('base bin: update with two providers configured refuses and writes nothing', (t) => {
  const dir = fixture({ provider: null })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  assert.strictEqual(run(BASE_BIN, dir, ['init', '--local', '--yes']).status, 0)
  configure(dir, 'github')
  configure(dir, 'azure-boards')
  const before = snapshot(dir)

  const r = run(BASE_BIN, dir, ['update'])
  assert.notStrictEqual(r.status, 0)
  assert.match(r.stderr, /more than one ticketing provider/)
  assert.deepStrictEqual(snapshot(dir), before)
})

test('base bin: update with no provider configured is the base install (stays-silent)', (t) => {
  const dir = fixture({ provider: null })
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  assert.strictEqual(run(BASE_BIN, dir, ['init', '--local', '--yes']).status, 0)
  const before = snapshot(dir)

  const r = run(BASE_BIN, dir, ['update'])
  assert.strictEqual(r.status, 0)
  assert.strictEqual(r.stderr, '')
  assert.deepStrictEqual(snapshot(dir), before)
  assert.deepStrictEqual(skills(dir), fs.readdirSync(path.join(PKGS, 'skitterspec', 'assets', 'skills')).sort())
})

// --- update --all picks the distribution ------------------------------------

const { distributionOf } = require('../src/updateall.js')

test('update --all: a configured provider wins over a manifest a base update rewrote', () => {
  const exists = (p) => p.endsWith(path.join('specs', '.core', 'azure-boards.config.json'))
  assert.strictEqual(
    distributionOf('/p', { distribution: '@skitterbyte/skitterspec' }, exists),
    '@skitterbyte/skitterspec-azure-boards',
  )
})

test('update --all: with no provider configured the manifest still decides (stays-silent)', () => {
  assert.strictEqual(
    distributionOf('/p', { distribution: '@skitterbyte/skitterspec-github' }, () => false),
    '@skitterbyte/skitterspec-github',
  )
})
