'use strict'

/**
 * `spec-sync release create <tag>` (feat-tracker-releases phase 3).
 *
 * The repo decides what a release contains — the previous tag in the series up
 * to this one — and Linear is told. What carries the weight: the range is the
 * series' own (a hotfix ranges from its base, another series' tag is never a
 * base), a dry run is the default, an untracked tag is not an error, and a ref
 * Linear silently drops is named rather than hidden behind `success: true`.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')
const { parseLink } = require('../src/cli-release.js')

const CORE = {
  tagPrefix: 'skitterspec@',
  pipelineId: 'p-core',
  envs: [
    { key: 'staged', stage: 'Staged' },
    { key: 'published', stage: 'Released' },
  ],
}

function repo({ pipelines = [CORE], specs = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-release-'))
  const cfg = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  const config = { linear: { teamId: 'T1', teamKey: 'SKS' } }
  if (pipelines) config.release = { pipelines }
  fs.writeFileSync(cfg, JSON.stringify(config), 'utf-8')

  // specs: { "<ref>": "<bucket>" }
  for (const [ref, bucket] of Object.entries(specs)) {
    const folder = path.join(dir, 'specs', bucket, `feat-${ref.toLowerCase()}`)
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, '00-overview.md'), `---\nlinear_identifier: "${ref}"\n---\n\n# ${ref}\n`)
  }

  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@e.com')
  git('config', 'user.name', 'T')
  return {
    dir,
    git,
    commit(message, file = 'f.txt') {
      const target = path.join(dir, file)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.appendFileSync(target, message + '\n')
      git('add', '-A')
      git('commit', '-q', '-m', message)
      return git('rev-parse', 'HEAD').trim()
    },
    tag: (name) => git('tag', name),
  }
}

// A stand-in Linear release store, recording every call. `drop` names refs it
// accepts and silently does not attach — what Linear does with an issue it
// cannot find (phase 1).
function fakeLinear({ drop = [], refuse = null, seed = [] } = {}) {
  const calls = []
  const releases = new Map(seed.map((r) => [r.version, { id: `r-${r.version}`, url: `https://linear.app/r/${r.version}`, issues: [], completedAt: null, ...r }]))
  return {
    calls,
    async readIssue() {
      return null
    },
    async releaseFind({ version }) {
      return releases.get(version) || null
    },
    async releaseSync(input) {
      calls.push({ op: 'releaseSync', input })
      if (refuse) throw new Error(refuse)
      const issues = input.refs.map((r) => r.identifier).filter((id) => !drop.includes(id))
      const release = { id: `r-${input.version}`, version: input.version, url: `https://linear.app/r/${input.version}`, issues, stage: { name: 'In Progress', type: 'started' } }
      releases.set(input.version, release)
      return release
    },
    async releaseStage(input) {
      calls.push({ op: 'releaseStage', input })
      const moved = { ...releases.get(input.version), stage: { name: input.stage, type: 'started' } }
      releases.set(input.version, moved)
      return moved
    },
    async releaseComplete(input) {
      calls.push({ op: 'releaseComplete', input })
      const release = releases.get(input.version)
      // Linear keeps the FIRST completedAt on a repeat (phase 1).
      if (!release.completedAt) release.completedAt = '2026-10-22T09:00:00.000Z'
      return release
    },
  }
}

function run(argv, cwd, io = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env: { LINEAR_API_KEY: 'lin_api_test' },
    ...io,
  }).then((code) => ({ code, out: out.join('') }))
}

const json = async (argv, cwd, io) => {
  const got = await run([...argv, '--json'], cwd, io)
  return { code: got.code, body: JSON.parse(got.out) }
}

// A series with two releases and the work between them.
function seriesRepo(specs = { 'SKS-1': 'complete', 'SKS-2': 'in-progress' }) {
  const r = repo({ specs })
  r.commit('chore: base')
  r.tag('skitterspec@1.0.0')
  r.commit('feat: one\n\nRefs: SKS-1')
  r.commit('feat: two\n\nRefs: SKS-2')
  r.commit('fix: elsewhere\n\nRefs: OPS-9')
  r.commit('feat: typo trailer\n\nRefs: SKS-77')
  r.commit('chore: no ref')
  r.tag('skitterspec@1.1.0')
  return r
}

// --- guard rails --------------------------------------------------------------

test('it refuses when no pipelines are declared', async () => {
  const r = repo({ pipelines: null })
  const got = await run(['release', 'create', 'skitterspec@1.0.0'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no release pipelines are declared/)
})

// STAYS SILENT: a workflow running on every tag reaches tags nobody configured,
// and that is a healthy repo — exit 0, nothing written.
test('an untracked tag is not an error and touches nothing', async () => {
  const r = repo()
  r.commit('base')
  r.tag('v9.9.9')
  const linear = fakeLinear()
  const got = await run(['release', 'create', 'v9.9.9', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /v9\.9\.9 is not a tracked series \(skitterspec@\*\) — nothing to do/)
  assert.deepStrictEqual(linear.calls, [])
})

test('an unknown --env refuses and names the declared ones', async () => {
  const r = seriesRepo()
  const got = await run(['release', 'create', 'skitterspec@1.1.0', '--env', 'prod'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no env named "prod" on skitterspec@/)
  assert.match(got.out, /Declared: staged, published/)
})

test('a bare `release` prints usage; an unknown verb refuses with it', async () => {
  const r = repo()
  assert.strictEqual((await run(['release'], r.dir)).code, 0)
  const bad = await run(['release', 'ship'], r.dir)
  assert.strictEqual(bad.code, 1)
  assert.match(bad.out, /release create <tag>/)
})

// --- the range ----------------------------------------------------------------

test('the range runs from the previous tag in the series to this tag', async () => {
  const r = seriesRepo()
  const { code, body } = await json(['release', 'create', 'skitterspec@1.1.0'], r.dir)
  assert.strictEqual(code, 0)
  assert.strictEqual(body.range, 'skitterspec@1.0.0..skitterspec@1.1.0')
  assert.strictEqual(body.version, '1.1.0')
  assert.strictEqual(body.firstRelease, false)
  assert.strictEqual(body.totalCommits, 5)
  assert.strictEqual(body.unreferencedCommits, 1)
})

test("another series' tag is never the base", async () => {
  const r = repo()
  r.commit('chore: base')
  r.tag('skitterspec@1.0.0')
  r.commit('feat: a\n\nRefs: SKS-1')
  r.tag('skitterspec-linear@5.0.0')
  r.commit('feat: b\n\nRefs: SKS-2')
  r.tag('skitterspec@1.1.0')
  const { body } = await json(['release', 'create', 'skitterspec@1.1.0'], r.dir)
  assert.strictEqual(body.range, 'skitterspec@1.0.0..skitterspec@1.1.0')
  assert.strictEqual(body.totalCommits, 2)
})

test('a hotfix tag ranges from the release it was forked from', async () => {
  const r = repo({ specs: { 'SKS-5': 'complete' } })
  r.commit('chore: base')
  r.tag('skitterspec@1.0.0')
  r.commit('feat: on main\n\nRefs: SKS-1')
  r.tag('skitterspec@1.1.0')
  r.git('checkout', '-q', '-b', 'hotfix', 'skitterspec@1.0.0')
  r.commit('fix: prod\n\nRefs: SKS-5', 'hot.txt')
  r.tag('skitterspec@1.0.1-hotfix.1')
  const { body } = await json(['release', 'create', 'skitterspec@1.0.1-hotfix.1'], r.dir)
  assert.strictEqual(body.range, 'skitterspec@1.0.0..skitterspec@1.0.1-hotfix.1')
  assert.deepStrictEqual(body.attach, ['SKS-5'])
})

test('--from names the base explicitly', async () => {
  const r = seriesRepo()
  const { body } = await json(['release', 'create', 'skitterspec@1.1.0', '--from', 'skitterspec@1.1.0~1'], r.dir)
  assert.strictEqual(body.range, 'skitterspec@1.1.0~1..skitterspec@1.1.0')
  assert.strictEqual(body.totalCommits, 1)
})

test('the first release in a full clone is said out loud', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete' } })
  r.commit('feat: a\n\nRefs: SKS-1')
  r.tag('skitterspec@0.1.0')
  const got = await run(['release', 'create', 'skitterspec@0.1.0'], r.dir)
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /first release in this series — every commit up to skitterspec@0\.1\.0 counts/)
})

// WHAT WOULD FOOL "NO PREVIOUS TAG": a shallow clone answers "none" for a series
// with history, and the fallback would attach every ticket ever shipped.
test('a shallow clone with no visible earlier tag refuses rather than guess', async () => {
  const r = seriesRepo()
  const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-release-shallow-'))
  execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', 'skitterspec@1.1.0', `file://${r.dir}`, shallow], {
    stdio: 'ignore',
  })
  const got = await run(['release', 'create', 'skitterspec@1.1.0'], shallow)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no earlier skitterspec@ tag is visible, and this clone is shallow/)
})

// --- what is attached ---------------------------------------------------------

test('finished and unfinished specs are attached; foreign and unlinked refs are named', async () => {
  const r = seriesRepo()
  const got = await run(['release', 'create', 'skitterspec@1.1.0'], r.dir)
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /would attach 2 ticket\(s\): SKS-1, SKS-2/)
  assert.match(got.out, /skipped 1 — not team SKS: OPS-9/)
  assert.match(got.out, /skipped 1 — no spec in this repo claims it: SKS-77/)
  assert.match(got.out, /dry run — pass --apply/)
})

test('a commit that only touches specs/ is bookkeeping and attaches nothing', async () => {
  const r = repo({ specs: { 'SKS-1': 'complete', 'SKS-3': 'complete' } })
  r.commit('chore: base')
  r.tag('skitterspec@1.0.0')
  r.commit('feat: code\n\nRefs: SKS-1')
  r.commit('chore(spec): complete feat-sks-3\n\nRefs: SKS-3', 'specs/complete/feat-sks-3/00-overview.md')
  r.tag('skitterspec@1.1.0')
  const { body } = await json(['release', 'create', 'skitterspec@1.1.0'], r.dir)
  assert.deepStrictEqual(body.attach, ['SKS-1'])
  assert.strictEqual(body.ignoredCommits, 1)
})

// --- applying -----------------------------------------------------------------

test('a dry run writes nothing', async () => {
  const r = seriesRepo()
  const linear = fakeLinear()
  await run(['release', 'create', 'skitterspec@1.1.0'], r.dir, { adapter: linear })
  assert.deepStrictEqual(linear.calls, [])
})

test('--apply syncs the release with each ref at the commit that carries it', async () => {
  const r = seriesRepo()
  const tagSha = r.git('rev-parse', 'skitterspec@1.1.0^{commit}').trim()
  const sks1 = r.git('log', '--format=%H', '--grep', 'Refs: SKS-1').trim()
  const notes = path.join(r.dir, 'NOTES.md')
  fs.writeFileSync(notes, '# 1.1.0\n')
  const linear = fakeLinear()
  const got = await run(
    [
      'release', 'create', 'skitterspec@1.1.0', '--apply',
      '--notes', 'NOTES.md',
      '--link', 'https://ci.example/run/7?x=1',
      '--link', 'npm=https://www.npmjs.com/package/x',
    ],
    r.dir,
    { adapter: linear },
  )
  assert.strictEqual(got.code, 0, got.out)
  assert.strictEqual(linear.calls.length, 1)
  const { input } = linear.calls[0]
  assert.strictEqual(input.pipelineId, 'p-core')
  assert.strictEqual(input.version, '1.1.0')
  assert.strictEqual(input.name, 'skitterspec@1.1.0')
  assert.strictEqual(input.commitSha, tagSha)
  assert.deepStrictEqual(input.refs.map((x) => x.identifier), ['SKS-1', 'SKS-2'])
  assert.strictEqual(input.refs[0].commitSha, sks1)
  assert.deepStrictEqual(input.links, [
    { url: 'https://ci.example/run/7?x=1' },
    { url: 'https://www.npmjs.com/package/x', label: 'npm' },
  ])
  assert.strictEqual(input.notes, '# 1.1.0\n')
  assert.match(got.out, /attached 2 ticket\(s\): SKS-1, SKS-2/)
  assert.match(got.out, /https:\/\/linear\.app\/r\/1\.1\.0/)
})

test('initialEnv, or --env, moves the new release onto that stage', async () => {
  const r = repo({ pipelines: [{ ...CORE, initialEnv: 'staged' }], specs: { 'SKS-1': 'complete' } })
  r.commit('chore: base')
  r.tag('skitterspec@1.0.0')
  r.commit('feat: a\n\nRefs: SKS-1')
  r.tag('skitterspec@1.1.0')

  const configured = fakeLinear()
  const a = await json(['release', 'create', 'skitterspec@1.1.0', '--apply'], r.dir, { adapter: configured })
  assert.deepStrictEqual(configured.calls[1], { op: 'releaseStage', input: { pipelineId: 'p-core', version: '1.1.0', stage: 'Staged' } })
  assert.strictEqual(a.body.release.stage.name, 'Staged')

  const overridden = fakeLinear()
  await run(['release', 'create', 'skitterspec@1.1.0', '--apply', '--env', 'published'], r.dir, { adapter: overridden })
  assert.strictEqual(overridden.calls[1].input.stage, 'Released')
})

test('a ref Linear silently dropped is named in the output', async () => {
  const r = seriesRepo()
  const linear = fakeLinear({ drop: ['SKS-2'] })
  const got = await run(['release', 'create', 'skitterspec@1.1.0', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /WARNING Linear did not attach 1: SKS-2/)
  const { body } = await json(['release', 'create', 'skitterspec@1.1.0', '--apply'], r.dir, { adapter: fakeLinear({ drop: ['SKS-2'] }) })
  assert.deepStrictEqual(body.release.unattached, ['SKS-2'])
})

test('a refusal says what it means: Releases unavailable', async () => {
  const r = seriesRepo()
  const linear = fakeLinear({ refuse: "Linear API error: Not allowed to access feature 'releaseManagement'" })
  const got = await run(['release', 'create', 'skitterspec@1.1.0', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /Linear Releases is not available to this workspace/)
})

test('--apply with no key refuses over MCP and writes nothing', async () => {
  const r = seriesRepo()
  const got = await run(['release', 'create', 'skitterspec@1.1.0', '--apply'], r.dir, { env: {} })
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /refusing to apply over mcp/)
})

// --- links --------------------------------------------------------------------

test('a link is a URL, or label=URL; a query string is never split', () => {
  assert.deepStrictEqual(parseLink('https://a.example/x?y=1'), { url: 'https://a.example/x?y=1' })
  assert.deepStrictEqual(parseLink('CI run=https://a.example/1'), { url: 'https://a.example/1', label: 'CI run' })
  assert.strictEqual(parseLink('not a link'), null)
  assert.strictEqual(parseLink(''), null)
})

// --- release deployed / complete (phase 4) -------------------------------------

const TWO_SERIES = [CORE, { tagPrefix: 'skitterspec-linear@', pipelineId: 'p-linear', envs: [{ key: 'published', stage: 'Released' }] }]
const staged = (version, stage = 'Staged') => ({ version, stage: { name: stage, type: 'started' } })

test('deployed maps the env key to its stage and moves the release', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0')] })
  const got = await json(['release', 'deployed', '1.1.0', 'published', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.calls.map((c) => c.op), ['releaseStage'])
  assert.deepStrictEqual(linear.calls[0].input, { pipelineId: 'p-core', version: '1.1.0', stage: 'Released' })
  assert.strictEqual(got.body.release.from.name, 'Staged')
  assert.strictEqual(got.body.release.stage.name, 'Released')
  assert.strictEqual(got.body.warning, null)
})

test('deployed without --apply is a dry run and calls nothing', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0')] })
  const got = await run(['release', 'deployed', 'skitterspec@1.1.0', 'staged'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /skitterspec@1\.1\.0 → staged \("Staged"\)/)
  assert.match(got.out, /dry run/)
  assert.deepStrictEqual(linear.calls, [])
})

test('an unknown env refuses and names the configured keys', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0')] })
  const got = await run(['release', 'deployed', '1.1.0', 'prod', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no env named "prod" on skitterspec@/)
  assert.match(got.out, /Declared: staged, published/)
  assert.deepStrictEqual(linear.calls, [])
})

test('a bare version is ambiguous across two pipelines, and --series or the full tag settles it', async () => {
  const r = repo({ pipelines: TWO_SERIES })
  const bare = await run(['release', 'deployed', '1.1.0', 'published'], r.dir)
  assert.strictEqual(bare.code, 1)
  assert.match(bare.out, /"1\.1\.0" is ambiguous — 2 release pipelines are declared/)
  assert.match(bare.out, /--series <skitterspec@\|skitterspec-linear@>/)

  const series = await json(['release', 'deployed', '1.1.0', 'published', '--series', 'skitterspec-linear@'], r.dir)
  assert.strictEqual(series.body.pipeline.pipelineId, 'p-linear')
  const tag = await json(['release', 'deployed', 'skitterspec-linear@1.1.0', 'published'], r.dir)
  assert.strictEqual(tag.body.pipeline.pipelineId, 'p-linear')
  assert.strictEqual(tag.body.version, '1.1.0')
})

test('an unknown --series refuses and names the declared ones', async () => {
  const r = repo({ pipelines: TWO_SERIES })
  const got = await run(['release', 'complete', '1.1.0', '--series', 'app@'], r.dir)
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /no pipeline has the series "app@"/)
  assert.match(got.out, /Declared: skitterspec@, skitterspec-linear@/)
})

// STAYS SILENT: a deploy job that runs for every tag is a healthy repo.
test('a tag of an untracked series is a no-op for deployed and complete', async () => {
  const r = repo()
  const linear = fakeLinear()
  // `other@9.9.9` is a tag of some other series. A bare `v9.9.9` is not —
  // with one pipeline it reads as that pipeline's version, and an apply then
  // refuses when Linear has no such release.
  for (const argv of [['deployed', 'other@9.9.9', 'staged'], ['complete', 'other@9.9.9']]) {
    const got = await run(['release', ...argv, '--apply'], r.dir, { adapter: linear })
    assert.strictEqual(got.code, 0)
    assert.match(got.out, /other@9\.9\.9 is not a tracked series/)
  }
  assert.deepStrictEqual(linear.calls, [])
})

test('a backwards move warns and still applies', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0', 'Released')] })
  const got = await run(['release', 'deployed', '1.1.0', 'staged', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 0)
  assert.match(got.out, /moved: "Released" → "Staged"/)
  assert.match(got.out, /WARNING moves back from "published" — applied anyway/)
  assert.deepStrictEqual(linear.calls.map((c) => c.op), ['releaseStage'])
})

// STAYS SILENT: a release on a stage no env names (the pipeline's own first
// stage, or one renamed in Linear) is cannot-tell, not a backwards move.
test('a stage no env names produces no warning', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0', 'In Progress')] })
  const got = await json(['release', 'deployed', '1.1.0', 'staged', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.body.warning, null)
})

test('deployed and complete refuse a version Linear has no release for', async () => {
  const r = repo()
  for (const argv of [['deployed', '2.0.0', 'staged'], ['complete', '2.0.0']]) {
    const linear = fakeLinear()
    const got = await run(['release', ...argv, '--apply'], r.dir, { adapter: linear })
    assert.strictEqual(got.code, 1)
    assert.match(got.out, /Linear has no release 2\.0\.0 on skitterspec@/)
    assert.match(got.out, /release create skitterspec@2\.0\.0 --apply/)
    assert.deepStrictEqual(linear.calls, [])
  }
})

test('complete finishes the release with its links and notes', async () => {
  const r = repo()
  fs.writeFileSync(path.join(r.dir, 'notes.md'), 'shipped')
  const linear = fakeLinear({ seed: [staged('1.1.0', 'Released')] })
  const got = await json(
    ['release', 'complete', '1.1.0', '--notes', 'notes.md', '--link', 'npm=https://www.npmjs.com/package/x', '--apply'],
    r.dir,
    { adapter: linear },
  )
  assert.strictEqual(got.code, 0)
  assert.deepStrictEqual(linear.calls[0].input, {
    pipelineId: 'p-core',
    version: '1.1.0',
    links: [{ url: 'https://www.npmjs.com/package/x', label: 'npm' }],
    notes: 'shipped',
  })
  assert.strictEqual(got.body.release.completedAt, '2026-10-22T09:00:00.000Z')
  assert.strictEqual(got.body.release.already, false)
})

test('a second complete is a no-op that says so', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0', 'Released')] })
  assert.strictEqual((await run(['release', 'complete', '1.1.0', '--apply'], r.dir, { adapter: linear })).code, 0)
  const again = await run(['release', 'complete', '1.1.0', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(again.code, 0)
  assert.match(again.out, /already complete \(2026-10-22T09:00:00\.000Z\) — nothing sent/)
  assert.deepStrictEqual(linear.calls.map((c) => c.op), ['releaseComplete'])
})

test('a Linear refusal on deployed is relayed in words', async () => {
  const r = repo()
  const linear = fakeLinear({ seed: [staged('1.1.0')] })
  linear.releaseStage = async () => {
    throw new Error("Linear API error: Not allowed to access feature 'releaseManagement'")
  }
  const got = await run(['release', 'deployed', '1.1.0', 'published', '--apply'], r.dir, { adapter: linear })
  assert.strictEqual(got.code, 1)
  assert.match(got.out, /Linear Releases is not available to this workspace/)
})
