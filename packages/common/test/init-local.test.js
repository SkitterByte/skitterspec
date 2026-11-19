'use strict'

// `init --local`: the install a developer keeps to themselves on a shared repo.
// The managed files stay on disk and out of git, hooks go in
// settings.local.json, the block in CLAUDE.local.md, and only `specs/` is left
// for git to see. `update` keeps it that way without the flag.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, resync, readManifest, lastReport, EXCLUDE_START } = require('../src/init.js')

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-local-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@example.invalid')
  git(dir, 'config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'README.md'), '# shared\n')
  git(dir, 'add', 'README.md')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

async function quiet(fn) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    return await fn()
  } finally {
    process.stdout.write = orig
  }
}

const localInit = (dir, extra = {}) =>
  quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init', local: true, ...extra }))

// Every untracked path git would show, expanded to files.
const visible = (dir) =>
  git(dir, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

test('a fresh local init leaves git seeing only specs/', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')), 'skills installed')
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.local.md')), 'block in CLAUDE.local.md')
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md never created')
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')), 'no committed settings')
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    assert.ok(local.hooks.PreToolUse.length >= 3, 'hooks registered locally')
    assert.strictEqual(readManifest(dir).scope, 'local')
    const shown = visible(dir)
    assert.ok(shown.length > 0, 'specs/ is visible')
    assert.deepStrictEqual(shown.filter((p) => !p.startsWith('specs/')), [], 'nothing outside specs/')
    assert.ok(!shown.includes('specs/.core/.skitterspec-manifest.json'), 'manifest excluded')
    assert.ok(lastReport().warnings.some((w) => /--local keeps skitterspec on this machine/.test(w)))
  } finally {
    cleanup(dir)
  }
})

test('re-running is idempotent and the exclude block is written once', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    const first = fs.readFileSync(exclude, 'utf8')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(exclude, 'utf8'), first)
    assert.strictEqual(first.split(EXCLUDE_START).length - 1, 1)
    assert.ok(!lastReport().warnings.some((w) => /--local keeps/.test(w)), 'warned once, not per run')
  } finally {
    cleanup(dir)
  }
})

test('update without the flag stays local and writes nothing git can see', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    git(dir, 'add', 'specs')
    git(dir, 'commit', '-q', '-m', 'specs')
    fs.rmSync(path.join(dir, '.claude', 'skills', 'spec'), { recursive: true })
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')), 'restored')
    assert.deepStrictEqual(visible(dir), [], 'nothing tracked or visible changed')
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')))
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')))
    assert.strictEqual(readManifest(dir).scope, 'local')
    assert.ok(lastReport().skipped.some((l) => /kept local/.test(l)), 'says it stayed local')
  } finally {
    cleanup(dir)
  }
})

test('an install in a subfolder of the git root excludes prefixed paths', async () => {
  const root = repo()
  const sub = path.join(root, 'App.Solution')
  fs.mkdirSync(sub)
  try {
    await localInit(sub)
    const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8')
    assert.match(exclude, /^\/App\.Solution\/\.claude\/skills\/spec\/SKILL\.md$/m)
    assert.deepStrictEqual(visible(root).filter((p) => !p.startsWith('App.Solution/specs/')), [])
  } finally {
    cleanup(root)
  }
})

test('settings.local.json is merged, never overwritten', async () => {
  const dir = repo()
  try {
    fs.mkdirSync(path.join(dir, '.claude'))
    const perms = { permissions: { allow: ['Bash(pnpm exec *)'], additionalDirectories: ['/x-wt'] } }
    fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), JSON.stringify(perms))
    await localInit(dir)
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    assert.deepStrictEqual(local.permissions, perms.permissions, 'permissions kept')
    assert.ok(local.hooks.PreToolUse.length >= 3)
  } finally {
    cleanup(dir)
  }
})

test('an existing exclude file keeps its own lines', async () => {
  const dir = repo()
  try {
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    fs.writeFileSync(exclude, '# mine\n**/.claude/scheduled_tasks.lock\n')
    await localInit(dir)
    const text = fs.readFileSync(exclude, 'utf8')
    assert.ok(text.startsWith('# mine\n**/.claude/scheduled_tasks.lock\n'), text.slice(0, 80))
  } finally {
    cleanup(dir)
  }
})

// Stays silent: a team install is untouched by any of this.
test('stays silent: a team init writes no exclude block and no scope', async () => {
  const dir = repo()
  try {
    await quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init' }))
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    const text = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : ''
    assert.ok(!text.includes(EXCLUDE_START))
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'settings.json')))
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')))
    assert.ok(!('scope' in JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), 'utf8'))))
    assert.strictEqual(readManifest(dir).scope, 'team', 'absent scope reads as team')
    assert.ok(!lastReport().warnings.some((w) => /--local/.test(w)))
  } finally {
    cleanup(dir)
  }
})
