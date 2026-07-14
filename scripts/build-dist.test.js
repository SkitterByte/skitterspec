'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const {
  rewriteRequires,
  guardNoWorkspaceRequires,
  buildBase,
  buildLinear,
} = require('./build-dist.js')

const PKGS = path.join(__dirname, '..', 'packages')

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skitterspec-${tag}-`))
}

// Recursively copy a built distribution's runtime files to a throwaway dir OUTSIDE
// the workspace — no node_modules — so any surviving workspace require would throw
// MODULE_NOT_FOUND. This is the real proof of self-containment.
function copyDistOut(distDir, tag) {
  const out = tmpDir(tag)
  for (const item of ['bin', 'src', 'assets', 'package.json']) {
    fs.cpSync(path.join(distDir, item), path.join(out, item), { recursive: true })
  }
  return out
}

const listSkills = (proj) => fs.readdirSync(path.join(proj, '.claude', 'skills')).sort()
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8')

// --- require rewriting + guard ---------------------------------------------

test('rewriteRequires maps each workspace specifier to a relative path', () => {
  const srcRoot = '/out/src'
  // base CLI from the superset bin
  const bin = rewriteRequires(
    "require('@skitterbyte/skitterspec-common/src/cli.js')",
    '/out/bin/skitterspec-linear.js',
    srcRoot,
  )
  assert.strictEqual(bin, "require('../src/cli.js')")

  // adapter → engine, and adapter → base env from the vendored adapter
  const adapter = rewriteRequires(
    "const a = require('@skitterbyte/skitterspec-sync-core')\n" +
      "const b = require('@skitterbyte/skitterspec-common/src/env/resolve.js')",
    '/out/src/vendor/linear/cli-sync.js',
    srcRoot,
  )
  assert.match(adapter, /require\('\.\.\/sync-core'\)/)
  assert.match(adapter, /require\('\.\.\/\.\.\/env\/resolve\.js'\)/)
})

test('guardNoWorkspaceRequires throws listing any residual workspace require', () => {
  const dir = tmpDir('guard')
  fs.writeFileSync(path.join(dir, 'ok.js'), "require('./local.js')")
  fs.writeFileSync(path.join(dir, 'bad.js'), "require('@skitterbyte/skitterspec-sync-core')")
  assert.throws(() => guardNoWorkspaceRequires(dir), /bad\.js.*skitterspec-sync-core/s)
})

test('a clean tree passes the guard', () => {
  const dir = tmpDir('guard-ok')
  fs.writeFileSync(path.join(dir, 'a.js'), "require('./b.js')\nrequire('prompts')")
  assert.doesNotThrow(() => guardNoWorkspaceRequires(dir))
})

// --- base distribution ------------------------------------------------------

test('base build is tracker-free, self-contained, and installs the base skill set', () => {
  const dist = buildBase() // throws if the guard finds any workspace require

  // no sync skills / seams / Linear in the composed base assets
  const skillsDir = path.join(dist, 'assets', 'skills')
  const skills = fs.readdirSync(skillsDir)
  for (const s of ['spec-pull', 'spec-push', 'spec-status']) {
    assert.ok(!skills.includes(s), `base must not ship ${s}`)
  }
  const specSkill = read(skillsDir, 'spec', 'SKILL.md')
  assert.doesNotMatch(specSkill, /<!--\s*seam:/, 'no dangling seam marker in base')
  assert.doesNotMatch(specSkill, /linear/i, 'no Linear text in base /spec')

  // install it from a copy with no node_modules
  const outside = copyDistOut(dist, 'base-out')
  const proj = tmpDir('base-proj')
  const bin = path.join(outside, 'bin', 'skitterspec.js')
  const init = spawnSync('node', [bin, 'init', proj, '--yes', '--no-claude-md'], { encoding: 'utf8' })
  assert.strictEqual(init.status, 0, `base init failed: ${init.stderr}`)

  const installed = listSkills(proj)
  assert.ok(installed.includes('spec') && installed.includes('spec-go'), 'base skills installed')
  for (const s of ['spec-pull', 'spec-push', 'spec-status']) {
    assert.ok(!installed.includes(s), `base install must not include ${s}`)
  }
  // only the env.config templates land in .core (no linear.config)
  const core = fs.readdirSync(path.join(proj, 'specs', '.core'))
  assert.ok(!core.some((f) => f.startsWith('linear.config')), 'no linear.config in base .core')

  // the base CLI does not know spec-sync
  const sync = spawnSync('node', [bin, 'spec-sync', 'status'], { encoding: 'utf8' })
  assert.notStrictEqual(sync.status, 0, 'base spec-sync should error')
  assert.match(sync.stderr + sync.stdout, /unknown command: spec-sync/)
})

// --- superset distribution --------------------------------------------------

test('superset build fills the seams, ships sync, and runs the engine self-contained', () => {
  const dist = buildLinear() // throws if any workspace require survives the vendor rewrite

  // composed /spec now carries the Linear fragment, no dangling marker
  const specSkill = read(dist, 'assets', 'skills', 'spec', 'SKILL.md')
  assert.doesNotMatch(specSkill, /<!--\s*seam:/, 'seam filled, no marker left')
  assert.match(specSkill, /linear/i, 'Linear fragment injected into /spec')

  const outside = copyDistOut(dist, 'super-out')
  const proj = tmpDir('super-proj')
  const bin = path.join(outside, 'bin', 'skitterspec-linear.js')
  const init = spawnSync('node', [bin, 'init', proj, '--yes', '--no-claude-md'], { encoding: 'utf8' })
  assert.strictEqual(init.status, 0, `superset init failed: ${init.stderr}`)

  const installed = listSkills(proj)
  for (const s of ['spec', 'spec-go', 'spec-pull', 'spec-push', 'spec-status']) {
    assert.ok(installed.includes(s), `superset install includes ${s}`)
  }
  const core = fs.readdirSync(path.join(proj, 'specs', '.core'))
  assert.ok(core.includes('linear.config.json.example'), 'linear.config template scaffolded')
  assert.ok(core.includes('linear.config.md'), 'linear.config docs scaffolded')

  // spec-sync resolves through bin → adapter → engine → base env (rewrites intact),
  // with no live config it reports the opt-in message rather than crashing.
  const sync = spawnSync('node', [bin, 'spec-sync', 'status', '--dir', proj], { encoding: 'utf8' })
  assert.strictEqual(sync.status, 0, `spec-sync errored: ${sync.stderr}`)
  assert.match(sync.stdout, /Linear sync not enabled/)
})
