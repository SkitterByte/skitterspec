'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

test('the Linear sync skills ship in the linear package', () => {
  for (const name of ['spec-status', 'spec-push']) {
    const file = path.join(ASSETS, 'skills', name, 'SKILL.md')
    assert.ok(fs.existsSync(file), `${name}/SKILL.md shipped`)
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))
    assert.ok(fm, `${name} has YAML frontmatter`)
    const nm = /^name:\s*(.+)$/m.exec(fm[1])
    assert.ok(nm && nm[1].trim() === name, `${name} name matches its folder`)
  }
})

test('the Linear config template + docs ship under assets/core', () => {
  const example = path.join(ASSETS, 'core', 'linear.config.json.example')
  assert.ok(fs.existsSync(example), 'linear.config.json.example shipped')
  assert.ok(fs.existsSync(path.join(ASSETS, 'core', 'linear.config.md')), 'linear.config.md shipped')
  assert.ok(fs.existsSync(path.join(ASSETS, 'core', 'SETUP.md')), 'SETUP.md shipped')
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(example, 'utf8')), 'example is valid JSON')
})

const seamText = (name) => fs.readFileSync(path.join(ASSETS, 'seams', `${name}.md`), 'utf8')

test('the spec-tracker-link seam fragment carries the Linear link step', () => {
  const text = seamText('spec-tracker-link')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /Create the Issue/i, 'creates the Linear issue')
  assert.match(text, /sub-issue per phase/i, 'creates a sub-issue per phase')
  assert.match(text, /linear_identifier/, 'adds the frontmatter block')
  assert.doesNotMatch(text, /linear_project_id|Create the Project|Milestone per phase/i, 'no stale project/milestone model')
  assert.match(text, /base sidecar|spec-sync normalize/i, 'writes the initial base')
})

test('the spec-go-pull seam fragment reflects one-way (no pull)', () => {
  const text = seamText('spec-go-pull')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /No pull|nothing to (pull|bring down)/i, 'states there is nothing to pull')
  assert.match(text, /\/spec-push/, 'points at /spec-push to refresh the mirror')
})
