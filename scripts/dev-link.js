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
  execFileSync('pnpm', ['add', spec], { stdio: 'inherit', cwd: consumer })

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

module.exports = { primaryCheckout }

// CLI: node scripts/dev-link.js <consumer-dir> [skitterspec|skitterspec-linear]
if (require.main === module) main(process.argv.slice(2))
