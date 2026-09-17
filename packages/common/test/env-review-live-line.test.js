'use strict'

/**
 * The render says whether the spec is also RUNNING somewhere.
 *
 * Reading a diff is not the only way to judge a change — often the question is
 * whether it works — and the answer lives at the running URL. So the render
 * carries one `live:` line, and `--json` carries the same answer from the same
 * function, which is what stops a page and a command disagreeing.
 *
 * `serve: 'never'` throughout: these tests are about the line, and standing a
 * server up per case buys nothing and races on a port.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function g(dir, ...a) {
  return execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
}

function repoWithSpec(dev) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-liveline-')))
  g(dir, 'init', '-q')
  g(dir, 'config', 'user.email', 'test@example.com')
  g(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      {
        baseBranch: 'main',
        docker: { enabled: false },
        review: { serve: 'never', reader: 'local' },
        ...(dev ? { dev } : {}),
      },
      null,
      2,
    ) + '\n',
  )
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  g(dir, 'add', '-A')
  g(dir, 'commit', '-q', '-m', 'init')
  g(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  g(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\ntwo\n')
  return { dir, wt }
}

function drop(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// A child process, for the reason `env-review-tiers.test.js` records: a render
// awaits, and `node --test` writes its report to the stdout an in-process
// capture would hijack.
function review(dir, ...extra) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  return execFileSync(
    'node',
    ['-e', script, 'spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra],
    { encoding: 'utf-8' },
  )
}

// Take the live instance the way `live take` does — the branch into the primary
// checkout, the worktree detached. The branch is the authority, so this is the
// whole of what makes a spec live.
function take(dir, wt) {
  g(wt, 'switch', '--detach')
  g(dir, 'checkout', '-q', 'feat/alpha')
}

// IT NAMES THE COMMAND, not the capability. `off — the page can put it live`
// told the reader a page somewhere could do it and left them to find the verb.
test('a free workbench reports off, and names the command that changes it', () => {
  const { dir } = repoWithSpec()
  try {
    assert.match(review(dir), /^ {2}live: {4}off — \/spec-live to put it live$/m)
  } finally {
    drop(dir)
  }
})

test('a live spec reports on, with the canonical URL when one is configured', () => {
  const { dir, wt } = repoWithSpec([{ name: 'web', command: 'true', portVar: 'PORT', frontPort: 3000 }])
  try {
    take(dir, wt)
    // The host is the project's own `proxy.host`, not a guessed `localhost`:
    // that is the address the canonical ports are actually bound on.
    assert.match(
      review(dir),
      /^ {2}live: {4}on — running at http:\/\/127\.0\.0\.1:3000; \/spec-live main to restore main$/m,
    )
  } finally {
    drop(dir)
  }
})

test('a live spec with no canonical port says on and invents no URL', () => {
  const { dir, wt } = repoWithSpec()
  try {
    take(dir, wt)
    const out = review(dir)
    assert.match(out, /^ {2}live: {4}on; \/spec-live main to restore main$/m)
    assert.doesNotMatch(out, /running at/)
  } finally {
    drop(dir)
  }
})

test('another branch in the workbench reports held, naming the way out', () => {
  const { dir } = repoWithSpec()
  try {
    g(dir, 'checkout', '-q', '-b', 'feat/other')
    assert.match(review(dir), /^ {2}live: {4}held — the workbench is on feat\/other/m)
  } finally {
    drop(dir)
  }
})

// TEXT AND JSON FROM ONE FUNCTION. The tier stack established this: two
// renderings of the same fact drift, and a skill that parses prose is the
// reason they are noticed late.
test('--json carries the same answer, so a skill never parses the line', () => {
  const { dir, wt } = repoWithSpec()
  try {
    const off = JSON.parse(review(dir, '--json'))
    assert.strictEqual(off.live.state, 'off')
    take(dir, wt)
    const on = JSON.parse(review(dir, '--json'))
    assert.strictEqual(on.live.state, 'on')
  } finally {
    drop(dir)
  }
})

// THE TREE THE BRANCH IS IN. While live, the worktree is detached and holds
// none of the work — including an uncommitted fix, which is made in the primary
// checkout. A render still reading the worktree reports a clean tree and shows
// the reader nothing.
test('a live render reads the primary checkout, not the detached worktree', () => {
  const { dir, wt } = repoWithSpec()
  try {
    take(dir, wt)
    fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\nthree\n')
    const j = JSON.parse(review(dir, '--json'))
    assert.strictEqual(j.worktree, dir, 'the tree it read is named, and it is this one')
    assert.strictEqual(j.totals.files, 1)
  } finally {
    drop(dir)
  }
})

// A live spec's worktree can be gone entirely — its branch is safe in the
// primary checkout. Refusing there would refuse a spec whose diff is readable.
test('a live spec with no worktree left still renders', () => {
  const { dir, wt } = repoWithSpec()
  try {
    take(dir, wt)
    execFileSync('git', ['-C', dir, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' })
    const out = review(dir)
    assert.doesNotMatch(out, /has no worktree at/)
    assert.match(out, /^ {2}live: {4}on; \/spec-live main to restore main$/m)
  } finally {
    drop(dir)
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3). A `--docs` page
// belongs to a spec with no branch to put live, so there is nothing to say —
// and an explanation of that absence is the noise version of an accusation.
test('STAYS SILENT: a --docs render carries no live line at all', () => {
  const { dir } = repoWithSpec()
  try {
    const sd = path.join(dir, 'specs', 'backlog', 'feat-beta')
    fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# Beta\n\n> **Stack:** worktree\n')
    const script =
      `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
      'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
    const out = execFileSync(
      'node',
      ['-e', script, 'spec-env', 'review', 'feat-beta', '--docs', '--dir', dir],
      { encoding: 'utf-8' },
    )
    assert.doesNotMatch(out, /^ {2}live:/m)
  } finally {
    drop(dir)
  }
})
