'use strict'

/**
 * A claimed pass must report the ACTION it carried.
 *
 * The page's surfaces strip sends an action blob — `live-on`, `allow-network`,
 * `allow-remote` — through exactly the transport a verdict uses: POST, held in
 * `<spec>.pending.json`, claimed by code. `/spec-diff` §2b then does the thing
 * and hands the page back.
 *
 * It could not, because the claim dropped the action on the floor. `claimed`
 * carried the code, the counts and nothing else, and the verdict slot was read
 * from `parsed.verdict` alone — so a `live-on` pass and a pass carrying no
 * decision at all produced identical output in both the text report and
 * `--json`. The reader was told their press concluded nothing, and it had.
 *
 * WHAT WOULD FOOL A READER OF THIS FILE: the action IS validated on the way in
 * (`validateNotesBlob`) and IS printed for a pass still WAITING
 * (`  <code> · live-on · …`). Both look like coverage of this and are not —
 * neither one is on the claim path.
 *
 * AN ACTION IS STILL NOT A VERDICT. The tests at the bottom are the stays-silent
 * half (`.claude/rules/negative-checks.md` rule 3): reporting the action must
 * not make it discharge a gate, count as a decision, or fill the verdict slot.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { readPending, writePending, addPending } = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

const blobOf = (over = {}) => ({
  version: 1,
  spec: 'feat-alpha',
  accepted: [],
  unaccepted: [],
  comments: [],
  ...over,
})

function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-claim-action-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

const review = (dir, ...extra) => runQuiet(['spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra])
const outPath = (dir) => path.join(dir, '.spec-env', 'reviews', 'feat-alpha.html')

// Put a pass in the holding area the way the serve endpoint does.
function hold(dir, blob, { render = 'R1', at = '2020-01-01T00:00:00.000Z' } = {}) {
  const out = outPath(dir)
  const { pending } = readPending(out, 'feat-alpha')
  const added = addPending(pending, { blob, at, render })
  writePending(out, added.pending)
  return added.code
}

/* ==========================================================================
 * The defect
 * ========================================================================== */

test('claiming an action pass says which action it carried', async () => {
  // RED BEFORE THE FIX: the line read `claimed: <code> — 0 accepts, 0
  // withdrawn, 0 comments`, which is what a pass carrying nothing says too.
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ action: 'live-on' }))
    const said = await review(dir, '--claim', code)

    assert.match(said, new RegExp(`claimed: ${code}`), 'it says what it claimed')
    assert.match(said, /live-on/, 'and names the action, which is the whole instruction')
  } finally {
    cleanup(dir)
  }
})

test('--json carries the action on the claim', async () => {
  // The skill routes on the JSON, so a report that only reached the text output
  // would leave §2b exactly as unreachable as it was.
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ action: 'allow-remote' }))
    const said = await review(dir, '--claim', code, '--json')
    const json = JSON.parse(said)

    assert.strictEqual(json.claimed.code, code)
    assert.strictEqual(json.claimed.action, 'allow-remote')
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * Stays silent — an action reported is still not a verdict
 * ========================================================================== */

test('a claimed pass carrying no action reports none, and says nothing about one', async () => {
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ accepted: [{ path: 'app.js', hash: 'h1' }] }))
    const said = await review(dir, '--claim', code, '--json')
    const json = JSON.parse(said)

    assert.strictEqual(json.claimed.action, null, 'absent is reported as absent, never invented')
    assert.strictEqual(json.verdict, undefined, 'and no verdict appears from nowhere')
  } finally {
    cleanup(dir)
  }
})

test('an action never fills the verdict slot, and never clears the gate', async () => {
  // The one thing reporting it must not do. A phase that ended owes an answer,
  // and an action concluded nothing — so the gate is exactly as armed after the
  // claim as it was before it.
  const { dir } = scaffold()
  try {
    await runQuiet(['spec-env', 'review', 'arm', 'feat-alpha', '--dir', dir])
    const code = hold(dir, blobOf({ action: 'live-on' }))
    const said = await review(dir, '--claim', code, '--json')
    const json = JSON.parse(said)

    assert.strictEqual(json.verdict, undefined, 'no verdict was recorded')

    const gate = JSON.parse(await runQuiet(['spec-env', 'review', 'gate', 'feat-alpha', '--dir', dir, '--json']))
    assert.strictEqual(gate.state, 'armed', 'the phase still owes an answer')
  } finally {
    cleanup(dir)
  }
})
