'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

test('the three Linear sync skills ship in the linear package', () => {
  for (const name of ['spec-status', 'spec-pull', 'spec-push']) {
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
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(example, 'utf8')), 'example is valid JSON')
})

const seamText = (name) => fs.readFileSync(path.join(ASSETS, 'seams', `${name}.md`), 'utf8')

test('the spec-tracker-link seam fragment carries the Linear link step', () => {
  const text = seamText('spec-tracker-link')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /Create the Project/i, 'creates the Linear Project')
  assert.match(text, /Milestone per phase/i, 'creates a milestone per phase')
  assert.match(text, /linear_project_id/, 'adds the frontmatter block')
  assert.match(text, /base sidecar|spec-sync normalize/i, 'writes the initial base')
})

test('the spec-go-pull seam fragment carries the pull-first step', () => {
  const text = seamText('spec-go-pull')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /\/spec-pull/, 'runs /spec-pull first')
  assert.match(text, /commit the refreshed snapshot/i, 'commits the refreshed snapshot')
})
