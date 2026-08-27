'use strict'

// Adoption: a spec started from an existing Linear issue carries that issue's
// identifier from birth and has NO base sidecar. Those two facts together are
// what make the first push an UPDATE of the reporter's issue (plus a sub-issue
// per phase) rather than minting a second issue — the property these tests pin.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { stampSubIssueId } = require('@skitterbyte/skitterspec-sync-core')

const ADOPTED = 'SKI-123'

// A repo holding one spec. `identifier` null = never linked (a normal /spec);
// a string = adopted from that Linear issue.
function repoWithSpec({ identifier }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-adopt-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' }, intake: { label: 'web-app' } }), 'utf-8')

  const spec = path.join(dir, 'specs', 'in-progress', 'feat-adopted')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\nlinear_identifier: "${identifier}"\n---\n\n` : ''
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    fm + '# Adopted\n\n## Problem\n\nThe reporter said the export button does nothing.\n',
    'utf-8',
  )
  fs.writeFileSync(
    path.join(spec, '01-fix.md'),
    '# Phase 1 — Fix the export ⬜\n\n**Goal:** the button exports.\n',
    'utf-8',
  )
  return dir
}

function run(argv, cwd, { tty = false } = {}) {
  let text = ''
  const out = { write: (s) => (text += s), isTTY: tty }
  return specSync(argv, { cwd, out }).then(() => text)
}

test('an adopted spec pushes as an update to the existing issue, not a new one', async () => {
  const dir = repoWithSpec({ identifier: ADOPTED })
  const plan = JSON.parse(await run(['push', 'feat-adopted', '--json', '--skip-state-check'], dir))
  // `issue` present with no create marker = save_issue keyed by the stamped
  // identifier. The skill supplies the id; the engine supplies the content.
  assert.ok(plan.issue, 'the spec description is pushed over the reporter\'s')
  assert.match(plan.issue.description, /export button does nothing/)
  assert.strictEqual(plan.subIssues.create.length, 1, 'each phase becomes a sub-issue')
  // The engine strips the `Phase N — ` prefix; the sub-issue is named for the goal.
  assert.strictEqual(plan.subIssues.create[0].name, 'Fix the export')
})

test('adoption keys the snapshot by the Linear id, not the folder name', async () => {
  const dir = repoWithSpec({ identifier: ADOPTED })
  const text = await run(['record', 'feat-adopted'], dir)
  assert.match(text, new RegExp(`${ADOPTED}\\.base\\.json`), 'sidecar named for the adopted issue')
  assert.ok(fs.existsSync(path.join(dir, 'specs', '.core', 'linear-base', `${ADOPTED}.base.json`)))
})

test('an unadopted spec keys the snapshot by its folder name instead', async () => {
  const dir = repoWithSpec({ identifier: null })
  const text = await run(['record', 'feat-adopted'], dir)
  assert.match(text, /feat-adopted\.base\.json/)
})

test('no base sidecar on adoption — the first push is never empty', async () => {
  const dir = repoWithSpec({ identifier: ADOPTED })
  assert.ok(
    !fs.existsSync(path.join(dir, 'specs', '.core', 'linear-base', `${ADOPTED}.base.json`)),
    'adoption must not pre-record a snapshot',
  )
  const text = await run(['push', 'feat-adopted', '--skip-state-check'], dir, { tty: true })
  assert.doesNotMatch(text, /nothing to push/, 'the reporter\'s description gets overwritten')
  assert.match(text, new RegExp(`spec-sync push: ${ADOPTED}`), 'keyed by the adopted issue')
})

test('after that first push is applied and recorded, the next one is empty', async () => {
  const dir = repoWithSpec({ identifier: ADOPTED })
  // What /spec-push does after applying: stamp each created sub-issue's id back
  // into its phase file, THEN record. Without the stamp the phase stays unlinked
  // and is legitimately re-created every time.
  stampSubIssueId(path.join(dir, 'specs', 'in-progress', 'feat-adopted'), '01-fix.md', 'SKI-124')
  await run(['record', 'feat-adopted'], dir)
  const text = await run(['push', 'feat-adopted', '--skip-state-check'], dir, { tty: true })
  assert.match(text, /nothing to push/)
})

test('spec-sync linked reports the adopted issue, so it cannot be adopted twice', async () => {
  const dir = repoWithSpec({ identifier: ADOPTED })
  const linked = JSON.parse(await run(['linked', '--json'], dir))
  assert.deepStrictEqual(linked, [{ spec: 'feat-adopted', bucket: 'in-progress', identifier: ADOPTED }])
})

test('an unadopted spec is absent from the adopted set', async () => {
  const dir = repoWithSpec({ identifier: null })
  const linked = JSON.parse(await run(['linked', '--json'], dir))
  assert.strictEqual(linked[0].identifier, null, 'null, not the folder-name fallback')
})
