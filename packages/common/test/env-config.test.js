'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { loadEnvConfig, DEFAULT_CONFIG, CONFIG_FILE } = require('../src/env/config.js')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-envcfg-'))
}

function writeEnvConfig(dir, obj) {
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj), 'utf-8')
}

test('absent config → defaults with present:false (opt-out, no throw)', () => {
  const dir = tmpDir()
  const { config, present } = loadEnvConfig(dir)
  assert.strictEqual(present, false)
  assert.strictEqual(config.docker.portBase, 3000)
  assert.strictEqual(config.docker.portsPerSpec, 10)
  assert.strictEqual(config.worktree.root, '../{repo}-wt')
  assert.strictEqual(config.registry, '.spec-env/registry.json')
  assert.strictEqual(config.branch.pattern, '{type}/{slug}')
  assert.strictEqual(config.branch.identifierField, '')
  assert.strictEqual(config.baseBranch, '')
  assert.strictEqual(config.guards.refuseTeardownIfDirty, true)
})

test('baseBranch defaults to empty and accepts an override', () => {
  const dir = tmpDir()
  assert.strictEqual(loadEnvConfig(dir).config.baseBranch, '')
  writeEnvConfig(dir, { baseBranch: 'develop' })
  assert.strictEqual(loadEnvConfig(dir).config.baseBranch, 'develop')
})

test('present config → present:true and merged over defaults', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    docker: { portBase: 4000 },
    branch: { pattern: '{identifier}-{slug}', identifierField: 'tracker_id' },
  })
  const { config, present } = loadEnvConfig(dir)
  assert.strictEqual(present, true)
  // overridden
  assert.strictEqual(config.docker.portBase, 4000)
  assert.strictEqual(config.branch.pattern, '{identifier}-{slug}')
  assert.strictEqual(config.branch.identifierField, 'tracker_id')
  // untouched defaults
  assert.strictEqual(config.docker.portsPerSpec, 10)
  assert.strictEqual(config.docker.composeFile, 'docker-compose.yml')
})

test('backupCommand accepts an explicit empty string', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { backupCommand: '' } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.backupCommand, '')
})


test('nested guards merge field-by-field', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { guards: { refuseTeardownIfUnpushed: false } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.guards.refuseTeardownIfUnpushed, false)
  assert.strictEqual(config.guards.refuseTeardownIfDirty, true)
})

test('ignores unknown keys for forward-compat', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { wibble: true, docker: { unknown: 'x', portBase: 5000 } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.portBase, 5000)
  assert.strictEqual(config.wibble, undefined)
  assert.strictEqual(config.docker.unknown, undefined)
})

test('wrong-typed values are ignored (keep the default)', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { portBase: 'nope', enabled: 'yes' } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.docker.portBase, 3000)
  assert.strictEqual(config.docker.enabled, true)
})

test('throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = path.join(dir, CONFIG_FILE)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{ not valid json', 'utf-8')
  assert.throws(() => loadEnvConfig(dir), /Invalid .*env\.config\.json/)
})

test('dev defaults to an empty array', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.dev, [])
})

test('setup defaults to an empty array (absent → opt-out)', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.setup, [])
})

test('setup keeps trimmed non-empty strings, dropping blanks/non-strings', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    setup: ['  pnpm install  ', '', '   ', 42, null, { cmd: 'x' }, 'pnpm build'],
  })
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.setup, ['pnpm install', 'pnpm build'])
})

test('setup of the wrong type is ignored (keeps the default [])', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { setup: 'pnpm install' })
  assert.deepStrictEqual(loadEnvConfig(dir).config.setup, [])
})

test('seedFiles defaults to symlink mode with an empty file list', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.seedFiles, { mode: 'symlink', files: [] })
})

test('seedFiles object form: mode + trimmed file list', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    seedFiles: { mode: 'copy', files: ['  .env  ', '', 42, '.local-secrets.jsonc'] },
  })
  assert.deepStrictEqual(loadEnvConfig(dir).config.seedFiles, {
    mode: 'copy',
    files: ['.env', '.local-secrets.jsonc'],
  })
})

test('seedFiles array shorthand defaults to symlink mode', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { seedFiles: ['.env', '.env.local'] })
  assert.deepStrictEqual(loadEnvConfig(dir).config.seedFiles, {
    mode: 'symlink',
    files: ['.env', '.env.local'],
  })
})

test('seedFiles: an unknown mode falls back to symlink', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { seedFiles: { mode: 'hardlink', files: ['.env'] } })
  assert.strictEqual(loadEnvConfig(dir).config.seedFiles.mode, 'symlink')
})

test('seedFiles: object with no files → empty list, kept mode', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { seedFiles: { mode: 'copy' } })
  assert.deepStrictEqual(loadEnvConfig(dir).config.seedFiles, { mode: 'copy', files: [] })
})

test('dev entries normalise; required fields kept, optionals passed through', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    dev: [
      {
        name: '  api ',
        command: ' pnpm --filter api dev ',
        portVar: 'API_PORT',
        health: ' http://localhost:{API_PORT}/health ',
        frontPort: 8080,
      },
      { name: 'ui', command: 'pnpm --filter ui dev', portVar: 'PORT' },
    ],
  })
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.dev, [
    {
      name: 'api',
      command: 'pnpm --filter api dev',
      portVar: 'API_PORT',
      health: 'http://localhost:{API_PORT}/health',
      frontPort: 8080,
    },
    { name: 'ui', command: 'pnpm --filter ui dev', portVar: 'PORT' },
  ])
})

test('dev drops malformed entries (missing required fields / wrong types)', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    dev: [
      { name: 'ok', command: 'run', portVar: 'PORT' },
      { name: 'no-command', portVar: 'PORT' },
      { command: 'orphan', portVar: 'PORT' },
      { name: 'bad-front', command: 'run', portVar: 'PORT', frontPort: 'nope' },
      'not-an-object',
    ],
  })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.dev.length, 2)
  assert.strictEqual(config.dev[0].name, 'ok')
  // frontPort of wrong type is simply omitted, entry otherwise kept
  assert.strictEqual(config.dev[1].name, 'bad-front')
  assert.ok(!('frontPort' in config.dev[1]))
})

test('proxy defaults and merges field-by-field', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.proxy, { enabled: true, host: '127.0.0.1' })
  writeEnvConfig(dir, { proxy: { enabled: false } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.proxy.enabled, false)
  assert.strictEqual(config.proxy.host, '127.0.0.1') // untouched default
})

test('DEFAULT_CONFIG is exported and frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_CONFIG))
  assert.ok(Object.isFrozen(DEFAULT_CONFIG.docker))
})

test('merging does not mutate DEFAULT_CONFIG', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { docker: { portBase: 9000 } })
  loadEnvConfig(dir)
  assert.strictEqual(DEFAULT_CONFIG.docker.portBase, 3000)
})

test('live.migrations defaults to [] and normalizes a parsed glob list', () => {
  const dir = tmpDir()
  const { config: def } = loadEnvConfig(dir)
  assert.deepStrictEqual(def.live.migrations, [])
  assert.deepStrictEqual(DEFAULT_CONFIG.live.migrations, [])

  writeEnvConfig(dir, { live: { migrations: ['**/migrations/**', '  ', 'prisma/**'] } })
  const { config } = loadEnvConfig(dir)
  // trimmed, non-empty strings only (lenient, like the other list fields)
  assert.deepStrictEqual(config.live.migrations, ['**/migrations/**', 'prisma/**'])
})

test('hotfix block defaults to patch/main/none, built-in release', () => {
  const dir = tmpDir()
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.hotfix, {
    bump: 'patch',
    cherryPickMain: true,
    targets: [],
    releaseWith: '',
  })
  assert.deepStrictEqual(DEFAULT_CONFIG.hotfix.targets, [])
})

test('hotfix block merges bump/cherryPickMain and normalizes targets', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    hotfix: { cherryPickMain: false, targets: ['v30.2.1', '  ', 'v29.0.0'] },
  })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.hotfix.cherryPickMain, false)
  assert.strictEqual(config.hotfix.bump, 'patch') // untouched default
  assert.deepStrictEqual(config.hotfix.targets, ['v30.2.1', 'v29.0.0'])
})

test('hotfix.releaseWith is read as a string, and a non-string is ignored', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { hotfix: { releaseWith: 'node scripts/release-hotfix.cjs --json' } })
  assert.strictEqual(loadEnvConfig(dir).config.hotfix.releaseWith, 'node scripts/release-hotfix.cjs --json')
  writeEnvConfig(dir, { hotfix: { releaseWith: true } })
  assert.strictEqual(loadEnvConfig(dir).config.hotfix.releaseWith, '')
})

test('teardown block defaults to prompt', () => {
  const dir = tmpDir()
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.teardown, { deleteRemoteBranch: 'prompt' })
  assert.strictEqual(DEFAULT_CONFIG.teardown.deleteRemoteBranch, 'prompt')
})

test('teardown accepts the three policies', () => {
  for (const policy of ['prompt', 'never', 'always']) {
    const dir = tmpDir()
    writeEnvConfig(dir, { teardown: { deleteRemoteBranch: policy } })
    assert.strictEqual(loadEnvConfig(dir).config.teardown.deleteRemoteBranch, policy)
  }
})

test('an unrecognised teardown policy falls back to prompt, not to a stronger one', () => {
  // A typo must never resolve to "always" — that is the one value that deletes a
  // remote branch without anyone being asked.
  for (const bogus of ['Always', 'yes', true, '', null, 'ALWAYS']) {
    const dir = tmpDir()
    writeEnvConfig(dir, { teardown: { deleteRemoteBranch: bogus } })
    assert.strictEqual(loadEnvConfig(dir).config.teardown.deleteRemoteBranch, 'prompt')
  }
})

// --- `mode`: where a spec's branch gets built --------------------------------

test('mode defaults to worktree, so an installed repo does not change on upgrade', () => {
  const dir = tmpDir()
  assert.strictEqual(loadEnvConfig(dir).config.mode, 'worktree')
  writeEnvConfig(dir, {})
  assert.strictEqual(loadEnvConfig(dir).config.mode, 'worktree')
  assert.strictEqual(DEFAULT_CONFIG.mode, 'worktree')
})

test('mode accepts the two real values', () => {
  for (const mode of ['worktree', 'checkout']) {
    const dir = tmpDir()
    writeEnvConfig(dir, { mode })
    assert.strictEqual(loadEnvConfig(dir).config.mode, mode)
  }
})

test('an unrecognised mode falls back to worktree, never to checkout', () => {
  // Same policy as `teardown.deleteRemoteBranch` above, and the fallback
  // DIRECTION is the point rather than the fallback itself: "worktree" is the
  // conservative value. A typo costs an extra terminal session; the opposite
  // default would put a spec's commits in the primary checkout without anyone
  // having chosen that.
  for (const bad of ['Checkout', 'CHECKOUT', 'in-place', 'primary', '', 42, null, {}, []]) {
    const dir = tmpDir()
    writeEnvConfig(dir, { mode: bad })
    assert.strictEqual(
      loadEnvConfig(dir).config.mode,
      'worktree',
      `mode ${JSON.stringify(bad)} should fall back to worktree`,
    )
  }
})

test('mode is independent of seedFiles.mode, which shares only the name', () => {
  // The two are unrelated enums at different levels. Setting one must not move
  // the other — a real risk given both are called "mode".
  const dir = tmpDir()
  writeEnvConfig(dir, { mode: 'checkout', seedFiles: { mode: 'copy', files: ['.env'] } })
  const { config } = loadEnvConfig(dir)
  assert.strictEqual(config.mode, 'checkout')
  assert.strictEqual(config.seedFiles.mode, 'copy')

  const other = tmpDir()
  writeEnvConfig(other, { seedFiles: { mode: 'copy', files: ['.env'] } })
  assert.strictEqual(loadEnvConfig(other).config.mode, 'worktree', 'seedFiles.mode did not leak upward')
})

test('the shipped example config carries mode at its default', () => {
  // The template is what an adopting repo actually gets, so the key has to be
  // visible there — a config key nobody can see is a key nobody sets.
  const example = path.join(
    __dirname, '..', 'assets', 'core', 'env.config.json.example',
  )
  const parsed = JSON.parse(fs.readFileSync(example, 'utf-8'))
  assert.strictEqual(parsed.mode, 'worktree')
})

test('spec.companionPaths defaults to none, so a spec owns only its own folder', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.spec.companionPaths, [])
  writeEnvConfig(dir, { worktree: { root: '../wt' } })
  assert.deepStrictEqual(loadEnvConfig(dir).config.spec.companionPaths, [])
})

test('spec.companionPaths keeps trimmed strings and drops the rest', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    spec: { companionPaths: ['  specs/.core/x/{identifier}.json  ', '', 7, null, 'a/b'] },
  })
  assert.deepStrictEqual(loadEnvConfig(dir).config.spec.companionPaths, [
    'specs/.core/x/{identifier}.json',
    'a/b',
  ])
})

test('a non-array spec.companionPaths is ignored, not fatal', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { spec: { companionPaths: 'specs/.core/x.json' } })
  assert.deepStrictEqual(loadEnvConfig(dir).config.spec.companionPaths, [])
})

test('afterLand defaults to an empty array (absent → opt-out)', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [])
})

test('afterLand keeps trimmed non-empty strings as always-run entries, dropping blanks/junk', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    afterLand: ['  pnpm db:data-migration  ', '', 7, null, { cmd: 'x' }, 'pnpm build'],
  })
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.afterLand, [
    { run: 'pnpm db:data-migration', when: null },
    { run: 'pnpm build', when: null },
  ])
})

test('afterLand keeps { run, when } entries, coercing a string when to a list', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    afterLand: [
      { run: ' pnpm run db:generate ', when: 'prisma/schema.prisma' },
      { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml', ' **/package.json ', ''] },
      { run: 'pnpm build' },
    ],
  })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [
    { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
    { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml', '**/package.json'] },
    { run: 'pnpm build', when: null },
  ])
})

test('afterLand drops an entry whose when is unusable, never widening it to always-run', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    afterLand: [
      { run: 'a', when: [] },
      { run: 'b', when: [7, ''] },
      { run: 'c', when: 7 },
      { run: '  ', when: ['x'] },
      'kept',
    ],
  })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [{ run: 'kept', when: null }])
})

test('setup accepts { run, when }: setup stays strings, triggered entries become setupTriggers', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    setup: [
      { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml'] },
      'pnpm build',
      { run: 'pnpm run db:generate', when: 'prisma/schema.prisma' },
      { run: 'skip me', when: [] },
    ],
  })
  const { config } = loadEnvConfig(dir)
  assert.deepStrictEqual(config.setup, ['pnpm install --frozen-lockfile', 'pnpm build', 'pnpm run db:generate'])
  assert.deepStrictEqual(config.setupTriggers, [
    { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml'] },
    { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
  ])
})

test('afterLand { setup: true } expands in place to the triggered setup entries', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, {
    setup: [
      { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml'] },
      'pnpm build',
      { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
    ],
    afterLand: ['first', { setup: true }, 'pnpm db:data-migration'],
  })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [
    { run: 'first', when: null },
    { run: 'pnpm install --frozen-lockfile', when: ['pnpm-lock.yaml'] },
    { run: 'pnpm run db:generate', when: ['prisma/schema.prisma'] },
    { run: 'pnpm db:data-migration', when: null },
  ])
})

test('afterLand { setup: true } with no triggered setup entries expands to nothing', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { setup: ['pnpm install'], afterLand: [{ setup: true }, 'x'] })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [{ run: 'x', when: null }])
  writeEnvConfig(dir, { afterLand: [{ setup: true }] })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [])
})

test('afterLand of the wrong type is ignored (keeps the default [])', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { afterLand: 'pnpm db:data-migration' })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [])
})

test('afterLand is literal — tokens are not expanded', () => {
  const dir = tmpDir()
  writeEnvConfig(dir, { afterLand: ['echo {slug}'] })
  assert.deepStrictEqual(loadEnvConfig(dir).config.afterLand, [{ run: 'echo {slug}', when: null }])
})

// --- provider env defaults (bug-azure-boards-adoption-fixes) ------------------

test('provider env defaults fill unset isolation keys, and the project file wins', (t) => {
  const { setProviderEnvDefaults } = require('../src/env/config.js')
  t.after(() => setProviderEnvDefaults(null))

  setProviderEnvDefaults({
    branch: { identifierField: 'azure_identifier' },
    spec: { companionPaths: ['specs/.core/azure-base/{identifier}.base.json'] },
  })

  // No env.config.json: the provider defaults apply, so the superset's stage
  // claims the provider's snapshot sidecar out of the box.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'env-defaults-'))
  const filled = loadEnvConfig(bare).config
  assert.strictEqual(filled.branch.identifierField, 'azure_identifier')
  assert.deepStrictEqual(filled.spec.companionPaths, ['specs/.core/azure-base/{identifier}.base.json'])

  // The project's own values stay authoritative — defaults sit BENEATH them.
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'env-defaults-'))
  fs.mkdirSync(path.join(own, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(own, 'specs', '.core', 'env.config.json'),
    JSON.stringify({
      branch: { identifierField: 'linear_identifier' },
      spec: { companionPaths: ['specs/.core/linear-base/{identifier}.base.json'] },
    }),
  )
  const kept = loadEnvConfig(own).config
  assert.strictEqual(kept.branch.identifierField, 'linear_identifier')
  assert.deepStrictEqual(kept.spec.companionPaths, ['specs/.core/linear-base/{identifier}.base.json'])

  // An EXPLICIT empty value is the project's decision, not a gap to fill:
  // blanking identifierField disables companion expansion and must stay
  // disabled (the "two keys are one fix" contract in build-dist.test.js).
  const blanked = fs.mkdtempSync(path.join(os.tmpdir(), 'env-defaults-'))
  fs.mkdirSync(path.join(blanked, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(blanked, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ branch: { identifierField: '' }, spec: { companionPaths: [] } }),
  )
  const optedOut = loadEnvConfig(blanked).config
  assert.strictEqual(optedOut.branch.identifierField, '')
  assert.deepStrictEqual(optedOut.spec.companionPaths, [])

  // Unregistered (the base distribution): the defaults are the base's empties.
  setProviderEnvDefaults(null)
  const base = loadEnvConfig(bare).config
  assert.strictEqual(base.branch.identifierField, '')
  assert.deepStrictEqual(base.spec.companionPaths, [])
})
