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

// Commands are the DELIBERATE exception to the symlink pattern, and the reason
// is worth stating because "make it consistent with the skills" is the obvious
// wrong move — it was made while fixing this very bug, and caught only by a
// merge conflict.
//
// A skill asset is complete once build-dist composes its seams away, so a link to
// it is live and correct. A command asset is NOT complete: it carries an
// `{{exec}}` placeholder that `renderCommand` fills at INSTALL time with the
// package manager detected from the lockfile. Link it and the placeholder reaches
// the live file, so `/spec-connect` would try to run a program called `{{exec}}`.
test('commands are installed copies, never links, and carry no placeholder', () => {
  const dir = path.join(CLAUDE, 'commands')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []
  assert.ok(files.length, '.claude/commands is populated — run `skitterspec update`')
  for (const f of files) {
    const p = path.join(dir, f)
    assert.ok(
      !fs.lstatSync(p).isSymbolicLink(),
      `${f} is a symlink to its asset; the {{exec}} placeholder would never be filled`,
    )
    assert.doesNotMatch(
      fs.readFileSync(p, 'utf8'),
      /\{\{exec\}\}/,
      `${f} still carries {{exec}} — it was copied from the asset instead of installed`,
    )
  }
})

// The inverse, so the two lanes cannot silently swap: skills MUST be links, or an
// edited asset stops going live and the dogfood setup quietly stops working.
test('skills are links, so an edited asset is live', () => {
  const own = fs
    .readdirSync(path.join(CLAUDE, 'skills'), { withFileTypes: true })
    .filter((e) => e.name.startsWith('spec'))
  assert.ok(own.length > 5, `expected the spec skills, found ${own.length}`)
  for (const e of own) {
    assert.ok(e.isSymbolicLink(), `.claude/skills/${e.name} is a copy — asset edits will not go live`)
  }
})

// A command's whole body is a shell invocation, so the binary it names has to be
// resolvable from THIS repo. That is not automatic when the repo dogfoods itself.
//
// A consumer installs the published superset `@skitterbyte/skitterspec-linear`,
// whose package.json maps BOTH `skitterspec-linear` and `skitterspec` at the same
// entry point — so the shipped commands, which invoke `skitterspec`, resolve. This
// workspace instead depends on the dev-time package `packages/linear`, and that one
// declared only `skitterspec-linear`. `pnpm exec skitterspec` therefore failed in
// any clean install of this repo.
//
// It went unnoticed because the primary checkout had a STALE pnpm shim left over
// from an install months earlier, when the dependency graph was different. pnpm
// does not prune those, so the command worked here and nowhere else — including in
// every freshly provisioned worktree, which is exactly where /spec-go tells you to
// go and work. The bug surfaced the first time anyone ran /spec-live from one.
test('every binary the .claude commands invoke is declared by a dependency', () => {
  const dir = path.join(CLAUDE, 'commands')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []
  assert.ok(files.length > 0, 'found the commands — otherwise this guard measures nothing')

  // Bins provided by the workspace packages the root actually depends on.
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const directDeps = new Set(Object.keys(rootPkg.devDependencies || {}))
  const provided = new Set()
  for (const p of fs.readdirSync(path.join(ROOT, 'packages'))) {
    const manifest = path.join(ROOT, 'packages', p, 'package.json')
    if (!fs.existsSync(manifest)) continue
    const j = JSON.parse(fs.readFileSync(manifest, 'utf8'))
    if (!directDeps.has(j.name)) continue
    for (const name of Object.keys(j.bin || {})) provided.add(name)
  }

  const missing = []
  for (const f of files) {
    const body = fs.readFileSync(path.join(dir, f), 'utf8')
    // `!`<runner> <binary> <verb> …`` — the binary is the token after the runner.
    for (const m of body.matchAll(/^!`\s*(?:\S+\s+exec\s+|npx\s+)?([a-z][a-z0-9-]*)\s/gm)) {
      if (!provided.has(m[1])) missing.push(`${f}: "${m[1]}"`)
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `command invokes a binary no direct dependency declares — it resolves here only ` +
      `if a stale shim survives:\n  ${missing.join('\n  ')}\n  provided: ${[...provided].join(', ')}`,
  )
})
