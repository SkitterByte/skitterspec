'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { init, SKILLS, RULES } = require('../src/init.js')

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-'))
  return dir
}

test('init scaffolds skills, rule, folders, indexes', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  for (const name of SKILLS) {
    assert.ok(
      fs.existsSync(path.join(dir, '.claude', 'skills', name, 'SKILL.md')),
      `skill ${name} installed`,
    )
  }
  for (const r of RULES) {
    assert.ok(
      fs.existsSync(path.join(dir, '.claude', 'rules', r)),
      `rule ${r} installed`,
    )
  }
  for (const f of ['.core', 'backlog', 'in-progress', 'complete', 'cancelled']) {
    assert.ok(fs.existsSync(path.join(dir, 'specs', f)), `folder ${f}`)
  }
  assert.ok(fs.existsSync(path.join(dir, 'specs', 'backlog', '00-index.md')))
  assert.ok(fs.existsSync(path.join(dir, 'specs', 'complete', '00-index.md')))

  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /## Spec workflow/)
  assert.match(claude, /<!-- skitterspec:start -->/)
})

test('init is idempotent — second run does not clobber edits', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: false, claudeMd: true, mode: 'init' })
  assert.equal(fs.readFileSync(skill, 'utf8'), 'EDITED', 'edit preserved without --force')
})

test('update --force overwrites skill files', async () => {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })

  const skill = path.join(dir, '.claude', 'skills', 'spec', 'SKILL.md')
  fs.writeFileSync(skill, 'EDITED')
  await init({ dir, force: true, claudeMd: true, mode: 'update' })
  assert.notEqual(fs.readFileSync(skill, 'utf8'), 'EDITED', 'update overwrote the skill')
})

test('respects an existing manual Spec workflow section', async () => {
  const dir = tmpProject()
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# proj\n\n## Spec workflow\n\nmine\n')
  await init({ dir, force: false, claudeMd: true, mode: 'init' })
  const claude = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.doesNotMatch(claude, /skitterspec:start/, 'did not inject over a manual section')
})
