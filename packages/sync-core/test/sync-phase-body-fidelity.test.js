'use strict'

/**
 * The fidelity invariant for a phase sub-issue's body: nothing a phase file says
 * may vanish from what we push.
 *
 * `buildDescription` projects the overview by SECTION, so the overview mirror is
 * lossless by construction. `subIssueBody` did the opposite — it RECONSTRUCTED a
 * body from two harvested fragments (the `**Goal:**` paragraph and the task
 * opener lines `findTaskBlocks` claimed) and discarded everything neither
 * fragment covered. The push still reported success, so the loss was silent.
 *
 * Reported from `ereqs` while mirroring 250 completed specs (2026-08-29). Three
 * faces, one cause:
 *
 *   1. a task marker outside `[ ]`/`[x]` — `[~]`, `[>]`, `[-]` — matched no
 *      task pattern, so the whole line was claimed by nothing;
 *   2. a table or fenced block nested under a task was a `BLOCK_BREAK`, so the
 *      continuation scan stopped and its lines were claimed by nothing (this is
 *      NOT the corruption `tables.js` fixes — that content never reaches the
 *      flattener at all);
 *   3. prose and whole sections outside the Goal paragraph and the task list
 *      were never harvested in the first place.
 *
 * `sync-task-coverage.test.js` guards the PARSER's claim of a task subtree. It
 * cannot see any of this: its `TASK_LINE` carries the same `[ xX]` assumption as
 * the parser, it skips fenced lines outright, and a coverage invariant over
 * blocks says nothing about what the projection then does with them. This file
 * is the companion guard, one level up — over the projected body.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal } = require('../src/normalize.js')
const { fenceMask } = require('../src/task-block.js')
const { neutralConfig } = require('./_config.js')

const withChecklist = () => {
  const c = neutralConfig()
  c.mapping = { ...(c.mapping || {}), tasks: 'checklist' }
  return c
}

// A one-phase spec whose phase file body is supplied verbatim.
function specDir(phaseBody, { file = '01-engine.md', name = 'Engine' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-fidelity-'))
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    ['# Spec', '', '## Phases', '', '| # | Phase | Status | File |', '|---|-------|--------|------|',
      `| 1 | ${name} | ⬜ | [${file}](${file}) |`, ''].join('\n'),
    'utf-8',
  )
  fs.writeFileSync(path.join(dir, file), phaseBody, 'utf-8')
  return dir
}

const bodyOf = (phaseBody) => normalizeLocal(specDir(phaseBody), withChecklist()).subIssues[0].goal

// Every face of the bug in one phase file, written the way a person would.
const PHASE = [
  '# Phase 1 — Engine ⬜',
  '',
  '**Goal:** make the engine work.',
  '',
  'The parser has to land before the CLI can use it.',
  '',
  '## Tasks',
  '',
  '- [x] Add the parser',
  '- [~] Wire the CLI',
  '- [ ] Document the auth header',
  '',
  '  | Header | Value |',
  '  |--------|-------|',
  '  | X-Extraction-Key | shared secret, from Key Vault |',
  '',
  '- [ ] Ship the example',
  '',
  '  ```js',
  "  const keep = 'me'",
  '  ```',
  '',
  '## Notes',
  '',
  'Rotate the key before deploying.',
  '',
].join('\n')

test('face 1 — a task marker outside [ ]/[x] survives, mark intact', () => {
  const body = bodyOf(PHASE)
  assert.match(body, /- \[~\] Wire the CLI/)
})

test('face 2a — a table nested under a task survives (flattened, not dropped)', () => {
  const body = bodyOf(PHASE)
  assert.match(body, /X-Extraction-Key/)
  assert.match(body, /shared secret, from Key Vault/)
})

test('face 2b — a fenced block nested under a task survives verbatim', () => {
  const body = bodyOf(PHASE)
  assert.match(body, /const keep = 'me'/)
})

test('face 3 — prose and sections outside Goal and Tasks survive', () => {
  const body = bodyOf(PHASE)
  assert.match(body, /The parser has to land before the CLI can use it\./)
  assert.match(body, /## Notes/)
  assert.match(body, /Rotate the key before deploying\./)
})

// --- the general invariant --------------------------------------------------

// Word tokens, in source order. Comparing TOKENS rather than lines is what makes
// this survive the projection's deliberate transforms — a hand-wrapped task
// collapses to one line, a nested table is re-emitted as a bullet list — while
// still catching any content that simply disappears.
const tokens = (text) => String(text).match(/[A-Za-z0-9][A-Za-z0-9'._-]*/g) || []

// The phase heading is projected as the sub-issue's `name` and its status emoji
// as `state`, so both are deliberately absent from the body. Everything else in
// the file is content and must survive.
const PROJECTED_ELSEWHERE = 1 // the `# Phase 1 — Engine ⬜` line

test('no phase-file content is dropped from the projected body', () => {
  const source = PHASE.split('\n').slice(PROJECTED_ELSEWHERE).join('\n')
  const got = new Set(tokens(bodyOf(PHASE)))
  const missing = tokens(source).filter((w) => !got.has(w))
  assert.deepEqual(missing, [], `phase-file words missing from the pushed body: ${missing.join(', ')}`)
})

// --- the same invariant, over the real corpus -------------------------------

// Token reconciliation is right for a fixture but wrong for the corpus: the
// projection deliberately rejoins hyphen-wrapped words and strips legacy
// `(KEY-123)` ids, both of which read as "missing" tokens. Section HEADINGS
// carry none of that ambiguity — they are copied or they are gone — and a
// dropped section is exactly how prose went missing, so they are what this
// checks at scale.
function phaseFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) phaseFiles(p, acc)
    else if (/^\d\d-.*\.md$/.test(name) && !name.startsWith('00-')) acc.push(p)
  }
  return acc
}

test("every section of every phase file in this repo's corpus reaches the body", (t) => {
  const specs = path.resolve(__dirname, '..', '..', '..', 'specs')
  if (!fs.existsSync(specs)) return t.skip('no specs/ corpus here (published package)')

  const config = withChecklist()
  const localOnly = new Set(config.sync.localOnlySections)
  const files = phaseFiles(specs)
  assert.ok(files.length > 20, `expected a real corpus, found ${files.length} phase files`)

  const failures = []
  for (const file of files) {
    const dir = specDir(fs.readFileSync(file, 'utf-8'))
    const body = normalizeLocal(dir, config).subIssues[0].goal || ''
    const source = fs.readFileSync(file, 'utf-8').split('\n')
    const inFence = fenceMask(source)
    for (let i = 0; i < source.length; i++) {
      if (inFence[i]) continue
      const m = /^##\s+(.*\S)\s*$/.exec(source[i])
      if (!m || localOnly.has(m[1].trim())) continue
      if (!body.includes(m[0])) failures.push(`${path.relative(specs, file)}:${i + 1} — ${m[0]}`)
    }
  }
  assert.deepEqual(failures, [], `phase-file sections missing from the pushed body:\n${failures.join('\n')}`)
})
