'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, SKILLS, RULES } = require('../src/init.js')
const { parse, resolveRelease } = require('../src/cli.js')
const { loadConfig } = require('../src/config.js')

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-'))
  return dir
}

// Build a release config like the CLI passes into init().
function release({ changelog = true, releases = true, versionHook = false } = {}) {
  return {
    changelog: { enabled: changelog, file: 'CHANGELOG.md' },
    releases: { enabled: releases, file: 'RELEASES.md', productName: 'Demo', scopeAreas: {} },
    versionHook,
  }
}

const exists = (dir, ...p) => fs.existsSync(path.join(dir, ...p))
const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

test('init scaffolds skills, rule, folders', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  for (const name of SKILLS) {
    assert.ok(
      fs.existsSync(path.join(dir, '.claude', 'skills', name, 'SKILL.md')),
      `skill ${name} installed`,
    )
  }
  for (const r of RULES) {
    assert.ok(
      fs.existsSync(path.join(dir, '.claude', 'rules', r)),
      `rule ${r} installed`,
    )
  }
  for (const f of ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']) {
    assert.ok(fs.existsSync(path.join(dir, 'specs', f)), `folder ${f}`)
  }
  // the folder index files are retired — never created...
  assert.ok(!exists(dir, 'specs', 'backlog', '00-index.md'), 'no backlog index')
  assert.ok(!exists(dir, 'specs', 'complete', '00-index.md'), 'no complete index')
  // ...and the buckets are kept in git by a .gitkeep instead
  assert.ok(exists(dir, 'specs', 'backlog', '.gitkeep'), 'backlog kept via .gitkeep')
  assert.ok(exists(dir, 'specs', 'complete', '.gitkeep'), 'complete kept via .gitkeep')

  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /## Spec workflow/)
  assert.match(claude, /<!-- skitterspec:start -->/)
})

test('removes retired folder index files left by an earlier version', async () => {
  const dir = tmpProject()
  // simulate an old install that scaffolded the index files
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  fs.writeFileSync(path.join(dir, 'specs', 'backlog', '00-index.md'), '| Added |\n')
  fs.writeFileSync(path.join(dir, 'specs', 'complete', '00-index.md'), '| Completed |\n')

  // re-running (init or update) migrates them away
  await init({ dir, force: false, claudeMd: false, mode: 'update' })

  assert.ok(!exists(dir, 'specs', 'backlog', '00-index.md'), 'backlog index removed')
  assert.ok(!exists(dir, 'specs', 'complete', '00-index.md'), 'complete index removed')
  // the emptied buckets stay tracked via .gitkeep
  assert.ok(exists(dir, 'specs', 'backlog', '.gitkeep'), 'backlog kept via .gitkeep')
  assert.ok(exists(dir, 'specs', 'complete', '.gitkeep'), 'complete kept via .gitkeep')
})

test('registers the per-spec isolation skills', () => {
  assert.ok(SKILLS.includes('spec-env'), 'spec-env registered')
  assert.ok(SKILLS.includes('spec-env-down'), 'spec-env-down registered')
})

test('registers the Linear hybrid-sync skills', () => {
  assert.ok(SKILLS.includes('spec-status'), 'spec-status registered')
  assert.ok(SKILLS.includes('spec-pull'), 'spec-pull registered')
  assert.ok(SKILLS.includes('spec-push'), 'spec-push registered')
})

test('init scaffolds the opt-in isolation config into specs/.core', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  // the example template is scaffolded (consumer copies it to opt in)...
  assert.ok(exists(dir, 'specs', '.core', 'env.config.json.example'), 'example scaffolded')
  assert.ok(exists(dir, 'specs', '.core', 'env.config.md'), 'field docs scaffolded')
  // ...but the live config is NOT created (feature stays off until opted in)
  assert.ok(!exists(dir, 'specs', '.core', 'env.config.json'), 'live config not auto-created')
})

test('init --isolation activates the live env.config.json', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  const live = path.join(dir, 'specs', '.core', 'env.config.json')
  assert.ok(fs.existsSync(live), 'live config written')
  // it is a copy of the shipped example (activated, not a stub)
  const example = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json.example'), 'utf8')
  assert.strictEqual(fs.readFileSync(live, 'utf8'), example, 'live config matches the example')
})

test('init without isolation does not activate env.config.json', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: false })
  assert.ok(!exists(dir, 'specs', '.core', 'env.config.json'), 'live config not created')
})

const readLocalSettings = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))

test('init --isolation trusts the absolute worktree root in settings.local.json', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocalSettings(dir).permissions.additionalDirectories, [expected])
})

test('init without isolation writes no settings.local.json', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: false })
  assert.ok(!exists(dir, '.claude', 'settings.local.json'), 'no settings.local.json written')
})

test('init --isolation preserves a pre-existing permissions.allow', async () => {
  const dir = tmpProject()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ permissions: { allow: ['Bash(npm test *)'] } }, null, 2))
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  const settings = readLocalSettings(dir)
  assert.deepStrictEqual(settings.permissions.allow, ['Bash(npm test *)'], 'allow survived')
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(settings.permissions.additionalDirectories, [expected], 'root added')
})

test('init --isolation trusting is idempotent — a second run adds nothing', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocalSettings(dir).permissions.additionalDirectories, [expected])
})

test('update never activates isolation, even with isolation:true', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  await init({ dir, force: true, claudeMd: false, mode: 'update', isolation: true })
  assert.ok(!exists(dir, 'specs', '.core', 'env.config.json'), 'update did not turn isolation on')
})

test('init --isolation is idempotent — a second run preserves edits', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  const live = path.join(dir, 'specs', '.core', 'env.config.json')
  fs.writeFileSync(live, '{"edited":true}\n')
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  assert.strictEqual(fs.readFileSync(live, 'utf8'), '{"edited":true}\n', 'edit preserved without --force')
  await init({ dir, force: true, claudeMd: false, mode: 'init', isolation: true })
  assert.notStrictEqual(fs.readFileSync(live, 'utf8'), '{"edited":true}\n', '--force refreshed it')
})

test('parse reads the --isolation / --no-isolation flags', () => {
  assert.strictEqual(parse(['--isolation']).opts.isolation, true)
  assert.strictEqual(parse(['--no-isolation']).opts.isolation, false)
  assert.strictEqual(parse([]).opts.isolation, undefined)
})

test('init is idempotent — second run does not clobber edits', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: false, claudeMd: true, mode: 'init' })
  assert.equal(fs.readFileSync(skill, 'utf8'), 'EDITED', 'edit preserved without --force')
})

test('update --force overwrites skill files', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: true, claudeMd: true, mode: 'update' })
  assert.notEqual(fs.readFileSync(skill, 'utf8'), 'EDITED', 'update overwrote the skill')
})

test('respects an existing manual Spec workflow section', async () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# proj\n\n## Spec workflow\n\nmine\n')
  await init({ dir, force: false, claudeMd: true, mode: 'init' })
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.doesNotMatch(claude, /skitterspec:start/, 'did not inject over a manual section')
})

// --- release tooling --------------------------------------------------------

test('writes skitterspec.config.json with the chosen values', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release() })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'skitterspec.config.json'), 'utf8'))
  assert.strictEqual(cfg.version, 1)
  assert.strictEqual(cfg.changelog.file, 'CHANGELOG.md')
  assert.strictEqual(cfg.releases.productName, 'Demo')
  assert.strictEqual(cfg.versionHook, false)
})

test('copies scripts only for enabled features, with the shared lib', async () => {
  const dir = tmpProject()
  await init({
    dir,
    force: false,
    claudeMd: false,
    mode: 'init',
    release: release({ changelog: true, releases: false }),
  })
  assert.ok(exists(dir, 'scripts', 'generate-changelog.js'), 'changelog script copied')
  assert.ok(!exists(dir, 'scripts', 'generate-releases.js'), 'releases script NOT copied')
  assert.ok(exists(dir, 'scripts', 'lib', 'git-commits.js'), 'shared lib copied')
  assert.ok(exists(dir, 'scripts', 'lib', 'config.js'), 'config lib copied')
})

test('copies no scripts when both features are disabled', async () => {
  const dir = tmpProject()
  await init({
    dir,
    force: false,
    claudeMd: false,
    mode: 'init',
    release: release({ changelog: false, releases: false }),
  })
  assert.ok(!exists(dir, 'scripts'), 'scripts/ not created')
})

test('wires the version hook when package.json exists and is opted in', async () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8')
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })

  const scripts = readPkg(dir).scripts
  assert.match(scripts.version, /generate-changelog\.js/)
  assert.match(scripts.version, /generate-releases\.js/)
  assert.match(scripts.version, /git add CHANGELOG\.md RELEASES\.md/)
  assert.strictEqual(scripts.changelog, 'node scripts/generate-changelog.js')
  assert.strictEqual(scripts['releases:retro'], 'node scripts/generate-releases.js --retro')
})

test('skips the version hook when no package.json is present', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.ok(!exists(dir, 'package.json'), 'no package.json was created')
})

test('preserves a custom version script without --force, overwrites with it', async () => {
  const dir = tmpProject()
  const pkgPath = path.join(dir, 'package.json')
  fs.writeFileSync(pkgPath, JSON.stringify({ name: 'demo', scripts: { version: 'my-custom' } }), 'utf8')

  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.strictEqual(readPkg(dir).scripts.version, 'my-custom', 'custom version kept without --force')
  // helper scripts still added alongside the preserved version script
  assert.strictEqual(readPkg(dir).scripts.changelog, 'node scripts/generate-changelog.js')

  await init({ dir, force: true, claudeMd: false, mode: 'init', release: release({ versionHook: true }) })
  assert.match(readPkg(dir).scripts.version, /generate-changelog\.js/, '--force overwrote version')
})

test('update re-syncs scripts without clobbering config', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', release: release() })

  // user edits both the config and a copied script
  const cfgPath = path.join(dir, 'skitterspec.config.json')
  const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  edited.releases.productName = 'Renamed'
  fs.writeFileSync(cfgPath, JSON.stringify(edited), 'utf8')
  const scriptPath = path.join(dir, 'scripts', 'generate-changelog.js')
  fs.writeFileSync(scriptPath, 'EDITED', 'utf8')

  await init({ dir, force: true, claudeMd: false, mode: 'update' })

  assert.strictEqual(loadConfig(dir).releases.productName, 'Renamed', 'config left untouched')
  assert.notStrictEqual(fs.readFileSync(scriptPath, 'utf8'), 'EDITED', 'script re-synced')
})

// --- non-interactive flag resolution (drives the no-TTY / --yes path) -------

test('resolveRelease applies flags over the existing/default config', () => {
  const dir = tmpProject()
  const existing = loadConfig(dir) // all defaults; productName = dir basename
  const { opts } = parse(['--no-changelog', '--releases-file=NOTES.md', '--product-name=Acme'])
  const r = resolveRelease(existing, opts)
  assert.strictEqual(r.changelog.enabled, false, 'flag disabled changelog')
  assert.strictEqual(r.releases.enabled, true, 'releases default kept')
  assert.strictEqual(r.releases.file, 'NOTES.md', 'releases filename from flag')
  assert.strictEqual(r.releases.productName, 'Acme', 'product name from flag')
})

test('resolveRelease falls back to existing values when no flags given', () => {
  const dir = tmpProject()
  const existing = loadConfig(dir)
  const { opts } = parse([])
  const r = resolveRelease(existing, opts)
  assert.strictEqual(r.changelog.enabled, true)
  assert.strictEqual(r.releases.file, 'RELEASES.md')
  assert.strictEqual(r.releases.productName, path.basename(dir))
})
