'use strict'

/**
 * `skitterspec project` (feat-project-command, phase 1): describing a project's
 * name and category, editing them into env.config.json without disturbing a
 * byte of anything else, and listing the categories in use.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { setProjectKeys } = require('../src/env/projectedit.js')
const { describeProject } = require('../src/env/project.js')

// A hand-written config: an inline array, a nested `mode` that is not the
// top-level one, and no `project` block.
const HAND = `{
  "seedFiles": { "mode": "symlink", "files": [".env"] },
  "setup": ["pnpm install"],

  "worktree": {
    "root": "../{repo}-wt"
  }
}
`

// --- the edit ----------------------------------------------------------------------

test('a file with no project block gains one first, and nothing else moves', () => {
  const out = setProjectKeys(HAND, { name: 'Acme', category: 'work' })
  assert.strictEqual(
    out,
    `{
  "project": {
    "name": "Acme",
    "category": "work"
  },
  "seedFiles": { "mode": "symlink", "files": [".env"] },
  "setup": ["pnpm install"],

  "worktree": {
    "root": "../{repo}-wt"
  }
}
`,
  )
})

test('with a top-level mode, the block goes after it — a nested mode is not that', () => {
  const out = setProjectKeys('{\n    "mode": "worktree",\n    "seedFiles": { "mode": "copy" }\n}\n', { category: 'work' })
  assert.strictEqual(out, '{\n    "mode": "worktree",\n    "project": {\n        "name": "",\n        "category": "work"\n    },\n    "seedFiles": { "mode": "copy" }\n}\n')
})

test('an existing block has only the named value replaced', () => {
  const text = '{\n  "project": { "name": "Old",  "category": "work" },\n  "mode": "worktree"\n}\n'
  assert.strictEqual(setProjectKeys(text, { name: 'New' }), '{\n  "project": { "name": "New",  "category": "work" },\n  "mode": "worktree"\n}\n')
})

test('a key the block lacks is added to it; an empty block is filled', () => {
  assert.strictEqual(
    setProjectKeys('{\n  "project": {\n    "name": "A"\n  }\n}\n', { category: 'work' }),
    '{\n  "project": {\n    "name": "A",\n    "category": "work"\n  }\n}\n',
  )
  assert.strictEqual(setProjectKeys('{\n  "project": {}\n}\n', { name: 'A' }), '{\n  "project": {\n    "name": "A"\n  }\n}\n')
})

test('an empty string clears a value; asking for nothing changes nothing', () => {
  const text = '{\n  "project": { "name": "A", "category": "work" }\n}\n'
  assert.strictEqual(setProjectKeys(text, { category: '' }), '{\n  "project": { "name": "A", "category": "" }\n}\n')
  assert.strictEqual(setProjectKeys(text, {}), text)
})

test('values are written as JSON, so a quote in a name stays a quote', () => {
  const out = setProjectKeys('{}', { name: 'Bob\'s "app"' })
  assert.strictEqual(JSON.parse(out).project.name, 'Bob\'s "app"')
})

test('a project key that is not an object, or a file that is not one, is refused', () => {
  assert.throws(() => setProjectKeys('{ "project": "acme" }', { name: 'x' }), /not an object/)
  assert.throws(() => setProjectKeys('[1]', { name: 'x' }), /not a JSON object/)
  assert.throws(() => setProjectKeys('{ broken', { name: 'x' }))
})

// --- the description -----------------------------------------------------------------

test('each value says where it came from', () => {
  const checkout = { root: '/code/acme', prefix: '' }
  assert.deepStrictEqual(describeProject({ project: { name: 'Acme', category: 'Work' }, checkout }), {
    name: { value: 'Acme', source: 'project.name' },
    category: { value: 'Work', source: 'project.category' },
  })
  assert.deepStrictEqual(describeProject({ project: {}, review: { projectName: 'Old' }, checkout }).name, { value: 'Old', source: 'review.projectName' })
  assert.deepStrictEqual(describeProject({ project: { name: ' ' }, checkout }).name, { value: 'acme', source: 'folder' })
  assert.deepStrictEqual(describeProject({}), { name: { value: null, source: 'unset' }, category: { value: null, source: 'unset' } })
})

// --- the command -----------------------------------------------------------------------

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function repo({ config } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  if (config !== undefined) fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), config)
  return dir
}

function run(args, { cwd, env = {} } = {}) {
  try {
    const out = execFileSync(process.execPath, [BIN, 'project', ...args], {
      cwd,
      env: { ...process.env, CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'proj-cfg-')), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out: out.toString() }
  } catch (e) {
    return { status: e.status, out: e.stdout.toString(), err: e.stderr.toString() }
  }
}

test('set, then read back, editing only the two keys', () => {
  const dir = repo({ config: HAND })
  const set = run(['--name', 'Acme Portal', '--category', 'work'], { cwd: dir })
  assert.strictEqual(set.status, 0, set.err)
  assert.match(set.out, /set name and category in specs\/\.core\/env\.config\.json — commit it/)
  const file = fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8')
  assert.ok(file.includes('"setup": ["pnpm install"],\n\n  "worktree"'), 'the rest is byte for byte')
  const read = JSON.parse(run(['--json'], { cwd: dir }).out)
  assert.deepStrictEqual([read.name, read.category], [{ value: 'Acme Portal', source: 'project.name' }, { value: 'work', source: 'project.category' }])
})

test('with no env.config.json it refuses to write, and creates nothing', () => {
  const dir = repo()
  const r = run(['--category', 'work'], { cwd: dir })
  assert.strictEqual(r.status, 1)
  assert.match(r.err, /turns isolation on.*skitterspec init --isolation/s)
  assert.ok(!fs.existsSync(path.join(dir, 'specs', '.core', 'env.config.json')))
})

// Stays silent: reading a project with nothing set is not a fault.
test('reading a project with no config shows the defaults and exits 0', () => {
  const r = run([], { cwd: repo() })
  assert.strictEqual(r.status, 0)
  assert.match(r.out, /name:\s+proj-\S+\s+\(folder\)/)
  assert.match(r.out, /category: —\s+\(unset\)/)
})

test('--categories lists the categories the projects you work in carry', () => {
  const work1 = repo({ config: '{ "project": { "name": "Portal", "category": "work" } }' })
  const work2 = repo({ config: '{ "project": { "category": "Work" } }' })
  const work3 = repo({ config: '{ "project": { "category": "work" } }' })
  const home = repo({ config: '{ "project": { "category": "personal" } }' })
  const bare = repo()
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-cfg-'))
  const sessions = path.join(cfg, 'projects', '-nowhere')
  fs.mkdirSync(sessions, { recursive: true })
  ;[work1, work2, work3, home, bare].forEach((cwd, i) =>
    fs.writeFileSync(path.join(sessions, `s${i}.jsonl`), JSON.stringify({ type: 'user', cwd, timestamp: '2026-11-11T10:00:00Z' }) + '\n'),
  )
  const r = JSON.parse(run(['--categories', '--json'], { cwd: bare, env: { CLAUDE_CONFIG_DIR: cfg } }).out)
  assert.deepStrictEqual(
    r.categories.map((c) => [c.category, c.projects.length]),
    [
      // one category however it is capitalised, spelled as most projects do
      ['work', 3],
      ['personal', 1],
    ],
  )
  assert.ok(r.categories[0].projects.includes('Portal'), 'projects named by their project.name')
  assert.deepStrictEqual(r.uncategorised, [path.basename(bare)])
})

test('a flag with no value is refused, not taken as clearing', () => {
  const dir = repo({ config: '{}' })
  assert.strictEqual(run(['--name'], { cwd: dir }).status, 1)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'), '{}')
})
