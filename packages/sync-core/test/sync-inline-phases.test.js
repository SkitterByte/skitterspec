'use strict'

// `mapping.phases: 'inline'` — a spec pushes as ONE issue whose description
// carries every phase, and mints no new sub-issues.
//
// For work nobody will pick up phase by phase. Phases became sub-issues so that
// parallel agents could be assigned one each; 250 finished specs are 250 issues
// worth reading and 669 sub-issues worth nobody's attention. The mode is per
// bucket precisely so one repo can have both.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { normalizeLocal, phasesWithheld } = require('../src/normalize.js')
const { push } = require('../src/push.js')
const { neutralConfig } = require('./_config.js')

function config(phases, tasks = 'checklist') {
  const c = neutralConfig()
  c.mapping = { ...c.mapping, phases, tasks }
  return c
}

// A two-phase spec in `bucket`. `ids` stamps a phase's `linear_issue_id`, i.e.
// marks it already mirrored.
function specTree(bucket, ids = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-'))
  const dir = path.join(root, 'specs', bucket, 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, '00-overview.md'),
    '# Demo\n\n## Problem\n\nBody prose.\n\n## Phases\n\n' +
      '| # | Phase | Status | File |\n|---|-------|--------|------|\n' +
      '| 1 | Outbox | ✅ | [01-outbox.md](01-outbox.md) |\n' +
      '| 2 | Api | ✅ | [02-api.md](02-api.md) |\n',
  )
  const bodies = {
    '01-outbox': '**Goal:** drain the outbox.\n\n## Tasks\n\n- [x] Write the drain loop\n- [x] Cover it\n\n## Notes\n\nWatch the retry budget.\n',
    '02-api': '**Goal:** expose it.\n\n## Tasks\n\n- [x] Add the route\n',
  }
  for (const [file, name] of [['01-outbox', 'Outbox'], ['02-api', 'Api']]) {
    const fm = ids[file] ? `---\nlinear_issue_id: "${ids[file]}"\n---\n\n` : ''
    fs.writeFileSync(path.join(dir, `${file}.md`), `${fm}# Phase — ${name} ✅\n\n${bodies[file]}`)
  }
  return { root, dir }
}

test('inline projects one issue with every phase in its description, and no sub-issues', () => {
  const { dir } = specTree('complete')
  const local = normalizeLocal(dir, config('inline'))

  assert.deepStrictEqual(local.subIssues, [], 'nothing minted')
  assert.match(local.description, /### Phase — Outbox ✅/)
  assert.match(local.description, /### Phase — Api ✅/)
  for (const task of ['Write the drain loop', 'Cover it', 'Add the route']) {
    assert.match(local.description, new RegExp(task), `${task} is in the description`)
  }
  assert.match(local.description, /Watch the retry budget/, 'prose beyond the tasks too')
})

test('inline reports nothing withheld — the phases are present, just not as objects', () => {
  // `phasesWithheld` feeds the CLI's "N phases deferred" line. Counting inlined
  // phases there would report the opposite of what happened.
  const { root, dir } = specTree('complete')
  assert.strictEqual(phasesWithheld(dir, config('inline')), 0)
  const plan = push({ dir: root, snapshotDir: dir, identifier: 'ENG-1', config: config('inline') }).plan
  assert.strictEqual(plan.subIssues.create.length, 0, 'one call, not three')
  assert.ok(plan.issue, 'the spec issue still pushes')
  assert.strictEqual(plan.phasesDeferred, undefined, 'nothing is being held back')
})

test('inline keeps the Phases index; subissue still strips it', () => {
  // With no sub-issues the index is the only table of contents there is.
  const { dir } = specTree('complete')
  assert.match(normalizeLocal(dir, config('inline')).description, /## Phases/)
  assert.doesNotMatch(normalizeLocal(dir, config('subissue')).description, /## Phases/)
})

test('an already-linked phase keeps its sub-issue and is NOT also inlined', () => {
  // One-way sync has no delete: withholding a live sub-issue would freeze it in
  // the tracker, not remove it. So switching to `inline` is non-destructive —
  // and the phase must appear in exactly one place, never both.
  const { dir } = specTree('complete', { '01-outbox': 'ENG-9' })
  const local = normalizeLocal(dir, config('inline'))

  assert.strictEqual(local.subIssues.length, 1)
  assert.strictEqual(local.subIssues[0].id, 'ENG-9')
  assert.doesNotMatch(local.description, /### Phase — Outbox/, 'its sub-issue carries it')
  assert.doesNotMatch(local.description, /Write the drain loop/, 'and its tasks with it')
  assert.match(local.description, /### Phase — Api ✅/, 'the unlinked one still inlines')
})

test('one repo, both shapes: complete inlines while backlog mints sub-issues', () => {
  // The reporter's repo exactly — 250 finished specs and 29 live ones, which no
  // scalar can express.
  const cfg = config({ backlog: 'subissue', complete: 'inline' })

  const { dir: done } = specTree('complete')
  assert.deepStrictEqual(normalizeLocal(done, cfg).subIssues, [])
  assert.match(normalizeLocal(done, cfg).description, /### Phase — Outbox ✅/)

  const { dir: live } = specTree('backlog')
  assert.strictEqual(normalizeLocal(live, cfg).subIssues.length, 2, 'still assignable')
  assert.doesNotMatch(normalizeLocal(live, cfg).description, /### Phase — Outbox/)
})

test('the inlined body is subIssueBody\'s, demoted — one composer, one fidelity guarantee', () => {
  // The whole reason `inline` reuses the sub-issue composer: a second extractor
  // is what dropped content last time. The bodies must differ ONLY by heading
  // depth, so `inline` inherits every fidelity fix the sub-issue form gets.
  const { dir } = specTree('complete')
  const inlineDesc = normalizeLocal(dir, config('inline')).description
  const asSubIssue = normalizeLocal(dir, config('subissue')).subIssues

  for (const sub of asSubIssue) {
    // The sub-issue's `name` is the h1 minus its emoji; the inline heading is the
    // h1 as written, emoji and all, because inlined there is no `state` field to
    // carry it.
    const section = inlineDesc.split(/^### /m).find((s) => s.startsWith(`${sub.name} `))
    assert.ok(section, `${sub.name} has an inline section`)
    const body = section.split('\n').slice(1).join('\n').trim()
    assert.strictEqual(body, sub.goal.replace(/^## /gm, '#### '), `${sub.name}: same bytes, deeper headings`)
  }
})

test('inline demotes headings so a phase cannot break out of its own section', () => {
  // An undemoted `## Tasks` reads as a sibling of `## Problem`, which drags every
  // following phase under it in the outline.
  const { dir } = specTree('complete')
  const desc = normalizeLocal(dir, config('inline')).description
  const afterFirstPhase = desc.slice(desc.indexOf('### Phase — Outbox'))
  assert.doesNotMatch(afterFirstPhase, /^## \w/m, 'no h2 reappears once the phases start')
  assert.match(desc, /#### Tasks/)
})

test('demotion stops at h6 and leaves fenced content alone', () => {
  const { root, dir } = specTree('complete')
  fs.writeFileSync(
    path.join(dir, '01-outbox.md'),
    '# Phase — Outbox ✅\n\n**Goal:** g.\n\n##### Deep\n\ntext\n\n```md\n## not a heading\n```\n',
  )
  const desc = normalizeLocal(dir, config('inline')).description
  assert.match(desc, /^###### Deep$/m, 'h5 + 2 clamps to h6 rather than emitting seven hashes')
  assert.match(desc, /^## not a heading$/m, 'fenced sample text is content, not structure')
  assert.ok(root)
})

test('inline with no phases at all leaves the description untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-empty-'))
  const dir = path.join(root, 'specs', 'complete', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, '00-overview.md'), '# Demo\n\n## Problem\n\nJust prose.\n')
  const local = normalizeLocal(dir, config('inline'))
  assert.deepStrictEqual(local.subIssues, [])
  assert.strictEqual(local.description, '# Demo\n\n## Problem\n\nJust prose.')
})
