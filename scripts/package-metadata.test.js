'use strict'

// npm validates a package's sigstore provenance bundle against `repository.url`
// **case-sensitively**, and rejects a mismatch at the very last step of a publish
// with `422 … Error verifying sigstore provenance bundle: Failed to validate
// repository information`.
//
// This repo shipped `github.com/skitterbyte/skitterspec` in every manifest while
// the org is `SkitterByte`, and the lowercase spelling reached npm in
// @skitterbyte/skitterspec@18.0.0 and @skitterbyte/skitterspec-linear@12.0.0.
// Nothing caught it because nothing had ever published with provenance — the
// field was decoration until the first trusted-publishing release made it load
// bearing.
//
// The check is cheap here and expensive in CI: a wrong character costs a failed
// release and a burnt version number.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')

// --- pure helpers -----------------------------------------------------------

/**
 * The `repository.url` a git remote implies, in the form npm compares against.
 *
 * Accepts both spellings git hands out — `git@host:Org/repo.git` and
 * `https://host/Org/repo.git` — and returns null for anything else rather than
 * guessing, so an unrecognised remote becomes "cannot tell" at the call site
 * instead of a confident wrong answer (`.claude/rules/negative-checks.md`
 * rule 4).
 *
 * CASE IS PRESERVED DELIBERATELY. Lowercasing here would make the check pass on
 * exactly the input it exists to catch.
 */
function expectedRepoUrl(remote) {
  if (typeof remote !== 'string') return null
  const trimmed = remote.trim()
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(trimmed)
  if (ssh) return `git+https://${ssh[1]}/${ssh[2]}.git`
  const https = /^(?:git\+)?https:\/\/([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed)
  if (https) return `git+https://${https[1]}/${https[2]}.git`
  return null
}

/**
 * Report what is wrong with a set of manifests, as a list of one-line problems.
 * Pure — the caller supplies the manifests, so the fires/stays-silent cases at
 * the bottom feed it fixtures rather than editing this repo's real package.json
 * files.
 *
 * Each manifest is `{ rel, dir, pkg }`: its path relative to the repo root, the
 * directory that path implies (null for the root manifest), and the parsed JSON.
 *
 * WHAT WOULD MAKE THIS LIE: a PRIVATE package with no `repository` field. That
 * is an ordinary, healthy state — nothing is published from it, so nothing can
 * 422 — and it is skipped rather than accused. Only a publishable manifest is
 * required to carry the field, because only a publishable manifest can be wrong
 * in a way that costs anything.
 */
function repositoryProblems(manifests, expectedUrl) {
  const problems = []
  for (const { rel, dir, pkg } of manifests) {
    const repo = pkg.repository
    if (!repo) {
      if (!pkg.private) {
        problems.push(`${rel}: publishable, but has no "repository" field`)
      }
      continue
    }
    if (repo.url !== expectedUrl) {
      problems.push(`${rel}: repository.url is "${repo.url}", expected "${expectedUrl}"`)
    }
    if (dir === null) {
      if (repo.directory !== undefined) {
        problems.push(`${rel}: root manifest should carry no repository.directory`)
      }
    } else if (repo.directory !== dir) {
      problems.push(
        `${rel}: repository.directory is ${JSON.stringify(repo.directory)}, expected "${dir}"`,
      )
    }
  }
  return problems
}

// --- the real corpus --------------------------------------------------------

function readManifests() {
  const out = [{ rel: 'package.json', dir: null, pkg: readJson(path.join(ROOT, 'package.json')) }]
  const pkgsDir = path.join(ROOT, 'packages')
  for (const name of fs.readdirSync(pkgsDir).sort()) {
    const file = path.join(pkgsDir, name, 'package.json')
    if (!fs.existsSync(file)) continue
    out.push({ rel: `packages/${name}/package.json`, dir: `packages/${name}`, pkg: readJson(file) })
  }
  return out
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function originRemote() {
  const res = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' })
  if (res.status !== 0) return null
  return res.stdout.trim() || null
}

test('every manifest names the origin remote, in the remote\'s own case', () => {
  const remote = originRemote()
  const expected = expectedRepoUrl(remote)

  // Three states, not two. No git, no `origin`, or a remote spelling this does
  // not recognise all mean "cannot tell" — and a check that cannot see its own
  // reference value must say nothing rather than accuse every manifest in the
  // repo. A source tarball with no .git is the case that makes this real.
  if (!expected) {
    assert.ok(true, 'no usable origin remote — nothing to compare against')
    return
  }

  const problems = repositoryProblems(readManifests(), expected)
  assert.deepStrictEqual(problems, [], `repository metadata problems:\n  ${problems.join('\n  ')}`)
})

test('the published packages carry a repository field at all', () => {
  // The check above skips a manifest with no `repository`, and the two packages
  // that matter must never reach that branch: a published tarball with no
  // repository has nothing for npm to validate provenance against.
  for (const rel of ['packages/skitterspec/package.json', 'packages/skitterspec-linear/package.json']) {
    const pkg = readJson(path.join(ROOT, rel))
    assert.ok(pkg.repository && pkg.repository.url, `${rel} has no repository.url`)
  }
})

// --- the check fires --------------------------------------------------------

test('a lowercased org is caught — the exact failure this exists for', () => {
  const problems = repositoryProblems(
    [{ rel: 'packages/x/package.json', dir: 'packages/x', pkg: {
      repository: { type: 'git', url: 'git+https://github.com/skitterbyte/skitterspec.git', directory: 'packages/x' },
    } }],
    'git+https://github.com/SkitterByte/skitterspec.git',
  )
  assert.strictEqual(problems.length, 1)
  assert.match(problems[0], /repository\.url/)
})

test('a wrong or missing directory is caught', () => {
  const expected = 'git+https://github.com/SkitterByte/skitterspec.git'
  const wrong = repositoryProblems(
    [{ rel: 'packages/x/package.json', dir: 'packages/x', pkg: {
      repository: { type: 'git', url: expected, directory: 'packages/y' },
    } }],
    expected,
  )
  assert.strictEqual(wrong.length, 1)
  assert.match(wrong[0], /repository\.directory/)

  const missing = repositoryProblems(
    [{ rel: 'packages/x/package.json', dir: 'packages/x', pkg: { repository: { type: 'git', url: expected } } }],
    expected,
  )
  assert.strictEqual(missing.length, 1)
})

test('a publishable manifest with no repository at all is caught', () => {
  const problems = repositoryProblems(
    [{ rel: 'packages/x/package.json', dir: 'packages/x', pkg: { name: 'x' } }],
    'git+https://github.com/SkitterByte/skitterspec.git',
  )
  assert.strictEqual(problems.length, 1)
  assert.match(problems[0], /no "repository" field/)
})

// --- the check stays silent -------------------------------------------------

test('a PRIVATE package with no repository is not accused', () => {
  // The healthy-but-unusual input (`.claude/rules/negative-checks.md` rule 3).
  // `packages/linear` and `packages/sync-core` were both in exactly this state
  // before this spec, and neither was broken: nothing is published from them.
  const problems = repositoryProblems(
    [{ rel: 'packages/x/package.json', dir: 'packages/x', pkg: { name: 'x', private: true } }],
    'git+https://github.com/SkitterByte/skitterspec.git',
  )
  assert.deepStrictEqual(problems, [])
})

test('the root manifest is right to have no repository.directory', () => {
  const expected = 'git+https://github.com/SkitterByte/skitterspec.git'
  const problems = repositoryProblems(
    [{ rel: 'package.json', dir: null, pkg: { repository: { type: 'git', url: expected } } }],
    expected,
  )
  assert.deepStrictEqual(problems, [])
})

test('an unrecognised remote yields no expectation, rather than a wrong one', () => {
  assert.strictEqual(expectedRepoUrl(null), null)
  assert.strictEqual(expectedRepoUrl(''), null)
  assert.strictEqual(expectedRepoUrl('file:///tmp/some/mirror'), null)
})

test('both remote spellings normalise to the same url, case intact', () => {
  const want = 'git+https://github.com/SkitterByte/skitterspec.git'
  assert.strictEqual(expectedRepoUrl('git@github.com:SkitterByte/skitterspec.git'), want)
  assert.strictEqual(expectedRepoUrl('https://github.com/SkitterByte/skitterspec.git'), want)
  assert.strictEqual(expectedRepoUrl('https://github.com/SkitterByte/skitterspec'), want)
  assert.notStrictEqual(expectedRepoUrl('git@github.com:skitterbyte/skitterspec.git'), want)
})
