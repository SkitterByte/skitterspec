'use strict'

/**
 * feat-spec-todo, phase 3: the project guard. A session works on the project
 * it was started in; writes, git changes and lifecycle commands aimed at
 * another skitterspec project are refused until the operator lifts it.
 *
 * Real repos throughout — the guard's whole question is which checkout a path
 * belongs to, and only git answers that honestly.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { checkPath, checkCommand, segmentsOf, lifecycleOf, liftApplies, recordLift, readAllows, clearLift } = require('../src/env/projectguard.js')

const HOOK = path.join(__dirname, '..', 'assets', 'hooks', 'project-guard.cjs')
const ENGINE = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function gitAt(cwd) {
  return (args) => {
    try {
      return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return null
    }
  }
}

function sh(cwd, ...args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })
}

/**
 * home (a skitterspec project, with a worktree), other (another one), plain (a
 * repo with no specs/.core) and loose (a folder in no repo), side by side.
 */
function world() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'project-guard-')))
  const repo = (name, skitterspec) => {
    const dir = path.join(root, name)
    fs.mkdirSync(dir)
    sh(dir, 'init', '-q', '-b', 'main')
    if (skitterspec) {
      fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }))
    }
    fs.writeFileSync(path.join(dir, 'README.md'), '# x\n')
    sh(dir, 'add', '-A')
    sh(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
    return dir
  }
  const w = { root, home: repo('home', true), other: repo('other', true), plain: repo('plain', false), loose: path.join(root, 'loose') }
  fs.mkdirSync(w.loose)
  w.homeWt = path.join(root, 'home-wt', 'feat')
  sh(w.home, 'worktree', 'add', '-q', '-b', 'feat/x', w.homeWt)
  w.otherWt = path.join(root, 'other-wt', 'feat')
  sh(w.other, 'worktree', 'add', '-q', '-b', 'feat/y', w.otherWt)
  return w
}

// Paths written into a shell line use forward slashes, as they would in Git
// Bash on Windows: a backslash there is an escape, not a separator.
const sl = (p) => p.split(path.sep).join('/')

const cleanup = (w) => fs.rmSync(w.root, { recursive: true, force: true })

// --- writes --------------------------------------------------------------------------

test('a write into another skitterspec project is refused, naming the exit', () => {
  const w = world()
  try {
    const r = checkPath({ home: w.home, target: path.join(w.other, 'src', 'new.js'), gitAt })
    assert.strictEqual(r.refuse, true)
    assert.match(r.reason, /is in other/)
    assert.match(r.reason, /the USER types \/allow-project other/)
    assert.strictEqual(checkPath({ home: w.home, target: path.join(w.otherWt, 'x.js'), gitAt }).project.name, 'other', 'its worktree is the same project')
  } finally {
    cleanup(w)
  }
})

// Stays silent: home, its worktree, a repo with no specs/.core, and a folder in no repo.
test('home, its worktree, a non-skitterspec repo and a loose folder are all allowed', () => {
  const w = world()
  try {
    for (const target of [path.join(w.home, 'a.js'), path.join(w.homeWt, 'b.js'), path.join(w.plain, 'c.js'), path.join(w.loose, 'd.md'), path.join(w.root, 'gone', 'deep', 'e.md')]) {
      assert.strictEqual(checkPath({ home: w.home, target, gitAt }).refuse, false, target)
    }
    assert.strictEqual(checkPath({ home: w.homeWt, target: path.join(w.home, 'a.js'), gitAt }).refuse, false, 'a session in the worktree is home too')
  } finally {
    cleanup(w)
  }
})

// --- commands ------------------------------------------------------------------------

test('a lifecycle command or a git change in another project is refused', () => {
  const w = world()
  try {
    const refused = [
      `cd ${sl(w.other)} && skitterspec spec-env down feat-y`,
      `pnpm exec skitterspec spec-env integrate feat-y --dir ${sl(w.other)}`,
      `git -C ${sl(w.otherWt)} commit -m x`,
      `cd ${sl(w.root)} && cd other && git push`,
    ]
    for (const command of refused) {
      assert.strictEqual(checkCommand({ home: w.home, cwd: w.home, command, gitAt }).refuse, true, command)
    }
    assert.strictEqual(checkCommand({ home: w.home, cwd: w.other, command: 'git add -A', gitAt }).refuse, true, 'a session already standing there')
  } finally {
    cleanup(w)
  }
})

// Stays silent: reads, other programs, and work at home.
test('reads, other programs and home work are allowed', () => {
  const w = world()
  try {
    const allowed = [
      `git -C ${sl(w.other)} log -3`,
      `git -C ${sl(w.other)} status --short`,
      `git -C ${sl(w.other)} worktree list`,
      `cd ${sl(w.other)} && skitterspec tada`,
      `cd ${sl(w.other)} && skitterspec todo --here`,
      `cd ${sl(w.other)} && skitterspec idea list --count`,
      `cd ${sl(w.other)} && skitterspec spec-env review waiting`,
      `ls ${sl(w.other)} && cat ${sl(w.other)}/README.md`,
      `git -C ${sl(w.homeWt)} commit -m x`,
      `cd ${sl(w.plain)} && git commit -m x`,
      'git commit -m "unterminated',
    ]
    for (const command of allowed) {
      assert.strictEqual(checkCommand({ home: w.home, cwd: w.home, command, gitAt }).refuse, false, command)
    }
  } finally {
    cleanup(w)
  }
})

test('segments carry the directory each runs in', () => {
  const segs = segmentsOf('cd /a && git status; cd b || echo "x y" | grep z', '/start')
  assert.deepStrictEqual(segs.map((s) => [s.dir, s.words[0]]), [
    [path.resolve('/a'), 'git'],
    [path.resolve('/a', 'b'), 'echo'],
    [path.resolve('/a', 'b'), 'grep'],
  ])
  assert.strictEqual(segmentsOf("echo 'open", '/'), null, 'an unbalanced quote cannot be read')
  assert.strictEqual(segmentsOf('cat <<EOF\nx\nEOF', '/'), null, 'nor can a heredoc')
})

test('a guard lift in another project is a change; its status is a read', () => {
  const at = (command) => lifecycleOf(segmentsOf(command, '/x')[0])
  assert.ok(at('skitterspec spec-env main allow'))
  assert.ok(at('skitterspec spec-env project allow home'))
  assert.strictEqual(at('skitterspec spec-env main status'), null)
  assert.strictEqual(at('skitterspec project'), null)
  assert.ok(at('skitterspec idea add x'), 'capturing an idea writes that project\'s base branch')
  assert.strictEqual(at('skitterspec idea list'), null)
  assert.ok(at('skitterspec project --name x'))
})

// --- lifts ---------------------------------------------------------------------------

const CONFIG = { registry: '.spec-env/registry.json' }

test('a lift covers its project for its session only', () => {
  const w = world()
  try {
    recordLift(w.home, CONFIG, { what: 'other', sessionId: 's1', gitAt })
    const allows = readAllows(w.home, CONFIG)
    const target = path.join(w.other, 'x.js')
    assert.strictEqual(checkPath({ home: w.home, target, gitAt, allows, sessionId: 's1' }).refuse, false)
    assert.strictEqual(checkPath({ home: w.home, target, gitAt, allows, sessionId: 's2' }).refuse, true, 'another session is still guarded')
    assert.strictEqual(checkPath({ home: w.home, target, gitAt, allows, sessionId: null }).refuse, true, 'no session id is not a match')
    assert.strictEqual(clearLift(w.home, CONFIG, 'other'), 1)
    assert.deepStrictEqual(readAllows(w.home, CONFIG), [])
  } finally {
    cleanup(w)
  }
})

test('a lift by path pins the exact repo; with no session id it is repo-wide', () => {
  const lift = { root: '/code/other', name: 'other', scope: 'repo' }
  assert.strictEqual(liftApplies(lift, { root: '/code/other', name: 'other' }, null), true)
  assert.strictEqual(liftApplies(lift, { root: '/elsewhere/other', name: 'other' }, null), false)
})

// Stays silent: an unreadable lift file is no lift, not a crash.
test('a malformed lift file reads as none', () => {
  const w = world()
  try {
    fs.mkdirSync(path.join(w.home, '.spec-env'), { recursive: true })
    fs.writeFileSync(path.join(w.home, '.spec-env', 'project-allow.json'), '{ nope')
    assert.deepStrictEqual(readAllows(w.home, CONFIG), [])
  } finally {
    cleanup(w)
  }
})

// --- the hook, end to end -------------------------------------------------------------

function fire(w, payload) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: 'sess', ...payload }),
    cwd: w.home,
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: ENGINE, CLAUDE_PROJECT_DIR: w.home, CLAUDE_CODE_SESSION_ID: 'sess' },
  })
  const out = (res.stdout || '').trim()
  return { status: res.status, out, decision: out ? JSON.parse(out).hookSpecificOutput.permissionDecision : null }
}

test('the hook denies an Edit and a Bash command aimed at another project', () => {
  const w = world()
  try {
    const edit = fire(w, { tool_name: 'Edit', tool_input: { file_path: path.join(w.other, 'README.md') }, cwd: w.home })
    assert.strictEqual(edit.status, 0)
    assert.strictEqual(edit.decision, 'deny')
    const bash = fire(w, { tool_name: 'Bash', tool_input: { command: `cd ${sl(w.other)} && git commit -m x` }, cwd: w.home })
    assert.strictEqual(bash.decision, 'deny')
  } finally {
    cleanup(w)
  }
})

test('the hook is silent at home, on reads, and after /allow-project', () => {
  const w = world()
  try {
    assert.strictEqual(fire(w, { tool_name: 'Edit', tool_input: { file_path: path.join(w.homeWt, 'README.md') }, cwd: w.homeWt }).out, '')
    assert.strictEqual(fire(w, { tool_name: 'Bash', tool_input: { command: `git -C ${sl(w.other)} log` }, cwd: w.home }).out, '')
    assert.strictEqual(fire(w, { tool_name: 'Bash', tool_input: { command: 'ls -la' }, cwd: w.other }).out, '')
    assert.strictEqual(fire(w, { tool_name: 'Read', tool_input: { file_path: path.join(w.other, 'README.md') }, cwd: w.home }).out, '')
    const lift = spawnSync(process.execPath, [ENGINE, 'spec-env', 'project', 'allow', 'other', '--dir', w.home], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'sess' },
    })
    assert.match(lift.stdout, /may work on other \(this session only/)
    assert.strictEqual(fire(w, { tool_name: 'Edit', tool_input: { file_path: path.join(w.other, 'README.md') }, cwd: w.home }).out, '')
  } finally {
    cleanup(w)
  }
})

// Stays silent: the guard switched off for the project.
test('guards.projectBoundary: false turns it off', () => {
  const w = world()
  try {
    fs.writeFileSync(path.join(w.home, 'specs', '.core', 'env.config.json'), JSON.stringify({ baseBranch: 'main', guards: { projectBoundary: false } }))
    assert.strictEqual(fire(w, { tool_name: 'Edit', tool_input: { file_path: path.join(w.other, 'README.md') }, cwd: w.home }).out, '')
  } finally {
    cleanup(w)
  }
})

// Stays silent: no engine at all is cannot-tell.
test('the hook fails open when the engine cannot run', () => {
  const w = world()
  try {
    const res = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(w.other, 'README.md') }, cwd: w.home }),
      encoding: 'utf8',
      env: { ...process.env, SKITTERSPEC_BIN: path.join(w.root, 'no-such-engine'), CLAUDE_PROJECT_DIR: w.home },
    })
    assert.strictEqual(res.status, 0)
    assert.strictEqual((res.stdout || '').trim(), '')
  } finally {
    cleanup(w)
  }
})
