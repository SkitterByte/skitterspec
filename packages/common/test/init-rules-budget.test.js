'use strict'

// The installer half of feat-rules-budget: skills ship whole folders (so
// content one skill needs can leave the always-loaded rules), the project's
// conventions live in a file skitterspec writes once and never manages, and
// `alwaysLoaded` measures what every session pays for.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PKG = path.join(__dirname, '..')

function tmpProject() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-budget-')))
}

// A private copy of this package, so a test can add or retire a supporting
// file without touching the assets other test files are reading concurrently.
// Requiring init.js from the copy binds its ASSETS to the copy.
function packageCopy() {
  const root = tmpProject()
  fs.cpSync(path.join(PKG, 'src'), path.join(root, 'src'), { recursive: true })
  fs.cpSync(path.join(PKG, 'assets'), path.join(root, 'assets'), { recursive: true })
  return { root, load: () => require(path.join(root, 'src', 'init.js')) }
}

function quietly(fn) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    return fn()
  } finally {
    process.stdout.write = orig
  }
}

const SUPPORT = path.join('.claude', 'skills', 'spec-diff', 'review-wait.md')

test('a skill supporting file installs, is hashed, kept when edited and pruned when retired', async () => {
  const pkg = packageCopy()
  const asset = path.join(pkg.root, 'assets', 'skills', 'spec-diff', 'review-wait.md')
  fs.writeFileSync(asset, '# Review wait\n\nSupporting text.\n')
  const lib = pkg.load()
  const dir = tmpProject()

  await quietly(() => lib.init({ dir, force: false, claudeMd: false, mode: 'init' }))
  assert.ok(fs.existsSync(path.join(dir, SUPPORT)), 'supporting file installed')
  const rel = SUPPORT.split(path.sep).join('/')
  assert.strictEqual(lib.readManifest(dir).files[rel], lib.sha1('# Review wait\n\nSupporting text.\n'))

  // A user edit survives an update that ships new content.
  fs.writeFileSync(path.join(dir, SUPPORT), 'mine\n')
  fs.writeFileSync(asset, '# Review wait\n\nNewer text.\n')
  quietly(() => lib.resync(dir, { claudeMd: false }))
  assert.strictEqual(fs.readFileSync(path.join(dir, SUPPORT), 'utf8'), 'mine\n')

  // Retired while pristine → pruned; the skill's own SKILL.md stays.
  fs.writeFileSync(path.join(dir, SUPPORT), '# Review wait\n\nSupporting text.\n')
  quietly(() => lib.resync(dir, { claudeMd: false, force: true }))
  fs.rmSync(asset)
  quietly(() => lib.resync(dir, { claudeMd: false }))
  assert.ok(!fs.existsSync(path.join(dir, SUPPORT)), 'retired supporting file pruned')
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec-diff', 'SKILL.md')))
})

test('listSkillFiles puts SKILL.md first and skips dotfiles', () => {
  const pkg = packageCopy()
  const skill = path.join(pkg.root, 'assets', 'skills', 'spec-next')
  fs.writeFileSync(path.join(skill, 'a-first.md'), 'x\n')
  fs.writeFileSync(path.join(skill, '.DS_Store'), 'x')
  assert.deepStrictEqual(pkg.load().listSkillFiles('spec-next'), ['SKILL.md', 'a-first.md'])
})

test('project-conventions.md is written once and survives update and --force', async () => {
  const { init, resync, readManifest, CONVENTIONS_FILE } = require('../src/init.js')
  const dir = tmpProject()
  await quietly(() => init({ dir, force: false, claudeMd: false, mode: 'init' }))
  const file = path.join(dir, CONVENTIONS_FILE)
  assert.match(fs.readFileSync(file, 'utf8'), /Typecheck command/)
  assert.ok(!Object.keys(readManifest(dir).files).some((p) => p.endsWith('project-conventions.md')), 'not managed')

  fs.writeFileSync(file, '# Ours\n\n- **Test command:** `pnpm test`\n')
  quietly(() => resync(dir, { claudeMd: false }))
  quietly(() => resync(dir, { claudeMd: false, force: true }))
  await quietly(() => init({ dir, force: true, claudeMd: false, mode: 'init' }))
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '# Ours\n\n- **Test command:** `pnpm test`\n')
})

test('update writes project-conventions.md when an older install has none', async () => {
  const { init, resync, CONVENTIONS_FILE } = require('../src/init.js')
  const dir = tmpProject()
  await quietly(() => init({ dir, force: false, claudeMd: false, mode: 'init' }))
  fs.rmSync(path.join(dir, CONVENTIONS_FILE))
  quietly(() => resync(dir, { claudeMd: false }))
  assert.ok(fs.existsSync(path.join(dir, CONVENTIONS_FILE)))
})

test('alwaysLoaded counts unscoped rules and the CLAUDE.md block, not a paths: rule', async () => {
  const pkg = packageCopy()
  fs.writeFileSync(
    path.join(pkg.root, 'assets', 'rules', 'scoped.md'),
    '---\npaths:\n  - "specs/**"\n---\n\n# Scoped\n',
  )
  const lib = pkg.load()
  const dir = tmpProject()
  await quietly(() => lib.init({ dir, force: false, claudeMd: true, mode: 'init' }))
  const { rows, total } = lib.alwaysLoaded(dir)
  const paths = rows.map((r) => r.path)
  assert.ok(!paths.includes('.claude/rules/scoped.md'), 'scoped rule excluded')
  assert.ok(paths.includes('.claude/rules/project-conventions.md'))
  assert.ok(paths.includes('CLAUDE.md (skitterspec section)'))
  assert.strictEqual(total, rows.reduce((n, r) => n + r.chars, 0))
})

// Stays silent: a rule with no front-matter at all, and one whose front-matter
// names no `paths:`, are both always-loaded — never mistaken for scoped.
test('alwaysLoaded counts a rule with no front-matter or front-matter without paths:', async () => {
  const pkg = packageCopy()
  const rules = path.join(pkg.root, 'assets', 'rules')
  fs.writeFileSync(path.join(rules, 'bare.md'), '# Bare\n')
  fs.writeFileSync(path.join(rules, 'described.md'), '---\ndescription: x\n---\n# Described\n')
  const lib = pkg.load()
  const dir = tmpProject()
  await quietly(() => lib.init({ dir, force: false, claudeMd: false, mode: 'init' }))
  const paths = lib.alwaysLoaded(dir).rows.map((r) => r.path)
  assert.ok(paths.includes('.claude/rules/bare.md'))
  assert.ok(paths.includes('.claude/rules/described.md'))
})

test('a local install keeps the conventions file out of git', () => {
  const { localExcludes } = require('../src/init.js')
  const dir = tmpProject()
  assert.ok(localExcludes(dir).includes('.claude/rules/project-conventions.md'))
})
