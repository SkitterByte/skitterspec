'use strict'

// Every provider, against a project that may sit in a subfolder of its repo
// (spec feat-subfolder-project, phase 5). Built on the shared fixture helper, so
// `pnpm test:nested` runs it nested; at prefix '' it pins today's behaviour.
//
// `released` is the check that failed SILENTLY: `release.ignorePaths` are the
// project's (`specs/`), `git log` paths are the repo's (`<prefix>/specs/…`),
// and a nested project's paperwork commits were counted as missed trailers.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { makeRepo } = require('../../common/test/helpers/repo.js')
const { onlyIgnoredPaths, ticketsInRange, projectPrefixOf } = require('../src/released.js')

const PROVIDERS = [
  {
    name: 'github',
    cli: require('@skitterbyte/skitterspec-provider-github/src/cli-sync.js'),
    config: { file: 'github.config.json', body: { github: { owner: 'SkitterByte', repo: 'demo', project: 7 } } },
    field: 'github_identifier',
    id: '#7',
  },
  {
    name: 'jira',
    cli: require('@skitterbyte/skitterspec-provider-jira/src/cli-sync.js'),
    config: { file: 'jira.config.json', body: { jira: { siteUrl: 'https://acme.atlassian.net', projectKey: 'PROJ' } } },
    field: 'jira_identifier',
    id: 'PROJ-7',
  },
  {
    name: 'linear',
    cli: require('@skitterbyte/skitterspec-provider-linear/src/cli-sync.js'),
    config: { file: 'linear.config.json', body: { linear: { teamId: 'T1' } } },
    field: 'linear_identifier',
    id: 'SKS-7',
  },
  {
    name: 'azure-boards',
    cli: require('@skitterbyte/skitterspec-provider-azure-boards/src/cli-sync.js'),
    config: { file: 'azure-boards.config.json', body: { azure: { orgUrl: 'https://dev.azure.com/acme', project: 'web' } } },
    field: 'azure_identifier',
    id: '7',
  },
]

function scaffold(provider) {
  return makeRepo({
    name: `skitterspec-nested-${provider.name}-`,
    config: null,
    files: {
      [`specs/.core/${provider.config.file}`]: JSON.stringify(provider.config.body),
      'specs/backlog/feat-demo/00-overview.md':
        `---\n${provider.field}: "${provider.id}"\n---\n\n# Demo\n\n## Problem\n\nBody.\n`,
      'specs/backlog/feat-demo/01-first.md': '# Phase 1 — First ⬜\n',
    },
  })
}

async function run(provider, argv, cwd) {
  let out = ''
  const code = await provider.cli.specSync(argv, {
    cwd,
    out: { write: (s) => (out += s), isTTY: false },
    err: { write: () => {} },
    env: {},
  })
  return { code, out }
}

// Commit `message` touching exactly these paths, each relative to the REPO root.
function commitAt(repo, message, rels) {
  for (const rel of rels) {
    const file = path.join(repo.root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${message}\n`)
  }
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', message)
}

for (const provider of PROVIDERS) {
  test(`${provider.name}: released ignores the project's paperwork and counts the work beside it`, async () => {
    const repo = scaffold(provider)
    try {
      const base = repo.git('rev-parse', 'HEAD')
      const inProject = (rel) => (repo.prefix ? `${repo.prefix}/${rel}` : rel)
      commitAt(repo, 'chore: tick a box', [inProject('specs/backlog/feat-demo/01-first.md')])
      commitAt(repo, 'feat: schema', ['Sql/schema.sql'])
      commitAt(repo, 'feat: both', [inProject('specs/backlog/feat-demo/00-overview.md'), 'Sql/more.sql'])
      const r = await run(provider, ['released', `${base}..HEAD`, '--json'], repo.dir)
      assert.strictEqual(r.code, 0, r.out)
      const report = JSON.parse(r.out)
      assert.strictEqual(report.ignored, 1, 'the spec-only commit is bookkeeping')
      assert.strictEqual(report.unreferenced, 2, 'a commit touching Sql/ did real work')
    } finally {
      repo.cleanup()
    }
  })

  test(`${provider.name}: ref resolves a spec from the project folder`, async () => {
    const repo = scaffold(provider)
    try {
      const r = await run(provider, ['ref', 'feat-demo'], repo.dir)
      assert.strictEqual(r.code, 0, r.out)
      assert.match(r.out, /7/)
    } finally {
      repo.cleanup()
    }
  })
}

// --- the matcher itself, at a fixed prefix -----------------------------------

const P = 'FF.CSC.Solution'

test('onlyIgnoredPaths reads git paths against the project\'s ignorePaths', () => {
  assert.strictEqual(onlyIgnoredPaths([`${P}/specs/a.md`], ['specs/'], P), true)
  assert.strictEqual(onlyIgnoredPaths(['Sql/a.sql'], ['specs/'], P), false)
  assert.strictEqual(onlyIgnoredPaths([`${P}/specs/a.md`, 'Sql/a.sql'], ['specs/'], P), false)
  assert.strictEqual(onlyIgnoredPaths(['specs/a.md'], ['specs/'], P), false, 'a root specs/ is not the project\'s')
})

test('stays silent: onlyIgnoredPaths at prefix "" is unchanged', () => {
  assert.strictEqual(onlyIgnoredPaths(['specs/a.md'], ['specs/']), true)
  assert.strictEqual(onlyIgnoredPaths(['app.js'], ['specs/']), false)
})

test('ticketsInRange passes the prefix through', () => {
  const commits = [{ body: 'chore: x', paths: [`${P}/specs/a.md`] }]
  assert.strictEqual(ticketsInRange(commits, { ignorePaths: ['specs/'], prefix: P }).ignored, 1)
  assert.strictEqual(ticketsInRange(commits, { ignorePaths: ['specs/'] }).ignored, 0, 'no prefix, no match')
})

test('projectPrefixOf reads the prefix from a real repo, and "" outside one', () => {
  const repo = scaffold(PROVIDERS[0])
  try {
    assert.strictEqual(projectPrefixOf(repo.dir), repo.prefix)
  } finally {
    repo.cleanup()
  }
  assert.strictEqual(projectPrefixOf(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'no-repo-'))), '')
})
