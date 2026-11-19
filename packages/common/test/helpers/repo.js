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
      // RETRIED, because Windows releases a killed process's handles late: a
      // dev server `taskkill`ed a moment ago can still hold its cwd, and the
      // rm fails EPERM on a tree that is free a few hundred ms later.
      //
      // And on Windows a tree still held once the retries run out is LEFT, not
      // thrown: under full-suite load on CI the handle outlived ~5s of backoff
      // while the same test passed every isolated run. What a dev test asserts
      // is that the process died, and it probes that itself; a leftover temp
      // tree on an ephemeral runner is not that failure. Elsewhere a lock this
      // long means something really is alive, so it still throws.
      const rm = { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }
      for (const tree of [root, wtRoot]) {
        try {
          fs.rmSync(tree, rm)
        } catch (err) {
          if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes(err.code)) throw err
        }
      }
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

/**
 * Build a fixture once, and hand every test its own copy
 * (chore-fast-windows-suite).
 *
 * `build(root, ...args)` runs ONCE per distinct `args` into a template under
 * the temp dir. Each call then copies that template, and its
 * `../<name>-wt` worktree folder if `build` made one, to a fresh temp root and
 * returns the new root. A test still gets a repo of its own, while the dozen
 * `git` processes that built it run once per file instead of once per test.
 * On Windows each one costs about 200 ms.
 *
 * Worktrees and remotes survive the copy, as long as they live under `root`
 * or its `-wt` folder: every file where git keeps an absolute path is
 * re-pointed at the copy (see `repoint`).
 *
 * WHAT WOULD FOOL THIS: anything `build` creates OUTSIDE `root` and its `-wt`
 * folder, such as a bare remote in another temp dir. Every copy would share
 * that one remote, and a test that pushes would leak into the next. Such a
 * scaffold keeps building its remote per test, after the copy.
 */
function fixture(name, build) {
  const templates = new Map()
  const wtOf = (root) => path.resolve(root, `../${path.basename(root)}-wt`)
  process.once('exit', () => {
    for (const tpl of templates.values()) {
      for (const tree of [tpl, wtOf(tpl)]) {
        try {
          fs.rmSync(tree, { recursive: true, force: true })
        } catch {}
      }
    }
  })
  return function copy(...args) {
    const key = JSON.stringify(args)
    if (!templates.has(key)) {
      const tpl = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), name)))
      build(tpl, ...args)
      templates.set(key, tpl)
    }
    const tpl = templates.get(key)
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), name)))
    fs.cpSync(tpl, root, { recursive: true, verbatimSymlinks: true })
    const roots = [root]
    const tpls = [tpl]
    if (fs.existsSync(wtOf(tpl))) {
      fs.cpSync(wtOf(tpl), wtOf(root), { recursive: true, verbatimSymlinks: true })
      roots.push(wtOf(root))
      tpls.push(wtOf(tpl))
    }
    repoint(roots, tpls)
    return root
  }
}

// Swap the template's paths for the copy's wherever git keeps an absolute
// path: a worktree's `.git` file, each git dir's `config` (a remote that is a
// folder beside the repo) and `worktrees/*/gitdir`. git writes these with
// forward slashes on Windows, so both spellings are replaced.
function repoint(roots, tpls) {
  const pairs = []
  roots.forEach((root, i) => {
    pairs.push([tpls[i], root], [tpls[i].split(path.sep).join('/'), root.split(path.sep).join('/')])
  })
  const swap = (file) => {
    const before = fs.readFileSync(file, 'utf8')
    let text = before
    for (const [from, to] of pairs) text = text.split(from).join(to)
    if (text !== before) fs.writeFileSync(file, text)
  }
  // A git dir is a `.git` folder or a bare repo (`*.git`); a `.git` FILE is a
  // worktree's link. Not entered: node_modules, and anything inside a git dir
  // beyond the two files that hold paths.
  const walk = (dir, depth) => {
    if (depth > 4) return
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isFile() && ent.name === '.git') swap(p)
      else if (ent.isDirectory() && ent.name.endsWith('.git')) {
        if (fs.existsSync(path.join(p, 'config'))) swap(path.join(p, 'config'))
        const links = path.join(p, 'worktrees')
        for (const name of fs.existsSync(links) ? fs.readdirSync(links) : []) {
          const gitdir = path.join(links, name, 'gitdir')
          if (fs.existsSync(gitdir)) swap(gitdir)
        }
      } else if (ent.isDirectory() && ent.name !== 'node_modules') walk(p, depth + 1)
    }
  }
  for (const root of roots) walk(root, 0)
}

module.exports = { makeRepo, repoFor, nestedPrefix, git, fixture }
