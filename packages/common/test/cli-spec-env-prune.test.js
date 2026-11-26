'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

// Scaffold an isolation-enabled project. `spec-env prune` shells out to
// `docker volume ls` — in a scratch temp repo whose slug matches nothing, that
// returns no namespace volumes, so these tests exercise the wiring / no-op /
// not-enabled paths without needing (or mutating) real Docker state.
function scaffold(withConfig = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-prune-'))
  if (withConfig) {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' } }, null, 2),
    )
  } else {
    fs.mkdirSync(path.join(dir, 'specs'), { recursive: true })
  }
  return dir
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

test('spec-env prune reports the not-enabled path when config is absent', async () => {
  const dir = scaffold(false)
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  assert.match(out, /isolation not enabled/, 'refuses without env.config.json')
})

test('spec-env prune is a clean no-op when no namespace volumes exist', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--dir', dir])
  // Either docker is present and finds nothing, or docker is unavailable — both
  // are non-fatal and must never print an orphan list.
  assert.doesNotMatch(out, /run these:/, 'prints no removal commands')
  assert.match(
    out,
    /no orphaned volumes|could not list docker volumes/,
    'reports a clean no-op or a docker-unavailable notice',
  )
})

test('spec-env prune accepts --older-than without crashing', async () => {
  const dir = scaffold()
  const out = await runQuiet(['spec-env', 'prune', '--older-than', '7', '--dir', dir])
  assert.doesNotMatch(out, /run these:/, 'still no removal commands in a clean repo')
})

// --- a fake docker on PATH --------------------------------------------------
//
// bug-prune-reaps-base-volumes. The fake answers each `docker volume ls` filter
// from a fixture, logging every call, so these tests can put the ereqs shape —
// base-stack volumes sharing the repo prefix — in front of prune without
// touching real Docker. POSIX shell, so skipped on Windows.
const posixOnly = { skip: process.platform === 'win32' }

function fakeDocker(fixture) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-fake-docker-'))
  const log = path.join(bin, 'calls.log')
  const script = [
    '#!/bin/sh',
    `echo "$*" >> '${log}'`,
    'case "$*" in',
    `  *dangling=true*) printf '%s' '${fixture.dangling || ''}' ;;`,
    `  *label=com.docker.compose.project*) printf '%s' '${fixture.labelled || ''}' ;;`,
    `  *volume\\ ls*) printf '%s' '${fixture.all || ''}' ;;`,
    `  *) ${fixture.fail ? 'echo "Cannot connect to the Docker daemon" >&2; exit 1' : 'exit 0'} ;;`,
    'esac',
  ].join('\n')
  fs.writeFileSync(path.join(bin, 'docker'), script + '\n', { mode: 0o755 })
  return { bin, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') }
}

async function withPath(bin, fn) {
  const orig = process.env.PATH
  process.env.PATH = `${bin}${path.delimiter}${orig}`
  try {
    return await fn()
  } finally {
    process.env.PATH = orig
  }
}

function scaffoldRepo(name, docker) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-prune-'))
  const dir = path.join(parent, name)
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, docker }, null, 2),
  )
  return dir
}

const EREQS_BASE = 'ereqs_azurite-data\nereqs_db_data\nereqs_seq-data\n'

test('docker.enabled: false lists nothing and says Docker is not in use', posixOnly, async () => {
  const dir = scaffoldRepo('ereqs', { enabled: false })
  const docker = fakeDocker({ all: EREQS_BASE, labelled: '', dangling: 'ereqs_azurite-data\n' })
  const out = await withPath(docker.bin, () => runQuiet(['spec-env', 'prune', '--dir', dir]))
  assert.doesNotMatch(out, /run these:|docker volume rm/)
  assert.match(out, /Docker is not in use/)
  assert.strictEqual(docker.calls(), '', 'never asks docker at all')
})

test('external, explicitly named base-stack volumes are never offered', posixOnly, async () => {
  // The ereqs shape: unlabelled, prefix-sharing, one of them not mounted.
  const dir = scaffoldRepo('ereqs', { enabled: true })
  const docker = fakeDocker({ all: EREQS_BASE, labelled: '', dangling: 'ereqs_azurite-data\n' })
  const out = await withPath(docker.bin, () => runQuiet(['spec-env', 'prune', '--dir', dir]))
  assert.doesNotMatch(out, /run these:|docker volume rm/)
  assert.match(out, /no orphaned volumes/)
})

test('a spec volume still mounted by a container is never offered', posixOnly, async () => {
  const dir = scaffoldRepo('ereqs', { enabled: true })
  const docker = fakeDocker({
    labelled: 'ereqs_gone_db\tereqs_gone\nereqs_stale_db\tereqs_stale\n',
    dangling: 'ereqs_stale_db\n',
  })
  const out = await withPath(docker.bin, () => runQuiet(['spec-env', 'prune', '--dir', dir]))
  assert.match(out, /docker volume rm ereqs_stale_db/, 'the unmounted orphan is offered')
  assert.doesNotMatch(out, /ereqs_gone_db/, 'the mounted one is not')
  assert.doesNotMatch(out, /no running DB/, 'the backup line claims only what was checked')
})

test('docker failing mid-way lists nothing and warns', posixOnly, async () => {
  const dir = scaffoldRepo('ereqs', { enabled: true })
  const docker = fakeDocker({ labelled: 'ereqs_gone_db\tereqs_gone\n', fail: true })
  // The dangling query is the one that fails: use is cannot-tell.
  fs.writeFileSync(
    path.join(docker.bin, 'docker'),
    fs.readFileSync(path.join(docker.bin, 'docker'), 'utf8').replace(
      /\*dangling=true\*\) [^\n]*/,
      '*dangling=true*) echo "Cannot connect to the Docker daemon" >&2; exit 1 ;;',
    ),
  )
  const out = await withPath(docker.bin, () => runQuiet(['spec-env', 'prune', '--dir', dir]))
  assert.doesNotMatch(out, /run these:|docker volume rm/)
  assert.match(out, /cannot tell|could not/i)
})
