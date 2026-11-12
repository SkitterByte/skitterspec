'use strict'

/**
 * `skitterspec tada`, phase 1 — the window, the transcript reader, and the
 * digest that folds sessions into repos. Transcripts are fixtures on disk; the
 * repo lookup is injected, so no test needs a real repo or a real clock.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { parseSince } = require('../src/tada/window.js')
const { readPrompt, launchDir, PROMPT_CHARS } = require('../src/tada/transcripts.js')
const { buildDigest } = require('../src/tada/digest.js')

// --- window ------------------------------------------------------------------

// Monday 9 November 2026, mid-afternoon, local time.
const MONDAY = new Date(2026, 10, 9, 15, 30)

test('the default window opens at local midnight today', () => {
  assert.deepStrictEqual(parseSince(undefined, MONDAY), new Date(2026, 10, 9))
  assert.deepStrictEqual(parseSince('today', MONDAY), new Date(2026, 10, 9))
})

test('yesterday is the previous local midnight', () => {
  assert.deepStrictEqual(parseSince('yesterday', MONDAY), new Date(2026, 10, 8))
})

test('a weekday is the most recent past one, and today\'s name means a week back', () => {
  assert.deepStrictEqual(parseSince('friday', MONDAY), new Date(2026, 10, 6))
  assert.deepStrictEqual(parseSince('Fri', MONDAY), new Date(2026, 10, 6))
  assert.deepStrictEqual(parseSince('monday', MONDAY), new Date(2026, 10, 2))
})

test('a date is its local midnight', () => {
  assert.deepStrictEqual(parseSince('2026-11-02', MONDAY), new Date(2026, 10, 2))
})

test('a window it cannot read refuses rather than guessing a day', () => {
  assert.throws(() => parseSince('2026-02-31', MONDAY), /no such date/)
  assert.throws(() => parseSince('2026-12-01', MONDAY), /in the future/)
  assert.throws(() => parseSince('last week', MONDAY), /expected today/)
})

// --- prompts -----------------------------------------------------------------

test('a typed prompt is kept, whitespace folded', () => {
  assert.deepStrictEqual(readPrompt('  fix the\n  login page '), { text: 'fix the login page' })
})

test('a skill command is kept as an event with its arguments', () => {
  const c = '<command-message>spec</command-message>\n<command-name>/spec-next</command-name>\n<command-args>phase 2</command-args>'
  assert.deepStrictEqual(readPrompt(c), { command: '/spec-next', text: 'phase 2' })
})

test('housekeeping commands, caveats, tool results and interruptions are dropped', () => {
  assert.strictEqual(readPrompt('<command-name>/clear</command-name>\n<command-args></command-args>'), null)
  assert.strictEqual(readPrompt('<local-command-caveat>Caveat: …</local-command-caveat>'), null)
  assert.strictEqual(readPrompt('<task-notification>done</task-notification>'), null)
  assert.strictEqual(readPrompt([{ type: 'tool_result', content: 'ok' }]), null)
  assert.strictEqual(readPrompt('[Request interrupted by user]'), null)
  assert.strictEqual(readPrompt('   '), null)
})

test('a long prompt is capped', () => {
  const p = readPrompt('x'.repeat(PROMPT_CHARS * 2))
  assert.strictEqual(p.text.length, PROMPT_CHARS)
  assert.ok(p.text.endsWith('…'))
})

test('a transcript folder decodes to the one directory that exists', () => {
  const disk = new Set(['/Users', '/Users/me', '/Users/me/code', '/Users/me/code/my-app', '/Users/me/.claude'])
  const exists = (p) => disk.has(p)
  assert.strictEqual(launchDir('-Users-me-code-my-app', exists), '/Users/me/code/my-app')
  assert.strictEqual(launchDir('-Users-me--claude', exists), '/Users/me/.claude')
})

test('a transcript folder that decodes two ways, or none, is cannot-tell', () => {
  const disk = new Set(['/a', '/a/b', '/a/b/c', '/a-b', '/a-b/c'])
  assert.strictEqual(launchDir('-a-b-c', (p) => disk.has(p)), null)
  assert.strictEqual(launchDir('-x-y', () => false), null)
})

// --- digest ------------------------------------------------------------------

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'))
}

// One session file. Entries default to a user prompt in /repo on main.
function session(root, id, entries, { project = '-nowhere-at-all', mtime } = {}) {
  const dir = path.join(root, project)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${id}.jsonl`)
  const lines = entries.map((e) =>
    JSON.stringify({
      type: 'user',
      cwd: '/repo',
      gitBranch: 'main',
      sessionId: id,
      ...e,
      message: { role: 'user', content: e.content ?? 'hello' },
    }),
  )
  fs.writeFileSync(file, lines.join('\n') + '\n')
  if (mtime) fs.utimesSync(file, mtime, mtime)
  return file
}

const WINDOW = { since: new Date('2026-11-11T10:00:00Z'), until: new Date('2026-11-11T20:00:00Z') }

// /repo and every worktree of it resolve to /repo; /gone has been removed.
function repoOf(cwd) {
  if (cwd === '/repo' || cwd.startsWith('/repo-wt/')) return { repo: '/repo' }
  if (cwd === '/other') return { repo: '/other' }
  if (cwd.startsWith('/gone')) return { missing: true }
  return { repo: null }
}

const digest = (root, over = {}) => buildDigest({ root, window: WINDOW, repoOf, ...over })

test('entries are compared as instants, not by the day their string starts with', async () => {
  const root = tmpRoot()
  session(root, 's1', [
    { timestamp: '2026-11-11T09:59:00Z', content: 'before the window' },
    // 09:30 at UTC-1 is 10:30Z — inside, though its string reads earlier.
    { timestamp: '2026-11-11T09:30:00-01:00', content: 'inside, by instant' },
    { timestamp: '2026-11-11T20:01:00Z', content: 'after the window' },
  ])
  const d = await digest(root)
  const texts = d.projects[0].groups[0].sessions[0].prompts.map((p) => p.text)
  assert.deepStrictEqual(texts, ['inside, by instant'])
})

test('a worktree folds into its repo, grouped by the branch it was on', async () => {
  const root = tmpRoot()
  session(root, 's1', [
    { timestamp: '2026-11-11T11:00:00Z', content: 'spec it' },
    { timestamp: '2026-11-11T12:00:00Z', cwd: '/repo-wt/foo', gitBranch: 'feat/foo', content: 'build it' },
  ])
  const d = await digest(root)
  assert.strictEqual(d.projects.length, 1)
  assert.strictEqual(d.projects[0].repo, '/repo')
  assert.strictEqual(d.projects[0].name, 'repo')
  assert.deepStrictEqual(
    d.projects[0].groups.map((g) => [g.branch, g.sessions[0].prompts[0].text]),
    [
      ['main', 'spec it'],
      ['feat/foo', 'build it'],
    ],
  )
})

test('a vanished cwd is counted under its session\'s repo, with one note', async () => {
  const root = tmpRoot()
  session(root, 's1', [
    { timestamp: '2026-11-11T11:00:00Z', content: 'start' },
    { timestamp: '2026-11-11T12:00:00Z', cwd: '/gone/wt-a', gitBranch: 'feat/a', content: 'in a' },
    { timestamp: '2026-11-11T13:00:00Z', cwd: '/gone/wt-b', gitBranch: 'feat/b', content: 'in b' },
  ])
  const d = await digest(root)
  assert.strictEqual(d.projects.length, 1)
  assert.deepStrictEqual(d.projects[0].groups.map((g) => g.branch), ['main', 'feat/a', 'feat/b'])
  assert.strictEqual(d.notes.length, 1)
  assert.match(d.notes[0], /^2 working directories no longer exist/)
})

test('a vanished cwd with nothing to fold into is its own project, said as cannot-tell', async () => {
  const root = tmpRoot()
  session(root, 's1', [{ timestamp: '2026-11-11T11:00:00Z', cwd: '/gone/lost', gitBranch: 'feat/x' }])
  const d = await digest(root)
  assert.strictEqual(d.projects[0].repo, null)
  assert.strictEqual(d.projects[0].git, false)
  assert.match(d.notes[0], /cannot tell: \/gone\/lost no longer exists/)
})

test('meta, sidechain and compaction entries never reach the digest', async () => {
  const root = tmpRoot()
  session(root, 's1', [
    { timestamp: '2026-11-11T11:00:00Z', content: 'kept' },
    { timestamp: '2026-11-11T11:01:00Z', isMeta: true, content: 'meta' },
    { timestamp: '2026-11-11T11:02:00Z', isSidechain: true, content: 'a subagent prompt' },
    { timestamp: '2026-11-11T11:03:00Z', isCompactSummary: true, content: 'This session is being continued…' },
    { timestamp: '2026-11-11T11:04:00Z', type: 'assistant', content: 'a reply' },
  ])
  const d = await digest(root)
  assert.deepStrictEqual(d.projects[0].groups[0].sessions[0].prompts.map((p) => p.text), ['kept'])
})

test('a long session keeps its first and last prompts and counts the middle', async () => {
  const root = tmpRoot()
  const entries = Array.from({ length: 10 }, (_, i) => ({
    timestamp: `2026-11-11T11:${String(i).padStart(2, '0')}:00Z`,
    content: `p${i}`,
  }))
  session(root, 's1', entries)
  const s = (await digest(root)).projects[0].groups[0].sessions[0]
  assert.deepStrictEqual(s.prompts.map((p) => p.text), ['p0', 'p1', 'p2', 'p7', 'p8', 'p9'])
  assert.strictEqual(s.omitted, 4)
})

test('a transcript last written before the window is not read', async () => {
  const root = tmpRoot()
  // Its entry claims to be inside the window, so only the mtime skip hides it.
  session(root, 's1', [{ timestamp: '2026-11-11T11:00:00Z' }], { mtime: new Date('2026-11-10T00:00:00Z') })
  assert.deepStrictEqual((await digest(root)).projects, [])
})

test('--here narrows to the repo it is run from', async () => {
  const root = tmpRoot()
  session(root, 's1', [{ timestamp: '2026-11-11T11:00:00Z' }])
  session(root, 's2', [{ timestamp: '2026-11-11T11:00:00Z', cwd: '/other' }])
  const d = await digest(root, { here: '/repo-wt/foo' })
  assert.deepStrictEqual(d.projects.map((p) => p.repo), ['/repo'])
})

test('a transcript whose entries carry no readable timestamp is cannot-tell, not a quiet day', async () => {
  const root = tmpRoot()
  session(root, 's1', [{ when: '2026-11-11T11:00:00Z' }])
  const d = await digest(root)
  assert.deepStrictEqual(d.projects, [])
  assert.match(d.notes[0], /cannot tell: 1 transcript\(s\) changed in the window but none carried a readable timestamp/)
})

// Stays silent: the healthy quiet day.
test('a day with no activity is an empty digest and says nothing', async () => {
  const root = tmpRoot()
  // A session that was written today, but whose prompts were all yesterday.
  session(root, 's1', [{ timestamp: '2026-11-10T11:00:00Z' }])
  const d = await digest(root)
  assert.deepStrictEqual(d.projects, [])
  assert.deepStrictEqual(d.notes, [])
})

test('a missing transcripts root is an empty digest, not a failure', async () => {
  const d = await digest(path.join(tmpRoot(), 'nope'))
  assert.deepStrictEqual(d, { window: { since: WINDOW.since.toISOString(), until: WINDOW.until.toISOString() }, projects: [], notes: [] })
})
