'use strict'

/**
 * `spec-env review --docs` — a page of a spec's OWN DOCUMENTS, read from the
 * tree in hand rather than from a worktree.
 *
 * It exists because a spec in `backlog/` has no worktree, so the ordinary
 * render refuses it — which left the one artefact whose whole purpose is to be
 * read before work starts as the only one with no reading surface.
 *
 * Driven through the CLI rather than `collectReview`, because the thing under
 * test is the DECISION: which tree, which files, and whether the worktree check
 * applies at all. Testing the collector would test what the decision calls.
 *
 * Several of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3). The mode inverts two existing rules — the worktree check and the
 * bookkeeping filter — and being wrong about either lands on renders that are
 * perfectly healthy, so each inversion gets a test asserting the ordinary path
 * is untouched.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const review = require('../src/env/review.js')

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'review', 'page.html'), 'utf8')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function specFiles(dir, bucket, folder, extra = '') {
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    `# ${folder}\n\n> **Stack:** worktree\n\n## Problem\n\nSomething${extra}\n`,
  )
  fs.writeFileSync(path.join(specDir, '01-first.md'), `# Phase 1 — first ⬜\n\nGoal${extra}\n`)
  return specDir
}

/**
 * A repo whose primary checkout holds TWO uncommitted backlog specs. Two is the
 * point: one is the subject and the other is what a shared checkout routinely
 * has in it while someone else authors beside you.
 */
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-docs-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    // `reader: local` is stated rather than detected, so a suite run from a
    // bridged or ssh session does not stand a real server up mid-test.
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        review: { reader: 'local', serve: 'never' },
        spec: { companionPaths: ['specs/.core/snap-{slug}.json'] },
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')

  // Both uncommitted, exactly as `/spec` leaves them.
  specFiles(dir, 'backlog', 'feat-mine')
  specFiles(dir, 'backlog', 'feat-theirs')
  return dir
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

const docs = (dir, spec, ...extra) =>
  runQuiet(['spec-env', 'review', spec, '--dir', dir, '--docs', ...extra])
const docsJson = async (dir, spec, ...extra) => JSON.parse(await docs(dir, spec, '--json', ...extra))
const paths = (data) => data.files.map((f) => f.path).sort()

// --- it fires ---------------------------------------------------------------

test('a backlog spec with no worktree renders its own documents', async () => {
  const dir = scaffold()
  try {
    const data = await docsJson(dir, 'feat-mine')
    assert.strictEqual(data.mode, 'docs')
    assert.deepStrictEqual(paths(data), [
      'specs/backlog/feat-mine/00-overview.md',
      'specs/backlog/feat-mine/01-first.md',
    ])
    assert.strictEqual(data.totals.files, 2)
    // Untracked, so the whole document is the page's content — which is what
    // makes a brand-new spec readable rather than an empty patch.
    assert.ok(
      data.files.every((f) => f.status === 'new'),
      'a spec nobody has committed renders as new files',
    )
  } finally {
    cleanup(dir)
  }
})

test('the render does not consult the worktree, so it never refuses for a missing one', async () => {
  const dir = scaffold()
  try {
    const out = await docs(dir, 'feat-mine')
    assert.doesNotMatch(out, /has no worktree/)
    assert.doesNotMatch(out, /spec-start to provision/)
    assert.match(out, /page: /)
  } finally {
    cleanup(dir)
  }
})

// --- the filter, which is the safety property -------------------------------

test('another spec uncommitted in the same checkout is not on the page', async () => {
  const dir = scaffold()
  try {
    const data = await docsJson(dir, 'feat-mine')
    assert.ok(
      !data.files.some((f) => f.path.includes('feat-theirs')),
      `a colleague's spec must never appear: ${paths(data).join(', ')}`,
    )
  } finally {
    cleanup(dir)
  }
})

test('code uncommitted in the same checkout is not on the page either', async () => {
  const dir = scaffold()
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
    const data = await docsJson(dir, 'feat-mine')
    assert.ok(
      !data.files.some((f) => f.path === 'app.js'),
      'the docs view is the spec, not whatever else the tree is holding',
    )
  } finally {
    cleanup(dir)
  }
})

test('a spec mid-move is rendered from both buckets at once', async () => {
  const dir = scaffold()
  try {
    // Commit it, then start the move — the tree `/spec-start` produces, dirty in
    // two buckets, both halves the same spec's.
    git(dir, 'add', '--', 'specs/backlog/feat-mine')
    git(dir, 'commit', '-q', '-m', 'spec')
    fs.mkdirSync(path.join(dir, 'specs', 'in-progress'), { recursive: true })
    git(dir, 'mv', 'specs/backlog/feat-mine', 'specs/in-progress/feat-mine')
    const data = await docsJson(dir, 'feat-mine')
    assert.ok(
      data.files.some((f) => f.path.startsWith('specs/in-progress/feat-mine/')),
      `expected the new bucket: ${paths(data).join(', ')}`,
    )
  } finally {
    cleanup(dir)
  }
})

// --- bookkeeping inverts, and only here -------------------------------------

test("the spec's own documents are not bookkeeping on a docs page", async () => {
  const dir = scaffold()
  try {
    const data = await docsJson(dir, 'feat-mine')
    assert.ok(
      data.files.every((f) => f.noise === false),
      'every file folded away renders a page with nothing open on it',
    )
  } finally {
    cleanup(dir)
  }
})

test('a declared companion stays bookkeeping, since it is not the spec', async () => {
  const dir = scaffold()
  try {
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'snap-mine.json'), '{"a":1}\n')
    const data = await docsJson(dir, 'feat-mine')
    const snap = data.files.find((f) => f.path === 'specs/.core/snap-mine.json')
    assert.ok(snap, `the companion is on the page: ${paths(data).join(', ')}`)
    assert.strictEqual(snap.noise, true, 'a generated snapshot is not what anyone came to read')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: in the ordinary mode a spec document is still bookkeeping', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'mine')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/mine', wt)
    fs.mkdirSync(path.join(wt, 'specs', 'in-progress'), { recursive: true })
    git(wt, 'mv', 'specs/backlog/feat-mine', 'specs/in-progress/feat-mine')
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\nchanged\n')

    const data = JSON.parse(await runQuiet(['spec-env', 'review', 'feat-mine', '--dir', dir, '--json']))
    assert.strictEqual(data.mode, 'working', 'no --docs, so nothing about the mode changed')
    const doc = data.files.find((f) => f.path.includes('feat-mine/00-overview.md'))
    assert.ok(doc, `the worktree render still lists the spec: ${paths(data).join(', ')}`)
    assert.strictEqual(doc.noise, true, 'the inversion must not leak into the phase view')
    const code = data.files.find((f) => f.path === 'app.js')
    assert.ok(code && code.noise === false, 'and code is still the subject there')
  } finally {
    cleanup(dir)
  }
})

// --- three states, never two ------------------------------------------------

test('a spec with nothing uncommitted says so, and writes no page', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    const out = await docs(dir, 'feat-mine')
    assert.match(out, /no uncommitted documents/)
    assert.match(out, /nothing to review/)
    assert.doesNotMatch(out, /page: /, 'an empty page would ask for a verdict on nothing')
    assert.ok(
      !fs.existsSync(path.join(dir, '.spec-env', 'reviews', 'feat-mine.html')),
      'nothing rendered means nothing written',
    )
  } finally {
    cleanup(dir)
  }
})

test('--docs never falls back to the branch range', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    const out = await docs(dir, 'feat-mine')
    // On the base branch the branch range is the whole of main, so a fallback
    // here would answer a question nobody asked with every file in the repo.
    assert.doesNotMatch(out, /everything since/)
    assert.doesNotMatch(out, /working tree clean/)
  } finally {
    cleanup(dir)
  }
})

test('the worktree refusal names --docs as the way to read the spec instead', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    const out = await runQuiet(['spec-env', 'review', 'feat-mine', '--dir', dir])
    assert.match(out, /has no worktree/)
    assert.match(out, /--docs to review the spec itself/)
  } finally {
    cleanup(dir)
  }
})

// --- the authoring button set ----------------------------------------------

test('--buttons authoring reaches the payload', async () => {
  const dir = scaffold()
  try {
    const data = await docsJson(dir, 'feat-mine', '--buttons', 'authoring')
    assert.strictEqual(data.buttons, 'authoring')
  } finally {
    cleanup(dir)
  }
})

test('an unknown button set is still refused by name, and renders nothing', async () => {
  const dir = scaffold()
  try {
    const out = await docs(dir, 'feat-mine', '--buttons', 'authorring')
    assert.match(out, /"authorring" is not one of/)
    assert.match(out, /committing, midrun, authoring/)
    assert.doesNotMatch(out, /page: /)
  } finally {
    cleanup(dir)
  }
})

test('commit-start is a verdict, and one that commits', () => {
  assert.ok(review.VERDICTS.includes('commit-start'), 'it must survive blob validation')
  assert.ok(
    review.COMMITTING.includes('commit-start'),
    'it commits, so an open comment must block it like the others',
  )
  assert.ok(review.BUTTON_SETS.includes('authoring'))
})

test('STAYS SILENT: the verdicts that existed are unchanged, and continue still does not commit', () => {
  for (const v of ['commit', 'commit-continue', 'continue', 'changes', 'discuss']) {
    assert.ok(review.VERDICTS.includes(v), `${v} must still be a verdict`)
  }
  assert.ok(
    !review.COMMITTING.includes('continue'),
    'continue still cannot clear a gate a finished phase armed',
  )
  assert.strictEqual(review.DEFAULT_BUTTON_SET, 'committing', 'the default is untouched')
})

// --- the page's half of the same decision -----------------------------------

test('the page offers the authoring set from one table, not a chain of ternaries', () => {
  assert.match(PAGE, /authoring: \['commit-start', 'commit', 'changes', 'discuss'\]/)
  assert.match(PAGE, /OFFERS\[data\.buttons\] \|\| OFFERS\.committing/)
})

test('the page has a Commit & Start button, hidden until a render asks for it', () => {
  assert.match(PAGE, /id="verdict-commit-start"[^>]*hidden/)
  assert.match(PAGE, /'commit-start': document\.getElementById\('verdict-commit-start'\)/)
})

test('the page treats commit-start as a committer, so an open note blocks it', () => {
  assert.match(PAGE, /var COMMITTERS = \['commit', 'commit-continue', 'commit-start', 'commit-land'\]/)
})

test('the page names commit-start everywhere a verdict is named', () => {
  // A verdict with no label renders as `undefined` on the decided panel, and a
  // decision restored from storage outlives the render that made it — so the
  // label has to exist whether or not this page offered the button.
  assert.match(PAGE, /'commit-start': '✓ Commit & Start'/)
  assert.match(PAGE, /'commit-start': 'Commit this spec, then put it in flight/)
  assert.match(PAGE, /'commit-start': 'committed, then put in flight'/)
})

test('the page says what a docs render is looking at', () => {
  assert.match(PAGE, /the spec's own documents/)
})

test('STAYS SILENT: the committing and midrun sets keep exactly the verdicts they had', () => {
  assert.match(PAGE, /midrun: \['continue', 'changes', 'discuss'\]/)
  assert.match(PAGE, /committing: \['commit', 'commit-continue', 'changes', 'discuss'\]/)
})

// --- the pass back, which the file:// half depends on -----------------------

test('the payload carries the paths a committing verdict must commit', async () => {
  const dir = scaffold()
  try {
    const data = await docsJson(dir, 'feat-mine', '--buttons', 'authoring')
    assert.deepStrictEqual(data.docs.paths, [
      'specs/backlog/feat-mine/00-overview.md',
      'specs/backlog/feat-mine/01-first.md',
    ])
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: an ordinary render carries no docs key at all', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'mine')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/mine', wt)
    fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\nthree\n')
    const data = JSON.parse(await runQuiet(['spec-env', 'review', 'feat-mine', '--dir', dir, '--json']))
    assert.ok(!('docs' in data), 'a key that appears for everyone changes every payload')
  } finally {
    cleanup(dir)
  }
})

test('a verdict word reaches a spec with no worktree, which is the file:// path', async () => {
  const dir = scaffold()
  try {
    // A `file://` page cannot POST, so it hands over `/spec-reviewed
    // commit-start` and the skill sends the word. Without `--docs` that lands on
    // the worktree check and the reader's verdict is refused for a reason that
    // has nothing to do with their review.
    const out = await docs(dir, 'feat-mine', '--verdict', 'commit-start', '--buttons', 'authoring')
    assert.doesNotMatch(out, /has no worktree/)
    assert.match(out, /committing with/, 'the verdict was honoured, not refused')
    const notes = JSON.parse(
      fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-mine.notes.json'), 'utf8'),
    )
    const last = notes.decisions[notes.decisions.length - 1]
    assert.strictEqual(last.verdict, 'commit-start', 'the decision is on the record')
  } finally {
    cleanup(dir)
  }
})

test('an open comment blocks commit-start here too, exactly as it blocks the others', async () => {
  const dir = scaffold()
  try {
    const blob = path.join(dir, 'pass.json')
    fs.writeFileSync(
      blob,
      JSON.stringify({
        version: 1,
        spec: 'feat-mine',
        comments: [{ id: 'c1', file: 'specs/backlog/feat-mine/00-overview.md', note: 'widen this' }],
      }),
    )
    await docs(dir, 'feat-mine', '--notes', blob)
    const out = await docs(dir, 'feat-mine', '--verdict', 'commit-start')
    assert.match(out, /commit refused — 1 comment is unresolved/)
    const notes = JSON.parse(
      fs.readFileSync(path.join(dir, '.spec-env', 'reviews', 'feat-mine.notes.json'), 'utf8'),
    )
    assert.ok(
      !(notes.decisions || []).length,
      'a refused verdict did not happen, so it is not logged as history',
    )
  } finally {
    cleanup(dir)
  }
})

test('an honoured commit-start says what it will do, never "discuss first"', async () => {
  const dir = scaffold()
  try {
    // The fall-through in `verdictSaid` returns `discuss first` for a verdict it
    // does not know — so a committing verdict missing from it tells a reader who
    // pressed a green button that their review ended in a conversation.
    const out = await docs(dir, 'feat-mine', '--verdict', 'commit-start')
    assert.match(out, /committing with \/commit, then putting it in flight/)
    assert.doesNotMatch(out, /discuss first/)
  } finally {
    cleanup(dir)
  }
})

// --- the refresh set: a re-validated spec, never a start verdict ------------

test('a tracked spec renders as a patch, not as whole new files', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    // What `/spec-review` does: rewrite a document that is already tracked.
    const doc = path.join(dir, 'specs', 'backlog', 'feat-mine', '00-overview.md')
    fs.writeFileSync(doc, fs.readFileSync(doc, 'utf8').replace('Something', 'Something else'))
    const data = await docsJson(dir, 'feat-mine', '--buttons', 'refresh')
    assert.deepStrictEqual(paths(data), ['specs/backlog/feat-mine/00-overview.md'])
    assert.strictEqual(data.files[0].status, 'modified', 'a refresh is what drifted, not a new file')
    assert.ok(data.files[0].additions > 0 && data.files[0].deletions > 0, 'both sides of the patch')
  } finally {
    cleanup(dir)
  }
})

test('the refresh set offers three verdicts and no start', () => {
  assert.ok(review.BUTTON_SETS.includes('refresh'))
  assert.match(PAGE, /refresh: \['commit', 'changes', 'discuss'\]/)
  // The one that must NOT be there: a refreshed spec may already be in flight,
  // so offering to provision it is wrong for half this set's inputs.
  const offers = /refresh: \[([^\]]*)\]/.exec(PAGE)[1]
  assert.ok(!offers.includes('commit-start'), 'no start verdict on a refresh page')
  assert.ok(!offers.includes('commit-continue'), 'and no next-phase verdict either')
})

test('STAYS SILENT: a review that changed nothing renders no page', async () => {
  const dir = scaffold()
  try {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'specs')
    // The commonest `/spec-review` outcome: the spec is still accurate.
    const out = await docs(dir, 'feat-mine', '--buttons', 'refresh')
    assert.match(out, /nothing to review/)
    assert.doesNotMatch(out, /page: /, 'an empty diff under a commit button asks for a verdict on nothing')
  } finally {
    cleanup(dir)
  }
})
