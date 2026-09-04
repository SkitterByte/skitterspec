'use strict'

// This repo dogfoods itself: `.claude/skills/*` are tracked symlinks into the
// built distribution, so an edited asset is live without reinstalling. Nothing
// creates or reconciles them — they are committed by hand — which means a
// retired skill leaves a symlink pointing at a directory that no longer exists.
// It happened the moment `feat-script-only-commands` moved two skills to
// `.claude/commands/`, and nothing noticed.
//
// A dangling link is not cosmetic here: `.claude/` is what the agent reads, so a
// broken entry is a skill the tool believes it has and cannot load.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const CLAUDE = path.join(ROOT, '.claude')

// Every symlink under `.claude/`, with the target it names. Uses lstat so the
// links themselves are seen rather than followed.
function links(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) out.push(p)
    else if (e.isDirectory()) links(p, out)
  }
  return out
}

// A positive precondition: if this ever finds nothing, the dogfood setup changed
// shape and the guard below is measuring an empty set rather than passing.
test('the repo really is dogfood-linked', () => {
  const found = links(CLAUDE)
  assert.ok(found.length > 5, `expected .claude symlinks, found ${found.length}`)
})

test('no symlink under .claude/ points at a missing target', () => {
  const broken = links(CLAUDE)
    .filter((p) => !fs.existsSync(p))
    .map((p) => `${path.relative(ROOT, p)} -> ${fs.readlinkSync(p)}`)
  assert.deepStrictEqual(
    broken,
    [],
    `dangling .claude symlink(s) — the target was retired but the link was not:\n  ${broken.join('\n  ')}`,
  )
})

// Both lanes are linked, or neither is: a command whose asset is edited must go
// live the same way a skill's does, or the two behave differently for no reason
// the reader can see.
test('every shipped command is linked, like the skills are', () => {
  const assets = path.join(ROOT, 'packages', 'skitterspec-linear', 'assets', 'commands')
  if (!fs.existsSync(assets)) return // unbuilt checkout — build-dist covers that
  const shipped = fs.readdirSync(assets).filter((f) => f.endsWith('.md'))
  assert.ok(shipped.length, 'the distribution ships commands')
  for (const f of shipped) {
    const link = path.join(CLAUDE, 'commands', f)
    assert.ok(fs.existsSync(link), `.claude/commands/${f} is missing`)
    assert.ok(
      fs.lstatSync(link).isSymbolicLink(),
      `.claude/commands/${f} is a copy, not a link — edits to the asset will not go live`,
    )
  }
})
