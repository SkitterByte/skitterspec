'use strict'

/**
 * `/no-spec` — a branch with no spec document.
 *
 * WHAT THIS EXISTS FOR. A guard that refuses writes on the base branch is a
 * wall unless there is somewhere cheap to go, and mechanical work — a version
 * bump, a lockfile refresh, a rename — genuinely has no spec. Doing it in the
 * primary checkout leaves the base branch dirty for every in-flight spec to
 * replay over, and renders no page, so it is the one kind of change that
 * reaches the base branch unreviewed.
 *
 * THE WHOLE MECHANISM IS THE RECORD. `resolve.js` finds specs by scanning
 * `specs/**`, where a specless branch is not and never will be — so "no folder
 * for this name" is indistinguishable from a typo. The registry entry is the
 * positive signal that makes exactly one name resolvable
 * (`.claude/rules/negative-checks.md` rule 1), and most of what is asserted
 * below is that it neither over- nor under-reaches.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  recordSpecless,
  forgetSpecless,
  isSpecless,
  speclessNames,
} = require('../src/env/registry.js')
const { resolveSpec, resolveSpecless, allSpecs } = require('../src/env/resolve.js')
const { VERDICTS, COMMITTING, BUTTON_SETS } = require('../src/env/review.js')

const CONFIG = {
  registry: '.spec-env/registry.json',
  worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
  docker: { projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
  branch: { pattern: '{type}/{slug}' },
}

const tmpDir = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-specless-')))

// --- the registry key -------------------------------------------------------

test('a specless branch is recorded under its own key, never as a slot', () => {
  // A slot means a reserved port block, and every reader of `slots` takes an
  // entry there as "this spec runs a Docker stack". Sharing the map would make
  // /no-spec allocate ports it never binds.
  const reg = recordSpecless({ slots: {}, specless: {} }, 'bump-deps', { branch: 'chore/bump-deps' })
  assert.deepStrictEqual(reg.slots, {})
  assert.deepStrictEqual(reg.specless, { 'bump-deps': { branch: 'chore/bump-deps' } })
  assert.ok(isSpecless(reg, 'bump-deps'))
})

test('recording is idempotent and merges rather than replacing', () => {
  let reg = recordSpecless({ slots: {}, specless: {} }, 'a', { branch: 'chore/a' })
  reg = recordSpecless(reg, 'a', { type: 'chore' })
  assert.deepStrictEqual(reg.specless.a, { branch: 'chore/a', type: 'chore' })
})

test('forgetting is idempotent, so teardown need not look first', () => {
  const reg = recordSpecless({ slots: {}, specless: {} }, 'a', {})
  assert.deepStrictEqual(forgetSpecless(reg, 'a').specless, {})
  assert.deepStrictEqual(forgetSpecless(reg, 'missing').specless, { a: {} })
})

test('the slot helpers carry the specless map through rather than rebuilding it', () => {
  // Every helper returns a WHOLE registry, so one that forgets a key deletes it
  // on the next write — which would have made a /no-spec branch unresolvable
  // the moment any Docker spec was provisioned beside it.
  const reg = recordSpecless({ slots: {}, specless: {} }, 'bump', { branch: 'chore/bump' })
  assert.deepStrictEqual(allocateSlot(reg, 'feat-x').registry.specless, reg.specless)
  assert.deepStrictEqual(freeSlot(allocateSlot(reg, 'feat-x').registry, 'feat-x').specless, reg.specless)
})

test('speclessNames is sorted, so output does not depend on insertion order', () => {
  let reg = { slots: {}, specless: {} }
  for (const n of ['zed', 'alpha', 'mid']) reg = recordSpecless(reg, n, {})
  assert.deepStrictEqual(speclessNames(reg), ['alpha', 'mid', 'zed'])
})

// --- what it writes to disk -------------------------------------------------

test('a project that never ran /no-spec writes the registry it always wrote', () => {
  // STAYS SILENT (negative-checks rule 3): the new key must not appear in the
  // file of a project that has no specless branches, or every registry in every
  // repo changes on the next provision for no reason.
  const dir = tmpDir()
  writeRegistry(dir, CONFIG, { slots: { a: 0 }, specless: {} })
  const raw = JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'registry.json'), 'utf8'))
  assert.deepStrictEqual(raw, { slots: { a: 0 } })
  assert.ok(!('specless' in raw), 'the key is absent, not empty')
})

test('a recorded branch round-trips through the file', () => {
  const dir = tmpDir()
  writeRegistry(dir, CONFIG, recordSpecless({ slots: {}, specless: {} }, 'bump', { branch: 'chore/bump' }))
  assert.deepStrictEqual(readRegistry(dir, CONFIG), {
    slots: {},
    specless: { bump: { branch: 'chore/bump' } },
  })
})

test('a registry written before this key existed reads as no specless branches', () => {
  // STAYS SILENT: every registry on every machine predates this.
  const dir = tmpDir()
  const file = path.join(dir, '.spec-env', 'registry.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ slots: { 'feat-a': 0 } }) + '\n')
  assert.deepStrictEqual(readRegistry(dir, CONFIG), { slots: { 'feat-a': 0 }, specless: {} })
})

test('a non-object specless value is ignored rather than trusted', () => {
  const dir = tmpDir()
  const file = path.join(dir, '.spec-env', 'registry.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ slots: {}, specless: ['bump'] }) + '\n')
  assert.deepStrictEqual(readRegistry(dir, CONFIG).specless, {})
})

// --- resolution -------------------------------------------------------------

test('a specless name resolves to the same shape, with the document fields null', () => {
  const dir = tmpDir()
  const r = resolveSpecless('bump-deps', dir, CONFIG, { branch: 'chore/bump-deps' })
  assert.strictEqual(r.folder, 'bump-deps')
  assert.strictEqual(r.slug, 'bump-deps')
  assert.strictEqual(r.branch, 'chore/bump-deps')
  assert.strictEqual(r.specless, true)
  // Null rather than invented: there is no document to read them from, and a
  // plausible default would make a consumer believe it had read one.
  assert.strictEqual(r.bucket, null)
  assert.strictEqual(r.path, null)
  assert.strictEqual(r.baseRef, null)
  assert.ok(r.worktreePath.endsWith(path.join('-wt', 'bump-deps')))
})

test('the branch defaults to chore/<slug> and a recorded one wins', () => {
  const dir = tmpDir()
  assert.strictEqual(resolveSpecless('bump', dir, CONFIG, {}).branch, 'chore/bump')
  // The record is what the worktree was actually created against; re-deriving
  // it would go wrong the moment a project changed `branch.pattern`.
  assert.strictEqual(resolveSpecless('bump', dir, CONFIG, { branch: 'old/bump' }).branch, 'old/bump')
})

test('resolveSpec falls back only for a name the registry actually names', () => {
  const dir = tmpDir()
  const specless = { bump: { branch: 'chore/bump' } }
  assert.strictEqual(resolveSpec('bump', dir, CONFIG, { specless }).specless, true)
  // THE POINT: a typo must not become a specless branch. Absence of a folder is
  // not evidence — the registry naming it is.
  assert.throws(() => resolveSpec('bmup', dir, CONFIG, { specless }), /spec not found/)
})

test('STAYS SILENT: with no specless map, resolveSpec behaves exactly as before', () => {
  const dir = tmpDir()
  assert.throws(() => resolveSpec('anything', dir, CONFIG), /spec not found/)
  assert.throws(() => resolveSpec('anything', dir, CONFIG, { specless: {} }), /spec not found/)
})

test('a real spec resolves with specless false, stated rather than absent', () => {
  const dir = tmpDir()
  const specDir = path.join(dir, 'specs', 'backlog', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# T\n\n> **Stack:** worktree\n')
  const r = resolveSpec('feat-thing', dir, CONFIG, { specless: { 'feat-thing': {} } })
  assert.strictEqual(r.specless, false, 'a real folder wins over the record')
  assert.strictEqual(r.bucket, 'backlog')
})

// --- listing ----------------------------------------------------------------

test('allSpecs lists specless branches, which no folder scan could find', () => {
  const dir = tmpDir()
  const specDir = path.join(dir, 'specs', 'backlog', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# T\n\n> **Stack:** worktree\n')

  const listed = allSpecs(dir, CONFIG, [], { bump: { branch: 'chore/bump' } })
  assert.deepStrictEqual(
    listed.map((s) => [s.folder, s.specless]).sort(),
    [
      ['bump', true],
      ['feat-thing', false],
    ],
  )
})

test('STAYS SILENT: allSpecs with no specless argument lists exactly what it always did', () => {
  const dir = tmpDir()
  const specDir = path.join(dir, 'specs', 'backlog', 'feat-thing')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# T\n\n> **Stack:** worktree\n')
  assert.deepStrictEqual(
    allSpecs(dir, CONFIG, []).map((s) => s.folder),
    ['feat-thing'],
  )
})

// --- the verdict ------------------------------------------------------------

test('commit-land is a verdict, and it commits', () => {
  assert.ok(VERDICTS.includes('commit-land'))
  // ONE LIST, ONE REFUSAL: a committing verdict must be in COMMITTING or it
  // becomes a way around the single block this engine makes.
  assert.ok(COMMITTING.includes('commit-land'), 'an open comment must block it')
})

test('nospec is its own button set rather than a reuse of refresh', () => {
  assert.ok(BUTTON_SETS.includes('nospec'))
  // Reusing `refresh` would make plain `commit` mean "commit and stop" on one
  // page and "commit, land and destroy the worktree" on another. One of those
  // two readings removes a worktree, which is why the word had to be its own.
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'review', 'page.html'),
    'utf8',
  )
  assert.match(PAGE, /nospec: \['commit-land', 'commit', 'changes', 'discuss'\]/)
  assert.match(PAGE, /refresh: \['commit', 'changes', 'discuss'\]/)
})

test('the page names commit-land everywhere a verdict gets a reader-facing name', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'review', 'page.html'),
    'utf8',
  )
  assert.match(PAGE, /id="verdict-commit-land"/)
  assert.match(PAGE, /'commit-land': '✓ Commit & Land'/)
  // The title says the destructive part out loud: this is the only verdict that
  // removes a worktree, and a reader must not learn that from the outcome.
  assert.match(PAGE, /'commit-land': 'Commit this, fast-forward the base branch to it, and remove the worktree'/)
  // And the outcome log can name it, since a decision outlives its render.
  assert.match(PAGE, /'commit-land': 'committed, landed, and torn down'/)
})
