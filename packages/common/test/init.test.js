'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  init,
  SKILLS,
  RULES,
  MANIFEST_FILE,
  sha1,
  readManifest,
  writeManifest,
  managedTargets,
  managedState,
  isExistingSetup,
  resync,
  reset,
  assertSafeToDelete,
} = require('../src/init.js')
const { parse } = require('../src/cli.js')

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-'))
  return dir
}

const exists = (dir, ...p) => fs.existsSync(path.join(dir, ...p))

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

test('replaces a dangling symlink target instead of crashing (ENOENT)', async () => {
  const dir = tmpProject()
  // A pre-existing dangling symlink where init wants to write a rule — e.g. a
  // link left pointing at a path that no longer exists after a restructure.
  fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true })
  const target = path.join(dir, '.claude', 'rules', 'spec-planning.md')
  fs.symlinkSync(path.join(dir, 'does', 'not', 'exist.md'), target)
  assert.ok(fs.lstatSync(target).isSymbolicLink() && !fs.existsSync(target), 'dangling to start')

  // init must not throw, and must leave a real file with the bundled content.
  await init({ dir, force: false, claudeMd: false, mode: 'init' })

  assert.ok(!fs.lstatSync(target).isSymbolicLink(), 'symlink replaced by a real file')
  assert.match(fs.readFileSync(target, 'utf8'), /# Spec Planning/)
})

const specPlanning = (dir) =>
  managedTargets(dir).find((t) => t.relPath.endsWith('spec-planning.md'))

test('init writes a manifest of installed managed files with their hashes', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  assert.ok(exists(dir, ...MANIFEST_FILE.split(path.sep)), 'manifest written')
  const manifest = readManifest(dir)
  for (const { relPath, abs, bundled } of managedTargets(dir)) {
    assert.strictEqual(manifest.files[relPath], sha1(bundled), `${relPath} recorded`)
    assert.strictEqual(sha1(fs.readFileSync(abs, 'utf8')), manifest.files[relPath], `${relPath} on disk`)
  }
})

test('managedState classifies missing / pristine / customized', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  const manifest = readManifest(dir)
  const one = specPlanning(dir)
  assert.strictEqual(managedState(dir, one.relPath, manifest), 'pristine')
  fs.appendFileSync(path.join(dir, one.relPath), '\nuser edit\n')
  assert.strictEqual(managedState(dir, one.relPath, manifest), 'customized')
  fs.unlinkSync(path.join(dir, one.relPath))
  assert.strictEqual(managedState(dir, one.relPath, manifest), 'missing')
})

test('readManifest tolerates a missing or malformed manifest', () => {
  const dir = tmpProject()
  assert.deepStrictEqual(readManifest(dir).files, {}) // missing
  fs.mkdirSync(path.dirname(path.join(dir, MANIFEST_FILE)), { recursive: true })
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), '{ not json')
  assert.deepStrictEqual(readManifest(dir).files, {}) // malformed
})

test('migration: a pre-manifest repo re-seeds without clobbering a user edit', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  fs.unlinkSync(path.join(dir, MANIFEST_FILE)) // simulate a repo predating the manifest
  const one = specPlanning(dir)
  fs.appendFileSync(path.join(dir, one.relPath), '\nMY CONVENTIONS\n') // user edit pre-migration
  await init({ dir, force: false, claudeMd: false, mode: 'init' }) // re-run: create-missing
  const manifest = readManifest(dir)
  assert.strictEqual(managedState(dir, one.relPath, manifest), 'customized', 'edited file kept as customized')
  assert.match(fs.readFileSync(path.join(dir, one.relPath), 'utf8'), /MY CONVENTIONS/, 'edit intact')
  // an untouched managed file re-seeds as pristine
  const skill = managedTargets(dir).find((t) => t.relPath.includes('/skills/spec/'))
  assert.strictEqual(managedState(dir, skill.relPath, manifest), 'pristine')
})

const anySkill = (dir) => managedTargets(dir).find((t) => t.relPath.includes(`${path.sep}skills${path.sep}spec${path.sep}`))

test('isExistingSetup: false on a fresh dir, true after init', async () => {
  const dir = tmpProject()
  assert.strictEqual(isExistingSetup(dir), false)
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  assert.strictEqual(isExistingSetup(dir), true)
})

test('resync updates a stale pristine file but keeps a customized one', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  // stale pristine: on-disk == manifest hash, but both differ from bundled.
  const stale = specPlanning(dir)
  fs.writeFileSync(path.join(dir, stale.relPath), 'OLD VERSION')
  const m = readManifest(dir)
  m.files[stale.relPath] = sha1('OLD VERSION')
  writeManifest(dir, m.files)
  // customized: an edited skill.
  const edited = anySkill(dir)
  fs.appendFileSync(path.join(dir, edited.relPath), '\nMINE\n')

  resync(dir, { claudeMd: false })

  assert.strictEqual(fs.readFileSync(path.join(dir, stale.relPath), 'utf8'), stale.bundled, 'stale updated')
  assert.match(fs.readFileSync(path.join(dir, edited.relPath), 'utf8'), /MINE/, 'customized kept')
})

test('resync recreates a missing managed file', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init' })
  const one = anySkill(dir)
  fs.unlinkSync(path.join(dir, one.relPath))
  resync(dir, { claudeMd: false })
  assert.ok(fs.existsSync(path.join(dir, one.relPath)), 'recreated')
})

test('reset recreates managed files but never touches spec content or config', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: false, mode: 'init', isolation: true })
  // a real spec + an edited managed file
  fs.mkdirSync(path.join(dir, 'specs', 'in-progress', 'feat-x'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', 'in-progress', 'feat-x', '00-overview.md'), 'MY SPEC')
  const skill = anySkill(dir)
  fs.appendFileSync(path.join(dir, skill.relPath), '\nMINE\n')

  reset(dir, { claudeMd: false })

  assert.strictEqual(fs.readFileSync(path.join(dir, skill.relPath), 'utf8'), skill.bundled, 'managed reset to bundled')
  assert.strictEqual(
    fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-x', '00-overview.md'), 'utf8'),
    'MY SPEC',
    'spec content untouched',
  )
  assert.ok(fs.existsSync(path.join(dir, 'specs', '.core', 'env.config.json')), 'active config untouched')
})

test('assertSafeToDelete refuses spec content, config, and non-managed paths', () => {
  const managed = new Set(['.claude/skills/spec/SKILL.md'])
  assert.throws(() => assertSafeToDelete('specs/in-progress/x/00-overview.md', managed), /spec content/)
  assert.throws(() => assertSafeToDelete('specs/.core/env.config.json', managed), /active config/)
  assert.throws(() => assertSafeToDelete('specs/.core/linear-base/SKI-1.base.json', managed), /sync state/)
  assert.throws(() => assertSafeToDelete('some/other/file.md', managed), /non-managed/)
  assert.doesNotThrow(() => assertSafeToDelete('.claude/skills/spec/SKILL.md', managed))
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

test('registers spec-connect and not the retired env skills', () => {
  assert.ok(SKILLS.includes('spec-connect'), 'spec-connect registered')
  // spec-env / spec-env-down / spec-ready were removed in 3.0.0 — provisioning
  // folds into /spec-go, teardown into /spec-complete·/spec-cancel, grooming
  // into /spec. The `spec-env` CLI engine stays; only the skills are gone.
  assert.ok(!SKILLS.includes('spec-env'), 'spec-env skill removed')
  assert.ok(!SKILLS.includes('spec-env-down'), 'spec-env-down skill removed')
  assert.ok(!SKILLS.includes('spec-ready'), 'spec-ready skill removed')
})

test('the base does not register the Linear hybrid-sync skills', () => {
  // Linear sync ships in @skitterbyte/skitterspec-provider-linear, not the base.
  assert.ok(!SKILLS.includes('spec-status'), 'spec-status not in base')
  assert.ok(!SKILLS.includes('spec-pull'), 'spec-pull not in base')
  assert.ok(!SKILLS.includes('spec-push'), 'spec-push not in base')
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

// --- release tooling is no longer part of skitterspec (moved to skittership) -

test('init installs no commit skill, commit rule, or release tooling', async () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8')
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  assert.ok(!SKILLS.includes('commit'), 'commit skill not registered')
  assert.ok(!RULES.includes('commit-messages.md'), 'commit-messages rule not registered')
  assert.ok(!exists(dir, '.claude', 'skills', 'commit', 'SKILL.md'), 'no /commit skill installed')
  assert.ok(!exists(dir, '.claude', 'rules', 'commit-messages.md'), 'no commit rule installed')
  assert.ok(!exists(dir, 'scripts'), 'no generator scripts/ dir')
  assert.ok(!exists(dir, 'skitterspec.config.json'), 'no release config written')
  assert.strictEqual(
    JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts,
    undefined,
    'no version hook wired into package.json',
  )
})

test('parse rejects the removed release flags', () => {
  assert.throws(() => parse(['--changelog']), /unknown option: --changelog/)
  assert.throws(() => parse(['--releases']), /unknown option: --releases/)
  assert.throws(() => parse(['--product-name=Acme']), /unknown option/)
})
