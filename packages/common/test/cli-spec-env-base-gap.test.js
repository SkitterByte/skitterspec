'use strict'

/**
 * The gap: `baseBranchPattern` matches nothing because the last release branch
 * merged and the next is not cut. Every command that needs the base refuses
 * with the engine's offer; once `spec-env base --use-fallback` pins the
 * fallback, each of them resolves to it — reads, writes and the main guard
 * alike — and says so where it shows the base.
 *
 * Driven through the real CLI over a real repo with a bare remote, as the
 * rolling-base tests are: the fetch and the remote's HEAD are git's answers.
 * Half are stays-silent tests (`.claude/rules/negative-checks.md` rule 3): a
 * project with no pattern, or one whose pattern matches, must see no offer and
 * no gap line anywhere.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { loadEnvConfig } = require('../src/env/config.js')
const { checkMainWrite } = require('../src/env/mainguard.js')

function git(cwd, args, env = {}) {
  return execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, ...env },
  })
    .toString()
    .trim()
}

function commit(cwd, file, msg, date) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n`)
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-q', '-m', msg], { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date })
}

function writeSpec(root, bucket, folder) {
  const d = path.join(root, 'specs', bucket, folder)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
}

// `main` on a bare remote with its HEAD known, and a spec worktree with one
// committed phase — so a review of it falls back to the branch range, which is
// what needs the base. `2028/Q?` matches no branch: the gap. Dates are fixed
// and long past.
function scaffold({ config = { baseBranchPattern: '2028/Q?' } } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-gap-')))
  const remote = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-gap-remote-')))
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })

  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      {
        docker: { enabled: false },
        guards: { baseIsLandingZone: false },
        review: { reader: 'local', serve: 'never' },
        ...config,
      },
      null,
      2,
    ),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  writeSpec(dir, 'in-progress', 'feat-thing')
  writeSpec(dir, 'backlog', 'feat-other')
  commit(dir, 'seed.txt', 'init', '2020-01-01T00:00:00Z')
  git(dir, ['branch', '-M', 'main'])
  git(dir, ['remote', 'add', 'origin', remote])
  git(dir, ['push', '-q', 'origin', 'main'])
  git(dir, ['fetch', '-q', 'origin'])
  git(dir, ['remote', 'set-head', 'origin', 'main'])

  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, 'thing')
  git(dir, ['worktree', 'add', '-q', '-b', 'feat/thing', worktree, 'main'])
  commit(worktree, 'work.txt', 'phase 1', '2020-02-15T00:00:00Z')
  return { dir, remote, worktree }
}

function cleanup({ dir, remote }) {
  try {
    git(dir, ['worktree', 'prune'])
  } catch {}
  for (const p of [dir, path.resolve(dir, `../${path.basename(dir)}-wt`), remote]) {
    fs.rmSync(p, { recursive: true, force: true })
  }
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  process.exitCode = 0
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  const code = process.exitCode || 0
  process.exitCode = 0
  return { out, code }
}

const OFFER = /offer: Use main as the base for now — skitterspec spec-env base --use-fallback/
const pin = (dir) => runQuiet(['spec-env', 'base', '--use-fallback', '--dir', dir])

// --- refusing with the offer -----------------------------------------------

test('review in the gap refuses and offers the fallback; --json carries it', async () => {
  const fx = scaffold()
  try {
    const { out, code } = await runQuiet(['spec-env', 'review', 'feat-thing', '--dir', fx.dir])
    assert.match(out, /^spec-env review: no branch matches 2028\/Q\? — run spec-env base to fetch$/m)
    assert.match(out, OFFER)
    assert.strictEqual(code, 1)

    const json = JSON.parse((await runQuiet(['spec-env', 'review', 'feat-thing', '--json', '--dir', fx.dir])).out)
    assert.strictEqual(json.blocked, true)
    assert.deepStrictEqual(json.offer, {
      kind: 'satisfy',
      label: 'Use main as the base for now',
      command: 'skitterspec spec-env base --use-fallback',
    })
  } finally {
    cleanup(fx)
  }
})

test('up in the gap refuses with the same offer', async () => {
  const fx = scaffold()
  try {
    const { out, code } = await runQuiet(['spec-env', 'up', 'feat-other', '--dir', fx.dir])
    assert.match(out, /^spec-env up: no branch matches 2028\/Q\?/m)
    assert.match(out, OFFER)
    assert.strictEqual(code, 1)
  } finally {
    cleanup(fx)
  }
})

test('no fallback resolvable → the refusal names no offer (stays silent)', async () => {
  const fx = scaffold()
  try {
    git(fx.dir, ['remote', 'set-head', 'origin', '--delete'])
    const { out, code } = await runQuiet(['spec-env', 'review', 'feat-thing', '--dir', fx.dir])
    assert.match(out, /no branch matches 2028\/Q\?/)
    assert.doesNotMatch(out, /offer:/)
    assert.strictEqual(code, 1)
  } finally {
    cleanup(fx)
  }
})

// --- after the pick ----------------------------------------------------------

test('after --use-fallback, review uses it and says so beside the base', async () => {
  const fx = scaffold()
  try {
    assert.strictEqual((await pin(fx.dir)).code, 0)
    const { out, code } = await runQuiet(['spec-env', 'review', 'feat-thing', '--dir', fx.dir])
    assert.strictEqual(code, 0)
    assert.match(out, /^ {2}base: main — no 2028\/Q\? branch on origin — pinned for the gap$/m)
    const json = JSON.parse((await runQuiet(['spec-env', 'review', 'feat-thing', '--json', '--dir', fx.dir])).out)
    assert.strictEqual(json.baseGap, 'no 2028/Q? branch on origin — pinned for the gap')
  } finally {
    cleanup(fx)
  }
})

test('after --use-fallback, up forks and status names the pinned base', async () => {
  const fx = scaffold()
  try {
    await pin(fx.dir)
    const up = await runQuiet(['spec-env', 'up', 'feat-other', '--dir', fx.dir])
    assert.strictEqual(up.code, 0)
    assert.match(up.out, /git worktree add \S+ -b feat\/other/)
    const status = await runQuiet(['spec-env', 'status', '--dir', fx.dir])
    assert.match(status.out, /^spec-env: base main — no 2028\/Q\? branch on origin — pinned for the gap$/m)
  } finally {
    cleanup(fx)
  }
})

test('a release branch appearing retires the pin on the next command, whatever it is', async () => {
  const fx = scaffold()
  try {
    await pin(fx.dir)
    git(fx.dir, ['switch', '-q', '-c', '2028/Q1'])
    commit(fx.dir, 'q1.txt', 'q1 cut', '2020-03-01T00:00:00Z')
    git(fx.dir, ['switch', '-q', 'main'])
    git(fx.dir, ['push', '-q', 'origin', '2028/Q1'])
    const status = await runQuiet(['spec-env', 'status', '--dir', fx.dir])
    assert.doesNotMatch(status.out, /pinned for the gap/)
    assert.ok(!fs.existsSync(path.join(fx.dir, '.spec-env', 'base-pin.json')))
  } finally {
    cleanup(fx)
  }
})

// --- the main guard: cannot-tell until a pick, then it guards the fallback ---

test('main guard fails open in the gap, and refuses on main once pinned', async () => {
  const fx = scaffold({ config: { baseBranchPattern: '2028/Q?', guards: { baseIsLandingZone: true } } })
  try {
    const reader = (cwd) => (args) => {
      try {
        return git(cwd, args)
      } catch {
        return null
      }
    }
    const before = loadEnvConfig(fx.dir).config
    assert.strictEqual(checkMainWrite(fx.dir, before, reader(fx.dir), { present: true }).refuse, false)

    await pin(fx.dir)
    const after = loadEnvConfig(fx.dir).config
    const verdict = checkMainWrite(fx.dir, after, reader(fx.dir), { present: true })
    assert.strictEqual(verdict.refuse, true)
    assert.strictEqual(verdict.baseBranch, 'main')
  } finally {
    cleanup(fx)
  }
})

// --- stays silent ------------------------------------------------------------

test('no pattern: no offer, no gap line, and the pin file is never consulted', async () => {
  const fx = scaffold({ config: {} })
  try {
    fs.mkdirSync(path.join(fx.dir, '.spec-env'), { recursive: true })
    fs.writeFileSync(
      path.join(fx.dir, '.spec-env', 'base-pin.json'),
      JSON.stringify({ base: 'elsewhere', pattern: '2028/Q?' }),
    )
    const review = await runQuiet(['spec-env', 'review', 'feat-thing', '--dir', fx.dir])
    const status = await runQuiet(['spec-env', 'status', '--dir', fx.dir])
    for (const { out } of [review, status]) assert.doesNotMatch(out, /offer:|pinned for the gap|elsewhere/)
    assert.strictEqual(review.code, 0)
  } finally {
    cleanup(fx)
  }
})

test('a matching pattern: no offer and no gap line', async () => {
  const fx = scaffold({ config: { baseBranchPattern: 'mai?' } })
  try {
    const review = await runQuiet(['spec-env', 'review', 'feat-thing', '--dir', fx.dir])
    assert.strictEqual(review.code, 0)
    assert.doesNotMatch(review.out, /offer:|pinned for the gap/)
  } finally {
    cleanup(fx)
  }
})

// --- /spec-idea is a write: it commits onto the base -------------------------

test('idea in the gap refuses with the offer, then lists against the pinned base', async () => {
  const { ideaCommand } = require('../src/ideacmd.js')
  const fx = scaffold()
  const capture = () => {
    let text = ''
    return { write: (c) => ((text += c), true), text: () => text }
  }
  try {
    const refused = capture()
    assert.strictEqual(await ideaCommand(['list'], { cwd: fx.dir, out: refused }), 1)
    assert.match(refused.text(), /^idea: no branch matches 2028\/Q\?/m)
    assert.match(refused.text(), OFFER)

    await pin(fx.dir)
    const listed = capture()
    assert.strictEqual(await ideaCommand(['list'], { cwd: fx.dir, out: listed }), 0)
    assert.doesNotMatch(listed.text(), /no branch matches/)
  } finally {
    cleanup(fx)
  }
})
