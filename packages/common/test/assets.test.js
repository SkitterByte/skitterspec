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

test('/spec-go documents trusting the worktree root via /add-dir', () => {
  // Provisioning folded into /spec-go in 3.0.0 (the /spec-env skill was removed),
  // so /spec-go now carries the worktree-trust guidance.
  for (const name of ['spec-go']) {
    const text = skillText(name)
    assert.match(text, /\/add-dir/, `${name} instructs running /add-dir`)
    assert.match(
      text,
      /settings\.local\.json/,
      `${name} notes the persistent settings.local.json entry`,
    )
  }
})

// Skills whose 00-overview.md template carries the scannable `## Impact` map.
const IMPACT_TEMPLATE_SKILLS = ['spec', 'spec-bug', 'spec-hotfix']

test('spec overview templates carry the Impact map section', () => {
  for (const name of IMPACT_TEMPLATE_SKILLS) {
    const text = skillText(name)
    assert.match(text, /^## Impact$/m, `${name} template has an ## Impact heading`)
    assert.match(
      text,
      /\|\s*Surface\s*\|\s*Change\s*\|\s*Detail\s*\|/,
      `${name} template has the Surface | Change | Detail table header`,
    )
  }
})

test('spec-planning rule documents the Impact map in the overview contents', () => {
  const text = fs.readFileSync(
    path.join(ASSETS, 'rules', 'spec-planning.md'),
    'utf8',
  )
  assert.match(
    text,
    /entry point \/ dashboard[\s\S]*?Impact map/,
    'spec-planning lists the Impact map in the 00-overview.md contents',
  )
})

// The phase-file H1 emoji is the ONE load-bearing status signal (a provider maps
// it to the phase's tracker state; an absent emoji reads as not-started). Every
// skill that authors or edits phase files must say so — /spec ships it in the
// template, /spec-go flips it, and /spec-review creates phase files whenever it
// migrates a legacy spec into the folder + phase-file form. It shipped without
// the convention once, and three migrated specs mirrored their complete phases
// as backlog; this guard is why that can't silently recur.
const PHASE_HEADING_SKILLS = ['spec-go', 'spec-review']

test('skills that author or edit phase files state the H1 status convention', () => {
  for (const name of PHASE_HEADING_SKILLS) {
    const text = skillText(name)
    // assert.ok, not assert.match — a failed match dumps the whole SKILL.md.
    assert.ok(/⬜|🔄|✅/u.test(text), `${name} names the status emoji`)
    assert.ok(/heading|h1/i.test(text), `${name} ties the status to the heading`)
  }
})

test('spec-review points the emoji at phase-file creation, not just editing', () => {
  const text = skillText('spec-review')
  // The migration path is how the convention gets missed: /spec-review is the
  // skill that splits a legacy spec into 0N-<slug>.md files from scratch.
  assert.ok(/authoritative/i.test(text), 'spec-review says the heading wins')
  assert.ok(
    /legacy spec|inline phases/i.test(text),
    'spec-review covers the legacy-migration path that authors phase files',
  )
})

test('spec-review re-validates the Impact map as a drift check', () => {
  const text = skillText('spec-review')
  assert.match(text, /Impact map/, 'spec-review references the Impact map')
  assert.match(
    text,
    /Walk every row of the[\s\S]*?Impact/,
    'spec-review instructs walking the ## Impact table against the code',
  )
})

// The Linear config template/docs and the sync-command docs are provider assets —
// covered in the linear package's assets test. (Base README Linear cleanup: Phase 4.)

// A lifecycle skill that EDITS the spec (status flip + `git mv`) and then hits a
// clean-tree guard must commit its own edits — otherwise it dirties the worktree
// and then refuses to proceed because of that dirt, every single run. The guard
// is still right for work the *user* left uncommitted; the fix is to check for
// that BEFORE editing, not to stop after.
const SELF_EDITING = ['spec-complete', 'spec-cancel']

test('a self-editing lifecycle skill commits its own edits before the guard', () => {
  for (const name of SELF_EDITING) {
    const text = skillText(name)
    // assert.ok, not assert.match — a failed match dumps the whole SKILL.md.
    assert.ok(
      /commit (its own|the) (completion|cancellation) edits/i.test(text),
      `${name} commits the edits it made itself`,
    )
    assert.ok(/chore\(spec\):/.test(text), `${name} names the commit it makes`)
    assert.ok(
      !/Do \*\*not\*\* ?\n?`git commit` unless the user asks/.test(text),
      `${name} must not blanket-forbid committing — it has to commit its own edits`,
    )
  }
})

test('a self-editing lifecycle skill checks for pre-existing dirt before editing', () => {
  for (const name of SELF_EDITING) {
    const text = skillText(name)
    const pre = text.search(/pre-existing uncommitted changes/i)
    assert.notStrictEqual(pre, -1, `${name} checks the tree before it edits`)
    const move = text.search(/## \d\. Move to (complete|cancelled)/)
    assert.notStrictEqual(move, -1, `${name} has its move step`)
    assert.ok(pre < move, `${name} checks BEFORE the move, not after`)
  }
})

test('/spec-to-main keeps the no-auto-commit rule — it edits nothing itself', () => {
  const text = skillText('spec-to-main')
  assert.ok(/don't auto-commit/.test(text), 'the rule is correct where dirt is the user\'s own work')
  assert.ok(!/## \d\. Move to /.test(text), 'spec-to-main moves no spec, so it dirties nothing')
})
