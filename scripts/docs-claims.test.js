'use strict'

/**
 * The outward-facing surfaces must not contradict the engine.
 *
 * When tasks stopped being individual issues and started being a checklist
 * inside each sub-issue, the claim "tasks are not synced" was corrected in the
 * package assets — and left standing in the npm README and on the GitHub Pages
 * landing page, including a mapping diagram that visually labelled task
 * checkboxes "repo only". Those are the first things a prospective user reads,
 * so a correct engine described by a wrong README is still a wrong product.
 *
 * This guards the specific retired claims by phrase. It is deliberately narrow:
 * saying tasks are not individually *issues* is still true and must stay
 * sayable, so only the "stays in the repo / not synced" framing is forbidden.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')

// Everything a reader meets before they install anything.
const SURFACES = [
  'README.md',
  'docs/index.html',
  'docs/linear.html',
  'packages/skitterspec-linear/README.md',
  'packages/skitterspec/README.md',
  'packages/common/README.md',
  'packages/linear/assets/core/linear.config.md',
  'packages/linear/assets/core/SETUP.md',
]

// Retired claims, as phrases a human would actually write.
const RETIRED = [
  /tasks?\s+(are|is)\s+\*{0,2}not\*{0,2}\s+synced/i,
  /tasks?\s+stay\s+in\s+the\s+(repo|phase file)/i,
  /tasks?\s+live\s+only\s+in\s+the\s+repo/i,
]

test('no shipped surface still claims tasks are not synced', () => {
  const hits = []
  for (const rel of SURFACES) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const re of RETIRED) {
        if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
      }
    })
  }
  assert.deepStrictEqual(hits, [], `retired task-sync claim still shipped:\n${hits.join('\n')}`)
})

test('the guard would actually fire on the phrasing it retires', () => {
  // A guard that matches nothing is worse than no guard — it reads as coverage.
  const samples = [
    'Tasks are **not** synced — they stay in the repo phase files.',
    'tasks stay in the repo',
    'Tasks live only in the repo phase files.',
  ]
  for (const s of samples) {
    assert.ok(RETIRED.some((re) => re.test(s)), `should have matched: ${s}`)
  }
})

test('the guard leaves the still-true framing sayable', () => {
  // "not an issue per task" is exactly what we DO want the docs to say.
  const fine = [
    'No issue is created per task and nothing is read back.',
    "A phase's tasks are mirrored into its sub-issue description, never as issues of their own.",
    'Tasks are mirrored, not synced.',
  ]
  for (const s of fine) {
    assert.ok(!RETIRED.some((re) => re.test(s)), `false positive on: ${s}`)
  }
})

// --- the pages must not link into thin air -----------------------------------
//
// Splitting one page into two turns every in-page `#anchor` into a possible
// cross-page link, and a dead one fails silently: the browser just does nothing.
// Nothing else checks the site, so this does.

const PAGES = ['docs/index.html', 'docs/linear.html']

const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
const readPage = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('every in-page anchor points at an id that exists on that page', () => {
  for (const rel of PAGES) {
    const html = readPage(rel)
    const ids = idsOf(html)
    for (const m of html.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.has(m[1]), `${rel} links to #${m[1]}, which is not an id on that page`)
    }
  }
})

test('every cross-page link resolves to a real file and a real anchor', () => {
  for (const rel of PAGES) {
    const html = readPage(rel)
    for (const m of html.matchAll(/href="([a-z-]+\.html)(?:#([^"]+))?"/g)) {
      const target = path.join(ROOT, 'docs', m[1])
      assert.ok(fs.existsSync(target), `${rel} links to ${m[1]}, which does not exist`)
      if (m[2]) {
        assert.ok(
          idsOf(fs.readFileSync(target, 'utf8')).has(m[2]),
          `${rel} links to ${m[1]}#${m[2]}, which is not an id on that page`,
        )
      }
    }
  }
})

test('each page is self-contained — no off-origin request', () => {
  // og:image is an absolute URL by necessity (scrapers need a real raster), but
  // it is metadata, not something the page fetches. Anything the BROWSER would
  // request must be local or inline: the site has no build step and no CDN.
  for (const rel of PAGES) {
    for (const m of readPage(rel).matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
      assert.fail(`${rel} would fetch ${m[1]} — inline it or vendor it instead`)
    }
  }
})

test('each page carries its own canonical og:url', () => {
  const urls = PAGES.map((rel) => /og:url" content="([^"]+)"/.exec(readPage(rel))[1])
  assert.strictEqual(new Set(urls).size, urls.length, `og:url must differ per page, got ${JSON.stringify(urls)}`)
  assert.ok(urls.some((u) => u.endsWith('/linear.html')), 'the Linear page points at itself')
})

// --- the pages must not name a command that does not exist -------------------
//
// The site is the first thing anyone reads, and it is verified by nobody: a verb
// renamed in the engine leaves the page confidently instructing people to run
// something that is gone. `spec-sync doctor` was documented for a whole release
// after it had been renamed to `retarget`.

const CLI = () => fs.readFileSync(path.join(ROOT, 'packages/linear/src/cli-sync.js'), 'utf8')

// Commands on the page are syntax-highlighted, so the verb usually sits inside a
// <span>. Matching the raw HTML silently found nothing — a guard that checks
// nothing is worse than no guard, so strip the markup first.
const textOf = (rel) => readPage(rel).replace(/<[^>]+>/g, '')

test('every spec-sync verb shown on the site is a real subcommand', () => {
  const cli = CLI()
  const dispatched = new Set([
    ...[...cli.matchAll(/case '([a-z][a-z-]*)':/g)].map((m) => m[1]),
    ...[...cli.matchAll(/sub === '([a-z][a-z-]*)'/g)].map((m) => m[1]),
  ])
  assert.ok(dispatched.size > 5, `found the dispatch, got ${JSON.stringify([...dispatched])}`)

  for (const rel of PAGES) {
    // Anchored to the real invocation so prose ("the spec-sync operations") is
    // not read as a verb.
    for (const m of textOf(rel).matchAll(/skitterspec(?:-linear)? spec-sync ([a-z][a-z-]+)/g)) {
      assert.ok(dispatched.has(m[1]), `${rel} says to run \`spec-sync ${m[1]}\`, which is not dispatched`)
    }
  }
})

test('every skill named on the site is a skill that ships', () => {
  const shipped = new Set()
  for (const pkg of ['common', 'linear']) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets', 'skills')
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))) shipped.add(e.name)
    }
    // A `/spec-…` in the prose is an instruction to run it, and a slash COMMAND
    // satisfies that as well as a skill does — so both lanes count as shipped.
    const cmds = path.join(ROOT, 'packages', pkg, 'assets', 'commands')
    if (!fs.existsSync(cmds)) continue
    for (const f of fs.readdirSync(cmds)) {
      if (f.endsWith('.md')) shipped.add(f.slice(0, -3))
    }
  }
  assert.ok(shipped.size > 10, `found the skills and commands, got ${shipped.size}`)

  for (const rel of PAGES) {
    // `/spec-…` anywhere in the prose is an instruction to run it.
    for (const m of textOf(rel).matchAll(/\/(?:spec)(-[a-z-]+)?(?=[\s.,)]|$)/gm)) {
      const name = m[0].slice(1)
      assert.ok(shipped.has(name), `${rel} names /${name}, which ships as neither a skill nor a command`)
    }
  }
})
