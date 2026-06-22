'use strict'

const path = require('path')
const { init } = require('./init.js')

const pkg = require('../package.json')

const HELP = `skitterspec — spec-driven-development for Claude Code

Usage:
  skitterspec init [dir]      Install skills, rule, and specs/ folders into a project
  skitterspec update [dir]    Re-copy skills + rule (overwrites), leaves specs/ alone
  skitterspec --help          Show this help
  skitterspec --version       Print version

Options (init / update):
  --force                  Overwrite skill/rule files that already exist
  --dir <path>             Target project dir (default: positional arg or cwd)
  --no-claude-md           Skip creating/patching CLAUDE.md

Examples:
  npx @skitterbyte/skitterspec init
  npx @skitterbyte/skitterspec init ./my-app
  npx @skitterbyte/skitterspec update --force
`

function parse(argv) {
  const opts = { force: false, claudeMd: true, dir: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--no-claude-md') opts.claudeMd = false
    else if (a === '--dir') opts.dir = argv[++i]
    else if (a.startsWith('--')) throw new Error(`unknown option: ${a}`)
    else positional.push(a)
  }
  return { opts, positional }
}

async function run(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(HELP)
    return
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const [cmd, ...rest] = argv
  const { opts, positional } = parse(rest)
  const dir = path.resolve(opts.dir || positional[0] || process.cwd())

  switch (cmd) {
    case 'init':
      await init({ dir, force: opts.force, claudeMd: opts.claudeMd, mode: 'init' })
      break
    case 'update':
      await init({ dir, force: true, claudeMd: opts.claudeMd, mode: 'update' })
      break
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`)
  }
}

module.exports = { run }
