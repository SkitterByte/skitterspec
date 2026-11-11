'use strict'

/**
 * `spec-env down` and the remote branch.
 *
 * The planner's own tests cover the policy; these drive the real CLI over a real
 * git repo with a real remote, because the property that matters is a rendering
 * one: the push must land in a section a reader (or an agent) can tell apart from
 * `run these:`. A test on `plan.remoteCommands` alone would still pass if the CLI
 * printed both lists under the same heading.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

// A checkout on `main` with a bare remote, one worktree-only spec, and its branch
// pushed and merged — the exact shape /spec-complete leaves behind.
function scaffold({ remoteName = 'origin', push = true, merge = true, config = {} } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-down-')))
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-remote-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })

  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, ...config }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'remote', 'add', remoteName, remote)
  git(dir, 'push', '-q', remoteName, 'main')

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/thing', worktree)
  fs.writeFileSync(path.join(worktree, 'work.txt'), 'work\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'phase 1')
  // /spec-start pushes the branch at provision time.
  if (push) git(worktree, 'push', '-q', '-u', remoteName, 'feat/thing')
  // /spec-complete lands it before teardown.
  if (merge) git(dir, 'merge', '-q', '--ff-only', 'feat/thing')

  return { dir, worktree, remote }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

// The `run these:` block only — everything up to a blank line or a new heading.
function runTheseBlock(out) {
  const lines = out.split('\n')
  const start = lines.findIndex((l) => l.trim() === 'run these:')
  assert.ok(start !== -1, `no "run these:" heading in:\n${out}`)
  const block = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) break
    block.push(line.trim())
  }
  return block
}

test('a landed, pushed branch prints the push under its own confirm-first heading', async () => {
  const { dir } = scaffold()
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])

  assert.match(out, /remote branch — confirm with the user first:/)
  assert.match(out, /git push origin --delete feat\/thing/)

  // The point of the whole design: `run these:` stays runnable blind.
  const runThese = runTheseBlock(out)
  assert.ok(
    !runThese.some((c) => c.includes('push')),
    `push leaked into run-these:\n${runThese.join('\n')}`,
  )
  assert.ok(runThese.some((c) => c.startsWith('git branch -D')))
  cleanup(dir)
})

test('a branch that was never pushed prints no remote section at all', async () => {
  const { dir } = scaffold({ push: false })
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
  assert.ok(!/remote branch/.test(out), `unexpected remote section:\n${out}`)
  assert.match(out, /git branch -D feat\/thing/)
  cleanup(dir)
})

test('an unlanded branch prints no remote section, even with --force', async () => {
  const { dir } = scaffold({ merge: false })
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--force', '--dir', dir])
  assert.ok(!/remote branch/.test(out), `unexpected remote section:\n${out}`)
  cleanup(dir)
})

test('a non-origin remote is honoured end to end', async () => {
  const { dir } = scaffold({ remoteName: 'upstream' })
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
  assert.match(out, /git push upstream --delete feat\/thing/)
  cleanup(dir)
})

test('"always" folds the push into run-these and prints no second heading', async () => {
  const { dir } = scaffold({ config: { teardown: { deleteRemoteBranch: 'always' } } })
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
  assert.ok(!/remote branch/.test(out), `second heading should be gone:\n${out}`)
  assert.ok(runTheseBlock(out).some((c) => c === 'git push origin --delete feat/thing'))
  cleanup(dir)
})

test('"never" prints nothing about the remote', async () => {
  const { dir } = scaffold({ config: { teardown: { deleteRemoteBranch: 'never' } } })
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
  assert.ok(!/push/.test(out), `unexpected push:\n${out}`)
  cleanup(dir)
})

test('a branch pushed WITHOUT -u is still found, via the remote list', async () => {
  // /spec-start says "push the branch" without prescribing the command, so upstream
  // may never be configured. The fallback must still see the ref.
  const { dir, worktree } = scaffold({ push: false })
  git(worktree, 'push', '-q', 'origin', 'feat/thing')
  git(dir, 'merge', '-q', '--ff-only', 'feat/thing')
  const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
  assert.match(out, /git push origin --delete feat\/thing/)
  cleanup(dir)
})

// --- land.strategy: "pr" -----------------------------------------------------

const PR_CONFIG = { land: { strategy: 'pr' } }

test('pr mode: an unmerged branch on an unknown host blocks rather than -d', async () => {
  // The scaffold's remote is a local bare repo — no adapter recognises it, so
  // the merged lookup is a cannot-tell, and cannot-tell must hold the worktree.
  const { dir } = scaffold({ merge: false, config: PR_CONFIG })
  try {
    const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
    assert.match(out, /blocked — cannot confirm the PR for feat\/thing merged/)
    assert.doesNotMatch(out, /git branch -[dD] feat\/thing/)
  } finally {
    cleanup(dir)
  }
})

test('pr mode stays silent on an ancestry-merged branch — no adapter needed', async () => {
  // Landed the trunk way: merged into local main. The host is never asked and
  // the teardown is exactly the trunk one, -D and the confirm-first remote line.
  const { dir } = scaffold({ config: PR_CONFIG })
  try {
    const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
    assert.doesNotMatch(out, /blocked/)
    assert.ok(runTheseBlock(out).includes('git branch -D feat/thing'))
  } finally {
    cleanup(dir)
  }
})

// --- docs lane (feat-tracker-spec-branches) ------------------------------------

// A branch-mode spec that was authored and pushed but never started: its only
// commit touches its own documents.
function docsOnlyScaffold(extra = {}) {
  const s = scaffold({ push: false, merge: false, config: { land: { specDocs: 'branch' }, ...extra } })
  git(s.worktree, 'reset', '-q', '--hard', 'HEAD~1')
  fs.appendFileSync(path.join(s.worktree, 'specs', 'in-progress', 'feat-thing', '00-overview.md'), '\nmore\n')
  git(s.worktree, 'commit', '-q', '-am', 'spec')
  git(s.worktree, 'push', '-q', '-u', 'origin', 'feat/thing')
  return s
}

test('docs lane: a never-started spec branch offers its remote delete, confirm-first', async () => {
  const { dir, remote } = docsOnlyScaffold()
  try {
    const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--dir', dir])
    assert.match(out, /remote branch — confirm with the user first:\n\s+git push origin --delete feat\/thing/)
  } finally {
    cleanup(dir)
    fs.rmSync(remote, { recursive: true, force: true })
  }
})

test('stays-silent: a docs-lane branch carrying code is not offered', async () => {
  const s = scaffold({ push: true, merge: false, config: { land: { specDocs: 'branch' } } })
  try {
    const out = await runQuiet(['spec-env', 'down', 'feat-thing', '--force', '--dir', s.dir])
    assert.doesNotMatch(out, /--delete/)
  } finally {
    cleanup(s.dir)
    fs.rmSync(s.remote, { recursive: true, force: true })
  }
})
