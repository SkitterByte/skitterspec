'use strict'

// The `.claude/commands/` install lane: package-manager detection and the
// `{{exec}}` interpolation that gives a pre-executed command a literal, working
// invocation of a CLI that is never on PATH.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  detectPackageManager,
  detectRunner,
  renderCommand,
  COMMANDS,
  managedTargets,
} = require('../src/init.js')

function tmp(lockfiles = [], { localInstall = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cmds-')))
  for (const f of lockfiles) fs.writeFileSync(path.join(dir, f), '')
  if (localInstall) seedLocalInstall(dir)
  return dir
}

// A local install, as far as the ladder is concerned: the bin on disk under
// `node_modules/.bin`. Nothing executes it, so an empty file is enough.
function seedLocalInstall(dir) {
  const bin = path.join(dir, 'node_modules', '.bin')
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, 'skitterspec'), '')
  return dir
}

// A directory holding the bin, for the PATH rung. Returned as a fake env rather
// than mutating the real PATH, so these tests say nothing about this machine.
function envWith(...dirs) {
  return { PATH: dirs.join(path.delimiter) }
}

// PATH deliberately emptied: without it, a developer machine with a global
// install would take rung 2 and these assertions would pass for the wrong
// reason — or fail on a machine without one.
const NO_PATH = { PATH: '' }

test('detectPackageManager reads the lockfile, not the environment', () => {
  const cases = [
    [['pnpm-lock.yaml'], 'pnpm exec'],
    [['yarn.lock'], 'yarn'],
    [['package-lock.json'], 'npx'],
    [['bun.lockb'], 'bunx'],
  ]
  for (const [files, expected] of cases) {
    const dir = tmp(files)
    try {
      assert.strictEqual(detectPackageManager(dir), expected, files[0])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

// Bias the unknown case toward the runner that works everywhere rather than
// guessing a package manager we have no evidence for.
test('detectPackageManager falls back to npx when no lockfile is present', () => {
  const dir = tmp()
  try {
    assert.strictEqual(detectPackageManager(dir), 'npx')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('detectPackageManager prefers pnpm when several lockfiles coexist', () => {
  const dir = tmp(['package-lock.json', 'pnpm-lock.yaml'])
  try {
    assert.strictEqual(detectPackageManager(dir), 'pnpm exec', 'first match wins, in order')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the resolution ladder ---------------------------------------------------
//
// Each rung asserts something PRESENT. The old code read a lockfile — which says
// which runner would be used *if* the CLI were installed, never whether it is —
// and a project with no lockfile got `npx skitterspec`, a name that 404s on npm.

test('detectRunner: a local install takes rung 1, and the lockfile picks the runner', () => {
  const dir = tmp(['pnpm-lock.yaml'], { localInstall: true })
  try {
    assert.deepStrictEqual(detectRunner(dir, NO_PATH), { runner: 'pnpm exec', rung: 'local' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('detectRunner: a local install is found by walking up from a subdirectory', () => {
  const dir = tmp(['pnpm-lock.yaml'], { localInstall: true })
  const deep = path.join(dir, 'packages', 'web')
  fs.mkdirSync(deep, { recursive: true })
  try {
    assert.strictEqual(detectRunner(deep, NO_PATH).rung, 'local', 'hoisted install still counts')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('detectRunner: a global install takes rung 2 and renders bare', () => {
  const dir = tmp()
  const binDir = tmp()
  fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
  try {
    assert.deepStrictEqual(detectRunner(dir, envWith(binDir)), { runner: '', rung: 'path' })
  } finally {
    for (const d of [dir, binDir]) fs.rmSync(d, { recursive: true, force: true })
  }
})

// Project-visible signals outrank machine-visible ones: the command file is
// committed, so a render that varies by machine churns for the whole team.
test('detectRunner: a local install outranks one on PATH', () => {
  const dir = tmp(['yarn.lock'], { localInstall: true })
  const binDir = tmp()
  fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
  try {
    assert.strictEqual(detectRunner(dir, envWith(binDir)).runner, 'yarn', 'the lockfile decides')
  } finally {
    for (const d of [dir, binDir]) fs.rmSync(d, { recursive: true, force: true })
  }
})

test('detectRunner: neither install found falls back to npx and says so', () => {
  const dir = tmp(['pnpm-lock.yaml'])
  try {
    assert.deepStrictEqual(detectRunner(dir, NO_PATH), { runner: 'npx', rung: 'none' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// THE BLIND SPOT, and the reason rung 2 filters rather than trusting PATH.
// `npx` prepends its own cache bin to PATH for the processes it spawns, so
// running `npx @skitterbyte/skitterspec init` would otherwise look exactly like
// a global install — and bake a bare `skitterspec …` into four committed files
// that stop working the moment that one command exits.
test('detectRunner: an npx cache directory on PATH is not a global install', () => {
  const dir = tmp()
  const cacheRoot = tmp()
  const cacheBin = path.join(cacheRoot, '_npx', 'a1b2c3', 'node_modules', '.bin')
  fs.mkdirSync(cacheBin, { recursive: true })
  fs.writeFileSync(path.join(cacheBin, 'skitterspec'), '')
  try {
    assert.deepStrictEqual(
      detectRunner(dir, envWith(cacheBin)),
      { runner: 'npx', rung: 'none' },
      'a transient npx bin is not evidence of an install',
    )
  } finally {
    for (const d of [dir, cacheRoot]) fs.rmSync(d, { recursive: true, force: true })
  }
})

// Stays silent: a directory whose NAME merely starts with _npx is a real place
// someone could install to, and must not be filtered out.
test('stays silent: a directory named _npxtools still counts as a global install', () => {
  const dir = tmp()
  const root = tmp()
  const binDir = path.join(root, '_npxtools', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
  try {
    assert.strictEqual(detectRunner(dir, envWith(binDir)).rung, 'path', 'only the exact segment is filtered')
  } finally {
    for (const d of [dir, root]) fs.rmSync(d, { recursive: true, force: true })
  }
})

test('renderCommand on the PATH rung leaves no leading space', () => {
  const dir = tmp()
  const binDir = tmp()
  fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
  const realPath = process.env.PATH
  process.env.PATH = binDir
  try {
    const out = renderCommand('allowed-tools: Bash({{exec}} skitterspec spec-env live:*)\n', dir)
    assert.match(out, /Bash\(skitterspec spec-env live:\*\)/, 'no stray space before the bin')
    assert.doesNotMatch(out, /Bash\( /, 'the token took its trailing space with it')
  } finally {
    process.env.PATH = realPath
    for (const d of [dir, binDir]) fs.rmSync(d, { recursive: true, force: true })
  }
})

test('renderCommand fills every {{exec}} occurrence', () => {
  const dir = tmp(['pnpm-lock.yaml'], { localInstall: true })
  try {
    const src = 'allowed-tools: Bash({{exec}} skitterspec:*)\n!`{{exec}} skitterspec spec-env connect`\n'
    const out = renderCommand(src, dir)
    assert.doesNotMatch(out, /\{\{exec\}\}/, 'no placeholder survives')
    assert.strictEqual(out.split('pnpm exec').length - 1, 2, 'both occurrences filled')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('renderCommand leaves content without the token untouched', () => {
  const dir = tmp(['pnpm-lock.yaml'], { localInstall: true })
  try {
    const src = '# plain command\n\nNo token here.\n'
    assert.strictEqual(renderCommand(src, dir), src)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// managedTargets must compare against exactly what installCommands writes —
// interpolated. Comparing raw asset text would mark every install `customized`
// on its next run and freeze commands out of updates.
test('managedTargets renders command assets the same way the installer does', () => {
  const dir = tmp(['pnpm-lock.yaml'])
  try {
    const targets = managedTargets(dir).filter((t) =>
      t.relPath.split(path.sep).join('/').startsWith('.claude/commands/'),
    )
    assert.strictEqual(targets.length, COMMANDS.length, 'every shipped command is managed')
    for (const t of targets) {
      assert.doesNotMatch(t.bundled, /\{\{exec\}\}/, `${t.relPath} is interpolated, not raw`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// A distribution may ship no commands at all; the lane must be a clean no-op.
test('stays silent: a distribution with no command assets manages none', () => {
  const dir = tmp(['pnpm-lock.yaml'])
  try {
    const cmdTargets = managedTargets(dir).filter((t) =>
      t.relPath.split(path.sep).join('/').startsWith('.claude/commands/'),
    )
    assert.strictEqual(cmdTargets.length, COMMANDS.length)
    if (COMMANDS.length === 0) assert.deepStrictEqual(cmdTargets, [], 'no commands, no targets')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- install / manifest integration -----------------------------------------
//
// These need real command assets to install, which is why they live here rather
// than with the pure-function tests above.

const { init, managedState, readManifest } = require('../src/init.js')

async function installInto(lockfile = 'pnpm-lock.yaml', opts = { localInstall: true }) {
  const dir = tmp([lockfile], opts)
  const quiet = process.stdout.write.bind(process.stdout)
  process.stdout.write = () => true
  try {
    await init({ dir, force: false, claudeMd: false, mode: 'init' })
  } finally {
    process.stdout.write = quiet
  }
  return dir
}

const cmdPath = (dir, name) => path.join(dir, '.claude', 'commands', name)

test('init installs every command with the detected prefix baked in', async () => {
  const dir = await installInto('pnpm-lock.yaml')
  try {
    for (const name of COMMANDS) {
      const body = fs.readFileSync(cmdPath(dir, name), 'utf8')
      assert.doesNotMatch(body, /\{\{exec\}\}/, `${name} has no placeholder left`)
      assert.match(body, /pnpm exec skitterspec/, `${name} carries a working invocation`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a yarn project gets the yarn invocation, not pnpm', async () => {
  const dir = await installInto('yarn.lock')
  try {
    const body = fs.readFileSync(cmdPath(dir, COMMANDS[0]), 'utf8')
    assert.match(body, /yarn skitterspec/, 'rendered for yarn')
    assert.doesNotMatch(body, /pnpm exec/, 'no pnpm leaked in')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// The interpolation must be stable: if managedTargets compared raw asset text,
// a pristine install would read as customized on its very next run.
test('stays silent: a freshly installed command reads back as pristine', async () => {
  const dir = await installInto()
  try {
    const manifest = readManifest(dir)
    for (const name of COMMANDS) {
      const rel = path.join('.claude', 'commands', name)
      const bundled = managedTargets(dir).find((t) => t.relPath === rel).bundled
      assert.strictEqual(
        managedState(dir, rel, manifest, bundled),
        'pristine',
        `${name} is not mistaken for a user edit`,
      )
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an edited command is classified customized and kept', async () => {
  const dir = await installInto()
  try {
    const rel = path.join('.claude', 'commands', COMMANDS[0])
    fs.writeFileSync(path.join(dir, rel), '# mine now\n')
    const manifest = readManifest(dir)
    const bundled = managedTargets(dir).find((t) => t.relPath === rel).bundled
    assert.strictEqual(managedState(dir, rel, manifest, bundled), 'customized')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the cannot-tell warning -------------------------------------------------
//
// It warns rather than refusing: `init` has real work to do either way, and none
// of it needs the CLI reachable later. What must not happen is SILENCE — a clean
// install handing back four commands that 404 on first use.

const { lastReport } = require('../src/init.js')

// PATH is stubbed because the rung under test is "nothing could be found", and a
// developer machine with a global install would otherwise take rung 2.
async function installWithoutEngine(lockfile = 'pnpm-lock.yaml') {
  const realPath = process.env.PATH
  process.env.PATH = ''
  try {
    return await installInto(lockfile, { localInstall: false })
  } finally {
    process.env.PATH = realPath
  }
}

test('init warns when no engine could be found, and still installs', async () => {
  const dir = await installWithoutEngine()
  try {
    const warnings = lastReport().warnings
    assert.ok(
      warnings.some((w) => /could not be found/.test(w) && /npx skitterspec/.test(w)),
      `expected a cannot-find warning, got ${JSON.stringify(warnings)}`,
    )
    for (const name of COMMANDS) {
      assert.ok(fs.existsSync(cmdPath(dir, name)), `${name} was installed anyway`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// The positive test above proves the warning can fire; this proves it does not
// fire at a healthy install (`.claude/rules/negative-checks.md` rule 3).
test('stays silent: a local install draws no engine warning', async () => {
  const dir = await installInto()
  try {
    const warnings = lastReport().warnings
    assert.ok(
      !warnings.some((w) => /could not be found/.test(w)),
      `a resolvable install must warn about nothing, got ${JSON.stringify(warnings)}`,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: a global install draws no engine warning', async () => {
  const binDir = tmp()
  fs.writeFileSync(path.join(binDir, 'skitterspec'), '')
  const realPath = process.env.PATH
  process.env.PATH = binDir
  let dir
  try {
    dir = await installInto('pnpm-lock.yaml', { localInstall: false })
    const warnings = lastReport().warnings
    assert.ok(
      !warnings.some((w) => /could not be found/.test(w)),
      `a global install must warn about nothing, got ${JSON.stringify(warnings)}`,
    )
    const body = fs.readFileSync(cmdPath(dir, COMMANDS[0]), 'utf8')
    assert.match(body, /^!`skitterspec spec-env/m, 'invoked bare, with no runner')
  } finally {
    process.env.PATH = realPath
    for (const d of [dir, binDir]) if (d) fs.rmSync(d, { recursive: true, force: true })
  }
})

// Both commands are user-only: they mutate git and port state, and being absent
// from the model-facing listing is the whole point of the move.
test('every shipped command is marked disable-model-invocation', () => {
  const assets = path.join(__dirname, '..', 'assets', 'commands')
  for (const name of COMMANDS) {
    const body = fs.readFileSync(path.join(assets, name), 'utf8')
    assert.match(body, /^disable-model-invocation:\s*true$/m, `${name} is user-only`)
    assert.match(body, /^!`/m, `${name} pre-executes its verb`)
  }
})

// --- retirement of the superseded skills ------------------------------------
//
// Existing installs carry `.claude/skills/spec-connect/SKILL.md` and
// `.../spec-live/SKILL.md`. No RETIRED_FILES entry is needed: the manifest lists
// them, this version no longer ships them, and `pruneRetiredManaged` deletes
// exactly the ones it can prove are ours.

const { resync } = require('../src/init.js')
const { sha1, writeManifest } = require('../src/init.js')

// Simulate an install made before the move: the old skill on disk, recorded in
// the manifest with the hash we would have written.
function seedRetiredSkill(dir, name, body) {
  const rel = path.join('.claude', 'skills', name, 'SKILL.md')
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
  const manifest = readManifest(dir)
  manifest.files[rel] = sha1(body)
  writeManifest(dir, manifest.files)
  return rel
}

function quietResync(dir) {
  const quiet = process.stdout.write.bind(process.stdout)
  process.stdout.write = () => true
  try {
    resync(dir, { claudeMd: false })
  } finally {
    process.stdout.write = quiet
  }
}

test('resync retires a pristine spec-connect skill left by an older install', async () => {
  const dir = await installInto()
  try {
    const rel = seedRetiredSkill(dir, 'spec-connect', '# old skill\n')
    quietResync(dir)
    assert.ok(!fs.existsSync(path.join(dir, rel)), 'the superseded skill was removed')
    assert.ok(fs.existsSync(cmdPath(dir, 'spec-connect.md')), 'the command replaced it')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Bias the unknown case toward inaction: an unrecognised hash could be a user's
// edit or a lost manifest, and only one of those readings is safe to act on.
test('stays silent: an edited spec-live skill is kept, not deleted', async () => {
  const dir = await installInto()
  try {
    const rel = seedRetiredSkill(dir, 'spec-live', '# old skill\n')
    fs.writeFileSync(path.join(dir, rel), '# old skill, with my notes\n')
    quietResync(dir)
    assert.ok(fs.existsSync(path.join(dir, rel)), 'a user edit is never discarded')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
