'use strict'

/**
 * `spec-env up <name> --docs --from <ref>` — the authoring lane, forked from
 * somewhere other than the base branch.
 *
 * WHY THE LANE NEEDED THIS AT ALL. `/spec-hotfix` builds its worktree from a
 * **release tag**, and the engine learns that tag from the spec's own
 * `> **Base version:**` header. In the authoring lane the spec does not exist
 * yet: `resolveSpecless` carries no `baseRef`, so `planUp`'s fork point is
 * empty and the branch forks from base HEAD. A hotfix authored that way is
 * written against `main`'s code while every later step — the tag, the
 * cherry-pick — still believes it is on the release line. The failure is
 * silent, which is what makes it worse than the refused write it would replace.
 *
 * So the tag reaches the engine on the command line, once, and the spec written
 * in that tree records the same tag where every later verb already reads it.
 *
 * THE REFUSALS ARE POSITIVE-SIGNAL ONLY (`.claude/rules/negative-checks.md`).
 * An unknown ref is refused because git said so; a repo git could not read at
 * all passes the ref straight through, because `git worktree add` will refuse
 * it far more loudly than a planner guessing from an absence.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
}

function writeConfig(dir) {
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' } }, null, 2),
  )
}

// A real checkout with a real tag on it — the fork point has to be something
// git can actually be asked about.
function scaffoldRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-upfrom-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  writeConfig(dir)
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'released\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'release')
  git(dir, 'branch', '-M', 'main')
  git(dir, 'tag', 'v1.0.0')
  // Something after the tag, so forking from the tag and forking from HEAD are
  // distinguishable rather than accidentally the same commit.
  fs.writeFileSync(path.join(dir, 'app.js'), 'main moved on\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'later')
  return dir
}

// No git at all — the cannot-tell case.
function scaffoldBare() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-upfrom-')))
  writeConfig(dir)
  return dir
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

// --- it forks from the named ref --------------------------------------------

test('--from puts the ref on the fork, so the worktree is the released line', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet([
      'spec-env', 'up', 'hotfix-null-total', '--dir', dir, '--docs', '--from', 'v1.0.0',
    ])
    assert.match(
      out,
      /git worktree add \S+-wt\/null-total -b hotfix\/null-total v1\.0\.0/,
      'the tag is the fork point of the printed plan',
    )
    assert.match(out, /fork:\s+v1\.0\.0/, 'and the plan says so in its own right')
  } finally {
    cleanup(dir)
  }
})

test('without --from the same command forks from base, unchanged', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet(['spec-env', 'up', 'hotfix-null-total', '--dir', dir, '--docs'])
    assert.match(out, /git worktree add \S+-wt\/null-total -b hotfix\/null-total\n/)
    assert.doesNotMatch(out, /fork:/, 'no fork line where nothing was named')
  } finally {
    cleanup(dir)
  }
})

// --- the flagless re-run both test-first skills depend on --------------------

test('the flagless re-run over an authoring worktree plans the setup commands', async () => {
  // Both `/spec-bug` and `/spec-hotfix` run `up --docs` and then `up` again,
  // because `--docs` skips `setup` and neither has a `/spec-start` to defer it
  // to. The re-run happens BEFORE the spec document is written, so it leans
  // entirely on the registry record the authoring lane left behind.
  const dir = scaffoldRepo()
  try {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify(
        {
          worktree: { root: '../{repo}-wt', folderPattern: '{slug}' },
          setup: ['pnpm install --frozen-lockfile'],
        },
        null,
        2,
      ),
    )
    await runQuiet(['spec-env', 'up', 'bug-null-total', '--dir', dir, '--docs'])
    execFileSync('git', ['-C', dir, 'worktree', 'add', '-q',
      path.resolve(dir, `../${path.basename(dir)}-wt/null-total`), '-b', 'bug/null-total'])

    const out = await runQuiet(['spec-env', 'up', 'bug-null-total', '--dir', dir])
    assert.match(out, /will attach/, 'the existing worktree is re-attached, never re-forked')
    assert.doesNotMatch(out, /-b bug\/null-total/, 'no second fork of a branch that exists')
    assert.match(out, /then, in the worktree, run:/, 'the setup step the flag deferred')
    assert.match(out, /pnpm install --frozen-lockfile/)
  } finally {
    cleanup(dir)
  }
})

// --- and it refuses where it could not be honoured ---------------------------

test('a ref git does not know refuses, names it, and plans nothing', async () => {
  const dir = scaffoldRepo()
  try {
    const out = await runQuiet([
      'spec-env', 'up', 'hotfix-null-total', '--dir', dir, '--docs', '--from', 'v9.9.9',
    ])
    assert.match(out, /v9\.9\.9/, 'names the ref it could not resolve')
    assert.doesNotMatch(out, /to provision, run:/, 'no plan to run')
    assert.doesNotMatch(out, /git worktree add/, 'and nothing to copy out of it by accident')
  } finally {
    cleanup(dir)
  }
})

test('--from on a spec that already exists refuses rather than being ignored', async () => {
  const dir = scaffoldRepo()
  try {
    fs.mkdirSync(path.join(dir, 'specs', 'in-progress', 'hotfix-null-total'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', 'in-progress', 'hotfix-null-total', '00-overview.md'),
      '# Bug\n\n> **Type:** Hotfix\n> **Base version:** v1.0.0\n',
    )
    const out = await runQuiet([
      'spec-env', 'up', 'hotfix-null-total', '--dir', dir, '--docs', '--from', 'v1.0.0',
    ])
    assert.match(out, /--from/, 'the refusal is about the flag')
    assert.match(out, /Base version/i, 'and points at what owns the fork point instead')
    assert.doesNotMatch(out, /to provision, run:/, 'nothing planned on a flag it cannot honour')
  } finally {
    cleanup(dir)
  }
})

// ---------------------------------------------------------------------------
// STAYS SILENT — `.claude/rules/negative-checks.md` rules 1 and 4. The refusal
// above is an accusation, so the case where the lookup is blind must be proved
// not to fire it.
// ---------------------------------------------------------------------------

test('STAYS SILENT: a tree git cannot read passes the ref through, and accuses nobody', async () => {
  const dir = scaffoldBare()
  try {
    const out = await runQuiet([
      'spec-env', 'up', 'hotfix-null-total', '--dir', dir, '--docs', '--from', 'v1.0.0',
    ])
    assert.match(out, /git worktree add \S+-wt\/null-total -b hotfix\/null-total v1\.0\.0/)
    assert.doesNotMatch(out, /could not resolve/i, 'an absence of git is not an absence of the ref')
  } finally {
    cleanup(dir)
  }
})
