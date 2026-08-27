'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync, listSpecs } = require('../src/cli-sync.js')
const { loadLinearConfig, CONFIG_FILE } = require('../src/config.js')

// A repo with the Linear opt-in present and a spec tree covering the three
// shapes `linked` has to survive: a linked folder spec, an unlinked one, and a
// legacy bare `<name>.md` spec with no folder at all.
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linked-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, JSON.stringify({ linear: { teamId: 'T1' } }), 'utf-8')

  const spec = (bucket, name, frontmatter) => {
    const folder = path.join(dir, 'specs', bucket, name)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, '00-overview.md'), frontmatter + `# ${name}\n`, 'utf-8')
  }

  spec('in-progress', 'feat-linked', '---\nlinear_identifier: "SKI-42"\n---\n\n')
  spec('backlog', 'feat-unlinked', '')
  spec('complete', 'feat-old', '---\nlinear_identifier: "SKI-7"\n---\n\n')
  // Legacy: a bare file in the bucket, not a folder.
  fs.mkdirSync(path.join(dir, 'specs', 'cancelled'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', 'cancelled', 'feat-legacy.md'),
    '---\nlinear_identifier: "SKI-3"\n---\n\n# Legacy\n',
    'utf-8',
  )
  return dir
}

function run(argv, cwd) {
  let text = ''
  return specSync(argv, { cwd, out: { write: (s) => (text += s) } }).then(() => text)
}

test('listSpecs pairs every spec with its linear_identifier (null when unlinked)', () => {
  const dir = fixtureRepo()
  const { config } = loadLinearConfig(dir)
  const specs = listSpecs(dir, config)
  assert.deepStrictEqual(specs, [
    { spec: 'feat-legacy', bucket: 'cancelled', identifier: 'SKI-3' },
    { spec: 'feat-linked', bucket: 'in-progress', identifier: 'SKI-42' },
    { spec: 'feat-old', bucket: 'complete', identifier: 'SKI-7' },
    { spec: 'feat-unlinked', bucket: 'backlog', identifier: null },
  ])
})

test('listSpecs reads a legacy bare <name>.md spec, not just folders', () => {
  const dir = fixtureRepo()
  const { config } = loadLinearConfig(dir)
  const legacy = listSpecs(dir, config).find((s) => s.spec === 'feat-legacy')
  assert.strictEqual(legacy.identifier, 'SKI-3')
})

test('listSpecs tolerates a folder with no overview file — unlinked, no throw', () => {
  const dir = fixtureRepo()
  fs.mkdirSync(path.join(dir, 'specs', 'backlog', 'feat-empty'), { recursive: true })
  const { config } = loadLinearConfig(dir)
  const empty = listSpecs(dir, config).find((s) => s.spec === 'feat-empty')
  assert.strictEqual(empty.identifier, null)
})

test('listSpecs honours a non-default snapshot.overviewFile', () => {
  const dir = fixtureRepo()
  const folder = path.join(dir, 'specs', 'backlog', 'feat-renamed')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'index.md'), '---\nlinear_identifier: "SKI-9"\n---\n\n# X\n', 'utf-8')
  const { config } = loadLinearConfig(dir)
  config.snapshot.overviewFile = 'index.md'
  const renamed = listSpecs(dir, config).find((s) => s.spec === 'feat-renamed')
  assert.strictEqual(renamed.identifier, 'SKI-9')
})

test('listSpecs on a repo with no specs/ tree is empty, not an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linked-bare-'))
  assert.deepStrictEqual(listSpecs(dir, { snapshot: { overviewFile: '00-overview.md' } }), [])
})

test('spec-sync linked --json emits the adopted identifiers the intake seam reads', async () => {
  const dir = fixtureRepo()
  const parsed = JSON.parse(await run(['linked', '--json'], dir))
  const adopted = parsed.filter((s) => s.identifier).map((s) => s.identifier)
  assert.deepStrictEqual(adopted.sort(), ['SKI-3', 'SKI-42', 'SKI-7'])
})

test('spec-sync linked prints a human table with a linked count', async () => {
  const text = await run(['linked'], fixtureRepo())
  assert.match(text, /SKI-42\s+feat-linked\s+\(in-progress\)/)
  assert.match(text, /—\s+feat-unlinked\s+\(backlog\)/, 'unlinked renders as a dash')
  assert.match(text, /3\/4 linked/)
})

test('spec-sync linked is inert without the opt-in config', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-linked-optout-'))
  const text = await run(['linked'], dir)
  assert.match(text, /not enabled/i)
})

test('spec-sync usage names linked', async () => {
  const text = await run(['nope'], fixtureRepo())
  assert.match(text, /spec-sync linked \[--json\]/)
})
