'use strict'

/**
 * The one thing to do next for a spec, and where — the cell behind the `next`
 * column of `skitterspec epic status` and `skitterspec status` (spec
 * feat-epic-next, Decision 1).
 *
 * `nextAction` is pure: every input arrives already read, with `null` meaning
 * the reader could not tell. `readNextInputs` is the half that touches disk —
 * the gate, the pending store, the worktree's tree and its phase files — and
 * its io is injectable so the command layer is testable without a worktree.
 *
 * Positive signals only (`.claude/rules/negative-checks.md`). A verb is a
 * claim about the spec, so every input that is unreadable routes to
 * `cannot-tell` and never to a verb: telling someone to `/spec-complete` a spec
 * whose phase files could not be read is the accusation this exists to avoid.
 */

const fs = require('node:fs')
const path = require('node:path')

const { phaseIsDone } = require('./resolve.js')
const { readGate, readPending, gateState } = require('./review.js')
const { dirtyPaths } = require('./classify.js')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const tell = (state, why) => ({ verb: 'cannot-tell', state, command: null, link: null, why })

function backlogAction(spec, { waits = [], freeLanes = null, clashWith = [] }) {
  const unmet = waits.filter((w) => w.state === 'unmet')
  if (unmet.length) {
    return { verb: 'blocked', state: 'backlog', command: null, link: null, why: `waits on ${unmet.map((w) => w.raw).join(', ')}` }
  }
  const unknown = waits.filter((w) => w.state !== 'met')
  if (unknown.length) return tell('backlog', `cannot tell whether ${unknown.map((w) => w.raw).join(', ')} has landed`)
  // Both qualifiers advise and never withhold the command: `Lanes:` is a cap
  // the operator chose and `Area:` is declared rather than measured, so the
  // operator may know better (spec feat-epics, Decision 4).
  const held = []
  if (freeLanes === 0) held.push('no free lane')
  if (clashWith.length) held.push(`clashes with ${clashWith.join(', ')}`)
  return {
    verb: 'start',
    state: 'backlog · ready',
    command: `/spec-start ${spec}`,
    link: null,
    why: held.length ? held.join(' · ') : null,
  }
}

/**
 * @param {object} a
 *   - `spec`      the spec's folder name
 *   - `bucket`    where its own copy sits, or null when it could not be read
 *   - `phases`    `[{ n, done }]` from its own copy, or null when unreadable
 *   - `gate`      `armed` · `clear` · `off` (the project opted out) ·
 *                 `unreadable`
 *   - `passes`    codes of the passes waiting unclaimed, or null when the
 *                 pending store could not be read
 *   - `dirty`     uncommitted paths in its worktree, or null when git could
 *                 not answer
 *   - `syncWaits` `[{ phase, state, raw }]` — this spec's phase-level waits
 *   - `waits`     its start waits, resolved — a backlog member's only
 *   - `freeLanes` the epic's free lanes, or null with no cap
 *   - `clashWith` in-flight members whose `Area:` meets this one's
 * @returns {{ verb, state, command, link, why }}
 */
function nextAction(a) {
  const { spec, bucket } = a
  if (bucket === 'complete') return { verb: 'done', state: 'complete', command: null, link: null, why: null }
  if (bucket === 'cancelled') return { verb: 'done', state: 'cancelled', command: null, link: null, why: null }
  if (bucket === 'backlog') return backlogAction(spec, a)
  if (bucket !== 'in-progress') return tell('unknown', `${spec}'s own copy could not be read`)

  const phases = a.phases
  if (phases === null || phases === undefined) return tell('in-progress', 'its phase files could not be read')
  const done = phases.filter((p) => p.done).length
  const progress = `phase ${Math.min(done + 1, phases.length)} of ${phases.length}`

  // A pass first: someone already answered, and only a person in that tab can
  // pick it up (`/spec-reviewed` is user-only by harness enforcement).
  if (a.passes === null || a.passes === undefined) return tell(progress, 'the pending store is not readable')
  if (a.passes.length === 1) {
    return { verb: 'claim', state: `${progress} · pass waiting`, command: `/spec-reviewed ${a.passes[0]}`, link: null, why: null }
  }
  if (a.passes.length > 1) {
    return {
      verb: 'claim',
      state: `${progress} · ${a.passes.length} passes waiting`,
      command: '/spec-reviewed <code>',
      link: null,
      why: `name one: ${a.passes.join(', ')}`,
    }
  }

  // `off` is a project that set `review.required: false` — silence, not a
  // finding, so it falls through to the rest of the precedence.
  if (a.gate === 'unreadable') return tell(progress, 'the review gate is not readable')
  if (a.gate === 'armed') {
    return { verb: 'verdict', state: `${progress} · page waits`, command: null, link: null, why: 'press a verdict on its page' }
  }

  // DIRTY WITH NO PHASE ENDED IS NOT "COMMIT". The engine cannot tell an agent
  // mid-build from work left sitting, and `/commit` said to a tab that is
  // building is the wrong advice — so it is a state with no verb (Decision 2).
  if (a.dirty === null || a.dirty === undefined) return tell(progress, 'git could not read its worktree')
  if (a.dirty > 0) {
    return { verb: 'building', state: `${progress} · ${plural(a.dirty, 'file')} uncommitted`, command: null, link: null, why: null }
  }

  // A spec with no phase files yet has nothing for `/spec-next` to build;
  // naming the command would send the operator to a refusal.
  if (!phases.length) return { verb: 'idle', state: 'no phase files', command: null, link: null, why: null }
  if (done === phases.length) {
    return { verb: 'complete', state: `${done} of ${phases.length} ✅ · clean`, command: '/spec-complete', link: null, why: null }
  }

  const next = phases.find((p) => !p.done).n
  const held = (a.syncWaits || []).filter((w) => w.phase === next)
  const unmet = held.filter((w) => w.state === 'unmet')
  if (unmet.length) {
    return { verb: 'held', state: progress, command: null, link: null, why: `phase ${next} waits on ${unmet.map((w) => w.raw).join(', ')}` }
  }
  const unknown = held.filter((w) => w.state !== 'met')
  return {
    verb: 'next',
    state: progress,
    command: '/spec-next',
    link: null,
    why: unknown.length ? `phase ${next} · cannot tell whether ${unknown.map((w) => w.raw).join(', ')} has landed` : `phase ${next}`,
  }
}

/**
 * The epic's own row: `/spec-complete <epic>` once no member is open, and
 * nothing before — an epic completes after its members (feat-epics, Decision
 * 7). An epic with no members has nothing to complete after, so it says
 * nothing rather than inviting a completion of an empty plan.
 */
function epicNext(epic, members) {
  if (!members.length) return null
  if (members.some((m) => m.bucket !== 'complete' && m.bucket !== 'cancelled')) return null
  return { verb: 'complete', state: 'every member finished', command: `/spec-complete ${epic}`, link: null, why: null }
}

const defaultIo = {
  readdir: (dir) => fs.readdirSync(dir),
  readFile: (file) => fs.readFileSync(file, 'utf8'),
}

function tryRead(fn) {
  try {
    return fn()
  } catch {
    return null
  }
}

/**
 * A spec's phases as its own copy has them, `[{ n, done }]`, or null when the
 * folder could not be read. Read in the worktree because that is the copy that
 * is true for a spec being built; the base branch still files it in backlog.
 */
function readPhases(root, bucket, folder, io = defaultIo) {
  const dir = path.join(root, 'specs', bucket, folder)
  const files = tryRead(() => io.readdir(dir))
  if (!files) return null
  const out = []
  for (const f of files.filter((x) => /^(?!00-)\d{2}-.*\.md$/.test(x)).sort()) {
    const text = tryRead(() => io.readFile(path.join(dir, f)))
    // One unreadable phase makes the count a guess, and a guess here is what
    // would print `/spec-complete` for a spec with a phase left to build.
    if (text === null) return null
    out.push({ n: Number(f.slice(0, 2)), done: phaseIsDone(text) })
  }
  return out
}

/**
 * The disk half: everything `nextAction` needs about one in-flight spec that is
 * not the epic's to say.
 *
 * @param {object} a
 *   - `folder`    the spec
 *   - `bucket`    its bucket in its own copy
 *   - `worktree`  its worktree root
 *   - `outPath`   its review page path in the primary checkout, where the gate
 *                 and the pending store sit beside it
 *   - `required`  `review.required` from the project config
 *   - `git`       a reader for the worktree, `argv → stdout | null`
 */
function readNextInputs({ folder, bucket, worktree, outPath, required, git, io = defaultIo }) {
  const gateRead = readGate(outPath, folder)
  const g = gateState({ ...gateRead, required })
  // `unknown` covers three readings and only one is a fault: the project
  // opting out is silence, a corrupt or newer sidecar is cannot-tell.
  const gate = g.state === 'armed' ? 'armed' : g.state === 'clear' ? 'clear' : required === false ? 'off' : 'unreadable'
  const pending = readPending(outPath, folder)
  const passes = pending.corrupt ? null : pending.pending.passes.filter((p) => p && p.code).map((p) => p.code)
  const dirty = dirtyPaths(git)
  return {
    bucket,
    phases: bucket ? readPhases(worktree, bucket, folder, io) : null,
    gate,
    passes,
    dirty: dirty === null ? null : dirty.length,
  }
}

module.exports = { nextAction, epicNext, readNextInputs, readPhases }
