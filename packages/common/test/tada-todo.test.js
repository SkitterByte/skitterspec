'use strict'

/**
 * feat-spec-todo, phase 2: `skitterspec todo` — where each project was left
 * on the last day with activity, what is ahead, and what is in the way.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { activityTimes, lastActiveDay, leftOf, blockersFrom, readBlockers, buildTodo, formatTodo } = require('../src/tada/todo.js')
const { renderTadaPage } = require('../src/tada/page.js')
const { tadaQuery, readTadaQuery, recapKey, renderServedTada } = require('../src/tada/serve.js')

// Dates are built from parts, in local time, so the tests hold in any zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString()
const midnight = (y, m, d) => new Date(y, m - 1, d)
const MONDAY = midnight(2026, 11, 16)

// --- the day ----------------------------------------------------------------------

test('Monday morning reads Friday: the weekend had nothing', () => {
  const day = lastActiveDay([at(2026, 11, 13, 17), at(2026, 11, 12)], MONDAY)
  assert.strictEqual(day.getTime(), midnight(2026, 11, 13).getTime())
})

test('activity today does not count as where you left off', () => {
  assert.strictEqual(lastActiveDay([at(2026, 11, 16, 9)], MONDAY), null)
  const day = lastActiveDay([at(2026, 11, 16, 9), at(2026, 11, 14)], MONDAY)
  assert.strictEqual(day.getTime(), midnight(2026, 11, 14).getTime())
})

test('nothing in the last 14 days is no day at all', () => {
  assert.strictEqual(lastActiveDay([at(2026, 11, 1)], MONDAY), null)
  assert.strictEqual(lastActiveDay([], MONDAY), null)
  assert.ok(lastActiveDay([at(2026, 11, 2)], MONDAY), 'exactly 14 days back is still in')
})

// Stays silent: an unreadable instant is skipped, never read as a day.
test('a time it cannot parse is ignored', () => {
  assert.strictEqual(lastActiveDay(['not a date'], MONDAY), null)
})

test('activity is read from prompts, sessions, commits and moves', () => {
  const times = activityTimes({
    projects: [
      {
        groups: [
          {
            sessions: [{ start: 'a', end: 'b', prompts: [{ at: 'c' }] }],
            commits: [{ at: 'd' }],
            events: [{ at: 'e' }],
          },
        ],
      },
    ],
  })
  assert.deepStrictEqual(times.sort(), ['a', 'b', 'c', 'd', 'e'])
})

// --- where a spec was left ----------------------------------------------------------

test('a group is left at its latest move or commit', () => {
  const g = {
    events: [{ kind: 'phase-done', phase: 2, at: at(2026, 11, 13, 10) }],
    commits: [{ sha: 'abc', subject: 'feat: tidy', at: at(2026, 11, 13, 11) }],
  }
  assert.strictEqual(leftOf(g), 'abc feat: tidy')
  assert.strictEqual(leftOf({ ...g, events: [{ kind: 'phase-done', phase: 3, at: at(2026, 11, 13, 12) }] }), 'phase 3 done')
  assert.strictEqual(leftOf({ events: [], commits: [] }), null)
})

// --- blockers -----------------------------------------------------------------------

test('blockers are only the in-flight specs\' waiting passes and armed gates', () => {
  const out = blockersFrom({
    specs: ['feat-a', 'feat-b'],
    passes: [
      { spec: 'feat-a', code: '123456', verdict: 'commit', at: 'x' },
      { spec: 'feat-done', code: '999999', verdict: 'commit', at: 'x' },
    ],
    gates: { 'feat-b': { state: 'armed', gate: { phase: 2 } }, 'feat-a': { state: 'clear' } },
  })
  assert.deepStrictEqual(
    out.map((b) => [b.spec, b.kind]),
    [
      ['feat-a', 'verdict'],
      ['feat-b', 'gate'],
    ],
  )
})

// Stays silent: a gate it cannot read is not a gate armed.
test('an unknown gate state says nothing', () => {
  assert.deepStrictEqual(blockersFrom({ specs: ['feat-a'], gates: { 'feat-a': { state: 'unknown' } } }), [])
})

function reviewsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'todo-reviews-'))
}

test('the review store is read for its passes and gates', () => {
  const dir = reviewsDir()
  fs.writeFileSync(
    path.join(dir, 'feat-a.pending.json'),
    JSON.stringify({ version: 1, spec: 'feat-a', passes: [{ code: '123456', at: at(2026, 11, 13), blob: { verdict: 'commit' } }] }),
  )
  fs.writeFileSync(path.join(dir, 'feat-b.gate.json'), JSON.stringify({ version: 1, spec: 'feat-b', armed: true, phase: 3, log: [] }))
  const out = readBlockers(dir, ['feat-a', 'feat-b'], true)
  assert.deepStrictEqual(
    out.map((b) => [b.spec, b.kind, b.code || b.phase]),
    [
      ['feat-a', 'verdict', '123456'],
      ['feat-b', 'gate', 3],
    ],
  )
  assert.deepStrictEqual(readBlockers(dir, ['feat-b'], false), [], 'review.required: false opts the gate out')
})

// Stays silent: a repo that never rendered a review has nothing in its way.
test('no review store is no blockers', () => {
  assert.deepStrictEqual(readBlockers(path.join(reviewsDir(), 'absent'), ['feat-a'], true), [])
})

// Stays silent: a store that will not parse is not a gate.
test('an unreadable gate file is no blocker', () => {
  const dir = reviewsDir()
  fs.writeFileSync(path.join(dir, 'feat-a.gate.json'), '{ not json')
  assert.deepStrictEqual(readBlockers(dir, ['feat-a'], true), [])
})

// --- the to-do ----------------------------------------------------------------------

const inFlight = (spec, next = '/spec-next') => ({ spec, detail: 'in-progress · 1 of 2 phases done', next })

function day({ projects, notes = [] }) {
  return { window: {}, projects, notes }
}

const group = (over) => ({ spec: null, branch: null, sessions: [], commits: [], events: [], inFlight: null, ...over })

test('the to-do keeps open specs, names the finished ones, counts today and puts home first', () => {
  const leftOff = day({
    projects: [
      {
        repo: '/app',
        name: 'app',
        groups: [
          group({
            spec: 'feat-open',
            commits: [{ sha: 'abc', subject: 'feat: half', at: at(2026, 11, 13) }],
            sessions: [{ prompts: [{ at: at(2026, 11, 13), text: 'stop here for today' }] }],
            inFlight: inFlight('feat-open'),
          }),
          group({ spec: 'feat-done', events: [{ kind: 'completed', at: at(2026, 11, 13) }] }),
          group({ branch: 'main', commits: [{ sha: 'def', subject: '1.0.0', at: at(2026, 11, 13) }] }),
        ],
      },
    ],
  })
  const today = day({
    projects: [{ repo: '/home', name: 'home', here: true, groups: [group({ spec: 'feat-mine', commits: [{ sha: 'x', at: at(2026, 11, 16) }], inFlight: inFlight('feat-mine') })] }],
  })
  const asked = []
  const todo = buildTodo({
    leftOff,
    leftOffDay: midnight(2026, 11, 13),
    today,
    blockersFor: (repo, specs) => {
      asked.push([repo, specs])
      return []
    },
  })
  assert.deepStrictEqual(todo.projects.map((p) => [p.name, p.here]), [
    ['home', true],
    ['app', false],
  ])
  const app = todo.projects[1]
  assert.deepStrictEqual(app.groups.map((g) => [g.spec, g.left, g.prompt]), [['feat-open', 'abc feat: half', 'stop here for today']])
  assert.deepStrictEqual(app.finished, ['feat-done'])
  assert.deepStrictEqual(todo.projects[0].today, { commits: 1, moves: 0 })
  assert.deepStrictEqual(asked.sort(), [
    ['/app', ['feat-open']],
    ['/home', ['feat-mine']],
  ])
  assert.strictEqual(todo.leftOff.day, '2026-11-13')
})

test('the home project is listed with its open specs even when nothing happened there', () => {
  const todo = buildTodo({
    leftOff: null,
    leftOffDay: null,
    today: day({ projects: [] }),
    home: { repo: '/home', name: 'home', groups: [{ spec: 'feat-mine', inFlight: inFlight('feat-mine') }] },
  })
  assert.deepStrictEqual(todo.projects.map((p) => [p.name, p.here, p.groups.map((g) => g.spec)]), [['home', true, ['feat-mine']]])
  assert.strictEqual(todo.leftOff, null)
})

test('the text: left, the last prompt, in flight, finished, blocked and today', () => {
  const text = formatTodo(
    {
      leftOff: { day: '2026-11-13', label: 'Friday 13 November 2026' },
      todayLabel: 'Monday 16 November 2026',
      lookbackDays: 14,
      projects: [
        {
          repo: '/home',
          name: 'home',
          here: true,
          groups: [{ spec: 'feat-mine', ticket: { id: '#7' }, left: 'phase 1 done', prompt: 'stop here', inFlight: inFlight('feat-mine') }],
          finished: ['feat-done'],
          blocked: [{ spec: 'feat-mine', kind: 'gate', phase: 1 }],
          today: { commits: 2, moves: 1 },
        },
      ],
      notes: [],
    },
    new Date(),
  )
  assert.strictEqual(
    text,
    [
      'todo: left off Friday 13 November 2026 · today Monday 16 November 2026',
      '',
      'home (here)  (/home)',
      '  feat-mine [#7]',
      '    left: phase 1 done',
      '    - stop here',
      '    in flight: in-progress · 1 of 2 phases done · next: /spec-next',
      '  finished: feat-done',
      '  blocked: feat-mine — gate armed, phase 1: a verdict is owed',
      '  today: 2 commits, 1 move',
      '',
    ].join('\n'),
  )
})

test('a fortnight of nothing says so', () => {
  const text = formatTodo({ leftOff: null, todayLabel: 'Monday 16 November 2026', lookbackDays: 14, projects: [], notes: [] })
  assert.match(text, /^todo: nothing in the last 14 days · today Monday 16 November 2026\n {2}nothing in flight\.\n$/)
})

// --- the page and its route -----------------------------------------------------------

test('the page renders a to-do: left, finished, blocked and today', () => {
  const html = renderTadaPage(
    {
      kind: 'todo',
      projects: [
        {
          repo: '/home',
          name: 'home',
          here: true,
          groups: [{ spec: 'feat-mine', left: 'phase 1 done', prompt: 'stop <here>', inFlight: inFlight('feat-mine') }],
          finished: ['feat-done'],
          blocked: [{ spec: 'feat-mine', kind: 'verdict', verdict: 'commit', code: '123456', at: null }],
          today: { commits: 1, moves: 0 },
        },
      ],
      notes: [],
    },
    { title: 'To-do · Monday 16 November 2026' },
  )
  assert.match(html, /<p>left: phase 1 done<\/p>/)
  assert.match(html, /stop &lt;here&gt;/)
  assert.match(html, /finished: feat-done/)
  assert.match(html, /blocked: feat-mine — commit verdict waiting \(123456\)/)
  assert.match(html, /today so far: 1 commit, 0 moves/)
})

test('the served route asks for the to-do and titles it so', async () => {
  assert.strictEqual(tadaQuery({ todo: true, on: '2026-11-16' }), '?todo=1&on=2026-11-16')
  const ask = readTadaQuery('todo=1&on=2026-11-16', new Date(2026, 10, 16, 9))
  assert.strictEqual(ask.todo, true)
  assert.match(recapKey(ask), /^todo-2026-11-16/)
  let asked = null
  const out = await renderServedTada({
    dir: '/x',
    stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'todo-state-')),
    search: 'todo=1&on=2026-11-16',
    now: new Date(2026, 10, 16, 9),
    run: async ({ ask: a }) => {
      asked = a
      return { digest: { kind: 'todo', projects: [], notes: [] } }
    },
  })
  assert.strictEqual(asked.todo, true)
  assert.match(out.html, /<h1>To-do · Monday 16 November 2026<\/h1>/)
  assert.match(out.html, /Nothing in flight\./)
})
