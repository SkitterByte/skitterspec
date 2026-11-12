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
    return { verb: 'building', state: `${progress} · ${plural(a.dirty, 'file')} uncommitted`, command: null, link: null, why: 'building — nothing to run yet' }
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

/**
 * The `next` cell as words — one string shared by every rendering, so the
 * terminal, `status` and the page cannot word the same action differently.
 */
function actionText(a) {
  if (!a) return '—'
  if (a.verb === 'verdict') return a.link ? `verdict → ${a.link}` : 'verdict — /spec-diff in its tab'
  if (a.verb === 'cannot-tell') return `cannot tell — ${a.why}`
  if (a.command) return a.why ? `${a.command} — ${a.why}` : a.command
  return a.why || '—'
}

/**
 * One row per member, in `epicStatus` order: `{ spec, bucket, tab, next }`,
 * plus the epic's own action. Pure — the disk arrives through three callbacks,
 * each answering for one spec:
 *
 *   - `inputsFor(spec)` → `readNextInputs`' answer, or null when the spec has
 *     no worktree on this machine
 *   - `tabFor(spec)`    → where its tab stands, or null
 *   - `linkFor(spec)`   → its served page, or null when nothing is serving
 *
 * An in-flight member with no worktree HERE is cannot-tell rather than
 * guessed: it may be in flight on a colleague's machine, and its gate and its
 * tree are there, not here.
 */
function epicRows(status, { inputsFor = () => null, tabFor = () => null, linkFor = () => null } = {}) {
  const flying = new Set(status.inFlight.map((m) => m.spec))
  const rows = status.members.map((m) => {
    const clashWith = status.clashes
      .filter((c) => c.specs.includes(m.spec))
      .map((c) => c.specs.find((x) => x !== m.spec))
      .filter((x) => flying.has(x))
    const syncWaits = status.syncPoints
      .filter((p) => p.spec === m.spec && p.phase !== null)
      .map((p) => ({ phase: p.phase, state: p.wait.state, raw: p.wait.raw }))
    let next
    if (m.bucket === 'in-progress') {
      const inputs = inputsFor(m.spec)
      next = inputs
        ? nextAction({ spec: m.spec, ...inputs, bucket: 'in-progress', syncWaits })
        : tell('in-progress', 'no worktree for it on this machine')
    } else {
      next = nextAction({ spec: m.spec, bucket: m.bucket, waits: m.waits, freeLanes: status.freeLanes, clashWith })
    }
    if (next.verb === 'verdict') next = { ...next, link: linkFor(m.spec) }
    return { spec: m.spec, bucket: m.bucket, tab: m.bucket === 'in-progress' ? tabFor(m.spec) : null, next }
  })
  return { rows, next: epicNext(status.epic, status.members) }
}

// In-flight actions before starts, and among those the one a person is
// already holding first: a pass, then a page, then a finish, then a build.
const TAB_ORDER = ['claim', 'verdict', 'complete', 'next']

/**
 * What the epic view is laid out from (spec feat-spec-epic-commands,
 * Decisions 9–10): how far along it is, every member in exactly one group, and
 * the numbered next steps. Computed once here so the page, the terminal and
 * `/spec-epic-next` cannot give three answers.
 *
 * GROUPS ARE BY POSITIVE SIGNAL. `ready` is a member the engine said may start
 * (`verb: start`); everything else in the backlog — blocked, or a wait that
 * cannot be read — is `waiting`, never `ready`
 * (`.claude/rules/negative-checks.md`). A row whose bucket could not be read is
 * waiting too.
 *
 * A STEP IS SOMETHING TO TYPE. A member that is building, held or cannot-tell
 * gets no step: naming one would be advice the engine cannot back.
 */
function epicPlan(status, { rows = [], next = null } = {}) {
  const groups = { inFlight: [], ready: [], waiting: [], done: [] }
  for (const r of rows) {
    if (r.bucket === 'complete' || r.bucket === 'cancelled') groups.done.push(r.spec)
    else if (r.bucket === 'in-progress') groups.inFlight.push(r.spec)
    else if (r.bucket === 'backlog' && r.next.verb === 'start') groups.ready.push(r.spec)
    else groups.waiting.push(r.spec)
  }
  const progress = { done: groups.done.length, total: rows.length, inFlight: groups.inFlight.length }

  // Everyone not yet finished who waits on `raw` — the whole spec, or one of
  // its phases.
  const open = new Set([...groups.ready, ...groups.waiting])
  const waitersOn = (raw) =>
    (status.members || []).filter((m) => open.has(m.spec) && (m.waits || []).some((w) => w.raw === raw && w.state !== 'met')).map((m) => m.spec)

  if (next) return { progress, groups, steps: [{ where: 'epic', spec: status.epic, verb: next.verb, command: next.command, link: null, unblocks: [], caution: null }] }

  const steps = []
  const tabRows = rows
    .filter((r) => r.bucket === 'in-progress' && TAB_ORDER.includes(r.next.verb))
    .sort((a, b) => TAB_ORDER.indexOf(a.next.verb) - TAB_ORDER.indexOf(b.next.verb))
  const stepOf = new Map()
  for (const r of tabRows) {
    let unblocks = []
    if (r.next.verb === 'complete') unblocks = waitersOn(r.spec)
    if (r.next.verb === 'next') {
      const m = /^phase (\d+)/.exec(r.next.why || '')
      if (m) unblocks = waitersOn(`${r.spec} phase ${m[1]}`)
    }
    steps.push({ where: 'tab', spec: r.spec, tab: r.tab, verb: r.next.verb, command: r.next.command, link: r.next.link, unblocks, caution: null })
    stepOf.set(r.spec, steps.length)
  }

  const flying = new Set(groups.inFlight)
  const clashesOf = (spec) =>
    (status.clashes || [])
      .filter((c) => c.specs.includes(spec))
      .map((c) => c.specs.find((x) => x !== spec))
      .filter((x) => flying.has(x))
  // A start that clashes with nothing in flight first: with one lane, the
  // safer start is the one to take.
  const starts = rows
    .filter((r) => groups.ready.includes(r.spec))
    .map((r) => ({ r, clash: clashesOf(r.spec) }))
    .sort((a, b) => Number(a.clash.length > 0) - Number(b.clash.length > 0))
  const cap = status.freeLanes === null || status.freeLanes === undefined ? starts.length : status.freeLanes
  for (const { r, clash } of starts.slice(0, cap)) {
    let caution = null
    if (clash.length) {
      const after = clash.map((x) => stepOf.get(x)).filter(Boolean)
      caution = `clashes with ${clash.join(', ')}${after.length ? `; safer after step ${after.join(', ')}` : ''}`
    }
    steps.push({ where: 'new-tab', spec: r.spec, tab: null, verb: 'start', command: r.next.command, link: null, unblocks: [], caution })
  }
  return { progress, groups, steps }
}

module.exports = { nextAction, epicNext, epicRows, epicPlan, actionText, readNextInputs, readPhases }
