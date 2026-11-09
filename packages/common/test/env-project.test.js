'use strict'

// env/project.js — where the skitterspec project sits inside its git repo.
// Prefix '' must be today's behaviour exactly; a subfolder project must be found
// from anywhere beneath it (spec feat-subfolder-project).

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const {
  findPrefix,
  primaryAnchor,
  projectIn,
  fromRepoPath,
  toRepoPath,
  attachProject,
  repoRootOf,
  prefixOf,
  projectLine,
} = require('../src/env/project.js')

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-project-')))
}

function mk(...parts) {
  const p = path.join(...parts)
  fs.mkdirSync(p, { recursive: true })
  return p
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function reader(cwd) {
  return (args) => {
    try {
      return git(cwd, ...args)
    } catch {
      return null
    }
  }
}

function fakeGit(map) {
  return (argv) => (Object.prototype.hasOwnProperty.call(map, argv.join(' ')) ? map[argv.join(' ')] : null)
}

// --- findPrefix --------------------------------------------------------------

test('findPrefix: the project at the root is prefix ""', () => {
  const root = tmp()
  mk(root, 'specs', '.core')
  assert.strictEqual(findPrefix(root, root), '')
})

test('findPrefix: a project in a subfolder is found from that folder', () => {
  const root = tmp()
  mk(root, 'FF.CSC.Solution', 'specs', '.core')
  assert.strictEqual(findPrefix(path.join(root, 'FF.CSC.Solution'), root), 'FF.CSC.Solution')
})

test('findPrefix: and from deeper than the project folder', () => {
  const root = tmp()
  mk(root, 'FF.CSC.Solution', 'specs', '.core')
  const deep = mk(root, 'FF.CSC.Solution', 'ClientApp', 'src')
  assert.strictEqual(findPrefix(deep, root), 'FF.CSC.Solution')
})

test('findPrefix: a nested prefix is /-separated on every platform', () => {
  const root = tmp()
  mk(root, 'apps', 'web', 'specs', '.core')
  assert.strictEqual(findPrefix(path.join(root, 'apps', 'web'), root), 'apps/web')
})

test('stays silent: a root-layout repo run from one of its subfolders is prefix ""', () => {
  // The case `git rev-parse --show-prefix` gets wrong: it would answer
  // `packages/common`, and every spec-env verb would read no config.
  const root = tmp()
  mk(root, 'specs', '.core')
  const sub = mk(root, 'packages', 'common')
  assert.strictEqual(findPrefix(sub, root), '')
})

test('stays silent: no specs/.core anywhere is prefix "" — today\'s behaviour', () => {
  const root = tmp()
  const sub = mk(root, 'a', 'b')
  assert.strictEqual(findPrefix(sub, root), '')
})

test('stays silent: a folder outside the toplevel is cannot-tell, and cannot-tell is ""', () => {
  const a = tmp()
  const b = tmp()
  mk(b, 'specs', '.core')
  assert.strictEqual(findPrefix(b, a), '')
})

test('findPrefix: a specs/ folder without .core is not a project', () => {
  const root = tmp()
  mk(root, 'specs', '.core')
  mk(root, 'docs', 'specs', 'backlog')
  assert.strictEqual(findPrefix(path.join(root, 'docs'), root), '')
})

// --- primaryAnchor -----------------------------------------------------------

test('primaryAnchor: not a git repo degrades to the folder itself', () => {
  assert.deepStrictEqual(primaryAnchor('/somewhere', fakeGit({})), {
    root: '/somewhere',
    prefix: '',
    dir: '/somewhere',
  })
})

test('primaryAnchor: a root project from the primary checkout is unchanged', () => {
  const root = tmp()
  mk(root, 'specs', '.core')
  git(root, 'init', '-q')
  const a = primaryAnchor(root, reader(root))
  assert.deepStrictEqual(a, { root, prefix: '', dir: root })
})

test('primaryAnchor: a subfolder project from deep inside it re-anchors to <root>/<prefix>', () => {
  const root = tmp()
  mk(root, 'FF.CSC.Solution', 'specs', '.core')
  const deep = mk(root, 'FF.CSC.Solution', 'ClientApp')
  git(root, 'init', '-q')
  const a = primaryAnchor(deep, reader(deep))
  assert.strictEqual(a.root, root)
  assert.strictEqual(a.prefix, 'FF.CSC.Solution')
  assert.strictEqual(a.dir, path.join(root, 'FF.CSC.Solution'))
})

test('primaryAnchor: from a linked worktree, the project in the PRIMARY checkout', () => {
  const root = tmp()
  mk(root, 'FF.CSC.Solution', 'specs', '.core')
  fs.writeFileSync(path.join(root, 'FF.CSC.Solution', 'specs', '.core', 'env.config.json'), '{}')
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 't@t')
  git(root, 'config', 'user.name', 'T')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'init')
  const wt = path.join(tmp(), 'wt')
  git(root, 'worktree', 'add', '-q', '-b', 'feat/x', wt)
  const from = path.join(wt, 'FF.CSC.Solution')
  const a = primaryAnchor(from, reader(from))
  assert.strictEqual(fs.realpathSync(a.root), root)
  assert.strictEqual(a.prefix, 'FF.CSC.Solution')
  assert.strictEqual(fs.realpathSync(a.dir), path.join(root, 'FF.CSC.Solution'))
})

// --- repo paths ----------------------------------------------------------------

test('fromRepoPath / toRepoPath are the identity at prefix ""', () => {
  assert.strictEqual(fromRepoPath('specs/backlog/x/00-overview.md', ''), 'specs/backlog/x/00-overview.md')
  assert.strictEqual(toRepoPath('specs/backlog/x', ''), 'specs/backlog/x')
})

test('fromRepoPath strips the prefix, and answers null outside it', () => {
  const p = 'FF.CSC.Solution'
  assert.strictEqual(fromRepoPath('FF.CSC.Solution/specs/backlog/x/00-overview.md', p), 'specs/backlog/x/00-overview.md')
  assert.strictEqual(fromRepoPath('FF.CSC.Solution', p), '')
  assert.strictEqual(fromRepoPath('Sql/schema.sql', p), null)
  // A sibling sharing the prefix as a string prefix is still outside it.
  assert.strictEqual(fromRepoPath('FF.CSC.Solution.Tests/a.cs', p), null)
})

test('toRepoPath prepends the prefix, and round-trips', () => {
  const p = 'apps/web'
  assert.strictEqual(toRepoPath('specs/.core/env.config.json', p), 'apps/web/specs/.core/env.config.json')
  assert.strictEqual(toRepoPath('', p), 'apps/web')
  assert.strictEqual(fromRepoPath(toRepoPath('specs/x', p), p), 'specs/x')
})

test('projectIn joins the prefix as an OS path', () => {
  assert.strictEqual(projectIn('/r', ''), '/r')
  assert.strictEqual(projectIn('/r', 'apps/web'), path.join('/r', 'apps', 'web'))
})

// --- the config carries the anchor ------------------------------------------

test('attachProject is invisible to JSON, and repoRootOf / prefixOf read it', () => {
  const config = { worktree: { root: '../{repo}-wt' } }
  attachProject(config, { root: '/r', prefix: 'p', dir: '/r/p' })
  assert.strictEqual(JSON.stringify(config), '{"worktree":{"root":"../{repo}-wt"}}')
  assert.strictEqual(repoRootOf('/r/p', config), '/r')
  assert.strictEqual(prefixOf(config), 'p')
})

test('stays silent: a config with no anchor resolves against dir, as before', () => {
  assert.strictEqual(repoRootOf('/repo', {}), '/repo')
  assert.strictEqual(repoRootOf('/repo', undefined), '/repo')
  assert.strictEqual(prefixOf({}), '')
})

test('projectLine names a subfolder project, and prints nothing at the root', () => {
  assert.strictEqual(projectLine({ root: '/r', prefix: '' }), '')
  assert.strictEqual(projectLine(undefined), '')
  assert.strictEqual(projectLine({ root: '/r', prefix: 'FF.CSC.Solution' }), 'subfolder:  FF.CSC.Solution/ (in repo /r)\n')
})

// --- shellPath -----------------------------------------------------------------

const { shellPath } = require('../src/env/project.js')

test('stays silent: an ordinary path prints byte-identically', () => {
  assert.strictEqual(shellPath('/Users/me/code/app-wt/x'), '/Users/me/code/app-wt/x')
})

test('shellPath quotes a path with a space — the adopter\'s `LSC App`', () => {
  assert.strictEqual(shellPath('/c/Code/LSC App-wt/x'), '"/c/Code/LSC App-wt/x"')
})

test('shellPath quotes a Windows path, keeping its backslashes', () => {
  // Unquoted, bash eats the backslashes: C:\Code becomes C:Code.
  assert.strictEqual(shellPath('C:\\Code\\LSC App-wt\\x'), '"C:\\Code\\LSC App-wt\\x"')
  assert.strictEqual(shellPath('C:\\Code\\app'), '"C:\\Code\\app"')
})

test('shellPath escapes what bash still expands inside double quotes', () => {
  assert.strictEqual(shellPath('/tmp/a $b"c`d'), '"/tmp/a \\$b\\"c\\`d"')
})

test('shellPath survives a real shell round-trip', () => {
  const odd = '/tmp/LSC App $HOME "q" `x`'
  const out = execFileSync('sh', ['-c', `printf %s ${shellPath(odd)}`]).toString()
  assert.strictEqual(out, odd)
})

// --- another spelling of the same folder ---------------------------------------
//
// chore-windows-ci: GitHub's Windows runners put the temp dir behind an 8.3
// short name (`C:\Users\RUNNER~1\…`) while git reports the long one, and the JS
// `realpathSync` keeps whichever spelling it was given — so every folder looked
// outside its own repo and no project was ever found. A case-flipped path on a
// case-insensitive filesystem (macOS, Windows) is the same failure, and one a
// test can build anywhere that has one.

function caseAlias(p) {
  const base = path.basename(p)
  const flipped = base === base.toUpperCase() ? base.toLowerCase() : base.toUpperCase()
  const alias = path.join(path.dirname(p), flipped)
  return alias !== p && fs.existsSync(alias) ? alias : null
}

test('findPrefix finds the project from another spelling of its folder', (t) => {
  const root = tmp()
  const project = mk(root, 'FF.CSC.Solution')
  mk(project, 'specs', '.core')
  git(root, 'init', '-q')
  const alias = caseAlias(root)
  if (!alias) return t.skip('case-sensitive filesystem: a case-flipped path is a different folder here')
  const from = path.join(alias, 'FF.CSC.Solution')
  assert.strictEqual(findPrefix(from, git(root, 'rev-parse', '--show-toplevel')), 'FF.CSC.Solution')
  assert.strictEqual(primaryAnchor(from, reader(from)).prefix, 'FF.CSC.Solution')
})
