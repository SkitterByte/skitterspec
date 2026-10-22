'use strict'

// The github spec-sync CLI, end to end and offline: a scaffolded repo, a fake
// adapter, injected streams. Exit-code semantics mirror the other providers'
// table — the assertions here are that contract.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync, PRESERVE_MARKER } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

const GH = { owner: 'SkitterByte', repo: 'demo', project: 7 }

function repoWithSpec({ identifier = null, config = {}, bucket = 'in-progress', phaseEmoji = '⬜' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-cli-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ github: GH, ...config }))
  const spec = path.join(dir, 'specs', bucket, 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier
    ? `---\ngithub_identifier: "${identifier}"\ngithub_url: "https://github.com/SkitterByte/demo/issues/${identifier.slice(1)}"\n---\n\n`
    : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Demo\n\n## Problem\n\nBody prose.\n`)
  fs.writeFileSync(path.join(spec, '01-outbox.md'), `# Phase 1 — Outbox ${phaseEmoji}\n\n**Goal:** a durable place.\n`)
  return dir
}

class Sink {
  constructor(tty = false) {
    this.text = ''
    this.isTTY = tty
  }
  write(s) {
    this.text += s
  }
}

async function run(args, dir, { adapter, env = {}, tty = false, input } = {}) {
  const out = new Sink(tty)
  const err = new Sink()
  const code = await specSync(args, { cwd: dir, out, err, adapter, env, tty, input })
  return { code, out: out.text, err: err.text }
}

const STATUS_OPTIONS = ['Backlog', 'In Progress', 'Done', 'Cancelled']

// A fake adapter that behaves like a healthy repo with a board.
function fakeAdapter() {
  const calls = []
  let n = 100
  const issues = new Map()
  const make = (title, description, labels) => {
    const number = ++n
    const issue = {
      id: String(number),
      number,
      identifier: `#${number}`,
      url: `https://github.com/SkitterByte/demo/issues/${number}`,
      nodeId: `I_${number}`,
      title,
      description: description ?? '',
      state: null,
      open: true,
      labels: labels || [],
      comments: [],
    }
    issues.set(String(number), issue)
    return issue
  }
  const get = (ref) => issues.get(String(ref && ref.id != null ? ref.id : ref).replace(/^#/, ''))
  const adapter = {
    calls,
    issues,
    make,
    async readIssue(ref) {
      calls.push(['readIssue', String(ref)])
      const i = get(ref)
      return i ? { ...i } : null
    },
    async createIssue({ title, description, labels, type }) {
      calls.push(['createIssue', title, labels, type])
      const i = make(title, description, labels)
      return { id: i.id, identifier: i.identifier, url: i.url, nodeId: i.nodeId }
    },
    async createSubIssue(parentId, { title, description, labels }) {
      calls.push(['createSubIssue', String(parentId), title, labels])
      const i = make(title, description, labels)
      i.parent = String(parentId)
      return { id: i.id, identifier: i.identifier, url: i.url, nodeId: i.nodeId }
    },
    async updateIssue(ref, updates) {
      calls.push(['updateIssue', String(ref), updates])
      const i = get(ref)
      if (i && updates.description !== undefined) i.description = updates.description
      return {}
    },
    async setStatus(issueOrRef, name) {
      calls.push(['setStatus', String(issueOrRef.id || issueOrRef), name])
      const i = get(issueOrRef)
      if (i) i.state = { name }
      return { changed: true }
    },
    async setIssueOpen(ref, { open, reason }) {
      calls.push(['setIssueOpen', String(ref), open, reason])
      const i = get(ref)
      if (i) i.open = open
      return {}
    },
    async searchIssues() {
      calls.push(['searchIssues'])
      return []
    },
    async listIssueStates() {
      return STATUS_OPTIONS.map((name, k) => ({ id: `o${k}`, name, category: null }))
    },
    async listBoardItems() {
      return [...issues.values()].map((i) => ({
        id: i.id,
        identifier: i.identifier,
        title: i.title,
        open: i.open,
        state: i.state,
        parent: i.parent ? { id: i.parent } : null,
      }))
    },
    async listIssues({ labels }) {
      return [...issues.values()]
        .filter((i) => i.open && (!labels.length || labels.every((l) => i.labels.includes(l))))
        .map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, labels: i.labels, author: 'reporter' }))
    },
    async listComments(ref) {
      return (get(ref) || { comments: [] }).comments
    },
    async createComment(ref, body) {
      calls.push(['createComment', String(ref)])
      get(ref).comments.push({ id: 'c1', body })
      return { id: 'c1' }
    },
    async readViewer() {
      return { id: 'skitterbyte', login: 'skitterbyte', scopes: ['repo'] }
    },
    async listLabels() {
      return [{ name: 'spec' }]
    },
  }
  return adapter
}

function statesFile(dir, names = STATUS_OPTIONS) {
  const f = path.join(dir, 'states.json')
  fs.writeFileSync(f, JSON.stringify(names))
  return f
}

async function planFile(dir) {
  const r = await run(['plan', 'feat-demo', '--workspace-states', statesFile(dir), '--json'], dir)
  assert.strictEqual(r.code, 0, r.out)
  const f = path.join(dir, 'plan.json')
  fs.writeFileSync(f, r.out)
  return f
}

const frontmatter = (dir, bucket = 'in-progress') =>
  fs.readFileSync(path.join(dir, 'specs', bucket, 'feat-demo', '00-overview.md'), 'utf-8')

// --- opt-out and refusals -------------------------------------------------------

test('no config is an opt-out, exit 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-none-'))
  const r = await run(['linked'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /GitHub sync is off/)
})

test('an unknown flag refuses before anything runs', async () => {
  const r = await run(['linked', '--frobnicate'], repoWithSpec())
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--frobnicate/)
})

test('plan refuses without validated states, and on an option the board lacks', async () => {
  const dir = repoWithSpec()
  const bare = await run(['plan', 'feat-demo'], dir)
  assert.strictEqual(bare.code, 1)
  assert.match(bare.out, /have not been validated/)
  const wrong = await run(['plan', 'feat-demo', '--workspace-states', statesFile(dir, ['Todo', 'Doing', 'Done'])], dir)
  assert.strictEqual(wrong.code, 1)
  assert.match(wrong.out, /is not a Status option on the board/)
})

// --- apply ------------------------------------------------------------------------

test('a first apply mints the spec and its phases, labelled, on the board, and stamps them', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const r = await run(['apply', 'feat-demo', '--plan', await planFile(dir)], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /issue created: #101/)
  assert.match(r.out, /sub-issue created: 01-outbox → #102/)
  const create = adapter.calls.find((c) => c[0] === 'createIssue')
  assert.deepStrictEqual(create.slice(2), [['spec'], null])
  const sub = adapter.calls.find((c) => c[0] === 'createSubIssue')
  assert.deepStrictEqual([sub[1], sub[3]], ['101', ['phase']])
  assert.strictEqual(adapter.issues.get('101').state.name, 'In Progress')
  assert.strictEqual(adapter.issues.get('102').state.name, 'Backlog')
  assert.ok(!adapter.calls.some((c) => c[0] === 'setIssueOpen'), 'open buckets leave an open issue alone')
  assert.match(frontmatter(dir), /github_identifier: "#101"/)
  const phase = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '01-outbox.md'), 'utf-8')
  assert.match(phase, /github_issue_id: "#102"/)
})

test('a complete spec is set Done on the board AND closed as completed', async () => {
  const dir = repoWithSpec({ bucket: 'complete', phaseEmoji: '✅' })
  const adapter = fakeAdapter()
  const r = await run(['apply', 'feat-demo', '--plan', await planFile(dir)], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  const closes = adapter.calls.filter((c) => c[0] === 'setIssueOpen')
  assert.deepStrictEqual(closes, [
    ['setIssueOpen', '101', false, 'completed'],
    ['setIssueOpen', '102', false, 'completed'],
  ])
  assert.strictEqual(adapter.issues.get('101').state.name, 'Done')
})

test('a cancelled spec closes as not planned', async () => {
  const dir = repoWithSpec({ bucket: 'cancelled' })
  const adapter = fakeAdapter()
  await run(['apply', 'feat-demo', '--plan', await planFile(dir)], dir, { adapter })
  assert.deepStrictEqual(
    adapter.calls.find((c) => c[0] === 'setIssueOpen' && c[1] === '101'),
    ['setIssueOpen', '101', false, 'not_planned'],
  )
})

test('a spec moved back out of a terminal bucket reopens its issue', async () => {
  const dir = repoWithSpec({ identifier: '#101' })
  const adapter = fakeAdapter()
  const issue = adapter.make('Demo', 'old body')
  issue.open = false
  issue.state = { name: 'Done' }
  await run(['apply', 'feat-demo', '--plan', await planFile(dir)], dir, { adapter })
  assert.ok(adapter.calls.some((c) => c[0] === 'setIssueOpen' && c[1] === '101' && c[2] === true))
  assert.strictEqual(adapter.issues.get('101').state.name, 'In Progress')
})

test('an MCP-transport apply writes nothing and names the GitHub tools', async () => {
  const dir = repoWithSpec()
  const r = await run(['apply', 'feat-demo', '--plan', await planFile(dir), '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /issue_write/)
  assert.match(r.out, /projects_write/)
})

test('a sub-issue created but not linked is named as an orphan', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.createSubIssue = async () => {
    const err = new Error('created #150 but could not link it under #101')
    err.orphan = { identifier: '#150' }
    throw err
  }
  const r = await run(['apply', 'feat-demo', '--plan', await planFile(dir)], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /created but not stamped: .*#150/)
})

test('no token is a refusal naming both env vars', async () => {
  const dir = repoWithSpec()
  const r = await run(['apply', 'feat-demo', '--plan', await planFile(dir), '--via', 'api'], dir, {
    env: { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) },
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /GITHUB_TOKEN or GH_TOKEN/)
})

// --- stamp ------------------------------------------------------------------------

test('stamp accepts #N or N, and normalises to #N', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', '42', '--sub', '01-outbox=43'], dir, {
    env: { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) },
  })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(frontmatter(dir), /github_identifier: "#42"/)
  assert.match(frontmatter(dir), /github_url: "https:\/\/github.com\/SkitterByte\/demo\/issues\/42"/)
})

test('stamp refuses a Linear-shaped key and writes nothing', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', 'SKS-42'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not an issue number/)
  assert.doesNotMatch(frontmatter(dir), /github_identifier/)
})

test('stamp refuses a number GitHub positively has no issue for', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', '#999'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no such issue this token can see — check the number and the repo/)
})

// --- read-only commands ------------------------------------------------------------

test('states prints the bucket map with the issue state beside each row', async () => {
  const r = await run(['states'], repoWithSpec(), { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /complete\s+-> Done\s+ok · closed \(completed\)/)
  assert.match(r.out, /backlog\s+-> Backlog\s+ok · open/)
  const json = await run(['states', '--json'], repoWithSpec(), { adapter: fakeAdapter() })
  assert.deepStrictEqual(JSON.parse(json.out), STATUS_OPTIONS)
})

test('list shows top-level open issues by default, all with --all', async () => {
  const dir = repoWithSpec({ identifier: '#101' })
  const adapter = fakeAdapter()
  adapter.make('Demo').state = { name: 'In Progress' }
  const done = adapter.make('Old')
  done.open = false
  const sub = adapter.make('Phase')
  sub.parent = '101'
  const open = await run(['list', '--json'], dir, { adapter })
  assert.deepStrictEqual(JSON.parse(open.out).map((r) => [r.identifier, r.spec]), [['#101', 'feat-demo']])
  const all = await run(['list', '--all', '--json'], dir, { adapter })
  assert.strictEqual(JSON.parse(all.out).length, 2)
})

test('intake lists unadopted issues, routes on labels, and skips spec/phase issues', async () => {
  const dir = repoWithSpec({ identifier: '#101', config: { intake: { label: '', bugLabels: ['bug'], hotfixLabels: ['prod'] } } })
  const adapter = fakeAdapter()
  adapter.make('Demo', '', ['spec'])
  adapter.make('Login broken', '', ['bug'])
  adapter.make('Prod down', '', ['bug', 'prod'])
  adapter.make('Dark mode please', '', [])
  const r = await run(['intake', '--json'], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(
    JSON.parse(r.out).map((x) => [x.identifier, x.route]),
    [
      ['#102', '/spec-bug'],
      ['#103', '/spec-hotfix'],
      ['#104', '/spec'],
    ],
  )
  const filtered = await run(['intake', 'dark', '--json'], dir, { adapter })
  assert.deepStrictEqual(JSON.parse(filtered.out).map((x) => x.identifier), ['#104'])
})

test('intake without a token degrades to one line and exit 0', async () => {
  const r = await run(['intake'], repoWithSpec(), { env: { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-')) } })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /needs the API transport/)
})

// --- ref and released ---------------------------------------------------------------

function gitRepo(dir) {
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 'T')
  git('config', 'commit.gpgsign', 'false')
  return git
}

test('ref prints the bare #N for the branch spec, and only on success', async () => {
  const dir = repoWithSpec({ identifier: '#101' })
  const git = gitRepo(dir)
  git('add', '-A')
  git('commit', '-qm', 'init')
  git('switch', '-qc', 'feat/demo')
  const r = await run(['ref'], dir)
  assert.deepStrictEqual([r.code, r.out], [0, '#101\n'])
  const unlinked = repoWithSpec()
  const r2 = await run(['ref', 'feat-demo'], unlinked)
  assert.deepStrictEqual([r2.code, r2.out], [1, ''])
  assert.match(r2.err, /omit the trailer/)
})

test('released reads #N trailers and counts an older tracker as historical', async () => {
  const dir = repoWithSpec()
  const git = gitRepo(dir)
  const commit = (file, msg) => {
    fs.writeFileSync(path.join(dir, file), msg)
    git('add', '--', file)
    git('commit', '-qm', msg)
  }
  commit('a.txt', 'feat: a\n\nRefs: #5')
  commit('b.txt', 'feat: b\n\nRefs: SKS-29')
  commit('c.txt', 'chore: c')
  commit('d.txt', 'fix: d, see #9\n\nRefs: SkitterByte/other#3')
  const r = await run(['released', 'HEAD', '--json'], dir)
  const report = JSON.parse(r.out)
  assert.deepStrictEqual(report.tickets, [{ ref: '#5', commits: 1 }])
  assert.strictEqual(report.historical, 1)
  assert.strictEqual(report.unreferenced, 2, "the cross-repo trailer is not this repo's ref")
})

// --- preserve ------------------------------------------------------------------------

test('preserve posts the original body once, and is idempotent by marker', async () => {
  const dir = repoWithSpec({ identifier: '#101' })
  const adapter = fakeAdapter()
  adapter.make('Reported', 'the reporter wrote this')
  const first = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.strictEqual(first.code, 0)
  assert.match(first.out, /preserved as a comment/)
  assert.ok(adapter.issues.get('101').comments[0].body.includes(PRESERVE_MARKER))
  const second = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.match(second.out, /already preserved/)
  assert.strictEqual(adapter.calls.filter((c) => c[0] === 'createComment').length, 1)
})

test('preserve on every cannot-tell exits 0', async () => {
  const unlinked = await run(['preserve', 'feat-demo'], repoWithSpec())
  assert.deepStrictEqual([unlinked.code, /not linked/.test(unlinked.out)], [0, true])
  const empty = repoWithSpec({ identifier: '#101' })
  const adapter = fakeAdapter()
  adapter.make('Reported', '')
  const r = await run(['preserve', 'feat-demo'], empty, { adapter })
  assert.deepStrictEqual([r.code, /no body/.test(r.out)], [0, true])
})

// --- credentials, init-config, doctor ------------------------------------------------

test('credentials refuses a token in argv', async () => {
  const r = await run(['credentials', 'set', '--key', 'ghp_x'], repoWithSpec())
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--key is not supported, on purpose/)
})

test('credentials set --stdin stores under the owner, and status reads it back', async () => {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-xdg-'))
  const { Readable } = require('node:stream')
  const input = Readable.from(['ghp_' + 'z'.repeat(36)])
  input.isTTY = false
  const dir = repoWithSpec()
  const set = await run(['credentials', 'set', '--stdin'], dir, { env: { XDG_CONFIG_HOME: xdg }, input })
  assert.strictEqual(set.code, 0, set.out)
  assert.match(set.out, /stored for github\.com\/skitterbyte/)
  const status = await run(['credentials', 'status'], dir, { env: { XDG_CONFIG_HOME: xdg } })
  assert.strictEqual(status.code, 0)
  assert.match(status.out, /token:\s+set/)
  assert.doesNotMatch(status.out, /ghp_/, 'the token itself is never printed, only its fingerprint')
})

test('init-config needs owner, repo and board, and writes only what was given', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-init-'))
  const missing = await run(['init-config', '--owner', 'SkitterByte'], dir)
  assert.strictEqual(missing.code, 1)
  const r = await run(['init-config', '--owner', 'SkitterByte', '--repo', 'demo', '--project', '7'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8')), { github: { owner: 'SkitterByte', repo: 'demo', project: '7' } })
})

test('init-config refuses a states map the board cannot express, writing nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-init-'))
  const r = await run(['init-config', '--owner', 'o', '--repo', 'r', '--project', '7', '--state', 'complete=Shipped'], dir, {
    adapter: fakeAdapter(),
  })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /"Shipped" is not a "Status" option on board 7/)
  assert.ok(!fs.existsSync(path.join(dir, CONFIG_FILE)))
})

test('doctor names a missing classic scope and a missing label, and stays silent on a fine-grained token', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const env = { GITHUB_TOKEN: 'tok' }
  const r = await run(['doctor', '--check-remote', '--json'], dir, { adapter, env })
  const rows = Object.fromEntries(JSON.parse(r.out).checks.map((c) => [c.label, c]))
  assert.strictEqual(rows['Token scopes'].state, 'broken')
  assert.match(rows['Token scopes'].detail, /missing: project/)
  assert.strictEqual(rows.Labels.state, 'warn')
  adapter.readViewer = async () => ({ id: 'x', login: 'x', scopes: null })
  const fine = await run(['doctor', '--check-remote', '--json'], dir, { adapter, env })
  assert.ok(!JSON.parse(fine.out).checks.some((c) => c.label === 'Token scopes'), 'scopes unreadable is a cannot-tell')
})

test('doctor on a repo with no config reports sync off, not broken', async () => {
  const r = await run(['doctor', '--json'], fs.mkdtempSync(path.join(os.tmpdir(), 'gh-doc-')))
  const row = JSON.parse(r.out).checks[0]
  assert.strictEqual(row.state, 'missing')
})
