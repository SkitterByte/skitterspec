'use strict'

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

/**
 * Cut a fixture repo off from the developer's personal git ignore rules.
 *
 * WHAT THIS EXISTS TO STOP: git reads `~/.config/git/ignore` as its global
 * excludes file with **no `core.excludesFile` setting required**, so whatever a
 * developer happens to have listed there silently changes what `git status`
 * reports inside a fixture. This author's line 1 is
 * a recursive glob for `.claude/settings.local.json` — the exact file that
 * `spec-env up` writes — so three tests below passed on the laptop and failed
 * on the first CI runner that ever built this repo.
 *
 * A fixture must decide its own ignore rules. `core.excludesFile` set in the
 * repo's own config overrides the default path, and because it is repo-local it
 * also covers the git calls `cli.js` makes internally against the same repo —
 * without touching `process.env`, which would leak across tests.
 */
function isolateIgnores(dir) {
  git(dir, 'config', 'core.excludesFile', '/dev/null')
}

// A real git checkout on `main` with an isolated spec and a worktree on its
// branch — enough to drive `live take` (which branch-switches the primary), so
// we can prove `spec-env up` refuses while the spec is live.
function scaffoldGitWithWorktree(slug = 'x') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-live-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  isolateIgnores(dir)
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const specDir = path.join(dir, 'specs', 'in-progress', `feat-${slug}`)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, worktree)
  return { dir, folder: `feat-${slug}`, worktree }
}

function cleanupGit(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Scaffold a project with isolation enabled and one worktree-only spec, so
// `spec-env up` runs its plan (no git/docker needed) and exercises the trust step.
function scaffold(slug = 'x', configExtra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...configExtra },
      null,
      2,
    ),
  )
  const spec = path.join(dir, 'specs', 'backlog', `feat-${slug}`)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n',
  )
  return { dir, folder: `feat-${slug}` }
}

// Run the CLI with stdout suppressed; return what was printed.
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

const readLocal = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))

test('spec-env up trusts the worktree root in settings.local.json', async () => {
  const { dir, folder } = scaffold()
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /trusted:\s+\S+-wt/, 'plan reports the trusted root')
})

test('spec-env up preserves a pre-existing permissions.allow', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ permissions: { allow: ['Bash(git *)'] } }, null, 2))
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const settings = readLocal(dir)
  assert.deepStrictEqual(settings.permissions.allow, ['Bash(git *)'], 'allow survived')
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(settings.permissions.additionalDirectories, [expected], 'root added')
})

test('a second spec-env up is a no-op for the trusted root', async () => {
  const { dir, folder } = scaffold()
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const expected = path.resolve(dir, `../${path.basename(dir)}-wt`)
  assert.deepStrictEqual(readLocal(dir).permissions.additionalDirectories, [expected])
  assert.match(out, /already in \.claude\/settings\.local\.json/, 'reports already-trusted')
})

test('spec-env up prints configured setup commands under an in-the-worktree head', async () => {
  const { dir, folder } = scaffold('y', { setup: ['pnpm install', 'echo {slug}'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.match(out, /in the worktree, run:/, 'prints the setup heading')
  assert.match(out, /pnpm install/, 'lists the setup command')
  assert.match(out, /echo y/, 'expands tokens in setup commands')
})

test('spec-env up omits the setup head when no setup is configured', async () => {
  const { dir, folder } = scaffold()
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.doesNotMatch(out, /in the worktree, run:/, 'no setup heading without config')
})

test('spec-env up prints seed commands under the in-the-worktree head', async () => {
  const { dir, folder } = scaffold('z', { seedFiles: ['.env'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.match(out, /in the worktree, run:/, 'prints the worktree heading')
  assert.match(out, /git rev-parse --git-common-dir/, 'emits the anchored seed command')
  assert.match(out, /seeded \.env →/, 'the seed command reports what it seeds')
})

test('spec-env up seeds before running setup (files exist before setup uses them)', async () => {
  const { dir, folder } = scaffold('w', { seedFiles: ['.env'], setup: ['pnpm install'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const seedAt = out.indexOf('git rev-parse --git-common-dir')
  const setupAt = out.indexOf('pnpm install')
  assert.ok(seedAt !== -1 && setupAt !== -1, 'both steps present')
  assert.ok(seedAt < setupAt, 'seed command is printed before the setup command')
})

test('spec-env up refuses when the spec is live in the primary checkout', async () => {
  const { dir, folder, worktree } = scaffoldGitWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', folder, '--dir', dir]) // primary → feat/x
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')

    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /is live in the primary checkout/)
    assert.doesNotMatch(out, /git worktree add/, 'no un-runnable worktree-add plan emitted')
    // Guard fired before touching the worktree — it is still where live left it.
    assert.ok(fs.existsSync(worktree))
  } finally {
    cleanupGit(dir)
  }
})

test('spec-env up leaves a malformed settings.local.json untouched, warns in the plan', async () => {
  const { dir, folder } = scaffold()
  const file = path.join(dir, '.claude', 'settings.local.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json {')
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'not json {', 'file left intact')
  assert.match(out, /trusted:\s+! .*not valid JSON/, 'plan warns about malformed settings')
})

// --- regression: `up` plans, and must not claim otherwise ---------------------
//
// Reported against 8.0.5. Three layers independently said "fine" for work none of
// them did: `up` printed "(provisioned)" while creating nothing, the bundled
// /spec-start skill told the agent the CLI had added the worktree, and the emitted
// seed commands printed "exists — skipped" when run from the main checkout. An
// agent that believed them did the spec move, the commit and the push on `main` —
// the exact outcome per-spec isolation exists to prevent.

test('spec-env up creates nothing, and its verb does not claim it did', async () => {
  const { dir, folder } = scaffold('plan', { seedFiles: ['.env'], setup: ['pnpm install'] })
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])

  assert.doesNotMatch(out, /\(provisioned\)/, 'no past-tense success verb')
  assert.match(out, /\(plan — nothing created yet\)/, 'states the plan created nothing')
  assert.match(out, /to provision, run:/, 'frames the commands as still to be run')

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'plan')
  assert.ok(!fs.existsSync(worktree), 'no worktree was created on disk')
})

test('spec-env up with the emitted commands not run leaves the spec un-provisioned', async () => {
  const { dir, folder } = scaffold('unprov')
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])

  // status is the cheap check an operator/agent would make next.
  const status = await runQuiet(['spec-env', 'status', '--dir', dir])
  assert.match(status, /no provisioned specs/, 'status does not report it as provisioned')

  // resolve still describes a worktree that does not exist.
  const resolved = await runQuiet(['spec-env', 'resolve', folder, '--dir', dir])
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'unprov')
  assert.match(resolved, new RegExp(worktree.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.ok(!fs.existsSync(worktree), 'resolve reports a path that was never created')
})

test('a re-run of spec-env up does not drift into claiming the worktree exists', async () => {
  const { dir, folder } = scaffold('rerun')
  await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
  assert.match(out, /\(plan — nothing created yet\)/, 'still nothing created')
  assert.doesNotMatch(out, /attached/, 'does not report attaching a worktree that is absent')
  assert.match(out, /git worktree add \S+ -b /, 'still emits the fresh-branch form')
})

// --- re-attaching a spec that is already in flight ---------------------------

/**
 * The real shape of an in-flight spec, which no other fixture here builds: the
 * spec is committed on `main` in `specs/backlog/`, and its worktree has moved it
 * to `specs/in-progress/` on the branch. Both are true at once — that is the
 * whole point of the per-branch model — and `spec-env up` resolves the spec from
 * the WORKTREE, so its path lies outside the primary checkout.
 */
function scaffoldInFlight(slug = 'y') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-inflight-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  isolateIgnores(dir)
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const folder = `feat-${slug}`
  const backlog = path.join(dir, 'specs', 'backlog', folder)
  fs.mkdirSync(backlog, { recursive: true })
  fs.writeFileSync(path.join(backlog, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  git(dir, 'worktree', 'add', '-q', '-b', `feat/${slug}`, worktree)
  // /spec-start's housekeeping: the bucket move happens ON THE BRANCH.
  fs.mkdirSync(path.join(worktree, 'specs', 'in-progress'), { recursive: true })
  git(worktree, 'mv', `specs/backlog/${folder}`, `specs/in-progress/${folder}`)
  git(worktree, 'commit', '-q', '-m', 'start')
  return { dir, folder, worktree }
}

test('re-attaching an in-flight spec does not accuse the repo of losing it', async () => {
  const { dir, folder } = scaffoldInFlight()
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    // The bug: the spec resolves from the worktree, so the fork-point check was
    // handed `../<repo>-wt/<slug>/specs/in-progress/<folder>` — a path outside
    // the repo that no git lookup can ever find. It concluded "not committed".
    assert.doesNotMatch(
      out,
      /is not committed in/,
      'the spec IS committed on main, in specs/backlog — this refusal is false',
    )
    assert.match(out, /worktree exists; will attach/, 're-attach is a documented path')
  } finally {
    cleanupGit(dir)
  }
})

test('a spec genuinely absent from the fork point is still refused', () => {
  // The stays-silent check's opposite number: the guard must keep firing on the
  // case it was written for, or the fix above would have removed it rather than
  // corrected it. That case is a spec authored ON THE BRANCH and never committed
  // to base — so the worktree really would fork from a commit without it.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-branchonly-')))
  try {
    git(dir, 'init', '-q')
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'Test')
  isolateIgnores(dir)
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
    )
    fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'init')
    git(dir, 'branch', '-M', 'main')

    const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'q')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/q', worktree)
    const onBranch = path.join(worktree, 'specs', 'in-progress', 'feat-q')
    fs.mkdirSync(onBranch, { recursive: true })
    fs.writeFileSync(path.join(onBranch, '00-overview.md'), '# Q\n\n> **Stack:** worktree\n')
    git(worktree, 'add', '-A')
    git(worktree, 'commit', '-q', '-m', 'spec on the branch only')

    return runQuiet(['spec-env', 'up', 'feat-q', '--dir', dir]).then((out) => {
      assert.match(out, /is not committed in/, 'the real case still refuses')
      assert.match(out, /it is on feat\/q/, 'and names the branch that does have it')
    })
  } finally {
    cleanupGit(dir)
  }
})

// --- foreign dirt no longer refuses a worktree -------------------------------

/**
 * THE INVARIANT: in `worktree` mode, uncommitted work that is not this spec's
 * does not stop it being started.
 *
 * This refused until the spec that changed it, and the refusal fired on the
 * commonest tree this workflow produces — author spec B while spec A is still
 * uncommitted, then start B. Nothing was being protected: `git worktree add`
 * carries nothing, and the only write to the checkout is a pathspec-limited
 * commit of this spec's own paths. Checkout mode still refuses, and must: see
 * env-provision-checkout.test.js, where `git switch -c` really does carry it.
 *
 * A real git repo, because the planner's answer comes from a real tree read —
 * a scaffold without one yields "nobody looked", which is a different path.
 */
function scaffoldDirty() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-up-dirty-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  isolateIgnores(dir)
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  for (const folder of ['feat-alpha', 'feat-beta']) {
    const spec = path.join(dir, 'specs', 'backlog', folder)
    fs.mkdirSync(spec, { recursive: true })
    fs.writeFileSync(
      path.join(spec, '00-overview.md'),
      '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n',
    )
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

const touch = (dir, rel, body = 'wip\n') => fs.appendFileSync(path.join(dir, rel), body)

test('worktree mode provisions beside another spec’s uncommitted work', async () => {
  const dir = scaffoldDirty()
  try {
    touch(dir, 'specs/backlog/feat-alpha/00-overview.md', 'mine\n')
    touch(dir, 'specs/backlog/feat-beta/00-overview.md')
    fs.writeFileSync(path.join(dir, 'scratch.js'), 'wip\n')

    const out = await runQuiet(['spec-env', 'up', 'feat-alpha', '--dir', dir])

    assert.doesNotMatch(out, /blocked/, `it refused: ${out}`)
    assert.match(out, /git worktree add/, 'it plans the fork')
    assert.match(out, /left untouched \(2\)/, 'and reports what it left alone')
    assert.match(out, /scratch\.js/)
    assert.match(out, /feat-beta/)

    const commit = out.split('\n').find((l) => l.includes('git commit'))
    assert.ok(commit, `a commit was planned: ${out}`)
    assert.ok(!commit.includes('scratch.js'), `the commit stays bounded: ${commit}`)
    assert.ok(!commit.includes('feat-beta'), `the commit stays bounded: ${commit}`)
  } finally {
    cleanupGit(dir)
  }
})

// A tool must not accuse its own output. `up` writes the trusted worktree root
// into .claude/settings.local.json, and then reports the tree — so unless the
// tree is read BEFORE that write, the file it just created comes back as work
// belonging to somebody else, on a clean checkout, with nothing wrong.
//
// This is stated separately from the stays-silent tests below because it is a
// different claim: those say "a tidy tree produces no report", this one says
// "whatever else up reports, never the file it wrote".
test('up never reports the settings file it writes itself', async () => {
  const dir = scaffoldDirty()
  try {
    touch(dir, 'specs/backlog/feat-alpha/00-overview.md', 'mine\n')

    const out = await runQuiet(['spec-env', 'up', 'feat-alpha', '--dir', dir])

    // It really did write the file — otherwise this test proves nothing.
    assert.ok(
      fs.existsSync(path.join(dir, '.claude', 'settings.local.json')),
      'up should have written the trust file',
    )
    const untouched = out.includes('left untouched') ? out.slice(out.indexOf('left untouched')) : ''
    assert.ok(
      !untouched.includes('settings.local.json'),
      `up accused the file it wrote: ${out}`,
    )
  } finally {
    cleanupGit(dir)
  }
})

// STAYS-SILENT: the ordinary tree must not grow a report about nothing.
test('a tree that is only this spec’s says nothing about untouched paths', async () => {
  const dir = scaffoldDirty()
  try {
    touch(dir, 'specs/backlog/feat-alpha/00-overview.md', 'mine\n')

    const out = await runQuiet(['spec-env', 'up', 'feat-alpha', '--dir', dir])
    assert.doesNotMatch(out, /untouched/i, `volunteered a report about nothing: ${out}`)
    assert.match(out, /all of it is feat-alpha's/, 'and still claims the whole tree')
  } finally {
    cleanupGit(dir)
  }
})

// STAYS-SILENT: a clean tree is the commonest state of all.
test('a clean tree reports nothing untouched and provisions', async () => {
  const dir = scaffoldDirty()
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-alpha', '--dir', dir])
    assert.doesNotMatch(out, /untouched/i, `volunteered a report about nothing: ${out}`)
    assert.doesNotMatch(out, /blocked/, `refused a clean tree: ${out}`)
  } finally {
    cleanupGit(dir)
  }
})
