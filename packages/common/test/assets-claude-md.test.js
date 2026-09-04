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
const SECTION = path.join(__dirname, '..', 'assets', 'claude-md-section.md')
const text = () => fs.readFileSync(SECTION, 'utf8')

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

test('every /spec-… the section names is a skill or command that ships', () => {
  const known = new Set([...shipped('skills'), ...shipped('commands')])
  // Exclude file paths: `.claude/rules/spec-planning.md` is not an invocation,
  // and reading it as one was the first thing this guard got wrong.
  for (const m of text().matchAll(/\/(spec(?:-[a-z-]+)?)(?!\.md)(?=[\s.,)`|]|$)/gm)) {
    assert.ok(known.has(m[1]), `the section names /${m[1]}, which ships as neither`)
  }
})

// The section calls its entries "skills". Anything that is actually a command
// must not be described as one — that is what sent people looking for a
// /spec-connect SKILL.md that no longer exists.
test('the section does not call a command a skill', () => {
  const commands = shipped('commands')
  const body = text()
  const skillish = /(?:lifecycle skills|skills\b)[^.]*?\/(spec-[a-z-]+)/g
  for (const m of body.matchAll(skillish)) {
    assert.ok(
      !commands.has(m[1]),
      `/${m[1]} is a command, but the section groups it with the skills`,
    )
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

  for (const m of text().matchAll(/spec-env\s+<([a-z|-]+)>/g)) {
    const listed = m[1].split('|')
    const missing = verbs.filter((v) => !listed.includes(v))
    assert.deepStrictEqual(
      missing,
      [],
      `the section lists spec-env <${m[1]}> but the engine also has: ${missing.join(', ')}`,
    )
  }
})
