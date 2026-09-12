'use strict'

/**
 * A published page is the one thing teardown cannot reclaim.
 *
 * The worktree goes, the branch goes, the tracker assignment is released — and
 * the page stays up, because nothing here can delete it. The evidence this was
 * worth fixing is still on disk in this repo: `feat-review-offer-lands.url`
 * points at a live page for a spec whose worktree, branch and in-progress
 * folder are all gone, and its teardown never mentioned it.
 *
 * So: name it, say where it goes, delete nothing. The stays-silent half matters
 * as much as the report — most specs are never published, and a teardown that
 * explains publishing to all of them is worse than one that says nothing.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { publishedPageNotice, reviewOutPath, reviewUrlPath } = require('../src/env/review.js')
const { run } = require('../src/cli.js')

const URL = 'https://claude.ai/code/artifact/15f92c48-9be0-4f29-a1bc-db47d0168e8d'

function scaffold({ published = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-pub-')))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: ['ignore', 'pipe', 'ignore'] })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n')
  const sd = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(sd, { recursive: true })
  fs.writeFileSync(path.join(sd, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'init')
  g('branch', '-M', 'main')

  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  g('worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  // Landed and clean, so `down` produces a plan rather than blocking — the
  // notice is reported after a plan, so a blocked teardown has none to carry.
  execFileSync('git', ['-C', dir, 'merge', '--ff-only', 'feat/alpha'], { stdio: 'ignore' })

  const page = reviewOutPath(dir, 'feat-alpha')
  fs.mkdirSync(path.dirname(page), { recursive: true })
  fs.writeFileSync(page, '<!doctype html><title>x</title>')
  const notes = page.replace(/\.html$/, '') + '.notes.json'
  fs.writeFileSync(notes, JSON.stringify({ version: 1, spec: 'feat-alpha' }))
  if (published) fs.writeFileSync(reviewUrlPath(page), URL + '\n')
  return { dir, wt, page, notes, urlFile: reviewUrlPath(page) }
}

function cleanup(dir) {
  try {
    execFileSync('git', ['-C', dir, 'worktree', 'prune'], { stdio: 'ignore' })
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function down(dir) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (c) => {
    out += c
    return true
  }
  try {
    await run(['spec-env', 'down', 'feat-alpha', '--dir', dir])
  } finally {
    process.stdout.write = orig
  }
  return out
}

// --- the notice is pure ----------------------------------------------------

test('the notice names the URL and where it is deleted', () => {
  const lines = publishedPageNotice(URL).join('\n')
  assert.match(lines, /survives this teardown/)
  assert.match(lines, /skitterspec cannot remove it/)
  assert.ok(lines.includes(URL))
  assert.match(lines, /\/artifacts/)
})

test('no url means no notice at all', () => {
  assert.deepStrictEqual(publishedPageNotice(null), [])
  assert.deepStrictEqual(publishedPageNotice(''), [])
  assert.deepStrictEqual(publishedPageNotice(undefined), [])
})

// --- teardown reports it ---------------------------------------------------

test('a published spec has its page named in the teardown plan', async () => {
  const { dir } = scaffold({ published: true })
  try {
    const out = await down(dir)
    assert.match(out, /published page survives/)
    assert.ok(out.includes(URL))
  } finally {
    cleanup(dir)
  }
})

test('the plan is a report, not a command — nothing is added to run these', async () => {
  const { dir } = scaffold({ published: true })
  try {
    const out = await down(dir)
    const runThese = out.slice(out.indexOf('run these:'), out.indexOf('published page'))
    assert.doesNotMatch(runThese, /artifact/i, 'there is no command that removes it')
    assert.ok(
      out.indexOf('published page') > out.indexOf('run these:'),
      'reported after the commands, never among them',
    )
  } finally {
    cleanup(dir)
  }
})

test('teardown deletes none of the sidecars — the url is the only record', async () => {
  const { dir, page, notes, urlFile } = scaffold({ published: true })
  try {
    await down(dir)
    assert.ok(fs.existsSync(urlFile), 'deleting this would destroy what there is to delete')
    assert.ok(fs.existsSync(page), 'the page is still readable')
    assert.ok(fs.existsSync(notes), 'and the review record is kept')
  } finally {
    cleanup(dir)
  }
})

// --- stays silent ----------------------------------------------------------

test('a spec that was never published gets no mention of publishing', async () => {
  const { dir } = scaffold({ published: false })
  try {
    const out = await down(dir)
    assert.doesNotMatch(out, /publish/i, 'most specs are never published')
    assert.doesNotMatch(out, /artifact/i)
    assert.match(out, /run these:/, 'and the ordinary plan is unchanged')
  } finally {
    cleanup(dir)
  }
})

test('the commands are identical whether or not a page was published', async () => {
  const a = scaffold({ published: false })
  const b = scaffold({ published: true })
  try {
    const cmds = (out) =>
      out
        .slice(out.indexOf('run these:'))
        .split('\n')
        .filter((l) => l.trim().startsWith('git ') || l.trim().startsWith('docker '))
        .map((l) => l.trim().replace(a.dir, 'DIR').replace(b.dir, 'DIR'))
        .map((l) => l.replace(/skitterspec-pub-\w+/g, 'FIX'))
    assert.deepStrictEqual(cmds(await down(a.dir)), cmds(await down(b.dir)))
  } finally {
    cleanup(a.dir)
    cleanup(b.dir)
  }
})
