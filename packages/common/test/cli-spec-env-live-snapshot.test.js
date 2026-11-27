'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { fixture } = require('./helpers/repo.js')

// `live take --snapshot` against a real repo: a primary checkout on main and a
// spec worktree whose branch adds a migration. The project's snapshot command
// is a node one-liner (it must run under cmd.exe too), which writes the
// primary checkout's branch into `SPEC_ENV_SNAPSHOT` — so the file says
// whether the snapshot ran before the checkout or after it.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
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

const NODE = JSON.stringify(process.execPath)
const RECORD_BRANCH =
  `${NODE} -e "require('fs').writeFileSync(process.env.SPEC_ENV_SNAPSHOT, ` +
  `require('child_process').execSync('git symbolic-ref --short HEAD').toString())"`
const FAIL = `${NODE} -e "console.error('pg_dump: connection refused'); process.exit(3)"`
const RESTORE = `${NODE} -e "0"`

function buildRepo(dir, { migration = true } = {}) {
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', live: { migrations: ['db/migrations/**'] } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
  const file = migration ? path.join('db', 'migrations', '001.sql') : 'change.txt'
  fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true })
  fs.writeFileSync(path.join(worktree, file), 'work\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'phase work')
}
const migrationCopy = fixture('skitterspec-snap-', (dir) => buildRepo(dir))
const codeOnlyCopy = fixture('skitterspec-snap-', (dir) => buildRepo(dir, { migration: false }))

// Commit a `live` block onto the scaffold's config, keeping the tree clean.
function setLive(dir, live) {
  const configPath = path.join(dir, 'specs', '.core', 'env.config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  config.live = { ...config.live, ...live }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  git(dir, 'commit', '-q', '-am', 'live config')
}

function scaffold(copy, live) {
  const dir = copy()
  setLive(dir, live)
  return { dir, worktree: path.resolve(dir, `../${path.basename(dir)}-wt`, 'x') }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const snapshotsDir = (dir) => path.join(dir, '.spec-env', 'snapshots')
const receiptOf = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'live.json'), 'utf-8'))
  } catch {
    return null
  }
}

test('snapshot reach refuses a migrations branch with a satisfy offer, on every take', async () => {
  const { dir } = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore: RESTORE })
  try {
    for (let i = 0; i < 2; i++) {
      const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--json', '--dir', dir])
      const res = JSON.parse(out)
      assert.strictEqual(res.blocked, true)
      assert.deepStrictEqual(res.offer, {
        kind: 'satisfy',
        label: 'Snapshot the database, then take it live',
        command: 'skitterspec spec-env live take feat-x --snapshot',
      }, `take ${i + 1} — a satisfy is never spent`)
    }
    assert.strictEqual(fs.existsSync(snapshotsDir(dir)), false, 'a refusal snapshots nothing')
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
  } finally {
    cleanup(dir)
  }
})

test('--snapshot runs the snapshot before the checkout and records it on the receipt', async () => {
  const { dir } = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore: RESTORE })
  try {
    const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--snapshot', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
    assert.match(out, /snapshot: .*restored on release/)
    assert.match(out, /data written while feat-x is live is lost/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    const receipt = receiptOf(dir)
    assert.ok(receipt.snapshot, 'the receipt names the snapshot')
    assert.ok(receipt.snapshot.path.startsWith(snapshotsDir(dir)), receipt.snapshot.path)
    assert.match(path.basename(receipt.snapshot.path), /^feat-x-\d+/)
    assert.strictEqual(receipt.snapshot.at, receipt.heldSince)
    // The command saw the primary checkout still on main: it ran first.
    assert.strictEqual(fs.readFileSync(receipt.snapshot.path, 'utf-8').trim(), 'main')
  } finally {
    cleanup(dir)
  }
})

test('a failed snapshot switches nothing and keeps no file', async () => {
  const { dir, worktree } = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: FAIL, restore: RESTORE })
  try {
    const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--snapshot', '--dir', dir])
    assert.match(out, /NOT LIVE/)
    assert.match(out, /snapshot command failed \(exit 3\) — nothing switched/)
    assert.match(out, /pg_dump: connection refused/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.strictEqual(receiptOf(dir), null)
    const left = fs.existsSync(snapshotsDir(dir)) ? fs.readdirSync(snapshotsDir(dir)) : []
    assert.deepStrictEqual(left, [])
  } finally {
    cleanup(dir)
  }
})

test('snapshot reach without a restore reads as unset and says so', async () => {
  const { dir } = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH })
  try {
    const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--snapshot', '--dir', dir])
    assert.match(out, /refusedReach "snapshot" needs live\.restore set — read as unset/)
    assert.match(out, /`worktree` · `pr` · `live-confirm` · `snapshot`/)
    assert.match(out, /--snapshot needs `live\.refusedReach: "snapshot"`/)
    assert.doesNotMatch(out, /Snapshot the database, then take it live/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(fs.existsSync(snapshotsDir(dir)), false)
  } finally {
    cleanup(dir)
  }
})

// Stays silent: a code-only branch under the snapshot reach is the commonest
// take it will ever see, and it must look exactly as it did before.
test('stays silent: a code-only branch takes no snapshot, even on --snapshot', async () => {
  const { dir } = scaffold(codeOnlyCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore: RESTORE })
  try {
    const out = await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--snapshot', '--dir', dir])
    assert.match(out, /feat-x is live on the primary checkout/)
    assert.doesNotMatch(out, /snapshot|restored|lost/i)
    assert.strictEqual(fs.existsSync(snapshotsDir(dir)), false)
    assert.strictEqual(receiptOf(dir).snapshot, undefined)
  } finally {
    cleanup(dir)
  }
})

// --- phase 2: every hand-back restores ---------------------------------------

// Writes the primary checkout's branch beside the snapshot, so a test can read
// both that the restore ran and where the checkout stood when it did.
const RECORD_RESTORE =
  `${NODE} -e "require('fs').writeFileSync(process.env.SPEC_ENV_SNAPSHOT + '.restored', ` +
  `require('child_process').execSync('git symbolic-ref --short HEAD').toString())"`
const FAIL_RESTORE = `${NODE} -e "console.error('pg_restore: role missing'); process.exit(4)"`
const pendingFile = (dir) => path.join(dir, '.spec-env', 'live-restore.json')

async function takeWithSnapshot(restore) {
  const s = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore })
  await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--snapshot', '--dir', s.dir])
  const snap = receiptOf(s.dir).snapshot.path
  assert.ok(fs.existsSync(snap))
  return { ...s, snap }
}

test('release restores on base, removes the snapshot and leaves nothing pending', async () => {
  const { dir, worktree, snap } = await takeWithSnapshot(RECORD_RESTORE)
  try {
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /feat-x released/)
    assert.match(out, /restored: {2}the database from .* \(snapshot removed\)/)
    assert.strictEqual(fs.readFileSync(`${snap}.restored`, 'utf-8').trim(), 'main', 'ran after the checkout')
    assert.strictEqual(fs.existsSync(snap), false)
    assert.strictEqual(fs.existsSync(pendingFile(dir)), false)
    assert.strictEqual(receiptOf(dir), null)
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
  } finally {
    cleanup(dir)
  }
})

test('a failed restore keeps the switch and the snapshot; status warns until live restore succeeds', async () => {
  const { dir, snap } = await takeWithSnapshot(FAIL_RESTORE)
  try {
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /restore failed \(exit 4\) — the switch stands and the snapshot is kept/)
    assert.match(out, /pg_restore: role missing/)
    assert.match(out, /retry with: skitterspec spec-env live restore/)
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main', 'the switch stands')
    assert.ok(fs.existsSync(snap), 'the snapshot is kept')
    const pending = JSON.parse(fs.readFileSync(pendingFile(dir), 'utf-8'))
    assert.strictEqual(pending.spec, 'feat-x')
    assert.strictEqual(pending.path, snap)

    const status = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(status, /! a restore is pending for feat-x/)
    const json = JSON.parse(await runQuiet(['spec-env', 'live', 'status', '--json', '--dir', dir]))
    assert.strictEqual(json.pendingRestore.path, snap)

    // Still failing: still pending, file still kept.
    const again = await runQuiet(['spec-env', 'live', 'restore', '--dir', dir])
    assert.match(again, /still pending/)
    assert.ok(fs.existsSync(snap) && fs.existsSync(pendingFile(dir)))

    setLive(dir, { restore: RECORD_RESTORE })
    const fixed = await runQuiet(['spec-env', 'live', 'restore', '--dir', dir])
    assert.match(fixed, /spec-env live restore: restored — feat-x/)
    assert.strictEqual(fs.existsSync(snap), false)
    assert.strictEqual(fs.existsSync(pendingFile(dir)), false)
    assert.doesNotMatch(await runQuiet(['spec-env', 'live', 'status', '--dir', dir]), /restore/)
  } finally {
    cleanup(dir)
  }
})

test('abort restores the snapshot a crashed take left behind', async () => {
  const { dir, snap } = await takeWithSnapshot(RECORD_RESTORE)
  try {
    const out = await runQuiet(['spec-env', 'live', 'abort', '--dir', dir])
    assert.match(out, /recovered — primary back on main/)
    assert.match(out, /restored: /)
    assert.strictEqual(fs.readFileSync(`${snap}.restored`, 'utf-8').trim(), 'main')
    assert.strictEqual(fs.existsSync(snap), false)
  } finally {
    cleanup(dir)
  }
})

test('integrate restores before it lands when it ends a snapshotting take', async () => {
  const { dir, snap } = await takeWithSnapshot(RECORD_RESTORE)
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    const ended = out.indexOf('ended live session')
    const restored = out.indexOf('restored: ')
    assert.ok(ended >= 0 && restored > ended, out)
    assert.ok(restored < out.indexOf('merge --ff-only'), 'restored before the landing plan')
    assert.strictEqual(fs.readFileSync(`${snap}.restored`, 'utf-8').trim(), 'main')
    assert.strictEqual(fs.existsSync(snap), false)
  } finally {
    cleanup(dir)
  }
})

test('an unreadable pending record counts as pending: status warns and live restore keeps it', async () => {
  const { dir } = scaffold(migrationCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore: RECORD_RESTORE })
  try {
    fs.mkdirSync(path.join(dir, '.spec-env'), { recursive: true })
    fs.writeFileSync(pendingFile(dir), '{not json')
    assert.match(await runQuiet(['spec-env', 'live', 'status', '--dir', dir]), /! a restore may be pending/)
    const out = await runQuiet(['spec-env', 'live', 'restore', '--dir', dir])
    assert.match(out, /blocked — .*unreadable/)
    assert.ok(fs.existsSync(pendingFile(dir)), 'never deleted')
  } finally {
    cleanup(dir)
  }
})

// Stays silent: every hand-back without a snapshot is untouched by the feature.
test('stays silent: a release with no snapshot on the receipt runs no restore', async () => {
  const { dir } = scaffold(codeOnlyCopy, { refusedReach: 'snapshot', snapshot: RECORD_BRANCH, restore: FAIL_RESTORE })
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir])
    const out = await runQuiet(['spec-env', 'live', 'release', '--dir', dir])
    assert.match(out, /feat-x released/)
    assert.doesNotMatch(out, /restore/)
    assert.strictEqual(fs.existsSync(pendingFile(dir)), false)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: live status with no pending record warns nothing; live restore is a no-op', async () => {
  const dir = codeOnlyCopy()
  try {
    const status = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.doesNotMatch(status, /restore|!/)
    assert.strictEqual('pendingRestore' in JSON.parse(await runQuiet(['spec-env', 'live', 'status', '--json', '--dir', dir])), false)
    assert.match(await runQuiet(['spec-env', 'live', 'restore', '--dir', dir]), /nothing to restore/)
  } finally {
    cleanup(dir)
  }
})
