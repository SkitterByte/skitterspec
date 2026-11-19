'use strict'

// Both hooks find the engine by walking up from the session's directory to a
// `node_modules/.bin`. A project in a subfolder of its repo (spec
// feat-subfolder-project) may install skitterspec in that subfolder, or above
// it at the repo root — both must be found, and the nearer one wins.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const HOOKS = ['main-guard.cjs', 'review-gate.cjs'].map((f) => path.join(__dirname, '..', 'assets', 'hooks', f))

function tmp() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-findengine-')))
}

function bin(dir, name = 'skitterspec') {
  const p = path.join(dir, 'node_modules', '.bin', name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '')
  return p
}

function withoutOverride(fn) {
  const saved = process.env.SKITTERSPEC_BIN
  delete process.env.SKITTERSPEC_BIN
  try {
    return fn()
  } finally {
    if (saved !== undefined) process.env.SKITTERSPEC_BIN = saved
  }
}

for (const hook of HOOKS) {
  const { findEngine } = require(hook)
  const name = path.basename(hook)

  test(`${name}: an engine installed in the project subfolder is found`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    const want = bin(project)
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: an engine installed at the repo root, above the project, is found`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const want = bin(root, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: the nearer install wins`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    bin(root)
    const want = bin(project)
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: STAYS SILENT — nothing installed falls back to the PATH name`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const got = withoutOverride(() => findEngine(project, 'linux'))
    // Either the bare name, or an install found further up this machine's tree
    // (a developer's home directory may hold one) — never a path under `root`.
    assert.ok(got === 'skitterspec' || !got.startsWith(root), got)
  })
}

// --- Windows: the package's JS entry, run through node -------------------------
//
// chore-windows-ci: on Windows the hooks spawned `.bin/<name>` — a shell shim
// spawn cannot execute (EFTYPE) — failed open, and every guard was silently off.

function jsEntry(dir, name = 'skitterspec') {
  const p = path.join(dir, 'node_modules', '@skitterbyte', name, 'bin', `${name}.js`)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '')
  return p
}

for (const hook of HOOKS) {
  const { findEngine, engineCommand } = require(hook)
  const name = path.basename(hook)

  test(`${name}: on win32 the package's JS entry is found, in the project or above`, () => {
    const root = tmp()
    const project = path.join(root, 'FF.CSC.Solution')
    fs.mkdirSync(project, { recursive: true })
    const want = jsEntry(root, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(project, 'win32')), want)
  })

  test(`${name}: on win32 it runs through node, never as the file itself`, () => {
    const root = tmp()
    const js = jsEntry(root)
    assert.deepStrictEqual(withoutOverride(() => engineCommand(root, 'win32')), { file: process.execPath, args: [js] })
  })

  test(`${name}: STAYS SILENT — a .bin shim is not what win32 runs, and POSIX is unchanged`, () => {
    const root = tmp()
    const shim = bin(root)
    const got = withoutOverride(() => findEngine(root, 'win32'))
    assert.ok(got === 'skitterspec' || !got.startsWith(root), 'the shim is not picked on win32')
    assert.deepStrictEqual(withoutOverride(() => engineCommand(root, 'linux')), { file: shim, args: [] })
  })

  test(`${name}: a .js SKITTERSPEC_BIN runs through node`, () => {
    const saved = process.env.SKITTERSPEC_BIN
    process.env.SKITTERSPEC_BIN = '/x/engine.js'
    try {
      assert.deepStrictEqual(engineCommand('/anywhere'), { file: process.execPath, args: ['/x/engine.js'] })
    } finally {
      if (saved === undefined) delete process.env.SKITTERSPEC_BIN
      else process.env.SKITTERSPEC_BIN = saved
    }
  })
}

// --- A worktree with no node_modules: the primary checkout's install ----------
//
// bug-hooks-engine-primary-checkout: worktrees live beside the primary
// checkout, not under it, so walking up never reached its node_modules. A
// `--docs` worktree has none of its own, the hooks fell back to the bare name,
// spawn hit ENOENT, and every guard was silently off there.

const { execFileSync, spawnSync } = require('node:child_process')

const ALL_HOOKS = ['main-guard.cjs', 'review-gate.cjs', 'project-guard.cjs'].map((f) =>
  path.join(__dirname, '..', 'assets', 'hooks', f),
)

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// A primary checkout and a sibling worktree, the layout `worktree.root` makes.
function primaryAndWorktree() {
  const root = tmp()
  const primary = path.join(root, 'repo')
  fs.mkdirSync(primary)
  git(primary, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(primary, 'README.md'), 'x\n')
  git(primary, 'add', 'README.md')
  git(primary, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
  const worktree = path.join(root, 'repo-wt', 'feat-x')
  git(primary, 'worktree', 'add', '-q', worktree, '-b', 'feat/x')
  return { root, primary, worktree }
}

for (const hook of ALL_HOOKS) {
  const { findEngine } = require(hook)
  const name = path.basename(hook)

  test(`${name}: a worktree with no node_modules finds the primary checkout's engine`, () => {
    const { primary, worktree } = primaryAndWorktree()
    const want = bin(primary, 'skitterspec-azure-boards')
    assert.strictEqual(withoutOverride(() => findEngine(worktree, 'linux')), want)
  })

  test(`${name}: on win32 a worktree finds the primary checkout's JS entry`, () => {
    const { primary, worktree } = primaryAndWorktree()
    const want = jsEntry(primary)
    assert.strictEqual(withoutOverride(() => findEngine(worktree, 'win32')), want)
  })

  test(`${name}: a project subfolder in a worktree maps onto the primary's subfolder`, () => {
    const { primary, worktree } = primaryAndWorktree()
    bin(primary)
    const want = bin(path.join(primary, 'sub'))
    const project = path.join(worktree, 'sub')
    fs.mkdirSync(project, { recursive: true })
    assert.strictEqual(withoutOverride(() => findEngine(project, 'linux')), want)
  })

  test(`${name}: the worktree's own install still wins over the primary's`, () => {
    const { primary, worktree } = primaryAndWorktree()
    bin(primary)
    const want = bin(worktree)
    assert.strictEqual(withoutOverride(() => findEngine(worktree, 'linux')), want)
  })

  test(`${name}: STAYS SILENT — SKITTERSPEC_BIN still wins in a worktree`, () => {
    const { primary, worktree } = primaryAndWorktree()
    bin(primary)
    const saved = process.env.SKITTERSPEC_BIN
    process.env.SKITTERSPEC_BIN = '/x/engine'
    try {
      assert.strictEqual(findEngine(worktree, 'linux'), '/x/engine')
    } finally {
      if (saved === undefined) delete process.env.SKITTERSPEC_BIN
      else process.env.SKITTERSPEC_BIN = saved
    }
  })
}

// --- No engine anywhere: still open, no longer silent --------------------------

const PAYLOADS = {
  'main-guard.cjs': (dir) => ({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'a.txt') }, cwd: dir }),
  'review-gate.cjs': (dir) => ({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: dir }),
  'project-guard.cjs': (dir) => ({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: dir }),
}

for (const hook of ALL_HOOKS) {
  const name = path.basename(hook)

  test(`${name}: an unreachable engine allows, and says so on stderr`, () => {
    const dir = tmp()
    const empty = tmp()
    const env = { ...process.env, PATH: empty, CLAUDE_PROJECT_DIR: dir }
    delete env.SKITTERSPEC_BIN
    const res = spawnSync(process.execPath, [hook], {
      input: JSON.stringify(PAYLOADS[name](dir)),
      env,
      encoding: 'utf8',
    })
    assert.strictEqual(res.status, 0)
    assert.strictEqual(res.stdout, '', 'no decision — the call proceeds')
    const lines = res.stderr.trim().split('\n')
    assert.strictEqual(lines.length, 1, res.stderr)
    assert.match(lines[0], new RegExp(name.replace('.cjs', '')))
    assert.ok(lines[0].includes(dir), `names the dirs tried: ${lines[0]}`)
  })
}
