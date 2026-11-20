'use strict'

// feat-uninstall-local phase 2: `disable` and `enable` switch whether this
// machine's Claude uses a local install, without touching its files. The
// switch lives in `.claude/settings.local.json` — `skillOverrides` for skills
// and commands, `claudeMdExcludes` for rules — and our hooks and the
// CLAUDE.local.md block come out and go back. Only our entries are ever touched.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, resync, disable, enable, uninstall, readManifest, SKILLS, RULES, MANIFEST_FILE } = require('../src/init.js')

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-switch-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@example.invalid')
  git(dir, 'config', 'user.name', 'T')
  git(dir, 'config', 'gc.auto', '0')
  git(dir, 'config', 'maintenance.auto', 'false')
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

const install = (dir, local = true) =>
  quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init', local }))

const off = (dir) => {
  let out = ''
  const code = disable(dir, { log: (s) => (out += s) })
  return { code, out }
}
const on = async (dir) => {
  let out = ''
  const code = await quiet(() => enable(dir, { log: (s) => (out += s) }))
  return { code, out }
}

const settingsOf = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
  } catch {
    return {}
  }
}
const hookCommands = (settings) =>
  ((settings.hooks && settings.hooks.PreToolUse) || []).flatMap((g) => g.hooks.map((h) => h.command))
const ours = (cmd) => /main-guard|project-guard|review-gate/.test(cmd)
const claudeLocal = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, 'CLAUDE.local.md'), 'utf8')
  } catch {
    return ''
  }
}
const managedOnDisk = (dir) =>
  ['skills', 'commands', 'rules', 'hooks'].flatMap((k) => {
    const at = path.join(dir, '.claude', k)
    return fs.existsSync(at) ? fs.readdirSync(at).map((f) => `${k}/${f}`) : []
  })
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true })

test('disable leaves every file and switches Claude off', async () => {
  const dir = repo()
  try {
    await install(dir)
    const files = managedOnDisk(dir)
    const { code, out } = off(dir)
    assert.strictEqual(code, 0, out)
    assert.deepStrictEqual(managedOnDisk(dir), files, 'no file is touched')
    const s = settingsOf(dir)
    for (const name of [...SKILLS, 'spec-live']) assert.strictEqual(s.skillOverrides[name], 'off', name)
    for (const rule of RULES) assert.ok(s.claudeMdExcludes.includes(`**/.claude/rules/${rule}`), rule)
    assert.deepStrictEqual(hookCommands(s).filter(ours), [], 'our hooks are out')
    assert.ok(!claudeLocal(dir).includes('skitterspec:start'), 'the block is out')
    assert.strictEqual(readManifest(dir).enabled, false)
  } finally {
    cleanup(dir)
  }
})

test('enable puts back exactly what disable took', async () => {
  const dir = repo()
  try {
    await install(dir)
    const before = settingsOf(dir)
    off(dir)
    const { code, out } = await on(dir)
    assert.strictEqual(code, 0, out)
    const after = settingsOf(dir)
    assert.ok(!after.skillOverrides, 'no override left')
    assert.ok(!after.claudeMdExcludes, 'no exclude left')
    assert.deepStrictEqual(hookCommands(after).sort(), hookCommands(before).sort())
    assert.match(claudeLocal(dir), /skitterspec:start/)
    assert.strictEqual(readManifest(dir).enabled, true)
    assert.ok(!('enabled' in JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))), 'enabled is the unwritten default')
  } finally {
    cleanup(dir)
  }
})

test('the developer\'s own override, exclude, hook and CLAUDE.local.md text survive both', async () => {
  const dir = repo()
  try {
    await install(dir)
    const file = path.join(dir, '.claude', 'settings.local.json')
    const s = settingsOf(dir)
    s.skillOverrides = { 'my-skill': 'off' }
    s.claudeMdExcludes = ['/elsewhere/CLAUDE.md']
    s.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'node mine.cjs' }] })
    s.permissions = { allow: ['Bash(ls)'] }
    fs.writeFileSync(file, JSON.stringify(s, null, 2))
    fs.writeFileSync(path.join(dir, 'CLAUDE.local.md'), '# Mine\n\nkeep this\n\n' + claudeLocal(dir))

    off(dir)
    let now = settingsOf(dir)
    assert.strictEqual(now.skillOverrides['my-skill'], 'off')
    assert.ok(now.claudeMdExcludes.includes('/elsewhere/CLAUDE.md'))
    assert.deepStrictEqual(hookCommands(now), ['node mine.cjs'])
    assert.match(claudeLocal(dir), /keep this/)

    await on(dir)
    now = settingsOf(dir)
    assert.deepStrictEqual(now.skillOverrides, { 'my-skill': 'off' })
    assert.deepStrictEqual(now.claudeMdExcludes, ['/elsewhere/CLAUDE.md'])
    assert.ok(hookCommands(now).includes('node mine.cjs'))
    assert.deepStrictEqual(now.permissions, { allow: ['Bash(ls)'] })
    assert.match(claudeLocal(dir), /keep this[\s\S]*skitterspec:start/)
  } finally {
    cleanup(dir)
  }
})

test('both are idempotent', async () => {
  const dir = repo()
  try {
    await install(dir)
    off(dir)
    const once = settingsOf(dir)
    assert.strictEqual(off(dir).code, 0)
    assert.deepStrictEqual(settingsOf(dir), once)
    await on(dir)
    const enabled = settingsOf(dir)
    const block = claudeLocal(dir)
    assert.strictEqual((await on(dir)).code, 0)
    assert.deepStrictEqual(settingsOf(dir), enabled)
    assert.strictEqual(claudeLocal(dir), block, 'the block is not written twice')
  } finally {
    cleanup(dir)
  }
})

test('enable with no install here installs it, switched on', async () => {
  const dir = repo()
  try {
    const { code, out } = await on(dir)
    assert.strictEqual(code, 0, out)
    assert.match(out, /installing it/)
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')))
    assert.strictEqual(readManifest(dir).scope, 'local')
    assert.ok(hookCommands(settingsOf(dir)).some(ours))
    assert.match(claudeLocal(dir), /skitterspec:start/)
    assert.strictEqual(git(dir, 'status', '--porcelain', '--', '.claude'), '', 'installed out of git')
  } finally {
    cleanup(dir)
  }
})

test('enable after the managed files were deleted installs them again', async () => {
  const dir = repo()
  try {
    await install(dir)
    off(dir)
    for (const k of ['skills', 'commands', 'rules', 'hooks']) fs.rmSync(path.join(dir, '.claude', k), { recursive: true, force: true })
    const { code, out } = await on(dir)
    assert.strictEqual(code, 0, out)
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')))
    assert.ok(!settingsOf(dir).skillOverrides, 'and switched on')
    assert.strictEqual(readManifest(dir).enabled, true)
  } finally {
    cleanup(dir)
  }
})

test('update on a disabled install refreshes files and keeps it disabled', async () => {
  const dir = repo()
  try {
    await install(dir)
    off(dir)
    fs.rmSync(path.join(dir, '.claude', 'skills', 'spec-next'), { recursive: true })
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec-next', 'SKILL.md')), 'files refresh')
    assert.strictEqual(readManifest(dir).enabled, false)
    assert.deepStrictEqual(hookCommands(settingsOf(dir)).filter(ours), [])
    assert.ok(!claudeLocal(dir).includes('skitterspec:start'))
    assert.strictEqual(settingsOf(dir).skillOverrides.spec, 'off')
  } finally {
    cleanup(dir)
  }
})

test('init --local on a disabled install switches it back on', async () => {
  const dir = repo()
  try {
    await install(dir)
    off(dir)
    await install(dir)
    assert.strictEqual(readManifest(dir).enabled, true)
    assert.ok(!settingsOf(dir).skillOverrides)
    assert.ok(hookCommands(settingsOf(dir)).some(ours))
  } finally {
    cleanup(dir)
  }
})

test('a team install refuses both, changing nothing', async () => {
  const dir = repo()
  try {
    await install(dir, false)
    const settings = fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')
    const a = off(dir)
    assert.strictEqual(a.code, 1)
    assert.match(a.out, /team install/)
    const b = await on(dir)
    assert.strictEqual(b.code, 1)
    assert.match(b.out, /team install/)
    assert.strictEqual(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), settings)
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.local.json')))
  } finally {
    cleanup(dir)
  }
})

test('malformed local settings refuse disable, changing nothing', async () => {
  const dir = repo()
  try {
    await install(dir)
    fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), '{ not json')
    const { code, out } = off(dir)
    assert.strictEqual(code, 1)
    assert.match(out, /not valid JSON/)
    assert.strictEqual(readManifest(dir).enabled, true)
  } finally {
    cleanup(dir)
  }
})

test('uninstall after disable leaves no override or exclude behind', async () => {
  const dir = repo()
  try {
    await install(dir)
    const file = path.join(dir, '.claude', 'settings.local.json')
    const s = settingsOf(dir)
    s.permissions = { allow: ['Bash(ls)'] }
    fs.writeFileSync(file, JSON.stringify(s, null, 2))
    off(dir)
    let out = ''
    const code = uninstall(dir, { yes: true, log: (x) => (out += x) })
    assert.strictEqual(code, 0, out)
    assert.deepStrictEqual(settingsOf(dir), { permissions: { allow: ['Bash(ls)'] } })
  } finally {
    cleanup(dir)
  }
})

// The stays-silent case: nothing installed is not an error for disable.
test('disable with no install says so and exits 0', () => {
  const dir = repo()
  try {
    const { code, out } = off(dir)
    assert.strictEqual(code, 0)
    assert.match(out, /nothing to disable/)
  } finally {
    cleanup(dir)
  }
})
