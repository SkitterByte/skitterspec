'use strict'

/**
 * The review tiers: which surfaces a project permits, and what turns them on.
 *
 * They exist because the engine CANNOT KNOW where the reader is sitting and
 * kept being asked to guess. Three separate incidents in one day: detection
 * said `unknown` on a local session and produced a page whose buttons cannot
 * POST; it said `remote` and produced a LAN URL a phone off the network could
 * not reach; and it flipped mid-session, changing the address underneath a
 * reader. Each was fixed on its own — so the fix here is to stop guessing.
 *
 * Most of these are stays-silent tests (`.claude/rules/negative-checks.md`
 * rule 3): two new settings decide a BIND and a PUBLISH, and being wrong about
 * either is expensive in a way a wrong render is not.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { DEFAULT_CONFIG, loadEnvConfig } = require('../src/env/config.js')
const { reviewTierStack, reviewTierLine, reviewStackText, waitCovers, resolveReader, readerOffMachine } = require('../src/env/review.js')
const { run } = require('../src/cli.js')

// `run` reads the reader from `process.env`, and a reader on another machine
// hides the `local` tier — so a suite run over ssh, or inside a VM whose
// wrapper sets SKITTERSPEC_READER, would see a different stack from the one
// these tests describe. Scrubbed so each test states the world it is testing.
for (const k of ['SSH_CONNECTION', 'SSH_TTY', 'CLAUDE_CODE_BRIDGE_SESSION_ID', 'SKITTERSPEC_READER']) delete process.env[k]

function repo(review = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-tiers-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review }, null, 2) + '\n',
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

const cfg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'))
const allow = (dir, ...extra) => runQuiet(['spec-env', 'review', 'allow', ...extra, '--dir', dir])

// --- the settings -----------------------------------------------------------

test('the defaults are network on, remote off', () => {
  // Network on matches what the engine already did; remote off because a
  // publish is permanent and must never happen unasked.
  assert.strictEqual(DEFAULT_CONFIG.review.allowNetwork, true)
  assert.strictEqual(DEFAULT_CONFIG.review.allowRemote, false)
})

test('STAYS SILENT: a project with neither key gets the defaults', () => {
  const dir = repo()
  try {
    const { config } = loadEnvConfig(dir)
    assert.strictEqual(config.review.allowNetwork, true)
    assert.strictEqual(config.review.allowRemote, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('STAYS SILENT: a non-boolean leaves the default standing', () => {
  // A typo must not quietly widen a bind or permit a publish, which is the same
  // shape `serve` and `required` already follow.
  const dir = repo({ allowNetwork: 'no', allowRemote: 'yes' })
  try {
    const { config } = loadEnvConfig(dir)
    assert.strictEqual(config.review.allowNetwork, true, 'a string is not a refusal')
    assert.strictEqual(config.review.allowRemote, false, 'a string is not a permission')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the bind follows the setting, not the reader ---------------------------

test('the bind reads allowNetwork and not the reader', () => {
  const src = fs.readFileSync(require.resolve('../src/cli.js'), 'utf8')
  assert.match(src, /const host = config\.review\.allowNetwork \? '0\.0\.0\.0' : '127\.0\.0\.1'/)
  // And the old form is gone, not merely unused — reintroducing the guess must
  // fail rather than quietly satisfy a regex that only checks what is present.
  assert.doesNotMatch(src, /const host = reader\.reader === 'remote'/)
})

// --- the allow verb ---------------------------------------------------------

test('allow network --off writes the key, and back on again', async () => {
  const dir = repo()
  try {
    await allow(dir, 'network', '--off')
    assert.strictEqual(cfg(dir).review.allowNetwork, false)
    await allow(dir, 'network')
    assert.strictEqual(cfg(dir).review.allowNetwork, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('allow remote permits publishing, and publishes nothing', async () => {
  const dir = repo()
  try {
    // `--project`: the committed, every-spec form. Per spec is the default
    // now — `env-review-remote-per-spec.test.js` covers it.
    const out = await allow(dir, 'remote', '--project')
    assert.strictEqual(cfg(dir).review.allowRemote, true)
    assert.match(out, /PERMITS publishing; it publishes nothing/)
    assert.match(out, /cannot be\s+deleted by skitterspec/)
    assert.match(out, /needs \/spec-reviewed/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('it names the absolute path it wrote, and says that tree goes dirty', async () => {
  // Run from a worktree, `dir` is the PRIMARY checkout — so a path relative to
  // `dir` reads as the tree you are standing in and is wrong. Found by running
  // it from a worktree and having to revert the surprise.
  const dir = repo()
  try {
    const out = await allow(dir, 'network', '--off')
    assert.ok(out.includes(path.join(dir, 'specs', '.core', 'env.config.json')), 'absolute path')
    assert.match(out, /that is the primary checkout, whichever tree you ran this from/)
    assert.match(out, /COMMITTED/)
    assert.match(out, /leaves that tree dirty/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('it touches nothing else in the config', async () => {
  const dir = repo({ servePort: 7777 })
  try {
    const before = cfg(dir)
    await allow(dir, 'remote')
    const after = cfg(dir)
    assert.strictEqual(after.baseBranch, before.baseBranch)
    assert.deepStrictEqual(after.docker, before.docker)
    assert.strictEqual(after.review.servePort, 7777, 'a sibling review key survives')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown tier is refused by name, and writes nothing', async () => {
  const dir = repo()
  try {
    const before = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
    const out = await allow(dir, 'lan')
    assert.match(out, /"lan" is not a tier/)
    assert.match(out, /Nothing changed/)
    assert.strictEqual(
      fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'),
      before,
      'byte-identical',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a config it cannot parse is left alone rather than overwritten', async () => {
  // Cannot tell what is in there, so write nothing (rule 4). The refusal comes
  // from `loadEnvConfig`, which rejects the whole `spec-env` command before the
  // verb runs and names the parse position — stronger than the verb's own
  // re-read guard, which covers only a file changed mid-run. Asserted here
  // because the OUTCOME is what matters: the unreadable file survives.
  const dir = repo()
  const file = path.join(dir, 'specs', '.core', 'env.config.json')
  try {
    fs.writeFileSync(file, '{ "review": { oops }\n')
    await assert.rejects(
      () => allow(dir, 'network', '--off'),
      /Invalid specs\/\.core\/env\.config\.json/,
      'the command refuses, naming the file',
    )
    assert.match(fs.readFileSync(file, 'utf8'), /oops/, 'and the file is untouched')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('setting a tier to what it already is says so rather than pretending to change it', async () => {
  const dir = repo({ allowRemote: true })
  try {
    const out = await allow(dir, 'remote', '--project')
    assert.match(out, /\(unchanged\)/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the stack -------------------------------------------------------------

/**
 * The render, run in a CHILD PROCESS rather than in-process.
 *
 * `runQuiet` hijacks `process.stdout.write`, and `node --test` writes its own
 * report to the same stream — so a call that awaits long enough (a render does,
 * it starts a server) captures the runner's binary protocol along with the
 * output. That produced a `--json` parse failure and a stays-silent test
 * matching `/error|failed/` against an embedded `test:fail` event. A child owns
 * its own stdout, which is the pattern the other serving suites already use.
 */
function review(dir, ...extra) {
  return reviewWith({}, dir, ...extra)
}

// The same render with variables added to the child's environment — how a test
// states that the reader is on another machine.
function reviewWith(env, dir, ...extra) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, (e) => { console.error(e); process.exit(1) })'
  return execFileSync(
    'node',
    ['-e', script, 'spec-env', 'review', 'feat-alpha', '--dir', dir, ...extra],
    { encoding: 'utf-8', env: { ...process.env, ...env } },
  )
}

function repoWithSpec(review_ = {}, port) {
  const dir = repo({ reader: 'local', ...review_, servePort: port })
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'spec')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  g('worktree', 'add', '-q', '-b', 'feat/alpha', wt)
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

function stopServe(dir) {
  const script =
    `const { run } = require(${JSON.stringify(path.resolve(__dirname, '../src/cli.js'))});` +
    'run(process.argv.slice(1)).then(() => {}, () => {})'
  try {
    execFileSync('node', ['-e', script, 'spec-env', 'review', 'serve', '--stop', '--dir', dir], {
      stdio: 'ignore',
    })
  } catch {}
}

function freePort() {
  const net = require('node:net')
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

test('every tier is listed, in a fixed order, labelled', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const out = review(dir)
    const order = [...out.matchAll(/^ {2}(local|network|remote):/gm)].map((m) => m[1])
    // FIXED ORDER, not availability order: a reader who has learnt which line
    // their phone opens must not have to re-read the labels every render.
    assert.deepStrictEqual(order, ['local', 'network', 'remote'])
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('local is the loopback http URL, never file:// when served', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: +http:\/\/127\.0\.0\.1:\d+\//m)
    assert.doesNotMatch(out, /^ {2}local: +file:\/\//m, 'a file:// page cannot send a verdict')
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('a disabled tier names the command that turns it on, and shows no URL', async () => {
  const { dir } = repoWithSpec({ allowNetwork: false }, await freePort())
  try {
    const out = review(dir)
    assert.match(out, /^ {2}network: +off — turn on with: skitterspec spec-env review allow network$/m)
    const net = /^ {2}network:.*$/m.exec(out)[0]
    assert.doesNotMatch(net, /http:\/\//, 'off means no URL at all')
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('remote permitted but unpublished says publishing is an ask', async () => {
  const { dir } = repoWithSpec({ allowRemote: true }, await freePort())
  try {
    const out = review(dir)
    assert.match(out, /^ {2}remote: +— +\(publishing is an ask — nothing published yet\)$/m)
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('the stack says which tiers the wait covers, once', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const out = review(dir)
    const said = out.match(/the wait covers local \+ network/g) || []
    assert.strictEqual(said.length, 1, 'said once, not per tier')
    assert.match(out, /a remote verdict needs \/spec-reviewed/)
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('--json carries the same tiers, so a skill never parses prose', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const d = JSON.parse(review(dir, '--json'))
    assert.deepStrictEqual(
      d.tiers.map((t) => t.tier),
      ['local', 'network', 'remote'],
    )
    assert.match(d.tiers[0].url, /^http:\/\/127\.0\.0\.1:/)
    assert.strictEqual(d.tiers[2].off, true)
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('virtual adapters are never offered as alternatives', () => {
  // The ranking already put them last, so the best guess was right; what was
  // wrong was offering them at all. A render listed two Parallels addresses as
  // alternatives to a working link, and no phone can route to either.
  const { offerableLanAddresses } = require('../src/cli.js')
  const nets = {
    en0: [{ family: 'IPv4', internal: false, address: '192.168.0.10' }],
    bridge100: [{ family: 'IPv4', internal: false, address: '10.211.55.2' }],
    utun3: [{ family: 'IPv4', internal: false, address: '10.37.129.2' }],
    weird9: [{ family: 'IPv4', internal: false, address: '172.20.0.5' }],
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  }
  assert.deepStrictEqual(offerableLanAddresses(nets), ['192.168.0.10', '172.20.0.5'])
  // `weird9` matches neither pattern and is KEPT: a machine with unusual naming
  // is likelier to have a real address than a fake one, and being wrong that
  // way offers one dud where the opposite hides the only address that works.
})

test('a tailnet address on a utun adapter is offered, after the LAN', () => {
  // macOS puts Tailscale on `utunN`, which the virtual filter drops — so a phone
  // on the tailnet but off the wifi was never handed a link it could open.
  // 100.64.0.0/10 is the CGNAT range Tailscale assigns from, and is the signal.
  const { offerableLanAddresses } = require('../src/cli.js')
  const nets = {
    utun4: [{ family: 'IPv4', internal: false, address: '100.101.7.42' }],
    en0: [{ family: 'IPv4', internal: false, address: '192.168.0.10' }],
    utun3: [{ family: 'IPv4', internal: false, address: '10.37.129.2' }],
  }
  assert.deepStrictEqual(offerableLanAddresses(nets), ['192.168.0.10', '100.101.7.42'])
})

test('STAYS SILENT: an address just outside 100.64.0.0/10 on utun is still dropped', () => {
  const { offerableLanAddresses } = require('../src/cli.js')
  const nets = {
    en0: [{ family: 'IPv4', internal: false, address: '192.168.0.10' }],
    utun5: [{ family: 'IPv4', internal: false, address: '100.128.0.1' }],
    utun6: [{ family: 'IPv4', internal: false, address: '100.63.255.1' }],
  }
  assert.deepStrictEqual(offerableLanAddresses(nets), ['192.168.0.10'])
})

test('a tailnet alternate is labelled so it reads apart from the LAN one', () => {
  const { tailnetLabel } = require('../src/cli.js')
  assert.strictEqual(tailnetLabel('http://100.101.7.42:7760/tok/bug-x'), ' (tailnet)')
  assert.strictEqual(tailnetLabel('http://192.168.0.10:7760/tok/bug-x'), '')
})

// --- the alternates belong to the network tier -------------------------------
//
// The `also:` lines used to be appended AFTER the whole stack — below `remote:`
// — and the tiers carried them as bare strings, so a skill copying the stack
// from `--json` had no label to copy and no place the contract let it put one.
// The tailnet link the engine had found never reached the banner a reader saw.

test('a tailnet alternate reaches the tiers labelled, under network', () => {
  // The full path a real render takes: fake adapters → ranked offers → served
  // URLs → the stack. en0 is the best guess; utun4 is the tailnet runner-up.
  const { offerableLanAddresses, reviewServedUrls } = require('../src/cli.js')
  const nets = {
    en0: [{ family: 'IPv4', internal: false, address: '192.168.0.10' }],
    utun4: [{ family: 'IPv4', internal: false, address: '100.101.7.42' }],
  }
  const served = reviewServedUrls(
    { port: 7760, token: 'tok', loopback: false },
    offerableLanAddresses(nets),
    'bug-x',
  )
  const stack = reviewTierStack({
    served,
    fileUrl: 'file:///x',
    publishedUrl: null,
    config: { review: { allowNetwork: true, allowRemote: false } },
  })
  const network = stack.find((t) => t.tier === 'network')
  assert.deepStrictEqual(network.alternates, [
    { url: 'http://100.101.7.42:7760/tok/bug-x', label: 'tailnet' },
  ])
})

test('the also: line renders under the network tier, inside its line', () => {
  // One line per tier was the shape; an alternate is PART of the network tier,
  // so its line carries it — which is what puts it above `remote:` rather than
  // dangling after the stack.
  const line = reviewTierLine({
    tier: 'network',
    url: 'http://192.168.0.10:7760/tok/bug-x',
    alternates: [{ url: 'http://100.101.7.42:7760/tok/bug-x', label: 'tailnet' }],
  })
  assert.strictEqual(
    line,
    '  network: http://192.168.0.10:7760/tok/bug-x\n' +
      '    also:  http://100.101.7.42:7760/tok/bug-x (tailnet)',
  )
})

test('STAYS SILENT: a LAN alternate carries no label, and no alternates means one line', () => {
  const lan = reviewTierLine({
    tier: 'network',
    url: 'http://192.168.0.10:7760/tok/bug-x',
    alternates: [{ url: 'http://192.168.1.20:7760/tok/bug-x' }],
  })
  assert.strictEqual(
    lan,
    '  network: http://192.168.0.10:7760/tok/bug-x\n    also:  http://192.168.1.20:7760/tok/bug-x',
  )
  const bare = reviewTierLine({ tier: 'network', url: 'http://192.168.0.10:7760/tok/bug-x', alternates: [] })
  assert.strictEqual(bare, '  network: http://192.168.0.10:7760/tok/bug-x')
})

test('STAYS SILENT: virtual adapters still never reach the tiers', () => {
  // bridge100 and 10.211.55.2 are Parallels; utun3 at 10.37.129.2 is a utun
  // that is NOT in the tailnet range. None of them may become an `also:` line.
  const { offerableLanAddresses, reviewServedUrls } = require('../src/cli.js')
  const nets = {
    en0: [{ family: 'IPv4', internal: false, address: '192.168.0.10' }],
    bridge100: [{ family: 'IPv4', internal: false, address: '10.211.55.2' }],
    utun3: [{ family: 'IPv4', internal: false, address: '10.37.129.2' }],
  }
  const served = reviewServedUrls(
    { port: 7760, token: 'tok', loopback: false },
    offerableLanAddresses(nets),
    'bug-x',
  )
  const stack = reviewTierStack({
    served,
    fileUrl: 'file:///x',
    publishedUrl: null,
    config: { review: { allowNetwork: true, allowRemote: false } },
  })
  assert.deepStrictEqual(stack.find((t) => t.tier === 'network').alternates, [])
})

test('STAYS SILENT: a machine with no network address reports it, not an error', async () => {
  const { dir } = repoWithSpec({ allowNetwork: false }, await freePort())
  try {
    const out = review(dir)
    assert.doesNotMatch(out, /error|failed/i, 'no network is not a fault')
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

// THE OFF LINE NAMES A COMMAND A PERSON TYPES. It used to hand over
// `skitterspec spec-env review allow remote` — correct, and nothing anyone
// reconstructs from a render they are reading on a phone. `/spec-remote-review`
// toggles, so the same line works whichever way the tier currently is.
test('a disabled remote names its slash command, not the engine verb', () => {
  const stack = reviewTierStack({
    served: null,
    fileUrl: 'file:///x',
    publishedUrl: null,
    config: { review: { allowNetwork: true, allowRemote: false } },
  })
  const remote = stack.find((t) => t.tier === 'remote')
  assert.strictEqual(remote.enable, '/spec-remote-review')
  assert.strictEqual(reviewTierLine(remote), '  remote:  off — turn on with: /spec-remote-review')
})

// STAYS SILENT: `network` keeps the engine command, deliberately. It is ON by
// default, so turning it off is a rare deliberate act — a slash command per
// tier is clutter for the one nobody touches.
test('STAYS SILENT: a disabled network keeps naming the engine command', () => {
  const stack = reviewTierStack({
    served: null,
    fileUrl: 'file:///x',
    publishedUrl: null,
    config: { review: { allowNetwork: false, allowRemote: true } },
  })
  const network = stack.find((t) => t.tier === 'network')
  assert.strictEqual(network.enable, 'skitterspec spec-env review allow network')
  assert.doesNotMatch(reviewTierLine(network), /\/spec-/)
})

// --- a reader on another machine ---------------------------------------------
//
// The engine running in a VM (a wrapper's `prlctl exec`) or over ssh, read
// from a browser elsewhere: `127.0.0.1` is the wrong machine, so `local` is a
// door that never opens. Only a signal someone set on purpose hides it.

const SERVED = {
  loopbackUrl: 'http://127.0.0.1:7760/tok/bug-x',
  url: 'http://192.168.0.10:7760/tok/bug-x',
  alternates: [],
  loopback: false,
}
const ON = { review: { allowNetwork: true, allowRemote: false } }
const stackFor = (reader, served = SERVED, config = ON) =>
  reviewTierStack({ served, fileUrl: 'file:///x', publishedUrl: null, config, reader })

test('SKITTERSPEC_READER outranks the committed setting and ssh', () => {
  assert.deepStrictEqual(resolveReader({ review: { reader: 'local' } }, { SKITTERSPEC_READER: 'remote' }), {
    reader: 'remote',
    why: 'SKITTERSPEC_READER',
  })
  // `local` is the way back for ssh with a port forward, where loopback reaches.
  assert.strictEqual(resolveReader({}, { SKITTERSPEC_READER: 'Local', SSH_CONNECTION: 'x' }).reader, 'local')
})

test('STAYS SILENT: an unrecognised SKITTERSPEC_READER falls through', () => {
  assert.deepStrictEqual(resolveReader({}, { SKITTERSPEC_READER: 'vm' }), { reader: 'unknown', why: null })
  assert.deepStrictEqual(resolveReader({}, { SKITTERSPEC_READER: '' }), { reader: 'unknown', why: null })
})

test('a remote reader with network serving gets no local line, network first', () => {
  const tiers = stackFor(resolveReader({}, { SKITTERSPEC_READER: 'remote' }))
  const text = reviewStackText(tiers)
  assert.doesNotMatch(text, /local:/)
  assert.match(text, /^ {2}network: http:\/\/192\.168\.0\.10/)
  // Still in the data, marked — the decision is visible, not an absence.
  assert.deepStrictEqual(tiers[0], {
    tier: 'local',
    url: SERVED.loopbackUrl,
    hidden: true,
    reason: 'the reader is on another machine (SKITTERSPEC_READER)',
  })
  assert.deepStrictEqual(waitCovers(tiers), ['network'])
})

test('ssh alone hides it too', () => {
  const tiers = stackFor(resolveReader({}, { SSH_CONNECTION: '10.0.0.1 1 10.0.0.2 22' }))
  assert.strictEqual(tiers[0].hidden, true)
})

test('a Windows session with no desktop hides it too, and says why', () => {
  const tiers = stackFor(resolveReader({}, {}, 'win32'))
  assert.strictEqual(tiers[0].hidden, true)
  assert.strictEqual(tiers[0].reason, 'the reader is on another machine (no interactive session)')
  assert.deepStrictEqual(waitCovers(tiers), ['network'])
})

test('STAYS SILENT: a Windows desktop session keeps local', () => {
  assert.strictEqual(stackFor(resolveReader({}, { SESSIONNAME: 'Console' }, 'win32'))[0].hidden, undefined)
})

test('STAYS SILENT: no signal leaves the stack exactly as it was', () => {
  for (const reader of [null, resolveReader({}, {}), { reader: 'local', why: 'configured' }]) {
    const tiers = stackFor(reader)
    assert.deepStrictEqual(tiers[0], { tier: 'local', url: SERVED.loopbackUrl })
    assert.strictEqual(reviewStackText(tiers), tiers.map((t) => reviewTierLine(t) + '\n').join(''))
    assert.deepStrictEqual(waitCovers(tiers), ['local', 'network'])
  }
})

test('STAYS SILENT: a bridge session is not enough to hide a working link', () => {
  // Often a browser on this same machine, and an undocumented variable.
  const reader = resolveReader({}, { CLAUDE_CODE_BRIDGE_SESSION_ID: 'abc' })
  assert.strictEqual(reader.reader, 'remote')
  assert.strictEqual(readerOffMachine(reader), false)
  assert.strictEqual(stackFor(reader)[0].hidden, undefined)
})

test('with no network URL, local stays and says it is unreachable', () => {
  const reader = { reader: 'remote', why: 'SKITTERSPEC_READER' }
  const tiers = stackFor(reader, null, { review: { allowNetwork: false, allowRemote: false } })
  assert.strictEqual(tiers[0].hidden, undefined)
  assert.match(reviewStackText(tiers), /^ {2}local: {3}file:\/\/\/x {3}\(not reachable from the reader's machine\)/)
  assert.deepStrictEqual(waitCovers(tiers), ['local', 'network'])
})

test('a render for a remote reader prints no local line, and --json marks it', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const remote = { SKITTERSPEC_READER: 'remote' }
    const out = reviewWith(remote, dir)
    assert.doesNotMatch(out, /^ {2}local:/m)
    assert.match(out, /^ {2}network: http:/m)
    assert.match(out, /the wait covers network; a remote verdict/)
    const json = JSON.parse(reviewWith(remote, dir, '--json'))
    assert.strictEqual(json.tiers[0].tier, 'local')
    assert.strictEqual(json.tiers[0].hidden, true)
    assert.deepStrictEqual(json.covers, ['network'])
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

// Only Windows can say it has no desktop, so only there can the engine's own
// platform be the thing under test; elsewhere the unit tests above carry it.
test('on Windows, a render with no desktop session prints no local line', { skip: process.platform !== 'win32' }, async () => {
  const { dir } = repoWithSpec({ reader: 'detect' }, await freePort())
  try {
    const out = reviewWith({ SESSIONNAME: '' }, dir)
    assert.doesNotMatch(out, /^ {2}local:/m)
    assert.match(out, /reader: remote \(no interactive session\)/)
    assert.match(reviewWith({ SESSIONNAME: 'Console' }, dir), /^ {2}local: {3}http:/m)
  } finally {
    stopServe(dir)
    drop(dir)
  }
})

test('STAYS SILENT: the same render without the signal keeps local and both doors', async () => {
  const { dir } = repoWithSpec({}, await freePort())
  try {
    const out = review(dir)
    assert.match(out, /^ {2}local: {3}http:\/\/127\.0\.0\.1/m)
    assert.match(out, /the wait covers local \+ network/)
    assert.deepStrictEqual(JSON.parse(review(dir, '--json')).covers, ['local', 'network'])
  } finally {
    stopServe(dir)
    drop(dir)
  }
})
