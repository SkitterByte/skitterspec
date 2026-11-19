'use strict'

// How many subprocesses the suite starts, and of which kind
// (chore-fast-windows-suite, phase 3).
//
// Starting a process is cheap on macOS and Linux and costs roughly 200 ms on
// Windows, so on Windows the suite's run time is mostly its spawn count. Two
// uses, one file:
//
//   SPAWN_CENSUS=spawns.tsv NODE_OPTIONS="--require ./scripts/spawn-census.js" node --test
//     a hook. Every child process any test (or the engine under test) starts
//     is appended to the file as `<kind>\t<ms>`, where kind is `git <verb>`,
//     `node`, `sh` or the program's name.
//
//   node scripts/spawn-census.js spawns.tsv [--top 20]
//     prints the census, costliest kind first.
//
// WHAT IT MISSES: a process started by a child process (a `node` child
// running the CLI, which then runs git) is counted only if the hook reaches
// that child too. NODE_OPTIONS is inherited, so it usually does.

const fs = require('node:fs')
const path = require('node:path')

/** The census kind for one spawn: `git <verb>`, `node`, or the program. */
function kindOf(cmd, args = []) {
  const base = path.basename(String(cmd)).replace(/\.exe$/i, '')
  if (base === 'git') {
    const a = args.filter((x) => typeof x === 'string')
    let i = 0
    while (i < a.length && (a[i] === '-C' || a[i] === '-c')) i += 2
    return `git ${a[i] || '?'}`
  }
  if (base === 'node' || cmd === process.execPath) return 'node'
  if (base === 'sh' || base === 'bash') return 'sh'
  return base
}

/** Lines of `<kind>\t<ms>` folded into `[{ kind, count, ms }]`, costliest first. */
function summarize(text) {
  const by = new Map()
  for (const line of String(text).split('\n')) {
    const [kind, ms] = line.split('\t')
    if (!kind || ms === undefined) continue
    const row = by.get(kind) || { kind, count: 0, ms: 0 }
    row.count += 1
    row.ms += Number(ms) || 0
    by.set(kind, row)
  }
  return [...by.values()].map((r) => ({ ...r, ms: Math.round(r.ms) })).sort((a, b) => b.ms - a.ms || a.kind.localeCompare(b.kind))
}

function table(rows, n = 20) {
  const total = rows.reduce((t, r) => t + r.count, 0)
  const lines = [`${total} spawns`]
  for (const r of rows.slice(0, n)) {
    lines.push(`${(r.ms / 1000).toFixed(1).padStart(8)}s ${String(r.count).padStart(7)}  ${r.kind}`)
  }
  return lines
}

function install(out) {
  const cp = require('node:child_process')
  const record = (kind, ms) => {
    try {
      fs.appendFileSync(out, `${kind}\t${ms.toFixed(1)}\n`)
    } catch {
      // A census that cannot write must never fail the test it is watching.
    }
  }
  for (const name of ['spawnSync', 'execFileSync']) {
    const orig = cp[name]
    cp[name] = function (cmd, args, ...rest) {
      const t = performance.now()
      try {
        return orig.call(this, cmd, args, ...rest)
      } finally {
        record(kindOf(cmd, Array.isArray(args) ? args : []), performance.now() - t)
      }
    }
  }
  const origExecSync = cp.execSync
  cp.execSync = function (command, ...rest) {
    const t = performance.now()
    try {
      return origExecSync.call(this, command, ...rest)
    } finally {
      const [cmd, ...args] = String(command).split(' ')
      record(kindOf(cmd, args), performance.now() - t)
    }
  }
  for (const name of ['spawn', 'execFile']) {
    const orig = cp[name]
    cp[name] = function (cmd, args, ...rest) {
      const t = performance.now()
      const child = orig.call(this, cmd, args, ...rest)
      const kind = `${kindOf(cmd, Array.isArray(args) ? args : [])} (async)`
      child.once('exit', () => record(kind, performance.now() - t))
      return child
    }
  }
}

module.exports = { kindOf, summarize, table, install }

if (require.main === module) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--top')
  const top = at !== -1 ? Number(args[at + 1]) : 20
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--top')
  if (!file) {
    process.stderr.write('usage: node scripts/spawn-census.js <spawns.tsv> [--top N]\n')
    process.exitCode = 2
  } else {
    process.stdout.write(table(summarize(fs.readFileSync(file, 'utf8')), top).join('\n') + '\n')
  }
} else if (process.env.SPAWN_CENSUS) {
  install(process.env.SPAWN_CENSUS)
}
