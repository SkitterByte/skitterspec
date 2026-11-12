'use strict'

/**
 * `skitterspec tada`, phase 3 — the text the skill reads, and the skill
 * itself shipping. The text is pinned whole: its markers (`*` a move, `+` a
 * commit, `-` a prompt) are what the skill is told to read, so a drift here is
 * a drift in what the recap can tell apart.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { formatTada } = require('../src/tada/format.js')

const WINDOW = { since: '2026-11-11T00:00:00.000Z', until: '2026-11-11T18:00:00.000Z' }

test('the text form: spec groups, branch groups, moves, commits, prompts, in flight, notes', () => {
  const digest = {
    window: WINDOW,
    projects: [
      {
        repo: '/code/app',
        name: 'app',
        git: true,
        skitterspec: true,
        groups: [
          {
            spec: 'feat-orders',
            branch: 'feat/orders',
            ticket: { id: '#12', url: null },
            sessions: [
              {
                id: 's1',
                start: '2026-11-11T09:00:00Z',
                end: '2026-11-11T11:00:00Z',
                prompts: [
                  { at: '2026-11-11T09:00:00Z', command: '/spec-next', text: '' },
                  { at: '2026-11-11T10:00:00Z', text: 'make the total round up' },
                ],
                omitted: 4,
              },
            ],
            commits: [{ sha: 'a1b2c3d4e', at: '2026-11-11T11:00:00Z', subject: 'feat(orders): totals', spec: 'feat-orders', branch: 'feat/orders', refs: [] }],
            events: [{ spec: 'feat-orders', kind: 'phase-done', phase: 2, sha: 'a1b2c3d4e', at: '2026-11-11T11:00:00Z' }],
            inFlight: { spec: 'feat-orders', detail: 'in-progress · 2 of 3 phases done', next: '/spec-next' },
          },
          {
            spec: null,
            branch: 'main',
            sessions: [],
            commits: [{ sha: 'f00ba4000', at: '2026-11-11T12:00:00Z', subject: 'chore: bump', spec: null, branch: 'main', refs: [] }],
            events: [],
            inFlight: null,
          },
        ],
      },
      { repo: null, name: 'notes', git: false, skitterspec: false, groups: [] },
    ],
    notes: ['2 working directories no longer exist (torn-down worktrees, usually) — counted under the repo their session started in, on the branch it recorded'],
  }
  assert.strictEqual(
    formatTada(digest),
    [
      'ta-da: 2026-11-11T00:00:00.000Z → 2026-11-11T18:00:00.000Z',
      '',
      'app  (/code/app)',
      '  feat-orders [#12]',
      '    * phase 2 done',
      '    + a1b2c3d4e feat(orders): totals',
      '    1 session:',
      '    - /spec-next',
      '    - make the total round up',
      '    … 4 more',
      '    in flight: in-progress · 2 of 3 phases done · next: /spec-next',
      '  main — no spec',
      '    + f00ba4000 chore: bump',
      '',
      'notes  (not a git repo)',
      '',
      '2 working directories no longer exist (torn-down worktrees, usually) — counted under the repo their session started in, on the branch it recorded',
      '',
    ].join('\n'),
  )
})

// Stays silent: the quiet day prints one line and no notes.
test('an empty window says so, and nothing else', () => {
  assert.strictEqual(
    formatTada({ window: WINDOW, projects: [], notes: [] }),
    'ta-da: 2026-11-11T00:00:00.000Z → 2026-11-11T18:00:00.000Z\n  nothing in this window.\n',
  )
})

test('spec-tada ships: init installs it, and it is model-invocable', () => {
  const { SKILLS } = require('../src/init.js')
  assert.ok(SKILLS.includes('spec-tada'), `init installs spec-tada (got ${SKILLS.join(', ')})`)
  const text = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', 'spec-tada', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(text.split('\n---\n')[0], /disable-model-invocation/, '"what did I do today" should reach it')
  assert.match(text, /skitterspec tada/)
  assert.doesNotMatch(text, /skitterspec tada[^\n]*--json/, 'the skill reads the text form')
})
