'use strict'

/**
 * The page's PR description, composed from the spec's own files.
 *
 * The review page opened on a file list: it knew the spec's name, its branch
 * and its totals, and nothing about what the change was FOR. A reviewer on a
 * phone met a filename and a diff with no statement of the problem it solves or
 * the surfaces it touches.
 *
 * The material already existed — `## Problem`, `## Impact`, and each phase's
 * goal and tasks — so the header is READ, never written. Nothing here passes
 * through the model, which is what keeps it free however large the review.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { readPhases, readOverview, parsePhase, phaseIsStarted } = require('../src/env/resolve.js')

const OVERVIEW = `# A spec

> **Type:** Feature

## Problem

The first paragraph.

The second one.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine | update | collectReview |
| Page | add | the header |

## Phases

| # | Phase | Status | File |
`

function tmpSpec(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-ctx-')))
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body)
  return dir
}
const drop = (d) => fs.rmSync(d, { recursive: true, force: true })

const phaseFile = (n, title, status, tasks) =>
  `# Phase ${n} — ${title} ${status === 'Done' ? '✅' : status === 'In progress' ? '🔄' : '⬜'}

> Spec: [00-overview.md](00-overview.md) · **Status:** ${status}

**Goal:** what this phase delivers, wrapped
across two lines.

## Tasks

${tasks}

## Notes

Something else entirely.
`

test('the overview yields its problem and its impact rows', () => {
  const dir = tmpSpec({ '00-overview.md': OVERVIEW })
  const ctx = readOverview(dir)
  assert.match(ctx.problem, /The first paragraph/)
  assert.match(ctx.problem, /The second one/, 'the whole section, not just the lead')
  assert.doesNotMatch(ctx.problem, /Impact/, 'and it stops at the next heading')
  assert.deepStrictEqual(ctx.impact.rows, [
    { surface: 'Engine', change: 'update', detail: 'collectReview' },
    { surface: 'Page', change: 'add', detail: 'the header' },
  ])
  drop(dir)
})

// A spec touching nothing external writes a sentence where the table goes, and
// that is a real answer rather than a missing one.
test('an impact section with prose instead of a table keeps the prose', () => {
  const dir = tmpSpec({
    '00-overview.md': '## Problem\n\nX.\n\n## Impact\n\n_No external surface changes — internal refactor only._\n',
  })
  const ctx = readOverview(dir)
  assert.strictEqual(ctx.impact.rows, undefined)
  assert.match(ctx.impact.prose, /No external surface changes/)
  drop(dir)
})

// A bug spec calls it Symptom. Same question, different heading.
test('a bug spec’s Symptom answers as its problem', () => {
  const dir = tmpSpec({ '00-overview.md': '## Symptom\n\nIt broke.\n' })
  assert.match(readOverview(dir).problem, /It broke/)
  drop(dir)
})

test('a phase yields its number, title, goal and tasks', () => {
  const parsed = parsePhase(phaseFile(2, 'The report ends in a choice', 'Done', '- [x] One\n- [ ] Two'), '02-x.md')
  assert.strictEqual(parsed.n, 2)
  assert.strictEqual(parsed.title, 'The report ends in a choice', 'without the Phase prefix or the emoji')
  assert.match(parsed.goal, /wrapped across two lines/, 'a wrapped goal is rejoined')
  assert.deepStrictEqual(parsed.tasks, [
    { done: true, text: 'One' },
    { done: false, text: 'Two' },
  ])
})

// THE BUG THIS CAUGHT. A task wraps with its continuation indented, and `$`
// under `/m` matches at every line end — so the obvious single regex truncated
// every wrapped task at its first line and looked right on the short ones.
test('a task wrapped across lines is kept whole', () => {
  const parsed = parsePhase(
    phaseFile(1, 'x', 'Done', '- [x] A task that runs on\n      past the first line\n      and the second'),
    '01-x.md',
  )
  assert.deepStrictEqual(parsed.tasks, [{ done: true, text: 'A task that runs on past the first line and the second' }])
})

test('the task list ends at the next heading, not at the end of the file', () => {
  const parsed = parsePhase(phaseFile(1, 'x', 'Done', '- [x] Only this'), '01-x.md')
  assert.strictEqual(parsed.tasks.length, 1, 'the Notes section is not a task')
})

test('the live phase is the one in progress', () => {
  const dir = tmpSpec({
    '00-overview.md': OVERVIEW,
    '01-a.md': phaseFile(1, 'First', 'Done', '- [x] done'),
    '02-b.md': phaseFile(2, 'Second', 'In progress', '- [ ] doing'),
    '03-c.md': phaseFile(3, 'Third', 'Not started', '- [ ] later'),
  })
  assert.strictEqual(readPhases(dir).live.title, 'Second')
  drop(dir)
})

// A goal shown beside a diff that predates it is worse than no goal at all, so
// with nothing in progress the last FINISHED phase is what this diff is about.
test('with nothing in progress the last done phase wins', () => {
  const dir = tmpSpec({
    '00-overview.md': OVERVIEW,
    '01-a.md': phaseFile(1, 'First', 'Done', '- [x] done'),
    '02-b.md': phaseFile(2, 'Second', 'Done', '- [x] done'),
    '03-c.md': phaseFile(3, 'Third', 'Not started', '- [ ] later'),
  })
  assert.strictEqual(readPhases(dir).live.title, 'Second', 'not the untouched third')
  drop(dir)
})

test('a spec with nothing started yet has no live phase', () => {
  const dir = tmpSpec({
    '00-overview.md': OVERVIEW,
    '01-a.md': phaseFile(1, 'First', 'Not started', '- [ ] later'),
  })
  assert.strictEqual(readPhases(dir).live, null, 'no phase is what this diff is about')
  drop(dir)
})

test('the status line wins over the heading emoji, as it does for done', () => {
  // A hand edit far more often leaves a stale emoji than stale prose, and the
  // emoji is the half a reader's eye skips.
  assert.strictEqual(phaseIsStarted('# Phase 1 — x ⬜\n\n> **Status:** In progress\n'), true)
  assert.strictEqual(phaseIsStarted('# Phase 1 — x 🔄\n\n> **Status:** Not started\n'), false)
  assert.strictEqual(phaseIsStarted('# Phase 1 — x 🔄\n'), true, 'and the emoji answers when there is no status')
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). A spec this cannot
// read is not a broken spec — the page rendered without a header before any of
// this existed, and must still.
test('stays silent: an unreadable spec yields null, never an empty shape', () => {
  const none = tmpSpec({ '00-overview.md': '# Just a title\n\nSome prose with no headings.\n' })
  assert.strictEqual(readOverview(none), null, 'no Problem and no Impact is nothing to say')
  drop(none)

  const missing = tmpSpec({ '01-a.md': phaseFile(1, 'x', 'Done', '- [x] y') })
  assert.strictEqual(readOverview(missing), null, 'no overview at all')
  drop(missing)

  const inline = tmpSpec({ '00-overview.md': OVERVIEW })
  assert.strictEqual(readPhases(inline), null, 'phases inline in the overview stay unreadable')
  drop(inline)
})

// The counts are what the Commit & Continue button reasons from, and that
// reasoning is tested elsewhere. Widening this reader must not have moved them.
test('stays silent: the counts answer exactly as they did', () => {
  const dir = tmpSpec({
    '00-overview.md': OVERVIEW,
    '01-a.md': phaseFile(1, 'First', 'Done', '- [x] done'),
    '02-b.md': phaseFile(2, 'Second', 'Not started', '- [ ] later'),
  })
  const p = readPhases(dir)
  assert.strictEqual(p.total, 2)
  assert.strictEqual(p.done, 1)
  assert.strictEqual(p.hasNextPhase, true)
  drop(dir)
})

// --- the tracker ticket, read off the overview's frontmatter -----------------
//
// The base is tracker-free: this knows nothing about Linear beyond the two key
// names a provider stamps. The url becomes an `href` on a page served over the
// network, which is why the scheme is checked here rather than trusted there.

const withFm = (fm) => `---\n${fm}\n---\n\n# Spec\n\n## Problem\n\nSomething.\n`

test('a linked spec yields its ticket id and url', () => {
  const dir = tmpSpec({
    '00-overview.md': withFm('linear_identifier: "SKS-285"\nlinear_url: "https://linear.app/x/issue/SKS-285/y"'),
  })
  assert.deepStrictEqual(readOverview(dir).ticket, {
    id: 'SKS-285',
    url: 'https://linear.app/x/issue/SKS-285/y',
  })
  drop(dir)
})

test('a ticket with no url keeps the id and drops the link', () => {
  const dir = tmpSpec({ '00-overview.md': withFm('linear_identifier: "SKS-285"') })
  assert.deepStrictEqual(readOverview(dir).ticket, { id: 'SKS-285', url: null })
  drop(dir)
})

test('a non-http url is refused, and the id survives it', () => {
  // The value comes out of a file someone edits and ends up in an `href`, so
  // `javascript:` there is script execution on a page served over the network.
  // Dropping the whole ticket would be the over-correction: the id is still a
  // true fact about this work.
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'JaVaScRiPt:x']) {
    const dir = tmpSpec({ '00-overview.md': withFm(`linear_identifier: "SKS-1"\nlinear_url: "${bad}"`) })
    assert.deepStrictEqual(readOverview(dir).ticket, { id: 'SKS-1', url: null }, bad)
    drop(dir)
  }
})

test('a ticket alone is enough to draw a header', () => {
  // A spec with neither Problem nor Impact used to yield null. It still has a
  // ticket worth naming in the title, so the ticket counts towards "is there
  // anything to say".
  const dir = tmpSpec({ '00-overview.md': '---\nlinear_identifier: "SKS-9"\n---\n\n# Spec\n' })
  assert.deepStrictEqual(readOverview(dir), { ticket: { id: 'SKS-9', url: null } })
  drop(dir)
})

test('STAYS SILENT: an unlinked spec has no ticket key at all', () => {
  // The ordinary state of a project with no tracker installed, and of any spec
  // before its first push. It must be indistinguishable from before this
  // existed, not an empty object the page then has to test for.
  const dir = tmpSpec({ '00-overview.md': '# Spec\n\n## Problem\n\nSomething.\n' })
  const ctx = readOverview(dir)
  assert.strictEqual('ticket' in ctx, false)
  assert.match(ctx.problem, /Something/, 'and the rest is untouched')
  drop(dir)
})
