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
