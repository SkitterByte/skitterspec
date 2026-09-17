'use strict'

/**
 * `spec-env up <spec> --docs` at the CLI level.
 *
 * The planner's own behaviour is pinned in `env-provision-docs.test.js`. What
 * is only visible here is the half the CLI owns: the reported line, and the
 * re-run signal — which documents mode is what forced into being correct.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { run } = require('../src/cli.js')

function scaffold(slug = 'x', configExtra = {}, stack = 'worktree') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-updocs-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify(
      { worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, ...configExtra },
      null,
      2,
    ),
  )
  const spec = path.join(dir, 'specs', 'backlog', `feat-${slug}`)
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(
    path.join(spec, '00-overview.md'),
    `# X\n\n> **Type:** Feature\n> **Stack:** ${stack}\n`,
  )
  const worktree = path.resolve(dir, `../${path.basename(dir)}-wt`, slug)
  return { dir, folder: `feat-${slug}`, worktree }
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

const SETUP = { setup: ['pnpm install --frozen-lockfile'] }

test('--docs reports documents mode and prints no worktree setup step', async () => {
  const { dir, folder } = scaffold('a', SETUP)
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir, '--docs'])
    assert.match(out, /docs:\s+documents only/, 'says which mode it is, positively')
    assert.doesNotMatch(out, /then, in the worktree, run:/, 'no setup step')
    assert.doesNotMatch(out, /pnpm install/, 'and no install command anywhere')
    assert.match(out, /to provision, run:/, 'but still a worktree to create')
  } finally {
    cleanup(dir)
  }
})

test('the same spec without --docs keeps its setup step and says nothing about docs', async () => {
  const { dir, folder } = scaffold('b', SETUP)
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /then, in the worktree, run:/)
    assert.match(out, /pnpm install --frozen-lockfile/)
    assert.doesNotMatch(out, /docs:/, 'no line about a mode nobody asked for')
  } finally {
    cleanup(dir)
  }
})

/**
 * THE RE-RUN SIGNAL, and the defect documents mode would otherwise have created.
 *
 * Slot allocation is Docker-only, so a Docker spec's re-run used to be detected
 * by its slot being in the registry. Provision that spec with `--docs` and no
 * slot is allocated — so the next `up` without the flag would find an empty
 * registry, conclude "fresh", and plan `git worktree add -b <branch>` over a
 * worktree and branch that both already exist. That plan cannot run.
 */
test('a docker spec provisioned with --docs re-runs as an attach, not a re-fork', async () => {
  const { dir, folder, worktree } = scaffold(
    'c',
    { docker: { enabled: true, portBase: 3000, portsPerSpec: 10 }, ...SETUP },
    'worktree + docker',
  )
  try {
    const docsOut = await runQuiet(['spec-env', 'up', folder, '--dir', dir, '--docs'])
    assert.match(docsOut, /worktree-only \(no docker/, 'docs mode brought no stack up')

    // What the printed command would have created, had it been run.
    fs.mkdirSync(worktree, { recursive: true })

    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /will attach/, 'recognised the existing worktree')
    assert.doesNotMatch(out, /worktree add \S+ -b /, 'did not plan a second fork')
    assert.match(out, /pnpm install --frozen-lockfile/, 'and now runs the deferred setup')
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT: the worktree-only path had this signal all along, and must be
// unchanged by the line that strengthened the Docker one.
test('a worktree-only spec still attaches on an existing worktree', async () => {
  const { dir, folder, worktree } = scaffold('d', SETUP)
  try {
    await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    fs.mkdirSync(worktree, { recursive: true })
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /will attach/)
    assert.doesNotMatch(out, /worktree add \S+ -b /)
  } finally {
    cleanup(dir)
  }
})

// STAYS-SILENT: a fresh docker spec, never touched by --docs, is unaffected.
test('a fresh docker spec still allocates its slot and brings the stack up', async () => {
  const { dir, folder } = scaffold(
    'e',
    { docker: { enabled: true, portBase: 3000, portsPerSpec: 10 }, ...SETUP },
    'worktree + docker',
  )
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /slot:\s+0\s+\(ports 3000-3009\)/)
    assert.match(out, /docker compose --project-name \S+ up -d/)
    assert.doesNotMatch(out, /docs:/)
  } finally {
    cleanup(dir)
  }
})
