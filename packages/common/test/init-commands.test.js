'use strict'

// The `.claude/commands/` install lane: package-manager detection and the
// `{{exec}}` interpolation that gives a pre-executed command a literal, working
// invocation of a CLI that is never on PATH.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { detectPackageManager, renderCommand, COMMANDS, managedTargets } = require('../src/init.js')

function tmp(lockfiles = []) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-cmds-')))
  for (const f of lockfiles) fs.writeFileSync(path.join(dir, f), '')
  return dir
}

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

test('renderCommand fills every {{exec}} occurrence', () => {
  const dir = tmp(['pnpm-lock.yaml'])
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
  const dir = tmp(['pnpm-lock.yaml'])
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

async function installInto(lockfile = 'pnpm-lock.yaml') {
  const dir = tmp([lockfile])
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
