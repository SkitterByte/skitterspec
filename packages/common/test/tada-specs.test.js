'use strict'

/**
 * `skitterspec tada`, phase 2 — commits attributed to specs, the lifecycle
 * moves they made, and the merge into the digest. The pure halves are pinned
 * directly; `readRepoFacts` runs against a throwaway repo.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { attributeCommit, branchToSpec, lifecycleEvents } = require('../src/tada/specs.js')
const { readRepoFacts } = require('../src/tada/repo.js')
const { buildDigest } = require('../src/tada/digest.js')

// --- branch → spec -----------------------------------------------------------

test('a {type}/{slug} branch names its spec outright', () => {
  const toSpec = branchToSpec('{type}/{slug}')
  assert.strictEqual(toSpec('feat/spec-tada'), 'feat-spec-tada')
  assert.strictEqual(toSpec('bug/flow-event'), 'bug-flow-event')
  assert.strictEqual(toSpec('main'), null)
  assert.strictEqual(toSpec('release/1.2'), null)
})

test('a pattern without {type} names a slug, counted only when one known spec has it', () => {
  const toSpec = branchToSpec('{identifier}-{slug}', ['feat-orders', 'bug-login', 'chore-login'])
  assert.strictEqual(toSpec('ABC-12-orders'), 'feat-orders')
  assert.strictEqual(toSpec('ABC-13-login'), null) // two specs carry the slug
  assert.strictEqual(toSpec('ABC-14-nothing'), null)
})

// --- lifecycle moves ---------------------------------------------------------

const DONE = '# Phase 1 — Build ✅\n\n> **Status:** Done\n'
const OPEN = '# Phase 1 — Build 🔄\n\n> **Status:** In progress\n'

test('a commit\'s renames, adds and ticked phases are its lifecycle moves', () => {
  const commit = {
    sha: 'abc',
    files: [
      { status: 'A', path: 'specs/backlog/feat-new/00-overview.md' },
      { status: 'R', from: 'specs/backlog/feat-a/00-overview.md', path: 'specs/in-progress/feat-a/00-overview.md' },
      { status: 'R', from: 'specs/backlog/feat-a/01-x.md', path: 'specs/in-progress/feat-a/01-x.md' },
      { status: 'R', from: 'specs/in-progress/feat-b/00-overview.md', path: 'specs/complete/feat-b/00-overview.md' },
      { status: 'M', path: 'specs/in-progress/feat-c/02-build.md' },
      { status: 'M', path: 'src/app.js' },
    ],
  }
  const show = (ref) => (ref === 'abc' ? DONE : OPEN)
  assert.deepStrictEqual(lifecycleEvents(commit, show), [
    { spec: 'feat-new', kind: 'written' },
    { spec: 'feat-a', kind: 'started' },
    { spec: 'feat-b', kind: 'completed' },
    { spec: 'feat-c', kind: 'phase-done', phase: 2 },
  ])
})

test('a phase file git cannot show either side of is not a phase finished', () => {
  const commit = { sha: 'abc', files: [{ status: 'M', path: 'specs/in-progress/feat-c/01-build.md' }] }
  assert.deepStrictEqual(lifecycleEvents(commit, (ref) => (ref === 'abc' ? DONE : null)), [])
})

test('editing a phase that was already done is not finishing it again', () => {
  const commit = { sha: 'abc', files: [{ status: 'M', path: 'specs/in-progress/feat-c/01-build.md' }] }
  assert.deepStrictEqual(lifecycleEvents(commit, () => DONE), [])
})

// --- attribution -------------------------------------------------------------

const toSpec = branchToSpec('{type}/{slug}')
const noTicket = () => null

test('an unlanded commit belongs to the spec its branch names', () => {
  const c = { onBase: false, branches: ['feat/orders'], files: [{ status: 'M', path: 'src/a.js' }], refs: [] }
  assert.strictEqual(attributeCommit(c, toSpec, noTicket), 'feat-orders')
})

test('a landed commit is not claimed by a spec branch forked after it', () => {
  // The trap: feat/late was cut from main this afternoon, so it contains this
  // morning's commit — containment, not authorship.
  const c = { onBase: true, branches: ['main', 'feat/late'], files: [{ status: 'M', path: 'src/a.js' }], refs: [] }
  assert.strictEqual(attributeCommit(c, toSpec, noTicket), null)
})

test('a landed commit is answered by the spec folder it touched, then its Refs ticket', () => {
  const touched = { onBase: true, branches: [], files: [{ status: 'M', path: 'specs/in-progress/feat-a/01-x.md' }], refs: ['#9'] }
  assert.strictEqual(attributeCommit(touched, toSpec, () => 'feat-z'), 'feat-a')
  const byRef = { onBase: true, branches: [], files: [{ status: 'M', path: 'src/a.js' }], refs: ['#9'] }
  assert.strictEqual(attributeCommit(byRef, toSpec, (id) => (id === '#9' ? 'feat-z' : null)), 'feat-z')
})

test('a commit touching two specs\' folders names neither by its files', () => {
  const c = {
    onBase: true,
    branches: [],
    files: [
      { status: 'M', path: 'specs/backlog/feat-a/00-overview.md' },
      { status: 'M', path: 'specs/backlog/feat-b/00-overview.md' },
    ],
    refs: [],
  }
  assert.strictEqual(attributeCommit(c, toSpec, noTicket), null)
})

// --- a real repo -------------------------------------------------------------

function sh(cwd, args, env = {}) {
  return execFileSync('git', args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function reader(cwd) {
  return (args) => {
    try {
      return sh(cwd, args)
    } catch {
      return null
    }
  }
}

function write(repo, rel, text) {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), text)
}

function commit(repo, message, env = {}) {
  sh(repo, ['add', '-A'])
  sh(repo, ['commit', '-q', '-m', message], env)
}

function makeRepo({ skitterspec = true } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-repo-'))
  sh(repo, ['init', '-q', '-b', 'main'])
  sh(repo, ['config', 'user.email', 'me@example.com'])
  sh(repo, ['config', 'user.name', 'Me'])
  sh(repo, ['config', 'commit.gpgsign', 'false'])
  if (skitterspec) write(repo, 'specs/.core/README.md', 'rules\n')
  write(repo, 'README.md', 'hi\n')
  commit(repo, 'chore: init')
  return repo
}

const OVERVIEW = '---\ngithub_identifier: "#7"\ngithub_url: "https://github.com/o/r/issues/7"\n---\n\n# Foo\n'
const WINDOW = () => ({ since: new Date(Date.now() - 3600e3), until: new Date(Date.now() + 3600e3) })
const CONFIG = { baseBranch: 'main', branch: { pattern: '{type}/{slug}' } }

test('a day in a skitterspec repo: specs, moves, tickets, and the commits that are not yours', () => {
  const repo = makeRepo()
  write(repo, 'specs/backlog/feat-foo/00-overview.md', OVERVIEW)
  write(repo, 'specs/backlog/feat-foo/01-build.md', OPEN.replace('🔄', '⬜').replace('In progress', 'Not started'))
  commit(repo, 'docs(specs): add feat-foo')
  fs.mkdirSync(path.join(repo, 'specs/in-progress'), { recursive: true })
  sh(repo, ['mv', 'specs/backlog/feat-foo', 'specs/in-progress/feat-foo'])
  commit(repo, 'docs(specs): start feat-foo')
  write(repo, 'src/a.js', '1\n')
  commit(repo, 'feat(a): build it\n\nRefs: #7')
  write(repo, 'specs/in-progress/feat-foo/01-build.md', DONE)
  commit(repo, 'docs(specs): tick phase 1')
  write(repo, 'src/b.js', 'theirs\n')
  commit(repo, 'feat(b): a colleague', { GIT_AUTHOR_EMAIL: 'them@example.com', GIT_AUTHOR_NAME: 'Them' })
  write(repo, 'src/c.js', 'loose\n')
  commit(repo, 'chore: tidy')

  // Unlanded work on a spec branch.
  sh(repo, ['switch', '-q', '-c', 'feat/bar'])
  write(repo, 'src/bar.js', 'bar\n')
  commit(repo, 'feat(bar): start bar')
  // A spec branch cut after the morning's work, and a stash.
  sh(repo, ['switch', '-q', 'main'])
  sh(repo, ['branch', 'feat/late'])
  write(repo, 'src/c.js', 'stashed\n')
  sh(repo, ['stash', 'push', '-q', '-m', 'wip'])

  const f = readRepoFacts({ repo, git: reader(repo), config: CONFIG, window: WINDOW() })
  assert.strictEqual(f.skitterspec, true)
  const bySubject = Object.fromEntries(f.commits.map((c) => [c.subject, c.spec]))
  assert.deepStrictEqual(bySubject, {
    'chore: init': null,
    'docs(specs): add feat-foo': 'feat-foo',
    'docs(specs): start feat-foo': 'feat-foo',
    'feat(a): build it': 'feat-foo',
    'docs(specs): tick phase 1': 'feat-foo',
    'chore: tidy': null,
    'feat(bar): start bar': 'feat-bar',
  })
  assert.strictEqual(f.commits.find((c) => c.subject === 'chore: tidy').branch, 'main')
  assert.deepStrictEqual(
    f.events.map((e) => [e.spec, e.kind, e.phase]),
    [
      ['feat-foo', 'written', undefined],
      ['feat-foo', 'started', undefined],
      ['feat-foo', 'phase-done', 1],
    ],
  )
  assert.deepStrictEqual(f.ticket('feat-foo'), { id: '#7', url: 'https://github.com/o/r/issues/7' })
  assert.strictEqual(f.toSpec('feat/bar'), 'feat-bar')
  assert.deepStrictEqual(f.notes, [])
})

test('a repo without skitterspec reports its commits under their branch, no spec', () => {
  const repo = makeRepo({ skitterspec: false })
  write(repo, 'specs/backlog/feat-x/00-overview.md', OVERVIEW)
  commit(repo, 'docs: a folder that only looks like a spec')
  const f = readRepoFacts({ repo, git: reader(repo), config: CONFIG, window: WINDOW() })
  assert.strictEqual(f.skitterspec, false)
  assert.ok(f.commits.every((c) => c.spec === null && c.branch === 'main'))
  assert.deepStrictEqual(f.events, [])
})

test('a repo with no identity says cannot tell rather than reporting no commits', () => {
  const repo = makeRepo()
  const git = (args) => (args[0] === 'config' ? null : reader(repo)(args))
  const f = readRepoFacts({ repo, git, config: CONFIG, window: WINDOW() })
  assert.deepStrictEqual(f.commits, [])
  assert.match(f.notes[0], /cannot tell: .* has no user\.email or user\.name/)
})

// --- the merge ---------------------------------------------------------------

test('sessions, commits, moves and open state for one spec land in one group', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'))
  const dir = path.join(root, '-nowhere')
  fs.mkdirSync(dir)
  const entry = (cwd, gitBranch, at, content) =>
    JSON.stringify({ type: 'user', cwd, gitBranch, timestamp: at, message: { role: 'user', content } })
  fs.writeFileSync(
    path.join(dir, 's1.jsonl'),
    [
      entry('/repo', 'main', '2026-11-11T11:00:00Z', 'spec it'),
      entry('/repo-wt/foo', 'feat/foo', '2026-11-11T12:00:00Z', 'build it'),
    ].join('\n'),
  )
  const facts = () => ({
    skitterspec: true,
    notes: [],
    toSpec: branchToSpec('{type}/{slug}'),
    ticket: (spec) => (spec === 'feat-foo' ? { id: '#7', url: null } : null),
    commits: [
      { sha: 'a1', at: '2026-11-11T12:30:00Z', subject: 'feat: foo', spec: 'feat-foo', branch: 'feat/foo', refs: [] },
      { sha: 'b2', at: '2026-11-11T10:30:00Z', subject: 'chore: tidy', spec: null, branch: 'main', refs: [] },
    ],
    events: [{ spec: 'feat-foo', kind: 'phase-done', phase: 1, sha: 'a1', at: '2026-11-11T12:30:00Z' }],
  })
  const openFor = () => [
    { spec: 'feat-foo', detail: 'in-progress · 1 of 2', next: '/spec-next' },
    { spec: 'feat-idle', detail: 'backlog', next: '/spec-start feat-idle' },
  ]
  const repoOf = (cwd) => (cwd === '/repo' || cwd.startsWith('/repo-wt/') ? { repo: '/repo' } : { repo: null })
  const d = await buildDigest({
    root,
    window: { since: new Date('2026-11-11T10:00:00Z'), until: new Date('2026-11-11T20:00:00Z') },
    repoOf,
    facts,
    openFor,
    chat: true,
  })
  const p = d.projects[0]
  assert.strictEqual(p.skitterspec, true)
  assert.deepStrictEqual(
    p.groups.map((g) => [g.spec, g.branch, g.sessions.length, g.commits.length, g.events.length, g.inFlight && g.inFlight.next]),
    [
      [null, 'main', 1, 1, 0, null],
      ['feat-foo', 'feat/foo', 1, 1, 1, '/spec-next'],
      ['feat-idle', null, 0, 0, 0, '/spec-start feat-idle'],
    ],
  )
  assert.deepStrictEqual(p.groups[1].ticket, { id: '#7', url: null })
})
