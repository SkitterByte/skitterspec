'use strict'

/**
 * `/spec-remote-review`, and the `--set` the engine grew for it.
 *
 * WHY A COMMAND AND NOT A LINK. The banner is markdown in a terminal, so the
 * only clickable thing it has is a URL — and a URL that acts when it is
 * *fetched* is one a link previewer or a browser prefetcher can fire with no
 * person involved. Three guarded shapes were weighed and all three were more
 * machinery than the problem deserves. What was actually wanted is simpler: say
 * the command, so nobody has to reconstruct it from a render they are reading on
 * a phone.
 *
 * `--set` exists because a slash command makes ONE static substitution: the word
 * the person typed has to reach the engine as a word, not as a flag the command
 * file worked out. An empty value is the bare command, and it toggles.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

const COMMAND = path.join(__dirname, '..', 'assets', 'commands', 'spec-remote-review.md')

function repo(review) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-remotecmd-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, ...(review ? { review } : {}) }, null, 2) + '\n',
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')
  return dir
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  const code = process.exitCode
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
    process.exitCode = code
  }
  return out
}

const allowRemote = (dir) => {
  const c = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'))
  return c.review && c.review.allowRemote
}
const set = (dir, ...extra) =>
  runQuiet(['spec-env', 'review', 'allow', 'remote', '--set', ...extra, '--dir', dir])

// --- the toggle -----------------------------------------------------------

test('an empty --set toggles off from the default', async () => {
  const dir = repo()
  try {
    // The shipped default is `allowRemote: false`, so a bare toggle turns it on.
    const out = await set(dir, '')
    assert.match(out, /remote reviews are now ON/)
    assert.strictEqual(allowRemote(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an empty --set toggles back, reading what the file now says', async () => {
  const dir = repo({ allowRemote: true })
  try {
    await set(dir, '')
    assert.strictEqual(allowRemote(dir), false)
    await set(dir, '')
    assert.strictEqual(allowRemote(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('--set on and --set off are explicit, and say when nothing changed', async () => {
  const dir = repo({ allowRemote: true })
  try {
    const same = await set(dir, 'on')
    assert.match(same, /ON \(unchanged\)/)
    assert.strictEqual(allowRemote(dir), true)
    await set(dir, 'off')
    assert.strictEqual(allowRemote(dir), false)
    // Case is not a trap for someone typing on a phone keyboard.
    await set(dir, 'ON')
    assert.strictEqual(allowRemote(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// REFUSED BY NAME, like an unknown tier. Coercing a misspelt state to a default
// would either open a port or permit a publish on a typo.
test('an unknown state is refused by name, and writes nothing', async () => {
  const dir = repo({ allowRemote: false })
  try {
    const out = await set(dir, 'maybe')
    assert.match(out, /"maybe" is not a state — one of on, off, or nothing at all to toggle/)
    assert.match(out, /Nothing changed/)
    assert.strictEqual(allowRemote(dir), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// STAYS SILENT (`.claude/rules/negative-checks.md` rule 3): the two forms that
// existed before `--set` behave exactly as they did. Every caller and test in
// the repo reads those, and a new flag must not move them.
test('STAYS SILENT: bare allow and --off are untouched by --set existing', async () => {
  const dir = repo({ allowRemote: false })
  try {
    await runQuiet(['spec-env', 'review', 'allow', 'remote', '--dir', dir])
    assert.strictEqual(allowRemote(dir), true, 'bare still means ON')
    await runQuiet(['spec-env', 'review', 'allow', 'remote', '--off', '--dir', dir])
    assert.strictEqual(allowRemote(dir), false, '--off still means OFF')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the command file -----------------------------------------------------

test('the command ships, and is user-only like its two siblings', () => {
  const text = fs.readFileSync(COMMAND, 'utf8')
  assert.match(text, /^disable-model-invocation: true$/m)
  assert.match(text, /^argument-hint: "\[on \| off\]"$/m)
  // ONE VERB, RELAYED. That is what makes these commands rather than skills:
  // there is no judgement to apply and no model turn spent finding one.
  assert.match(text, /spec-env review allow remote --set "\$ARGUMENTS"/)
  assert.match(text, /Relay the engine output above verbatim/)
})

// The quotes are load-bearing: unquoted, a bare invocation drops the argument
// entirely and `--set` swallows the next flag or nothing at all. Quoted, bare
// passes an empty string — which is the toggle.
test('the argument is quoted, so bare reaches the engine as the empty form', () => {
  const text = fs.readFileSync(COMMAND, 'utf8')
  assert.match(text, /--set "\$ARGUMENTS"/, 'quoted, or bare loses the empty argument')
})

test('the command says permitting is not publishing', () => {
  const text = fs.readFileSync(COMMAND, 'utf8')
  assert.match(text, /permits publishing; it publishes nothing/)
  assert.match(text, /skitterspec cannot delete/)
  // And that it writes a shared, committed file — the one consequence a reader
  // would not guess from the name.
  assert.match(text, /COMMITTED file|committed file/)
  assert.match(text, /primary\s*\n?checkout/)
})

// Only `remote` gets one. `network` is ON by default, so turning it off is a
// rare deliberate act, and a slash command per tier is clutter for the tier
// nobody touches — the engine accepts `--set` for both either way.
//
// The list is exhaustive rather than a membership check, so a command added for
// some other reason still has to come past this comment. `allow-main` did, and
// belongs: it is the main guard's exit, not a review tier. `spec-skip` did
// too, and belongs for the same shape of reason: it is the REVIEW GATE's exit —
// the same `spec-env review skip "<reason>"` that always existed, at an address
// a person will type — and not a tier toggle.
test('STAYS SILENT: no command was shipped for the tier nobody touches', () => {
  const dir = path.dirname(COMMAND)
  const shipped = fs.readdirSync(dir).sort()
  assert.deepStrictEqual(shipped, [
    'allow-main.md',
    'spec-connect.md',
    'spec-live.md',
    'spec-remote-review.md',
    'spec-skip.md',
  ])
  assert.ok(
    !shipped.some((f) => /network/.test(f)),
    'still nothing for the network tier',
  )
})

test('--set works for network too, so shipping a command later is one file', async () => {
  const dir = repo({ allowNetwork: true })
  try {
    await runQuiet(['spec-env', 'review', 'allow', 'network', '--set', '', '--dir', dir])
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'))
    assert.strictEqual(c.review.allowNetwork, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
