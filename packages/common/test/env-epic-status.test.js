'use strict'

// `epic status`: members' own headers turned into an order. The worked example
// is skitterload's `issue-library-and-sessions-plan` — seven specs, two lanes,
// four waves and one phase-level sync point — rebuilt here from nothing but the
// `Epic:` and `Waits on:` lines its members would carry. The sync point is
// phase to phase, as the field showed it had to be: #154's PHASE 2 waits on
// #159 phase 1, while #154 itself starts in wave 1.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { epicStatus, formatEpicStatus, parseWaitsOn, indexSpecTree } = require('../src/env/epic.js')
const syncCore = require('../../sync-core/src/normalize.js')

const EPIC = 'epic-library-and-sessions'

const overview = ({ epic = EPIC, waits = null, lanes = null } = {}) =>
  [
    '# A spec',
    '',
    epic ? `> **Epic:** ${epic}` : null,
    waits ? `> **Waits on:** ${waits}` : null,
    lanes ? `> **Lanes:** ${lanes}` : null,
    '',
    '## Problem',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')

const phase = (done, waits = null) =>
  `# Phase 1 — Thing ${done ? '✅' : '⬜'}\n\n> **Status:** ${done ? 'Done' : 'Not started'}\n${waits ? `> **Waits on:** ${waits}\n` : ''}`

// The base branch as a file map: path → text.
function plan({ safetyPhase1Done = false, oneOffPhase2Done = false } = {}) {
  return {
    [`specs/backlog/${EPIC}/00-overview.md`]: overview({ epic: null, lanes: 2 }),
    'specs/backlog/feat-free-authoring-safety/00-overview.md': overview(),
    'specs/backlog/feat-free-authoring-safety/01-guard.md': phase(safetyPhase1Done),
    'specs/backlog/feat-free-authoring-safety/02-log.md': phase(false),
    'specs/backlog/feat-one-off-workouts/00-overview.md': overview(),
    'specs/backlog/feat-one-off-workouts/01-builder.md': phase(false),
    'specs/backlog/feat-one-off-workouts/02-strength.md': phase(oneOffPhase2Done, 'feat-free-authoring-safety phase 1'),
    'specs/backlog/feat-exercise-library-curation/00-overview.md': overview({ waits: 'feat-free-authoring-safety' }),
    'specs/backlog/feat-library-enrichment/00-overview.md': overview({ waits: 'feat-exercise-library-curation' }),
    'specs/backlog/feat-interval-ceilings/00-overview.md': overview({ waits: 'feat-one-off-workouts' }),
    'specs/backlog/feat-session-recipes/00-overview.md': overview({
      waits: 'feat-library-enrichment, feat-one-off-workouts',
    }),
    'specs/backlog/feat-distance-prescriptions/00-overview.md': overview({ waits: 'feat-interval-ceilings' }),
  }
}

function run(files, { epic = EPIC, worktrees = [] } = {}) {
  const readFile = (p) => (p in files ? files[p] : null)
  const candidates = Object.keys(files).filter((p) => p.endsWith('/00-overview.md') && /\*\*Epic:\*\*/.test(files[p]))
  return epicStatus({ epic, index: indexSpecTree(Object.keys(files).join('\n')), readFile, candidates, worktrees })
}

const specs = (xs) => xs.map((x) => x.spec)

test('the skitterload plan: four waves, two lanes, one sync point', () => {
  const s = run(plan())
  assert.deepStrictEqual(s.waves, [
    ['feat-free-authoring-safety', 'feat-one-off-workouts'],
    ['feat-exercise-library-curation', 'feat-interval-ceilings'],
    ['feat-distance-prescriptions', 'feat-library-enrichment'],
    ['feat-session-recipes'],
  ])
  assert.ok(s.waves.every((w) => w.length <= s.lanes), 'no wave is wider than the lane cap')
  assert.deepStrictEqual(
    s.syncPoints.map((p) => [p.spec, p.phase, p.wait.raw, p.wait.state]),
    [['feat-one-off-workouts', 2, 'feat-free-authoring-safety phase 1', 'unmet']],
  )
  assert.strictEqual(s.members.length, 7)
  assert.strictEqual(s.lanes, 2)
  assert.strictEqual(s.freeLanes, 2)
  assert.deepStrictEqual(s.cycles, [])
})

test('ready now is what has every start wait met; the rest say what blocks them', () => {
  const s = run(plan())
  // A phase wait holds that phase, not the start: #154 is ready beside #159.
  assert.deepStrictEqual(specs(s.ready), ['feat-free-authoring-safety', 'feat-one-off-workouts'])
  const curation = s.blocked.find((b) => b.spec === 'feat-exercise-library-curation')
  assert.deepStrictEqual(curation.by.map((w) => w.why), ['feat-free-authoring-safety is backlog'])
  assert.deepStrictEqual(s.cannotTell, [])
})

test('the sync point reads met once that phase is done on the base branch', () => {
  const s = run(plan({ safetyPhase1Done: true }))
  assert.strictEqual(s.syncPoints[0].wait.state, 'met')
  assert.match(formatEpicStatus(s), /feat-one-off-workouts phase 2 after feat-free-authoring-safety phase 1 \(met — feat-free-authoring-safety phase 1 is done\)/)
})

test('a phase already done holds nothing, so it is no sync point', () => {
  assert.deepStrictEqual(run(plan({ oneOffPhase2Done: true })).syncPoints, [])
})

test('a start held on a phase is a sync point too, and shares the wave', () => {
  const s = run({
    'specs/backlog/feat-a/00-overview.md': overview(),
    'specs/backlog/feat-a/01-x.md': phase(false),
    'specs/backlog/feat-b/00-overview.md': overview({ waits: 'feat-a phase 1' }),
  })
  assert.deepStrictEqual(s.waves, [['feat-a', 'feat-b']])
  assert.deepStrictEqual(s.syncPoints.map((p) => [p.spec, p.phase, p.wait.state]), [['feat-b', null, 'unmet']])
  assert.deepStrictEqual(specs(s.blocked), ['feat-b'])
})

test('an in-flight member reports its phase waits from its own worktree copy', () => {
  const s = run(plan(), {
    worktrees: [
      {
        folder: 'feat-one-off-workouts',
        bucket: 'in-progress',
        overview: overview(),
        phases: [
          { n: 1, text: phase(true) },
          { n: 2, text: phase(false, 'feat-free-authoring-safety phase 1') },
        ],
      },
    ],
  })
  assert.deepStrictEqual(specs(s.inFlight), ['feat-one-off-workouts'])
  assert.deepStrictEqual(s.syncPoints.map((p) => [p.spec, p.phase, p.wait.state]), [['feat-one-off-workouts', 2, 'unmet']])
})

test('a member in flight is read from its own worktree, and takes a lane', () => {
  const s = run(plan(), {
    worktrees: [{ folder: 'feat-free-authoring-safety', bucket: 'in-progress', overview: overview() }],
  })
  assert.deepStrictEqual(specs(s.inFlight), ['feat-free-authoring-safety'])
  assert.deepStrictEqual(specs(s.ready), ['feat-one-off-workouts'])
  assert.strictEqual(s.freeLanes, 1)
})

test('a completed wait on the base branch is met', () => {
  const files = plan()
  delete files['specs/backlog/feat-free-authoring-safety/00-overview.md']
  delete files['specs/backlog/feat-free-authoring-safety/01-guard.md']
  delete files['specs/backlog/feat-free-authoring-safety/02-log.md']
  files['specs/complete/feat-free-authoring-safety/00-overview.md'] = overview()
  files['specs/complete/feat-free-authoring-safety/01-guard.md'] = phase(true)
  const s = run(files)
  assert.deepStrictEqual(s.complete, ['feat-free-authoring-safety'])
  assert.deepStrictEqual(specs(s.ready), ['feat-exercise-library-curation', 'feat-one-off-workouts'])
  assert.strictEqual(s.syncPoints[0].wait.state, 'met', 'a complete spec meets a wait on any of its phases')
})

test('a member authored on its own unlanded branch is found through its worktree', () => {
  const s = run(plan(), {
    worktrees: [{ folder: 'feat-web-fixtures', bucket: 'backlog', overview: overview({ waits: 'feat-one-off-workouts' }) }],
  })
  assert.ok(s.members.some((m) => m.spec === 'feat-web-fixtures'))
  assert.ok(s.waves[1].includes('feat-web-fixtures'))
})

test('a cycle is named, and nothing in or behind it is layered', () => {
  const s = run({
    'specs/backlog/feat-a/00-overview.md': overview({ waits: 'feat-b' }),
    'specs/backlog/feat-b/00-overview.md': overview({ waits: 'feat-a' }),
    'specs/backlog/feat-c/00-overview.md': overview({ waits: 'feat-a' }),
    'specs/backlog/feat-d/00-overview.md': overview(),
  })
  assert.strictEqual(s.cycles.length, 1)
  assert.deepStrictEqual([...new Set(s.cycles[0])].sort(), ['feat-a', 'feat-b'])
  assert.strictEqual(s.cycles[0][0], s.cycles[0][s.cycles[0].length - 1], 'the loop is closed')
  assert.deepStrictEqual(s.waves, [['feat-d']])
  assert.deepStrictEqual(s.unlayered.sort(), ['feat-a', 'feat-b', 'feat-c'])
  assert.match(formatEpicStatus(s), /cycle +feat-(a|b) → feat-(a|b) → feat-(a|b)/)
})

// A wait on a spec that is not on the base branch is cannot-tell — it may be
// on an unlanded branch. Never met, and never accused of blocking forever.
test('a wait on a spec not on the base branch is cannot-tell, never blocked', () => {
  const s = run({ 'specs/backlog/feat-a/00-overview.md': overview({ waits: 'feat-ghost' }) })
  assert.deepStrictEqual(specs(s.blocked), [])
  assert.deepStrictEqual(specs(s.ready), [])
  assert.deepStrictEqual(s.cannotTell, [
    { spec: 'feat-a', by: [{ spec: 'feat-ghost', phase: null, raw: 'feat-ghost', state: 'cannot-tell', why: 'feat-ghost is not on the base branch' }] },
  ])
})

test('a malformed wait and a missing phase are cannot-tell too', () => {
  const s = run({
    'specs/backlog/feat-x/00-overview.md': overview({ epic: null }),
    'specs/backlog/feat-a/00-overview.md': overview({ waits: 'when the loader is done' }),
    'specs/backlog/feat-b/00-overview.md': overview({ waits: 'feat-x phase 3' }),
  })
  assert.deepStrictEqual(specs(s.cannotTell), ['feat-a', 'feat-b'])
  assert.match(s.cannotTell[1].by[0].why, /no phase 3/)
})

test('a wait on a cancelled spec blocks, and says so', () => {
  const s = run({
    'specs/cancelled/feat-x/00-overview.md': overview({ epic: null }),
    'specs/backlog/feat-a/00-overview.md': overview({ waits: 'feat-x' }),
  })
  assert.deepStrictEqual(s.blocked[0].by.map((w) => w.why), ['feat-x was cancelled'])
})

// STAYS-SILENT: a healthy, unusual case — a member waiting on a finished spec
// that belongs to no epic. It is met, the member is ready, and the outside spec
// is neither a member nor a wave.
test('a met wait on a spec outside the epic: ready, and orders nothing', () => {
  const s = run({
    'specs/complete/feat-outside/00-overview.md': overview({ epic: null }),
    'specs/backlog/feat-a/00-overview.md': overview({ waits: 'feat-outside' }),
  })
  assert.deepStrictEqual(specs(s.ready), ['feat-a'])
  assert.deepStrictEqual(specs(s.blocked), [])
  assert.deepStrictEqual(specs(s.cannotTell), [])
  assert.deepStrictEqual(s.waves, [['feat-a']])
  assert.deepStrictEqual(specs(s.members), ['feat-a'])
})

test('specs naming another epic are not members', () => {
  const s = run({
    'specs/backlog/feat-a/00-overview.md': overview(),
    'specs/backlog/feat-b/00-overview.md': overview({ epic: 'epic-other' }),
  })
  assert.deepStrictEqual(specs(s.members), ['feat-a'])
})

test('no epic and no members says so in one line', () => {
  assert.strictEqual(formatEpicStatus(run({}, { epic: 'epic-nope' })), 'no epic named epic-nope, and no spec names it as its Epic.\n')
})

test('the base parser and sync-core parse Waits on to one answer', () => {
  for (const value of ['feat-a, feat-b phase 2', '`feat-a` phase 1', 'none', '—', 'the loader, feat-c', '']) {
    assert.deepStrictEqual(parseWaitsOn(value), syncCore.parseWaitsOn(value), value)
  }
})

// End to end: the CLI reads the base branch by git, not the working tree.
test('skitterspec epic status reads the base branch, not the checkout', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-cli-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' }).toString()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.invalid')
  git('config', 'user.name', 'T')
  for (const [file, text] of Object.entries(plan())) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  git('add', '-A')
  git('commit', '-q', '-m', 'plan')
  // An uncommitted edit in the checkout is not the base branch.
  fs.writeFileSync(path.join(dir, 'specs/backlog/feat-free-authoring-safety/01-guard.md'), phase(true))
  fs.writeFileSync(path.join(dir, 'specs/backlog/feat-exercise-library-curation/00-overview.md'), overview())

  const bin = path.join(__dirname, '..', 'bin', 'skitterspec.js')
  const out = JSON.parse(execFileSync('node', [bin, 'epic', 'status', EPIC, '--json', '--dir', dir]).toString())
  assert.strictEqual(out.base, 'main')
  assert.deepStrictEqual(specs(out.ready), ['feat-free-authoring-safety', 'feat-one-off-workouts'])
  assert.strictEqual(out.syncPoints[0].wait.state, 'unmet')
  assert.strictEqual(out.waves.length, 4)

  const human = execFileSync('node', [bin, 'epic', 'status', EPIC, '--dir', dir]).toString()
  assert.match(human, /^epic-library-and-sessions — 7 members · 2 lanes, 2 free/)
  assert.match(human, /^ {2}feat-free-authoring-safety +backlog · ready +\/spec-start feat-free-authoring-safety +—$/m)
  assert.match(human, /^ {2}sync points +feat-one-off-workouts phase 2 after feat-free-authoring-safety phase 1 \(not yet/m)
  // Plain text, readable raw under `watch`: no markdown table anywhere.
  assert.doesNotMatch(human, /\|/)
  // Every member carries its next action in the JSON as well.
  const row = out.rows.find((r) => r.spec === 'feat-session-recipes')
  assert.strictEqual(row.next.verb, 'blocked')
})
