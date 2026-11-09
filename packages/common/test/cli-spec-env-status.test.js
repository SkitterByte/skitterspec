'use strict'

// `spec-env status` answers "what is provisioned?". A spec is provisioned when it
// has a WORKTREE — the slot registry only ever records specs whose Stack asks for
// Docker (`specEnvUp` allocates a slot solely when `wantsDocker`), so reading it
// alone reports nothing at all in a project with `docker.enabled: false`.
//
// Same wrong-signal shape fixed in `feat-script-only-commands` for zero-arg
// resolution: the registry is not evidence of provisioning.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { makeRepo, repoFor } = require('./helpers/repo.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function scaffold({ docker = false } = {}) {
  return makeRepo({
    name: 'skitterspec-status-',
    config: { baseBranch: 'main', docker: { enabled: docker } },
  }).dir
}

function addSpec(dir, folder, stack = 'worktree') {
  const specDir = path.join(dir, 'specs', 'in-progress', folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `# X\n\n> **Stack:** ${stack}\n`)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `add ${folder}`)
}

// The project folder inside the new worktree — the worktree itself unless the
// project is nested (test/helpers/repo.js).
function addWorktree(dir, folder) {
  return repoFor(dir).addWorktree(folder)
}

function cleanup(dir) {
  repoFor(dir).cleanup()
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

test('status lists a worktree-only spec in a project with Docker off', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /feat-alpha/, 'the standing worktree is reported')
    assert.doesNotMatch(out, /no provisioned specs/, 'it is not called unprovisioned')
  } finally {
    cleanup(dir)
  }
})

test('status shows the worktree path, since that is what provisioned means', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    const wt = addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.ok(out.includes(path.basename(wt)), `expected the worktree path, got:\n${out}`)
  } finally {
    cleanup(dir)
  }
})

test('status lists every provisioned spec, not just the first', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    addWorktree(dir, 'feat-beta')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /feat-alpha/, 'first')
    assert.match(out, /feat-beta/, 'second')
  } finally {
    cleanup(dir)
  }
})

// --- stays-silent (.claude/rules/negative-checks.md rule 3) -----------------

test('stays silent: a genuinely empty repo still reports no provisioned specs', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha') // a spec, but no worktree — not provisioned
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /no provisioned specs/, 'a bucketed spec is not provisioned')
    assert.doesNotMatch(out, /feat-alpha/, 'and is not listed')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: the primary checkout is never listed as a provisioned spec', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    // The primary ROOT's name: nested, the project folder's own name is in every
    // worktree's path too (<wt>/<prefix>), and says nothing about the primary.
    const primary = path.basename(repoFor(dir).root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.doesNotMatch(out, new RegExp(`${primary}\\s`), 'primary is not a spec')
  } finally {
    cleanup(dir)
  }
})

// --- `in-flight:` is a machine seam, and it answers in three states ----------
//
// `/spec-next` reads this line to decide which spec it may build, so its format
// is a contract, not display text. Three states rather than two: a branch
// switched by hand carries no receipt, so the spec is genuinely UNKNOWN even
// though the checkout is plainly busy. Calling that `none` would invite building
// the wrong spec — the one mistake this line exists to prevent.

function liveStatus(dir) {
  const bin = path.join(__dirname, '..', 'bin', 'skitterspec.js')
  return execFileSync('node', [bin, 'spec-env', 'live', 'status'], { cwd: dir }).toString()
}

function repoWithConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-inflight-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), '{}')
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' })
  git('init', '-qb', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 'T')
  git('add', '-A')
  git('commit', '-qm', 'init')
  return dir
}

test('in-flight reports none on a free workbench', () => {
  const out = liveStatus(repoWithConfig())
  assert.match(out, /^ {2}in-flight: none/m, 'the stable line, with the stable prefix')
})

test('in-flight reports unknown for a branch with no receipt', () => {
  const dir = repoWithConfig()
  execFileSync('git', ['-C', dir, 'switch', '-qc', 'feat/by-hand'], { stdio: 'ignore' })
  const out = liveStatus(dir)
  assert.match(out, /^ {2}in-flight: unknown/m, 'not "none" — the checkout is busy')
  assert.match(out, /feat\/by-hand/, 'names what it can see')
})

test('the in-flight line is present in every state, so a caller can rely on it', () => {
  // A seam that sometimes vanishes forces callers back to parsing prose.
  const free = liveStatus(repoWithConfig())
  const dir = repoWithConfig()
  execFileSync('git', ['-C', dir, 'switch', '-qc', 'feat/x'], { stdio: 'ignore' })
  for (const out of [free, liveStatus(dir)]) {
    assert.strictEqual((out.match(/^ {2}in-flight: /gm) || []).length, 1, 'exactly one in-flight line')
  }
})

// --- `skitterspec status`: each spec read from its OWN worktree --------------
//
// The base branch files an in-flight spec under `backlog/`; the worktree is
// where the bucket and phase files are true. These pin that the command reads
// the worktree, stays offline, and exits 0 in every state.

function writePhases(specDir, emojis) {
  emojis.forEach((e, i) => fs.writeFileSync(path.join(specDir, `0${i + 1}-p.md`), `# Phase ${i + 1} — P ${e}\n`))
}

// Move a spec to in-progress INSIDE its worktree, as /spec-start does on the
// branch, leaving this checkout still reading backlog.
function startInWorktree(wt, folder, emojis, header = '') {
  const from = path.join(wt, 'specs', 'backlog', folder)
  const to = path.join(wt, 'specs', 'in-progress', folder)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  fs.writeFileSync(path.join(to, '00-overview.md'), `# X\n\n> **Stack:** worktree\n${header}`)
  writePhases(to, emojis)
}

function addBacklogSpec(dir, folder) {
  const specDir = path.join(dir, 'specs', 'backlog', folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `add ${folder}`)
}

test('status reads two worktrees at different phases, and says why this branch differs', async () => {
  const dir = scaffold()
  try {
    addBacklogSpec(dir, 'feat-alpha')
    addBacklogSpec(dir, 'feat-beta')
    startInWorktree(addWorktree(dir, 'feat-alpha'), 'feat-alpha', ['✅', '🔄', '⬜'])
    startInWorktree(addWorktree(dir, 'feat-beta'), 'feat-beta', ['🔄'], '> **Developer:** Jane Dev\n')
    const out = await runQuiet(['status', '--dir', dir])
    assert.match(out, /^2 specs in flight$/m)
    assert.match(out, /feat-alpha\s+in-progress · 1 of 3 phases done, phase 2 in progress$/m, 'no headers is not unknown')
    assert.match(out, /feat-beta\s+in-progress · 0 of 1 phases done, phase 1 in progress · Jane Dev$/m)
    assert.match(out, /On this branch 2 of these read differently/)
  } finally {
    cleanup(dir)
  }
})

test('status lists a worktree whose spec cannot be read as unknown', async () => {
  const dir = scaffold()
  try {
    addBacklogSpec(dir, 'feat-alpha')
    const wt = addWorktree(dir, 'feat-alpha')
    fs.rmSync(path.join(wt, 'specs', 'backlog', 'feat-alpha'), { recursive: true })
    const out = await runQuiet(['status', '--dir', dir])
    assert.match(out, /feat-alpha\s+status unknown — no spec named feat-alpha/)
  } finally {
    cleanup(dir)
  }
})

test('status --json carries the same fields, plus inFlight and here', async () => {
  const dir = scaffold()
  try {
    addBacklogSpec(dir, 'feat-alpha')
    startInWorktree(addWorktree(dir, 'feat-alpha'), 'feat-alpha', ['✅', '🔄'])
    const body = JSON.parse(await runQuiet(['status', '--json', '--dir', dir]))
    assert.strictEqual(body.isolation, true)
    const [row] = body.specs
    assert.strictEqual(row.spec, 'feat-alpha')
    assert.strictEqual(row.bucket, 'in-progress')
    assert.strictEqual(row.here, 'backlog')
    assert.strictEqual(row.inFlight, true)
    assert.deepStrictEqual([row.phasesDone, row.phasesTotal, row.currentPhase], [1, 2, 2])
    assert.strictEqual(row.status, null)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: status with nothing provisioned says so plainly and exits 0', async () => {
  const dir = scaffold()
  try {
    addBacklogSpec(dir, 'feat-alpha')
    const out = await runQuiet(['status', '--dir', dir])
    const { prefix, root } = repoFor(dir)
    const lead = prefix ? `subfolder:  ${prefix}/ (in repo ${root})\n` : ''
    assert.strictEqual(out, `${lead}no specs in flight\n`)
    assert.ok(!process.exitCode, 'an idle repo is not a failure')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: status without isolation answers, and does not fail', async () => {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-noiso-')))
  try {
    git(dir, 'init', '-q')
    const out = await runQuiet(['status', '--dir', dir])
    assert.match(out, /^no specs in flight — isolation is not enabled/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: spec-env status keeps every line it printed, and adds detail after', async () => {
  const dir = scaffold()
  try {
    addBacklogSpec(dir, 'feat-alpha')
    const wt = addWorktree(dir, 'feat-alpha')
    startInWorktree(wt, 'feat-alpha', ['🔄'])
    const out = await runQuiet(['spec-env', 'status', '--dir', dir])
    assert.match(out, /^Provisioned specs:$/m)
    assert.match(out, /^ {2}feat-alpha {2}in-progress · 0 of 1 phases done, phase 1 in progress$/m)
    assert.ok(out.includes(`    ${path.relative(dir, wt)}\n`), 'the path line is unchanged')
  } finally {
    cleanup(dir)
  }
})
