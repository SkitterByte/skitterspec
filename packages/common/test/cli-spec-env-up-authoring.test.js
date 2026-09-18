'use strict'

/**
 * `spec-env up <name> --docs` for a spec that DOES NOT EXIST yet — the
 * authoring lane `/spec` Phase B depends on.
 *
 * feat-main-is-a-landing-zone phase 2 shipped a flow that provisions the
 * worktree BEFORE the spec is written ("no chicken-and-egg on the slug") — but
 * the engine refused it: `resolveSpec` threw `spec not found under specs/**`
 * for any name with no folder on disk, so the only way to author was to write
 * the spec in the primary checkout, where `up`'s gate committed it straight
 * onto the base branch, unreviewed. These tests pin the lane the skill was
 * written against.
 *
 * The lane opens on a POSITIVE signal only — `--docs` AND a spec-shaped name
 * (`feat-`/`bug-`/`hotfix-`) — so a typo'd `up` without either still refuses
 * exactly as before (`.claude/rules/negative-checks.md` rule 1: the stays-
 * silent cases below prove the refusal survives).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')
const { allSpecs } = require('../src/env/resolve.js')

function scaffold(configExtra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-upauth-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...configExtra },
      null,
      2,
    ),
  )
  return { dir }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

function registryOf(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'registry.json'), 'utf8'))
  } catch {
    return { slots: {}, specless: {} }
  }
}

const SETUP = { setup: ['pnpm install --frozen-lockfile'] }

test('up --docs on an unwritten spec plans an authoring worktree instead of refusing', async () => {
  const { dir } = scaffold(SETUP)
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-new-thing', '--dir', dir, '--docs'])
    assert.match(out, /to provision, run:/, 'a plan, not a refusal')
    assert.match(
      out,
      /git worktree add \S+-wt\/new-thing -b feat\/new-thing/,
      'forks the branch the written spec will resolve to, in the worktree the written spec will resolve to',
    )
    assert.match(out, /docs:\s+documents only/, 'documents mode is reported positively')
    assert.match(out, /authoring/i, 'says the spec is not written yet, positively')
    assert.doesNotMatch(out, /git commit/, 'nothing exists, so nothing is committed')
    assert.doesNotMatch(out, /blocked/, 'the fork-point gate has no spec to demand')
    assert.doesNotMatch(out, /then, in the worktree, run:/, 'docs mode still skips setup')
  } finally {
    cleanup(dir)
  }
})

test('the authoring provision is recorded, so the name resolves before the spec exists', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(['spec-env', 'up', 'feat-new-thing', '--dir', dir, '--docs'])
    const reg = registryOf(dir)
    assert.ok(reg.specless && reg.specless['feat-new-thing'], 'recorded under the specless key')
    assert.strictEqual(reg.specless['feat-new-thing'].branch, 'feat/new-thing')
    assert.strictEqual(reg.specless['feat-new-thing'].spec, true, 'marked as a spec-to-be, not /no-spec work')

    const out = await runQuiet(['spec-env', 'resolve', 'feat-new-thing', '--dir', dir])
    assert.match(out, /branch:\s+feat\/new-thing/, 'resolvable by name from the record alone')
    assert.match(out, /worktree:\s+\S+-wt\/new-thing/, 'at the path the written spec will occupy')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: without --docs an unknown name still refuses — a typo must not provision', async () => {
  const { dir } = scaffold()
  try {
    await assert.rejects(
      () => runQuiet(['spec-env', 'up', 'feat-new-thing', '--dir', dir]),
      /spec not found under specs\/\*\*/,
    )
    assert.ok(!registryOf(dir).specless['feat-new-thing'], 'and nothing was recorded')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: --docs with a name that is not spec-shaped still refuses', async () => {
  const { dir } = scaffold()
  try {
    await assert.rejects(
      () => runQuiet(['spec-env', 'up', 'random-name', '--dir', dir, '--docs']),
      /spec not found under specs\/\*\*/,
    )
  } finally {
    cleanup(dir)
  }
})

test('stays silent: an existing spec with --docs is untouched by the authoring lane', async () => {
  const { dir } = scaffold(SETUP)
  const spec = path.join(dir, 'specs', 'backlog', 'feat-real')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n')
  try {
    const out = await runQuiet(['spec-env', 'up', 'feat-real', '--dir', dir, '--docs'])
    assert.match(out, /docs:\s+documents only/)
    assert.doesNotMatch(out, /authoring/i, 'a spec that exists is not "being authored"')
    assert.ok(!registryOf(dir).specless['feat-real'], 'and no record is written for it')
  } finally {
    cleanup(dir)
  }
})

test('stays silent: once the spec is written, the folder wins and nothing lists twice', async () => {
  const { dir } = scaffold()
  try {
    await runQuiet(['spec-env', 'up', 'feat-new-thing', '--dir', dir, '--docs'])
    // The spec is now written (what /spec does in the worktree; the primary
    // checkout sees it after the land — same folder name either way).
    const spec = path.join(dir, 'specs', 'backlog', 'feat-new-thing')
    fs.mkdirSync(spec, { recursive: true })
    fs.writeFileSync(path.join(spec, '00-overview.md'), '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n')

    const config = JSON.parse(
      fs.readFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), 'utf8'),
    )
    const normalised = {
      worktree: config.worktree,
      docker: { enabled: false, projectNamePattern: '{repoSlug}_{slug}', portBase: 3000, portsPerSpec: 10 },
      spec: { companionPaths: [] },
    }
    const reg = registryOf(dir)
    const listed = allSpecs(dir, normalised, new Set(), reg.specless).filter(
      (s) => s.folder === 'feat-new-thing',
    )
    assert.strictEqual(listed.length, 1, 'one entry, not a folder row plus a record row')
    assert.strictEqual(listed[0].specless, false, 'and it is the folder that answers')
  } finally {
    cleanup(dir)
  }
})
