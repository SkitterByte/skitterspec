'use strict'

// Every test here builds a throwaway tree and runs against that — never against
// the real `.claude/`. A relink test that operated on the repo it runs in would
// rewrite the developer's checkout as a side effect of `pnpm test`, and a crash
// half way would leave it part-linked with no record of what changed.
//
// The interesting cases are the ones where it must NOT act. Relinking a stale
// copy is trivial; refusing an edited one is the whole safety property, because
// the edit exists nowhere else and a symlink overwrites it without trace.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { planRelink, linkTargetFor, sameTree, applyRelink } = require('./claude-relink.js')

// A fixture shaped like the real install: an asset tree, and an install dir whose
// entries point into it. `seed` names what each install entry should be —
// 'link', 'copy', 'edited', or absent entirely.
function fixture(seed, { rule = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relink-'))
  const assets = path.join(tmp, 'assets')
  const install = path.join(tmp, 'install')
  fs.mkdirSync(assets)
  fs.mkdirSync(install)

  const write = (dir, name, body) => {
    if (rule) return fs.writeFileSync(path.join(dir, name), body)
    fs.mkdirSync(path.join(dir, name), { recursive: true })
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), body)
  }

  for (const [name, kind] of Object.entries(seed)) {
    write(assets, name, `# ${name}\n`)
    const rel = path.join('..', 'assets', name)
    if (kind === 'link') fs.symlinkSync(rel, path.join(install, name))
    else if (kind === 'copy') write(install, name, `# ${name}\n`)
    else if (kind === 'edited') write(install, name, `# ${name}\nlocal edit\n`)
  }
  return { tmp, assets, install, names: Object.keys(seed) }
}

const cleanup = (f) => fs.rmSync(f.tmp, { recursive: true, force: true })
const state = (plan, name) => plan.find((i) => i.name === name).state

test('a stale copy is planned for relinking, and relinking it works', () => {
  const f = fixture({ good: 'link', stale: 'copy' })
  try {
    const plan = planRelink(f.names, f.install)
    assert.strictEqual(state(plan, 'stale'), 'relink')

    const done = applyRelink(plan, f.install)
    assert.deepStrictEqual(done, ['stale'])
    assert.ok(fs.lstatSync(path.join(f.install, 'stale')).isSymbolicLink())
    // And it resolves — a relink that produces a dangling link has replaced a
    // frozen skill with an unloadable one, which is strictly worse.
    assert.ok(fs.existsSync(path.join(f.install, 'stale', 'SKILL.md')))
    // Re-running is a no-op rather than an error.
    assert.strictEqual(state(planRelink(f.names, f.install), 'stale'), 'linked')
  } finally {
    cleanup(f)
  }
})

test('an already-correct link is left alone', () => {
  const f = fixture({ good: 'link', other: 'link' })
  try {
    const before = fs.readlinkSync(path.join(f.install, 'good'))
    const plan = planRelink(f.names, f.install)
    assert.deepStrictEqual(applyRelink(plan, f.install), [])
    assert.strictEqual(fs.readlinkSync(path.join(f.install, 'good')), before)
  } finally {
    cleanup(f)
  }
})

// THE ONE THAT MATTERS. A copy whose content differs from the asset is somebody's
// edit; replacing it with a symlink deletes it silently and irreversibly.
test('an edited copy is refused and reported, never replaced', () => {
  const f = fixture({ good: 'link', mine: 'edited' })
  try {
    const plan = planRelink(f.names, f.install)
    assert.strictEqual(state(plan, 'mine'), 'edited')

    assert.deepStrictEqual(applyRelink(plan, f.install), [], 'apply must skip it')
    const still = fs.readFileSync(path.join(f.install, 'mine', 'SKILL.md'), 'utf8')
    assert.match(still, /local edit/, 'the edit survived')
    assert.ok(!fs.lstatSync(path.join(f.install, 'mine')).isSymbolicLink())
  } finally {
    cleanup(f)
  }
})

// Shipped but not installed here — an ordinary state, since a distribution need
// not install every skill. Accusing it is the mistake negative-checks.md rule 4
// exists to prevent, and it would fire on every partial install.
// THIS TEST ONCE ASSERTED THE OPPOSITE, and the change is the bug it documents.
// It read "shipped but not installed" as the ordinary state — true of a
// consumer, where not every distribution installs every skill, and false here,
// where the dogfood convention is that everything shipped is linked. Under the
// old reading `/spec-reviewed` landed on `main`, was never installed, could not
// be invoked, and `pnpm relink` said "nothing to do".
//
// The boundary moved to where the evidence is: a RESOLVABLE TARGET. The fixture
// writes an asset for every name it seeds, so `elsewhere` has something to point
// at — which makes its absence a gap rather than a choice.
test('a shipped entry with a target but no link is created', () => {
  const f = fixture({ good: 'link', elsewhere: 'absent' })
  try {
    const plan = planRelink(f.names, f.install)
    assert.strictEqual(state(plan, 'elsewhere'), 'link')
    assert.deepStrictEqual(applyRelink(plan, f.install), ['elsewhere'])
    assert.ok(fs.lstatSync(path.join(f.install, 'elsewhere')).isSymbolicLink())
  } finally {
    cleanup(f)
  }
})

// And the half of the original reasoning that survives: with nothing to point
// at, absence is the ordinary state and is still skipped in silence
// (`.claude/rules/negative-checks.md` rule 4). The name is not seeded, so no
// asset exists for it and no target can resolve.
test('a shipped entry with no target at all is skipped, not created', () => {
  const f = fixture({ good: 'link' })
  try {
    const plan = planRelink(['good', 'not-composed'], f.install)
    assert.strictEqual(state(plan, 'not-composed'), 'absent')
    assert.deepStrictEqual(applyRelink(plan, f.install), [])
    assert.ok(!fs.existsSync(path.join(f.install, 'not-composed')))
  } finally {
    cleanup(f)
  }
})

// With nothing linked there is no convention to read, so the target cannot be
// established. Refuse rather than guess: a guessed target is how you get a
// confident `ln -s` into a directory that has no such entry.
test('with no sibling link to learn from, it refuses instead of guessing', () => {
  const f = fixture({ lonely: 'copy' })
  try {
    assert.strictEqual(linkTargetFor(f.install, 'lonely'), null)
    const plan = planRelink(f.names, f.install)
    assert.strictEqual(state(plan, 'lonely'), 'no-target')
    assert.deepStrictEqual(applyRelink(plan, f.install), [])
  } finally {
    cleanup(f)
  }
})

// The convention differs per lane — skills link to the built distribution, rules
// to their source package — so the target must be read off a sibling. This is the
// rules shape: single files, not directories.
test('rules relink as files, learning their own target convention', () => {
  const f = fixture({ 'a.md': 'link', 'b.md': 'copy' }, { rule: true })
  try {
    const plan = planRelink(f.names, f.install)
    assert.strictEqual(state(plan, 'b.md'), 'relink')
    applyRelink(plan, f.install)
    assert.ok(fs.lstatSync(path.join(f.install, 'b.md')).isSymbolicLink())
    assert.strictEqual(fs.readFileSync(path.join(f.install, 'b.md'), 'utf8'), '# b.md\n')
  } finally {
    cleanup(f)
  }
})

// Commands are never passed in — they are not in the shipped skill/rule sets —
// but the structural claim is worth pinning: nothing here walks a sibling
// directory, so a `commands/` tree beside the install cannot be reached.
test('a commands directory beside the install is untouched', () => {
  const f = fixture({ good: 'link', stale: 'copy' })
  try {
    const commands = path.join(f.tmp, 'commands')
    fs.mkdirSync(commands)
    fs.writeFileSync(path.join(commands, 'spec-connect.md'), '!`{{exec}} skitterspec spec-env connect`\n')
    const before = fs.readdirSync(commands).map((n) => [n, fs.readFileSync(path.join(commands, n), 'utf8')])

    applyRelink(planRelink(f.names, f.install), f.install)

    const after = fs.readdirSync(commands).map((n) => [n, fs.readFileSync(path.join(commands, n), 'utf8')])
    assert.deepStrictEqual(after, before)
    assert.ok(!fs.lstatSync(path.join(commands, 'spec-connect.md')).isSymbolicLink())
  } finally {
    cleanup(f)
  }
})

// sameTree is the load-bearing predicate — `edited` vs `relink` is entirely its
// answer, so its false-positives destroy work. Prove it distinguishes the shapes
// that actually occur, including a directory that differs only in an extra file.
test('sameTree separates identical trees from every way one can differ', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sametree-'))
  try {
    const mk = (name, files) => {
      const d = path.join(tmp, name)
      fs.mkdirSync(d, { recursive: true })
      for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(d, f), body)
      return d
    }
    const base = mk('base', { 'SKILL.md': 'x\n' })
    assert.ok(sameTree(base, mk('same', { 'SKILL.md': 'x\n' })))
    assert.ok(!sameTree(base, mk('body', { 'SKILL.md': 'y\n' })), 'content differs')
    assert.ok(!sameTree(base, mk('extra', { 'SKILL.md': 'x\n', 'NOTES.md': 'z\n' })), 'extra file')
    assert.ok(!sameTree(base, mk('renamed', { 'OTHER.md': 'x\n' })), 'name differs')
    assert.ok(!sameTree(base, path.join(tmp, 'missing')), 'target absent')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
