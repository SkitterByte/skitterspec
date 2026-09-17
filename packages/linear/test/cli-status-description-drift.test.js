'use strict'

/**
 * `spec-sync status --remote` reporting a description edited on Linear.
 *
 * The engine half is pinned in `sync-core`'s own suite; what these tests are
 * about is the REPORT — that a positive answer reaches the reader with the
 * identifier and somewhere to look, and that every other answer reaches them as
 * nothing at all.
 *
 * The silence is the part worth testing. This line is an accusation: it tells
 * someone their text is about to be overwritten. Fired on an intact mirror it
 * would be noise on every run of every spec, and a line everybody learns to
 * ignore is worse than no line.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { snapshotOf } = require('@skitterbyte/skitterspec-sync-core')

const ISSUE = 'SKI-41'
const URL = 'https://linear.app/acme/issue/SKI-41/export-timeouts'

// A linked spec whose overview prose is what gets pushed as the description.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-drift-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const spec = path.join(dir, 'specs', 'in-progress', 'feat-exports')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    `---\nlinear_identifier: "${ISSUE}"\n---\n\n# Export timeouts\n\n` +
      '## Problem\n\nExports time out on large accounts.\n\n- Chrome 121\n- over 50k rows\n',
    'utf-8',
  )
  fs.writeFileSync(path.join(spec, '01-fix.md'), '# Phase 1 — Fix it ⬜\n\n**Goal:** fixed.\n', 'utf-8')
  return dir
}

// What the repo pushes for that spec — asked of the engine rather than
// hand-written, so the fixture cannot drift from the projection.
function pushedDescription(dir) {
  let text = ''
  return specSync(['normalize', 'feat-exports'], {
    cwd: dir,
    out: { write: (s) => (text += s) },
    err: { write: () => {} },
  }).then(() => JSON.parse(text).description)
}

// Record a snapshot as though that description had just been pushed.
function recordSnapshot(dir, description, { legacy = false } = {}) {
  const snap = snapshotOf({ description, status: 'in-progress', subIssues: [] })
  // A snapshot written before this feature existed — no `descriptionStream`.
  if (legacy) delete snap.issueFields.descriptionStream
  const base = path.join(dir, 'specs', '.core', 'linear-base')
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(path.join(base, `${ISSUE}.base.json`), JSON.stringify(snap), 'utf-8')
}

function remoteFile(dir, remote) {
  const f = path.join(dir, 'remote.json')
  fs.writeFileSync(f, JSON.stringify(remote), 'utf-8')
  return f
}

function status(dir, extra = []) {
  let text = ''
  return specSync(['status', 'feat-exports', ...extra], {
    cwd: dir,
    out: { write: (s) => (text += s) },
    err: { write: () => {} },
  }).then(() => text)
}

// --- it fires, and says enough to act on ------------------------------------

test('an edited description is reported, with somewhere to look', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { description: pushed + '\n\nAlso: only after a CSV import.', url: URL })

  const text = await status(dir, ['--remote', file])
  assert.match(text, /description was edited on Linear since the last push/)
  assert.match(text, new RegExp(ISSUE), 'names the issue')
  assert.match(text, /repo wins on next push/, 'says what happens if they push')
  assert.match(text, new RegExp(URL.replace(/[/.]/g, '\\$&')), 'and where to read it')
})

test('it reports that it changed, never what it now says', async () => {
  // The text is the reader's to read on Linear. Pulling it in would put a whole
  // description through whatever is running this.
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const secret = 'PARAGRAPH THE PM ADDED'
  const file = remoteFile(dir, { description: pushed + '\n\n' + secret, url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, new RegExp(secret), 'the edited text stays on Linear')
})

test('it is its own line, not folded into the workflow-state drift', async () => {
  // Two independent facts about one issue; welding them lets either hide the
  // other.
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, {
    description: pushed + '\n\nedited',
    state: { name: 'In Progress' },
    url: URL,
  })

  const text = await status(dir, ['--remote', file])
  assert.match(text, /drift: none — Linear workflow-state matches/, 'the state line still says its piece')
  assert.match(text, /description was edited/, 'and the description line says its own')
})

test('it never changes the exit code — detect and report, not refuse', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { description: pushed + '\n\nedited', url: URL })

  const code = await specSync(['status', 'feat-exports', '--remote', file], {
    cwd: dir,
    out: { write: () => {} },
    err: { write: () => {} },
  })
  assert.strictEqual(code, 0)
})

// --- stays silent -----------------------------------------------------------

test('an intact mirror Linear has reformatted says nothing', async () => {
  // THE FAILURE THIS CHECK EXISTS NOT TO HAVE. Every transform below is one
  // Linear performs on save; an exact comparison would report all of them as a
  // human edit, on every spec, forever.
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const reserialised = pushed
    .split('\n')
    .map((l) => l.replace(/^- /, '* '))
    .join('\n')
    .replace(/\n\n/g, '\n\n\n')
  const file = remoteFile(dir, { description: reserialised, url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description was edited/, 'a reformatted mirror is not an edit')
})

test('an identical description says nothing', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { description: pushed, url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description was edited/)
})

test('a snapshot written before this feature says nothing', async () => {
  // Every snapshot in every repo, on the first run after upgrading. Reading that
  // absence as evidence would accuse the entire workspace at once.
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed, { legacy: true })
  const file = remoteFile(dir, { description: 'something else entirely', url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description was edited/, 'cannot-tell is not drift')
})

test('a spec never pushed says nothing', async () => {
  const dir = repo()
  const file = remoteFile(dir, { description: 'anything', url: URL })
  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description was edited/)
  assert.match(text, /never pushed/, 'it says the useful thing instead')
})

test('a --remote file carrying no description says nothing', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { state: { name: 'In Progress' }, url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description was edited/, 'it was never asked for')
})

test('no --remote at all says nothing', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const text = await status(dir)
  assert.doesNotMatch(text, /description was edited/)
})

test('there is no "description drift: none" counterpart', async () => {
  // The state line has one because that question is always askable. This one is
  // not — silence here means "no positive answer", which covers cannot-tell too,
  // and a reassuring "none" would be claiming knowledge the check may not have.
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { description: pushed, url: URL })

  const text = await status(dir, ['--remote', file])
  assert.doesNotMatch(text, /description.*(unchanged|matches|none)/i)
})

// --- a remote with no url ---------------------------------------------------

test('a remote with no url still reports the edit, minus the link', async () => {
  const dir = repo()
  const pushed = await pushedDescription(dir)
  recordSnapshot(dir, pushed)
  const file = remoteFile(dir, { description: pushed + '\n\nedited' })

  const text = await status(dir, ['--remote', file])
  assert.match(text, /description was edited/, 'the fact survives a missing link')
})
