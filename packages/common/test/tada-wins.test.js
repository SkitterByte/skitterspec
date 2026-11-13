'use strict'

/**
 * feat-spec-todo, phase 1: the ta-da list knows which project it was run
 * from (`here`), and which of the day's events were wins — so a recap can lead
 * with them and keep its closing advice to the work this session owns.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { buildDigest } = require('../src/tada/digest.js')
const { formatTada } = require('../src/tada/format.js')
const { renderTadaPage } = require('../src/tada/page.js')
const { tagsBySha } = require('../src/tada/repo.js')

const WINDOW = { since: new Date('2026-11-11T10:00:00Z'), until: new Date('2026-11-11T20:00:00Z') }

// One session in /repo and one in /other.
function transcripts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-wins-'))
  const dir = path.join(root, '-nowhere')
  fs.mkdirSync(dir)
  const line = (id, cwd) =>
    JSON.stringify({ type: 'user', cwd, gitBranch: 'main', sessionId: id, timestamp: '2026-11-11T11:00:00Z', message: { role: 'user', content: 'hi' } })
  fs.writeFileSync(path.join(dir, 's1.jsonl'), line('s1', '/repo') + '\n')
  fs.writeFileSync(path.join(dir, 's2.jsonl'), line('s2', '/other') + '\n')
  return root
}

function repoOf(cwd) {
  if (cwd === '/repo' || cwd.startsWith('/repo-wt/')) return { repo: '/repo' }
  if (cwd === '/other') return { repo: '/other' }
  return { repo: null }
}

const AT = '2026-11-11T12:00:00Z'
const commit = (spec, extra = {}) => ({ sha: 'a1b2c3d4e', at: AT, subject: 'x', spec, branch: 'main', refs: [], ...extra })
const completed = (spec) => ({ spec, kind: 'completed', sha: 'a1b2c3d4e', at: AT })

function facts({ commits = [], events = [] } = {}) {
  return () => ({ name: null, category: null, skitterspec: true, toSpec: () => null, ticket: () => null, commits, events, notes: [] })
}

// `chat`, so a session alone is enough to list a project.
const digest = (over = {}) => buildDigest({ root: transcripts(), window: WINDOW, repoOf, chat: true, ...over })

// --- home -----------------------------------------------------------------------

test('the project the run started from is stamped here, and only that one', async () => {
  const d = await digest({ home: '/repo' })
  assert.deepStrictEqual(d.projects.map((p) => [p.repo, Boolean(p.here)]), [['/other', false], ['/repo', true]])
})

test('a run from a worktree is still at home in its repo', async () => {
  const d = await digest({ home: '/repo-wt/foo' })
  assert.strictEqual(d.projects.find((p) => p.here).repo, '/repo')
})

// Stays silent: a run from outside every repo has no home, and claims none.
test('a home outside any repo stamps no project', async () => {
  const d = await digest({ home: '/tmp/elsewhere' })
  assert.ok(d.projects.every((p) => !p.here))
})

// --- wins -------------------------------------------------------------------------

test('a completed bug, hotfix or incident is saved bacon; another completed spec is a win', async () => {
  const events = ['bug-crash', 'hotfix-prod', 'incident-outage', 'feat-orders', 'chore-deps'].map(completed)
  const commits = events.map((e) => commit(e.spec))
  const d = await digest({ home: '/repo', facts: facts({ commits, events }) })
  const wins = Object.fromEntries(
    d.projects.find((p) => p.repo === '/repo').groups.filter((g) => g.wins).map((g) => [g.spec, g.wins.map((w) => w.kind)]),
  )
  assert.deepStrictEqual(wins, {
    'bug-crash': ['saved-bacon'],
    'hotfix-prod': ['saved-bacon'],
    'incident-outage': ['saved-bacon'],
    'feat-orders': ['win'],
    'chore-deps': ['win'],
  })
})

test('a tag cut on one of the window\'s commits is a win', async () => {
  const d = await digest({ facts: facts({ commits: [commit(null, { tags: ['app@1.2.0'] })] }) })
  const g = d.projects[0].groups.find((x) => x.wins)
  assert.deepStrictEqual(g.wins.map((w) => [w.kind, w.what]), [['win', 'app@1.2.0 cut']])
})

// Stays silent: progress is not a win.
test('a cancelled spec, a written one and a finished phase carry no wins', async () => {
  const events = [
    { spec: 'feat-a', kind: 'cancelled', sha: 'a1b2c3d4e', at: AT },
    { spec: 'bug-b', kind: 'written', sha: 'a1b2c3d4e', at: AT },
    { spec: 'hotfix-c', kind: 'phase-done', phase: 1, sha: 'a1b2c3d4e', at: AT },
  ]
  const d = await digest({ facts: facts({ events }) })
  for (const p of d.projects) for (const g of p.groups) assert.strictEqual(g.wins, undefined, `${g.spec} has no wins`)
})

// --- the text and the page --------------------------------------------------------

test('the text marks the home project and each win', () => {
  const text = formatTada({
    window: { since: AT, until: AT, label: 'Wednesday 11 November 2026' },
    projects: [
      {
        repo: '/repo',
        name: 'app',
        here: true,
        groups: [
          {
            spec: 'bug-crash',
            branch: null,
            sessions: [],
            commits: [],
            events: [completed('bug-crash')],
            wins: [{ kind: 'saved-bacon', what: 'bug-crash completed', at: AT }],
            inFlight: null,
          },
        ],
      },
    ],
    notes: [],
  })
  assert.match(text, /^app \(here\)  \(\/repo\)$/m)
  assert.match(text, /^ {4}★ saved bacon: bug-crash completed$/m)
})

test('the page carries the win chips and the here badge', () => {
  const html = renderTadaPage({
    window: { since: AT, until: AT },
    projects: [
      {
        repo: '/repo',
        name: 'app',
        here: true,
        groups: [{ spec: null, branch: 'main', sessions: [], commits: [], events: [], wins: [{ kind: 'win', what: 'app@1.2.0 cut', at: AT }], inFlight: null }],
      },
    ],
    notes: [],
  })
  assert.match(html, /<span class="chip win">★ win: app@1\.2\.0 cut<\/span>/)
  assert.match(html, /<span class="chip">here<\/span>/)
})

// --- tags from git ----------------------------------------------------------------

test('tags are keyed by the commit they name, annotated ones peeled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-tags-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  git('init', '-q')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one')
  git('tag', 'light')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'tag', '-a', 'app@1.0.0', '-m', 'release')
  const head = git('rev-parse', 'HEAD')
  const reader = (args) => {
    try {
      return git(...args)
    } catch {
      return null
    }
  }
  assert.deepStrictEqual(tagsBySha(reader).get(head).sort(), ['app@1.0.0', 'light'])
})

// Stays silent: a repo git cannot read gives no tags, not a failure.
test('a failed tag read is no tags at all', () => {
  assert.strictEqual(tagsBySha(() => null).size, 0)
})
