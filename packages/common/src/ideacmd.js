'use strict'

/**
 * `skitterspec idea <add|list|drop>` — the side-effecting half of `idea.js`.
 *
 * The file store writes `specs/ideas.md` straight onto the base branch with
 * plumbing — a throwaway index, `commit-tree`, then a fast-forward — so no
 * checkout is switched, no worktree is made, and the primary checkout is never
 * left dirty. Where the base branch is checked out, the fast-forward runs
 * there (`merge --ff-only`) so its working tree follows; elsewhere the ref
 * moves by compare-and-swap. Either way a base that moved underneath us
 * refuses rather than overwriting it.
 *
 * Nothing is pushed. The base branch is shared once it is pushed, and a push
 * is always the operator's to make, so the command prints it instead.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { IDEAS_FILE, parseIdeas, planAdd, planDrop, selectStore, getProviderIdeaStore } = require('./idea.js')
const { loadEnvConfig, providerConfigured } = require('./env/config.js')
const { describeBaseBranch, baseRemote } = require('./env/resolve.js')
const { primaryAnchor } = require('./env/project.js')

const USAGE =
  'Usage: skitterspec idea add <text> [--product <key>] | list [--count] | drop <id> [--reason <why>]  [--json] [--dir <path>]\n'

function reader(cwd) {
  return (argv) => {
    try {
      return execFileSync('git', ['-C', cwd, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      return null
    }
  }
}

// A mutating call: throws with git's own stderr, which is what gets relayed.
function git(cwd, argv, { input, env } = {}) {
  try {
    return execFileSync('git', ['-C', cwd, ...argv], {
      input,
      env: env || process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim()
  } catch (error) {
    throw new Error((error.stderr && error.stderr.toString().trim()) || error.message)
  }
}

function parseArgs(argv) {
  const flags = { json: false, count: false, dir: null, reason: null, product: null }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') flags.json = true
    else if (a === '--count') flags.count = true
    else if (a === '--dir') flags.dir = argv[++i]
    else if (a === '--reason') flags.reason = argv[++i]
    else if (a === '--product') flags.product = argv[++i]
    else positional.push(a)
  }
  return { flags, positional }
}

function localDay(now) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Where the file store lives: the primary checkout, its base branch, the path. */
function fileContext(from) {
  const anchor = primaryAnchor(from, reader(from))
  const read = reader(anchor.root)
  let config = {}
  try {
    config = loadEnvConfig(anchor.dir).config
  } catch {
    // an unreadable config resolves the base the way a missing one does
  }
  const { base, refused } = describeBaseBranch(config, read)
  return {
    anchor,
    read,
    base,
    refused,
    remote: baseRemote(config),
    rel: anchor.prefix ? `${anchor.prefix}/${IDEAS_FILE}` : IDEAS_FILE,
  }
}

/** The file as the base branch holds it — `''` when it is not there yet. */
function readOnBase(ctx) {
  const tip = ctx.read(['rev-parse', '--verify', '--quiet', `refs/heads/${ctx.base}^{commit}`])
  if (!tip) return { tip: null, text: null }
  return { tip, text: ctx.read(['show', `${tip}:${ctx.rel}`]) || '' }
}

/** The worktree that has `branch` checked out, else null. */
function checkedOutAt(ctx, branch) {
  const out = ctx.read(['worktree', 'list', '--porcelain']) || ''
  let at = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) at = line.slice('worktree '.length)
    else if (line === `branch refs/heads/${branch}`) return at
  }
  return null
}

/** Commit `content` at `rel` on top of `tip`, then fast-forward the base to it. */
function landOnBase(ctx, tip, content, message) {
  const root = ctx.anchor.root
  const index = path.join(os.tmpdir(), `skitterspec-idea-${process.pid}-${Date.now()}.index`)
  const env = { ...process.env, GIT_INDEX_FILE: index }
  let commit
  try {
    git(root, ['read-tree', tip], { env })
    const blob = git(root, ['hash-object', '-w', '--stdin'], { input: content })
    git(root, ['update-index', '--add', '--cacheinfo', `100644,${blob},${ctx.rel}`], { env })
    const tree = git(root, ['write-tree'], { env })
    commit = git(root, ['commit-tree', tree, '-p', tip, '-F', '-'], { input: message })
  } finally {
    fs.rmSync(index, { force: true })
  }

  const at = checkedOutAt(ctx, ctx.base)
  if (at) {
    // Its working tree must follow the ref, so the move happens there — and a
    // local edit to the file is someone's work, which a fast-forward would
    // either refuse over or carry; refuse first, with the reason in words.
    const dirty = reader(at)(['status', '--porcelain', '--', ctx.rel])
    if (dirty) throw new Error(`${ctx.rel} has uncommitted changes in ${at} — commit or discard them first`)
    git(at, ['merge', '--ff-only', '--quiet', commit])
  } else {
    git(root, ['update-ref', '-m', 'skitterspec idea', `refs/heads/${ctx.base}`, commit, tip])
  }
  return commit
}

function write(out, flags, json, lines) {
  out.write(flags.json ? JSON.stringify(json, null, 2) + '\n' : lines.join('\n') + '\n')
}

function refuse(out, flags, reason, extra = {}) {
  write(out, flags, { ok: false, refused: reason, ...extra }, [`idea: ${reason}`])
  return 1
}

async function fileStore(sub, positional, flags, { cwd, now, out }) {
  const ctx = fileContext(cwd)
  if (!ctx.base) {
    // A rolling base in its gap carries the engine's offer
    // (`.claude/rules/offered-unblocks.md`): the refusal, then the way out.
    const offer = ctx.refused && ctx.refused.offer
    if (!offer) return refuse(out, flags, ctx.refused ? ctx.refused.message : 'cannot resolve the base branch')
    write(out, flags, { ok: false, refused: ctx.refused.message, offer }, [
      `idea: ${ctx.refused.message}`,
      `  offer: ${offer.label} — ${offer.command}`,
    ])
    return 1
  }
  const { tip, text } = readOnBase(ctx)

  if (sub === 'list') {
    const ideas = tip ? parseIdeas(text).entries : []
    if (flags.count) {
      write(out, flags, { store: 'file', count: ideas.length }, [String(ideas.length)])
      return 0
    }
    const lines = ideas.length
      ? [`ideas on ${ctx.base} (${ctx.rel}):`, ...ideas.map((e) => `  ${e.id.padEnd(30)}  ${e.date}  ${e.title}`)]
      : [`idea: nothing waiting on ${ctx.base}`]
    write(out, flags, { store: 'file', base: ctx.base, file: ctx.rel, ideas }, lines)
    return 0
  }

  if (!tip) return refuse(out, flags, `the base branch ${ctx.base} has no commits here`)

  const plan =
    sub === 'add'
      ? planAdd(text, {
          text: positional.join(' '),
          author: ctx.read(['config', 'user.name']),
          date: localDay(now),
        })
      : planDrop(text, { id: positional[0], reason: flags.reason })
  if (plan.refused) return refuse(out, flags, plan.refused, sub === 'add' ? { text: positional.join(' ') } : {})

  let commit
  try {
    commit = landOnBase(ctx, tip, plan.content, plan.message)
  } catch (error) {
    return refuse(out, flags, `nothing landed — ${error.message}`, sub === 'add' ? { text: positional.join(' ') } : {})
  }
  const push = `git push ${ctx.remote} ${ctx.base}`
  const verb = sub === 'add' ? 'added' : 'dropped'
  write(
    out,
    flags,
    { ok: true, store: 'file', action: sub, id: plan.id, title: plan.entry.title, base: ctx.base, commit, file: ctx.rel, push },
    [
      `idea: ${verb} "${plan.id}" ${sub === 'add' ? 'to' : 'from'} ${ctx.rel} on ${ctx.base} (${commit.slice(0, 7)})`,
      `  title:   ${plan.entry.title}`,
      `  pushed:  no — ${push} publishes it`,
      // The file has no products; say so rather than drop the flag in silence.
      ...(sub === 'add' && flags.product ? [`  product: ${flags.product} not recorded — specs/ideas.md has no products`] : []),
    ],
  )
  return 0
}

/**
 * Entry point. Resolves to an exit code: 0 for an answer, 1 for a refusal —
 * which for `add` carries the text back, so a refused capture loses nothing.
 */
async function ideaCommand(argv, { cwd = process.cwd(), now = new Date(), out = process.stdout } = {}) {
  const [sub, ...rest] = argv
  const { flags, positional } = parseArgs(rest)
  const from = path.resolve(flags.dir || cwd)
  if (!['add', 'list', 'drop'].includes(sub)) {
    out.write(USAGE)
    return sub ? 1 : 0
  }
  if (sub === 'add' && !positional.join(' ').trim()) return refuse(out, flags, 'nothing to capture — give the idea some text')
  if (sub === 'drop' && !positional[0]) return refuse(out, flags, 'name the idea to drop — `skitterspec idea list` shows them')

  const anchor = primaryAnchor(from, reader(from))
  const store = getProviderIdeaStore()
  const where = selectStore({ providerConfigured: providerConfigured(anchor.dir), store })
  if (where === 'provider') return store.run(sub, rest, { cwd: from, out })
  if (where === 'unknown') {
    if (sub === 'list') {
      write(out, flags, { store: 'unknown', count: null }, ['idea: cannot tell where ideas live — the configured provider declares no idea store'])
      return 0
    }
    const text = positional.join(' ')
    return refuse(
      out,
      flags,
      'cannot tell where ideas live — the configured provider declares no idea store; nothing was written' +
        (sub === 'add' ? `\n  your idea, so nothing is lost:\n  ${text.replace(/\n/g, '\n  ')}` : ''),
      sub === 'add' ? { text } : {},
    )
  }
  return fileStore(sub, positional, flags, { cwd: from, now, out })
}

module.exports = { ideaCommand, USAGE }
