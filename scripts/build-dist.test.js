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
  assert.ok(installed.includes('spec') && installed.includes('spec-start'), 'base skills installed')
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
  for (const s of ['spec', 'spec-next', 'spec-hotfix', 'spec-to-main', 'spec-push', 'spec-status']) {
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
  const { loadFragments, mergeFragments } = require('./compose.js')
  // Both sources: common owns the fragments shared between its OWN skills (filled
  // in every distribution), the provider owns the tracker ones (filled only in the
  // superset). A marker is an orphan only when NEITHER supplies it.
  const fragments = Object.keys(
    mergeFragments(
      loadFragments(path.join(PKGS, 'common', 'seams')),
      loadFragments(path.join(PKGS, 'linear', 'assets', 'seams')),
    ),
  )
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

// The INVERSE of the marker guard above, and the direction it cannot see. That
// one asks "does every marker have a fragment?"; a skill can still send the
// reader to a section that no marker ever brings in, because the prose doing the
// pointing lives in a SHARED fragment while the section arrives via a marker each
// skill must carry itself. /spec and /spec-push carried it; /spec-bug and
// /spec-hotfix pointed at it and did not, so an agent following either one
// literally hit a dead end — silently, since composing succeeds either way.
test('no composed skill points at a section it does not define', () => {
  const dist = buildLinear()
  const skillsDir = path.join(dist, 'assets', 'skills')
  // "run the picker in **Name** below" / "see **Name** below" — a cross-reference
  // to a section of this same file, which must therefore have that heading.
  const CROSSREF = /\*\*([A-Z][^*\n]{3,60})\*\* below/g
  const offenders = []
  for (const skill of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, skill, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    for (const [, name] of text.matchAll(CROSSREF)) {
      const heading = new RegExp(`^#{1,4} ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm')
      if (!heading.test(text)) offenders.push(`${skill} → "${name}"`)
    }
  }
  assert.deepEqual(offenders, [], `dangling cross-references: ${offenders.join(', ')}`)
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

// `init` reports the two opt-ins from what is on disk. Isolation always did;
// tracker sync did not — it printed "opt-in: run /…-setup" even on a repo that
// had already configured it, telling you to set up what was already set up. The
// base must still say nothing at all, having no provider to name.
test('init reports tracker sync as ON once its config exists', () => {
  const outside = copyDistOut(buildLinear(), 'tracker-note')
  const proj = tmpDir('tracker-proj')
  const bin = path.join(outside, 'bin', 'skitterspec-linear.js')
  const init = () =>
    spawnSync(process.execPath, [bin, 'init', proj, '--yes', '--no-claude-md'], { encoding: 'utf8' })
      .stdout

  assert.match(init(), /Tracker sync is opt-in: run \/spec-linear-setup/, 'unconfigured')

  fs.writeFileSync(
    path.join(proj, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({ linear: { teamId: 'team-abc' } }),
  )
  const after = init()
  assert.match(after, /Tracker sync is ON: linear/, 'configured')
  assert.doesNotMatch(after, /Tracker sync is opt-in/, 'and not both at once')
})

test('the base names no tracker at all, configured or not', () => {
  const outside = copyDistOut(buildBase(), 'tracker-note-base')
  const proj = tmpDir('tracker-proj-base')
  const bin = path.join(outside, 'bin', 'skitterspec.js')
  spawnSync(process.execPath, [bin, 'init', proj, '--yes', '--no-claude-md'], { encoding: 'utf8' })
  // Even with a provider's config present, the base ships no setup skill and so
  // has no provider to name — it must stay silent rather than guess.
  fs.writeFileSync(
    path.join(proj, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({ linear: { teamId: 'team-abc' } }),
  )
  const out = spawnSync(process.execPath, [bin, 'init', proj, '--yes', '--no-claude-md'], {
    encoding: 'utf8',
  }).stdout
  assert.doesNotMatch(out, /Tracker sync/i)
  assert.doesNotMatch(out, /linear/i, 'the base stays tracker-free')
})

// --- provider rules ----------------------------------------------------------
//
// `build-dist` originally overlaid only the provider's `skills` and `core`, so a
// rule added under `packages/linear/assets/rules/` was composed away silently:
// present in the source, absent from the distribution, and therefore never
// installed. Nothing failed. These pin the overlay in both directions.

test('a provider rule reaches the superset and is installed by init', () => {
  const dist = buildLinear()
  const rules = fs.readdirSync(path.join(dist, 'assets', 'rules'))
  assert.ok(rules.includes('commit-trailers.md'), `superset must ship the provider rule, got ${rules}`)

  const outside = copyDistOut(dist, 'linear-rules-out')
  const proj = tmpDir('linear-rules-proj')
  const bin = path.join(outside, 'bin', 'skitterspec-linear.js')
  const init = spawnSync('node', [bin, 'init', proj, '--yes', '--no-claude-md'], { encoding: 'utf8' })
  assert.strictEqual(init.status, 0, `superset init failed: ${init.stderr}`)

  const installed = fs.readdirSync(path.join(proj, '.claude', 'rules'))
  assert.ok(installed.includes('commit-trailers.md'), `init must install it, got ${installed}`)

  // THE OTHER DIRECTION, and the one with no symptom. The provider's rules are
  // OVERLAID onto the common tree; if that ever became a replace, every base
  // rule would vanish from the superset and nothing here would have failed —
  // the provider rule above would still be present. `spec-reports.md` is named
  // rather than covered by a count because all 17 skills point at it, so losing
  // it turns every skill into a reference to a file the project does not have.
  assert.ok(rules.includes('spec-reports.md'), `superset must keep the common rules, got ${rules}`)
  assert.ok(rules.includes('spec-planning.md'), `superset must keep the common rules, got ${rules}`)
  assert.ok(installed.includes('spec-reports.md'), `init must install it, got ${installed}`)
})

test('the tracker-free base ships no provider rule', () => {
  const rules = fs.readdirSync(path.join(buildBase(), 'assets', 'rules'))
  assert.ok(!rules.includes('commit-trailers.md'), 'the base must stay tracker-free')
  assert.ok(rules.includes('spec-planning.md'), 'but it still ships the common rules')
})

// --- the provider's isolation-config defaults --------------------------------
//
// `spec-env stage` splits a dirty tree into the paths that are this spec's and
// the paths that are not, and it is deliberately EXACT: a project declares each
// companion file by name in `spec.companionPaths`, because a prefix match over
// `specs/.core/linear-base/` would hand one spec another spec's snapshot.
//
// The superset is the component that writes that snapshot, and it shipped the
// base's empty defaults verbatim — so a fresh install reported a spec's OWN
// snapshot as foreign, to the very `/spec-complete` skill that asserts it is
// declared. The end of that is `spec-env integrate` refusing to land a branch
// over the uncommitted file, which is the failure the skill says it prevents.
//
// BOTH KEYS OR NEITHER is the half that hides: `expandCompanion`
// (`common/src/env/classify.js`) expands `{identifier}` only when
// `branch.identifierField` names a frontmatter field to read it from, so a
// config carrying only `companionPaths` looks applied and changes no behaviour.
// `the two keys are one fix` below is what stops that trap shipping again.

const SNAPSHOT_PATTERN = 'specs/.core/linear-base/{identifier}.base.json'

const exampleOf = (dist) =>
  JSON.parse(read(dist, 'assets', 'core', 'env.config.json.example'))

test('the superset declares the two isolation keys its own snapshot needs', () => {
  const example = exampleOf(buildLinear())
  assert.strictEqual(
    example.branch.identifierField,
    'linear_identifier',
    'the frontmatter field `spec-sync apply` stamps',
  )
  assert.deepStrictEqual(example.spec.companionPaths, [SNAPSHOT_PATTERN])
})

test('the companion pattern is derived from where the snapshot is actually written', () => {
  // Not a second copy of the path. `sync.baseDir` is the one place the snapshot
  // directory is decided, and a pattern typed out beside it is free to drift
  // from it silently — the config would stay valid and own nothing.
  const { DEFAULT_CONFIG } = require('../packages/linear/src/config.js')
  const [pattern] = exampleOf(buildLinear()).spec.companionPaths
  assert.strictEqual(path.posix.dirname(pattern), DEFAULT_CONFIG.sync.baseDir)
})

test('the tracker-free base declares neither key', () => {
  // The base knows nothing about any tracker, so it has no companion to name —
  // and a base that shipped Linear's would point every install at a directory
  // nothing writes.
  const example = exampleOf(buildBase())
  assert.strictEqual(example.branch.identifierField, '')
  assert.deepStrictEqual(example.spec.companionPaths, [])
})

test('the superset keeps every other key the base example ships', () => {
  // The defaults are MERGED into the composed example, not written over it. A
  // replace would be invisible here and catastrophic there: the example is
  // copied verbatim into a new project, so a dropped key opts every fresh
  // install out of whatever it configured.
  const base = exampleOf(buildBase())
  const superset = exampleOf(buildLinear())
  for (const key of Object.keys(base)) {
    assert.ok(key in superset, `superset example dropped ${key}`)
  }
  assert.deepStrictEqual(superset.branch.pattern, base.branch.pattern, 'branch.pattern untouched')
  assert.deepStrictEqual(superset.review, base.review, 'sibling sections untouched')
})

// --- what the keys buy, end to end -------------------------------------------

// A repo as a fresh superset install leaves it: isolation adopted from the
// shipped example, one committed spec carrying the identifier `spec-sync apply`
// stamps, and its snapshot sitting uncommitted beside it.
function installedRepo(bin, tag, { patch = null } = {}) {
  const proj = tmpDir(tag)
  const init = spawnSync('node', [bin, 'init', proj, '--yes', '--no-claude-md', '--isolation'], {
    encoding: 'utf8',
  })
  assert.strictEqual(init.status, 0, `init failed: ${init.stderr}`)

  const cfgPath = path.join(proj, 'specs', '.core', 'env.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.baseBranch = 'main'
  cfg.docker = { enabled: false }
  if (patch) patch(cfg)
  fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`)

  const git = (...args) =>
    spawnSync('git', ['-C', proj, ...args], { encoding: 'utf8', stdio: 'pipe' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  const specDir = path.join(proj, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    '---\nlinear_identifier: "ERQ-545"\n---\n\n# X\n\n> **Stack:** worktree\n',
  )
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  git('branch', '-M', 'main')

  const snapshot = path.join(proj, 'specs', '.core', 'linear-base', 'ERQ-545.base.json')
  fs.mkdirSync(path.dirname(snapshot), { recursive: true })
  fs.writeFileSync(snapshot, '{}\n')
  return { proj, cfgPath }
}

const staged = (bin, proj) =>
  JSON.parse(
    spawnSync('node', [bin, 'spec-env', 'stage', 'feat-alpha', '--dir', proj, '--json'], {
      encoding: 'utf8',
    }).stdout,
  )

test("a fresh superset install owns a spec's own Linear snapshot", () => {
  // THE ACCEPTANCE CRITERION. Nothing is hand-edited between `init --isolation`
  // and this call — that is the whole defect: the install was the thing that
  // had to be corrected by hand, seven times on one spec in the repo that
  // reported it.
  const bin = path.join(copyDistOut(buildLinear(), 'companion-out'), 'bin', 'skitterspec-linear.js')
  const { proj } = installedRepo(bin, 'companion-proj')
  const r = staged(bin, proj)
  assert.deepStrictEqual(r.owned, ['specs/.core/linear-base/ERQ-545.base.json'])
  assert.deepStrictEqual(r.foreign, [])
})

test('the two keys are one fix — companionPaths alone owns nothing', () => {
  // The trap this bug shipped inside. Blanking `identifierField` leaves a
  // config that still NAMES the snapshot and still expands to nothing, so a
  // one-key repair reads as applied and changes no behaviour.
  //
  // It is the test above that this one gives its meaning to: alone, that test
  // cannot tell a fix that set both keys from one that set either. If THIS
  // test ever fails, the pattern stopped depending on the field and the pair
  // is no longer being proved to have arrived together.
  const bin = path.join(copyDistOut(buildLinear(), 'one-key-out'), 'bin', 'skitterspec-linear.js')
  const { proj } = installedRepo(bin, 'one-key-proj', {
    patch: (cfg) => {
      cfg.branch.identifierField = ''
    },
  })
  const r = staged(bin, proj)
  assert.deepStrictEqual(r.owned, [])
  assert.deepStrictEqual(r.foreign, ['specs/.core/linear-base/ERQ-545.base.json'])
})

// --- stays silent -------------------------------------------------------------

test("another spec's snapshot, and an unrelated core file, stay foreign", () => {
  // The exactness the report asked not to trade away. Declaring the companion
  // by name must not become "anything under linear-base/", which would hand one
  // spec another spec's snapshot — and `specs/.core/` holds the project's own
  // files, which belong to no spec at all.
  const bin = path.join(copyDistOut(buildLinear(), 'foreign-out'), 'bin', 'skitterspec-linear.js')
  const { proj } = installedRepo(bin, 'foreign-proj')
  fs.writeFileSync(path.join(proj, 'specs', '.core', 'linear-base', 'ERQ-999.base.json'), '{}\n')
  fs.appendFileSync(path.join(proj, 'specs', '.core', 'env.config.md'), '\nedited\n')

  const r = staged(bin, proj)
  assert.deepStrictEqual(r.owned, ['specs/.core/linear-base/ERQ-545.base.json'])
  assert.deepStrictEqual(r.foreign.sort(), [
    'specs/.core/env.config.md',
    'specs/.core/linear-base/ERQ-999.base.json',
  ])
})

test('a spec with no identifier claims nothing extra, and does not error', () => {
  // An ordinary state, not a broken one: a spec never pushed to Linear has no
  // `linear_identifier`, so the pattern expands to nothing and matches nothing.
  // Setting `identifierField` must not turn that into a failure.
  const bin = path.join(copyDistOut(buildLinear(), 'unlinked-out'), 'bin', 'skitterspec-linear.js')
  const { proj } = installedRepo(bin, 'unlinked-proj')
  const overview = path.join(proj, 'specs', 'in-progress', 'feat-alpha', '00-overview.md')
  fs.writeFileSync(overview, '# X\n\n> **Stack:** worktree\n')

  const out = spawnSync('node', [bin, 'spec-env', 'stage', 'feat-alpha', '--dir', proj, '--json'], {
    encoding: 'utf8',
  })
  assert.strictEqual(out.status, 0, `stage must stay quiet, got: ${out.stderr}`)
  const r = JSON.parse(out.stdout)
  assert.deepStrictEqual(r.owned, ['specs/in-progress/feat-alpha/00-overview.md'])
  assert.deepStrictEqual(r.foreign, ['specs/.core/linear-base/ERQ-545.base.json'])
})

test('declaring identifierField does not change branch names', () => {
  // The worry `identifierField` raises, answered rather than reasoned about.
  // `branchFor` consults the field ONLY when `branch.pattern` contains
  // `{identifier}`, and the shipped pattern is `{type}/{slug}` — so a spec with
  // an identifier and one without must produce the same shape of branch name.
  const { branchFor } = require('../packages/common/src/env/resolve.js')
  const example = exampleOf(buildLinear())
  const spec = { slug: 'alpha', type: 'feat', folder: 'feat-alpha', path: null }
  assert.strictEqual(
    branchFor(spec, example),
    branchFor(spec, { ...example, branch: { ...example.branch, identifierField: '' } }),
  )
  assert.strictEqual(branchFor(spec, example), 'feat/alpha')
})

test('an install that already chose its own keys is left alone', () => {
  // `env.config.json` is PROTECTED_CONFIG: `init` writes it only when isolation
  // is being adopted, and `copyAsset` declines to overwrite one that exists.
  // A project that set a different companion — or deliberately set none — must
  // survive a re-init and an update untouched.
  const bin = path.join(copyDistOut(buildLinear(), 'keep-out'), 'bin', 'skitterspec-linear.js')
  const proj = tmpDir('keep-proj')
  fs.mkdirSync(path.join(proj, 'specs', '.core'), { recursive: true })
  const cfgPath = path.join(proj, 'specs', '.core', 'env.config.json')
  const chosen = { branch: { identifierField: 'ticket' }, spec: { companionPaths: ['ours/{slug}.json'] } }
  fs.writeFileSync(cfgPath, `${JSON.stringify(chosen, null, 2)}\n`)

  for (const argv of [
    ['init', proj, '--yes', '--no-claude-md', '--isolation'],
    ['update', proj, '--yes'],
  ]) {
    const r = spawnSync('node', [bin, ...argv], { encoding: 'utf8' })
    assert.strictEqual(r.status, 0, `${argv[0]} failed: ${r.stderr}`)
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(cfgPath, 'utf8')), chosen, `${argv[0]} rewrote it`)
  }
})
