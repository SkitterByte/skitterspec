'use strict'

// A git fixture repo whose skitterspec project may sit in a SUBFOLDER of the
// git root — the layout `feat-subfolder-project` supports.
//
// `SKITTERSPEC_TEST_PREFIX` (set by `pnpm test:nested`) nests every project this
// helper builds under that folder, beside a non-project sibling (`Sql/`), so a
// test written against `dir` runs unchanged in both layouts. Unset, the project
// IS the repo and nothing differs from a hand-built fixture.
//
// `dir` is the project folder — where `specs/` lives and commands are run from.
// `root` is the git root — where worktrees are laid out beside. Under prefix ''
// they are the same path.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function nestedPrefix() {
  return (process.env.SKITTERSPEC_TEST_PREFIX || '').replace(/^\/+|\/+$/g, '')
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

/**
 * Build a committed repo on `main` with `specs/.core/env.config.json` holding
 * `config` (pass `null` for no isolation config), plus `files` (project-relative
 * path → content). Returns `{ root, dir, prefix, git, commit, worktreeFor,
 * cleanup }`.
 */
function makeRepo({ name = 'skitterspec-', prefix = nestedPrefix(), config = {}, files = {} } = {}) {
  // Nested, the root's name carries a space as the adopter's did (`LSC App`),
  // so quoting is exercised wherever a path reaches a shell.
  const base = prefix ? `${name}nested app-` : name
  // `.native` expands a Windows 8.3 short name (`RUNNER~1`) the way git does.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), base)))
  const dir = prefix ? path.join(root, ...prefix.split('/')) : root
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  if (config !== null) {
    fs.writeFileSync(path.join(dir, 'specs', '.core', 'env.config.json'), JSON.stringify(config, null, 2))
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n')
  // The sibling a nested project lives beside: code that is NOT the project's.
  if (prefix) {
    fs.mkdirSync(path.join(root, 'Sql'), { recursive: true })
    fs.writeFileSync(path.join(root, 'Sql', 'schema.sql'), '-- schema\n')
  }
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'init')

  const wtRoot = path.resolve(root, `../${path.basename(root)}-wt`)
  const repo = {
    root,
    dir,
    prefix,
    git: (...args) => git(root, ...args),
    commit(message = 'change') {
      git(root, 'add', '-A')
      git(root, 'commit', '-q', '-m', message)
    },
    // Where the default `../{repo}-wt/{slug}` layout puts a spec's worktree,
    // and the project folder inside it.
    worktreeFor(slug) {
      const wt = path.join(wtRoot, slug)
      return { wt, project: prefix ? path.join(wt, ...prefix.split('/')) : wt }
    },
    cleanup() {
      try {
        git(root, 'worktree', 'prune')
      } catch {}
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(wtRoot, { recursive: true, force: true })
      byDir.delete(dir)
    },
    // Add a worktree for `folder` on `feat/<slug>` at the default layout, and
    // return the project folder inside it — where a session would stand.
    addWorktree(folder) {
      const slug = folder.replace(/^(feat|bug|hotfix|chore|issue|incident)-/, '')
      const { wt, project } = repo.worktreeFor(slug)
      git(root, 'worktree', 'add', '-q', '-b', `feat/${slug}`, wt)
      return project
    },
  }
  byDir.set(dir, repo)
  return repo
}

// Tests written as `scaffold() → dir` keep that shape: the repo a project
// folder belongs to is looked up rather than threaded through every helper.
const byDir = new Map()

function repoFor(dir) {
  const repo = byDir.get(dir)
  if (!repo) throw new Error(`not a makeRepo project folder: ${dir}`)
  return repo
}

module.exports = { makeRepo, repoFor, nestedPrefix, git }
