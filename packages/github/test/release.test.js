'use strict'

// `spec-sync release create | deployed | complete` over GitHub, end to end:
// a real git repo with tags, a fake adapter holding releases in memory.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { resolveRange, composeBody, stageOf, withStage, parseLinks, seriesFor } = require('@skitterbyte/skitterspec-provider-kit/src/releases.js')

const SERIES = [{ tagPrefix: 'demo@', envs: { staged: 'Staged', test: 'Test', prod: 'Prod' } }]

function spec(dir, name, bucket, identifier) {
  const d = path.join(dir, 'specs', bucket, name)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, '00-overview.md'), `---\ngithub_identifier: "${identifier}"\n---\n\n# ${name}\n`)
}

// History: #1 complete, #2 in flight, a #9 nobody claims, a foreign repo's ref,
// a bookkeeping commit, and an older tracker's trailer. Tags demo@1.0.0 then
// demo@1.1.0, plus a hotfix demo@1.0.1 cut from 1.0.0.
function repo(series = SERIES) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-rel-'))
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 'T')
  git('config', 'commit.gpgsign', 'false')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ github: { owner: 'o', repo: 'r', project: 7 }, releases: { series } }))
  spec(dir, 'feat-one', 'complete', '#1')
  spec(dir, 'feat-two', 'in-progress', '#2')
  const commit = (file, msg) => {
    fs.writeFileSync(path.join(dir, file), msg)
    git('add', '-A')
    git('commit', '-qm', msg)
  }
  commit('base.txt', 'chore: base')
  git('tag', 'demo@1.0.0')
  commit('a.txt', 'feat: a\n\nRefs: #1')
  commit('b.txt', 'feat: b\n\nRefs: #2')
  commit('c.txt', 'feat: c\n\nRefs: #9')
  commit('d.txt', 'feat: d\n\nRefs: other/repo#4')
  commit('e.txt', 'feat: e\n\nRefs: SKS-12')
  git('tag', 'demo@1.1.0')
  git('switch', '-qc', 'hotfix', 'demo@1.0.0')
  commit('h.txt', 'fix: h\n\nRefs: #1')
  git('tag', 'demo@1.0.1')
  git('switch', '-q', 'main')
  return dir
}

class Sink {
  constructor() {
    this.text = ''
  }
  write(s) {
    this.text += s
  }
}
async function run(args, dir, adapter, fetch) {
  const out = new Sink()
  const code = await specSync(args, { cwd: dir, out, err: new Sink(), adapter, fetch, env: {} })
  return { code, out: out.text }
}

function fakeAdapter({ tagOnRemote = true, findThrows = false } = {}) {
  const releases = new Map()
  const comments = new Map()
  const fields = new Map()
  const calls = []
  let id = 0
  return {
    calls,
    releases,
    comments,
    fields,
    async readIssue(ref) {
      return { title: `Issue ${ref}` }
    },
    async releaseTagExists() {
      return tagOnRemote
    },
    async releaseFind(tag) {
      if (findThrows) throw new Error('502 Bad Gateway')
      const r = releases.get(tag)
      return r ? { ...r } : null
    },
    async releaseCreate({ tag, body, prerelease }) {
      calls.push(['create', tag])
      const r = { id: ++id, tag, url: `https://github.com/o/r/releases/tag/${tag}`, body, prerelease }
      releases.set(tag, r)
      return { ...r }
    },
    async releaseUpdate(release, { body }) {
      calls.push(['update', release.tag])
      releases.get(release.tag).body = body
      release.body = body
      return release
    },
    async releaseAttach(release, tickets) {
      let attached = 0
      let already = 0
      for (const t of tickets) {
        const key = `${t.ref}:${release.tag}`
        if (comments.has(key)) already++
        else {
          comments.set(key, true)
          attached++
        }
      }
      return { attached, already }
    },
    async releaseStage(release, option, tickets) {
      for (const t of tickets) fields.set(t.ref, option)
      return { set: tickets.length }
    },
    async releaseComplete(release, { latest = true } = {}) {
      calls.push(['complete', release.tag, latest])
      releases.get(release.tag).prerelease = false
      return release
    },
    async releaseList() {
      return [...releases.values()].map((r) => ({ ...r }))
    },
  }
}

test('create is a dry run by default: the plan, nothing written', async () => {
  const dir = repo()
  const a = fakeAdapter()
  const r = await run(['release', 'create', 'demo@1.1.0'], dir, a)
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /dry run/)
  assert.match(r.out, /range:\s+demo@1\.0\.0\.\.demo@1\.1\.0/)
  assert.match(r.out, /attach:\s+#1, #2/)
  assert.match(r.out, /in flight: #2/)
  assert.match(r.out, /unlinked: #9/)
  assert.match(r.out, /1 commit\(s\) reference an earlier tracker/, 'the SKS-12 commit is counted, not dropped')
  assert.match(r.out, /would create the release/)
  assert.strictEqual(a.calls.length, 0)
})

test('create --apply makes a staged prerelease listing its issues, and notes each issue once', async () => {
  const dir = repo()
  const a = fakeAdapter()
  const r = await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  assert.strictEqual(r.code, 0, r.out)
  const rel = a.releases.get('demo@1.1.0')
  assert.strictEqual(rel.prerelease, true)
  assert.match(rel.body, /## Issues\n\n- #1 Issue #1\n- #2 Issue #2/)
  assert.doesNotMatch(rel.body, /#9|other\/repo|SKS-12/, 'unlinked, foreign and older-tracker refs are never attached')
  assert.strictEqual(stageOf(rel.body), 'staged')
  assert.match(r.out, /issues:\s+2 noted, 0 already noted/)
})

test('a CI retry on the same tag changes nothing', async () => {
  const dir = repo()
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const again = await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  assert.strictEqual(again.code, 0)
  assert.match(again.out, /unchanged:/)
  assert.match(again.out, /0 noted, 2 already noted/)
  assert.deepStrictEqual(a.calls.map((c) => c[0]), ['create'])
})

test('a failed lookup refuses rather than risk a duplicate', async () => {
  const r = await run(['release', 'create', 'demo@1.1.0', '--apply'], repo(), fakeAdapter({ findThrows: true }))
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /could not look up the release .* refusing rather than risk a duplicate/)
})

test('a tag GitHub has not got is refused — GitHub would create it at the wrong commit', async () => {
  const a = fakeAdapter({ tagOnRemote: false })
  const r = await run(['release', 'create', 'demo@1.1.0', '--apply'], repo(), a)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /not on the GitHub remote yet — push the tag first/)
  assert.strictEqual(a.calls.length, 0)
})

test('a hotfix tag ranges from its base tag, not from the newest one', async () => {
  const r = await run(['release', 'create', 'demo@1.0.1'], repo(), fakeAdapter())
  assert.match(r.out, /range:\s+demo@1\.0\.0\.\.demo@1\.0\.1/)
  assert.match(r.out, /attach:\s+#1\n/)
})

test('the first release in a series says it has no previous tag', async () => {
  const r = await run(['release', 'create', 'demo@1.0.0'], repo(), fakeAdapter())
  assert.match(r.out, /no previous release in this series/)
})

test('a bare version is accepted with one series; an unknown prefix is refused', async () => {
  const dir = repo()
  assert.match((await run(['release', 'create', '1.1.0'], dir, fakeAdapter())).out, /demo@1\.1\.0/)
  const bad = await run(['release', 'create', 'other@1.0.0'], dir, fakeAdapter())
  assert.strictEqual(bad.code, 1)
  assert.match(bad.out, /matches no releases\.series tagPrefix/)
})

test('deployed sets the Deployed option on every issue, and records the stage', async () => {
  const dir = repo()
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'deployed', 'demo@1.1.0', 'test', '--apply'], dir, a)
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual([...a.fields.entries()], [['#1', 'Test'], ['#2', 'Test']])
  assert.strictEqual(stageOf(a.releases.get('demo@1.1.0').body), 'test')
})

test('a backwards stage warns and never refuses', async () => {
  const dir = repo()
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  await run(['release', 'deployed', 'demo@1.1.0', 'prod', '--apply'], dir, a)
  const back = await run(['release', 'deployed', 'demo@1.1.0', 'test', '--apply'], dir, a)
  assert.strictEqual(back.code, 0)
  assert.match(back.out, /!! moves back from "prod"/)
})

test('a create re-run after a deploy keeps the stage it reached', async () => {
  const dir = repo()
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  await run(['release', 'deployed', 'demo@1.1.0', 'prod', '--apply'], dir, a)
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  assert.strictEqual(stageOf(a.releases.get('demo@1.1.0').body), 'prod')
})

test('deployed and complete refuse a release that does not exist yet, and an unknown env', async () => {
  const dir = repo()
  const r = await run(['release', 'deployed', 'demo@1.1.0', 'test', '--apply'], dir, fakeAdapter())
  assert.match(r.out, /run `release create demo@1\.1\.0` first/)
  const env = await run(['release', 'deployed', 'demo@1.1.0', 'qa'], dir, fakeAdapter())
  assert.match(env.out, /pass an env of demo@: staged, test, prod/)
  assert.strictEqual((await run(['release', 'complete', 'demo@1.1.0', '--apply'], dir, fakeAdapter())).code, 1)
})

test('complete clears the prerelease flag', async () => {
  const dir = repo()
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  await run(['release', 'complete', 'demo@1.1.0', '--apply'], dir, a)
  assert.strictEqual(a.releases.get('demo@1.1.0').prerelease, false)
})

test('over MCP a release is impossible, not slower — exit 1 and say why', async () => {
  const r = await run(['release', 'create', 'demo@1.1.0', '--via', 'mcp'], repo(), fakeAdapter())
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no release write tool/)
})

test('a provider adapter without the release ops refuses in one line', async () => {
  const r = await run(['release', 'create', 'demo@1.1.0'], repo(), { readIssue: async () => null })
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /has no release support/)
})

// --- reconcile: the self-healing half of the mirror ---------------------------
//
// Approvals that happen outside `release deployed` — the npm website, a missed
// CI run — are caught by `release reconcile`: it probes the registry and moves
// every marked release whose version is live (or contained in a newer live one)
// to the series' FINAL env. All registry reads go through the injected fetch.

const NPM_SERIES = [{ tagPrefix: 'demo@', envs: { staged: 'Staged', test: 'Test', prod: 'Prod' }, npm: 'demo-pkg' }]

// name → versions[] (live), or { status } for a registry that answers badly.
function fakeRegistry(map) {
  return async (url) => {
    const name = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
    const entry = map[name]
    if (!entry) return { ok: false, status: 404, json: async () => ({}) }
    if (entry.status) return { ok: false, status: entry.status, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => ({ versions: Object.fromEntries(entry.map((v) => [v, {}])) }) }
  }
}

test('reconcile is a dry run by default: the plan, nothing written', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const before = a.calls.length
  const r = await run(['release', 'reconcile'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /dry run/)
  assert.match(r.out, /demo@1\.1\.0: would move to prod and complete \(latest\)/)
  assert.strictEqual(a.calls.length, before, 'nothing written on a dry run')
})

test('reconcile --apply moves a live release to the final env and completes it as latest', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /demo@1\.1\.0: moved to prod and completed \(latest\) — 2 issue\(s\)/)
  assert.deepStrictEqual([...a.fields.entries()], [['#1', 'Prod'], ['#2', 'Prod']])
  const rel = a.releases.get('demo@1.1.0')
  assert.strictEqual(stageOf(rel.body), 'prod')
  assert.strictEqual(rel.prerelease, false)
  assert.deepStrictEqual(a.calls.at(-1), ['complete', 'demo@1.1.0', true])
})

test('containment: a superseded release moves when a NEWER version is live, and never takes latest', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.0.1', '--apply'], dir, a)
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  // Only 1.1.0 was ever approved on npm; 1.0.1's commits shipped inside it.
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  const completes = a.calls.filter((c) => c[0] === 'complete')
  assert.deepStrictEqual(completes, [['complete', 'demo@1.0.1', false], ['complete', 'demo@1.1.0', true]], 'ascending, latest only on the newest')
  assert.strictEqual(stageOf(a.releases.get('demo@1.0.1').body), 'prod')
})

test('an older release reconciled beside an already-final newer one never takes latest', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.0.1', '--apply'], dir, a)
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  await run(['release', 'deployed', 'demo@1.1.0', 'prod', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.deepStrictEqual(a.calls.filter((c) => c[0] === 'complete'), [['complete', 'demo@1.0.1', false]])
})

test('STAYS SILENT: a version the registry has not got yet is kept, and nothing is written', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const before = a.calls.length
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.0.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /demo@1\.1\.0: kept — not on npm yet/)
  assert.strictEqual(a.calls.length, before)
})

test('STAYS SILENT: a package the registry answers 404 for moves nothing and exits 0', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({}))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /not on the public registry/)
  assert.strictEqual(stageOf(a.releases.get('demo@1.1.0').body), 'staged')
})

test('STAYS SILENT: an unreachable registry moves nothing and exits 0', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, async () => {
    throw new Error('ENOTFOUND registry.npmjs.org')
  })
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /registry unreachable/)
  assert.strictEqual(stageOf(a.releases.get('demo@1.1.0').body), 'staged')
})

test('STAYS SILENT: a series with no npm name is skipped with the reason named', async () => {
  const dir = repo(SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /no "npm" name to probe/)
  assert.strictEqual(stageOf(a.releases.get('demo@1.1.0').body), 'staged')
})

test('STAYS SILENT: a hand-made release without the marker is never read or written', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  a.releases.set('demo@0.9.0', { id: 99, tag: 'demo@0.9.0', url: null, body: 'hand-written notes', prerelease: false })
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['0.9.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /nothing to reconcile/)
  assert.strictEqual(a.releases.get('demo@0.9.0').body, 'hand-written notes')
})

test('STAYS SILENT: a release already at the final env owes nothing', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  await run(['release', 'deployed', 'demo@1.1.0', 'prod', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 0, r.out)
  assert.match(r.out, /nothing to reconcile/)
})

test('reconcile --json carries the plan', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  await run(['release', 'create', 'demo@1.1.0', '--apply'], dir, a)
  const r = await run(['release', 'reconcile', '--json'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  const parsed = JSON.parse(r.out)
  assert.strictEqual(parsed.apply, false)
  assert.strictEqual(parsed.releases.length, 1)
  assert.strictEqual(parsed.releases[0].tag, 'demo@1.1.0')
})

test('a listing that failed refuses loudly — a cannot-tell about every release at once', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  a.releaseList = async () => {
    throw new Error('502 Bad Gateway')
  }
  const r = await run(['release', 'reconcile', '--apply'], dir, a, fakeRegistry({ 'demo-pkg': ['1.1.0'] }))
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /could not list releases/)
})

test('an adapter without releaseList refuses in one line', async () => {
  const dir = repo(NPM_SERIES)
  const a = fakeAdapter()
  delete a.releaseList
  const r = await run(['release', 'reconcile'], dir, a)
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /no reconcile support \(releaseList\)/)
})

// --- the kit's pure pieces ----------------------------------------------------

test('a shallow clone is refused before describe can return everything', () => {
  const git = (argv) => (argv[0] === 'rev-parse' && argv[1] === '--is-shallow-repository' ? 'true' : 'x')
  const got = resolveRange('/x', 'demo@1.0.0', 'demo@', git)
  assert.strictEqual(got.ok, false)
  assert.match(got.error, /fetch-depth: 0/)
})

test('a tag absent from the repo is refused', () => {
  const git = (argv) => (argv[1] === '--is-shallow-repository' ? 'false' : argv[1] === '--verify' ? null : 'x')
  assert.match(resolveRange('/x', 'demo@9', 'demo@', git).error, /no tag demo@9/)
})

test('the stage marker round-trips and replaces rather than repeats', () => {
  const body = composeBody({ notes: 'Notes.', tickets: [{ ref: '#1' }], links: [], stage: 'staged' })
  assert.strictEqual(stageOf(body), 'staged')
  const moved = withStage(body, 'prod')
  assert.strictEqual(stageOf(moved), 'prod')
  assert.strictEqual((moved.match(/skitterspec:release/g) || []).length, 1)
  assert.strictEqual(stageOf('no marker here'), null)
})

test('links must be http(s), with an optional label', () => {
  assert.deepStrictEqual(parseLinks(['https://ci/run/1=CI run', 'javascript:alert(1)']), {
    links: [{ url: 'https://ci/run/1', label: 'CI run' }],
    bad: ['javascript:alert(1)'],
  })
})

test('the longest matching prefix wins', () => {
  const series = [{ tagPrefix: 'skitterspec@' }, { tagPrefix: 'skitterspec-github@' }]
  assert.strictEqual(seriesFor(series, 'skitterspec-github@1.0.0').tagPrefix, 'skitterspec-github@')
  assert.strictEqual(seriesFor(series, 'skitterspec@2.0.0').tagPrefix, 'skitterspec@')
})
