'use strict'

// Which lifecycle entries the model may invoke, and which only the user may.
//
// The flags below are the whole point of the skills-vs-commands split: an entry
// that carries no judgment should not occupy the model-facing listing. A compose
// or overlay change could drop a frontmatter line silently, so assert it here.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')
const USER_ONLY_SKILLS = [
  ['common', 'spec-to-main'], // lands a branch — side-effecting
  ['linear', 'spec-status'], // read-only, but nobody invokes it except by typing
  ['linear', 'spec-sync'], // a CLI manual across ten subcommands
]

const skillPath = (pkg, name) =>
  path.join(ROOT, 'packages', pkg, 'assets', 'skills', name, 'SKILL.md')

function frontmatter(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text)
  assert.ok(m, `${file} opens with parseable frontmatter`)
  return m[1]
}

test('every shipped skill and command has parseable frontmatter with a description', () => {
  const files = []
  for (const pkg of ['common', 'linear']) {
    const skills = path.join(ROOT, 'packages', pkg, 'assets', 'skills')
    if (fs.existsSync(skills)) {
      for (const e of fs.readdirSync(skills, { withFileTypes: true })) {
        if (e.isDirectory()) files.push(path.join(skills, e.name, 'SKILL.md'))
      }
    }
    const cmds = path.join(ROOT, 'packages', pkg, 'assets', 'commands')
    if (fs.existsSync(cmds)) {
      for (const f of fs.readdirSync(cmds)) if (f.endsWith('.md')) files.push(path.join(cmds, f))
    }
  }
  assert.ok(files.length > 10, `found the assets, got ${files.length}`)
  for (const f of files) {
    const fm = frontmatter(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f))
    assert.match(fm, /^description:\s*\S/m, `${path.relative(ROOT, f)} has a description`)
  }
})

test('the user-only skills carry disable-model-invocation', () => {
  for (const [pkg, name] of USER_ONLY_SKILLS) {
    const file = skillPath(pkg, name)
    const fm = frontmatter(fs.readFileSync(file, 'utf8'), name)
    assert.match(fm, /^disable-model-invocation:\s*true$/m, `${name} is user-only`)
  }
})

// The inverse guard: the skills that DO carry judgment must stay reachable by
// the model, or /spec-go could no longer hand off to /spec-push and the mirror
// would silently stop tracking progress.
test('stays silent: the judgment skills are still model-invocable', () => {
  const modelInvocable = [
    ['common', 'spec'],
    ['common', 'spec-bug'],
    ['common', 'spec-go'],
    ['common', 'spec-complete'],
    ['common', 'spec-cancel'],
    ['common', 'spec-review'],
    ['common', 'spec-hotfix'],
    ['linear', 'spec-push'],
  ]
  for (const [pkg, name] of modelInvocable) {
    const file = skillPath(pkg, name)
    if (!fs.existsSync(file)) continue // not shipped by this distribution
    const fm = frontmatter(fs.readFileSync(file, 'utf8'), name)
    assert.doesNotMatch(fm, /disable-model-invocation/, `${name} must stay invocable`)
  }
})
