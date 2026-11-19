'use strict'

// `spec-sync linked` sees specs that live only on their own branch
// (feat-spec-resume). Under `land.specDocs: "branch"` an in-flight spec has no
// copy on base, so a ticket that already had a spec read as unadopted and
// `/spec #N` began a second one.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { makeSpecHelpers } = require('../src/specs.js')

const CONFIG = { fields: { identifier: 'github_identifier', url: 'github_url', issueId: 'github_issue_id', assigneeId: 'github_assignee' } }

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), text)
}

function scaffold({ envConfig = true } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-kit-branch-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  if (envConfig) write(dir, 'specs/.core/env.config.json', JSON.stringify({ baseBranch: 'main' }))
  write(dir, 'specs/backlog/feat-here/00-overview.md', '---\ngithub_identifier: "#1"\n---\n# Here\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'switch', '-q', '-c', 'feat/away')
  write(dir, 'specs/in-progress/feat-away/00-overview.md', '---\ngithub_identifier: "#999"\n---\n# Away\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'start')
  git(dir, 'switch', '-q', 'main')
  return dir
}

test('a spec only on its branch is listed with its ticket, marked as from that branch', () => {
  const dir = scaffold()
  try {
    const rows = makeSpecHelpers().listSpecsWithBranches(dir, CONFIG)
    assert.deepStrictEqual(rows, [
      { spec: 'feat-away', bucket: 'in-progress', identifier: '#999', source: 'branch', ref: 'feat/away' },
      { spec: 'feat-here', bucket: 'backlog', identifier: '#1' },
    ])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// STAYS SILENT: no isolation config means no branch layout to read — the
// listing is exactly what it always was.
test('without env.config.json the listing is the plain one', () => {
  const dir = scaffold({ envConfig: false })
  try {
    const helpers = makeSpecHelpers()
    assert.deepStrictEqual(helpers.listSpecsWithBranches(dir, CONFIG), helpers.listSpecs(dir, CONFIG))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
