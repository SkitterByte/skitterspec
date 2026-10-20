'use strict'

/**
 * `runBootstrap` against a real temp directory, with a fake spawn.
 *
 * The filesystem steps — seeds and the env file — are run for real, because
 * their edge cases ARE the filesystem: a dangling link, a file with no trailing
 * newline, a seeded env file that is the primary checkout's own. The spawned
 * steps get a recorder instead, so nothing here needs docker or an installer.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runBootstrap, describeStep } = require('../src/env/bootstrap.js')
const { worktreeSteps } = require('../src/env/provision.js')

function scaffold(mainFiles = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-boot-'))
  const main = path.join(root, 'main')
  const wt = path.join(root, 'wt')
  fs.mkdirSync(main)
  fs.mkdirSync(wt)
  for (const [rel, content] of Object.entries(mainFiles)) {
    fs.mkdirSync(path.dirname(path.join(main, rel)), { recursive: true })
    fs.writeFileSync(path.join(main, rel), content)
  }
  return { root, main, wt }
}

// A spawn that records what it was asked to run and exits with `status`.
function recorder(statusFor = () => 0) {
  const calls = []
  const spawn = (cmd, argsOrOpts, maybeOpts) => {
    const args = Array.isArray(argsOrOpts) ? argsOrOpts : null
    const opts = args ? maybeOpts : argsOrOpts
    const call = { cmd, args, cwd: opts.cwd, shell: opts.shell === true }
    calls.push(call)
    return { status: statusFor(call), error: null, signal: null }
  }
  return { calls, spawn }
}

function run(steps, env, spawn) {
  const lines = []
  const result = runBootstrap(steps, {
    cwd: env.wt,
    mainRoot: env.main,
    spawn,
    write: (l) => lines.push(l),
  })
  return { ...result, lines }
}

const SPEC = { worktreePath: '/wt', slug: 'x', branch: 'feat/x', projectName: 'repo_x' }
const DOCKER_CONFIG = {
  seedFiles: { mode: 'symlink', files: ['packages/api/.env', 'apps/web/.env'] },
  setup: ['pnpm install --frozen-lockfile'],
  docker: { enabled: true, envFile: '.worktree.env', composeFile: 'docker-compose.yml' },
}

test('worktreeSteps: seeds, then the env file, then setup, then the stack', () => {
  const steps = worktreeSteps(SPEC, 3010, DOCKER_CONFIG, {
    wantsDocker: true,
    composeFilePresent: true,
  })
  assert.deepStrictEqual(
    steps.map((s) => s.kind),
    ['seed', 'seed', 'envFile', 'setup', 'docker'],
  )
  assert.deepStrictEqual(steps[2], {
    kind: 'envFile',
    file: '.worktree.env',
    projectName: 'repo_x',
    offset: 3010,
  })
  assert.deepStrictEqual(steps[4].argv, [
    'docker', 'compose', '-f', 'docker-compose.yml', '--env-file', '.worktree.env',
    '--project-name', 'repo_x', 'up', '-d',
  ])
})

test('worktreeSteps: --docs keeps the seeds and drops setup', () => {
  const steps = worktreeSteps(SPEC, null, DOCKER_CONFIG, { docs: true, wantsDocker: false })
  assert.deepStrictEqual(steps.map((s) => s.kind), ['seed', 'seed'])
})

test('a fresh worktree gets its seeds, env file, setup and stack from one call', () => {
  const env = scaffold({ 'packages/api/.env': 'A=1\n', 'apps/web/.env': 'B=2\n' })
  const steps = worktreeSteps({ ...SPEC, worktreePath: env.wt }, 3010, DOCKER_CONFIG, {
    wantsDocker: true,
    composeFilePresent: true,
  })
  const { calls, spawn } = recorder()
  const r = run(steps, env, spawn)

  assert.strictEqual(r.ok, true)
  for (const f of ['packages/api/.env', 'apps/web/.env']) {
    const dst = path.join(env.wt, f)
    assert.ok(fs.lstatSync(dst).isSymbolicLink(), `${f} is linked`)
    assert.strictEqual(fs.realpathSync(dst), fs.realpathSync(path.join(env.main, f)))
  }
  assert.strictEqual(
    fs.readFileSync(path.join(env.wt, '.worktree.env'), 'utf8'),
    'COMPOSE_PROJECT_NAME=repo_x\nPORT_OFFSET=3010\n',
  )
  assert.deepStrictEqual(
    calls.map((c) => [c.cmd, c.shell, c.cwd]),
    [
      ['pnpm install --frozen-lockfile', true, env.wt],
      ['docker', false, env.wt],
    ],
  )
  assert.match(r.lines.join('\n'), /seeded packages\/api\/\.env →/)
  assert.match(r.lines.join('\n'), /env file \.worktree\.env: ready/)
})

test('running it again writes nothing and skips every seed', () => {
  const env = scaffold({ '.env': 'A=1\n' })
  const steps = [
    { kind: 'seed', file: '.env', mode: 'copy' },
    { kind: 'envFile', file: '.worktree.env', projectName: 'p', offset: 3000 },
  ]
  run(steps, env, recorder().spawn)
  const envPath = path.join(env.wt, '.worktree.env')
  const before = fs.statSync(envPath).mtimeMs
  const copyBefore = fs.statSync(path.join(env.wt, '.env')).mtimeMs

  const again = run(steps, env, recorder().spawn)
  assert.strictEqual(again.ok, true)
  assert.deepStrictEqual(again.results.map((x) => x.outcome), ['skipped', 'skipped'])
  assert.match(again.lines[0], /seed \.env: exists — skipped/)
  assert.strictEqual(fs.statSync(envPath).mtimeMs, before, 'env file not rewritten')
  assert.strictEqual(fs.statSync(path.join(env.wt, '.env')).mtimeMs, copyBefore)
})

test('a seed missing from the primary checkout is skipped and the run carries on', () => {
  const env = scaffold({})
  const { calls, spawn } = recorder()
  const r = run(
    [
      { kind: 'seed', file: 'apps/web/.env', mode: 'symlink' },
      { kind: 'setup', command: 'true' },
    ],
    env,
    spawn,
  )
  assert.strictEqual(r.ok, true)
  assert.match(r.lines[0], /seed apps\/web\/\.env: not in main — skipped/)
  assert.strictEqual(fs.existsSync(path.join(env.wt, 'apps')), false, 'no directory made')
  assert.strictEqual(calls.length, 1, 'setup still ran')
})

test('an existing target, even a dangling link, is left alone', () => {
  const env = scaffold({ '.env': 'A=1\n' })
  fs.symlinkSync(path.join(env.root, 'nowhere'), path.join(env.wt, '.env'))
  const r = run([{ kind: 'seed', file: '.env', mode: 'symlink' }], env, recorder().spawn)
  assert.strictEqual(r.results[0].outcome, 'skipped')
  assert.strictEqual(fs.readlinkSync(path.join(env.wt, '.env')), path.join(env.root, 'nowhere'))
})

test('a symlinked env file is refused, nothing is appended, and nothing after it runs', () => {
  const env = scaffold({ '.env': 'MAIN=1\n' })
  fs.symlinkSync(path.join(env.main, '.env'), path.join(env.wt, '.env'))
  const { calls, spawn } = recorder()
  const r = run(
    [
      { kind: 'envFile', file: '.env', projectName: 'p', offset: 3000 },
      { kind: 'setup', command: 'true' },
    ],
    env,
    spawn,
  )
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 1)
  assert.strictEqual(r.results[0].outcome, 'refused')
  assert.match(r.results[0].line, /is a symlink — docker\.envFile must name a file of its own/)
  assert.strictEqual(fs.readFileSync(path.join(env.main, '.env'), 'utf8'), 'MAIN=1\n')
  assert.strictEqual(calls.length, 0)
})

test('the env file keeps values setup wrote, and fixes a missing trailing newline', () => {
  const env = scaffold({})
  fs.writeFileSync(path.join(env.wt, '.env'), 'PORT_OFFSET=4200')
  run([{ kind: 'envFile', file: '.env', projectName: 'p', offset: 3000 }], env, recorder().spawn)
  assert.strictEqual(
    fs.readFileSync(path.join(env.wt, '.env'), 'utf8'),
    'PORT_OFFSET=4200\nCOMPOSE_PROJECT_NAME=p\n',
  )
})

test('a failing setup stops before the stack and names the step', () => {
  const env = scaffold({})
  const { calls, spawn } = recorder((c) => (c.shell ? 2 : 0))
  const r = run(
    [
      { kind: 'setup', command: 'pnpm install' },
      { kind: 'docker', argv: ['docker', 'compose', 'up', '-d'] },
    ],
    env,
    spawn,
  )
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.failedAt, 1)
  assert.match(r.results[0].line, /setup: pnpm install — exit 2/)
  assert.strictEqual(calls.length, 1, 'docker never ran')
})

test('describeStep says what each step is without shell', () => {
  assert.strictEqual(
    describeStep({ kind: 'seed', file: '.env', mode: 'symlink' }),
    'seed .env (symlink from the primary checkout)',
  )
  assert.doesNotMatch(describeStep({ kind: 'envFile', file: '.env', projectName: 'p', offset: 1 }), /grep|>>|touch/)
})
