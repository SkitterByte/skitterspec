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
const os = require('node:os')
const path = require('node:path')
const { DISTS } = require('./build-dist.js')

const ROOT = path.join(__dirname, '..')
const CLAUDE = path.join(ROOT, '.claude')

// Packages whose `assets/` is COMPOSED BUILD OUTPUT, and gitignored with it.
// Scanning them for "what this repo ships" would make the expected set depend on
// whether the reader has run a build — green on a developer's machine and empty
// on a fresh clone, which is the worst way for a guard to be wrong.
const BUILT = new Set(Object.keys(DISTS))

// What this repo SHIPS, read from the source packages. Derived rather than
// listed (decision 2 of feat-selfhost-link-integrity): a skill added tomorrow is
// in scope the moment its asset exists, and the fault being fixed here is
// precisely a NEWLY shipped skill landing as a copy.
function shipped(kind, entry) {
  const found = new Map()
  for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
    if (BUILT.has(pkg)) continue
    const dir = path.join(ROOT, 'packages', pkg, 'assets', kind)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (entry(path.join(dir, name), name)) found.set(name, pkg)
    }
  }
  return found
}

const shippedSkills = () => shipped('skills', (p) => fs.existsSync(path.join(p, 'SKILL.md')))
const shippedRules = () => shipped('rules', (_p, name) => name.endsWith('.md'))

// The check, as a function of (names, install dir) rather than inline — so the
// fires/stays-silent cases at the bottom can feed it a fixture instead of
// breaking this repo's own `.claude/`. A test that unlinks a real skill and then
// throws leaves the checkout without that skill.
//
// WHAT WOULD MAKE THIS LIE: a name that is shipped but NOT installed. That is an
// ordinary state — not every distribution installs every skill — so it is skipped
// rather than accused (`.claude/rules/negative-checks.md` rule 4: route the
// cannot-tell case to inaction). The cost of the other default is a red suite on
// a healthy partial install.
function copiesWhereLinksBelong(names, installDir) {
  const bad = []
  for (const name of names) {
    const p = path.join(installDir, name)
    let st
    try {
      st = fs.lstatSync(p)
    } catch {
      continue // not installed here — see above
    }
    if (!st.isSymbolicLink()) bad.push(name)
  }
  return bad
}

// The repair, named in the failure message rather than left to the reader. The
// target convention is read off a sibling that IS linked, so this keeps naming
// the right path when the layout moves.
//
// It VERIFIES the target before suggesting it, and the first version did not —
// which is how it earned this comment. `readdirSync` returns `commit` first, whose
// link goes to `node_modules/@skitterbyte/skittership`, so breaking `spec-list`
// produced a confident `ln -s` into a package that has no `spec-list`: following
// the hint would have replaced a copy with a DANGLING link, trading a frozen skill
// for an unloadable one. A repair you have not checked is worse than none, so when
// no sibling's directory actually contains this name the generic message is
// returned instead of a guess.
function repairHint(installDir, name) {
  const rel = path.relative(ROOT, path.join(installDir, name))
  for (const sibling of fs.readdirSync(installDir)) {
    const p = path.join(installDir, sibling)
    if (sibling === name || !fs.lstatSync(p).isSymbolicLink()) continue
    const target = path.join(path.dirname(fs.readlinkSync(p)), name)
    if (!fs.existsSync(path.resolve(installDir, target))) continue
    return `rm "${rel}" && ln -s "${target}" "${rel}"`
  }
  return `${rel} must be a symlink into the shipped asset`
}

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
//
// This replaced a version that enumerated `.claude/skills` and filtered on the
// `spec` prefix. Same intent, but its expected set came from the INSTALL — so a
// skill that shipped and was never linked at all was simply not in the list it
// checked, and a prefix nobody anticipated fell out of scope silently. Reading
// the shipped assets instead is what makes a new skill covered on arrival.
//
// `/spec-list` and `/spec-claim` are why this exists: both arrived as real files,
// worked perfectly, and were frozen against further asset edits. Nothing noticed.
for (const [label, dir, names] of [
  ['skills', () => path.join(CLAUDE, 'skills'), shippedSkills],
  ['rules', () => path.join(CLAUDE, 'rules'), shippedRules],
]) {
  test(`every shipped ${label} entry that is installed is a link, not a copy`, () => {
    const installDir = dir()
    const expected = names()
    // A positive precondition, and the whole reason it is a separate assertion:
    // an empty expected set passes the loop below trivially. That is how this
    // class of check stops working without ever going red.
    assert.ok(expected.size > 2, `read no shipped ${label} from packages/*/assets/${label}`)

    const bad = copiesWhereLinksBelong(expected.keys(), installDir)
    assert.deepStrictEqual(
      bad,
      [],
      `installed as a real file where this repo keeps a symlink — asset edits will ` +
        `not go live:\n  ${bad.map((n) => `${n}\n    fix: ${repairHint(installDir, n)}`).join('\n  ')}`,
    )
  })
}

// Entries installed from a DEPENDENCY — `.claude/skills/commit` and
// `.claude/rules/commit-messages.md`, both from @skitterbyte/skittership — are
// outside the derived set by construction: they are not in `packages/*/assets`.
// They are links today, and the dangling-target guard above still covers them.
// Noted so their absence reads as scope rather than as an oversight.
test('the derived set covers this repo own assets, and says so about the rest', () => {
  assert.ok(!shippedSkills().has('commit'), 'commit ships from a dependency, not from packages/')
  assert.ok(!shippedRules().has('commit-messages.md'), 'likewise the commit-messages rule')
  assert.ok(fs.lstatSync(path.join(CLAUDE, 'skills', 'commit')).isSymbolicLink())
})

// PROOF IT FIRES, and the stays-silent cases beside it (negative-checks.md rule
// 3). All four run against a fixture, never against `.claude/` — see the note on
// `copiesWhereLinksBelong`.
test('the copy check fires, and stays silent on every healthy shape', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-links-'))
  try {
    const assetDir = path.join(tmp, 'assets')
    const install = path.join(tmp, 'install')
    fs.mkdirSync(assetDir)
    fs.mkdirSync(install)
    for (const n of ['linked', 'copied', 'not-installed']) {
      fs.mkdirSync(path.join(assetDir, n))
      fs.writeFileSync(path.join(assetDir, n, 'SKILL.md'), `# ${n}\n`)
    }
    fs.symlinkSync(path.join(assetDir, 'linked'), path.join(install, 'linked'))
    fs.mkdirSync(path.join(install, 'copied'))
    fs.writeFileSync(path.join(install, 'copied', 'SKILL.md'), '# copied\n')

    const all = ['linked', 'copied', 'not-installed']
    // Fires on exactly the copy — and names it, so the message is actionable.
    assert.deepStrictEqual(copiesWhereLinksBelong(all, install), ['copied'])
    // Stays silent: a correct link.
    assert.deepStrictEqual(copiesWhereLinksBelong(['linked'], install), [])
    // Stays silent: shipped but not installed here. An absence is not evidence.
    assert.deepStrictEqual(copiesWhereLinksBelong(['not-installed'], install), [])
    // Stays silent: nothing expected at all reports nothing — which is exactly
    // why the precondition above is a separate assertion rather than this one.
    assert.deepStrictEqual(copiesWhereLinksBelong([], install), [])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// The hint is an ACCUSATION's remedy, so it gets the same scrutiny as the
// accusation: every command it prints must be one that works. Without this, the
// check can stay green while telling people to create dangling links.
test('a printed repair hint always names a target that exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hint-'))
  try {
    const good = path.join(tmp, 'good')
    const other = path.join(tmp, 'other')
    const install = path.join(tmp, 'install')
    for (const d of [good, other, install]) fs.mkdirSync(d)
    fs.mkdirSync(path.join(good, 'wanted'))
    // `elsewhere` sorts first, so a hint that takes the first sibling it finds
    // picks this one — whose directory has no `wanted`. That is the real bug.
    fs.mkdirSync(path.join(other, 'elsewhere'))
    fs.symlinkSync(path.join(other, 'elsewhere'), path.join(install, 'elsewhere'))
    fs.symlinkSync(path.join(good, 'wanted'), path.join(install, 'zz-sibling'))

    const hint = repairHint(install, 'wanted')
    const m = hint.match(/ln -s "([^"]+)"/)
    assert.ok(m, `expected an ln -s hint, got: ${hint}`)
    assert.ok(
      fs.existsSync(path.resolve(install, m[1])),
      `hint names a target that does not exist: ${m[1]}`,
    )

    // And when nothing can be verified, it declines to invent a command.
    fs.rmSync(path.join(install, 'zz-sibling'))
    assert.doesNotMatch(repairHint(install, 'wanted'), /ln -s/)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// Commands are exempt, and `commands are installed copies, never links` above is
// where the reason lives — an `{{exec}}` placeholder filled at install time. The
// only thing to assert here is that the two lanes do not overlap: no command is
// in the set this file now demands links for.
test('commands are not in the set that must be links', () => {
  const dir = path.join(CLAUDE, 'commands')
  const commands = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  assert.ok(commands.length, '.claude/commands is populated')
  const mustLink = new Set([...shippedSkills().keys(), ...shippedRules().keys()])
  for (const f of commands) {
    assert.ok(!mustLink.has(f), `${f} is a command and must stay a copy`)
    assert.ok(!mustLink.has(path.basename(f, '.md')), `${f} is a command and must stay a copy`)
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
// every freshly provisioned worktree, which is exactly where /spec-start tells you to
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
