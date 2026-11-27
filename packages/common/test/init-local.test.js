'use strict'

// `init --local`: the install a developer keeps to themselves on a shared repo.
// The managed files stay on disk and out of git, hooks go in
// settings.local.json, the block in CLAUDE.local.md, and only `specs/` is left
// for git to see. `update` keeps it that way without the flag.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, resync, readManifest, lastReport, EXCLUDE_START } = require('../src/init.js')

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

function repo() {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-local-')))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@example.invalid')
  git(dir, 'config', 'user.name', 'T')
  // No detached housekeeping after a commit: it would still be writing into
  // .git while cleanup() deletes the repo (bug-init-local-cleanup-race).
  git(dir, 'config', 'gc.auto', '0')
  git(dir, 'config', 'maintenance.auto', 'false')
  fs.writeFileSync(path.join(dir, 'README.md'), '# shared\n')
  git(dir, 'add', 'README.md')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

async function quiet(fn) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    return await fn()
  } finally {
    process.stdout.write = orig
  }
}

const localInit = (dir, extra = {}) =>
  quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init', local: true, ...extra }))

// Every untracked path git would show, expanded to files.
const visible = (dir) =>
  git(dir, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

// bug-init-local-cleanup-race: a commit can start git's housekeeping
// (`gc --auto`, `maintenance run --auto`) DETACHED, and it goes on writing
// `.git/objects/info/packs` after the test has moved on to deleting the repo.
// The delete then fails ENOTEMPTY. Whether it starts is git's sampled guess
// at the loose-object count, which a commit of a whole install sometimes
// crosses, so it failed some full runs and never a run of this file alone.
test('the fixture repo never starts git\'s background housekeeping', () => {
  const dir = repo()
  try {
    assert.strictEqual(git(dir, 'config', '--get', 'gc.auto'), '0')
    assert.strictEqual(git(dir, 'config', '--get', 'maintenance.auto'), 'false')
  } finally {
    cleanup(dir)
  }
})

test('a fresh local init leaves git seeing only specs/', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')), 'skills installed')
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.local.md')), 'block in CLAUDE.local.md')
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md never created')
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')), 'no committed settings')
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    assert.ok(local.hooks.PreToolUse.length >= 3, 'hooks registered locally')
    assert.strictEqual(readManifest(dir).scope, 'local')
    const shown = visible(dir)
    assert.ok(shown.length > 0, 'specs/ is visible')
    assert.deepStrictEqual(shown.filter((p) => !p.startsWith('specs/')), [], 'nothing outside specs/')
    assert.ok(!shown.includes('specs/.core/.skitterspec-manifest.json'), 'manifest excluded')
    assert.ok(lastReport().warnings.some((w) => /--local keeps skitterspec on this machine/.test(w)))
  } finally {
    cleanup(dir)
  }
})

test('re-running is idempotent and the exclude block is written once', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    const first = fs.readFileSync(exclude, 'utf8')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(exclude, 'utf8'), first)
    assert.strictEqual(first.split(EXCLUDE_START).length - 1, 1)
    assert.ok(!lastReport().warnings.some((w) => /--local keeps/.test(w)), 'warned once, not per run')
  } finally {
    cleanup(dir)
  }
})

test('update without the flag stays local and writes nothing git can see', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    git(dir, 'add', 'specs')
    git(dir, 'commit', '-q', '-m', 'specs')
    fs.rmSync(path.join(dir, '.claude', 'skills', 'spec'), { recursive: true })
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')), 'restored')
    assert.deepStrictEqual(visible(dir), [], 'nothing tracked or visible changed')
    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md')))
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')))
    assert.strictEqual(readManifest(dir).scope, 'local')
    assert.ok(lastReport().skipped.some((l) => /kept local/.test(l)), 'says it stayed local')
  } finally {
    cleanup(dir)
  }
})

test('an install in a subfolder of the git root excludes prefixed paths', async () => {
  const root = repo()
  const sub = path.join(root, 'App.Solution')
  fs.mkdirSync(sub)
  try {
    await localInit(sub)
    const exclude = fs.readFileSync(path.join(root, '.git', 'info', 'exclude'), 'utf8')
    assert.match(exclude, /^\/App\.Solution\/\.claude\/skills\/spec$/m)
    assert.deepStrictEqual(visible(root).filter((p) => !p.startsWith('App.Solution/specs/')), [])
  } finally {
    cleanup(root)
  }
})

test('settings.local.json is merged, never overwritten', async () => {
  const dir = repo()
  try {
    fs.mkdirSync(path.join(dir, '.claude'))
    const perms = { permissions: { allow: ['Bash(pnpm exec *)'], additionalDirectories: ['/x-wt'] } }
    fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), JSON.stringify(perms))
    await localInit(dir)
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    assert.deepStrictEqual(local.permissions, perms.permissions, 'permissions kept')
    assert.ok(local.hooks.PreToolUse.length >= 3)
  } finally {
    cleanup(dir)
  }
})

test('an existing exclude file keeps its own lines', async () => {
  const dir = repo()
  try {
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    fs.writeFileSync(exclude, '# mine\n**/.claude/scheduled_tasks.lock\n')
    await localInit(dir)
    const text = fs.readFileSync(exclude, 'utf8')
    assert.ok(text.startsWith('# mine\n**/.claude/scheduled_tasks.lock\n'), text.slice(0, 80))
  } finally {
    cleanup(dir)
  }
})

// Stays silent: a team install is untouched by any of this.
test('stays silent: a team init writes no exclude block and no scope', async () => {
  const dir = repo()
  try {
    await quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init' }))
    const exclude = path.join(dir, '.git', 'info', 'exclude')
    const text = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : ''
    assert.ok(!text.includes(EXCLUDE_START))
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'settings.json')))
    assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')))
    assert.ok(!('scope' in JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', '.skitterspec-manifest.json'), 'utf8'))))
    assert.strictEqual(readManifest(dir).scope, 'team', 'absent scope reads as team')
    assert.ok(!lastReport().warnings.some((w) => /--local/.test(w)))
  } finally {
    cleanup(dir)
  }
})

// --- converting a committed (team) install ---------------------------------

const teamInit = (dir) => quiet(() => init({ dir, force: false, claudeMd: true, mode: 'init' }))
const commitAll = (dir, msg) => {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', msg)
}
const index = (dir) => git(dir, 'ls-files').split('\n').filter(Boolean)
const staged = (dir) => git(dir, 'diff', '--cached', '--name-status').split('\n').filter(Boolean)

test('converting a committed install untracks it, keeps it on disk, and stages only', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    commitAll(dir, 'team install')
    const head = git(dir, 'rev-parse', 'HEAD')
    await localInit(dir)
    assert.strictEqual(git(dir, 'rev-parse', 'HEAD'), head, 'nothing committed')
    assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')), 'kept on disk')
    const tracked = index(dir)
    assert.deepStrictEqual(tracked.filter((p) => p.startsWith('.claude/')), [], 'no .claude path tracked')
    assert.ok(!tracked.includes('specs/.core/.skitterspec-manifest.json'), 'manifest untracked')
    assert.ok(tracked.some((p) => p.startsWith('specs/')), 'specs stay tracked')
    assert.ok(staged(dir).some((l) => l.startsWith('D\t.claude/skills/spec/SKILL.md')), 'removal staged')
    assert.ok(!fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('skitterspec:start'), 'block left CLAUDE.md')
    assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.local.md'), 'utf8').includes('skitterspec:start'), 'block in local file')
    assert.ok(!fs.existsSync(path.join(dir, '.claude', 'settings.json')), 'settings.json held only ours — removed')
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8'))
    assert.ok(local.hooks.PreToolUse.length >= 3, 'hooks moved local')
    assert.ok(lastReport().suggestions.some((s) => /staged, not committed/.test(s)))
    // After the operator commits it, git sees nothing outside specs/.
    git(dir, 'commit', '-q', '-am', 'convert')
    assert.deepStrictEqual(visible(dir).filter((p) => !p.startsWith('specs/')), [])
  } finally {
    cleanup(dir)
  }
})

test('foreign hooks stay, per hook, even in a shared matcher group', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    const file = path.join(dir, '.claude', 'settings.json')
    const s = JSON.parse(fs.readFileSync(file, 'utf8'))
    const mine = { type: 'command', command: 'python3 .claude/hooks/protect_secrets.py' }
    s.hooks.PreToolUse[0].hooks.push(mine)
    s.hooks.PostToolUse = [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'npm run typecheck' }] }]
    s.permissions = { allow: ['Bash(ls)'] }
    fs.writeFileSync(file, JSON.stringify(s, null, 2))
    commitAll(dir, 'team install + own hooks')
    await localInit(dir)
    const after = JSON.parse(fs.readFileSync(file, 'utf8'))
    const commands = after.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command))
    assert.deepStrictEqual(commands, [mine.command], 'only the foreign hook remains')
    assert.deepStrictEqual(after.hooks.PostToolUse, s.hooks.PostToolUse, 'PostToolUse untouched')
    assert.deepStrictEqual(after.permissions, s.permissions, 'other keys untouched')
  } finally {
    cleanup(dir)
  }
})

test('a customized managed file survives conversion byte for byte', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    const rule = path.join(dir, '.claude', 'rules', 'spec-planning.md')
    fs.appendFileSync(rule, '\n## Our MSBuild notes\n')
    const edited = fs.readFileSync(rule, 'utf8')
    commitAll(dir, 'team install, edited rule')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(rule, 'utf8'), edited)
    assert.ok(!index(dir).includes('.claude/rules/spec-planning.md'), 'untracked all the same')
  } finally {
    cleanup(dir)
  }
})

test('a markerless Spec workflow section is reported, never moved', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    const claude = path.join(dir, 'CLAUDE.md')
    const manual = '# app\n\nintro\n\n## Spec workflow\n\nhand-written\n\n## Other\n\nkept\n'
    fs.writeFileSync(claude, manual)
    commitAll(dir, 'manual section')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(claude, 'utf8'), manual, 'CLAUDE.md untouched')
    assert.ok(lastReport().warnings.some((w) => /CLAUDE\.md:5 has a "Spec workflow" section with no skitterspec markers/.test(w)))
  } finally {
    cleanup(dir)
  }
})

test('a skitterspec dependency is reported and package.json left alone', async () => {
  const dir = repo()
  try {
    const pkg = { name: 'app', devDependencies: { '@skitterbyte/skitterspec-azure-boards': '^2.16.0' } }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
    assert.ok(lastReport().suggestions.some((s) => /npm i -g @skitterbyte\/skitterspec-azure-boards/.test(s)))
  } finally {
    cleanup(dir)
  }
})

test('stays silent: settings.json holding only foreign hooks is untouched', async () => {
  const dir = repo()
  try {
    fs.mkdirSync(path.join(dir, '.claude'))
    const own = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node x.js' }] }] } }
    const text = JSON.stringify(own, null, 2) + '\n'
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), text)
    commitAll(dir, 'own settings')
    await localInit(dir)
    assert.strictEqual(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), text)
    assert.ok(index(dir).includes('.claude/settings.json'), 'still tracked')
    assert.ok(!lastReport().suggestions.some((s) => /staged, not committed/.test(s)), 'nothing to commit')
  } finally {
    cleanup(dir)
  }
})

// --- long-lived branches that still commit the install -------------------------

// A remote's view without a remote: point origin's refs at a commit, as a fetch
// would have left them.
const fakeOrigin = (dir, branch, sha) => {
  git(dir, 'update-ref', `refs/remotes/origin/${branch}`, sha)
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', `refs/remotes/origin/${branch}`)
}
const carrying = () => lastReport().suggestions.filter((s) => /still commits the install/.test(s))

test('the remote default branch still carrying the install is reported until it is clean', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    commitAll(dir, 'team install')
    const team = git(dir, 'rev-parse', 'HEAD')
    git(dir, 'branch', 'master', team)
    fakeOrigin(dir, 'master', team)

    await localInit(dir)
    assert.strictEqual(carrying().length, 1)
    assert.match(carrying()[0], /^origin\/master still commits the install \(\d+ managed file\(s\), 3 hook\(s\)\) — as of the last fetch\./)

    git(dir, 'commit', '-q', '-m', 'convert')
    await quiet(() => resync(dir))
    assert.strictEqual(carrying().length, 1, 'update repeats it while origin/master carries it')

    fakeOrigin(dir, 'master', git(dir, 'rev-parse', 'HEAD'))
    await quiet(() => resync(dir))
    assert.deepStrictEqual(carrying(), [], 'silent once the branch is clean')
  } finally {
    cleanup(dir)
  }
})

test('hotfix.releaseBranch is checked even when a base pattern matches nothing', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranchPattern: '20??/Q?', hotfix: { releaseBranch: 'master' } }, null, 2),
    )
    commitAll(dir, 'team install')
    git(dir, 'branch', 'master')
    await localInit(dir)
    assert.strictEqual(carrying().length, 1)
    assert.match(carrying()[0], /^master still commits the install/)
    assert.doesNotMatch(carrying()[0], /last fetch/, 'a local branch is not described as fetched')
  } finally {
    cleanup(dir)
  }
})

test('a long-lived branch git cannot read is cannot-tell, never clean', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    commitAll(dir, 'team install')
    git(dir, 'switch', '-q', '-c', 'master')
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{ not json')
    commitAll(dir, 'broken settings')
    git(dir, 'switch', '-q', 'main')
    fakeOrigin(dir, 'master', git(dir, 'rev-parse', 'master'))
    await localInit(dir)
    assert.deepStrictEqual(carrying(), [])
    assert.ok(lastReport().warnings.some((w) => /^origin\/master: cannot tell/.test(w)))
  } finally {
    cleanup(dir)
  }
})

test('stays silent: no remote, a feature branch carrying it, or a team install', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    commitAll(dir, 'team install')
    git(dir, 'branch', 'feat/x')
    await localInit(dir)
    assert.deepStrictEqual(carrying(), [], 'the current branch and a feature branch are not reported')
    assert.ok(!lastReport().warnings.some((w) => /cannot tell whether/.test(w)))
  } finally {
    cleanup(dir)
  }
  const team = repo()
  try {
    await teamInit(team)
    commitAll(team, 'team install')
    git(team, 'branch', 'master')
    fakeOrigin(team, 'master', git(team, 'rev-parse', 'HEAD'))
    await quiet(() => resync(team))
    assert.deepStrictEqual(carrying(), [], 'a team install reports nothing')
  } finally {
    cleanup(team)
  }
})

// --- seeding a local install into worktrees -----------------------------------

const { localSeedFiles } = require('../src/init.js')
const { worktreeSteps } = require('../src/env/provision.js')
const { runBootstrap } = require('../src/env/bootstrap.js')

test('localSeedFiles lists skill folders and the per-machine files, and nothing for a team', async () => {
  const dir = repo()
  const team = repo()
  try {
    await localInit(dir)
    const seeds = localSeedFiles(dir)
    assert.ok(seeds.includes('.claude/skills/spec'), 'a skill is seeded as its folder')
    assert.ok(seeds.includes('.claude/settings.local.json'))
    assert.ok(seeds.includes('CLAUDE.local.md'))
    assert.ok(seeds.some((p) => p.startsWith('.claude/hooks/')))
    assert.ok(seeds.includes('specs/.core/.skitterspec-manifest.json'), 'the manifest, which records the scope')
    assert.ok(seeds.includes('specs/.core/env.config.md'), 'a managed template, which git does not carry')
    assert.ok(!seeds.some((p) => p.startsWith('specs/') && !p.startsWith('specs/.core/')), 'specs are git-carried')
    await teamInit(team)
    assert.deepStrictEqual(localSeedFiles(team), [], 'stays silent for a team install')
  } finally {
    cleanup(dir)
    cleanup(team)
  }
})

// bug-local-seed-provider-skills: the skills call the BASE engine, whose asset
// list knows none of a provider's skills, while a provider's install records
// them in the manifest. Simulated here by adding a provider skill to a base
// install's primary checkout and manifest, exactly as the provider's init wrote.
const addManifestEntries = (dir, rels) => {
  const file = path.join(dir, 'specs', '.core', '.skitterspec-manifest.json')
  const m = JSON.parse(fs.readFileSync(file, 'utf8'))
  m.distribution = '@skitterbyte/skitterspec-azure-boards'
  for (const r of rels) m.files[r] = '0'.repeat(40)
  fs.writeFileSync(file, JSON.stringify(m, null, 2))
}

test('localSeedFiles seeds every skill the manifest records, whichever package owns it', async () => {
  const dir = repo()
  const wt = `${dir}-wt`
  try {
    await localInit(dir)
    const skill = path.join(dir, '.claude', 'skills', 'spec-push')
    fs.mkdirSync(skill, { recursive: true })
    fs.writeFileSync(path.join(skill, 'SKILL.md'), '# spec-push\n')
    addManifestEntries(dir, ['.claude/skills/spec-push/SKILL.md', '.claude/skills/spec-gone/SKILL.md'])
    const seeds = localSeedFiles(dir)
    assert.ok(seeds.includes('.claude/skills/spec-push'), 'the provider skill is seeded as its folder')
    assert.ok(seeds.includes('.claude/skills/spec'), 'the base skills still are')
    assert.strictEqual(new Set(seeds).size, seeds.length, 'no path twice')
    git(dir, 'add', 'specs')
    git(dir, 'commit', '-q', '-m', 'specs')
    git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
    const steps = seeds.map((file) => ({ kind: 'seed', file, mode: 'symlink' }))
    const res = runBootstrap(steps, { cwd: wt, mainRoot: dir, write: () => {} })
    assert.ok(res.ok, 'a stale manifest entry never fails the bootstrap')
    assert.ok(fs.existsSync(path.join(wt, '.claude', 'skills', 'spec-push', 'SKILL.md')))
    const stale = res.results.find((r) => r.step.file === '.claude/skills/spec-gone')
    assert.strictEqual(stale && stale.outcome, 'skipped', 'the stale entry is skipped, and said')
    assert.match(stale.line, /not in the root checkout/)
  } finally {
    try {
      git(dir, 'worktree', 'remove', '--force', wt)
    } catch {
      /* already gone */
    }
    cleanup(wt)
    cleanup(dir)
  }
})

test('a base-only local install seeds exactly its managed set', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    const { managedTargets } = require('../src/init.js')
    const managed = new Set(
      managedTargets(dir).map((t) => (t.relPath.startsWith('.claude/skills/') ? path.posix.dirname(t.relPath) : t.relPath)),
    )
    const extra = localSeedFiles(dir).filter(
      (p) => !managed.has(p) && !['CLAUDE.local.md', '.claude/settings.local.json'].includes(p) && !p.endsWith('.skitterspec-manifest.json') && p !== '.claude/rules/project-conventions.md',
    )
    assert.deepStrictEqual(extra, [], 'stays silent: the manifest adds nothing the base does not already seed')
  } finally {
    cleanup(dir)
  }
})

test('worktreeSteps seeds the local install first and never twice', () => {
  const spec = { slug: 'x', branch: 'feat/x', projectName: 'p', worktreePath: '/wt' }
  const config = { seedFiles: { mode: 'symlink', files: ['.env', 'CLAUDE.local.md'] }, setup: [] }
  const steps = worktreeSteps(spec, null, config, { localSeeds: ['.claude/skills/spec', 'CLAUDE.local.md'] })
  assert.deepStrictEqual(
    steps.map((s) => s.file),
    ['.claude/skills/spec', '.env', 'CLAUDE.local.md'],
  )
  assert.deepStrictEqual(worktreeSteps(spec, null, config).map((s) => s.file), ['.env', 'CLAUDE.local.md'])
})

for (const mode of ['symlink', 'copy']) {
  test(`a worktree of a local install gets it seeded (${mode}), and git still sees nothing`, async () => {
    const dir = repo()
    const wt = `${dir}-wt`
    try {
      await localInit(dir)
      git(dir, 'add', 'specs')
      git(dir, 'commit', '-q', '-m', 'specs')
      git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
      assert.ok(!fs.existsSync(path.join(wt, '.claude')), 'git carried none of it')
      const steps = localSeedFiles(dir).map((file) => ({ kind: 'seed', file, mode }))
      const res = runBootstrap(steps, { cwd: wt, mainRoot: dir })
      assert.ok(res.ok, JSON.stringify(res.results.filter((r) => r.outcome !== 'seeded')))
      assert.ok(fs.readFileSync(path.join(wt, '.claude', 'skills', 'spec', 'SKILL.md'), 'utf8').length > 0)
      assert.ok(fs.existsSync(path.join(wt, 'CLAUDE.local.md')))
      assert.ok(fs.existsSync(path.join(wt, '.claude', 'settings.local.json')))
      assert.deepStrictEqual(visible(wt), [], 'the shared exclude covers the worktree')
      const again = runBootstrap(steps, { cwd: wt, mainRoot: dir })
      assert.ok(again.results.every((r) => r.outcome === 'skipped'), 'a re-run skips what exists')
    } finally {
      try {
        git(dir, 'worktree', 'remove', '--force', wt)
      } catch {
        /* already gone */
      }
      cleanup(wt)
      cleanup(dir)
    }
  })
}

// bug-local-scope-worktree: the manifest is what records the scope, and a local
// install keeps it out of git — so a worktree it was not seeded into ran
// `update` as a team install, writing the block into the tracked CLAUDE.md and
// the hooks into a new .claude/settings.json.
const assertStayedLocal = (wt) => {
  assert.ok(!fs.existsSync(path.join(wt, 'CLAUDE.md')), 'no block in the tracked CLAUDE.md')
  assert.ok(!fs.existsSync(path.join(wt, '.claude', 'settings.json')), 'no committed settings')
  assert.strictEqual(readManifest(wt).scope, 'local', 'the manifest still says local')
  assert.ok(lastReport().skipped.some((l) => /kept local/.test(l)), 'says it stayed local')
}

for (const mode of ['symlink', 'copy']) {
  test(`update in a bootstrapped worktree of a local install stays local (${mode})`, async () => {
    const dir = repo()
    const wt = `${dir}-wt`
    try {
      await localInit(dir)
      git(dir, 'add', 'specs')
      git(dir, 'commit', '-q', '-m', 'specs')
      git(dir, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
      const steps = localSeedFiles(dir).map((file) => ({ kind: 'seed', file, mode }))
      assert.ok(runBootstrap(steps, { cwd: wt, mainRoot: dir }).ok)
      await quiet(() => resync(wt, { claudeMd: true }))
      assertStayedLocal(wt)
      assert.ok(!lastReport().customized.length, `nothing reads as edited: ${lastReport().customized}`)
      assert.deepStrictEqual(visible(wt), [], 'git still sees nothing')
    } finally {
      try {
        git(dir, 'worktree', 'remove', '--force', wt)
      } catch {
        /* already gone */
      }
      cleanup(wt)
      cleanup(dir)
    }
  })
}

// A worktree bootstrapped before the manifest was seeded has none, and a
// re-bootstrap skips what exists. The shared exclude block still names this
// project's manifest — in a subfolder project, under its prefix.
test('update in a worktree with no manifest stays local while the exclude block names it', async () => {
  const root = repo()
  const wt = `${root}-wt`
  const dir = path.join(root, 'app')
  try {
    fs.mkdirSync(dir)
    await localInit(dir)
    git(root, 'add', 'app/specs')
    git(root, 'commit', '-q', '-m', 'specs')
    git(root, 'worktree', 'add', '-q', wt, '-b', 'feat/x')
    const seeds = localSeedFiles(dir).filter((f) => !f.endsWith('.skitterspec-manifest.json'))
    const steps = seeds.map((file) => ({ kind: 'seed', file, mode: 'copy' }))
    assert.ok(runBootstrap(steps, { cwd: path.join(wt, 'app'), mainRoot: dir }).ok)
    await quiet(() => resync(path.join(wt, 'app'), { claudeMd: true }))
    assertStayedLocal(path.join(wt, 'app'))
    assert.deepStrictEqual(visible(wt), [], 'git still sees nothing')
  } finally {
    try {
      git(root, 'worktree', 'remove', '--force', wt)
    } catch {
      /* already gone */
    }
    cleanup(wt)
    cleanup(root)
  }
})

test('an update of a team install never reads it as local', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.strictEqual(readManifest(dir).scope, 'team')
    assert.ok(!lastReport().skipped.some((l) => /kept local/.test(l)), 'stays silent for a team install')
  } finally {
    cleanup(dir)
  }
})

// --- bug-local-install-templates --------------------------------------------
// The specs/.core templates are managed files like any other, so a local
// install keeps them out of git too. Before the fix they were dropped from the
// exclude block and the seed list, and the first `update` after a template
// changed upstream dirtied a tracked file in the consumer's repo.

const { sha1 } = require('../src/init.js')
const TEMPLATE = 'specs/.core/env.config.md'

// Make one installed template look like an older release's pristine copy, so
// the next `update` rewrites it — the upstream template change.
function ageTemplate(dir, relPath = TEMPLATE) {
  const old = '# an older release of this template\n'
  fs.writeFileSync(path.join(dir, relPath), old)
  const file = path.join(dir, 'specs', '.core', '.skitterspec-manifest.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  manifest.files[relPath] = sha1(old)
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
}

const untrackHint = (r) => r.warnings.filter((w) => /git rm --cached/.test(w))

test('a local install update across a template change leaves git status clean', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    ageTemplate(dir)
    commitAll(dir, 'everything git can see')
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.ok(lastReport().updated.includes(TEMPLATE), 'the template was rewritten')
    assert.deepStrictEqual(visible(dir), [], 'git status is clean')
    assert.ok(!index(dir).includes(TEMPLATE), 'the template never reached git')
  } finally {
    cleanup(dir)
  }
})

test('every managed template is excluded and seeded; live configs never are', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    const core = path.join(dir, 'specs', '.core')
    const templates = fs.readdirSync(core).filter((f) => f.endsWith('.example') || f.endsWith('.md'))
    assert.ok(templates.length >= 3, 'templates installed')
    const exclude = fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8')
    const seeds = localSeedFiles(dir)
    for (const f of templates) {
      assert.ok(exclude.includes(`/specs/.core/${f}\n`), `${f} excluded`)
      assert.ok(seeds.includes(`specs/.core/${f}`), `${f} seeded`)
    }
    for (const live of ['env.config.json', 'gating.config.json', 'github.config.json', 'azure-boards.config.json']) {
      fs.writeFileSync(path.join(core, live), '{}\n')
      assert.ok(!exclude.includes(`/specs/.core/${live}\n`), `${live} never excluded`)
      assert.ok(!seeds.includes(`specs/.core/${live}`), `${live} never seeded`)
    }
    assert.ok(visible(dir).includes('specs/.core/env.config.json'), 'a live config stays visible to git')
  } finally {
    cleanup(dir)
  }
})

test('an already tracked template is reported with the command, never untracked', async () => {
  const dir = repo()
  try {
    await localInit(dir)
    // An install from before the fix: git add specs/ took the templates.
    git(dir, 'add', '-f', '--', ...fs.readdirSync(path.join(dir, 'specs', '.core')).filter((f) => f.endsWith('.md') || f.endsWith('.example')).map((f) => 'specs/.core/' + f))
    git(dir, 'commit', '-q', '-m', 'templates tracked')
    const before = index(dir)
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.deepStrictEqual(index(dir), before, 'the index is untouched')
    assert.deepStrictEqual(staged(dir), [], 'nothing staged')
    const hint = untrackHint(lastReport())
    assert.strictEqual(hint.length, 1, 'one warning, not one per file')
    assert.ok(hint[0].includes(`git rm --cached -- `), 'names the command')
    assert.ok(hint[0].includes(TEMPLATE), 'names the tracked template')
    assert.ok(!hint[0].includes('.skitterspec-manifest.json'), 'the manifest is not a template')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a team install update across a template change', async () => {
  const dir = repo()
  try {
    await teamInit(dir)
    ageTemplate(dir)
    commitAll(dir, 'team install')
    await quiet(() => resync(dir, { claudeMd: true }))
    assert.ok(lastReport().updated.includes(TEMPLATE), 'the team gets the new template to commit')
    assert.deepStrictEqual(untrackHint(lastReport()), [], 'no untrack advice for a team')
    assert.ok(index(dir).includes(TEMPLATE), 'still tracked')
  } finally {
    cleanup(dir)
  }
})
