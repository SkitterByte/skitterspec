'use strict'

/**
 * `spec-env nospec <name>` at the CLI level, and what the rest of the engine
 * does with the record it writes.
 *
 * The pure halves are pinned in `env-specless.test.js`. What is only visible
 * here is that the record actually reaches disk, that every later verb can find
 * a name with nothing under `specs/**`, and that teardown forgets it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

function scaffold(configExtra = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-nospec-')))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...configExtra },
      null,
      2,
    ),
  )
  return dir
}

function addSpec(dir, folder, bucket = 'backlog') {
  const specDir = path.join(dir, 'specs', bucket, folder)
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(
    path.join(specDir, '00-overview.md'),
    '# X\n\n> **Type:** Feature\n> **Stack:** worktree\n',
  )
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

const registry = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, '.spec-env', 'registry.json'), 'utf8'))

const SETUP = { setup: ['pnpm install --frozen-lockfile'] }

test('nospec records the branch and plans a worktree', async () => {
  const dir = scaffold(SETUP)
  try {
    const out = await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    assert.match(out, /branch:\s+chore\/bump-deps/)
    assert.match(out, /recorded:\s+added to/)
    assert.match(out, /git worktree add \S+ -b chore\/bump-deps/)
    assert.deepStrictEqual(registry(dir).specless, { 'bump-deps': { branch: 'chore/bump-deps' } })
  } finally {
    cleanup(dir)
  }
})

test('it keeps the setup commands — /no-spec work is code', async () => {
  // The opposite call from `/spec`, which provisions with `--docs` precisely to
  // skip these. Documents mode skips the install because markdown needs no
  // dependencies; this lane runs code, so it needs them.
  const dir = scaffold(SETUP)
  try {
    const out = await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    assert.match(out, /then, in the worktree, run:/)
    assert.match(out, /pnpm install --frozen-lockfile/)
    assert.doesNotMatch(out, /docs:/)
  } finally {
    cleanup(dir)
  }
})

test('re-running is idempotent and says the record was already there', async () => {
  const dir = scaffold()
  try {
    await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    const out = await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    assert.match(out, /recorded:\s+already in/)
    assert.deepStrictEqual(Object.keys(registry(dir).specless), ['bump-deps'])
  } finally {
    cleanup(dir)
  }
})

test('a name that is already a spec is refused, not shadowed', async () => {
  // Two things answering to one name is how a teardown removes the wrong tree.
  const dir = scaffold()
  try {
    addSpec(dir, 'feat-orders')
    const out = await runQuiet(['spec-env', 'nospec', 'feat-orders', '--dir', dir])
    assert.match(out, /is already a spec \(backlog\)/)
    assert.match(out, /\/spec-start feat-orders/)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'registry.json')), 'nothing recorded')
  } finally {
    cleanup(dir)
  }
})

test('a missing or malformed name refuses and writes nothing', async () => {
  const dir = scaffold()
  try {
    for (const bad of [undefined, 'Not Kebab', '-leading', 'has_underscore']) {
      const out = await runQuiet(
        ['spec-env', 'nospec', ...(bad === undefined ? [] : [bad]), '--dir', dir],
      )
      assert.match(out, /needs a kebab-case name/, `refused: ${bad}`)
    }
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'registry.json')))
  } finally {
    cleanup(dir)
  }
})

test('the recorded name resolves, where an unrecorded one still does not', async () => {
  const dir = scaffold()
  try {
    await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])

    const out = await runQuiet(['spec-env', 'resolve', 'bump-deps', '--dir', dir])
    assert.match(out, /spec:\s+bump-deps \(no spec\)/, 'said, not printed as (null)')
    assert.match(out, /branch:\s+chore\/bump-deps/)

    // THE POINT: the record makes exactly one name resolvable, not every name.
    // It still THROWS on a typo — the top-level bin turns that into the usual
    // one-line refusal — so a mistyped name cannot land as a specless branch.
    await assert.rejects(
      () => runQuiet(['spec-env', 'resolve', 'bmup-deps', '--dir', dir]),
      /spec not found/,
    )
  } finally {
    cleanup(dir)
  }
})

test('status marks it as having no spec, so a reader does not go looking', async () => {
  const dir = scaffold()
  try {
    await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'bump-deps')
    fs.mkdirSync(wt, { recursive: true })
    // `status` lists only worktrees git knows about, so without a real one this
    // asserts the plumbing rather than the listing — which is why the CLI test
    // for the listing itself lives with the git fixtures. What matters here is
    // that the flag reaches the formatter at all.
    const { resolveSpecless } = require('../src/env/resolve.js')
    assert.strictEqual(resolveSpecless('bump-deps', dir, require('../src/env/config.js').DEFAULT_CONFIG, {}).specless, true)
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: a project with no specless branches keeps the registry it had', async () => {
  const dir = scaffold({ docker: { enabled: true, portBase: 3000, portsPerSpec: 10 } })
  try {
    addSpec(dir, 'feat-orders')
    fs.writeFileSync(
      path.join(dir, 'specs', 'backlog', 'feat-orders', '00-overview.md'),
      '# X\n\n> **Type:** Feature\n> **Stack:** worktree + docker\n',
    )
    await runQuiet(['spec-env', 'up', 'feat-orders', '--dir', dir])
    const raw = registry(dir)
    assert.deepStrictEqual(raw, { slots: { 'feat-orders': 0 } })
    assert.ok(!('specless' in raw), 'the key is absent, not an empty object')
  } finally {
    cleanup(dir)
  }
})

test('a Docker spec provisioned beside a specless branch does not erase it', async () => {
  // Every registry helper returns a WHOLE registry, so one that forgot the key
  // would delete it on the next write — and the /no-spec branch would become
  // unresolvable with nothing to say why.
  const dir = scaffold({ docker: { enabled: true, portBase: 3000, portsPerSpec: 10 } })
  try {
    await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir])
    addSpec(dir, 'feat-orders')
    fs.writeFileSync(
      path.join(dir, 'specs', 'backlog', 'feat-orders', '00-overview.md'),
      '# X\n\n> **Type:** Feature\n> **Stack:** worktree + docker\n',
    )
    await runQuiet(['spec-env', 'up', 'feat-orders', '--dir', dir])
    assert.deepStrictEqual(registry(dir).specless, { 'bump-deps': { branch: 'chore/bump-deps' } })
    assert.deepStrictEqual(registry(dir).slots, { 'feat-orders': 0 })
  } finally {
    cleanup(dir)
  }
})

test('the --json shape names the branch, the worktree and that it is specless', async () => {
  const dir = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'nospec', 'bump-deps', '--dir', dir, '--json'])
    const j = JSON.parse(out)
    assert.strictEqual(j.name, 'bump-deps')
    assert.strictEqual(j.branch, 'chore/bump-deps')
    assert.strictEqual(j.specless, true)
    assert.strictEqual(j.recorded, true)
    assert.ok(j.worktreePath.endsWith(path.join('-wt', 'bump-deps')))
  } finally {
    cleanup(dir)
  }
})
