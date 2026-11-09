'use strict'

// Every spec-env verb anchors on the PROJECT folder in the primary checkout —
// which is the repo root for most projects, and a subfolder of it for some
// (spec feat-subfolder-project). Built on test/helpers/repo.js, so
// `pnpm test:nested` runs this file again with the project nested.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { run } = require('../src/cli.js')
const { makeRepo } = require('./helpers/repo.js')

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

function withSpec(folder) {
  const repo = makeRepo({
    name: 'skitterspec-anchor-',
    config: { baseBranch: 'main', docker: { enabled: false } },
    files: { [`specs/backlog/${folder}/00-overview.md`]: '# X\n\n> **Stack:** worktree\n' },
  })
  return repo
}

test('resolve finds the config and the spec from the project folder', async () => {
  const repo = withSpec('feat-alpha')
  try {
    const out = await runQuiet(['spec-env', 'resolve', 'feat-alpha', '--dir', repo.dir])
    assert.doesNotMatch(out, /isolation not enabled/)
    assert.match(out, /^spec: {7}feat-alpha \(backlog\)$/m)
  } finally {
    repo.cleanup()
  }
})

test('resolve finds them from deeper than the project folder too', async () => {
  const repo = withSpec('feat-alpha')
  try {
    const deep = path.join(repo.dir, 'ClientApp', 'src')
    fs.mkdirSync(deep, { recursive: true })
    const out = await runQuiet(['spec-env', 'resolve', 'feat-alpha', '--dir', deep])
    assert.doesNotMatch(out, /isolation not enabled/)
    assert.match(out, /^spec: {7}feat-alpha \(backlog\)$/m)
  } finally {
    repo.cleanup()
  }
})

test('the worktree lands beside the REPO, named for the repo', async () => {
  const repo = withSpec('feat-alpha')
  try {
    const out = await runQuiet(['spec-env', 'resolve', 'feat-alpha', '--dir', repo.dir])
    // The line names the project folder inside the worktree — where a session
    // stands — which is the worktree itself at prefix ''.
    const wt = /^worktree: {3}(.+)$/m.exec(out)[1]
    assert.strictEqual(wt, repo.worktreeFor('alpha').project)
    assert.ok(!wt.startsWith(repo.root + path.sep), 'never inside the repo')
  } finally {
    repo.cleanup()
  }
})

test('resolve and status name a subfolder project, and only a subfolder one', async () => {
  const repo = withSpec('feat-alpha')
  try {
    const resolved = await runQuiet(['spec-env', 'resolve', 'feat-alpha', '--dir', repo.dir])
    const status = await runQuiet(['status', '--dir', repo.dir])
    const line = `subfolder:  ${repo.prefix}/ (in repo ${repo.root})`
    if (repo.prefix) {
      assert.ok(resolved.includes(line), `resolve names it:\n${resolved}`)
      assert.ok(status.startsWith(line), `status leads with it:\n${status}`)
    } else {
      // stays silent: a root layout prints nothing new.
      assert.doesNotMatch(resolved, /subfolder:/)
      assert.doesNotMatch(status, /subfolder:/)
    }
  } finally {
    repo.cleanup()
  }
})

test('a subfolder project with isolation on is not reported as isolation off', async () => {
  // The adopter's report: from FF.CSC.Solution/ every verb said "isolation not
  // enabled", because the engine re-anchored to the git root.
  const repo = withSpec('feat-alpha')
  try {
    const out = await runQuiet(['spec-env', 'status', '--dir', repo.dir])
    assert.doesNotMatch(out, /isolation not enabled/)
  } finally {
    repo.cleanup()
  }
})
