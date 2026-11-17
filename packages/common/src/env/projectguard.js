'use strict'

/**
 * The project guard — is this session about to work on ANOTHER project?
 *
 * A session belongs to the project it was started in. A ta-da list read across
 * every project once ended on another repo's `/spec-complete`, the session ran
 * it, `cd`-ed into that repo and started completing a spec there — work nobody
 * in that project's own sessions could see, from a session whose rules, hooks
 * and context were somebody else's. Reports may still SUGGEST work elsewhere;
 * this is what stops a suggestion becoming an act.
 *
 * WHAT IT REFUSES, and nothing wider:
 *   - a write tool whose path lands in another skitterspec project
 *   - a `skitterspec …` lifecycle verb, or a git command that changes
 *     something, whose directory is another skitterspec project
 * Reads stay open — `git log` there, `skitterspec tada` — and so does every
 * other program: this is a guard on lifecycle work, not a sandbox for the shell.
 *
 * "ANOTHER SKITTERSPEC PROJECT" IS A POSITIVE SIGNAL: a git checkout with a
 * `specs/.core/` folder, which the installer always writes, at or above the
 * path. This repo and every worktree of it share one git common dir and are
 * home. A sibling folder with no `specs/.core` is nobody's project to guard.
 *
 * IT FAILS OPEN. A path git cannot place, a command it cannot parse, a
 * directory that is gone — each allows (`.claude/rules/negative-checks.md`).
 * Being wrong that way costs one unguarded act the skills also warn against;
 * being wrong the other way refuses ordinary work with no reason anyone can see.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Where the lifts live. Gitignored and beside the registry, like the main
// guard's allow: one person's decision about one session.
const ALLOW_FILE = 'project-allow.json'

// The engine under every name a distribution ships it as.
const ENGINES = new Set(['skitterspec', 'skitterspec-linear', 'skitterspec-jira', 'skitterspec-github', 'skitterspec-azure-boards'])

// git subcommands that only read. Anything else is a change.
//
// WHAT WOULD FOOL THIS: an alias (`git co`) or a subcommand added to git later
// reads as a change and is refused in another project — the strict side, and
// the refusal names the exit. A read missing from this list costs one
// `/allow-project`; a write wrongly on it would let the guard be walked past.
const GIT_READS = new Set([
  'status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'blame', 'describe',
  'shortlog', 'for-each-ref', 'cat-file', 'grep', 'reflog', 'merge-base', 'rev-list', 'name-rev',
])

// skitterspec verbs that only read, as `verb` or `verb sub`.
const ENGINE_READS = new Set([
  'tada', 'todo', 'idea list', 'status', 'help', '--help', '-h', '--version', '-v',
  'spec-env status', 'spec-env resolve',
  'epic status', 'epic check', 'gating check', 'spec-sync ownership', 'spec-sync board',
])

function allowPath(rootDir, config) {
  return path.resolve(rootDir, path.dirname(config.registry), ALLOW_FILE)
}

/** The recorded lifts. Missing or unreadable is none — the strict, safe answer. */
function readAllows(rootDir, config) {
  try {
    const parsed = JSON.parse(fs.readFileSync(allowPath(rootDir, config), 'utf-8'))
    return Array.isArray(parsed && parsed.allows) ? parsed.allows.filter((a) => a && typeof a === 'object') : []
  } catch {
    return []
  }
}

function writeAllows(rootDir, config, allows) {
  const file = allowPath(rootDir, config)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ allows }, null, 2) + '\n')
}

/**
 * Does a recorded lift cover `project` for `sessionId`? Pure.
 *
 * A lift names the project by its root, or by its folder name when it was typed
 * as a name — and a SESSION lift with no session id to compare does not apply,
 * for the main guard's reason: "cannot tell whose session" must not widen a
 * session lift into a permanent one.
 */
function liftApplies(lift, project, sessionId) {
  const names = lift.root ? lift.root === project.root : lift.name === project.name
  if (!names) return false
  if (lift.scope === 'repo') return true
  return lift.scope === 'session' && Boolean(sessionId) && lift.session === sessionId
}

function real(p) {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return null
  }
}

/**
 * The skitterspec project a path is in, or null when it is in none.
 *
 * NEAREST EXISTING ANCESTOR first, because a `Write` usually creates its file —
 * and `git -C` on a folder that does not exist yet fails, which read as "no
 * repo" would wave through exactly the new file in another project.
 *
 * @param {string} target
 * @param {(dir: string) => (args: string[]) => string|null} gitAt
 * @returns {{ common, root, name } | null}
 */
function projectAt(target, gitAt) {
  let at = path.resolve(target)
  while (!fs.existsSync(at)) {
    const up = path.dirname(at)
    if (up === at) return null
    at = up
  }
  if (!fs.statSync(at).isDirectory()) at = path.dirname(at)
  const git = gitAt(at)
  const top = git(['rev-parse', '--show-toplevel'])
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!top || !common) return null
  // A `specs/.core/` between the path and its checkout's top — a project may
  // sit in a subfolder of its repo, so the top alone is not enough to ask.
  let skitterspec = false
  for (let d = at; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'specs', '.core'))) {
      skitterspec = true
      break
    }
    if (real(d) === real(top) || path.dirname(d) === d) break
  }
  if (!skitterspec) return null
  const commonReal = real(common.trim())
  if (!commonReal) return null
  // The primary checkout's folder names the project, whichever worktree the
  // path is in — `ereqs`, never `perf-alerts`.
  const root = path.basename(commonReal) === '.git' ? path.dirname(commonReal) : commonReal
  return { common: commonReal, root, name: path.basename(root) }
}

/** The home project's git common dir, or null when it cannot be read. */
function homeCommon(home, gitAt) {
  const common = gitAt(home)(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  return common ? real(common.trim()) : null
}

function refusal(project, what) {
  return {
    refuse: true,
    project,
    reason:
      `${what} is in ${project.name} (${project.root}), and this session belongs to another project. ` +
      'A session works on the project it was started in — reports may suggest work elsewhere, ' +
      'but doing it belongs to a session opened there.\n\n' +
      `  open a session in ${project.root} and run it there\n\n` +
      `If this session really should act on ${project.name}, the USER types /allow-project ${project.name} — ` +
      'it is theirs to run, not yours.',
  }
}

const ALLOWS = { refuse: false, reason: null }

/**
 * Should a write to `target` be refused? `home` is the session's project dir.
 *
 * WHAT WOULD FOOL THIS: a symlink from inside this repo into another one is
 * resolved by git to where it points, so a write through it is judged by the
 * other project — the strict side, and the refusal names the exit.
 */
function checkPath({ home, target, gitAt, allows = [], sessionId = null }) {
  try {
    const mine = homeCommon(home, gitAt)
    if (!mine) return ALLOWS
    const other = projectAt(target, gitAt)
    if (!other || other.common === mine) return ALLOWS
    if (allows.some((l) => liftApplies(l, other, sessionId))) return ALLOWS
    return refusal(other, `${target}`)
  } catch {
    return ALLOWS
  }
}

/**
 * A shell command split into segments, each with the directory it runs in.
 * Returns null when it cannot be read — unbalanced quotes, a heredoc — and
 * the caller allows.
 *
 * Segments split on `&&`, `||`, `;`, `|` and newlines; a `cd <dir>` moves every
 * later segment, as it does in the shell. Subshell parentheses are dropped,
 * so `(cd x && …)` is read as if it changed the directory for the rest — the
 * strict side, refusing more, never less.
 */
function segmentsOf(command, cwd) {
  if (typeof command !== 'string') return null
  if (/<<-?\s*['"]?\w+/.test(command)) return null
  const tokens = []
  let cur = ''
  let quote = null
  let has = false
  const push = () => {
    if (has) tokens.push({ word: cur })
    cur = ''
    has = false
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === quote) quote = null
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i]
      else cur += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      has = true
    } else if (c === '\\' && i + 1 < command.length) {
      cur += command[++i]
      has = true
    } else if (/\s/.test(c) && c !== '\n') {
      push()
    } else if (c === '\n' || c === ';' || c === '(' || c === ')') {
      push()
      tokens.push({ op: true })
    } else if ((c === '&' || c === '|') && command[i + 1] === c) {
      push()
      tokens.push({ op: true })
      i++
    } else if (c === '|' || c === '&') {
      push()
      tokens.push({ op: true })
    } else {
      cur += c
      has = true
    }
  }
  if (quote) return null
  push()

  const segments = []
  let dir = cwd
  let words = []
  const close = () => {
    if (!words.length) return
    if (words[0] === 'cd' || words[0] === 'pushd') {
      const to = words[1]
      if (to && to !== '-') dir = path.resolve(dir, to.replace(/^~(?=$|\/)/, os.homedir()))
    } else {
      segments.push({ dir, words })
    }
    words = []
  }
  for (const t of tokens) {
    if (t.op) close()
    else words.push(t.word)
  }
  close()
  return segments
}

/**
 * What a segment runs, if it is one this guard is about: `{ kind, dir, verb }`
 * for git or the engine, null for anything else. `dir` is where it acts — its
 * `-C` or `--dir` when it names one.
 */
function lifecycleOf(seg) {
  let w = seg.words.slice()
  // Leading `VAR=value` assignments and `env` are not the program.
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || w[0] === 'env')) w.shift()
  // A package runner in front of the engine.
  if (['pnpm', 'npm', 'yarn', 'bunx', 'npx'].includes(w[0])) {
    w = w.slice(1)
    while (w.length && (w[0] === 'exec' || w[0] === 'dlx' || w[0] === 'run' || w[0].startsWith('-'))) w.shift()
  }
  if (!w.length) return null
  const prog = path.basename(w[0]).replace(/\.c?js$/, '')
  if (prog === 'git') {
    let dir = seg.dir
    let i = 1
    for (; i < w.length; i++) {
      if (w[i] === '-C' && w[i + 1]) dir = path.resolve(dir, w[++i])
      else if (w[i] === '-c' && w[i + 1]) i++
      else if (!w[i].startsWith('-')) break
    }
    const sub = w[i] || ''
    const rest = w.slice(i + 1)
    let read = GIT_READS.has(sub)
    if (sub === 'worktree') read = rest[0] === 'list'
    if (sub === 'branch') read = rest.every((a) => ['--show-current', '-a', '-r', '--list', '-v', '-vv', '--all', '--remotes'].includes(a))
    if (sub === 'remote') read = rest.every((a) => a === '-v' || a === 'show' || a === 'get-url')
    if (sub === 'config') read = rest.some((a) => a === '--get' || a === '--list' || a === '-l' || a === '--get-all')
    if (sub === 'stash') read = rest[0] === 'list' || rest[0] === 'show'
    if (sub === 'tag') read = rest.length === 0 || rest.every((a) => a === '-l' || a === '--list' || a.startsWith('--points-at') || a.startsWith('--contains'))
    return read ? null : { kind: 'git', dir, verb: sub }
  }
  if (ENGINES.has(prog)) {
    let dir = seg.dir
    const args = []
    for (let i = 1; i < w.length; i++) {
      if (w[i] === '--dir' && w[i + 1]) dir = path.resolve(dir, w[++i])
      else args.push(w[i])
    }
    const verbs = args.filter((a) => !a.startsWith('--') || ['--help', '--version'].includes(a))
    const one = verbs[0] || 'help'
    const two = verbs.slice(0, 2).join(' ')
    if (ENGINE_READS.has(one) || ENGINE_READS.has(two)) return null
    // `review waiting`, and a guard's own `status`/`check`, read. Lifting a
    // guard in another project (`main allow`, `project allow`) does not.
    if (two === 'spec-env review' && verbs[2] === 'waiting') return null
    if ((two === 'spec-env main' || two === 'spec-env project') && ['status', 'check', undefined].includes(verbs[2])) return null
    // `project` without --name/--category reads.
    if (one === 'project' && !args.some((a) => a === '--name' || a === '--category')) return null
    return { kind: 'skitterspec', dir, verb: two || one }
  }
  return null
}

/**
 * Should `command`, run from `cwd`, be refused?
 *
 * WHAT WOULD FOOL THIS: anything that is not git or the engine — `rm`, `sed -i`,
 * a script that commits for you. Parsing arbitrary shell for its effects cannot
 * be done reliably, so it is not tried; the guard covers lifecycle work and
 * the skills carry the rule for the rest. A variable in a path (`cd $REPO`) is
 * taken literally and lands nowhere real, so it allows.
 */
function checkCommand({ home, cwd, command, gitAt, allows = [], sessionId = null }) {
  try {
    const mine = homeCommon(home, gitAt)
    if (!mine) return ALLOWS
    const segments = segmentsOf(command, cwd)
    if (!segments) return ALLOWS
    for (const seg of segments) {
      const act = lifecycleOf(seg)
      if (!act) continue
      const other = projectAt(act.dir, gitAt)
      if (!other || other.common === mine) continue
      if (allows.some((l) => liftApplies(l, other, sessionId))) continue
      return refusal(other, `\`${act.kind === 'git' ? 'git' : 'skitterspec'} ${act.verb}\` in ${act.dir}`)
    }
    return ALLOWS
  } catch {
    return ALLOWS
  }
}

/**
 * Record a lift. `what` is a path (judged to its project's root) or a name.
 * Returns the lift written, or `{ error }` when a path names no project.
 */
function recordLift(rootDir, config, { what, sessionId = null, gitAt, at = null }) {
  let lift
  if (what && (what.includes('/') || what.includes(path.sep) || what === '.' || what === '..')) {
    const project = projectAt(path.resolve(what), gitAt)
    if (!project) return { error: `${what} is not in a skitterspec project` }
    lift = { root: project.root, name: project.name }
  } else {
    lift = { name: what }
  }
  lift = sessionId ? { ...lift, scope: 'session', session: sessionId, at } : { ...lift, scope: 'repo', at }
  const kept = readAllows(rootDir, config).filter((l) => !(l.name === lift.name && l.session === lift.session && l.scope === lift.scope))
  writeAllows(rootDir, config, [...kept, lift])
  return lift
}

/** Clear every lift for `name` (any session). Returns how many were cleared. */
function clearLift(rootDir, config, name) {
  const all = readAllows(rootDir, config)
  const kept = all.filter((l) => l.name !== name)
  if (kept.length !== all.length) writeAllows(rootDir, config, kept)
  return all.length - kept.length
}

module.exports = {
  ALLOW_FILE,
  allowPath,
  readAllows,
  liftApplies,
  projectAt,
  segmentsOf,
  lifecycleOf,
  checkPath,
  checkCommand,
  recordLift,
  clearLift,
}
