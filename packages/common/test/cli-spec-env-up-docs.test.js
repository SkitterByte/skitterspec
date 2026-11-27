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
    assert.doesNotMatch(out, /spec-env bootstrap/, 'nothing to bootstrap without seeds')
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
    assert.match(out, /then, run:\n\s+skitterspec spec-env bootstrap feat-b\n/)
    assert.doesNotMatch(out, /docs:/, 'no line about a mode nobody asked for')
  } finally {
    cleanup(dir)
  }
})

/**
 * THE RE-RUN SIGNAL: a worktree on disk. A legacy docker spec once carried a
 * second signal (its registry slot), and `--docs` allocated none — so the next
 * `up` would plan `git worktree add -b` over a worktree that already existed.
 * The worktree is now the only signal, for every spec.
 */
test('a legacy docker spec provisioned with --docs re-runs as an attach, not a re-fork', async () => {
  const { dir, folder, worktree } = scaffold(
    'c',
    { docker: { enabled: true, portBase: 3000, portsPerSpec: 10 }, ...SETUP },
    'worktree + docker',
  )
  try {
    const docsOut = await runQuiet(['spec-env', 'up', folder, '--dir', dir, '--docs'])
    assert.match(docsOut, /stack:\s+worktree\n/, 'docs mode brought no stack up')
    assert.match(docsOut, /Stack: worktree \+ docker is ignored/, 'and said why, once')

    // What the printed command would have created, had it been run.
    fs.mkdirSync(worktree, { recursive: true })

    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.match(out, /will attach/, 'recognised the existing worktree')
    assert.doesNotMatch(out, /worktree add \S+ -b /, 'did not plan a second fork')
    assert.match(out, /spec-env bootstrap feat-c\n/, 'and now hands off the deferred setup')
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

// Per-spec Docker stacks were removed (feat-drop-docker-stacks): a fresh spec
// headed for one gets no slot, no stack and a one-line note.
test('a fresh legacy docker spec gets no slot or stack, and a note saying so', async () => {
  const { dir, folder } = scaffold(
    'e',
    { docker: { enabled: true, portBase: 3000, portsPerSpec: 10 }, ...SETUP },
    'worktree + docker',
  )
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.doesNotMatch(out, /slot:|docker compose|project:/)
    assert.strictEqual((out.match(/Stack: worktree \+ docker is ignored/g) || []).length, 1)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'registry.json')), 'no slot allocated')
  } finally {
    cleanup(dir)
  }
})

test('STAYS SILENT: a worktree-header spec gets no Docker note', async () => {
  const { dir, folder } = scaffold('f', SETUP)
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.doesNotMatch(out, /note:|Docker/)
  } finally {
    cleanup(dir)
  }
})

// bug-compose-before-env: compose is the LAST worktree step, never a
// primary-checkout command. The order itself is `worktreeSteps`' (pinned in
// env-provision.test.js); what `up` owes is that it runs none of it and prints
// none of it as shell — only the hand-off to `bootstrap`.
test('a docker spec plans its stack in bootstrap, never from the primary checkout', async () => {
  const { dir, folder } = scaffold(
    'f',
    {
      docker: { enabled: true, portBase: 3000, portsPerSpec: 10, envFile: '.worktree.env' },
      seedFiles: ['.env'],
      ...SETUP,
    },
    'worktree + docker',
  )
  try {
    const out = await runQuiet(['spec-env', 'up', folder, '--dir', dir])
    assert.doesNotMatch(out, /docker compose/, 'nothing brings a stack up from the plan')
    assert.doesNotMatch(out, /\.worktree\.env|ln -s|git rev-parse/, 'no env-file shell to copy')
    assert.match(out, /then, run:\n\s+skitterspec spec-env bootstrap feat-f\n/)
  } finally {
    cleanup(dir)
  }
})
