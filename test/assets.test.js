'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

// Walk every shipped Markdown asset (skills + rules).
function markdownAssets() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) out.push(abs)
    }
  }
  walk(path.join(ASSETS, 'skills'))
  walk(path.join(ASSETS, 'rules'))
  return out
}

// Tokens that would leak the tool's private origin project / wrong toolchain.
const FORBIDDEN = [/FF CSC/, /\bpnpm\b/, /\btsx\b/, /generate-releases\.ts/, /COMMIT_MESSAGES\.md/]

test('shipped Markdown assets carry no project-specific references', () => {
  for (const file of markdownAssets()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN) {
      assert.ok(
        !pattern.test(text),
        `${path.relative(ASSETS, file)} contains forbidden ${pattern}`,
      )
    }
  }
})

test('every shipped skill has valid frontmatter with a matching name', () => {
  const skillsDir = path.join(ASSETS, 'skills')
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(skillsDir, entry.name, 'SKILL.md')
    assert.ok(fs.existsSync(file), `${entry.name}/SKILL.md exists`)
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))
    assert.ok(fm, `${entry.name} has YAML frontmatter`)
    const name = /^name:\s*(.+)$/m.exec(fm[1])
    const desc = /^description:\s*(.+)$/m.exec(fm[1])
    assert.ok(name && name[1].trim(), `${entry.name} has a name`)
    assert.ok(desc && desc[1].trim(), `${entry.name} has a description`)
    assert.strictEqual(name[1].trim(), entry.name, `${entry.name} name matches its folder`)
  }
})

test('the Linear hybrid-sync skills are shipped', () => {
  for (const name of ['spec-status', 'spec-pull', 'spec-push']) {
    assert.ok(
      fs.existsSync(path.join(ASSETS, 'skills', name, 'SKILL.md')),
      `${name} SKILL.md shipped`,
    )
  }
})

const skillText = (name) =>
  fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

test('/spec documents the opt-in Linear link step', () => {
  const text = skillText('spec')
  // gated on the config file, and the no-config path is explicitly preserved
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /skip this phase|behaves exactly as above/i, 'no-config path preserved')
  // the Linear actions the phase must perform
  assert.match(text, /Create the Project/i, 'creates the Linear Project')
  assert.match(text, /Milestone per phase/i, 'creates a milestone per phase')
  assert.match(text, /linear_project_id/, 'adds the frontmatter block')
  assert.match(text, /base sidecar|spec-sync normalize/i, 'writes the initial base')
})

test('/spec-go documents the opt-in pull-first step', () => {
  const text = skillText('spec-go')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /\/spec-pull/, 'runs /spec-pull first')
  assert.match(text, /commit the refreshed snapshot/i, 'commits the refreshed snapshot')
  assert.match(text, /skip this step|no config means/i, 'no-config path preserved')
})

test('the Linear config template + docs ship under assets/core', () => {
  assert.ok(
    fs.existsSync(path.join(ASSETS, 'core', 'linear.config.json.example')),
    'linear.config.json.example shipped',
  )
  assert.ok(
    fs.existsSync(path.join(ASSETS, 'core', 'linear.config.md')),
    'linear.config.md shipped',
  )
  // the example is valid JSON so init copies a usable template
  const raw = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.json.example'), 'utf8')
  assert.doesNotThrow(() => JSON.parse(raw), 'example is valid JSON')
})

test('README documents the Linear hybrid-sync commands', () => {
  const readme = fs.readFileSync(path.join(ASSETS, '..', 'README.md'), 'utf8')
  for (const cmd of ['/spec-status', '/spec-pull', '/spec-push']) {
    assert.ok(readme.includes(cmd), `README mentions ${cmd}`)
  }
  assert.match(readme, /linear\.config\.json/, 'README names the opt-in config')
})
