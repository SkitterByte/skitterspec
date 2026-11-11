'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { shellPath } = require('../src/env/project.js')

// A path as the engine prints it in a command — quoted when it has to be, which
// a Windows path (backslashes) always is — escaped for use inside a RegExp.
const cmdPath = (p) => shellPath(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A live-git integration test for `spec-env integrate`. It exercises the real
// resolve/anchor path end-to-end — the piece that unit tests can't reach — and
// pins the regression: `integrate` must resolve the spec and the fast-forward
// target against the PRIMARY checkout even when invoked from inside a worktree.

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
}

// Run the CLI with stdout captured.
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

// Build a primary checkout on `main` with an isolated spec, plus a real worktree
// on the spec's branch holding one commit ahead of main (so integrate has work).
function scaffoldRepoWithWorktree(extraConfig = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-int-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')

  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, ...extraConfig }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n') // ignore runtime state
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-x')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')

  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main') // guarantee the base branch is `main`

  // Worktree path the engine derives: <parent>/<repo>-wt/<slug>, branch feat/x.
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/x', worktree)
  fs.writeFileSync(path.join(worktree, 'change.txt'), 'work\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', 'phase 1')

  return { dir, worktree }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

test('integrate anchors on the primary checkout when run from inside a worktree', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    // Invoke from the worktree (via --dir) — the dispatch must anchor back to the
    // primary checkout. This drives the real planIntegrate path (the regression:
    // it once referenced a removed `mainRepoPath` local and threw).
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', worktree])

    assert.match(out, /spec-env integrate: feat-x/, 'prints the plan (no crash, not a no-op)')
    // The rebase runs in the worktree…
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} rebase main`), 'rebase targets the worktree')
    // …and the fast-forward lands on the PRIMARY checkout, not the worktree.
    assert.match(
      out,
      new RegExp(`git -C ${cmdPath(dir)} merge --ff-only feat/x`),
      'ff-merge is anchored on the primary checkout',
    )
  } finally {
    cleanup(dir)
  }
})

test('integrate from inside a worktree resolves identically to running from main', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    const fromWorktree = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', worktree])
    const fromPrimary = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.strictEqual(fromWorktree, fromPrimary, 'same plan whether invoked from worktree or main')
  } finally {
    cleanup(dir)
  }
})

test('integrate is live-aware: ends the live session, then lands and re-isolates', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    // It ended the live session first…
    assert.match(out, /ended live session — feat-x released/)
    // …then printed the normal landing plan.
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} rebase main`))
    assert.match(out, new RegExp(`git -C ${cmdPath(dir)} merge --ff-only feat/x`))

    // Back to the normal state: primary on base, branch re-isolated, receipt gone.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'live.json')))
  } finally {
    cleanup(dir)
  }
})

test('integrate refuses when a different spec holds the primary checkout', async () => {
  const { dir } = scaffoldRepoWithWorktree()
  try {
    git(dir, 'checkout', '-q', '-b', 'feat/other') // another spec "live" on the primary
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — another spec \(feat\/other\) holds the primary checkout/)
  } finally {
    cleanup(dir)
  }
})

test('integrate aborts on stranded detached-HEAD commits without ending the live session', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x, worktree detached
    // Simulate a a build that committed in the worktree committing into the detached worktree —
    // the commit lands on the detached HEAD, never advancing the branch ref.
    fs.writeFileSync(path.join(worktree, 'stray.txt'), 'stray\n')
    git(worktree, 'add', '-A')
    git(worktree, 'commit', '-q', '-m', 'stray phase 2')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — 1 commit\(s\) are stranded on the detached HEAD/)
    // The live session must NOT have been ended — primary still on the branch, receipt intact.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'live.json')), 'receipt untouched')
  } finally {
    cleanup(dir)
  }
})

test('integrate aborts when live but the worktree is gone, without ending the live session', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    git(dir, 'worktree', 'remove', '--force', worktree) // worktree vanishes while live

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /blocked — feat-x is live but has no worktree to land from/)
    // Live session left intact — nothing checked out base, nothing landed silently.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
  } finally {
    cleanup(dir)
  }
})

test('integrate lands fixes committed on the branch while live (commit-in-primary flow)', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    await runQuiet(['spec-env', 'live', 'take', 'feat-x', '--dir', dir]) // primary → feat/x
    // The live-aware flow: commit the fix on the branch in the PRIMARY checkout.
    fs.writeFileSync(path.join(dir, 'fix.txt'), 'fix\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'live fix')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /ended live session — feat-x released/)
    assert.match(out, /spec-env integrate: feat-x/, 'prints the landing plan, not a no-op')
    assert.doesNotMatch(out, /already landed/, 'the live fix is not silently dropped')
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} rebase main`))

    // Re-isolated: primary back on base, worktree carries the live fix on the branch.
    assert.strictEqual(git(dir, 'symbolic-ref', '--short', 'HEAD'), 'main')
    assert.strictEqual(git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'feat/x')
    assert.match(git(worktree, 'log', '--oneline'), /live fix/)
  } finally {
    cleanup(dir)
  }
})

// --- afterLand ---------------------------------------------------------------

test('integrate prints afterLand after the land commands, in the primary checkout', async () => {
  const { dir } = scaffoldRepoWithWorktree({ afterLand: ['pnpm db:data-migration'] })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    const ff = out.indexOf('merge --ff-only feat/x')
    const after = out.indexOf(`then, in the primary checkout (${dir}), run`)
    assert.ok(ff > 0 && after > ff, 'the section follows the fast-forward')
    assert.match(out.slice(after), /\n    pnpm db:data-migration\n/)
  } finally {
    cleanup(dir)
  }
})

test('integrate still prints afterLand when the spec already landed', async () => {
  const { dir } = scaffoldRepoWithWorktree({ afterLand: ['pnpm db:data-migration'] })
  try {
    git(dir, 'merge', '-q', '--ff-only', 'feat/x')
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /already landed on main/)
    assert.match(out, /then, in the primary checkout .*\n    pnpm db:data-migration\n/)
  } finally {
    cleanup(dir)
  }
})

const CONDITIONAL = {
  afterLand: [
    { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
    'pnpm db:data-migration',
  ],
}

function commitIn(worktree, rel) {
  fs.mkdirSync(path.dirname(path.join(worktree, rel)), { recursive: true })
  fs.writeFileSync(path.join(worktree, rel), 'x\n')
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '-m', `touch ${rel}`)
}

test('integrate: a land touching prisma/schema.prisma runs generate, and says why', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree(CONDITIONAL)
  try {
    commitIn(worktree, 'prisma/schema.prisma')
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /\n    pnpm run db:generate +# prisma\/schema\.prisma changed\n    pnpm db:data-migration\n/)
    assert.doesNotMatch(out, /skipped/)
  } finally {
    cleanup(dir)
  }
})

test('integrate: a land touching only src/ skips generate and lists it as skipped', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree(CONDITIONAL)
  try {
    commitIn(worktree, 'src/a.ts')
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    const run = out.slice(out.indexOf('then, in the primary checkout'), out.indexOf('skipped'))
    assert.doesNotMatch(run, /db:generate/)
    assert.match(out, /skipped \(nothing in the land matched\):\n    pnpm run db:generate +# when prisma\/schema\.prisma\n/)
    assert.doesNotMatch(out, /unknown/, 'a known range accuses nothing of being unknown')
  } finally {
    cleanup(dir)
  }
})

test('integrate: already landed, the range is unknown — generate runs, and the plan says so', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree(CONDITIONAL)
  try {
    commitIn(worktree, 'src/a.ts')
    git(dir, 'merge', '-q', '--ff-only', 'feat/x')
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /already landed on main/)
    assert.match(out, /\n    pnpm run db:generate +# range unknown\n/)
    assert.match(out, /changed files are unknown here, so the conditional entries run/)
  } finally {
    cleanup(dir)
  }
})

test('integrate: every entry skipped still names the checkout and runs nothing', async () => {
  const { dir } = scaffoldRepoWithWorktree({ afterLand: [CONDITIONAL.afterLand[0]] })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /after-land, in the primary checkout \(.*\): nothing to run\./)
    assert.doesNotMatch(out, /then, in the primary checkout/)
  } finally {
    cleanup(dir)
  }
})

test('integrate says nothing about afterLand when the key is absent', async () => {
  const { dir } = scaffoldRepoWithWorktree()
  try {
    const landing = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.doesNotMatch(landing, /then, in the primary checkout/)
    git(dir, 'merge', '-q', '--ff-only', 'feat/x')
    const noop = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.strictEqual(
      noop,
      'spec-env integrate: feat-x already landed on main — nothing to integrate.\n',
      'the no-op line is byte-identical to the output before afterLand existed',
    )
  } finally {
    cleanup(dir)
  }
})

// --- land.strategy: "pr" -----------------------------------------------------

test('pr mode: plans fetch + rebase onto the remote base and holds the push', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree({ land: { strategy: 'pr' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /spec-env integrate: feat-x \(pr\)/)
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} fetch origin main`))
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} rebase origin/main`))
    // Held, not planned to run: the push sits under the consent section…
    assert.match(out, /with your consent/)
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} push --force-with-lease -u origin feat/x`))
    // …and nothing moves the base branch locally.
    assert.doesNotMatch(out, /merge --ff-only/)
  } finally {
    cleanup(dir)
  }
})

test('pr mode: --push folds the push and PR line into the run list', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree({ land: { strategy: 'pr' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--push', '--dir', dir])
    assert.doesNotMatch(out, /with your consent/)
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} push --force-with-lease -u origin feat/x`))
    assert.match(out, /# open a pull request: feat\/x -> main/)
  } finally {
    cleanup(dir)
  }
})

test('pr mode: an explicit ff strategy is byte-identical to no land key (stays-silent)', async () => {
  const a = scaffoldRepoWithWorktree()
  const b = scaffoldRepoWithWorktree({ land: { strategy: 'ff' } })
  try {
    const plain = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', a.dir])
    const explicit = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', b.dir])
    // The plans differ only in the tmp paths they name — normalise those away.
    // Both spellings: OS paths on the `worktree:` lines, the printed form
    // (forward slashes on Windows) in the commands.
    const norm = (s, r) =>
      [[r.worktree, '<wt>'], [r.dir, '<dir>'], [shellPath(r.worktree), '<wt>'], [shellPath(r.dir), '<dir>']]
        .reduce((acc, [from, to]) => acc.split(from).join(to), s)
    assert.strictEqual(norm(plain, a), norm(explicit, b))
  } finally {
    cleanup(a.dir)
    cleanup(b.dir)
  }
})

test('pr mode: afterLand is announced as deferred, never printed to run', async () => {
  const { dir } = scaffoldRepoWithWorktree({
    land: { strategy: 'pr' },
    afterLand: ['pnpm db:migrate'],
  })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /after-land commands are deferred/)
    assert.doesNotMatch(out, /pnpm db:migrate/)
  } finally {
    cleanup(dir)
  }
})

test('pr mode: --draft marks the plan and the create command', async () => {
  const { dir } = scaffoldRepoWithWorktree({ land: { strategy: 'pr' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--draft', '--push', '--dir', dir])
    assert.match(out, /spec-env integrate: feat-x \(pr, draft\)/)
  } finally {
    cleanup(dir)
  }
})

test('pr mode: up notes a remote base that is ahead; trunk says nothing', async () => {
  const mk = (config) => {
    const s = scaffoldRepoWithWorktree(config)
    const bare = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bare-')))
    execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' })
    git(s.dir, 'remote', 'add', 'origin', bare)
    git(s.dir, 'push', '-q', 'origin', 'main')
    // Put origin/main one ahead of local main without moving local main.
    git(s.dir, 'commit', '--allow-empty', '-q', '-m', 'upstream work')
    git(s.dir, 'push', '-q', 'origin', 'main')
    git(s.dir, 'reset', '-q', '--hard', 'HEAD~1')
    return { ...s, bare }
  }
  const pr = mk({ land: { strategy: 'pr' } })
  const trunk = mk({})
  try {
    const prOut = await runQuiet(['spec-env', 'up', 'feat-x', '--dir', pr.dir])
    assert.match(prOut, /note: {6}origin\/main is 1 commit\(s\) ahead of main/)
    // Stays silent: a trunk project with the same stale base gets no note.
    const trunkOut = await runQuiet(['spec-env', 'up', 'feat-x', '--dir', trunk.dir])
    assert.doesNotMatch(trunkOut, /ahead of main/)
  } finally {
    cleanup(pr.dir)
    cleanup(trunk.dir)
    fs.rmSync(pr.bare, { recursive: true, force: true })
    fs.rmSync(trunk.bare, { recursive: true, force: true })
  }
})

test('--strategy overrides config per invocation, and refuses an unknown value by name', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree() // trunk config, no land key
  try {
    const pr = await runQuiet(['spec-env', 'integrate', 'feat-x', '--strategy', 'pr', '--dir', dir])
    assert.match(pr, /spec-env integrate: feat-x \(pr\)/)
    assert.match(pr, new RegExp(`git -C ${cmdPath(worktree)} fetch origin main`))
    const bad = await runQuiet(['spec-env', 'integrate', 'feat-x', '--strategy', 'squash', '--dir', dir])
    assert.match(bad, /unknown --strategy "squash" — use ff or pr/)
    assert.doesNotMatch(bad, /run these/)
    // And the other direction: a pr-mode project can land one spec the ff way.
    const { dir: prDir, worktree: prWt } = scaffoldRepoWithWorktree({ land: { strategy: 'pr' } })
    try {
      const ff = await runQuiet(['spec-env', 'integrate', 'feat-x', '--strategy', 'ff', '--dir', prDir])
      assert.match(ff, new RegExp(`git -C ${cmdPath(prDir)} merge --ff-only feat/x`))
      assert.doesNotMatch(ff, /\(pr\)/)
    } finally {
      cleanup(prDir)
    }
  } finally {
    cleanup(dir)
  }
})

test('pr mode: a host-landed branch prints the finish — base catch-up + deferred afterLand', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree({
    land: { strategy: 'pr' },
    afterLand: ['pnpm db:migrate'],
  })
  const bare = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bare-')))
  execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' })
  try {
    // Land the branch "on the host": merge it into main locally, push main, and
    // wind local main back — origin/main now contains the branch, main does not.
    git(dir, 'remote', 'add', 'origin', bare)
    git(dir, 'merge', '-q', '--ff-only', 'feat/x')
    git(dir, 'push', '-q', 'origin', 'main')
    git(dir, 'reset', '-q', '--hard', 'HEAD~1')
    git(dir, 'fetch', '-q', 'origin', 'main')

    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, /already landed on origin\/main — finish what the merge deferred/)
    assert.match(out, new RegExp(`git -C ${cmdPath(dir)} fetch origin main`))
    assert.match(out, new RegExp(`git -C ${cmdPath(dir)} merge --ff-only origin/main`))
    // The deferred afterLand comes due here, with the land's own range known.
    assert.match(out, /pnpm db:migrate/)
    assert.doesNotMatch(out, /range unknown/)
  } finally {
    cleanup(dir)
    fs.rmSync(bare, { recursive: true, force: true })
  }
})

test('disposition enumerates the worktree spec; --json carries the same answer', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    // Give the worktree's spec a phase file with loose ends.
    const specDir = path.join(worktree, 'specs', 'in-progress', 'feat-x')
    fs.writeFileSync(
      path.join(specDir, '01-build.md'),
      '# Phase 1 — build ⬜\n\n- [x] Done bit\n- [ ] Loose end\n',
    )
    const out = await runQuiet(['spec-env', 'disposition', 'feat-x', '--dir', dir])
    assert.match(out, /unticked tasks \(1\):/)
    assert.match(out, /01-build\.md:4 {2}Loose end/)
    const json = JSON.parse(await runQuiet(['spec-env', 'disposition', 'feat-x', '--json', '--dir', dir]))
    assert.strictEqual(json.clean, false)
    assert.strictEqual(json.tasks[0].text, 'Loose end')
  } finally {
    cleanup(dir)
  }
})

// --- land.specDocs: "branch" ---------------------------------------------------

// A spec authored on its own branch and never landed on base — the state every
// branch-mode spec is in between /spec and the PR merging.
function authorBranchOnlySpec(dir, name, branch) {
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, name.replace(/^feat-/, ''))
  git(dir, 'worktree', 'add', '-q', '-b', branch, wt)
  const specDir = path.join(wt, 'specs', 'backlog', name)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), `# ${name}\n\n> **Stack:** worktree\n`)
  git(wt, 'add', '-A')
  git(wt, 'commit', '-q', '-m', `docs(spec): add ${name}`)
  return wt
}

test('specDocs branch: re-provisioning a branch-only spec is not refused', async () => {
  const { dir } = scaffoldRepoWithWorktree({ land: { strategy: 'pr', specDocs: 'branch' } })
  try {
    authorBranchOnlySpec(dir, 'feat-y', 'feat/y')
    const out = await runQuiet(['spec-env', 'up', 'feat-y', '--dir', dir])
    // The exemption: the spec is SUPPOSED to be absent from the fork point.
    assert.doesNotMatch(out, /not committed in/)
    assert.match(out, /worktree exists; will attach/)
  } finally {
    cleanup(dir)
  }
})

test('specDocs trunk stays-silent: the same state still refuses, naming the branch', async () => {
  const { dir } = scaffoldRepoWithWorktree({ land: { strategy: 'pr' } }) // specDocs defaults trunk
  try {
    authorBranchOnlySpec(dir, 'feat-y', 'feat/y')
    const out = await runQuiet(['spec-env', 'up', 'feat-y', '--dir', dir])
    assert.match(out, /not committed in/)
    assert.match(out, /feat\/y/)
  } finally {
    cleanup(dir)
  }
})

test('specDocs branch: the standing worktree is what makes the spec resolvable', async () => {
  const { dir } = scaffoldRepoWithWorktree({ land: { strategy: 'pr', specDocs: 'branch' } })
  try {
    authorBranchOnlySpec(dir, 'feat-y', 'feat/y')
    const out = await runQuiet(['spec-env', 'resolve', 'feat-y', '--dir', dir])
    assert.match(out, /spec: +feat-y \(backlog\)/)
    assert.match(out, /branch: +feat\/y/)
  } finally {
    cleanup(dir)
  }
})

// --- integrate --docs (feat-tracker-spec-branches) ----------------------------

test('docs lane: integrate --docs holds a push of the spec branch and plans no land', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree({ land: { specDocs: 'branch' } })
  const bare = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bare-')))
  execFileSync('git', ['init', '-q', '--bare', bare], { stdio: 'ignore' })
  try {
    git(dir, 'remote', 'add', 'origin', bare)
    const held = await runQuiet(['spec-env', 'integrate', 'feat-x', '--docs', '--dir', dir])
    assert.match(held, /spec docs ride the branch/)
    assert.match(held, /with your consent/)
    assert.match(held, new RegExp(`git -C ${cmdPath(worktree)} push -u origin feat/x`))
    assert.doesNotMatch(held, /rebase|merge --ff-only/)

    const consented = await runQuiet(['spec-env', 'integrate', 'feat-x', '--docs', '--push', '--dir', dir])
    assert.match(consented, /run these:/)

    // Once the branch is on the remote at HEAD, the plan says so and runs nothing.
    git(worktree, 'push', '-q', '-u', 'origin', 'feat/x')
    const pushed = await runQuiet(['spec-env', 'integrate', 'feat-x', '--docs', '--dir', dir])
    assert.match(pushed, /already on origin at HEAD — nothing to run/)
  } finally {
    cleanup(dir)
    fs.rmSync(bare, { recursive: true, force: true })
  }
})

test('docs lane: no remote configured holds and says the branch stays local', async () => {
  const { dir } = scaffoldRepoWithWorktree({ land: { specDocs: 'branch' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--docs', '--push', '--dir', dir])
    assert.match(out, /no "origin" configured — the branch stays local/)
    assert.doesNotMatch(out, /push -u/)
  } finally {
    cleanup(dir)
  }
})

test('stays-silent: --docs under the trunk lane is the ordinary land, unchanged', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree()
  try {
    const docs = await runQuiet(['spec-env', 'integrate', 'feat-x', '--docs', '--dir', dir])
    const plain = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.strictEqual(docs, plain)
    assert.match(docs, new RegExp(`git -C ${cmdPath(worktree)} rebase main`))
  } finally {
    cleanup(dir)
  }
})

test('stays-silent: the branch lane never turns a CODE land (no --docs) into a push', async () => {
  const { dir, worktree } = scaffoldRepoWithWorktree({ land: { specDocs: 'branch' } })
  try {
    const out = await runQuiet(['spec-env', 'integrate', 'feat-x', '--dir', dir])
    assert.match(out, new RegExp(`git -C ${cmdPath(worktree)} rebase main`))
    assert.match(out, new RegExp(`git -C ${cmdPath(dir)} merge --ff-only feat/x`))
    assert.doesNotMatch(out, /spec docs ride the branch/)
  } finally {
    cleanup(dir)
  }
})
