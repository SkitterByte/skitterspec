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

test('the shipped example config matches the loader defaults it documents', () => {
  // The example is copied verbatim into a new project, so a value that has
  // drifted from the default silently opts every new install into old
  // behaviour — `tasks: "none"` would strip the sub-issue checklists.
  const example = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.json.example'), 'utf8'),
  )
  const { DEFAULT_CONFIG } = require('../src/config.js')
  assert.strictEqual(example.mapping.tasks, DEFAULT_CONFIG.mapping.tasks)
  assert.strictEqual(example.mapping.phases, DEFAULT_CONFIG.mapping.phases)
  assert.strictEqual(example.mapping.specFolder, DEFAULT_CONFIG.mapping.specFolder)
})

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

// The engine can only put `legacy` on the plan — stopping is the skill's job, and
// the skill is prose. This asserts the instruction exists and sits BEFORE the
// apply step, which is the only ordering that prevents the destructive push.
test('/spec-push halts on a pre-9.0 mirror before applying anything', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /`legacy`/, 'names the plan field it must check')
  assert.match(text, /orphanCount/, 'relays how much would be orphaned')
  assert.match(text, /MIGRATION\.md/, 'points at the guide')
  assert.ok(
    text.indexOf('pre-9.0 mirror') < text.indexOf('## 4. Apply the plan'),
    'the halt comes before the apply step',
  )
})

// SETUP.md is what a project actually reads, and the version someone is coming
// FROM is the one they'll look for. A section that names only the oldest jump is
// one a v9 user scrolls straight past.
test('SETUP.md points every upgrade path at the migration guide', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'SETUP.md'), 'utf8')
  assert.match(text, /Upgrading an existing install/)
  assert.match(text, /MIGRATION\.md/)
  assert.match(text, /From 9\.x/, 'the breaking states gate')
  assert.match(text, /From 8\.x/, 'the mirror remap')
})

// A refusal the agent can only relay is half a fix — the skill has to offer to
// apply it, and has to ask before writing the user's config.
test('/spec-push offers to fix a bad state name, with consent', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /--workspace-states/, 'the states file is passed to push')
  assert.match(text, /refuses to run/, 'says the check is a precondition, not advice')
  assert.match(text, /offer to\s*\n?apply it to `specs\/\.core\/linear\.config\.json`/, 'offers the fix')
  assert.match(text, /[Nn]ever edit their config without asking/, 'and asks first')
})

// The reporter could not tell a deliberate projection from an oversight, because
// nothing wrote down what happens to a phase file's section structure. Whatever
// the behaviour is, the config reference has to state it.
test('linear.config.md states how task sections project', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /section headings/, 'says sections are kept')
  assert.match(text, /before\s*\n?\s*\/\/ any heading appear under `## Tasks`/, 'and what the default is')
})
