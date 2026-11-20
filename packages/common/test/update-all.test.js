'use strict'

// `skitterspec update --all` (feat-global-install, phase 2): every local-scope
// project on the machine, updated by its own distribution; team and disabled
// installs listed and never written; a provider not installed skipped with the
// line that installs it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { planUpdateAll, runUpdateAll, countChanged, distributionOf } = require('../src/updateall.js')
const { readManifest } = require('../src/init.js')

function tmp() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-all-')))
}

// A project folder with a manifest as `init` would leave it.
function project(root, name, manifest, configs = []) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), JSON.stringify({ version: 1, files: {}, ...manifest }))
  for (const c of configs) fs.writeFileSync(path.join(dir, 'specs', '.core', c), '{}')
  return dir
}

const noGit = () => null
const plan = (dirs, onPath = () => true, git = noGit) =>
  planUpdateAll({ dirs, exists: fs.existsSync, git, readManifest, onPath })

test('a local project is updated by its own distribution; team and disabled are listed', () => {
  const root = tmp()
  try {
    const gh = project(root, 'skitterload', { scope: 'local', distribution: '@skitterbyte/skitterspec-github' })
    const az = project(root, 'lsc', { scope: 'local', distribution: '@skitterbyte/skitterspec-azure-boards' })
    const team = project(root, 'shared', { distribution: '@skitterbyte/skitterspec-github' })
    const off = project(root, 'paused', { scope: 'local', enabled: false })
    const calls = []
    const run = (bin, args, cwd) => {
      calls.push({ bin, cwd })
      return { status: 0, stdout: '\nskitterspec update → x\n\nupdated:\n  .claude/a.md\n  .claude/b.md\n', stderr: '' }
    }
    const { lines, failed } = runUpdateAll(plan([gh, az, team, off]), run)
    assert.strictEqual(failed, false)
    assert.deepStrictEqual(
      calls.map((c) => [c.bin, path.basename(c.cwd)]),
      [['skitterspec-azure-boards', 'lsc'], ['skitterspec-github', 'skitterload']],
    )
    assert.match(lines.find((l) => l.includes('skitterload')), /local · github\s+updated 2 files/)
    assert.match(lines.find((l) => l.includes('shared')), /team .*listed — team install, update it on a \/no-spec branch/)
    assert.match(lines.find((l) => l.includes('paused')), /skipped — disabled/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a provider not installed is skipped with the npm line that installs it', () => {
  const root = tmp()
  try {
    const dir = project(root, 'side', { scope: 'local', distribution: '@skitterbyte/skitterspec-linear' })
    const rows = plan([dir], (bin) => bin !== 'skitterspec-linear')
    const { lines } = runUpdateAll(rows, () => assert.fail('nothing runs for a missing bin'))
    assert.match(lines[0], /skipped — npm i -g @skitterbyte\/skitterspec-linear/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// Stays silent: a folder Claude Code ran in, with no install, is not a project.
test('stays silent: a folder with no manifest, or gone from disk, is ignored', () => {
  const root = tmp()
  try {
    fs.mkdirSync(path.join(root, 'plain'))
    assert.deepStrictEqual(plan([path.join(root, 'plain'), path.join(root, 'gone')]), [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a failed update fails the run, and the others still run', () => {
  const root = tmp()
  try {
    const a = project(root, 'a', { scope: 'local' })
    const b = project(root, 'b', { scope: 'local' })
    const ran = []
    const run = (_bin, _args, cwd) => {
      ran.push(path.basename(cwd))
      return path.basename(cwd) === 'a' ? { status: 1, stdout: '', stderr: 'boom: no assets\n' } : { status: 0, stdout: '', stderr: '' }
    }
    const { lines, failed } = runUpdateAll(plan([a, b]), run)
    assert.strictEqual(failed, true)
    assert.deepStrictEqual(ran, ['a', 'b'])
    assert.match(lines[0], /failed — boom: no assets/)
    assert.match(lines[1], /current$/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a worktree and a subfolder of the project fold into the primary project once', () => {
  const root = tmp()
  try {
    const top = path.join(root, 'LSC App')
    const sub = project(top, 'FF.CSC.Solution', { scope: 'local' })
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    git(top, 'init', '-q', '-b', 'main')
    git(top, 'add', '.')
    git(top, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'i')
    const wt = path.join(root, 'LSC App-wt', 'feat-x')
    git(top, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
    fs.mkdirSync(path.join(sub, 'src'))
    const reader = (dir, args) => {
      try {
        return git(dir, ...args)
      } catch {
        return null
      }
    }
    const rows = plan([path.join(wt, 'FF.CSC.Solution'), path.join(sub, 'src'), sub], () => true, reader)
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(fs.realpathSync.native(rows[0].dir), fs.realpathSync.native(sub))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('an older manifest takes its provider from specs/.core, else the base', () => {
  const root = tmp()
  try {
    const gh = project(root, 'gh', {}, ['github.config.json'])
    const az = project(root, 'az', {}, ['azure-boards.config.json'])
    const base = project(root, 'base', {})
    assert.strictEqual(distributionOf(gh, readManifest(gh), fs.existsSync), '@skitterbyte/skitterspec-github')
    assert.strictEqual(distributionOf(az, readManifest(az), fs.existsSync), '@skitterbyte/skitterspec-azure-boards')
    assert.strictEqual(distributionOf(base, readManifest(base), fs.existsSync), '@skitterbyte/skitterspec')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('countChanged reads created, updated and removed — not unchanged or warnings', () => {
  const out = '\nskitterspec update → x\n\ncreated:\n  a\n\nupdated:\n  b\n  c\n\nunchanged:\n  d\n\nwarnings:\n  ! e\n'
  assert.strictEqual(countChanged(out), 3)
  assert.strictEqual(countChanged(''), 0)
})

// End to end through the CLI: a fake Claude projects root naming one project,
// and a fake provider bin on PATH that reports one updated file.
test('update --all runs from the CLI against the transcript list', { skip: process.platform === 'win32' }, () => {
  const root = tmp()
  try {
    const dir = project(root, 'proj', { scope: 'local', distribution: '@skitterbyte/skitterspec-github' })
    const transcripts = path.join(root, 'claude', 'projects', 'x')
    fs.mkdirSync(transcripts, { recursive: true })
    fs.writeFileSync(path.join(transcripts, 's.jsonl'), `${JSON.stringify({ cwd: dir, type: 'user' })}\n`)
    const bin = path.join(root, 'bin')
    fs.mkdirSync(bin)
    const fake = path.join(bin, 'skitterspec-github')
    fs.writeFileSync(fake, '#!/bin/sh\nprintf "\\nupdated:\\n  .claude/a.md\\n"\n')
    fs.chmodSync(fake, 0o755)
    const cli = path.join(__dirname, '..', 'bin', 'skitterspec.js')
    const r = spawnSync(process.execPath, [cli, 'update', '--all'], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(root, 'claude'), PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    })
    assert.strictEqual(r.status, 0, r.stderr)
    assert.match(r.stdout, /update --all — 1 project/)
    assert.match(r.stdout, /proj\s+local · github\s+updated 1 file/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
