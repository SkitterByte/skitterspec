'use strict'

/**
 * The review server must outlive the checkout that happened to start it.
 *
 * The bug: `serveProcFor` built the daemon's command from `__dirname` — the
 * module directory of whichever copy of the CLI was executing. Started from a
 * worktree, the daemon ran the worktree's `serve.js`, whose `review.js`
 * resolves the page template into the worktree's `assets/`. The worktree was
 * torn down at `/spec-complete`, the daemon kept answering on its port, and
 * every render failed with ENOENT — for every spec, not just that one.
 *
 * Everything else was already primary-owned (`cli.js` resolves `dir` with
 * `resolvePrimaryCheckout` before any spec-env command runs), so the script
 * path is the whole of it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { serveProcFor, serverScriptOk } = require('../src/cli.js')

const CONFIG = { registry: '.spec-env/registry.json' }

// The two layouts a real checkout holds the daemon in: this monorepo developing
// itself, and a project that installed the published package.
const LAYOUTS = {
  monorepo: path.join('packages', 'common', 'src', 'env', 'serve.js'),
  installed: path.join('node_modules', '@skitterbyte', 'skitterspec', 'src', 'env', 'serve.js'),
}
const SERVE_REL = LAYOUTS.monorepo

function fakeCheckout({ withServe, layout = 'monorepo' }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-own-')))
  if (withServe) {
    const rel = LAYOUTS[layout]
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), '// a copy of the daemon\n')
  }
  return dir
}

// --- the script path follows the primary checkout, not the caller -----------

test('the daemon is launched from the primary checkout, not from whoever started it', () => {
  const primary = fakeCheckout({ withServe: true })
  try {
    const proc = serveProcFor(CONFIG, path.join(primary, '.spec-env', 'review-serve.json'), {
      root: primary,
    })
    assert.ok(
      proc.command.includes(path.join(primary, SERVE_REL)),
      `the command should name the primary checkout's copy, got:\n  ${proc.command}`,
    )
    // The precise failure this test exists for: a command naming a path inside
    // a worktree is a command that stops working when the worktree is removed.
    assert.ok(
      !proc.command.includes(__dirname),
      'the launching copy must not leak into the command',
    )
  } finally {
    fs.rmSync(primary, { recursive: true, force: true })
  }
})

test('an installed project is found too, not just this monorepo', () => {
  // The published package lives under node_modules, so a fix that only knew
  // this repo's own layout would leave every consumer exactly as broken.
  const primary = fakeCheckout({ withServe: true, layout: 'installed' })
  try {
    const proc = serveProcFor(CONFIG, path.join(primary, '.spec-env', 'review-serve.json'), {
      root: primary,
    })
    assert.ok(
      proc.command.includes(path.join(primary, LAYOUTS.installed)),
      `should find the installed copy, got:\n  ${proc.command}`,
    )
  } finally {
    fs.rmSync(primary, { recursive: true, force: true })
  }
})

test('a checkout with no copy of the daemon falls back to the running one', () => {
  // A global install, or `npx` — an ordinary state, not a fault. Three states,
  // and the unknown one keeps today's behaviour rather than refusing to serve.
  const bare = fakeCheckout({ withServe: false })
  try {
    const proc = serveProcFor(CONFIG, path.join(bare, '.spec-env', 'review-serve.json'), { root: bare })
    assert.ok(
      proc.command.includes(path.join('src', 'env', 'serve.js')),
      `should still name a serve.js, got:\n  ${proc.command}`,
    )
    assert.ok(!proc.command.includes(path.join(bare, SERVE_REL)), 'and not one that is not there')
  } finally {
    fs.rmSync(bare, { recursive: true, force: true })
  }
})

test('called with no root at all, it behaves exactly as it always did', () => {
  // Stays-silent: every existing caller passes two arguments.
  const proc = serveProcFor(CONFIG, '/tmp/x/.spec-env/review-serve.json')
  assert.strictEqual(proc.name, 'review-serve')
  assert.ok(proc.command.startsWith('node '))
  assert.ok(proc.command.endsWith('/tmp/x/.spec-env/review-serve.json'))
})

// --- a server that cannot serve is not adopted ------------------------------

test('a running server whose script is gone is not adoptable', () => {
  // The blind spot that made this invisible: adoption read a live pid and a
  // readable settings file and called that proof. Neither can see that the
  // code the process is executing has been deleted out from under it.
  assert.strictEqual(serverScriptOk({ script: path.join(os.tmpdir(), 'gone-', String(Date.now()), 's.js') }), false)
})

test('a server whose script is still there is adoptable', () => {
  const primary = fakeCheckout({ withServe: true })
  try {
    assert.strictEqual(serverScriptOk({ script: path.join(primary, SERVE_REL) }), true)
  } finally {
    fs.rmSync(primary, { recursive: true, force: true })
  }
})

test('a settings file written before this existed is still adoptable', () => {
  // STAYS SILENT. An older `review-serve.json` records no `script`, and that
  // absence is not evidence of anything — killing a working server over a key
  // it never had is the destructive reading of a cannot-tell
  // (`.claude/rules/negative-checks.md` rule 4).
  assert.strictEqual(serverScriptOk({ port: 7777, host: '127.0.0.1' }), true)
  assert.strictEqual(serverScriptOk({}), true)
  assert.strictEqual(serverScriptOk(null), true)
})
