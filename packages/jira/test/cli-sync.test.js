'use strict'

// The jira spec-sync CLI, end to end and offline: a scaffolded repo, a fake
// adapter, injected streams. Exit-code semantics mirror the Linear provider's
// table — the assertions here are that contract.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { mdToAdf } = require('../src/adf.js')

const SITE = 'https://acme.atlassian.net'

function repoWithSpec({ identifier = null, config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cli-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ jira: { siteUrl: SITE, projectKey: 'PROJ' }, ...config }),
  )
  const spec = path.join(dir, 'specs', 'in-progress', 'feat-demo')
  fs.mkdirSync(spec, { recursive: true })
  const fm = identifier ? `---\njira_identifier: "${identifier}"\njira_url: "${SITE}/browse/${identifier}"\n---\n\n` : ''
  fs.writeFileSync(path.join(spec, '00-overview.md'), `${fm}# Demo\n\n## Problem\n\nBody prose.\n`)
  fs.writeFileSync(path.join(spec, '01-outbox.md'), '# Phase 1 — Outbox ⬜\n\n**Goal:** a durable place.\n')
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

async function run(args, dir, { adapter, env = {}, tty = false } = {}) {
  const out = new Sink(tty)
  const err = new Sink()
  const code = await specSync(args, { cwd: dir, out, err, adapter, env, tty })
  return { code, out: out.text, err: err.text }
}

// A fake adapter that behaves like a healthy Jira project.
function fakeAdapter() {
  const calls = []
  let n = 100
  const issues = new Map()
  const adapter = {
    calls,
    issues,
    async readIssue(keyOrId) {
      calls.push(['readIssue', keyOrId])
      return issues.get(String(keyOrId)) || null
    },
    async createIssue({ title, description }) {
      calls.push(['createIssue', title])
      const key = `PROJ-${++n}`
      const issue = {
        id: String(n),
        identifier: key,
        url: `${SITE}/browse/${key}`,
        title,
        description: description ?? null,
        state: { name: 'To Do' },
      }
      issues.set(key, issue).set(String(n), issue)
      return { id: issue.id, identifier: key, url: issue.url }
    },
    async createSubIssue(parentId, { title, description }) {
      calls.push(['createSubIssue', parentId, title])
      const key = `PROJ-${++n}`
      const issue = {
        id: String(n),
        identifier: key,
        url: `${SITE}/browse/${key}`,
        title,
        description: description ?? null,
        state: { name: 'To Do' },
      }
      issues.set(key, issue).set(String(n), issue)
      return { id: issue.id, identifier: key, url: issue.url }
    },
    async updateIssue(keyOrId, updates) {
      calls.push(['updateIssue', keyOrId, updates])
      const issue = issues.get(String(keyOrId))
      if (issue && updates.description !== undefined) issue.description = updates.description
      return {}
    },
    async listTransitions() {
      return [
        { id: '11', name: 'Start', to: { name: 'In Progress' } },
        { id: '21', name: 'Close', to: { name: 'Done' } },
      ]
    },
    async transitionTo(keyOrId, target) {
      calls.push(['transitionTo', keyOrId, target])
      const issue = issues.get(String(keyOrId))
      if (issue) issue.state = { name: target }
      return { moved: true, via: target }
    },
    async searchIssues() {
      calls.push(['searchIssues'])
      return []
    },
    async listIssueStates() {
      return [
        { id: '1', name: 'To Do', category: 'To Do' },
        { id: '2', name: 'In Progress', category: 'In Progress' },
        { id: '3', name: 'Done', category: 'Done' },
      ]
    },
    async listComments(keyOrId) {
      calls.push(['listComments', keyOrId])
      return adapter._comments || []
    },
    async createComment(keyOrId, body) {
      calls.push(['createComment', keyOrId, body])
      ;(adapter._comments = adapter._comments || []).push({ id: '9', body })
      return { id: '9' }
    },
  }
  return adapter
}

// --- refusals and opt-outs --------------------------------------------------

test('an unknown flag refuses before anything runs', async () => {
  const dir = repoWithSpec()
  const r = await run(['plan', 'feat-demo', '--wrte'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /unknown flag --wrte/)
})

test('no config is the opt-out: exit 0, said plainly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-noconfig-'))
  const r = await run(['plan', 'anything'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /not present — Jira sync is off/)
})

test('a spec that does not resolve exits 1 with a message', async () => {
  const dir = repoWithSpec()
  const r = await run(['normalize', 'no-such-spec'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /spec not found/)
})

// --- the state gate ---------------------------------------------------------

test('plan refuses without --workspace-states, naming both exits', async () => {
  const dir = repoWithSpec()
  const r = await run(['plan', 'feat-demo'], dir, { tty: true })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--workspace-states/)
  assert.match(r.out, /--skip-state-check/)
})

test('plan refuses a configured status the project does not have, with a suggestion', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'In Progress', 'Done']))
  const r = await run(['plan', 'feat-demo', '--workspace-states', states], dir, { tty: true })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /"Shipped" is not a status/)
  assert.match(r.out, /use "Done" instead/)
})

test('plan with valid states prints the plan JSON', async () => {
  const dir = repoWithSpec()
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'In Progress', 'Done']))
  const r = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  assert.strictEqual(r.code, 0)
  const plan = JSON.parse(r.out)
  assert.strictEqual(plan.subIssues.create.length, 1)
})

// --- apply ------------------------------------------------------------------

test('apply mints issue + subtask, transitions, stamps, records — then the next plan is empty', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, plan.out)

  const r = await run(['apply', 'feat-demo', '--plan', planFile], dir, { adapter })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /transport = api/)
  assert.match(r.out, /issue created: PROJ-101/)
  assert.match(r.out, /sub-issue created: 01-outbox → PROJ-102/)
  assert.match(r.out, /round-tripped intact/)
  assert.match(r.out, /snapshot: specs\/\.core\/jira-base\/PROJ-101\.base\.json/)

  // The status moved by TRANSITION, never a field write.
  assert.ok(adapter.calls.some(([op, , t]) => op === 'transitionTo' && t === 'In Progress'))

  // Stamps landed in the spec files.
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.match(overview, /^jira_identifier: "PROJ-101"$/m)
  const phase = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '01-outbox.md'), 'utf-8')
  assert.match(phase, /^jira_issue_id: "PROJ-102"$/m)

  // Closed loop: the next plan is empty.
  const again = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const p2 = JSON.parse(again.out)
  assert.strictEqual(p2.subIssues.create.length, 0)
  assert.strictEqual(p2.issue, undefined)
})

test('apply over MCP writes nothing and hands the skill instructions (exit 0)', async () => {
  const dir = repoWithSpec()
  const plan = path.join(dir, 'plan.json')
  fs.writeFileSync(plan, JSON.stringify({ subIssues: { create: [], update: [] }, issue: { description: 'x' } }))
  const r = await run(['apply', 'feat-demo', '--plan', plan, '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
  assert.match(r.out, /createJiraIssue/)
})

test('a twin with the spec title and no claiming spec refuses the mint', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.searchIssues = async () => [{ identifier: 'PROJ-77', title: 'Demo' }]
  const plan = await run(['plan', 'feat-demo', '--skip-state-check', '--json'], dir)
  const planFile = path.join(dir, 'plan.json')
  fs.writeFileSync(planFile, plan.out)
  const r = await run(['apply', 'feat-demo', '--plan', planFile], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /PROJ-77 is already titled "Demo"/)
  assert.match(r.out, /--force-new/)
})

// --- stamp ------------------------------------------------------------------

test('stamp validates everything before writing anything', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', 'not-a-key', '--sub', 'nope=PROJ-9'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not an issue key/)
  assert.match(r.out, /no phase file named nope/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /jira_identifier/, 'nothing written on a refusal')
})

test('stamp writes identifier, derived url and subtask stamps', async () => {
  const dir = repoWithSpec()
  const r = await run(['stamp', 'feat-demo', '--issue', 'PROJ-7', '--sub', '01-outbox=PROJ-8'], dir)
  assert.strictEqual(r.code, 0)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.match(overview, /jira_identifier: "PROJ-7"/)
  assert.match(overview, new RegExp(`jira_url: "${SITE}/browse/PROJ-7"`))
})

// --- status / verify --------------------------------------------------------

test('STAYS SILENT: an issue moved on Jira says nothing about its state', async () => {
  // skitterspec tells the tracker about its own transitions and never reads a
  // status back — in the flat shape or the raw REST one.
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  for (const shape of [{ state: { name: 'Done' } }, { key: 'PROJ-7', fields: { status: { name: 'Done' } } }]) {
    fs.writeFileSync(remote, JSON.stringify(shape))
    const r = await run(['status', 'feat-demo', '--remote', remote], dir)
    assert.strictEqual(r.code, 0)
    assert.doesNotMatch(r.out, /Jira says|agrees with the repo/)
  }
})

// --remote is documented as "fetch the issue JSON", which is the raw REST
// shape: everything under `fields`, the description as ADF. The default
// readers expect the flat shape, so without the provider hooks every check
// below routes to its silent cannot-tell branch and step 8 of the smoke
// checklist can never report anything.

test('status --remote reports a raw Jira description edited since the push', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(
    remote,
    JSON.stringify({
      key: 'PROJ-7',
      fields: { status: { name: 'In Progress' }, description: mdToAdf('entirely different words') },
    }),
  )
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /description was edited on Jira/)
})

test('status --remote stays silent on the description the repo itself pushed', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  // The projection's own text, exactly as a push renders it to ADF — the
  // round-trip contract makes its stream hash the recorded one.
  const states = path.join(dir, 'states.json')
  fs.writeFileSync(states, JSON.stringify(['To Do', 'In Progress', 'Done']))
  const plan = await run(['plan', 'feat-demo', '--workspace-states', states, '--json'], dir)
  const description = JSON.parse(plan.out).issue.description
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  fs.writeFileSync(
    remote,
    JSON.stringify({ key: 'PROJ-7', fields: { status: { name: 'In Progress' }, description: mdToAdf(description) } }),
  )
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /description was edited/)
})

test('status --remote says nothing about fields the payload never carried', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  await run(['record', 'feat-demo'], dir)
  const remote = path.join(dir, 'remote.json')
  // Status fetched, description not asked for: its absence is not an edit.
  fs.writeFileSync(remote, JSON.stringify({ key: 'PROJ-7', fields: { status: { name: 'In Progress' } } }))
  const r = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /description was edited/)
  // Nothing recognisable at all: both checks stay silent rather than accuse.
  fs.writeFileSync(remote, JSON.stringify({ key: 'PROJ-7' }))
  const bare = await run(['status', 'feat-demo', '--remote', remote], dir)
  assert.strictEqual(bare.code, 0)
  assert.doesNotMatch(bare.out, /drift/)
})

test('verify refuses a .base.json passed as --stored', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const stored = path.join(dir, 'base.json')
  fs.writeFileSync(stored, JSON.stringify({ issue: 'x', issueFields: { description: 'h' }, subIssues: {} }))
  const r = await run(['verify', 'feat-demo', '--stored', stored], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /looks like a \.base\.json snapshot/)
})

test('verify warns on lost text and still exits 0', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const stored = path.join(dir, 'stored.json')
  fs.writeFileSync(stored, JSON.stringify({ issue: 'entirely different words', subIssues: {} }))
  const r = await run(['verify', 'feat-demo', '--stored', stored], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /!! issue: the tracker stored different text/)
})

// --- ref --------------------------------------------------------------------

test('ref prints the bare identifier on stdout only on success', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const r = await run(['ref', 'feat-demo'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(r.out, 'PROJ-7\n')
})

test('ref on an unlinked spec is stderr + exit 1, stdout empty', async () => {
  const dir = repoWithSpec()
  const r = await run(['ref', 'feat-demo'], dir)
  assert.strictEqual(r.code, 1)
  assert.strictEqual(r.out, '')
  assert.match(r.err, /has no jira_identifier — omit the trailer/)
})

// --- preserve ---------------------------------------------------------------

test('preserve posts the original once, marked, and is idempotent', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const adapter = fakeAdapter()
  adapter.issues.set('PROJ-7', { id: '7', identifier: 'PROJ-7', description: 'the reporter wrote this' })
  const first = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.strictEqual(first.code, 0)
  assert.match(first.out, /original report preserved as a comment/)
  const again = await run(['preserve', 'feat-demo'], dir, { adapter })
  assert.strictEqual(again.code, 0)
  assert.match(again.out, /already preserved/)
})

test('preserve exits 0 on every cannot-tell', async () => {
  const dir = repoWithSpec() // unlinked
  const unlinked = await run(['preserve', 'feat-demo'], dir)
  assert.strictEqual(unlinked.code, 0)
  assert.match(unlinked.out, /not linked/)

  const linkedDir = repoWithSpec({ identifier: 'PROJ-7' })
  const adapter = fakeAdapter() // PROJ-7 unknown -> not found
  const missing = await run(['preserve', 'feat-demo'], linkedDir, { adapter })
  assert.strictEqual(missing.code, 0)
  assert.match(missing.out, /not found on Jira/)
})

// --- states / list ----------------------------------------------------------

test('states --json emits the bare array --workspace-states consumes', async () => {
  const dir = repoWithSpec()
  const r = await run(['states', '--json'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), ['To Do', 'In Progress', 'Done'])
})

test('states over MCP degrades to instructions, exit 0', async () => {
  const dir = repoWithSpec()
  const r = await run(['states', '--via', 'mcp'], dir)
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /transport = mcp/)
})

// --- released ---------------------------------------------------------------

test('released reads Refs: trailers out of a real range, naming the spec behind each', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
  git('init', '-q')
  git('config', 'user.email', 't@e.st')
  git('config', 'user.name', 'T')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a')
  git('add', '-A')
  git('commit', '-q', '-m', 'feat(x): thing\n\nRefs: PROJ-7')
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b')
  git('add', '-A')
  git('commit', '-q', '-m', 'chore: no trailer here')
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c')
  git('add', '-A')
  git('commit', '-q', '-m', 'fix(y): other\n\nRefs: PROJ-8')
  const r = await run(['released', 'HEAD', '--json'], dir)
  assert.strictEqual(r.code, 0, r.out)
  const report = JSON.parse(r.out)
  assert.deepStrictEqual(report.tickets, [
    { ref: 'PROJ-8', commits: 1, spec: null, url: null },
    { ref: 'PROJ-7', commits: 1, spec: 'feat-demo', url: `${SITE}/browse/PROJ-7` },
  ])
  assert.strictEqual(report.unreferenced, 1)
})

// --- init-config / credentials / doctor ------------------------------------

test('init-config writes only what was set, and validates through the loader', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-init-'))
  const r = await run(
    ['init-config', '--site-url', SITE, '--project-key', 'PROJ', '--state', 'complete=Shipped'],
    dir,
  )
  assert.strictEqual(r.code, 0)
  const written = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILE), 'utf-8'))
  assert.deepStrictEqual(written, {
    jira: { siteUrl: SITE, projectKey: 'PROJ' },
    states: { complete: 'Shipped' },
  })
  // Spec worktrees fork from commits, so a written-but-uncommitted config is
  // invisible exactly where the sync skills run — the write must say so.
  assert.match(r.out, /commit it/)
  const again = await run(['init-config', '--site-url', SITE, '--project-key', 'PROJ'], dir)
  assert.strictEqual(again.code, 1)
  assert.match(again.out, /--force/)
})

test('init-config refuses a non-bucket --state key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-init-'))
  const r = await run(['init-config', '--site-url', SITE, '--project-key', 'P', '--state', 'shipped=Done'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not a lifecycle bucket/)
})

test('credentials status is a readiness check: exit 1 with none, never a token in output', async () => {
  const dir = repoWithSpec()
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-home-'))
  const r = await run(['credentials', 'status'], dir, { env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /token: {2}not set/)
  assert.match(r.out, /Run this yourself, in your own terminal/)

  const withEnv = await run(['credentials', 'status'], dir, {
    env: { XDG_CONFIG_HOME: home, JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'supersecret99' },
  })
  assert.strictEqual(withEnv.code, 0)
  assert.doesNotMatch(withEnv.out, /supersecret99/)
  assert.match(withEnv.out, /…et99/)
})

test('credentials set --key is refused on purpose', async () => {
  const dir = repoWithSpec()
  const r = await run(['credentials', 'set', '--key', 'sekret'], dir)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--key is not supported, on purpose/)
  assert.doesNotMatch(r.out, /sekret/)
})

test('doctor: missing config is missing (ok), a half-filled one is broken', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-doc-'))
  const missing = await run(['doctor', '--json'], empty)
  assert.strictEqual(missing.code, 0, 'a declined opt-in never fails the run')
  const report = JSON.parse(missing.out)
  assert.strictEqual(report.checks.find((c) => c.id === 'tracker').state, 'missing')

  const half = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-doc-'))
  fs.mkdirSync(path.join(half, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(half, CONFIG_FILE), JSON.stringify({ jira: { siteUrl: SITE } }))
  const broken = await run(['doctor', '--json'], half)
  assert.strictEqual(broken.code, 1)
  assert.strictEqual(JSON.parse(broken.out).checks.find((c) => c.id === 'tracker').state, 'broken')
})

test('doctor --check-remote validates the configured states against the project', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const adapter = fakeAdapter()
  adapter.readViewer = async () => ({ id: 'acc-1', name: 'Jane' })
  const r = await run(['doctor', '--check-remote', '--json'], dir, {
    adapter,
    env: { JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 't' },
  })
  assert.strictEqual(r.code, 1)
  const states = JSON.parse(r.out).checks.find((c) => c.id === 'states')
  assert.strictEqual(states.state, 'broken')
  assert.match(states.detail, /Shipped/)
})

// --- linked (offline) -------------------------------------------------------

test('linked lists every spec with its link state, offline', async () => {
  const dir = repoWithSpec({ identifier: 'PROJ-7' })
  const r = await run(['linked', '--json'], dir)
  assert.strictEqual(r.code, 0)
  assert.deepStrictEqual(JSON.parse(r.out), [{ spec: 'feat-demo', bucket: 'in-progress', identifier: 'PROJ-7' }])
})

// The smoke's first finding: credentials are USER-level, so they must be
// storable and checkable before the repo has any config at all.
test('credentials works before the repo opts in, keyed by --site-url', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-precfg-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-prehome-'))
  const bare = await run(['credentials', 'status'], dir, { env: { XDG_CONFIG_HOME: home } })
  assert.strictEqual(bare.code, 1)
  assert.match(bare.out, /pass --site-url/)

  const status = await run(['credentials', 'status', '--site-url', SITE], dir, {
    env: { XDG_CONFIG_HOME: home, JIRA_EMAIL: 'a@b.c', JIRA_API_TOKEN: 'tok' },
  })
  assert.strictEqual(status.code, 0, status.out)
  assert.match(status.out, new RegExp(SITE.replace(/[/.]/g, '\\$&')))
})

// init-config checks the map against the project when it can — the smoke's
// second finding: a bad default sailed through to fail at doctor instead.
test('init-config refuses a map the project cannot express, naming the choices', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-initval-'))
  const adapter = {
    async listIssueStates() {
      return [{ id: '1', name: 'To Do' }, { id: '2', name: 'In Progress' }, { id: '5', name: 'On Live' }]
    },
  }
  const r = await run(['init-config', '--site-url', SITE, '--project-key', 'ERQ'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /refusing — nothing written/)
  assert.match(r.out, /"Done" is not a status in ERQ/)
  assert.match(r.out, /available: To Do, In Progress, On Live/)
  assert.strictEqual(fs.existsSync(path.join(dir, CONFIG_FILE)), false)

  const fixed = await run(
    ['init-config', '--site-url', SITE, '--project-key', 'ERQ', '--state', 'complete=On Live', '--state', 'cancelled=On Live'],
    dir,
    { adapter },
  )
  assert.strictEqual(fixed.code, 0, fixed.out)
  assert.match(fixed.out, /wrote/)
})

test('init-config stays usable with no credentials — written, with one honest line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-initnocred-'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-inithome-'))
  const r = await run(['init-config', '--site-url', SITE, '--project-key', 'PROJ'], dir, {
    env: { XDG_CONFIG_HOME: home },
  })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /states not checked against the project/)
  assert.ok(fs.existsSync(path.join(dir, CONFIG_FILE)))
})

// The uncommitted-config trap: worktrees fork from commits, so a config that
// exists only in the working tree turns sync off in every spec worktree with
// no clue pointing back. Doctor warns on the positive signal (git tracks the
// file) and stays silent on every cannot-tell (negative-checks rule 3).
test('doctor warns on an untracked config, and stays silent once committed', async () => {
  const { execFileSync } = require('node:child_process')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-doc-git-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ jira: { siteUrl: SITE, projectKey: 'PROJ' } }),
  )
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  git('init')

  const untracked = await run(['doctor', '--json'], dir)
  assert.strictEqual(untracked.code, 0, 'a warn never fails the run')
  const warnRow = JSON.parse(untracked.out).checks.find((c) => c.label === 'Config committed')
  assert.ok(warnRow, 'untracked config gets a row')
  assert.strictEqual(warnRow.state, 'warn')
  assert.match(warnRow.detail, /untracked/)

  git('add', '--', 'specs/.core/jira.config.json')
  git('-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-m', 'config')
  const committed = await run(['doctor', '--json'], dir)
  assert.strictEqual(
    JSON.parse(committed.out).checks.find((c) => c.label === 'Config committed'),
    undefined,
    'a committed config earns silence, not an ok row',
  )
})

test('doctor says nothing about committing outside a git repo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-doc-nogit-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify({ jira: { siteUrl: SITE, projectKey: 'PROJ' } }),
  )
  const r = await run(['doctor', '--json'], dir)
  assert.strictEqual(r.code, 0)
  assert.strictEqual(
    JSON.parse(r.out).checks.find((c) => c.label === 'Config committed'),
    undefined,
    'no git is a cannot-tell, not an accusation',
  )
})

// --- the bucket map ----------------------------------------------------------
// "How is skitterspec wired to what this project actually has?" gets one
// visual answer: `states` renders every bucket with a verdict. Both halves per
// negative-checks rule 3 — a broken map accuses, a healthy one stays quiet.
test('states renders the bucket map, naming the miss and its closest match', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Shipped' } } })
  const r = await run(['states'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /map: lifecycle bucket -> Jira status/)
  assert.match(r.out, /backlog\s+-> To Do\s+ok \[To Do\]/)
  assert.match(r.out, /complete\s+-> Shipped\s+MISSING from the project — closest: "Done"/)
  assert.match(r.out, /remap: spec-sync init-config --force --state/)
})

test('a fully-mapped project earns ok rows and no remap line', async () => {
  const dir = repoWithSpec({ config: { states: { complete: 'Done', cancelled: 'Done' } } })
  const r = await run(['states'], dir, { adapter: fakeAdapter() })
  assert.strictEqual(r.code, 0)
  assert.doesNotMatch(r.out, /MISSING/)
  assert.doesNotMatch(r.out, /remap:/)
  assert.match(r.out, /complete\s+-> Done\s+ok \[Done\]/)
})

test('states --json stays the bare array --workspace-states consumes', async () => {
  const dir = repoWithSpec()
  const r = await run(['states', '--json'], dir, { adapter: fakeAdapter() })
  assert.deepStrictEqual(JSON.parse(r.out), ['To Do', 'In Progress', 'Done'])
})

// --- stamp's live check -------------------------------------------------------
// A wrong stamp mints a duplicate on the NEXT push, far from the typo, so when
// credentials resolve stamp refuses a key Jira positively lacks. Both halves
// per negative-checks rule 3: the refusal fires, and every cannot-tell —
// offline, unreachable — stamps exactly as before.
test('stamp refuses a key Jira says does not exist, writing nothing', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter() // holds no issues at all
  const r = await run(['stamp', 'feat-demo', '--issue', 'PROJ-99'], dir, { adapter })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /PROJ-99: Jira has no such issue/)
  const overview = fs.readFileSync(path.join(dir, 'specs', 'in-progress', 'feat-demo', '00-overview.md'), 'utf-8')
  assert.doesNotMatch(overview, /jira_identifier/)
})

test('stamp verifies the key when it can, and says so', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  const made = await adapter.createIssue({ title: 'Hand-filed', description: 'PM text' })
  const r = await run(['stamp', 'feat-demo', '--issue', made.identifier], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /verified against Jira/)
})

test('an unreachable Jira stamps anyway, saying it could not check', async () => {
  const dir = repoWithSpec()
  const adapter = fakeAdapter()
  adapter.readIssue = async () => {
    throw new Error('getaddrinfo ENOTFOUND')
  }
  const r = await run(['stamp', 'feat-demo', '--issue', 'PROJ-7'], dir, { adapter })
  assert.strictEqual(r.code, 0)
  assert.match(r.out, /could not check the key\(s\) against Jira — stamping anyway/)
  assert.match(r.out, /PROJ-7 stamped onto feat-demo/)
  assert.doesNotMatch(r.out, /verified against Jira/)
})
