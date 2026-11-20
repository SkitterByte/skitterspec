'use strict'

// feat-uninstall-local: `skitterspec uninstall` takes a local install
// (`init --local`) back off a machine exactly — managed files, our hooks in
// settings.local.json, the CLAUDE.local.md block, the exclude block,
// `.spec-env/` and the manifest — and leaves `specs/` and everything of the
// developer's alone. It refuses a team install, and while anything is in flight.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, uninstall, MANIFEST_FILE, EXCLUDE_START } = require('../src/init.js')
const { run } = require('../src/cli.js')
const { makeRepo, repoFor } = require('./helpers/repo.js')

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-uninstall-')))
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
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = orig
  }
  return out
}

const install = (dir, local = true) =>
  quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init', local }))

// The engine, with its output captured rather than printed.
function runUninstall(dir, opts = {}) {
  let out = ''
  const code = uninstall(dir, { ...opts, log: (s) => (out += s) })
  return { code, out }
}

const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')
const excludeText = (dir) => {
  try {
    return read(dir, '.git/info/exclude')
  } catch {
    return ''
  }
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true })

test('without --yes it prints the plan and changes nothing', async () => {
  const dir = repo()
  try {
    await install(dir)
    const before = git(dir, 'status', '--porcelain', '--untracked-files=all')
    const { code, out } = runUninstall(dir)
    assert.strictEqual(code, 0)
    assert.match(out, /plan — nothing changed/)
    assert.match(out, /would remove:/)
    assert.match(out, /\.claude\/skills\/spec\/SKILL\.md/)
    assert.match(out, /--yes/)
    assert.ok(exists(dir, '.claude/skills/spec/SKILL.md'))
    assert.ok(exists(dir, MANIFEST_FILE))
    assert.ok(excludeText(dir).includes(EXCLUDE_START))
    assert.strictEqual(git(dir, 'status', '--porcelain', '--untracked-files=all'), before)
  } finally {
    cleanup(dir)
  }
})

test('--yes removes the whole local install and leaves git status as it was', async () => {
  const dir = repo()
  try {
    await install(dir)
    const before = git(dir, 'status', '--porcelain', '--untracked-files=all')
    fs.mkdirSync(path.join(dir, '.spec-env'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.spec-env', 'registry.json'), '{}\n')
    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 0, out)
    assert.match(out, /uninstall: done/)
    assert.match(out, /npm uninstall -g /)
    for (const kind of ['skills', 'commands', 'rules', 'hooks']) {
      assert.ok(!exists(dir, `.claude/${kind}`), `.claude/${kind} still there`)
    }
    assert.ok(!exists(dir, '.claude/settings.local.json'), 'a settings file holding only our hooks goes')
    assert.ok(!exists(dir, 'CLAUDE.local.md'), 'a CLAUDE.local.md holding only our block goes')
    assert.ok(!exists(dir, '.spec-env'))
    assert.ok(!exists(dir, MANIFEST_FILE))
    assert.ok(!excludeText(dir).includes(EXCLUDE_START), 'the exclude block goes')
    // specs/ is committed and shared: what git saw before is what it sees now.
    assert.ok(exists(dir, 'specs/.core'))
    assert.strictEqual(git(dir, 'status', '--porcelain', '--untracked-files=all'), before)
  } finally {
    cleanup(dir)
  }
})

test('an edited skill is parked in the git dir with its content, and listed', async () => {
  const dir = repo()
  try {
    await install(dir)
    const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
    fs.appendFileSync(skill, '\nmy own note\n')
    const before = git(dir, 'status', '--porcelain', '--untracked-files=all')
    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 0, out)
    const parked = path.join(dir, '.git', 'skitterspec-kept', '.claude', 'skills', 'spec', 'SKILL.md')
    assert.match(out, /parked — edited since install[\s\S]*\.claude\/skills\/spec\/SKILL\.md → /)
    assert.ok(fs.readFileSync(parked, 'utf8').includes('my own note'))
    assert.ok(!exists(dir, '.claude/skills'), 'nothing of ours is left where Claude looks')
    assert.strictEqual(git(dir, 'status', '--porcelain', '--untracked-files=all'), before)
  } finally {
    cleanup(dir)
  }
})

test('a second uninstall never overwrites an earlier parked copy', async () => {
  const dir = repo()
  try {
    const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
    const kept = path.join(dir, '.git', 'skitterspec-kept', '.claude', 'skills', 'spec', 'SKILL.md')
    await install(dir)
    fs.appendFileSync(skill, '\nfirst\n')
    assert.strictEqual(runUninstall(dir, { yes: true }).code, 0)
    await install(dir)
    fs.appendFileSync(skill, '\nsecond\n')
    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 0, out)
    assert.ok(fs.readFileSync(kept, 'utf8').includes('first'))
    assert.ok(fs.readFileSync(`${kept}.2`, 'utf8').includes('second'))
  } finally {
    cleanup(dir)
  }
})

test('the developer\'s own settings, CLAUDE.local.md text and exclude lines survive', async () => {
  const dir = repo()
  try {
    await install(dir)
    const settings = path.join(dir, '.claude', 'settings.local.json')
    const parsed = JSON.parse(fs.readFileSync(settings, 'utf8'))
    parsed.permissions = { allow: ['Bash(ls)'] }
    parsed.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'node mine.cjs' }] })
    fs.writeFileSync(settings, JSON.stringify(parsed, null, 2))
    fs.writeFileSync(path.join(dir, 'CLAUDE.local.md'), '# Mine\n\nkeep this\n\n' + read(dir, 'CLAUDE.local.md'))
    fs.appendFileSync(path.join(dir, '.git', 'info', 'exclude'), 'my-scratch/\n')
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'my-skill'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'mine\n')

    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 0, out)
    const left = JSON.parse(fs.readFileSync(settings, 'utf8'))
    assert.deepStrictEqual(left.permissions, { allow: ['Bash(ls)'] })
    const commands = left.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command))
    assert.deepStrictEqual(commands, ['node mine.cjs'])
    const claude = read(dir, 'CLAUDE.local.md')
    assert.match(claude, /keep this/)
    assert.ok(!claude.includes('skitterspec:start'))
    assert.match(excludeText(dir), /my-scratch\//)
    assert.ok(exists(dir, '.claude/skills/my-skill/SKILL.md'), 'a skill of their own is not ours')
  } finally {
    cleanup(dir)
  }
})

test('a team install refuses and changes nothing', async () => {
  const dir = repo()
  try {
    await install(dir, false)
    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 1)
    assert.match(out, /team install/)
    assert.ok(exists(dir, '.claude/skills/spec/SKILL.md'))
    assert.ok(exists(dir, MANIFEST_FILE))
  } finally {
    cleanup(dir)
  }
})

// The stays-silent case: no install at all is not an error.
test('no manifest says there is nothing to do and exits 0', () => {
  const dir = repo()
  try {
    const { code, out } = runUninstall(dir, { yes: true })
    assert.strictEqual(code, 0)
    assert.match(out, /nothing to do/)
  } finally {
    cleanup(dir)
  }
})

test('cannot tell what is in flight refuses rather than deleting', async () => {
  const dir = repo()
  try {
    await install(dir)
    const { code, out } = runUninstall(dir, { yes: true, cannotTell: 'Invalid specs/.core/env.config.json' })
    assert.strictEqual(code, 1)
    assert.match(out, /cannot tell/)
    assert.ok(exists(dir, MANIFEST_FILE))
  } finally {
    cleanup(dir)
  }
})

// --- through the CLI, which reads what is in flight ---

async function localRepoWithSpec(folder) {
  const dir = makeRepo({ name: 'skitterspec-uninstall-cli-', config: { baseBranch: 'main', docker: { enabled: false } } }).dir
  await install(dir)
  const specDir = path.join(dir, 'specs', 'in-progress', folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  repoFor(dir).commit(`add ${folder}`)
  return dir
}

test('a provisioned spec refuses, naming it, and changes nothing', async () => {
  const dir = await localRepoWithSpec('feat-alpha')
  try {
    repoFor(dir).addWorktree('feat-alpha')
    const out = await quiet(() => run(['uninstall', '--yes', '--dir', dir]))
    assert.strictEqual(process.exitCode, 1)
    assert.match(out, /work is still in flight/)
    assert.match(out, /feat-alpha\s+\(worktree /)
    assert.ok(exists(dir, MANIFEST_FILE))
    assert.ok(exists(dir, '.claude/skills/spec/SKILL.md'))
  } finally {
    process.exitCode = 0
    repoFor(dir).cleanup()
  }
})

test('a specless branch with a worktree refuses too', async () => {
  const dir = makeRepo({ name: 'skitterspec-uninstall-nospec-', config: { baseBranch: 'main', docker: { enabled: false } } }).dir
  try {
    await install(dir)
    repoFor(dir).commit('local install')
    await quiet(() => run(['spec-env', 'nospec', 'bump-deps', '--dir', dir]))
    const { wt } = repoFor(dir).worktreeFor('bump-deps')
    git(dir, 'worktree', 'add', '-q', '-b', 'chore/bump-deps', wt)
    const out = await quiet(() => run(['uninstall', '--yes', '--dir', dir]))
    assert.strictEqual(process.exitCode, 1, out)
    assert.match(out, /bump-deps/)
    assert.ok(exists(dir, MANIFEST_FILE))
  } finally {
    process.exitCode = 0
    repoFor(dir).cleanup()
  }
})

test('a held live overlay refuses, naming it', async () => {
  const dir = await localRepoWithSpec('feat-alpha')
  try {
    repoFor(dir).addWorktree('feat-alpha')
    await quiet(() => run(['spec-env', 'live', 'take', 'feat-alpha', '--dir', dir]))
    const out = await quiet(() => run(['uninstall', '--yes', '--dir', dir]))
    assert.strictEqual(process.exitCode, 1, out)
    assert.match(out, /feat-alpha\s+\(live in the primary checkout\)/)
    assert.ok(exists(dir, MANIFEST_FILE))
  } finally {
    process.exitCode = 0
    repoFor(dir).cleanup()
  }
})

test('with nothing in flight the CLI uninstalls', async () => {
  const dir = await localRepoWithSpec('feat-alpha')
  try {
    const out = await quiet(() => run(['uninstall', '--yes', '--dir', dir]))
    assert.ok(!process.exitCode, out)
    assert.match(out, /uninstall: done/)
    assert.ok(!exists(dir, MANIFEST_FILE))
    assert.ok(exists(dir, 'specs/in-progress/feat-alpha/00-overview.md'))
  } finally {
    process.exitCode = 0
    repoFor(dir).cleanup()
  }
})
