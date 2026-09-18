'use strict'

/**
 * Disowning a pass whose spec has finished.
 *
 * `review waiting` lists every pass nobody heard and ends by printing
 * `disown one with: … --drop <code>`. For the passes it actually finds, that
 * command could not work: a stranded pass belongs, almost by definition, to a
 * spec that has completed and been torn down — and `specEnvReview` refused on
 * the missing worktree long before it reached `--drop`. Ten real passes sat
 * behind that, each listed on every render with a hint that exited without
 * dropping anything.
 *
 * The pending store is `.spec-env/reviews/<spec>.pending.json` in the PRIMARY
 * CHECKOUT. Disowning reads and writes that file and nothing else; the worktree
 * being refused for is not involved. So the gate moves for the sidecar-only
 * path and stays exactly where it was for every path that reads the diff or
 * acts on a verdict.
 *
 * Half of what follows is the other half of that sentence — the paths that must
 * STILL refuse, and the untouched behaviour of a spec that does have a worktree.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { readPending, writePending, addPending, readNotes } = require('../src/env/review.js')

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

/**
 * A repo whose spec has COMPLETED: its folder is in `specs/complete/` and it
 * has no worktree — exactly the state every one of the ten stranded passes was
 * in. `provisioned: true` gives the same spec a worktree instead, so the
 * untouched-behaviour half of this file runs against the same fixture.
 */
function scaffold({ provisioned = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-stranded-')))
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
  const bucket = provisioned ? 'in-progress' : 'complete'
  const specDir = path.join(dir, 'specs', bucket, 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  let wt = null
  if (provisioned) {
    wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
  }
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
const passes = (dir) => readPending(outPath(dir), 'feat-alpha').pending.passes.map((p) => p.code)

// Put a pass in the holding area the way the serve endpoint does. Deliberately
// not through a render: a stranded pass outlives the page it came from, and the
// point of this fixture is that no render can happen any more.
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

test('--drop clears a pass on a spec whose worktree is gone', async () => {
  // RED BEFORE THE FIX. The worktree check refused first, so this printed the
  // provision message and left the pass exactly where it was — which is what
  // every one of the ten stranded passes did.
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ verdict: 'commit' }))
    const said = await review(dir, '--drop', code)

    assert.match(said, new RegExp(`dropped: ${code}`), 'it says what it disowned')
    assert.doesNotMatch(said, /run \/spec-start to provision it/, 'and does not send them to resurrect the spec')
    assert.deepStrictEqual(passes(dir), [], 'the store is clear')
  } finally {
    cleanup(dir)
  }
})

test('--drop on a worktree-less spec names exactly the pass it was given', async () => {
  const { dir } = scaffold()
  try {
    const mine = hold(dir, blobOf({ accepted: [{ path: 'app.js', hash: 'h1' }] }), { render: 'R1' })
    const theirs = hold(dir, blobOf({ verdict: 'commit' }), { render: 'R2' })

    await review(dir, '--drop', theirs)
    assert.deepStrictEqual(passes(dir), [mine], 'only the named one went')
    assert.deepStrictEqual(readNotes(outPath(dir), 'feat-alpha').notes.files, {}, 'and nothing was merged')
  } finally {
    cleanup(dir)
  }
})

test('a wrong code on a worktree-less spec still refuses, and still names nothing', async () => {
  // The same silence as a claim: a drop that listed the codes it could not find
  // would hand a guesser what the claim withholds. Relaxing the worktree gate
  // must not relax this.
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf())
    const said = await review(dir, '--drop', '000000')
    assert.match(said, /no pending pass with that code/)
    assert.match(said, /1 waiting/)
    assert.ok(!said.includes(code), 'the code itself is withheld')
    assert.deepStrictEqual(passes(dir), [code], 'and nothing was consumed')
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * What must STILL refuse — the other half of the decision
 * ========================================================================== */

test('a stranded pass is never claimable, and the refusal names the exit that works', async () => {
  // Once the branch has merged and the worktree is gone, a `commit` verdict has
  // nowhere to land — honouring one would report work that did not happen. So
  // the refusal stays; what changes is that it stops recommending `/spec-start`,
  // which for a completed spec is advice to resurrect it to throw a pass away.
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ verdict: 'commit' }))
    const said = await review(dir, '--claim', code)

    assert.match(said, /no worktree/, 'it still refuses')
    assert.match(said, /--drop/, 'and names the one thing that does work')
    assert.match(said, /review waiting/, 'and where to see what is waiting')
    assert.doesNotMatch(said, /run \/spec-start to provision it/)
    assert.deepStrictEqual(passes(dir), [code], 'the pass is untouched — not claimed, not dropped')
  } finally {
    cleanup(dir)
  }
})

test('the refusal counts the waiting passes, so the reader knows there is one', async () => {
  const { dir } = scaffold()
  try {
    hold(dir, blobOf({ verdict: 'commit' }), { render: 'R1' })
    hold(dir, blobOf({ verdict: 'discuss' }), { render: 'R2' })
    const said = await review(dir)
    assert.match(said, /2 waiting/)
  } finally {
    cleanup(dir)
  }
})

test('every path that reads the diff or acts on a verdict still refuses', async () => {
  const { dir } = scaffold()
  try {
    const code = hold(dir, blobOf({ verdict: 'commit' }))
    const notes = path.join(dir, 'pass.json')
    fs.writeFileSync(notes, JSON.stringify(blobOf({ verdict: 'discuss' })))
    const resolutions = path.join(dir, 'res.json')
    fs.writeFileSync(resolutions, JSON.stringify([{ id: 'c1', note: 'done' }]))

    for (const argv of [
      [],
      ['--branch'],
      ['--claim', code],
      ['--claim-since', '2020-01-01T00:00:00.000Z'],
      ['--notes', notes],
      ['--verdict', 'commit'],
      ['--resolve', resolutions],
    ]) {
      const said = await review(dir, ...argv)
      assert.match(said, /no worktree/, `${argv.join(' ') || '(render)'} must still refuse`)
    }
    assert.deepStrictEqual(passes(dir), [code], 'and none of them touched the store')
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * A provisioned spec is untouched
 * ========================================================================== */

test('--drop on a provisioned spec behaves exactly as it does today', async () => {
  // Moving the branch ahead of the gate must not change the path that was
  // already working: there, `--drop` falls through to the render, so the page
  // is rewritten without the pass on it.
  const { dir } = scaffold({ provisioned: true })
  try {
    await review(dir)
    const mine = hold(dir, blobOf({ accepted: [{ path: 'app.js', hash: 'h1' }] }), { render: 'R1' })
    const theirs = hold(dir, blobOf({ verdict: 'commit' }), { render: 'R2' })

    const said = await review(dir, '--drop', theirs)
    assert.match(said, new RegExp(`dropped: ${theirs}`))
    assert.match(said, /merged nothing/)
    assert.match(said, /^spec-env review: feat-alpha/m, 'it still rendered')
    assert.match(said, /pending: 1 waiting/, 'and the page reports what is left')
    assert.deepStrictEqual(passes(dir), [mine])
  } finally {
    cleanup(dir)
  }
})

/* ==========================================================================
 * Stays silent (`.claude/rules/negative-checks.md` rule 3)
 * ========================================================================== */

test('stays silent: a provisioned spec with no waiting pass renders as it always did', async () => {
  const { dir } = scaffold({ provisioned: true })
  try {
    const said = await review(dir)
    assert.ok(!said.includes('waiting'), 'no pending line')
    assert.ok(!said.includes('dropped'), 'no drop line')
    assert.doesNotMatch(said, /--drop/, 'and no advice about a disowning nobody needs')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: a worktree-less spec with no pass at all says only that', async () => {
  // The refusal grew a pass count and two commands. A spec with nothing waiting
  // must not be told about either — that would be advice to disown a pass that
  // does not exist, on the commonest reading of all (a spec that simply has not
  // been started).
  const { dir } = scaffold()
  try {
    const said = await review(dir)
    assert.match(said, /no worktree/)
    assert.doesNotMatch(said, /waiting/, 'nothing is waiting, so nothing is said about it')
    assert.doesNotMatch(said, /--drop/)
  } finally {
    cleanup(dir)
  }
})

test('stays silent: --drop of an unknown code on a clean repo changes nothing', async () => {
  const { dir } = scaffold({ provisioned: true })
  try {
    const said = await review(dir, '--drop', '424242')
    assert.match(said, /no pending pass with that code/)
    assert.doesNotMatch(said, /\(\d+ waiting\)/, 'and there is no count to report')
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-alpha.pending.json')))
  } finally {
    cleanup(dir)
  }
})
