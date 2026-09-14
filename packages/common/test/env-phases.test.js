'use strict'

/**
 * Can the engine say whether a spec has a phase left to build?
 *
 * The review page had no idea, so it offered `✓ Commit & Continue` on a
 * COMPLETED spec with nought files and nothing to review. One question answers
 * that and the last-phase case together: is there a phase `/spec-next` would
 * act on? It builds the first unfinished one, so the answer is `done < total` —
 * and a spec mid-way through its final phase still has one, while a spec whose
 * phases are all done has none however long ago it finished.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { readPhases, phaseIsDone } = require('../src/env/resolve.js')
const { collectReview } = require('../src/env/review.js')

function specDir(phases, { bucket = 'in-progress', folder = 'feat-x', overview = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-phases-')))
  const dir = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(dir, { recursive: true })
  if (overview) fs.writeFileSync(path.join(dir, '00-overview.md'), '# X\n')
  phases.forEach((status, i) => {
    const n = String(i + 1).padStart(2, '0')
    const emoji = status === 'Done' ? '✅' : status === 'In progress' ? '🔄' : '⬜'
    fs.writeFileSync(
      path.join(dir, `${n}-phase.md`),
      `# Phase ${i + 1} — a phase ${emoji}\n\n> Spec: [00-overview.md](00-overview.md) · **Status:** ${status}\n`,
    )
  })
  return { root, dir }
}

const drop = (root) => fs.rmSync(root, { recursive: true, force: true })

test('a spec mid-way through has a phase to build', () => {
  const { root, dir } = specDir(['Done', 'In progress', 'Not started'])
  try {
    assert.deepStrictEqual(readPhases(dir), { total: 3, done: 1, hasNextPhase: true })
  } finally {
    drop(root)
  }
})

// THE CASE THIS EXISTS FOR, twice over: the last phase just built, and a spec
// finished long ago. Both are "every phase done", and both must answer the same.
test('a spec with every phase done has none', () => {
  const { root, dir } = specDir(['Done', 'Done', 'Done'])
  try {
    assert.deepStrictEqual(readPhases(dir), { total: 3, done: 3, hasNextPhase: false })
  } finally {
    drop(root)
  }
})

// `/spec-next` builds the FIRST UNFINISHED phase, so a spec sitting half-way
// through its final phase still has one to build. "After this one" would have
// got this wrong and disabled a button that works.
test('mid-way through the LAST phase still counts as having one', () => {
  const { root, dir } = specDir(['Done', 'Done', 'In progress'])
  try {
    assert.strictEqual(readPhases(dir).hasNextPhase, true)
  } finally {
    drop(root)
  }
})

test('the status line wins over the heading emoji', () => {
  // Both are written by the lifecycle skills, but a hand edit far more often
  // leaves a stale emoji than stale prose — and the emoji is what an eye skips.
  assert.strictEqual(phaseIsDone('# Phase 1 — x ⬜\n\n> **Status:** Done\n'), true)
  assert.strictEqual(phaseIsDone('# Phase 1 — x ✅\n\n> **Status:** In progress\n'), false)
  // With no status line at all, the emoji is the fallback rather than nothing.
  assert.strictEqual(phaseIsDone('# Phase 1 — x ✅\n'), true)
  assert.strictEqual(phaseIsDone('# Phase 1 — x 🔄\n'), false)
})

// CANNOT TELL IS THE THIRD OUTCOME (`negative-checks.md` rules 1 and 4). Each of
// these is a healthy spec this reader simply cannot see the phases of, and
// answering "no phases" would disable a button that works.
test('stays silent: a layout it cannot read answers null, never false', () => {
  const { root, dir } = specDir([])
  try {
    assert.strictEqual(readPhases(dir), null, 'an overview with inline phases')
  } finally {
    drop(root)
  }
  assert.strictEqual(readPhases('/nowhere/at/all'), null, 'a folder it cannot see')

  const legacy = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-legacy-')))
  try {
    // A legacy bare `<name>.md` spec has no folder to list at all.
    fs.writeFileSync(path.join(legacy, 'feat-x.md'), '# X\n')
    assert.strictEqual(readPhases(path.join(legacy, 'feat-x.md')), null)
  } finally {
    drop(legacy)
  }
})

test('the overview is never counted as a phase', () => {
  const { root, dir } = specDir(['Done'])
  try {
    // `00-overview.md` matches the `NN-` shape and must be excluded by name.
    assert.strictEqual(readPhases(dir).total, 1)
  } finally {
    drop(root)
  }
})

// --- into the page data -----------------------------------------------------

const render = (worktreePath, folder = 'feat-x') =>
  collectReview({
    spec: { folder, branch: 'feat/x', worktreePath },
    git: () => '',
    mode: 'working',
    ref: 'HEAD',
    now: '2020-01-01T00:00:00.000Z',
  })

test('the render carries the phases, from the worktree', () => {
  const { root } = specDir(['Done', 'Not started'])
  try {
    assert.deepStrictEqual(render(root).phases, { total: 2, done: 1, hasNextPhase: true })
  } finally {
    drop(root)
  }
})

test('a spec in complete/ is found, since that is the case this is for', () => {
  const { root } = specDir(['Done', 'Done'], { bucket: 'complete' })
  try {
    assert.strictEqual(render(root).phases.hasNextPhase, false)
  } finally {
    drop(root)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). A render this cannot read phases
// for adds no key, so the page is byte-identical to before any of this existed.
test('stays silent: an unreadable spec adds no key to the page data', () => {
  const { root } = specDir([])
  try {
    assert.ok(!('phases' in render(root)), 'inline-phase layout adds nothing')
  } finally {
    drop(root)
  }
  const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-none-')))
  try {
    assert.ok(!('phases' in render(empty)), 'no spec folder at all adds nothing')
  } finally {
    drop(empty)
  }
})
