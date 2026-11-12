'use strict'

/**
 * Changes over chatter (feat-tada-scope-and-serve, phase 2): prompts on a
 * branch with no spec are dropped unless the session went on to a spec;
 * commits are always kept; `--chat` restores everything.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { buildDigest } = require('../src/tada/digest.js')
const { branchToSpec } = require('../src/tada/specs.js')

const WINDOW = { since: new Date('2026-11-11T10:00:00Z'), until: new Date('2026-11-11T20:00:00Z') }

const entry = (cwd, gitBranch, at, content) =>
  JSON.stringify({ type: 'user', cwd, gitBranch, timestamp: `2026-11-11T${at}:00Z`, message: { content } })

function transcripts(sessions) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'))
  const dir = path.join(root, '-nowhere')
  fs.mkdirSync(dir)
  for (const [id, lines] of Object.entries(sessions)) fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.join('\n'))
  return root
}

const repoOf = (cwd) => (cwd.startsWith('/repo') || cwd.startsWith('/wt/') ? { repo: '/repo' } : cwd === '/other' ? { repo: '/other' } : { repo: null })

function facts(commits = []) {
  return () => ({
    name: null,
    category: null,
    skitterspec: true,
    notes: [],
    toSpec: branchToSpec('{type}/{slug}'),
    ticket: () => null,
    commits,
    events: [],
  })
}

const run = (root, over = {}) => buildDigest({ root, window: WINDOW, repoOf, facts: facts(), ...over })
const group = (d, spec) => d.projects[0].groups.find((g) => g.spec === spec)
const texts = (g) => g.sessions.flatMap((s) => s.prompts.map((p) => p.text))

test('prompts on a branch with no spec are dropped', async () => {
  const root = transcripts({ s1: [entry('/repo', 'main', '11:00', 'why is the alert firing?')] })
  const d = await run(root)
  assert.deepStrictEqual(d.projects, [], 'a project with only chatter has nothing left to report')
})

test('a session that went on to a spec brings its earlier prompts with it', async () => {
  const root = transcripts({
    s1: [
      entry('/repo', 'main', '11:00', 'they want to upload 41k codes'),
      entry('/repo', 'main', '11:05', 'process it offline'),
      entry('/wt/upload', 'feat/upload', '11:30', 'build it'),
    ],
  })
  const d = await run(root)
  assert.deepStrictEqual(d.projects[0].groups.map((g) => g.spec), ['feat-upload'])
  assert.deepStrictEqual(texts(group(d, 'feat-upload')), ['they want to upload 41k codes', 'process it offline', 'build it'])
  assert.strictEqual(group(d, 'feat-upload').sessions[0].start, '2026-11-11T11:00:00Z')
})

test('the spec a session reached next takes its chatter, not one it left earlier', async () => {
  const root = transcripts({
    s1: [
      entry('/wt/a', 'feat/a', '11:00', 'finish a'),
      entry('/repo', 'main', '12:00', 'now about b'),
      entry('/wt/b', 'feat/b', '12:30', 'build b'),
    ],
  })
  const d = await run(root)
  assert.deepStrictEqual(texts(group(d, 'feat-a')), ['finish a'])
  assert.deepStrictEqual(texts(group(d, 'feat-b')), ['now about b', 'build b'])
})

test('a no-spec branch keeps its commits — they are changes — without its prompts', async () => {
  const root = transcripts({ s1: [entry('/repo', 'main', '11:00', 'bump the deps')] })
  const commits = [{ sha: 'a1', at: '2026-11-11T11:10:00Z', subject: 'chore(deps): bump', spec: null, branch: 'main', refs: [] }]
  const d = await run(root, { facts: facts(commits) })
  const main = d.projects[0].groups.find((g) => g.branch === 'main')
  assert.deepStrictEqual(main.commits.map((c) => c.subject), ['chore(deps): bump'])
  assert.deepStrictEqual(main.sessions, [])
})

test('a session in another project is not folded across repos', async () => {
  const root = transcripts({
    s1: [entry('/other', 'main', '11:00', 'elsewhere'), entry('/wt/a', 'feat/a', '11:30', 'here')],
  })
  const d = await run(root)
  const repo = d.projects.find((p) => p.repo === '/repo')
  assert.deepStrictEqual(texts(repo.groups[0]), ['here'])
  assert.ok(!d.projects.some((p) => p.repo === '/other'), 'the other repo had only chatter')
})

test('--chat keeps every prompt where it was typed', async () => {
  const root = transcripts({
    s1: [entry('/repo', 'main', '11:00', 'musing'), entry('/wt/a', 'feat/a', '11:30', 'build a')],
  })
  const d = await run(root, { chat: true })
  assert.deepStrictEqual(texts(d.projects[0].groups.find((g) => g.branch === 'main')), ['musing'])
  assert.deepStrictEqual(texts(group(d, 'feat-a')), ['build a'])
})
