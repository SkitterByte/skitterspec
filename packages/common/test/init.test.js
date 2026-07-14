'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, SKILLS, RULES } = require('../src/init.js')
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
