'use strict'

/**
 * THE SERVED PAGE SHOWS THE BUTTONS THE WORK ACTUALLY HAS.
 *
 * `/no-spec` renders with `--buttons nospec` — `Commit & Land` and `Commit` —
 * and the daemon re-renders the same spec per request through `renderSpecPage`,
 * which took `{ branch }` and nothing else. So every specless page served over
 * http offered the COMMITTING set instead: `Commit & Continue`, naming a next
 * phase a specless branch does not have, and `Commit & Start`, offering to put
 * a spec in flight that does not exist. A reader pressed one and the pass came
 * back `commit-continue` — a word the page they were looking at could not
 * produce.
 *
 * TWO SOURCES, AND EACH ANSWERS WHAT IT KNOWS. The tree knows which FAMILY the
 * work belongs to — a spec's documents, a branch with no spec, a phase — and it
 * knows it better than any record, because the record can be a day old while
 * the tree is now. What the tree cannot see is whether the run that rendered was
 * FINISHED: `midrun` and `refresh` exist for that, and only the caller knew. So
 * the render records what it declared, and the served page takes from the record
 * only the half the tree cannot supply.
 *
 * WHICH MAKES THE RECORD NARROWING-ONLY, and that is the property these tests
 * pin. A stale record can lose a reader their commit buttons for one render; it
 * can never hand a specless branch a `Commit & Start`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { serverHooks, createReviewServer, startReviewServer, buttonsForView } = require('../src/env/serve.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { readRegistry, writeRegistry } = require('../src/env/registry.js')
const { reviewOutPath, writeRenderRecord, readRenderRecord } = require('../src/env/review.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

/**
 * One repo holding all three families at once.
 *
 * `feat-alpha` has a worktree (the committing family), `tidy-up` is a recorded
 * specless branch (the nospec family), and `feat-draft` is an uncommitted spec
 * document with no worktree at all (the authoring family). Three, deliberately:
 * a fix that reached one family by flattening the others would pass a test that
 * only ever looked at one.
 */
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-buttons-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      baseBranch: 'main',
      docker: { enabled: false },
      branch: { pattern: '{type}/{slug}' },
      review: { reader: 'local', serve: 'never' },
    }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# feat-alpha\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  const root = path.resolve(dir, `../${path.basename(dir)}-wt`)
  const specWt = path.join(root, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', specWt)
  fs.writeFileSync(path.join(specWt, 'app.js'), 'one\ntwo\nthree\n')

  // The specless branch, recorded exactly as `spec-env nospec` records one.
  const choreWt = path.join(root, 'tidy-up')
  git(dir, 'worktree', 'add', '-q', '-b', 'chore/tidy-up', choreWt)
  fs.writeFileSync(path.join(choreWt, 'app.js'), 'one\nTWO\n')
  const { config } = loadEnvConfig(dir)
  const reg = readRegistry(dir, config)
  reg.specless = { ...(reg.specless || {}), 'tidy-up': { type: 'chore', slug: 'tidy-up' } }
  writeRegistry(dir, config, reg)

  // A spec that has only just been written: documents on disk, uncommitted, and
  // no branch anywhere. This is the `--docs` view `/spec` renders.
  const draft = path.join(dir, 'specs', 'backlog', 'feat-draft')
  fs.mkdirSync(draft, { recursive: true })
  fs.writeFileSync(path.join(draft, '00-overview.md'), '# feat-draft\n\n> **Status:** Ready\n')

  return { dir, specWt, choreWt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Stand the real server up through the production wiring — `serverHooks` is
// what the daemon's entry point uses, so a pass here is about what ships.
async function serve(dir) {
  const { config } = loadEnvConfig(dir)
  const server = createReviewServer({ ...serverHooks(dir, config), token: null })
  const addr = await startReviewServer(server, { port: 0, host: '127.0.0.1' })
  const base = `http://127.0.0.1:${addr.port}/`
  return {
    base,
    get: (p = '') => fetch(base + p),
    close: () => new Promise((r) => server.close(r)),
  }
}

// What the page's data island says its button set is. `committing` is written
// as an ABSENCE by `collectReview`, so that is what the caller compares against.
async function buttonsOf(s, folder) {
  const res = await s.get(folder)
  assert.strictEqual(res.status, 200, `${folder} must serve`)
  const html = await res.text()
  const m = html.match(/"buttons":"([a-z-]+)"/)
  return m ? m[1] : 'committing'
}

// Record a render the way the CLI does, without standing the CLI up.
function record(dir, folder, buttons) {
  writeRenderRecord(reviewOutPath(dir, folder, null), {
    spec: folder,
    buttons,
    at: new Date().toISOString(),
  })
}

/* ==========================================================================
 * The bug
 * ========================================================================== */

test('a specless branch is served the nospec buttons', async () => {
  // RED BEFORE THE FIX: `committing`. The page on disk said `nospec` and the
  // one over http said something else about the same branch.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'tidy-up'), 'nospec')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a specless page offers Commit & Land, and never Commit & Start', async () => {
  // The consequence, stated in the words on the screen. `commit-start` on a
  // branch with no spec is an offer to put nothing in flight.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    const buttons = await buttonsOf(s, 'tidy-up')
    assert.strictEqual(buttons, 'nospec')
    const page = fs.readFileSync(path.join(__dirname, '..', 'assets', 'review', 'page.html'), 'utf8')
    const set = page.match(/nospec:\s*\[([^\]]+)\]/)
    assert.ok(set, 'the page defines a nospec offer')
    assert.match(set[1], /commit-land/)
    assert.doesNotMatch(set[1], /commit-start/)
    assert.doesNotMatch(set[1], /commit-continue/)
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('an uncommitted spec document is served the authoring buttons', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-draft'), 'authoring')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a phase in a worktree is served the committing buttons', async () => {
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-alpha'), 'committing')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * The record supplies the half the tree cannot
 * ========================================================================== */

test('a recorded midrun render is honoured over http', async () => {
  // RED BEFORE THE FIX for the same reason the specless case was: `/spec-diff`
  // renders `--buttons midrun` mid-phase, and the served copy offered `Commit`
  // on work nobody had finished.
  const { dir } = scaffold()
  record(dir, 'feat-alpha', 'midrun')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-alpha'), 'midrun')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a recorded refresh render is honoured over http', async () => {
  // `/spec-review` renders `--docs --buttons refresh`: no start verdict, because
  // the spec it re-validated may already be in flight.
  const { dir } = scaffold()
  record(dir, 'feat-draft', 'refresh')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-draft'), 'refresh')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a record narrows and never widens', async () => {
  // The whole safety property. A record is the only source for `midrun` and
  // `refresh`; for everything else the TREE answers, so a stale or wrong record
  // cannot hand a specless branch a verdict its skill cannot act on.
  const { dir } = scaffold()
  record(dir, 'tidy-up', 'committing')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'tidy-up'), 'nospec', 'the tree wins on family')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('a record for one spec does not reach another', async () => {
  const { dir } = scaffold()
  record(dir, 'feat-alpha', 'midrun')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'tidy-up'), 'nospec')
    assert.strictEqual(await buttonsOf(s, 'feat-draft'), 'authoring')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * The branch fallback — the path that fires MOST
 * ========================================================================== */

test('the set survives the clean-worktree fallback', async () => {
  // A phase ends with the page rendered and the commit landing immediately
  // after, so from then on every render of that spec has an empty working view
  // and falls back to the branch range. That second `collectReview` was written
  // without the set — the same omission as the first, on the path that answers
  // for the whole rest of a spec's life.
  const { dir, choreWt } = scaffold()
  git(choreWt, 'add', '-A')
  git(choreWt, 'commit', '-q', '-m', 'the work')
  const s = await serve(dir)
  try {
    const res = await s.get('tidy-up')
    assert.strictEqual(res.status, 200)
    const html = await res.text()
    assert.match(html, /"mode":"branch"/, 'it really did fall back')
    assert.match(html, /"buttons":"nospec"/, 'and kept the set it fell back with')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

/* ==========================================================================
 * `buttonsForView` — the rule itself
 * ========================================================================== */

test('buttonsForView: the tree decides the family', () => {
  assert.strictEqual(buttonsForView('docs', { specless: false }, null), 'authoring')
  assert.strictEqual(buttonsForView('docs-committed', { specless: false }, null), 'authoring')
  assert.strictEqual(buttonsForView('worktree', { specless: true }, null), 'nospec')
  assert.strictEqual(buttonsForView('live', { specless: true }, null), 'nospec')
  assert.strictEqual(buttonsForView('worktree', { specless: false }, null), 'committing')
  assert.strictEqual(buttonsForView('live', { specless: false }, null), 'committing')
})

test('buttonsForView: only midrun and refresh come from the record', () => {
  assert.strictEqual(buttonsForView('worktree', { specless: false }, 'midrun'), 'midrun')
  assert.strictEqual(buttonsForView('docs', { specless: false }, 'refresh'), 'refresh')
  assert.strictEqual(buttonsForView('worktree', { specless: true }, 'midrun'), 'midrun')
  // Widening words are ignored wherever they appear.
  assert.strictEqual(buttonsForView('worktree', { specless: true }, 'committing'), 'nospec')
  assert.strictEqual(buttonsForView('worktree', { specless: true }, 'authoring'), 'nospec')
  assert.strictEqual(buttonsForView('docs', { specless: false }, 'nospec'), 'authoring')
  assert.strictEqual(buttonsForView('worktree', { specless: false }, 'authoring'), 'committing')
})

/* ==========================================================================
 * Stays silent (`.claude/rules/negative-checks.md` rule 3)
 * ========================================================================== */

test('stays silent: no record at all is the ordinary state', async () => {
  // Most pages are never rendered from the CLI before someone opens them off
  // the index. An absent record must read as "the tree answers", not as an
  // error and not as a reason to withhold the buttons.
  const { dir } = scaffold()
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-alpha'), 'committing')
    assert.strictEqual(await buttonsOf(s, 'tidy-up'), 'nospec')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('stays silent: a record that is not readable JSON changes nothing', async () => {
  const { dir } = scaffold()
  const out = reviewOutPath(dir, 'tidy-up', null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out.replace(/\.html$/, '') + '.render.json', '{ not json')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'tidy-up'), 'nospec', 'the tree still answers')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('stays silent: a record naming a set this engine does not know is ignored', async () => {
  // Forward tolerance, the same shape `readVerdict` takes: an unknown word is
  // not evidence of anything, so it routes to the tree's answer rather than
  // reaching the page as a set with no offer behind it.
  const { dir } = scaffold()
  record(dir, 'feat-alpha', 'whatever-comes-next')
  const s = await serve(dir)
  try {
    assert.strictEqual(await buttonsOf(s, 'feat-alpha'), 'committing')
  } finally {
    await s.close()
    cleanup(dir)
  }
})

test('readRenderRecord: absent, corrupt and present are three states', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-rec-')))
  try {
    const out = reviewOutPath(dir, 'feat-x', null)
    assert.deepStrictEqual(readRenderRecord(out, 'feat-x'), { buttons: null, corrupt: false, present: false })
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out.replace(/\.html$/, '') + '.render.json', 'nope')
    assert.deepStrictEqual(readRenderRecord(out, 'feat-x'), { buttons: null, corrupt: true, present: true })
    writeRenderRecord(out, { spec: 'feat-x', buttons: 'midrun', at: 'now' })
    assert.deepStrictEqual(readRenderRecord(out, 'feat-x'), { buttons: 'midrun', corrupt: false, present: true })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/* ==========================================================================
 * The wiring, not just the behaviour
 * ========================================================================== */

/**
 * EVERY `collectReview` CALL PASSES A SET.
 *
 * Five call sites across two files, and the bug was two of them written without
 * one — in `serve.js`, where the omission reads as the default rather than as a
 * gap, so nothing anywhere went red. The tests above pin the four paths that
 * exist today; this pins that a fifth cannot be added the same way.
 *
 * WHAT WOULD FOOL IT: it is a text scan, so a call site that passed the key
 * under a wrong VALUE would satisfy it. That is the harmless direction — the
 * point is that the author had to think about the set at all — and it is the
 * behavioural tests above that say which value is right.
 */
test('every collectReview call site declares a button set', () => {
  const files = ['../src/env/serve.js', '../src/cli.js']
  for (const rel of files) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf8')
    const calls = [...src.matchAll(/collectReview\(\{/g)]
    assert.ok(calls.length, `${rel} calls collectReview`)
    for (const m of calls) {
      // The call's own object literal, to its closing `})`.
      const tail = src.slice(m.index)
      const body = tail.slice(0, tail.indexOf('\n  })') + 1)
      assert.match(
        body,
        /\bbuttons\b/,
        `${rel}: a collectReview call at offset ${m.index} passes no button set`,
      )
    }
  }
})

test('stays silent: the call-site scan can actually fire', () => {
  // Rule 3. A scan that matched nothing would pass on a file with no calls in
  // it at all, so prove the assertion it makes is one that can fail.
  const body = 'collectReview({\n    spec,\n    git,\n    mode,\n  })\n'
  assert.doesNotMatch(body, /\bbuttons\b/)
})
