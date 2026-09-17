'use strict'

/**
 * The main-guard hook, end to end — a real git repo, the real script, real
 * stdin.
 *
 * WHY THE REAL SCRIPT. The hook is the half that cannot be talked past, and it
 * runs in a process nothing else in the suite exercises: its own stdin read, its
 * own engine lookup, its own JSON. `env-mainguard.test.js` pins the judgement;
 * this pins that the judgement actually reaches the harness — and, far more
 * often, that it does not.
 *
 * EVERY FAILURE PATH IS A TEST HERE, because this hook fires on `Edit`, which is
 * the commonest tool call there is. A fail-closed bug in it would stop someone
 * working with no explanation, and would do so on every keystroke.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..', '..', '..')
const HOOK = path.join(__dirname, '..', 'assets', 'hooks', 'main-guard.cjs')
const ENGINE = path.join(ROOT, 'node_modules', '.bin', 'skitterspec')

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()

/** A real repo on `main`, with isolation configured and one committed file. */
function repo({ isolation = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hook-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'core.excludesFile', '/dev/null')
  if (isolation) {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }),
    )
  }
  fs.writeFileSync(path.join(dir, 'README.md'), '# x\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

/** Run the hook with a payload, and parse whatever it printed. */
function fire(payload, { cwd, engine = ENGINE } = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    cwd: cwd || payload.cwd,
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: engine },
  })
  const out = (res.stdout || '').trim()
  return {
    status: res.status,
    out,
    json: out ? JSON.parse(out) : null,
    decision: out ? JSON.parse(out).hookSpecificOutput.permissionDecision : null,
  }
}

const edit = (dir, extra = {}) => ({
  tool_name: 'Edit',
  tool_input: { file_path: path.join(dir, 'README.md') },
  cwd: dir,
  ...extra,
})

// --- it fires ---------------------------------------------------------------

test('an Edit in the primary checkout on main is denied, with both exits named', () => {
  const dir = repo()
  try {
    const r = fire(edit(dir))
    assert.strictEqual(r.status, 0, 'the hook itself always exits 0')
    assert.strictEqual(r.decision, 'deny')
    const why = r.json.hookSpecificOutput.permissionDecisionReason
    assert.match(why, /landing zone/)
    assert.match(why, /\/no-spec <name>/)
    assert.match(why, /the USER types \/allow-main/)
  } finally {
    cleanup(dir)
  }
})

test('every write tool is covered, and nothing else is', () => {
  const dir = repo()
  try {
    for (const tool of ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']) {
      assert.strictEqual(fire({ ...edit(dir), tool_name: tool }).decision, 'deny', tool)
    }
    // Bash belongs to the review gate; Read and Grep write nothing at all.
    for (const tool of ['Bash', 'Read', 'Grep', 'Glob']) {
      assert.strictEqual(fire({ ...edit(dir), tool_name: tool }).out, '', tool)
    }
  } finally {
    cleanup(dir)
  }
})

// ---------------------------------------------------------------------------
// STAYS SILENT — one per blind spot. Each asserts EMPTY OUTPUT, not merely a
// non-deny: exit 0 with no JSON is "no opinion", and anything else on stdout
// would reach the harness.
// ---------------------------------------------------------------------------

test('STAYS SILENT: inside a worktree on a spec branch', () => {
  const dir = repo()
  try {
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/thing', wt)
    assert.strictEqual(fire(edit(wt)).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: the primary checkout on a spec branch', () => {
  const dir = repo()
  try {
    git(dir, 'switch', '-q', '-c', 'feat/live')
    assert.strictEqual(fire(edit(dir)).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: a repo with no isolation config', () => {
  const dir = repo({ isolation: false })
  try {
    assert.strictEqual(fire(edit(dir)).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: a directory that is not a git repo at all', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-nogit-')))
  try {
    assert.strictEqual(fire(edit(dir)).out, '')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: guards.mainIsLandingZone is false', () => {
  const dir = repo()
  try {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'main', guards: { mainIsLandingZone: false } }),
    )
    assert.strictEqual(fire(edit(dir)).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: no engine on the machine', () => {
  const dir = repo()
  try {
    assert.strictEqual(fire(edit(dir), { engine: '/nowhere/skitterspec' }).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: an engine that exits non-1, whatever it prints', () => {
  // Only exit 1 is a refusal. A crash (2), a usage error, a stack trace on
  // stdout — all of them are cannot-tell, and this hook must not turn any of
  // them into somebody's blocked edit.
  const dir = repo()
  const fake = path.join(dir, 'fake-engine')
  try {
    fs.writeFileSync(fake, '#!/bin/sh\necho "boom"\nexit 2\n')
    fs.chmodSync(fake, 0o755)
    assert.strictEqual(fire(edit(dir), { engine: fake }).out, '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: an unreadable payload', () => {
  const dir = repo()
  try {
    const res = spawnSync(process.execPath, [HOOK], {
      input: 'not json at all',
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, SKITTERSPEC_BIN: ENGINE },
    })
    assert.strictEqual(res.status, 0)
    assert.strictEqual((res.stdout || '').trim(), '')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: a payload with no tool name and no cwd', () => {
  const dir = repo()
  try {
    assert.strictEqual(fire({}, { cwd: dir }).out, '')
  } finally {
    cleanup(dir)
  }
})

// --- the allow --------------------------------------------------------------

test('an allow for this session lets the write through; another session does not', () => {
  const dir = repo()
  try {
    execFileSync(ENGINE, ['spec-env', 'main', 'allow', 'by', 'hand', '--dir', dir, '--session', 'S1'], {
      stdio: 'ignore',
    })
    assert.strictEqual(fire({ ...edit(dir), session_id: 'S1' }).out, '', 'the session that asked')
    assert.strictEqual(
      fire({ ...edit(dir), session_id: 'S2' }).decision,
      'deny',
      'a different conversation is still guarded',
    )
  } finally {
    cleanup(dir)
  }
})

test('/allow-main off restores the guard', () => {
  const dir = repo()
  try {
    execFileSync(ENGINE, ['spec-env', 'main', 'allow', '--dir', dir, '--session', 'S1'], {
      stdio: 'ignore',
    })
    assert.strictEqual(fire({ ...edit(dir), session_id: 'S1' }).out, '')
    execFileSync(ENGINE, ['spec-env', 'main', 'allow', 'off', '--dir', dir, '--session', 'S1'], {
      stdio: 'ignore',
    })
    assert.strictEqual(fire({ ...edit(dir), session_id: 'S1' }).decision, 'deny')
  } finally {
    cleanup(dir)
  }
})

test('the allow file is gitignored, so it never reaches anyone else', () => {
  const dir = repo()
  try {
    execFileSync(ENGINE, ['spec-env', 'main', 'allow', '--dir', dir, '--session', 'S1'], {
      stdio: 'ignore',
    })
    assert.strictEqual(git(dir, 'status', '--porcelain'), '', 'nothing to commit')
  } finally {
    cleanup(dir)
  }
})

// --- the script itself ------------------------------------------------------

test('it is a .cjs file, so a "type": "module" project can still parse it', () => {
  // The review gate died on its own first `require` in every ESM project when
  // it shipped as `.js`. The extension settles the parse mode at the file,
  // independently of the one file skitterspec does not control.
  assert.ok(HOOK.endsWith('.cjs'))
})

test('a crash inside the hook still lets the write through', () => {
  // Even a bug in this file is a cannot-tell.
  const { findEngine } = require(HOOK)
  assert.strictEqual(typeof findEngine, 'function')
  const src = fs.readFileSync(HOOK, 'utf8')
  assert.match(src, /catch \{\s*\n\s*\/\/ Even a bug in this file lets the write through\.\s*\n\s*allow\(\)/)
})
