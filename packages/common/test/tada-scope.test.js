'use strict'

/**
 * `project.name` / `project.category` (feat-tada-scope-and-serve, phase 1):
 * the name every page carries, and the category a ta-da report is scoped by.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadEnvConfig } = require('../src/env/config.js')
const { projectName, projectCategory } = require('../src/env/project.js')
const { buildDigest } = require('../src/tada/digest.js')

function configDir(json) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-cfg-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  if (json) fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify(json))
  return dir
}

// --- the setting --------------------------------------------------------------

test('project.name and project.category are read from env.config.json', () => {
  const { config, unknown } = loadEnvConfig(configDir({ project: { name: 'Acme Portal', category: 'Work' } }))
  assert.strictEqual(projectName(config), 'Acme Portal')
  assert.strictEqual(projectCategory(config), 'Work')
  assert.deepStrictEqual(unknown, [], 'neither key is reported as unknown')
})

test('the name falls back to review.projectName, then the folder', () => {
  const anchor = { root: '/code/acme', prefix: '' }
  const both = { project: { name: 'New' }, review: { projectName: 'Old' }, checkout: anchor }
  const legacy = { project: { name: '' }, review: { projectName: 'Old' }, checkout: anchor }
  const neither = { project: { name: '  ' }, review: { projectName: '' }, checkout: anchor }
  assert.strictEqual(projectName(both), 'New')
  assert.strictEqual(projectName(legacy), 'Old', 'a config written before project.name keeps its name')
  assert.strictEqual(projectName(neither), 'acme')
})

// Stays silent: a repo with no config is a healthy repo with no name set.
test('no config: no category, the default name, nothing unknown', () => {
  const { config, present, unknown } = loadEnvConfig(configDir(null))
  assert.strictEqual(present, false)
  assert.strictEqual(projectCategory(config), null)
  assert.strictEqual(projectName(config), null, 'no anchor attached, so cannot tell — as before')
  assert.deepStrictEqual(unknown, [])
})

// --- the scope ------------------------------------------------------------------

const WINDOW = { since: new Date('2026-11-11T10:00:00Z'), until: new Date('2026-11-11T20:00:00Z') }

// One session in each of four repos, and one outside any repo.
function transcripts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-'))
  const dir = path.join(root, '-nowhere')
  fs.mkdirSync(dir)
  const cwds = ['/work-a', '/work-b', '/home-c', '/plain', '/scratch']
  cwds.forEach((cwd, i) =>
    fs.writeFileSync(
      path.join(dir, `s${i}.jsonl`),
      JSON.stringify({ type: 'user', cwd, gitBranch: 'main', timestamp: '2026-11-11T11:00:00Z', message: { content: `in ${cwd}` } }),
    ),
  )
  return root
}

const repoOf = (cwd) => (cwd === '/scratch' ? { repo: null } : { repo: cwd })
const CATEGORY = { '/work-a': 'work', '/work-b': ' Work ', '/home-c': 'personal', '/plain': null }
const facts = (repo) => ({
  name: { '/work-a': 'Acme Portal' }[repo] || path.basename(repo),
  category: CATEGORY[repo],
  skitterspec: CATEGORY[repo] !== null,
  notes: [],
  toSpec: () => null,
  ticket: () => null,
  commits: [],
  events: [],
})

const names = (d) => d.projects.map((p) => p.name)

test('a category reports only the projects sharing it, compared loosely', async () => {
  const d = await buildDigest({ root: transcripts(), window: WINDOW, repoOf, facts, category: 'WORK' })
  assert.deepStrictEqual(names(d), ['Acme Portal', 'work-b'])
  assert.strictEqual(d.category, 'WORK')
})

test('uncategorised projects, and places outside any repo, are left out entirely', async () => {
  const d = await buildDigest({ root: transcripts(), window: WINDOW, repoOf, facts, category: 'personal' })
  assert.deepStrictEqual(names(d), ['home-c'])
  assert.deepStrictEqual(d.notes, [], 'nothing is said about what was left out')
})

test('no category — run from an uncategorised place, or --all-projects — reports everything', async () => {
  const d = await buildDigest({ root: transcripts(), window: WINDOW, repoOf, facts, category: null })
  assert.deepStrictEqual(names(d), ['Acme Portal', 'home-c', 'plain', 'scratch', 'work-b'])
  assert.ok(!('category' in d))
})

test('each project is shown by its project.name, falling back to its folder', async () => {
  const d = await buildDigest({ root: transcripts(), window: WINDOW, repoOf, facts })
  const acme = d.projects.find((p) => p.repo === '/work-a')
  assert.strictEqual(acme.name, 'Acme Portal')
  assert.strictEqual(acme.category, 'work')
})
