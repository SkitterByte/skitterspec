'use strict'

/**
 * `spec-env bootstrap` at the CLI level: resolution, the refusals, `--plan`,
 * `--json`, and a real run of seeds plus a real (harmless) setup command.
 *
 * The step runner's own edge cases are pinned in `env-bootstrap.test.js`. No
 * test here brings a stack up — the docker case is the refusal, which acts
 * before anything would spawn.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

function scaffold({ slug = 'x', config = {}, stack = 'worktree', mainFiles = {}, worktree = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-bootcli-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...config }),
  )
  const spec = path.join(dir, 'specs', 'in-progress', `feat-${slug}`)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), `# X\n\n> **Type:** Feature\n> **Stack:** ${stack}\n`)
  for (const [rel, content] of Object.entries(mainFiles)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), content)
  }
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  if (worktree) fs.mkdirSync(wt, { recursive: true })
  return { dir, folder: `feat-${slug}`, wt }
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

// Capture stdout and the exit code `run` leaves behind, then restore both.
async function runQuiet(argv) {
  const orig = process.stdout.write
  const origErr = process.stderr.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  process.stderr.write = () => true
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
    process.stderr.write = origErr
  }
  const code = process.exitCode || 0
  process.exitCode = 0
  return { out, code }
}

const SEEDS = { seedFiles: ['packages/api/.env', 'apps/web/.env'] }

test('one call seeds the worktree and runs setup in it', async () => {
  const env = scaffold({
    config: { ...SEEDS, setup: ['touch setup-ran'] },
    mainFiles: { 'packages/api/.env': 'A=1\n' },
  })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 0, out)
    assert.ok(fs.lstatSync(path.join(env.wt, 'packages/api/.env')).isSymbolicLink())
    assert.match(out, /seed apps\/web\/\.env: not in main — skipped/)
    assert.ok(fs.existsSync(path.join(env.wt, 'setup-ran')), 'setup ran with the worktree as cwd')
    assert.ok(!fs.existsSync(path.join(env.dir, 'setup-ran')), 'and not in the primary checkout')
    assert.match(out, /feat-x ready \(3 steps\)/)
  } finally {
    cleanup(env.dir)
  }
})

test('a setup entry with when still runs at bootstrap — a fresh worktree always needs it', async () => {
  const env = scaffold({
    config: { setup: [{ run: 'touch gen-ran', when: ['prisma/schema.prisma'] }, 'touch plain-ran'] },
  })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 0, out)
    assert.ok(fs.existsSync(path.join(env.wt, 'gen-ran')), 'the triggered entry ran')
    assert.ok(fs.existsSync(path.join(env.wt, 'plain-ran')), 'and so did the plain one')
  } finally {
    cleanup(env.dir)
  }
})

test('a second run changes nothing', async () => {
  const env = scaffold({ config: SEEDS, mainFiles: { 'packages/api/.env': 'A=1\n' } })
  try {
    await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 0)
    assert.match(out, /seed packages\/api\/\.env: exists — skipped/)
    assert.doesNotMatch(out, /seeded /)
  } finally {
    cleanup(env.dir)
  }
})

test('a failing setup exits non-zero and names the step', async () => {
  const env = scaffold({ config: { setup: ['exit 3', 'touch never'] } })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 1)
    assert.match(out, /stopped at step 1 of 2 \(setup: exit 3\)/)
    assert.ok(!fs.existsSync(path.join(env.wt, 'never')))
  } finally {
    cleanup(env.dir)
  }
})

test('--docs runs the seeds and skips setup', async () => {
  const env = scaffold({
    config: { ...SEEDS, setup: ['touch setup-ran'] },
    mainFiles: { 'packages/api/.env': 'A=1\n' },
  })
  try {
    const { code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir, '--docs'])
    assert.strictEqual(code, 0)
    assert.ok(fs.lstatSync(path.join(env.wt, 'packages/api/.env')).isSymbolicLink())
    assert.ok(!fs.existsSync(path.join(env.wt, 'setup-ran')))
  } finally {
    cleanup(env.dir)
  }
})

test('--plan describes the steps, runs nothing, and prints no shell', async () => {
  const env = scaffold({ config: { ...SEEDS, setup: ['touch setup-ran'] }, mainFiles: { 'packages/api/.env': 'A=1\n' } })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir, '--plan'])
    assert.strictEqual(code, 0)
    assert.match(out, /plan — nothing run/)
    assert.match(out, /1\. seed packages\/api\/\.env \(symlink from the primary checkout\)/)
    assert.match(out, /3\. setup: touch setup-ran/)
    assert.doesNotMatch(out, /ln -s|git rev-parse|\$m\//)
    assert.ok(!fs.existsSync(path.join(env.wt, 'packages')))
    assert.ok(!fs.existsSync(path.join(env.wt, 'setup-ran')))
  } finally {
    cleanup(env.dir)
  }
})

test('--json carries each step and its outcome', async () => {
  const env = scaffold({ config: SEEDS, mainFiles: { 'packages/api/.env': 'A=1\n' } })
  try {
    const { out } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir, '--json'])
    const j = JSON.parse(out)
    assert.strictEqual(j.ok, true)
    assert.deepStrictEqual(j.steps.map((s) => [s.file, s.outcome]), [
      ['packages/api/.env', 'seeded'],
      ['apps/web/.env', 'skipped'],
    ])
  } finally {
    cleanup(env.dir)
  }
})

test('stays silent on disk: no worktree is a refusal naming up, and nothing is written', async () => {
  const env = scaffold({ config: SEEDS, worktree: false, mainFiles: { 'packages/api/.env': 'A=1\n' } })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 1)
    assert.match(out, /no worktree at .* — run `skitterspec spec-env up feat-x`/)
    assert.ok(!fs.existsSync(env.wt))
  } finally {
    cleanup(env.dir)
  }
})

test('a docker spec with no slot is refused before anything runs', async () => {
  const env = scaffold({
    config: { ...SEEDS, docker: { enabled: true } },
    stack: 'worktree + docker',
    mainFiles: { 'packages/api/.env': 'A=1\n' },
  })
  try {
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', env.folder, '--dir', env.dir])
    assert.strictEqual(code, 1)
    assert.match(out, /wants a Docker stack and has no slot yet/)
    assert.ok(!fs.existsSync(path.join(env.wt, 'packages')), 'no seed ran')
  } finally {
    cleanup(env.dir)
  }
})

// A `/no-spec` worktree needs the gitignored files as much as a spec's does:
// a `setup` that reads `.env` (a Prisma generate, say) fails without it. What
// it never gets is a stack — the record has no slot, no envFile and no docker.
function speclessEnv(config) {
  const env = scaffold({ config, worktree: false, mainFiles: { 'packages/api/.env': 'A=1\n' } })
  return env
}

async function nospecWorktree(env) {
  await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', env.dir])
  const wt = path.resolve(env.dir, `../${path.basename(env.dir)}-wt`, 'bump-deps')
  fs.mkdirSync(wt, { recursive: true })
  return wt
}

test('specless (/no-spec) work seeds the gitignored files, then runs setup', async () => {
  const env = speclessEnv({ ...SEEDS, setup: ['test -f packages/api/.env && touch setup-ran'] })
  try {
    const wt = await nospecWorktree(env)
    const { out, code } = await runQuiet(['spec-env', 'bootstrap', 'bump-deps', '--dir', env.dir])
    assert.strictEqual(code, 0, out)
    assert.ok(fs.existsSync(path.join(wt, 'packages/api/.env')), 'the seed landed')
    assert.ok(fs.existsSync(path.join(wt, 'setup-ran')), 'setup saw the seeded file')
  } finally {
    cleanup(env.dir)
  }
})

test('specless plan orders seed before setup, with no envFile or docker step', async () => {
  const env = speclessEnv({ ...SEEDS, setup: ['touch setup-ran'], docker: { envFile: '.env' } })
  try {
    await nospecWorktree(env)
    const { out } = await runQuiet(['spec-env', 'bootstrap', 'bump-deps', '--dir', env.dir, '--plan', '--json'])
    assert.deepStrictEqual(JSON.parse(out).steps.map((s) => s.kind), ['seed', 'seed', 'setup'])
  } finally {
    cleanup(env.dir)
  }
})

test('specless --docs seeds and skips setup, as a spec does', async () => {
  const env = speclessEnv({ ...SEEDS, setup: ['touch setup-ran'] })
  try {
    await nospecWorktree(env)
    const { out } = await runQuiet(['spec-env', 'bootstrap', 'bump-deps', '--dir', env.dir, '--docs', '--plan', '--json'])
    assert.deepStrictEqual(JSON.parse(out).steps.map((s) => s.kind), ['seed', 'seed'])
  } finally {
    cleanup(env.dir)
  }
})

test('stays silent: specless with no seedFiles plans exactly its setup', async () => {
  const env = speclessEnv({ setup: ['touch a', 'touch b'] })
  try {
    await nospecWorktree(env)
    const { out } = await runQuiet(['spec-env', 'bootstrap', 'bump-deps', '--dir', env.dir, '--plan', '--json'])
    assert.deepStrictEqual(
      JSON.parse(out).steps.map((s) => [s.kind, s.command]),
      [['setup', 'touch a'], ['setup', 'touch b']],
    )
  } finally {
    cleanup(env.dir)
  }
})

test('the invocation a skill types names no secret-shaped path', () => {
  // A name-matching secrets hook refuses any Bash call naming `.env`; the whole
  // point of the verb is that its command line gives one nothing to match.
  const cmd = 'skitterspec spec-env bootstrap feat-x --docs'
  assert.doesNotMatch(cmd, /(^|[\s/'"])[^\s]*\.env\b/)
})
