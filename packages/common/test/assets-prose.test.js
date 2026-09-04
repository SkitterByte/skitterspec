'use strict'

// The CLAUDE.md section is shipped content: `installClaudeMd` writes it into every
// consumer's CLAUDE.md between markers, so a stale claim here is a stale claim in
// every project that installed skitterspec.
//
// It had drifted and nothing noticed. `scripts/docs-claims.test.js` guards the
// website against exactly this — naming a skill that does not ship, quoting a
// verb list that has moved on — but its PAGES list covers docs/ only, and this
// asset was never in it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
// Every shipped PROSE asset makes the same kind of claim, so all of them get the
// same guard. The CLAUDE.md section was covered first, and the rules file — which
// says the same things at more length — was found stale the moment it was added.
const PROSE = [
  ['claude-md-section', path.join(__dirname, '..', 'assets', 'claude-md-section.md')],
  ['spec-planning', path.join(__dirname, '..', 'assets', 'rules', 'spec-planning.md')],
]
const text = (file) => fs.readFileSync(file, 'utf8')

function shipped(kind) {
  const out = new Set()
  for (const pkg of ['common', 'linear']) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets', kind)
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (kind === 'skills' && e.isDirectory()) out.add(e.name)
      if (kind === 'commands' && e.name.endsWith('.md')) out.add(e.name.slice(0, -3))
    }
  }
  return out
}

test('the catalogue is readable, or the guards below mean nothing', () => {
  assert.ok(shipped('skills').size > 5, 'found the skills')
  assert.ok(shipped('commands').size > 0, 'found the commands')
})

test('every /spec-… these assets name is a skill or command that ships', () => {
  const known = new Set([...shipped('skills'), ...shipped('commands')])
  for (const [name, file] of PROSE) {
    // Exclude file paths: `.claude/rules/spec-planning.md` is not an invocation,
    // and reading it as one was the first thing this guard got wrong.
    for (const m of text(file).matchAll(/\/(spec(?:-[a-z-]+)?)(?!\.md)(?=[\s.,)`|]|$)/gm)) {
      assert.ok(known.has(m[1]), `${name} names /${m[1]}, which ships as neither`)
    }
  }
})

// The section calls its entries "skills". Anything that is actually a command
// must not be described as one — that is what sent people looking for a
// /spec-connect SKILL.md that no longer exists.
// A command must not appear as a ROW in the skills table. That is the precise
// invariant; an earlier version of this test matched "skills … /spec-connect"
// by proximity and fired on a sentence that reads "nine lifecycle skills (plus
// the /spec-connect and /spec-live **commands**)" — which is correct prose. A
// guard that cannot tell those apart trains people to ignore it.
test('no command appears as a row in a skills table', () => {
  const commands = shipped('commands')
  for (const [name, file] of PROSE) {
    const rows = [...text(file).matchAll(/^\|\s*`?\/(spec[a-z-]*)`?\s*\|/gm)].map((m) => m[1])
    assert.ok(rows.length > 5, `${name}: found the skills table, got ${rows.length} rows`)
    for (const r of rows) {
      assert.ok(!commands.has(r), `${name}: /${r} is a command but is listed as a skill`)
    }
  }
})

// A verb list on a page is a claim about the engine, and this one had gone five
// verbs out of date. Either list them all or do not enumerate.
test('any spec-env verb list is complete, or absent', () => {
  const src = fs.readFileSync(path.join(ROOT, 'packages', 'common', 'src', 'cli.js'), 'utf8')
  const start = src.indexOf('async function specEnv(')
  const open = src.indexOf('switch (sub)', start)
  const verbs = [
    ...src.slice(open, src.indexOf('\n}', open)).matchAll(/^ {4}case '([a-z][a-z-]*)':/gm),
  ].map((m) => m[1])
  assert.ok(verbs.length > 5, `found the dispatch, got ${verbs.length}`)

  for (const [name, file] of PROSE) {
    // The list may wrap across a line break, so join before matching.
    const flat = text(file).replace(/\n/g, ' ')
    for (const m of flat.matchAll(/spec-env\s*<([a-z|-]+)>/g)) {
      const listed = m[1].split('|')
      const missing = verbs.filter((v) => !listed.includes(v))
      assert.deepStrictEqual(
        missing,
        [],
        `${name} lists spec-env <${m[1]}> but the engine also has: ${missing.join(', ')}`,
      )
    }
  }
})
