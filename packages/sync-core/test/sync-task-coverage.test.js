'use strict'

/**
 * The coverage invariant: nothing written inside a task's subtree may go
 * unclaimed by `findTaskBlocks`.
 *
 * Fixtures prove the shapes we thought of. This proves the ones we did not. The
 * bug it guards (bug-task-subtree-bullets-dropped) was invisible to every count
 * the engine reported — the parse succeeded, the block count looked plausible,
 * and the text was simply absent from the mirror. Only a whole-line reconciliation
 * catches that.
 *
 * `subtreeLines` below is derived from **indentation alone** and shares no code
 * with the parser, so it cannot inherit the parser's blind spot.
 *
 * This is a TEST-ONLY guarantee, deliberately. It is a property of the parser,
 * not of how anyone authors a spec, so it must never become a runtime warning —
 * `lintPhases` is the channel for spec-authoring problems, and adding a warning
 * users cannot act on would only train them to ignore the ones they can.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { findTaskBlocks, fenceMask } = require('../src/task-block.js')

// Any single-character mark, matching the parser. This read `[ xX]` and so
// inherited the exact blind spot it existed to catch: a `[~]` task opened no
// subtree here, and the lines under it were never required to be claimed
// (bug-phase-content-dropped). Fenced lines are still skipped, and that one IS
// deliberate — a fence is not a task subtree, and the projection now passes it
// through verbatim rather than harvesting it.
const TASK_LINE = /^([ \t]*)-\s*\[[^\]]\]\s/
const indentWidth = (l) => l.length - l.trimStart().length

// Every line index that lies inside some task's list subtree, computed from
// indentation only: a task opens a subtree at its own indent, any deeper
// non-blank line is inside it, and a line at or shallower than the task closes
// it. No dependency on findTaskBlocks — that independence is the whole point.
function subtreeLines(lines) {
  const inFence = fenceMask(lines)
  const inside = new Set()
  const open = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const indent = indentWidth(line)
    while (open.length && indent <= open[open.length - 1]) open.pop()
    if (inFence[i]) continue
    if (open.length) inside.add(i)
    if (TASK_LINE.test(line)) {
      inside.add(i)
      open.push(indent)
    }
  }
  return inside
}

function claimedLines(blocks) {
  const claimed = new Set()
  for (const b of blocks) for (let i = b.start; i < b.end; i++) claimed.add(i)
  return claimed
}

// The lines the invariant says belong to a task but no block claimed.
function unclaimed(lines, blocks) {
  const claimed = claimedLines(blocks)
  return [...subtreeLines(lines)].filter((i) => !claimed.has(i))
}

const REPORTED_SHAPE = [
  '- [ ] Parent task',
  '      - [x] Nested checkbox',
  '            wrapped continuation',
  '      - **Sibling note**',
  '        its own wrapped line',
]

test('the invariant has teeth — it catches the pre-fix behaviour', () => {
  // Dropping the non-checkbox blocks reproduces exactly what the parser did
  // before the fix, so this is the real regression, not a synthetic one.
  const preFix = findTaskBlocks(REPORTED_SHAPE).filter((b) => b.checkbox)
  assert.deepEqual(unclaimed(REPORTED_SHAPE, preFix), [3, 4])
})

test('the invariant holds for the reported shape', () => {
  assert.deepEqual(unclaimed(REPORTED_SHAPE, findTaskBlocks(REPORTED_SHAPE)), [])
})

// A real corpus, not just fixtures — 90+ hand-wrapped phase files written over
// months by people who were not thinking about the parser.
function phaseFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) phaseFiles(p, acc)
    else if (/^\d\d-.*\.md$/.test(name) && !name.startsWith('00-')) acc.push(p)
  }
  return acc
}

test("every phase file in this repo's spec corpus is fully claimed", (t) => {
  const specs = path.resolve(__dirname, '..', '..', '..', 'specs')
  if (!fs.existsSync(specs)) return t.skip('no specs/ corpus here (published package)')

  const files = phaseFiles(specs)
  assert.ok(files.length > 20, `expected a real corpus, found ${files.length} phase files`)

  const failures = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf-8').split('\n')
    const missing = unclaimed(lines, findTaskBlocks(lines))
    if (missing.length) {
      failures.push(`${path.relative(specs, file)}: ${missing.map((i) => `${i + 1}:${JSON.stringify(lines[i])}`).join(', ')}`)
    }
  }
  assert.deepEqual(failures, [], `phase files losing task content:\n${failures.join('\n')}`)
})
