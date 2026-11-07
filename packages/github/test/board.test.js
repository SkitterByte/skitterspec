'use strict'

// `spec-sync board` through GitHub's own dispatch: the board column is read
// via the adapter, and only a finished issue against an in-flight spec speaks.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-board-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ github: { owner: 'SkitterByte', repo: 'demo', project: 7 } }))
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '---\ngithub_identifier: "#101"\n---\n\n# Demo\n')
  return dir
}

async function run(args, dir, adapter) {
  let text = ''
  const out = { write: (s) => (text += s) }
  const env = { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) }
  const code = await specSync(args, { cwd: dir, out, err: { write() {} }, env, adapter })
  return { code, text }
}

const issueIn = (state) => ({ readIssue: async () => ({ identifier: '#101', state: { name: state }, assignee: null, open: true }) })

test('board relays a Done issue on an in-flight spec', async () => {
  const r = await run(['board', 'feat-demo'], repo(), issueIn('Done'))
  assert.strictEqual(r.code, 0)
  assert.match(r.text, /#101 is Done on GitHub, but feat-demo is in-progress here — \/spec-complete closes it/)
})

test('stays silent: board on an issue still in progress says nothing', async () => {
  const r = await run(['board', 'feat-demo'], repo(), issueIn('In Progress'))
  assert.deepStrictEqual(r, { code: 0, text: '' })
})

test('stays silent: board with no token says nothing and exits 0', async () => {
  const r = await run(['board', 'feat-demo'], repo())
  assert.deepStrictEqual(r, { code: 0, text: '' })
})
