'use strict'

// Never-together pairs: members whose `Area:` patterns name a common file. The
// worked example's three sets — workouts.generator.ts, flexible-template.ts and
// plan-parser.ts — are rebuilt from the Area: lines its members carry.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { epicStatus, indexSpecTree, parseArea, patternsMeet, memberCheck } = require('../src/env/epic.js')

const EPIC = 'epic-library-and-sessions'
const API = 'packages/api/src/modules'

const overview = (area, epic = EPIC) =>
  ['# A spec', '', epic ? `> **Epic:** ${epic}` : null, area ? `> **Area:** ${area}` : null, ''].filter((l) => l !== null).join('\n')

const MEMBERS = {
  'feat-one-off-workouts': `${API}/workouts/workouts.generator.ts, apps/web/src/lib/fresh/ (new)`,
  'feat-free-authoring-safety': `${API}/workouts/workouts.generator.ts, ${API}/training-plans/plan-parser.ts, ${API}/exercise-library/composition.ts`,
  'feat-session-recipes': `${API}/workouts/workouts.generator.ts, ${API}/training-plans/{plan-parser,recipes}.ts`,
  'feat-interval-ceilings': `${API}/training-plans/{flexible-template,plan-parser}.ts`,
  'feat-distance-prescriptions': `${API}/training-plans/flexible-template.ts, apps/web/src/lib/targets/format-target.ts`,
  'feat-library-enrichment': 'packages/api/prisma/seed-data/, apps/web/src/routes/exercises/',
}

function run(files, worktrees = []) {
  const readFile = (p) => (p in files ? files[p] : null)
  const candidates = Object.keys(files).filter((p) => p.endsWith('/00-overview.md'))
  return epicStatus({ epic: EPIC, index: indexSpecTree(Object.keys(files).join('\n')), readFile, candidates, worktrees })
}

const plan = () =>
  Object.fromEntries(Object.entries(MEMBERS).map(([spec, area]) => [`specs/backlog/${spec}/00-overview.md`, overview(area)]))

const pairs = (s) => s.clashes.map((c) => `${c.specs.join(' ‖ ')}: ${c.paths.join(', ')}`)

test('parseArea: brace-expanded, annotations and prose dropped, deduplicated', () => {
  assert.deepStrictEqual(
    parseArea(
      'packages/common/src/{cli.js,env/resolve.js}, packages/{github,linear}/src/, skills (spec, spec-start), ' +
        'apps/web/android/** (deep link), packages/common/src/cli.js (`bareLive`), resolve-targets.ts',
    ),
    [
      'packages/common/src/cli.js',
      'packages/common/src/env/resolve.js',
      'packages/github/src/',
      'packages/linear/src/',
      'apps/web/android/**',
      'resolve-targets.ts',
    ],
  )
  assert.deepStrictEqual(parseArea(null), [])
})

test('patternsMeet: directories hold what is under them; siblings do not meet', () => {
  assert.strictEqual(patternsMeet('packages/api/', 'packages/api/src/x.ts'), true)
  assert.strictEqual(patternsMeet('packages/api', 'packages/api/src/x.ts'), true)
  assert.strictEqual(patternsMeet('apps/web/**', 'apps/web/src/a.ts'), true)
  assert.strictEqual(patternsMeet('a/*.ts', 'a/b.ts'), true)
  assert.strictEqual(patternsMeet('plan-parser.ts', 'packages/api/src/plan-parser.ts'), true)
  assert.strictEqual(patternsMeet('packages/a/x.ts', 'packages/a/y.ts'), false)
  assert.strictEqual(patternsMeet('a/b', 'a/bc'), false)
  assert.strictEqual(patternsMeet('a/*.ts', 'a/b.js'), false)
})

test('the worked example: its three never-together sets, pair by pair', () => {
  assert.deepStrictEqual(pairs(run(plan())), [
    `feat-distance-prescriptions ‖ feat-interval-ceilings: ${API}/training-plans/flexible-template.ts`,
    `feat-free-authoring-safety ‖ feat-interval-ceilings: ${API}/training-plans/plan-parser.ts`,
    `feat-free-authoring-safety ‖ feat-one-off-workouts: ${API}/workouts/workouts.generator.ts`,
    `feat-free-authoring-safety ‖ feat-session-recipes: ${API}/training-plans/plan-parser.ts, ${API}/workouts/workouts.generator.ts`,
    `feat-interval-ceilings ‖ feat-session-recipes: ${API}/training-plans/plan-parser.ts`,
    `feat-one-off-workouts ‖ feat-session-recipes: ${API}/workouts/workouts.generator.ts`,
  ])
})

// STAYS-SILENT: no readable Area: is a cannot-tell, and claims no clash.
test('a member with no Area:, or only prose in it, clashes with nothing', () => {
  const s = run({
    'specs/backlog/feat-a/00-overview.md': overview(null),
    'specs/backlog/feat-b/00-overview.md': overview('the generator, mostly'),
    'specs/backlog/feat-c/00-overview.md': overview(`${API}/workouts/workouts.generator.ts`),
  })
  assert.deepStrictEqual(s.clashes, [])
})

test('a finished member is never-together with nothing', () => {
  const files = plan()
  delete files['specs/backlog/feat-one-off-workouts/00-overview.md']
  files['specs/complete/feat-one-off-workouts/00-overview.md'] = overview(MEMBERS['feat-one-off-workouts'])
  assert.ok(!pairs(run(files)).some((p) => p.includes('feat-one-off-workouts')))
})

test('memberCheck warns only about a clashing member that is in flight', () => {
  const idle = run(plan())
  assert.deepStrictEqual(memberCheck(idle, 'feat-session-recipes').warnings, [])

  const flying = run(plan(), [
    { folder: 'feat-free-authoring-safety', bucket: 'in-progress', overview: overview(MEMBERS['feat-free-authoring-safety']) },
  ])
  const { warnings } = memberCheck(flying, 'feat-session-recipes')
  assert.deepStrictEqual(warnings.map((w) => w.with), ['feat-free-authoring-safety'])
  assert.match(warnings[0].message, /feat-free-authoring-safety is in flight and edits .*plan-parser\.ts/)
  // A member with no shared path hears nothing, in flight or not.
  assert.deepStrictEqual(memberCheck(flying, 'feat-library-enrichment').warnings, [])
})

test('skitterspec epic check: silent for a non-member and a clear member', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-check-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' }).toString()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.invalid')
  git('config', 'user.name', 'T')
  const files = { ...plan(), 'specs/backlog/feat-loner/00-overview.md': overview('src/x.ts', null) }
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  git('add', '-A')
  git('commit', '-q', '-m', 'plan')

  const bin = path.join(__dirname, '..', 'bin', 'skitterspec.js')
  const check = (...args) => execFileSync('node', [bin, 'epic', 'check', ...args, '--dir', dir]).toString()
  assert.strictEqual(check('feat-loner'), '')
  assert.strictEqual(check('feat-session-recipes'), '', 'nothing is in flight, so nothing to say')
  assert.deepStrictEqual(JSON.parse(check('feat-session-recipes', '--json')), {
    spec: 'feat-session-recipes',
    epic: EPIC,
    phase: null,
    warnings: [],
    blocked: false,
  })
  assert.deepStrictEqual(JSON.parse(check('feat-loner', '--json')).epic, null)
})

test('/spec-start relays epic check once and never refuses on it', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', 'spec-start', 'SKILL.md'), 'utf8')
  assert.match(skill, /## 4c\. Ask the spec's epic/)
  assert.match(skill, /skitterspec epic check <name> --json/)
  assert.match(skill, /\*\*This check warns and never refuses\.\*\*/)
})
