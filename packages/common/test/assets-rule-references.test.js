'use strict'

/**
 * Every `.claude/rules/<file>` and `.claude/skills/<name>/<file>` a shipped
 * skill, command or rule names must be a file that distribution installs.
 *
 * feat-rules-budget moved most of the always-loaded rules into skill
 * supporting files and a path-scoped rule, and every pointer a skill follows
 * was rewritten by hand. A pointer to a file that does not ship sends the
 * model to read nothing, and nothing about that looks wrong at the time.
 *
 * WHAT WOULD FOOL THIS: a reference wrapped across a line break, or written
 * without the `.claude/` prefix. Those are not checked. The prefixed,
 * one-line form is the convention every skill uses, so it is the one held.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const PKGS = path.join(__dirname, '..', '..')
// Parked distributions (scripts/parked.json) are not built, so not measured.
const { active } = require('../../../scripts/parked.js')
const DISTS = active(['skitterspec', 'skitterspec-github', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-azure-boards'])

// Rules another package installs beside ours: skittership's commit grammar,
// and the repo-local docs-freshness convention this repo's own skills name.
const FOREIGN = new Set(['commit-messages.md', 'docs-freshness.md'])
// Installed from somewhere other than its own path under assets/.
const INSTALLED_FROM = { 'rules/project-conventions.md': 'project-conventions.md' }
// The base names the provider's trailer rule as "installed with a ticketing
// provider", which is true of it and of no other reference.
const PROVIDER_ONLY = new Set(['rules/commit-trailers.md'])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const REF = /`\.claude\/(rules\/[A-Za-z0-9._-]+\.md|skills\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.md)`/g

for (const dist of DISTS) {
  test(`${dist}: every rule and skill-file reference resolves`, () => {
    const assets = path.join(PKGS, dist, 'assets')
    assert.ok(fs.existsSync(assets), `${dist} is built (pnpm build)`)
    const docs = ['skills', 'commands', 'rules'].flatMap((d) => walk(path.join(assets, d)))
    const dangling = []
    for (const file of docs) {
      for (const [, ref] of fs.readFileSync(file, 'utf8').matchAll(REF)) {
        if (ref.startsWith('rules/') && FOREIGN.has(path.basename(ref))) continue
        if (dist === 'skitterspec' && PROVIDER_ONLY.has(ref)) continue
        if (!fs.existsSync(path.join(assets, INSTALLED_FROM[ref] || ref))) dangling.push(`${path.relative(assets, file)} → .claude/${ref}`)
      }
    }
    assert.deepStrictEqual(dangling, [], `references to files ${dist} does not ship`)
  })
}

// Stays silent: the check can fire. A made-up file under a real skill is
// reported, so a pass above is not the regex matching nothing.
test('the reference pattern sees a skill supporting file', () => {
  const sample = 'see `.claude/skills/spec-diff/nope.md` and `.claude/rules/spec-format.md`'
  assert.deepStrictEqual([...sample.matchAll(REF)].map((m) => m[1]), ['skills/spec-diff/nope.md', 'rules/spec-format.md'])
})
