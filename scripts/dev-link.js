#!/usr/bin/env node
'use strict'

/**
 * Link a distribution into a consuming project, for testing a change without
 * publishing it.
 *
 * The whole point is the ORDER. A distribution's `bin/`, `src/` and `assets/` are
 * composed by `build-dist.js` and gitignored, and pnpm does not run `prepare` for
 * a `link:` dependency — so linking an unbuilt package produces no bin shim at
 * all, and the consumer's only symptom is "command not found". Building first is
 * not a convenience here; it is the difference between a link that works and one
 * that silently yields nothing.
 *
 *   node scripts/dev-link.js <consumer-dir> [skitterspec|skitterspec-linear]
 *
 * Zero dependencies, like every script here.
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const DISTS = ['skitterspec', 'skitterspec-linear']
const SCOPE = '@skitterbyte'

function fail(message) {
  console.error(`dev-link: ${message}`)
  process.exit(1)
}

// The primary checkout this repo belongs to, or null when ROOT already is it.
//
// A linked git worktree marks itself with a `.git` FILE reading
// `gitdir: <primary>/.git/worktrees/<name>`, where the primary checkout keeps a
// `.git` directory. That one difference is the whole check — no git subprocess.
function primaryCheckout(root = ROOT) {
  const dotGit = path.join(root, '.git')
  let stat
  try {
    stat = fs.statSync(dotGit)
  } catch {
    return null // not a git checkout at all; not our business
  }
  if (!stat.isFile()) return null
  const marker = '/.git/worktrees/'
  const gitdir = fs.readFileSync(dotGit, 'utf8').replace(/^gitdir:\s*/, '').trim()
  const at = gitdir.indexOf(marker)
  return at === -1 ? null : gitdir.slice(0, at)
}

// The extra pnpm flags THIS consumer needs. Both exist to stop the link from
// quietly reshaping the project it is testing in:
//
//   -w  a pnpm workspace ROOT refuses a bare `pnpm add` outright
//       (ERR_PNPM_ADDING_TO_ROOT) — adding to the root of a monorepo is usually
//       a mistake. Here it is precisely what we mean: the CLI is a repo-wide
//       dev tool, not a dependency of one workspace package.
//   -D  `pnpm add` writes to `dependencies`. When the consumer keeps the
//       distribution in devDependencies — most do; it is a dev tool — adding
//       without -D MOVES it. The link would work and the diff would silently
//       rewrite the project's dependency shape, which is not ours to change.
//
// Read the manifest before any remove/add: afterwards the entry is gone and the
// section it lived in is unknowable.
function installFlags(consumer, dist) {
  const flags = []
  const workspace = ['pnpm-workspace.yaml', 'pnpm-workspace.yml']
  if (workspace.some((f) => fs.existsSync(path.join(consumer, f)))) flags.push('-w')
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(consumer, 'package.json'), 'utf8'))
  } catch {
    return flags // unreadable manifest is pnpm's error to report, not ours
  }
  if (pkg.devDependencies && pkg.devDependencies[`${SCOPE}/${dist}`]) flags.push('-D')
  return flags
}

function main(argv) {
  const [consumerArg, distArg = 'skitterspec-linear'] = argv
  if (!consumerArg) fail('usage: node scripts/dev-link.js <consumer-dir> [' + DISTS.join('|') + ']')
  if (!DISTS.includes(distArg)) fail(`unknown distribution "${distArg}" (want: ${DISTS.join(', ')})`)

  const consumer = path.resolve(consumerArg)
  if (!fs.existsSync(path.join(consumer, 'package.json'))) {
    fail(`no package.json in ${consumer} — that is not a project to link into`)
  }

  // Refuse to link from a spec worktree. The link is an absolute path, and
  // `/spec-complete` REMOVES the worktree when the spec lands — so the consumer
  // would be left pointing at a directory that no longer exists, at the exact
  // moment the work it was testing became available. Nothing is lost by using
  // the primary checkout instead, so there is no override.
  const primary = primaryCheckout()
  if (primary) {
    fail(
      `refusing to link from a spec worktree:\n    ${ROOT}\n` +
        '  /spec-complete removes it when the spec lands, and the link would dangle.\n' +
        `  link from the primary checkout instead:\n    cd ${primary} && npm run dev:link ${consumerArg}`,
    )
  }

  // Build FIRST. See the note above: the order is the feature.
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-dist.js'), distArg], {
    stdio: 'inherit',
    cwd: ROOT,
  })

  const pkgDir = path.join(ROOT, 'packages', distArg)
  const spec = `${SCOPE}/${distArg}@link:${pkgDir}`
  execFileSync('pnpm', ['add', ...installFlags(consumer, distArg), spec], {
    stdio: 'inherit',
    cwd: consumer,
  })

  console.log(
    `\ndev-link: ${SCOPE}/${distArg} linked into ${consumer}\n` +
      '  next: run "skitterspec init" there (first time) or "skitterspec update" (to refresh\n' +
      '  the copied skills) — a link updates the CLI, but skills are copies.\n' +
      `\n  NOTE: its package.json now carries an absolute local path\n` +
      `    "${SCOPE}/${distArg}": "link:${pkgDir}"\n` +
      '  Do not commit that — it resolves on this machine and nowhere else.\n' +
      '  Undo with: npm run dev:unlink ' + consumerArg,
  )
}

module.exports = { primaryCheckout, installFlags }

// CLI: node scripts/dev-link.js <consumer-dir> [skitterspec|skitterspec-linear]
if (require.main === module) main(process.argv.slice(2))
