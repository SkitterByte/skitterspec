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

// --- quoted CLI output must match what the CLI would actually print ----------
//
// The guards above check that the site names real commands. They say nothing
// about the VALUES it quotes, and a sample of tool output is read as fact — so a
// stale one is a lie the reader has no way to spot. `16 skills installed` sat on
// the page through the release that moved two skills to `.claude/commands/`,
// with the whole suite green, because nothing compared the number to the tree.
//
// Counted from the ASSETS the distribution ships, not from an install: an
// installed `.claude/skills/` also holds whatever other tools put there, so it
// is not a figure the docs could ever state.

function shippedCounts() {
  const kinds = { skills: new Set(), commands: new Set() }
  for (const pkg of ['common', 'linear']) {
    const skills = path.join(ROOT, 'packages', pkg, 'assets', 'skills')
    if (fs.existsSync(skills)) {
      for (const e of fs.readdirSync(skills, { withFileTypes: true })) {
        if (e.isDirectory() && fs.existsSync(path.join(skills, e.name, 'SKILL.md'))) {
          kinds.skills.add(e.name)
        }
      }
    }
    const cmds = path.join(ROOT, 'packages', pkg, 'assets', 'commands')
    if (fs.existsSync(cmds)) {
      for (const f of fs.readdirSync(cmds)) if (f.endsWith('.md')) kinds.commands.add(f.slice(0, -3))
    }
  }
  return { skills: kinds.skills.size, commands: kinds.commands.size }
}

test('the shipped catalogue is countable at all', () => {
  const { skills, commands } = shippedCounts()
  assert.ok(skills > 5, `found the skills, got ${skills}`)
  assert.ok(commands > 0, `found the commands, got ${commands}`)
})

test('every "N skills installed" the site quotes matches the shipped count', () => {
  const { skills } = shippedCounts()
  let quoted = 0
  for (const rel of PAGES) {
    for (const m of textOf(rel).matchAll(/(\d+)\s+skills installed/g)) {
      quoted++
      assert.strictEqual(
        Number(m[1]),
        skills,
        `${rel} quotes "${m[1]} skills installed"; the distribution ships ${skills}`,
      )
    }
  }
  assert.ok(quoted > 0, 'the doctor sample is still on the page — if it moved, retarget this test')
})

// --- the engines: both directions --------------------------------------------
//
// The check above catches a page naming a verb that does not exist. It cannot
// catch the reverse — an engine growing a verb nobody documented — which is the
// failure that left `spec-env` entirely absent from the site through several
// releases while every test stayed green.
//
// So each engine is checked both ways. Verbs that are deliberately internal are
// named here WITH A REASON rather than skipped wholesale: a new verb then fails
// the suite until someone decides which side it belongs on. A blanket allowance
// would have hidden exactly what this is for.

const ENGINES = {
  'spec-env': {
    source: 'packages/common/src/cli.js',
    // Anchored to the `switch (sub)` inside specEnv(), not every `case` in the
    // file — cli.js has several unrelated switches, and matching them all would
    // demand docs for verbs this engine does not have.
    verbs: (src) => {
      const start = src.indexOf('async function specEnv(')
      // Bound the slice to that function: cli.js's own top-level switch also has
      // `case 'init':`, and running past the end silently demanded docs for it.
      const open = src.indexOf('switch (sub)', start)
      const end = src.indexOf('\n}', open)
      const block = src.slice(open, end)
      return new Set([...block.matchAll(/^ {4}case '([a-z][a-z-]*)':/gm)].map((m) => m[1]))
    },
    page: 'docs/index.html',
    undocumented: {},
  },
  'spec-sync': {
    source: 'packages/linear/src/cli-sync.js',
    // Two dispatch forms, same as the name check above uses. Whole-file here
    // rather than function-bounded: this file's only switch IS the dispatch, and
    // the result is asserted against a floor below.
    verbs: (src) =>
      new Set([
        ...[...src.matchAll(/case '([a-z][a-z-]*)':/g)].map((m) => m[1]),
        ...[...src.matchAll(/sub === '([a-z][a-z-]*)'/g)].map((m) => m[1]),
      ]),
    page: 'docs/linear.html',
    undocumented: {},
  },
}

test('each engine dispatch is readable, or these guards mean nothing', () => {
  for (const [name, e] of Object.entries(ENGINES)) {
    const verbs = e.verbs(fs.readFileSync(path.join(ROOT, e.source), 'utf8'))
    assert.ok(verbs.size > 5, `${name}: found the dispatch, got ${JSON.stringify([...verbs])}`)
  }
})

// Key on engine + verb, never the bare word: both engines have a `status`, and
// they do unrelated things. Matching loosely would let one satisfy the other.
test('every verb an engine dispatches is documented, or allowlisted with a reason', () => {
  for (const [name, e] of Object.entries(ENGINES)) {
    const verbs = e.verbs(fs.readFileSync(path.join(ROOT, e.source), 'utf8'))
    const cells = commandCells(e.page)
    for (const verb of verbs) {
      if (e.undocumented[verb]) {
        assert.ok(e.undocumented[verb].length > 10, `${name} ${verb}: allowlisted without a reason`)
        continue
      }
      assert.ok(
        cells.some((c) => c === `${name} ${verb}` || c.startsWith(`${name} ${verb} `)),
        `${name} dispatches \`${verb}\`, which ${e.page} never mentions — document it, ` +
          'or add it to that engine\'s `undocumented` map with a reason',
      )
    }
  }
})

// Read the table's command cells, not the running prose. Matching prose found
// `spec-env is` in "spec-env is the per-spec isolation engine" and demanded a
// verb called `is` — the same trap the spec-sync check above already documents.
const commandCells = (rel) =>
  [...readPage(rel).matchAll(/<td class="cmd">([^<]+)<\/td>/g)].map((m) =>
    m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(),
  )

test('every engine verb the page names is one the engine dispatches', () => {
  for (const [name, e] of Object.entries(ENGINES)) {
    const verbs = e.verbs(fs.readFileSync(path.join(ROOT, e.source), 'utf8'))
    const cells = commandCells(e.page).filter((c) => c.startsWith(`${name} `))
    assert.ok(cells.length, `${e.page} has no ${name} rows — did the table move?`)
    for (const cell of cells) {
      const verb = cell.slice(name.length + 1).split(/\s/)[0]
      assert.ok(verbs.has(verb), `${e.page} documents \`${name} ${verb}\`, which is not dispatched`)
    }
  }
})

// stays-silent (.claude/rules/negative-checks.md rule 3): the guard must not fire
// on the healthy shapes — a documented verb, and one allowlisted with a reason.
test('stays silent: a documented verb and a reasoned allowlist entry both pass', () => {
  const fake = {
    demo: {
      source: 'packages/common/src/cli.js',
      verbs: () => new Set(['resolve', 'madeup']),
      page: 'docs/index.html',
      undocumented: { madeup: 'not a real verb — fixture for this test' },
    },
  }
  for (const [name, e] of Object.entries(fake)) {
    for (const verb of e.verbs()) {
      if (e.undocumented[verb]) {
        assert.ok(e.undocumented[verb].length > 10, 'reason survives')
        continue
      }
      // `resolve` is documented on the page as `spec-env resolve`, so a lookup
      // keyed on the real engine name finds it and says nothing.
      assert.ok(textOf('docs/index.html').includes(`spec-env ${verb}`), `${name} ${verb}`)
    }
  }
})

