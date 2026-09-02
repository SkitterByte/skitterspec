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
  assert.ok(installed.includes('spec-hotfix'), 'base ships /spec-hotfix')
  assert.ok(installed.includes('spec-to-main'), 'base ships /spec-to-main')
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
  for (const s of ['spec', 'spec-go', 'spec-hotfix', 'spec-to-main', 'spec-push', 'spec-status']) {
    assert.ok(installed.includes(s), `superset install includes ${s}`)
  }
  assert.ok(!installed.includes('spec-pull'), 'one-way: no /spec-pull')
  const core = fs.readdirSync(path.join(proj, 'specs', '.core'))
  assert.ok(core.includes('linear.config.json.example'), 'linear.config template scaffolded')
  assert.ok(core.includes('linear.config.md'), 'linear.config docs scaffolded')

  // spec-sync resolves through bin → adapter → engine → base env (rewrites intact),
  // with no live config it reports the opt-in message rather than crashing.
  const sync = spawnSync('node', [bin, 'spec-sync', 'status', '--dir', proj], { encoding: 'utf8' })
  assert.strictEqual(sync.status, 0, `spec-sync errored: ${sync.stderr}`)
  assert.match(sync.stdout, /Linear sync not enabled/)
})

test('the superset bin map aliases `skitterspec` so composed skills work', () => {
  // Every shared skill invokes bare `skitterspec …`; the superset must provide
  // that name (not only `skitterspec-linear`) or every superset install's first
  // CLI call is "command not found".
  const pkg = JSON.parse(fs.readFileSync(path.join(PKGS, 'skitterspec-linear', 'package.json'), 'utf8'))
  assert.strictEqual(pkg.bin.skitterspec, pkg.bin['skitterspec-linear'], 'skitterspec aliases the superset bin')
})

// The v8 → v9 guide was thorough, correct, and NOT in the published tarball —
// `files` listed only bin/src/assets. A field report read that as "the 9.0.0
// remodel had no migration path". A docs fix that silently stops shipping is the
// same bug again, so assert the whole chain: built, listed, and identical to the
// one source at the repo root.
test('both distributions ship the migration guide', () => {
  const root = path.join(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'MIGRATION.md'), 'utf8')

  for (const pkg of ['skitterspec', 'skitterspec-linear']) {
    const dist = path.join(root, 'packages', pkg)
    const shipped = path.join(dist, 'MIGRATION.md')
    assert.ok(fs.existsSync(shipped), `${pkg} has MIGRATION.md on disk`)
    assert.strictEqual(fs.readFileSync(shipped, 'utf8'), source, `${pkg} guide matches the root source`)

    const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'package.json'), 'utf8'))
    assert.ok(manifest.files.includes('MIGRATION.md'), `${pkg} package.json ships it`)
  }
})

// A marker with no fragment composes to NOTHING — in the superset as well as the
// base. That is silent: the build succeeds, the skill ships, and the provider
// step is simply absent. The only defence is checking the two sets agree.
test('every seam referenced by a skill has a fragment to fill it', () => {
  const { loadFragments } = require('./compose.js')
  const fragments = Object.keys(loadFragments(path.join(PKGS, 'linear', 'assets', 'seams')))
  const referenced = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) {
        for (const m of fs.readFileSync(abs, 'utf8').matchAll(/<!--\s*seam:([a-z0-9-]+)\s*-->/gi)) referenced.add(m[1])
      }
    }
  }
  walk(path.join(PKGS, 'common', 'assets'))
  walk(path.join(PKGS, 'linear', 'assets', 'skills'))

  const orphans = [...referenced].filter((s) => !fragments.includes(s))
  assert.deepEqual(orphans, [], `seam markers with no fragment: ${orphans.join(', ')}`)
})

// The base check used to look at /spec alone, which only caught a dangling marker
// in the one skill that had them. Seams now sit in six skills.
test('no base skill ships a dangling seam marker', () => {
  const dist = buildBase()
  const skillsDir = path.join(dist, 'assets', 'skills')
  const offenders = []
  for (const skill of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, skill, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    if (/<!--\s*seam:/.test(fs.readFileSync(file, 'utf8'))) offenders.push(skill)
  }
  assert.deepEqual(offenders, [], `base skills with an unfilled seam marker: ${offenders.join(', ')}`)
})

test('the terminal skills carry the tracker step in the superset and not in the base', () => {
  const linear = buildLinear()
  const base = buildBase()
  for (const skill of ['spec-complete', 'spec-cancel']) {
    const withProvider = read(linear, 'assets', 'skills', skill, 'SKILL.md')
    assert.match(withProvider, /Refresh the mirror now/, `${skill} syncs in the superset`)
    assert.doesNotMatch(withProvider, /<!--\s*seam:/, `${skill} has no marker left`)

    const without = read(base, 'assets', 'skills', skill, 'SKILL.md')
    assert.doesNotMatch(without, /mirror|linear/i, `${skill} stays tracker-free in the base`)
  }
})

// --- linkability -------------------------------------------------------------

// A distribution's bin/src/assets are composed and gitignored, so a checkout that
// has not been built is a package with nothing in it. `prepare` is the lifecycle
// hook that covers install-from-directory and runs before `prepack` on publish;
// `prepack` stays as the publish-only guarantee. Both are needed and mean
// different things, so neither may quietly disappear.
test('every distribution builds itself on prepare as well as prepack', () => {
  for (const dist of ['skitterspec', 'skitterspec-linear']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKGS, dist, 'package.json'), 'utf8'))
    const expected = `node ../../scripts/build-dist.js ${dist}`
    assert.strictEqual(pkg.scripts.prepare, expected, `${dist} prepare builds itself`)
    assert.strictEqual(pkg.scripts.prepack, expected, `${dist} prepack unchanged`)
  }
})

// pnpm does NOT run `prepare` for a `link:` dependency, so an unbuilt package
// links with no bin shim at all. Once it HAS been built and linked, a later
// `git clean` leaves the shim pointing at nothing — and that is the case this
// guard exists for. Verified by running the real bin with no sibling src/.
for (const [pkgDir, binFile, name] of [
  ['common', 'skitterspec.js', 'skitterspec'],
  ['linear', 'skitterspec-linear.js', 'skitterspec-linear'],
]) {
  test(`${name}'s bin explains a missing build instead of failing to resolve`, () => {
    const dir = tmpDir('nobuild')
    fs.mkdirSync(path.join(dir, 'bin'))
    fs.copyFileSync(path.join(PKGS, pkgDir, 'bin', binFile), path.join(dir, 'bin', binFile))
    // deliberately no sibling src/
    const r = spawnSync(process.execPath, [path.join(dir, 'bin', binFile), '--help'], {
      encoding: 'utf8',
    })
    assert.strictEqual(r.status, 1, 'exits non-zero')
    assert.match(r.stderr, /no build output/, 'names the cause')
    assert.match(r.stderr, /npm run build/, 'names the fix')
    assert.doesNotMatch(r.stderr, /MODULE_NOT_FOUND/, 'not a raw resolution error')
  })
}

// A composed `bin/` entry must land EXECUTABLE. npm sets the exec bit on bin
// entries when it packs, so a published install papers over a 0644 bin and only
// `link:` consumers ever see it — as EACCES on a command that plainly exists.
// That is precisely the path `dev:link` serves, so the build has to get it right
// on its own. Asserting on content cannot see a mode, which is why this shipped:
// the superset rewrites its bin's requires (writeFileSync → 0644) while the base
// copies verbatim (copyFileSync → mode preserved), so only the superset broke.
for (const [dist, binFile] of [
  ['skitterspec', 'skitterspec.js'],
  ['skitterspec-linear', 'skitterspec-linear.js'],
]) {
  test(`${dist} composes an executable bin`, () => {
    const out = dist === 'skitterspec' ? buildBase() : buildLinear()
    const mode = fs.statSync(path.join(out, 'bin', binFile)).mode
    assert.ok(mode & 0o100, `${binFile} is owner-executable (got ${(mode & 0o777).toString(8)})`)
  })
}

// The mode rule is general, not a bin special-case: the require-rewriting branch
// of copyFile must reproduce the source's mode for every file it touches, the
// same way copyFileSync does. Pinning both ends stops a future "just chmod the
// bin" patch from re-opening the hole for anything else that needs a mode.
test('the require-rewriting copy preserves modes, executable or not', () => {
  const out = buildLinear()
  const exec = fs.statSync(path.join(out, 'bin', 'skitterspec-linear.js')).mode & 0o777
  const plain = fs.statSync(path.join(out, 'src', 'cli.js')).mode & 0o777
  const srcExec = fs.statSync(path.join(PKGS, 'linear', 'bin', 'skitterspec-linear.js')).mode & 0o777
  const srcPlain = fs.statSync(path.join(PKGS, 'common', 'src', 'cli.js')).mode & 0o777
  assert.strictEqual(exec, srcExec, 'bin keeps the source mode')
  assert.strictEqual(plain, srcPlain, 'a rewritten src file keeps the source mode')
  assert.ok(!(plain & 0o100), 'a non-bin source file is not made executable')
})
