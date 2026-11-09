'use strict'

/**
 * Where the skitterspec project sits inside its git repo.
 *
 * Most projects ARE the repo: `specs/` and `.claude/` live at the git root and
 * the prefix is `''`. Some live in a subfolder — a .NET solution folder beside
 * `Sql/` and a prototype or two, where sessions start in the solution folder and
 * that is where `specs/` has to be. This module is the one place that knows the
 * difference, so every other site asks it rather than assuming `specs/` is at
 * the root.
 *
 * Two kinds of path, kept apart on purpose:
 *
 * - a **repo path** is what git prints: relative to the git root, `/`-separated
 *   on every platform (git emits forward slashes on Windows too).
 * - an **OS path** is what `fs` and `spawn` take, built with `path`.
 *
 * `fromRepoPath` / `toRepoPath` convert between a repo path and a
 * project-relative one; `projectIn` turns a checkout root into the project's OS
 * folder within it.
 */

const fs = require('node:fs')
const path = require('node:path')

// What marks a project folder: the config folder the installer always writes
// into. A positive signal (`.claude/rules/negative-checks.md` rule 1) — not
// "the lifecycle folders are there", which git drops whenever one empties.
const MARKER = path.join('specs', '.core')

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

// `.native`, never the JS `realpathSync`: on Windows only the native call
// expands an 8.3 short name (`C:\Users\RUNNER~1\…`), and git always reports the
// long one. Compared un-expanded, every folder under a short-named temp dir
// looked outside its own repo, and the project was never found.
function real(p) {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}

/** An OS-relative path as a repo path: `/`-separated, no leading `./`. */
function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/^\.\/?/, '')
}

/**
 * The project's prefix within `toplevel`, found by walking up from `from` to the
 * nearest folder holding `specs/.core/`, stopping at `toplevel`. `''` when the
 * project is the root, and `''` when nothing is found — today's behaviour.
 *
 * WHAT WOULD FOOL THIS: a `specs/.core/` that is not a project's — a fixture
 * folder checked into the repo, say — between `from` and the real project. The
 * walk takes the nearest, so a command run from inside such a folder anchors
 * there. Several projects in one repo are out of scope, and nothing here
 * arbitrates between two. Run from the root's own subfolders (the ordinary
 * case for a root-layout repo) the walk reaches the root and answers `''`.
 *
 * Paths are compared as REAL paths: git reports the toplevel resolved through
 * symlinks (macOS `/var` → `/private/var`) where a caller's cwd may not be.
 */
function findPrefix(from, toplevel) {
  const top = real(toplevel)
  let at = real(from)
  const rel = path.relative(top, at)
  // `from` outside the toplevel is cannot-tell, and cannot-tell is `''`.
  if (rel.startsWith('..') || path.isAbsolute(rel)) return ''
  for (;;) {
    if (isDir(path.join(at, MARKER))) return toPosix(path.relative(top, at))
    if (at === top) return ''
    const up = path.dirname(at)
    if (up === at) return ''
    at = up
  }
}

/**
 * Locate the project from `from` in the primary checkout.
 *
 * `git(args)` is a reader bound to `from`, returning trimmed stdout or `null`
 * (not a repo) — injected, as everywhere in `env/`. Returns
 * `{ root, prefix, dir }`: the primary checkout's root, the project's prefix
 * within it, and the project folder there (`root` itself when the prefix is
 * `''`). Not a repo → `{ root: from, prefix: '', dir: from }`.
 *
 * The primary root is the parent of the shared git dir — `.git` relative from
 * the primary checkout, `../../.git` from a subfolder of it, an absolute
 * `<main>/.git` from a linked worktree. The prefix is found in the tree you are
 * standing in and applied to the primary, which holds because a worktree is a
 * checkout of the same repo: the project is at the same place in both.
 */
function primaryAnchor(from, git) {
  const common = git(['rev-parse', '--git-common-dir'])
  if (!common) return { root: from, prefix: '', dir: from }
  // Canonical, so one folder prints one way wherever the command was run from.
  // From the primary checkout `common` is relative (`.git`) and the root came
  // out spelled as `from` was; from a worktree git hands back an absolute,
  // long-form path — on Windows `RUNNER~1` against `runneradmin` for the same
  // folder, and `integrate` printed two different plans (chore-windows-ci).
  const root = real(path.dirname(path.resolve(from, common)))
  const toplevel = git(['rev-parse', '--show-toplevel'])
  const prefix = toplevel ? findPrefix(from, toplevel) : ''
  return { root, prefix, dir: projectIn(root, prefix) }
}

/** The project's OS folder within a checkout root (the root when prefix is `''`). */
function projectIn(root, prefix) {
  return prefix ? path.join(root, ...prefix.split('/')) : root
}

/**
 * A repo path as a project-relative path, or `null` when it is outside the
 * project. Prefix `''` returns the path unchanged.
 */
function fromRepoPath(rel, prefix) {
  if (!prefix) return rel
  if (rel === prefix) return ''
  return rel.startsWith(`${prefix}/`) ? rel.slice(prefix.length + 1) : null
}

/**
 * A repo path as seen from the project folder: `fromRepoPath` inside the
 * project, `../…` outside it — the form a pathspec takes when it is run from the
 * project folder, which is where a session stands. Prefix `''` returns it
 * unchanged.
 */
function projectRelative(rel, prefix) {
  if (!prefix) return rel
  const inside = fromRepoPath(rel, prefix)
  return inside !== null ? inside : path.posix.relative(prefix, rel)
}

/** A project-relative path as a repo path. Prefix `''` returns it unchanged. */
function toRepoPath(rel, prefix) {
  if (!prefix) return rel
  return rel ? `${prefix}/${rel}` : prefix
}

/**
 * Record where the project sits on a loaded config, for the code that needs the
 * repo's root rather than the project folder — the worktree layout and `{repo}`
 * resolve against the root, so worktrees land beside the repo rather than
 * inside it. Non-enumerable, so it never reaches a JSON dump or a hash of the
 * config.
 */
function attachProject(config, anchor) {
  Object.defineProperty(config, 'project', {
    value: Object.freeze({ root: anchor.root, prefix: anchor.prefix }),
    enumerable: false,
    configurable: true,
  })
  return config
}

/**
 * A path as one shell word, for the commands the engine PRINTS for a person or
 * a skill to run. Quoted only when it has to be, so a path without spaces or
 * shell characters prints byte-identically to before. Double quotes, because
 * they mean the same in bash, zsh, Git Bash and cmd for an ordinary path; the
 * three characters bash still expands inside them are escaped. A backslash
 * forces quoting (unquoted, bash eats it — `C:\Code` becomes `C:Code`) and is
 * left as it is inside the quotes, where bash keeps it.
 *
 * WHY: a repo at `C:\Code\LSC App` lays its worktrees out at `LSC App-wt`, and
 * `git worktree add C:\Code\LSC App-wt\x -b …` is two arguments.
 */
function shellPath(p) {
  const s = String(p)
  if (!/[\s"'$`!&|;<>()*?[\]{}#~\\]/.test(s)) return s
  return `"${s.replace(/(["$`])/g, '\\$1')}"`
}

/** The repo root a config was loaded for, else `dir` — today's behaviour. */
function repoRootOf(dir, config) {
  return (config && config.project && config.project.root) || dir
}

/** The project prefix a config was loaded for, else `''`. */
function prefixOf(config) {
  return (config && config.project && config.project.prefix) || ''
}

/**
 * The one line that says where the project is, or `''` at the root — a root
 * layout prints nothing new.
 */
function projectLine(anchor) {
  if (!anchor || !anchor.prefix) return ''
  return `subfolder:  ${anchor.prefix}/ (in repo ${anchor.root})\n`
}

module.exports = {
  MARKER,
  findPrefix,
  primaryAnchor,
  projectIn,
  fromRepoPath,
  projectRelative,
  toRepoPath,
  toPosix,
  shellPath,
  attachProject,
  repoRootOf,
  prefixOf,
  projectLine,
}
