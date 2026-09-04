'use strict'

// Commit selection and package attribution for per-package release notes.
//
// The two things that can silently go wrong here are ordering (a lexical sort
// picks the wrong previous tag, so a release's notes start from the wrong place)
// and attribution (a change to packages/common ships in BOTH distributions, so
// dropping it from either set loses a real user-facing note).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { previousTagFor, packagesFor, notesInRange, notesFor, FEEDS } = require('./release-notes.js')

// --- pure: tag series -------------------------------------------------------

test('previousTagFor orders by semver, not lexically', () => {
  // '8.3.0' > '16.8.0' as strings. Getting this wrong is how an npm version list
  // reported the newest release as 8.3.0 while 16.8.0 was live.
  const tags = ['skitterspec@8.3.0', 'skitterspec@16.6.0', 'skitterspec@16.7.0']
  assert.strictEqual(previousTagFor('skitterspec', '16.8.0', tags), 'skitterspec@16.7.0')
})

test('previousTagFor keeps the two series apart', () => {
  const tags = ['skitterspec@16.7.0', 'skitterspec-linear@10.6.0', 'v1.0.1']
  assert.strictEqual(previousTagFor('skitterspec', '16.8.0', tags), 'skitterspec@16.7.0')
  assert.strictEqual(
    previousTagFor('skitterspec-linear', '10.7.0', tags),
    'skitterspec-linear@10.6.0',
    'the base tag is not mistaken for the superset\'s',
  )
})

test('previousTagFor ignores tags at or above the target', () => {
  const tags = ['skitterspec@16.7.0', 'skitterspec@16.8.0', 'skitterspec@17.0.0']
  assert.strictEqual(previousTagFor('skitterspec', '16.8.0', tags), 'skitterspec@16.7.0')
})

// stays-silent (.claude/rules/negative-checks.md rule 3): a first release is a
// healthy state, not an error — it must yield "no lower bound", so every
// footer-carrying commit is picked up rather than none.
test('stays silent: a package with no prior tag resolves to no lower bound', () => {
  assert.strictEqual(previousTagFor('skitterspec', '1.0.0', ['skitterspec-linear@10.6.0']), null)
  assert.strictEqual(previousTagFor('skitterspec', '1.0.0', []), null)
})

test('previousTagFor ignores malformed versions rather than throwing', () => {
  const tags = ['skitterspec@nightly', 'skitterspec@16.7.0', 'skitterspec@']
  assert.strictEqual(previousTagFor('skitterspec', '16.8.0', tags), 'skitterspec@16.7.0')
})

// --- pure: attribution ------------------------------------------------------

test('packagesFor sends a common change to both distributions', () => {
  assert.deepStrictEqual(
    [...packagesFor(['packages/common/src/cli.js'])].sort(),
    ['skitterspec', 'skitterspec-linear'],
  )
})

test('packagesFor keeps provider-only changes out of the base', () => {
  for (const p of ['packages/linear/src/api.js', 'packages/sync-core/index.js']) {
    assert.deepStrictEqual([...packagesFor([p])], ['skitterspec-linear'], p)
  }
})

// The generated dist dirs are build output — gitignored and never hand-edited —
// so a path there attributes to nothing rather than to the package it builds.
test('packagesFor attributes generated dist paths to nothing', () => {
  assert.deepStrictEqual([...packagesFor(['packages/skitterspec/src/cli.js'])], [])
  assert.deepStrictEqual([...packagesFor(['packages/skitterspec-linear/assets/x.md'])], [])
})

test('packagesFor attributes docs and scripts to nothing', () => {
  assert.deepStrictEqual([...packagesFor(['docs/index.html', 'scripts/release.js'])], [])
})

test('the FEEDS map stays in step with the build', () => {
  const build = fs.readFileSync(path.join(__dirname, 'build-dist.js'), 'utf8')
  // build-dist vendors common into both dists, and sync-core + linear into the
  // superset. If that list changes, FEEDS has to change with it.
  assert.match(build, /skitterspec-common\/src/, 'common is vendored')
  assert.match(build, /skitterspec-sync-core/, 'sync-core is vendored')
  assert.match(build, /skitterspec-provider-linear\/src/, 'linear is vendored')
  assert.deepStrictEqual(
    FEEDS.map((f) => f.prefix),
    ['packages/common/', 'packages/sync-core/', 'packages/linear/'],
  )
})

// --- against a real repo ----------------------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function commit(dir, file, message) {
  const abs = path.join(dir, file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.appendFileSync(abs, 'x\n')
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-F', '-'], { input: message })
}

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-notes-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

test('only commits with a Release-Note footer are selected', () => {
  const dir = scaffold()
  try {
    commit(dir, 'packages/common/a.js', 'feat(cli): with a note\n\nRelease-Note: Users can now do a thing.')
    commit(dir, 'packages/common/b.js', 'chore(cli): no note at all')
    const got = notesInRange(null, 'HEAD', dir)
    assert.strictEqual(got.length, 1, 'the footerless commit is excluded')
    assert.match(got[0].subject, /with a note/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a common change lands in both packages; a linear change in one', () => {
  const dir = scaffold()
  try {
    commit(dir, 'packages/common/a.js', 'feat(cli): shared\n\nRelease-Note: Shared change.')
    commit(dir, 'packages/linear/b.js', 'feat(sync): provider\n\nRelease-Note: Provider change.')
    const base = notesFor('skitterspec', '1.0.0', { cwd: dir, tags: [] }).map((c) => c.subject)
    const sup = notesFor('skitterspec-linear', '1.0.0', { cwd: dir, tags: [] }).map((c) => c.subject)
    assert.deepStrictEqual(base, ['feat(cli): shared'], 'base gets only the shared change')
    assert.strictEqual(sup.length, 2, 'the superset gets both')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a multi-line body with blank lines survives parsing', () => {
  const dir = scaffold()
  try {
    commit(
      dir,
      'packages/common/a.js',
      'feat(cli): wrapped\n\n- a bullet\n- another\n\nRelease-Note: A note that wraps\nover two lines.\n\nRefs: SKS-1',
    )
    const [c] = notesInRange(null, 'HEAD', dir)
    assert.ok(c, 'the commit is found')
    assert.match(c.body, /Release-Note: A note that wraps/)
    assert.ok(c.files.includes('packages/common/a.js'), `files parsed: ${JSON.stringify(c.files)}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the range starts after the package previous tag, not the other series', () => {
  const dir = scaffold()
  try {
    commit(dir, 'packages/common/a.js', 'feat(cli): before base tag\n\nRelease-Note: Old.')
    git(dir, 'tag', 'skitterspec@1.0.0')
    commit(dir, 'packages/common/b.js', 'feat(cli): after base tag\n\nRelease-Note: New.')
    git(dir, 'tag', 'skitterspec-linear@2.0.0')
    const tags = git(dir, 'tag', '--list').split('\n')
    const base = notesFor('skitterspec', '1.1.0', { cwd: dir, tags }).map((c) => c.subject)
    assert.deepStrictEqual(base, ['feat(cli): after base tag'], 'starts at the base series tag')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: a first release includes every footer-carrying commit', () => {
  const dir = scaffold()
  try {
    commit(dir, 'packages/common/a.js', 'feat(cli): one\n\nRelease-Note: One.')
    commit(dir, 'packages/common/b.js', 'feat(cli): two\n\nRelease-Note: Two.')
    const got = notesFor('skitterspec', '1.0.0', { cwd: dir, tags: [] })
    assert.strictEqual(got.length, 2, 'no prior tag means no lower bound, not no commits')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
