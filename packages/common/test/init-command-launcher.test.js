'use strict'

// The command line a shipped slash command pre-executes, RUN for real from the
// places a session actually stands (bug-commands-outside-project).
//
// A command file lives in the project folder's `.claude/commands/`, but its
// `!` line runs in whatever directory the session is standing in. In a repo
// whose project is a subfolder, a session that had cd'd to the git root — or to
// a worktree's root — ran `npx --no-install skitterspec …` where there is no
// install, and got npm's registry 404 instead of the engine.
//
// Each test renders a command through `renderCommand`, substitutes
// `$ARGUMENTS` as Claude Code does, and runs the line through the platform's
// shell (`/bin/sh` on POSIX, `cmd.exe` on Windows — the one vm-bridge uses).
// The engine is a fake that prints where it ran and what it was given.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync, execFileSync } = require('node:child_process')

const { renderCommand } = require('../src/init.js')

const NO_PATH = { PATH: '' }
const SRC = '!`{{exec}} skitterspec spec-env live $ARGUMENTS`\n'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

// A local install of the distribution: its package with a bin that reports
// where it ran, plus the `node_modules/.bin` entry the runners resolve through.
function seedInstall(dir) {
  const pkg = path.join(dir, 'node_modules', '@skitterbyte', 'skitterspec')
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true })
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({ name: '@skitterbyte/skitterspec', version: '0.0.0', bin: { skitterspec: 'bin/fake.js' } }),
  )
  const fake = path.join(pkg, 'bin', 'fake.js')
  fs.writeFileSync(fake, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }))\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'host', version: '0.0.0' }))
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}')
  const bin = path.join(dir, 'node_modules', '.bin')
  fs.mkdirSync(bin, { recursive: true })
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(bin, 'skitterspec.cmd'), `@node "${fake}" %*\r\n`)
  } else {
    fs.symlinkSync(fake, path.join(bin, 'skitterspec'))
    fs.chmodSync(fake, 0o755)
  }
}

// A repo whose project is the subfolder `FF.CSC.Solution`, in a repo folder with a
// space in its name as in the report's `LSC App`, with its install there and
// nothing at the root.
function repo({ install = true } = {}) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-launch-')))
  const top = path.join(root, 'LSC App')
  const sub = path.join(top, 'FF.CSC.Solution')
  fs.mkdirSync(path.join(sub, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(sub, 'specs', '.core', 'env.config.json'), '{}\n')
  fs.writeFileSync(path.join(top, '.gitignore'), 'node_modules/\n')
  git(top, 'init', '-q', '-b', 'main')
  git(top, 'add', '.')
  git(top, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
  if (install) seedInstall(sub)
  return { root, top, sub }
}

// The rendered `!` line, with `$ARGUMENTS` filled in, run where a session stands.
function run(rendered, cwd, args = 'status') {
  const line = rendered.match(/!`(.*)`/)[1].replace('$ARGUMENTS', args)
  const r = spawnSync(line, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, npm_config_yes: 'false' } })
  let out = null
  try {
    out = JSON.parse(r.stdout)
  } catch {
    /* not the fake engine talking */
  }
  return { status: r.status, out, stdout: r.stdout, stderr: r.stderr }
}

const same = (a, b) => fs.realpathSync.native(a) === fs.realpathSync.native(b)

// Stays silent: the healthy path. A session standing in the project folder,
// where the install is, runs the engine there with the arguments untouched —
// exactly what it did before the launcher existed.
test('stays silent: a cwd that has the install runs the engine there, as before', () => {
  const r = repo()
  try {
    const res = run(renderCommand(SRC, r.sub, NO_PATH), r.sub, 'feat-x')
    assert.strictEqual(res.status, 0, res.stderr)
    assert.ok(same(res.out.cwd, r.sub), res.out.cwd)
    assert.deepStrictEqual(res.out.args, ['spec-env', 'live', 'feat-x'])
    assert.strictEqual(res.stderr, '', 'the launcher adds nothing on the healthy path')
  } finally {
    fs.rmSync(r.root, { recursive: true, force: true })
  }
})

test('from the git root, the command runs in the project subfolder', () => {
  const r = repo()
  try {
    const res = run(renderCommand(SRC, r.sub, NO_PATH), r.top)
    assert.strictEqual(res.status, 0, res.stderr)
    assert.ok(same(res.out.cwd, r.sub), `ran in ${res.out.cwd}`)
    assert.deepStrictEqual(res.out.args, ['spec-env', 'live', 'status'])
  } finally {
    fs.rmSync(r.root, { recursive: true, force: true })
  }
})

// A `--docs` worktree has no install of its own, and its root is not the
// project folder: the engine is the primary checkout's, run in the WORKTREE's
// project folder so a bare command still means the spec you are standing on.
test("from a worktree's root, the command runs in that worktree's project folder", () => {
  const r = repo()
  const wt = path.join(r.root, 'LSC App-wt', 'feat-x')
  try {
    git(r.top, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
    const res = run(renderCommand(SRC, r.sub, NO_PATH), wt)
    assert.strictEqual(res.status, 0, res.stderr)
    assert.ok(same(res.out.cwd, path.join(wt, 'FF.CSC.Solution')), `ran in ${res.out.cwd}`)
  } finally {
    fs.rmSync(r.root, { recursive: true, force: true })
  }
})

test('with no install anywhere, it refuses in one line naming the folder — never the registry 404', () => {
  const r = repo()
  try {
    const rendered = renderCommand(SRC, r.sub, NO_PATH)
    fs.rmSync(path.join(r.sub, 'node_modules'), { recursive: true, force: true })
    const res = run(rendered, r.top)
    assert.notStrictEqual(res.status, 0)
    assert.doesNotMatch(res.stderr, /404|registry/)
    const lines = res.stderr.trim().split(/\r?\n/)
    assert.strictEqual(lines.length, 1, res.stderr)
    assert.ok(lines[0].includes('FF.CSC.Solution'), lines[0])
  } finally {
    fs.rmSync(r.root, { recursive: true, force: true })
  }
})

// A provider's own bin is looked for in the provider's package, and the base's
// in the base's: a provider no longer carries `skitterspec` (feat-global-install).
test('each bin runs from its own package, the provider beside the base', () => {
  const r = repo()
  try {
    const pkg = path.join(r.sub, 'node_modules', '@skitterbyte', 'skitterspec-github')
    fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true })
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: '@skitterbyte/skitterspec-github', version: '0.0.0', bin: { 'skitterspec-github': 'bin/gh.js' } }),
    )
    fs.writeFileSync(path.join(pkg, 'bin', 'gh.js'), "process.stdout.write(JSON.stringify({ cwd: process.cwd(), args: ['github', ...process.argv.slice(2)] }))\n")
    fs.writeFileSync(path.join(r.sub, 'node_modules', '.bin', process.platform === 'win32' ? 'skitterspec-github.cmd' : 'skitterspec-github'), '')
    const src = '!`{{exec}} skitterspec spec-env live $ARGUMENTS`\n!`{{exec}} skitterspec-github spec-sync $ARGUMENTS`\n'
    const lines = renderCommand(src, r.sub, NO_PATH).split('\n')
    const base = run(lines[0], r.top)
    const gh = run(lines[1], r.top)
    assert.deepStrictEqual(base.out.args, ['spec-env', 'live', 'status'], base.stderr)
    assert.deepStrictEqual(gh.out.args, ['github', 'spec-sync', 'status'], gh.stderr)
  } finally {
    fs.rmSync(r.root, { recursive: true, force: true })
  }
})
