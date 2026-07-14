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

const skillText = (name) =>
  fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// NOTE: the Linear link step (/spec) and pull-first step (/spec-go) are, as of the
// ticketing extraction, provider content — their coverage lives in the linear
// package's assets test (against the seam fragments). The shared /spec + /spec-go
// still carry the passages verbatim until Phase 3 replaces them with seam markers.

test('/spec-env and /spec-go document trusting the worktree root via /add-dir', () => {
  for (const name of ['spec-env', 'spec-go']) {
    const text = skillText(name)
    assert.match(text, /\/add-dir/, `${name} instructs running /add-dir`)
    assert.match(
      text,
      /settings\.local\.json/,
      `${name} notes the persistent settings.local.json entry`,
    )
  }
})

// The Linear config template/docs and the sync-command docs are provider assets —
// covered in the linear package's assets test. (Base README Linear cleanup: Phase 4.)
