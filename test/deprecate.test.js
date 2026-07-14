'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  detectReleaseTooling,
  removeReleaseTooling,
  releaseToolingNotice,
} = require('../src/deprecate.js')
const { run } = require('../src/cli.js')

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-dep-'))
}

const w = (dir, rel, content) => {
  const abs = path.join(dir, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))
const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))

// Simulate a project that installed release tooling from an older skitterspec.
function seedOldInstall(dir) {
  w(dir, 'skitterspec.config.json', '{"version":1}')
  w(dir, path.join('scripts', 'generate-changelog.js'), '// gen')
  w(dir, path.join('scripts', 'generate-releases.js'), '// gen')
  w(dir, path.join('scripts', 'lib', 'git-commits.js'), '// lib')
  w(dir, path.join('scripts', 'lib', 'config.js'), '// lib')
  w(dir, path.join('.claude', 'skills', 'commit', 'SKILL.md'), '# commit')
  w(dir, path.join('.claude', 'rules', 'commit-messages.md'), '# rule')
  w(
    dir,
    'package.json',
    JSON.stringify({
      name: 'demo',
      scripts: {
        test: 'node --test',
        version: 'node scripts/generate-changelog.js && node scripts/generate-releases.js && git add CHANGELOG.md RELEASES.md',
        changelog: 'node scripts/generate-changelog.js',
        'changelog:retro': 'node scripts/generate-changelog.js --retro',
        releases: 'node scripts/generate-releases.js',
        'releases:retro': 'node scripts/generate-releases.js --retro',
      },
    }),
  )
  w(dir, 'CHANGELOG.md', '# Changelog\n\nkeep me\n')
  w(dir, 'RELEASES.md', '# Releases\n\nkeep me\n')
}

// Run the CLI without leaking its report to the test reporter.
async function silentRun(argv) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
}

// --- detection --------------------------------------------------------------

test('detects nothing in a clean project', () => {
  const d = detectReleaseTooling(tmpProject())
  assert.strictEqual(d.present, false)
  assert.deepStrictEqual(d.files, [])
  assert.strictEqual(d.versionHook, false)
})

test('detects a full old install', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  const d = detectReleaseTooling(dir)
  assert.strictEqual(d.present, true)
  assert.ok(d.files.includes('skitterspec.config.json'))
  assert.ok(d.files.includes(path.join('.claude', 'skills', 'commit')))
  assert.strictEqual(d.versionHook, true)
})

test('detects a generator-driven version hook even with the files gone', () => {
  const dir = tmpProject()
  w(dir, 'package.json', JSON.stringify({ scripts: { version: 'node scripts/generate-releases.js' } }))
  const d = detectReleaseTooling(dir)
  assert.strictEqual(d.present, true)
  assert.deepStrictEqual(d.files, [])
  assert.strictEqual(d.versionHook, true)
})

test('does NOT flag release files when skittership.config.json is present', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  // the project has adopted skittership — the files are its current install
  w(dir, 'skittership.config.json', '{"version":1}')
  const d = detectReleaseTooling(dir)
  assert.strictEqual(d.present, false, 'not offered for removal')
  assert.strictEqual(d.adopted, true)
})

test('does NOT flag release files when skittership is a dependency', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.devDependencies = { '@skitterbyte/skittership': '^1.0.0' }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
  assert.strictEqual(detectReleaseTooling(dir).present, false, 'skittership dep → not legacy')
})

test('update leaves release tooling alone when skittership is adopted', async () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  w(dir, 'skittership.config.json', '{"version":1}')
  await silentRun(['update', dir, '--remove-release-tooling'])
  // even with the explicit remove flag, an adopted-skittership project is untouched
  assert.ok(exists(dir, path.join('.claude', 'skills', 'commit')), 'commit skill kept')
  assert.ok(exists(dir, path.join('scripts', 'generate-releases.js')), 'generators kept')
})

// --- removal ----------------------------------------------------------------

test('removes every installed artifact and prunes empty dirs', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  removeReleaseTooling(dir)

  assert.ok(!exists(dir, 'skitterspec.config.json'), 'config gone')
  assert.ok(!exists(dir, path.join('scripts', 'generate-changelog.js')), 'changelog gen gone')
  assert.ok(!exists(dir, path.join('scripts', 'lib', 'config.js')), 'lib gone')
  assert.ok(!exists(dir, 'scripts'), 'empty scripts/ pruned')
  assert.ok(!exists(dir, path.join('.claude', 'skills', 'commit')), 'commit skill gone')
  assert.ok(!exists(dir, path.join('.claude', 'rules', 'commit-messages.md')), 'commit rule gone')
})

test('unwires the version hook and removes the generator helper scripts', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  removeReleaseTooling(dir)
  const scripts = readPkg(dir).scripts
  assert.strictEqual(scripts.version, undefined, 'version hook removed')
  assert.strictEqual(scripts.changelog, undefined, 'changelog helper removed')
  assert.strictEqual(scripts['releases:retro'], undefined, 'releases:retro helper removed')
  assert.strictEqual(scripts.test, 'node --test', 'unrelated script preserved')
})

test('never touches generated CHANGELOG / RELEASES content or unrelated scripts', () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  w(dir, path.join('scripts', 'build.js'), '// my own script')
  removeReleaseTooling(dir)

  assert.strictEqual(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), '# Changelog\n\nkeep me\n')
  assert.strictEqual(fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8'), '# Releases\n\nkeep me\n')
  // an unrelated script kept scripts/ alive, so it was NOT pruned
  assert.ok(exists(dir, path.join('scripts', 'build.js')), 'unrelated script preserved')
  assert.ok(exists(dir, 'scripts'), 'scripts/ kept — still has content')
})

test('preserves a user-customised version script', () => {
  const dir = tmpProject()
  w(dir, 'skitterspec.config.json', '{"version":1}')
  w(dir, 'package.json', JSON.stringify({ scripts: { version: 'my-custom-release' } }))
  removeReleaseTooling(dir)
  assert.strictEqual(readPkg(dir).scripts.version, 'my-custom-release', 'custom version kept')
})

test('releaseToolingNotice points at skittership', () => {
  assert.match(releaseToolingNotice(), /@skitterbyte\/skittership/)
})

// --- CLI guard behavior (non-interactive / flags) ---------------------------

test('update in a non-TTY run does NOT delete (notice only)', async () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  await silentRun(['update', dir])
  assert.ok(exists(dir, 'skitterspec.config.json'), 'config left in place (no TTY)')
  assert.ok(exists(dir, path.join('scripts', 'generate-releases.js')), 'generators left in place')
})

test('update --yes never deletes release tooling', async () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  await silentRun(['update', dir, '--yes'])
  assert.ok(exists(dir, 'skitterspec.config.json'), '--yes does not auto-delete')
})

test('update --remove-release-tooling removes it non-interactively', async () => {
  const dir = tmpProject()
  seedOldInstall(dir)
  await silentRun(['update', dir, '--remove-release-tooling'])
  assert.ok(!exists(dir, 'skitterspec.config.json'), 'config removed')
  assert.ok(!exists(dir, 'scripts'), 'generators removed + pruned')
  assert.ok(!exists(dir, path.join('.claude', 'skills', 'commit')), 'commit skill removed')
  assert.strictEqual(readPkg(dir).scripts.version, undefined, 'version hook unwired')
  // update still installed the spec tooling
  assert.ok(exists(dir, path.join('.claude', 'skills', 'spec', 'SKILL.md')), 'spec skill installed')
})
