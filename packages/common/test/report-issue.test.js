'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  parseGithubRepo,
  redact,
  planReport,
  searchDuplicates,
  openerFor,
  reportIssueCommand,
  URL_CAP,
} = require('../src/report-issue.js')

const PKG = {
  name: '@skitterbyte/skitterspec-github',
  version: '4.0.0',
  repository: { type: 'git', url: 'git+https://github.com/SkitterByte/skitterspec.git' },
}

function base(overrides = {}) {
  return {
    kind: 'bug',
    title: 'spec-env up forks from the wrong commit',
    body: 'It forked from HEAD instead of main.',
    skill: 'spec-start',
    pkg: PKG,
    origin: 'git@github.com:acme/payroll-api.git',
    home: '/Users/alice',
    root: '/Users/alice/code/payroll-api',
    provider: 'github',
    platform: 'darwin',
    release: '25.0.0',
    nodeVersion: 'v22.13.0',
    ...overrides,
  }
}

test('parseGithubRepo reads every spelling of a GitHub remote', () => {
  const want = { owner: 'SkitterByte', repo: 'skitterspec' }
  for (const url of [
    'git+https://github.com/SkitterByte/skitterspec.git',
    'https://github.com/SkitterByte/skitterspec',
    'https://github.com/SkitterByte/skitterspec/',
    'git@github.com:SkitterByte/skitterspec.git',
    'ssh://git@github.com/SkitterByte/skitterspec.git',
  ]) {
    assert.deepStrictEqual(parseGithubRepo(url), want, url)
  }
})

test('parseGithubRepo answers null for anything not plainly GitHub', () => {
  for (const url of [undefined, null, '', 'https://gitlab.com/a/b.git', 'https://github.com/only-owner', 'not a url']) {
    assert.strictEqual(parseGithubRepo(url), null, String(url))
  }
})

test('the target comes from repository.url, in either package.json shape', () => {
  assert.deepStrictEqual(planReport(base()).target, { owner: 'SkitterByte', repo: 'skitterspec' })
  const shorthand = planReport(base({ pkg: { ...PKG, repository: 'https://github.com/SkitterByte/skitterspec' } }))
  assert.deepStrictEqual(shorthand.target, { owner: 'SkitterByte', repo: 'skitterspec' })
})

test('a missing or non-GitHub repository.url refuses rather than guessing', () => {
  const { repository, ...noRepo } = PKG
  assert.match(planReport(base({ pkg: noRepo })).refused, /cannot tell where to report/)
  const gitlab = { ...PKG, repository: { url: 'https://gitlab.com/x/y.git' } }
  assert.match(planReport(base({ pkg: gitlab })).refused, /cannot tell where to report/)
})

test('a bad kind, an empty title or an empty body refuses', () => {
  assert.match(planReport(base({ kind: 'question' })).refused, /--kind/)
  assert.match(planReport(base({ title: '  ' })).refused, /--title/)
  assert.match(planReport(base({ body: '' })).refused, /--body-file/)
})

test('inside the target repo itself it redirects to /spec and builds no url', () => {
  for (const origin of ['https://github.com/SkitterByte/skitterspec.git', 'git@github.com:skitterbyte/SKITTERSPEC.git']) {
    const plan = planReport(base({ origin }))
    assert.match(plan.redirect, /\/spec, \/spec-bug or \/spec-idea/)
    assert.strictEqual(plan.url, undefined)
  }
})

test('the remote, the repo root, home and the project name are redacted everywhere', () => {
  const plan = planReport(
    base({
      title: 'payroll-api: review page 404s',
      body: [
        'Ran in /Users/alice/code/payroll-api/specs.',
        'Remote git@github.com:acme/payroll-api.git refused.',
        'Config at /Users/alice/.config/x.',
        'PAYROLL-API is our name.',
      ].join('\n'),
    }),
  )
  const all = plan.title + plan.fields.description + plan.fields.environment + plan.url
  assert.doesNotMatch(all, /payroll-api/i)
  assert.doesNotMatch(all, /alice/)
  assert.doesNotMatch(all, /acme/)
  assert.match(plan.fields.description, /Ran in <project>\/specs\./)
  assert.match(plan.fields.description, /Remote <project-remote> refused\./)
  assert.match(plan.fields.description, /Config at ~\/\.config\/x\./)
  assert.strictEqual(plan.title, '<project>: review page 404s')
})

test('redaction leaves a word that merely contains the project name alone', () => {
  const out = redact('run /spec-bug, then spec and specs', { names: ['spec'] })
  assert.strictEqual(out, 'run /spec-bug, then <project> and specs')
})

test('redaction skips a name too short to be safe to blank', () => {
  assert.strictEqual(redact('the ui app failed', { names: ['ui'] }), 'the ui app failed')
})

test('the environment carries versions, provider, OS, Node and the skill', () => {
  const env = planReport(base()).fields.environment
  assert.match(env, /skitterspec: @skitterbyte\/skitterspec-github@4\.0\.0/)
  assert.match(env, /provider: github/)
  assert.match(env, /OS: darwin 25\.0\.0/)
  assert.match(env, /Node: v22\.13\.0/)
  assert.match(env, /skill: spec-start/)
})

test('the url fills the form by template and field id, and labels come from the form', () => {
  const plan = planReport(base({ kind: 'feature' }))
  const u = new URL(plan.url)
  assert.strictEqual(u.origin + u.pathname, 'https://github.com/SkitterByte/skitterspec/issues/new')
  assert.strictEqual(u.searchParams.get('template'), 'feature.yml')
  assert.strictEqual(u.searchParams.get('description'), 'It forked from HEAD instead of main.')
  assert.match(u.searchParams.get('environment'), /Node: v22/)
  assert.strictEqual(u.searchParams.get('labels'), null)
  assert.deepStrictEqual(plan.labels, ['triage', 'enhancement'])
})

test('a healthy short report is left untouched', () => {
  const plan = planReport(base())
  assert.strictEqual(plan.truncated, false)
  assert.strictEqual(plan.fields.description, 'It forked from HEAD instead of main.')
  assert.ok(plan.url.length <= URL_CAP)
})

test('an over-long report is trimmed to the cap, with the full body returned', () => {
  const body = 'stack frame & more ✓ '.repeat(1200)
  const plan = planReport(base({ body }))
  assert.strictEqual(plan.truncated, true)
  assert.ok(plan.url.length <= URL_CAP, `url is ${plan.url.length}`)
  assert.match(new URL(plan.url).searchParams.get('description'), /trimmed to fit the link/)
  assert.ok(plan.fullBody.includes(body.trim()), 'fullBody holds the untrimmed description')
  assert.match(plan.fullBody, /### Environment/)
})

test('duplicates: matches come back as found', async () => {
  let asked
  const fetch = async (url) => {
    asked = decodeURIComponent(url)
    return { ok: true, json: async () => ({ items: [{ number: 12, title: 'up forks wrong', html_url: 'https://x/12' }] }) }
  }
  const r = await searchDuplicates({ target: { owner: 'SkitterByte', repo: 'skitterspec' }, title: 'spec-env up forks wrong', fetch })
  assert.strictEqual(r.state, 'found')
  assert.deepStrictEqual(r.items, [{ number: 12, title: 'up forks wrong', url: 'https://x/12' }])
  assert.match(asked, /repo:SkitterByte\/skitterspec is:issue is:open/)
})

test('duplicates: a search that ran and matched nothing is none', async () => {
  const fetch = async () => ({ ok: true, json: async () => ({ items: [] }) })
  const r = await searchDuplicates({ target: { owner: 'o', repo: 'r' }, title: 'review page broken', fetch })
  assert.strictEqual(r.state, 'none')
})

test('duplicates: a failed, limited or absent search is cannot-tell, never none', async () => {
  const target = { owner: 'o', repo: 'r' }
  const title = 'review page broken'
  const thrown = await searchDuplicates({ target, title, fetch: async () => { throw new Error('getaddrinfo ENOTFOUND') } })
  assert.strictEqual(thrown.state, 'cannot-tell')
  const limited = await searchDuplicates({ target, title, fetch: async () => ({ ok: false, status: 403 }) })
  assert.strictEqual(limited.state, 'cannot-tell')
  assert.match(limited.reason, /403/)
  // null, not undefined: undefined would take the default and reach the network.
  const noFetch = await searchDuplicates({ target, title, fetch: null })
  assert.strictEqual(noFetch.state, 'cannot-tell')
})

test('the opener never hands a url with & to cmd', () => {
  assert.deepStrictEqual(openerFor('darwin', 'u'), ['open', ['u']])
  assert.deepStrictEqual(openerFor('linux', 'u'), ['xdg-open', ['u']])
  assert.strictEqual(openerFor('win32', 'a&b')[0], 'rundll32')
})

function sink() {
  let text = ''
  return { write: (s) => { text += s }, get text() { return text } }
}

test('the command previews without opening, and opens only on --open', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-issue-'))
  fs.writeFileSync(path.join(dir, 'body.md'), 'The page 404s.')
  const fetch = async () => ({ ok: false, status: 403 })
  const spawned = []
  const spawn = (cmd, args) => {
    spawned.push([cmd, args])
    return { on() {}, unref() {} }
  }
  const args = ['--kind', 'bug', '--title', 'review page 404s', '--body-file', 'body.md', '--dir', dir]

  const out = sink()
  assert.strictEqual(await reportIssueCommand(args, { fetch, spawn, stdout: out, pkg: PKG }), 0)
  assert.match(out.text, /preview — nothing opened/)
  assert.match(out.text, /duplicates: cannot tell — GitHub search answered 403/)
  assert.match(out.text, /url: https:\/\/github\.com\/SkitterByte\/skitterspec\/issues\/new\?template=bug\.yml/)
  assert.strictEqual(spawned.length, 0)

  const json = sink()
  assert.strictEqual(await reportIssueCommand([...args, '--open', '--json'], { fetch, spawn, stdout: json, pkg: PKG }), 0)
  assert.strictEqual(spawned.length, 1)
  assert.strictEqual(JSON.parse(json.text).opened, true)
})

test('the command refuses a body file it cannot read', async () => {
  const err = sink()
  const code = await reportIssueCommand(['--kind', 'bug', '--title', 't', '--body-file', '/nonexistent/x.md'], {
    stderr: err,
    stdout: sink(),
    pkg: PKG,
  })
  assert.strictEqual(code, 1)
  assert.match(err.text, /cannot read --body-file/)
})
