'use strict'

/**
 * `spec-sync credentials` — the two halves of setting a key.
 *
 * `status` is the half a SKILL runs: readiness, never the value. `set` is the
 * half a HUMAN runs in their own terminal. The tests below assert that split
 * holds, because it is the security property the feature exists for — a key
 * pasted into a conversation enters the transcript and is sent to the model, so
 * relocating the store would be pointless if the key travelled there to get in.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable, PassThrough } = require('node:stream')

const { specSync } = require('../src/cli-sync.js')

const TEAM = 'team-abc'
const SECRET = 'lin_api_zzzz9999'

function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cli-cred-'))
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-xdg-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({ linear: { teamKey: 'SKS', teamId: TEAM } }),
  )
  return {
    dir,
    xdg,
    file: path.join(xdg, 'skitterspec', 'credentials.json'),
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(xdg, { recursive: true, force: true })
    },
  }
}

// Drive the CLI with a captured stdout and an injected env/stdin.
async function run(argv, s, { stdin, input } = {}) {
  let out = ''
  const io = {
    out: { write: (c) => ((out += c), true) },
    err: { write: () => true },
    env: { XDG_CONFIG_HOME: s.xdg },
    ...(input ? { input } : {}),
  }
  const orig = process.stdin
  if (stdin) Object.defineProperty(process, 'stdin', { value: Readable.from([stdin]), configurable: true })
  try {
    const code = await specSync([...argv, '--dir', s.dir], io)
    return { code, out }
  } finally {
    if (stdin) Object.defineProperty(process, 'stdin', { value: orig, configurable: true })
  }
}

test('status reports "not set" and names the command, without a key anywhere', async () => {
  const s = scaffold()
  try {
    const { code, out } = await run(['credentials', 'status'], s)
    assert.notStrictEqual(code, 0, 'not-ready is a non-zero result a skill can branch on')
    assert.match(out, /key: +not set/)
    assert.match(out, /credentials set/, 'names the command to run')
    assert.match(out, /in your own terminal/, 'says who runs it')
  } finally {
    s.cleanup()
  }
})

test('set --stdin stores the key at 0600, preserving other teams', async () => {
  const s = scaffold()
  try {
    fs.mkdirSync(path.dirname(s.file), { recursive: true })
    fs.writeFileSync(s.file, JSON.stringify({ version: 1, teams: { other: { key: 'keep-me' } } }), { mode: 0o600 })

    const { code, out } = await run(['credentials', 'set', '--stdin'], s, { stdin: `${SECRET}\n` })
    assert.strictEqual(code, 0)
    assert.match(out, /key stored/)
    assert.doesNotMatch(out, new RegExp(SECRET), 'the confirmation must not echo the key')

    assert.strictEqual((fs.statSync(s.file).mode & 0o777).toString(8), '600')
    const store = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
    assert.strictEqual(store.teams[TEAM].key, SECRET)
    assert.strictEqual(store.teams.other.key, 'keep-me', 'other teams survive')
  } finally {
    s.cleanup()
  }
})

test('--key is refused, and its value never reaches the output', async () => {
  const s = scaffold()
  try {
    const { code, out } = await run(['credentials', 'set', '--key', SECRET], s)
    assert.notStrictEqual(code, 0)
    assert.match(out, /--key is not supported/)
    assert.match(out, /shell history/, 'says why, so it does not read as an oversight')
    assert.doesNotMatch(out, new RegExp(SECRET), 'the rejected value is not echoed back')
    assert.ok(!fs.existsSync(s.file), 'and nothing was written')
  } finally {
    s.cleanup()
  }
})

test('status masks the key and names its source once one is set', async () => {
  const s = scaffold()
  try {
    await run(['credentials', 'set', '--stdin'], s, { stdin: SECRET })
    const { code, out } = await run(['credentials', 'status'], s)
    assert.strictEqual(code, 0)
    assert.match(out, /key: +set — …9999 from the store/)
    assert.doesNotMatch(out, new RegExp(SECRET), 'status never prints the value')
  } finally {
    s.cleanup()
  }
})

test('status --json is machine-readable and still carries no key', async () => {
  const s = scaffold()
  try {
    await run(['credentials', 'set', '--stdin'], s, { stdin: SECRET })
    const { out } = await run(['credentials', 'status', '--json'], s)
    const payload = JSON.parse(out)
    assert.strictEqual(payload.key.present, true)
    assert.strictEqual(payload.key.source, 'store')
    assert.strictEqual(payload.key.fingerprint, '…9999')
    assert.doesNotMatch(out, new RegExp(SECRET))
  } finally {
    s.cleanup()
  }
})

test('unset removes only this team, and is a clean no-op when absent', async () => {
  const s = scaffold()
  try {
    const empty = await run(['credentials', 'unset'], s)
    assert.strictEqual(empty.code, 0, 'nothing to remove is not a failure')
    assert.match(empty.out, /nothing to remove/)

    await run(['credentials', 'set', '--stdin'], s, { stdin: SECRET })
    fs.writeFileSync(
      s.file,
      JSON.stringify({ version: 1, teams: { [TEAM]: { key: SECRET }, other: { key: 'keep-me' } } }),
      { mode: 0o600 },
    )
    const { code, out } = await run(['credentials', 'unset'], s)
    assert.strictEqual(code, 0)
    assert.match(out, /removed the key/)
    const store = JSON.parse(fs.readFileSync(s.file, 'utf-8'))
    assert.ok(!store.teams[TEAM], 'this team is gone')
    assert.strictEqual(store.teams.other.key, 'keep-me', 'the other is not')
  } finally {
    s.cleanup()
  }
})

test('set refuses to prompt when stdin is not a terminal', async () => {
  const s = scaffold()
  try {
    const { code, out } = await run(['credentials', 'set'], s)
    assert.notStrictEqual(code, 0)
    assert.match(out, /not a terminal/)
    assert.match(out, /--stdin/, 'offers the pipe instead')
  } finally {
    s.cleanup()
  }
})

test('--stdin on a terminal refuses instead of waiting for an EOF', async () => {
  // Reported from the field: `credentials set --stdin` typed at a prompt printed
  // nothing and never returned. Nothing was piped, so it sat waiting for an
  // end-of-input a terminal never sends — a silent, indefinite wait that reads
  // as a crash. A TTY on stdin is positive evidence that no pipe exists.
  const s = scaffold()
  try {
    const tty = new PassThrough()
    tty.isTTY = true
    const { code, out } = await run(['credentials', 'set', '--stdin'], s, { input: tty })
    assert.notStrictEqual(code, 0, 'it returns rather than hanging')
    assert.match(out, /--stdin expects a pipe/)
    assert.match(out, /without --stdin to be prompted/, 'names the interactive form')
  } finally {
    s.cleanup()
  }
})

test('a repo with no teamId refuses rather than writing an unkeyable entry', async () => {
  const s = scaffold()
  try {
    fs.writeFileSync(
      path.join(s.dir, 'specs', '.core', 'linear.config.json'),
      JSON.stringify({ linear: { teamKey: '', teamId: '' } }),
    )
    const { code, out } = await run(['credentials', 'status'], s)
    assert.notStrictEqual(code, 0)
    assert.match(out, /no linear\.teamId/)
    assert.match(out, /init-config/, 'names the fix')
  } finally {
    s.cleanup()
  }
})
