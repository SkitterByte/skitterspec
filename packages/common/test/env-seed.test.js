'use strict'

/**
 * Integration tests for `seedFiles`: run the shell commands `planUp` emits inside
 * a real linked git worktree and observe the effect on disk. This is the seam the
 * unit tests can't cover — that the generated one-liners actually resolve the main
 * checkout, symlink/copy correctly, skip gracefully, and stay invisible to the
 * teardown dirty guard.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { seedCommandFor, worktreeCd } = require('../src/env/provision.js')

// Run a git command in `cwd`, returning trimmed stdout.
function git(cwd, ...argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8' }).trim()
}

// Run a seed command as the skill would: POSIX sh, cwd = the worktree. Returns
// stdout so tests can assert on the "seeded …"/"skipped" notes.
function runSeed(worktree, cmd) {
  return execFileSync('/bin/sh', ['-c', cmd], { cwd: worktree, encoding: 'utf8' })
}

// Scaffold a main checkout with an initial commit and a linked worktree, then
// return both paths. `mainFiles` are written (and gitignored) into main before
// the worktree is added, standing in for real gitignored .env/local overrides.
function scaffold(mainFiles = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-seed-'))
  const main = path.join(root, 'main')
  fs.mkdirSync(main)
  git(main, 'init', '-q')
  git(main, 'config', 'user.email', 'test@example.com')
  git(main, 'config', 'user.name', 'Test')
  // A committed file so the repo has a HEAD to branch a worktree from.
  fs.writeFileSync(path.join(main, 'README.md'), '# main\n')
  fs.writeFileSync(path.join(main, '.gitignore'), Object.keys(mainFiles).join('\n') + '\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-qm', 'init')
  for (const [rel, content] of Object.entries(mainFiles)) {
    fs.writeFileSync(path.join(main, rel), content)
  }
  const wt = path.join(root, 'wt')
  git(main, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
  return { main, wt }
}

test('symlink mode: worktree file points at the main file and stays in sync', () => {
  const { main, wt } = scaffold({ '.env': 'SECRET=1\n' })
  const out = runSeed(wt, seedCommandFor('.env', 'symlink'))

  const target = path.join(wt, '.env')
  assert.ok(fs.lstatSync(target).isSymbolicLink(), 'target is a symlink')
  assert.strictEqual(fs.realpathSync(target), fs.realpathSync(path.join(main, '.env')))
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'SECRET=1\n')
  assert.match(out, /seeded \.env →/, 'prints the seeded note')

  // Editing main is reflected through the symlink (the point of symlink mode).
  fs.writeFileSync(path.join(main, '.env'), 'SECRET=2\n')
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'SECRET=2\n')
})

test('copy mode: worktree file is an independent copy', () => {
  const { main, wt } = scaffold({ '.env': 'SECRET=1\n' })
  runSeed(wt, seedCommandFor('.env', 'copy'))

  const target = path.join(wt, '.env')
  assert.ok(fs.lstatSync(target).isFile(), 'target is a regular file, not a symlink')
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'SECRET=1\n')

  // Editing main does NOT change the copy.
  fs.writeFileSync(path.join(main, '.env'), 'SECRET=2\n')
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'SECRET=1\n')
})

test('source missing in main: no-op with a printed note (not an error)', () => {
  const { wt } = scaffold({ '.env': 'SECRET=1\n' })
  const out = runSeed(wt, seedCommandFor('.local-secrets.jsonc', 'symlink'))
  assert.ok(!fs.existsSync(path.join(wt, '.local-secrets.jsonc')), 'nothing created')
  assert.match(out, /not in main — skipped/)
})

test('target exists: idempotent — leaves it untouched and reports skipped', () => {
  const { wt } = scaffold({ '.env': 'FROM_MAIN\n' })
  const target = path.join(wt, '.env')
  fs.writeFileSync(target, 'PRE_EXISTING\n')
  const out = runSeed(wt, seedCommandFor('.env', 'symlink'))
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'PRE_EXISTING\n', 'existing file untouched')
  assert.match(out, /exists — skipped/)
})

test('re-running a symlink seed is idempotent (skips the already-linked file)', () => {
  const { wt } = scaffold({ '.env': 'SECRET=1\n' })
  const cmd = seedCommandFor('.env', 'symlink')
  runSeed(wt, cmd)
  const out = runSeed(wt, cmd) // second pass = re-attach
  assert.match(out, /exists — skipped/)
  assert.ok(fs.lstatSync(path.join(wt, '.env')).isSymbolicLink(), 'still a symlink')
})

test('the main checkout is resolved from inside the linked worktree', () => {
  // The command must find main via `git rev-parse --git-common-dir`, so this only
  // passes because it resolves the sibling `main`, not a hardcoded path.
  const { main, wt } = scaffold({ '.env': 'SECRET=1\n' })
  runSeed(wt, seedCommandFor('.env', 'symlink'))
  const linkText = fs.readlinkSync(path.join(wt, '.env'))
  assert.ok(
    linkText.includes(path.join(main, '.env')) || fs.realpathSync(path.join(wt, '.env')) === fs.realpathSync(path.join(main, '.env')),
    'symlink resolves to the main checkout',
  )
})

test('seeded gitignored file keeps the worktree clean (teardown guard is a no-op)', () => {
  const { wt } = scaffold({ '.env': 'SECRET=1\n' })
  runSeed(wt, seedCommandFor('.env', 'symlink'))
  // The teardown dirty guard uses `git status --porcelain`; a gitignored seed must
  // not show up there, or `spec-env down` would wrongly refuse to tear down.
  assert.strictEqual(git(wt, 'status', '--porcelain'), '', 'no dirty/untracked entries')
})

// --- the worktree `cd` prefix on "in the worktree" commands ------------------
//
// This prefix is what makes the reported failure visible. Without it, a seed run
// from the main checkout resolves `$m` to that same checkout, so source and
// target are one file and it prints "exists — skipped" — indistinguishable from
// a correctly-provisioned re-run, at exit 0.

// Run a command as the skill would, capturing the exit code as well as output.
function runPrefixed(cwd, cmd) {
  try {
    const out = execFileSync('/bin/sh', ['-c', cmd], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

test('a seed aborts from the main checkout when the worktree was never created', () => {
  const { main, wt } = scaffold({ '.env': 'SECRET=1\n' })
  const missing = wt + '-missing' // the worktree the plan named but nobody created
  const cmd = `${worktreeCd(missing)}; ${seedCommandFor('.env', 'symlink')}`

  const { code, out } = runPrefixed(main, cmd)
  assert.notStrictEqual(code, 0, 'exits non-zero so the caller cannot miss it')
  assert.match(out, /no worktree at .* — run the provisioning commands first/)
  assert.doesNotMatch(out, /exists — skipped/, 'never emits the misleading success line')
})

test('a setup command aborts from the main checkout when the worktree is absent', () => {
  const { main, wt } = scaffold()
  const cmd = `${worktreeCd(wt + '-missing')}; echo INSTALLED`

  const { code, out } = runPrefixed(main, cmd)
  assert.notStrictEqual(code, 0, 'exits non-zero')
  assert.doesNotMatch(out, /INSTALLED/, 'the setup command never ran')
})

test('the prefix positions a command run from the wrong cwd into the worktree', () => {
  const { main, wt } = scaffold({ '.env': 'SECRET=1\n' })
  const cmd = `${worktreeCd(wt)}; ${seedCommandFor('.env', 'symlink')}`

  // Run it from the main checkout, as the reported session did.
  const { code, out } = runPrefixed(main, cmd)
  assert.strictEqual(code, 0, `unexpected failure: ${out}`)
  assert.match(out, /seeded \.env →/, 'it seeded rather than silently skipping')
  assert.ok(fs.lstatSync(path.join(wt, '.env')).isSymbolicLink(), 'landed in the worktree')
  assert.ok(!fs.lstatSync(path.join(main, '.env')).isSymbolicLink(), 'main untouched')
})

test('the prefix does not false-refuse on a symlinked tmp path', () => {
  // os.tmpdir() sits under /var → /private/var on macOS, so `wt` (a lexical
  // path.resolve, as the planner builds it) differs from git's --show-toplevel.
  // A string comparison against that would refuse here; `cd` does not care.
  const { wt } = scaffold({ '.env': 'SECRET=1\n' })
  const cmd = `${worktreeCd(wt)}; ${seedCommandFor('.env', 'symlink')}`

  const { code, out } = runPrefixed(wt, cmd)
  assert.strictEqual(code, 0, `prefix false-refused inside the worktree: ${out}`)
  assert.match(out, /seeded \.env →/, 'the seed ran normally')
})
