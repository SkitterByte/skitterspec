'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSanitise, collectMarkdown, parseArgs } = require('../src/cli-sanitise.js')

function tmpTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-sanitise-'))
  fs.mkdirSync(path.join(dir, 'specs', 'backlog'), { recursive: true })
  return dir
}

function capture() {
  const chunks = []
  return { write: (s) => chunks.push(s), text: () => chunks.join('') }
}

test('parseArgs defaults to specs/, dry-run', () => {
  assert.deepStrictEqual(parseArgs([]), { paths: ['specs'], write: false, width: null })
  assert.strictEqual(parseArgs(['--write']).write, true)
  assert.strictEqual(parseArgs(['--width', '72']).width, 72)
})

test('collectMarkdown finds .md recursively and skips node_modules', () => {
  const dir = tmpTree()
  fs.writeFileSync(path.join(dir, 'specs', 'backlog', 'a.md'), '# a\n')
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules', 'skip.md'), '# skip\n')
  const found = collectMarkdown(path.join(dir, 'specs')).map((p) => path.basename(p))
  assert.deepStrictEqual(found, ['a.md'])
})

test('dry-run reports pending fixes and does not write; exit 1', async () => {
  const dir = tmpTree()
  const file = path.join(dir, 'specs', 'backlog', 'bug.md')
  const src = [
    '- [x] a task with **bold that the author wrapped',
    '      onto a second line** and trailing words (SKI-1)',
  ].join('\n')
  fs.writeFileSync(file, src)
  const out = capture()
  const code = await specSanitise([], { cwd: dir, out })
  assert.strictEqual(code, 1)
  assert.match(out.text(), /would fix\s+specs\/backlog\/bug\.md/)
  assert.strictEqual(fs.readFileSync(file, 'utf-8'), src, 'dry-run must not modify the file')
})

test('--write applies the fix and a re-run is clean; exit 0', async () => {
  const dir = tmpTree()
  const file = path.join(dir, 'specs', 'backlog', 'bug.md')
  fs.writeFileSync(
    file,
    'Prose with **bold that crosses\na line break** then more words to fill the line out.\n',
  )
  const code1 = await specSanitise(['--write'], { cwd: dir, out: capture() })
  assert.strictEqual(code1, 0)
  const after = fs.readFileSync(file, 'utf-8')
  assert.doesNotMatch(after, /\*\*bold that crosses\n/, 'the straddle must be joined')

  const out2 = capture()
  const code2 = await specSanitise([], { cwd: dir, out: out2 })
  assert.strictEqual(code2, 0, 'idempotent: already clean')
  assert.match(out2.text(), /clean/)
})
