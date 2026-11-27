'use strict'

// Zero-arg spec resolution: a `spec-env` subcommand called without a spec name
// resolves the worktree it is being run from, else the sole spec that has one,
// and refuses rather than guesses when it cannot tell. See `soleProvisionedSpec`
// in ../src/cli.js.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const { makeRepo, repoFor } = require('./helpers/repo.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

// A real git checkout on `main` with isolation enabled. Specs are added by
// `addSpec`; worktrees by `addWorktree`, so each test states its own shape.
function scaffold() {
  return makeRepo({
    name: 'skitterspec-zeroarg-',
    config: { baseBranch: 'main', docker: { enabled: false } },
  }).dir
}

function addSpec(dir, folder, bucket = 'in-progress') {
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', `add ${folder}`)
}

// The project folder inside the new worktree — the worktree itself unless the
// project is nested (test/helpers/repo.js).
function addWorktree(dir, folder) {
  return repoFor(dir).addWorktree(folder)
}

function cleanup(dir) {
  repoFor(dir).cleanup()
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

test('resolves the sole spec that has a worktree when no spec is named', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-alpha/, 'resolved the only provisioned spec')
  } finally {
    cleanup(dir)
  }
})

test('an explicit spec still wins over an ambiguous set of worktrees', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    addWorktree(dir, 'feat-beta')
    const out = await runQuiet(['spec-env', 'resolve', 'feat-beta', '--dir', dir])
    assert.match(out, /feat-beta/, 'used the named spec')
    assert.doesNotMatch(out, /name the one you mean/, 'did not treat it as ambiguous')
  } finally {
    cleanup(dir)
  }
})

// The signal that carries the feature: several worktrees at once is the normal
// shape of this workflow, so "the only one" would rarely resolve on its own.
test('running from inside a worktree resolves that spec, ambiguity notwithstanding', async () => {
  const dir = scaffold()
  const cwd = process.cwd()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    const beta = addWorktree(dir, 'feat-beta')
    process.chdir(beta)
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-beta/, 'resolved the worktree we are standing in')
    assert.doesNotMatch(out, /name the one you mean/, 'cwd settled the ambiguity')
  } finally {
    process.chdir(cwd)
    cleanup(dir)
  }
})

test('a subdirectory of a worktree resolves it too', async () => {
  const dir = scaffold()
  const cwd = process.cwd()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    const beta = addWorktree(dir, 'feat-beta')
    const nested = path.join(beta, 'specs', '.core')
    fs.mkdirSync(nested, { recursive: true })
    process.chdir(nested)
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-beta/, 'resolved from a nested cwd')
  } finally {
    process.chdir(cwd)
    cleanup(dir)
  }
})

test('standing in the primary checkout does not resolve an ambiguous set', async () => {
  const dir = scaffold()
  const cwd = process.cwd()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    addWorktree(dir, 'feat-beta')
    process.chdir(dir)
    await assert.rejects(
      () => runQuiet(['spec-env', 'resolve', '--dir', dir]),
      /name the one you mean/,
      'the primary checkout is not a spec',
    )
  } finally {
    process.chdir(cwd)
    cleanup(dir)
  }
})

test('several worktrees refuse and list every candidate', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta')
    addWorktree(dir, 'feat-alpha')
    addWorktree(dir, 'feat-beta')
    await assert.rejects(
      () => runQuiet(['spec-env', 'resolve', '--dir', dir]),
      (err) => {
        assert.match(err.message, /2 specs have worktrees/, 'says how many')
        assert.match(err.message, /feat-alpha/, 'lists the first')
        assert.match(err.message, /feat-beta/, 'lists the second')
        return true
      },
    )
  } finally {
    cleanup(dir)
  }
})

test('no worktree at all refuses and points at /spec-start', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    await assert.rejects(
      () => runQuiet(['spec-env', 'resolve', '--dir', dir]),
      (err) => {
        assert.match(err.message, /no spec has a worktree/, 'names the real cause')
        assert.match(err.message, /spec-start/, 'points at the fix')
        return true
      },
    )
  } finally {
    cleanup(dir)
  }
})

// A spec sitting in a bucket is NOT provisioned. This is the distinction the
// whole helper turns on: the bucket says work is under way, the worktree says
// there is somewhere for a spec-env verb to act.
test('a bucketed spec with no worktree is not counted as provisioned', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addSpec(dir, 'feat-beta', 'backlog')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-alpha/, 'resolved the provisioned spec')
    assert.doesNotMatch(out, /feat-beta/, 'ignored the backlog spec')
  } finally {
    cleanup(dir)
  }
})

// --- stays-silent tests (.claude/rules/negative-checks.md rule 3) -----------
//
// Each feeds the resolution a HEALTHY but unusual input and asserts it does not
// accuse. Without these, only the firing paths above are covered.

test('stays silent: a docker-less project resolves fine with an empty registry', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    assert.ok(
      !fs.existsSync(path.join(dir, '.spec-env', 'registry.json')),
      'precondition: a worktree-only spec never writes a registry',
    )
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-alpha/, 'an empty registry is not evidence of anything')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: no specs/in-progress/ directory on disk still resolves', async () => {
  const dir = scaffold()
  try {
    // A spec authored on its own branch never appears in the primary checkout,
    // so `specs/in-progress/` does not exist there — git does not track an empty
    // directory. This is the healthy shape that motivated the whole decision.
    const worktree = addWorktree(dir, 'feat-alpha')
    const specDir = path.join(worktree, 'specs', 'in-progress', 'feat-alpha')
    fs.mkdirSync(specDir, { recursive: true })
    fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
    git(worktree, 'add', '-A')
    git(worktree, 'commit', '-q', '-m', 'spec on its branch')
    assert.ok(
      !fs.existsSync(path.join(dir, 'specs', 'in-progress')),
      'precondition: the bucket is absent from the primary checkout',
    )
    const out = await runQuiet(['spec-env', 'resolve', '--dir', dir])
    assert.match(out, /feat-alpha/, 'resolved from the worktree, not the bucket')
  } finally {
    cleanup(dir)
  }
})

// --- the meanings Decision 8 protects ---------------------------------------

// `connect` is retired (feat-drop-spec-connect): every form prints one line
// pointing at `/spec-live`, exits 0, and touches nothing — no proxy started,
// no state file written, whatever the spec argument.
test('`connect` is a stub that points to /spec-live, in every form', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    for (const args of [[], ['feat-alpha'], ['off']]) {
      const out = await runQuiet(['spec-env', 'connect', ...args, '--dir', dir])
      assert.match(out, /^spec-env connect: retired — use `\/spec-live`/, args.join(' ') || '(bare)')
      assert.match(out, /spec-env dev up (feat-alpha|<spec>)/)
      assert.strictEqual(out.trim().split('\n').length, 1, 'one line')
    }
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'connected')), 'no connected file')
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'proxy.json')), 'no routes file')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: `live status` with no spec still reports on the whole repo', async () => {
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-alpha')
    addWorktree(dir, 'feat-alpha')
    const out = await runQuiet(['spec-env', 'live', 'status', '--dir', dir])
    assert.match(out, /receipt:/, 'gave the repo-wide report, not a per-spec verdict')
    assert.doesNotMatch(out, /^\s+spec:/m, 'no per-spec block')
  } finally {
    cleanup(dir)
  }
})
