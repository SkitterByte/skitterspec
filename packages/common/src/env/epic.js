'use strict'

/**
 * `skitterspec epic status <epic>` — what an epic's members say about its order.
 *
 * An epic declares neither its members nor their order (spec feat-epics,
 * Decision 2): each member carries `> **Epic:**` and `> **Waits on:**`, and
 * this turns those headers into what can start now, what is blocked and on
 * what, and the waves the members fall into.
 *
 * WAITS ARE MET ONLY ON A POSITIVE SIGNAL, read off the BASE BRANCH
 * (`.claude/rules/negative-checks.md` rule 1): the named spec sitting in
 * `complete/` there, or its phase file reading done there. Everything else is
 * one of two different answers, and they are never merged:
 *
 *   - unmet       — the spec is on the base branch and has not got there yet
 *   - cannot tell — the spec is not on the base branch at all, the phase file
 *                   is not there, or the entry did not parse
 *
 * WHAT WOULD FOOL THIS: a spec on its own unlanded branch is invisible on the
 * base branch, so a wait on it can only ever read cannot-tell — never met, and
 * never blocked-forever. Buckets are branch-local truth; the base branch is the
 * one place every session agrees on, which is why waits are read there and
 * nowhere else.
 *
 * Pure but for the injected reads, so it is testable without a repository.
 */

const { phaseIsDone } = require('./resolve.js')
const { epicRows, actionText } = require('./nextaction.js')

const BUCKETS = ['backlog', 'in-progress', 'complete', 'cancelled']

// A header value off an overview's blockquote block, or null when absent.
function header(text, name) {
  const m = new RegExp(`^>\\s*\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm').exec(text || '')
  if (!m) return null
  const value = m[1].trim()
  return value && value !== '—' && value !== '-' ? value : null
}

const unquote = (value) => (value == null ? value : value.replace(/^`(.*)`$/, '$1').trim())

// `<spec>[ phase N], …` → `[{ spec, phase, raw }]`. The twin of sync-core's
// `parseWaitsOn` — the base depends on no provider package, so it keeps its
// own copy, and `env-epic-status.test.js` holds the two to one answer.
//
// A MALFORMED ENTRY IS KEPT as `{ spec: null }`, never dropped: dropped, a wait
// nobody can read would look like no wait, and the member would read as ready.
function parseWaitsOn(value) {
  if (!value) return []
  const trimmed = value.trim()
  if (/^(none|—|-)$/i.test(trimmed)) return []
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^`?([a-z0-9][a-z0-9._-]*)`?(?:\s+phase\s+(\d+))?$/i.exec(part)
      if (!m) return { spec: null, phase: null, raw: part }
      return { spec: m[1], phase: m[2] ? Number(m[2]) : null, raw: part }
    })
}

function parseLanes(value) {
  const m = /^(\d+)$/.exec((value || '').trim())
  const n = m ? Number(m[1]) : 0
  return n > 0 ? n : null
}

/** The headers an epic or a member carries. */
function epicHeaders(text) {
  return {
    epic: unquote(header(text, 'Epic')) || null,
    waitsOn: parseWaitsOn(header(text, 'Waits on')),
    lanes: parseLanes(header(text, 'Lanes')),
    area: parseArea(header(text, 'Area')),
  }
}

// Split on commas outside `{…}` and `(…)` — `a/{b,c}.ts, d (x, y)` is two parts.
function splitTopLevel(value) {
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '{' || ch === '(') depth++
    else if ((ch === '}' || ch === ')') && depth > 0) depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

// `a/{b,c}/{d,e}.ts` → every combination. One level of nesting per group,
// which is how the headers write it.
function expandBraces(pattern) {
  const m = /\{([^{}]*)\}/.exec(pattern)
  if (!m) return [pattern]
  const head = pattern.slice(0, m.index)
  const tail = pattern.slice(m.index + m[0].length)
  return m[1].split(',').flatMap((alt) => expandBraces(`${head}${alt.trim()}${tail}`))
}

/**
 * `> **Area:**` → the path patterns it names, brace-expanded. A trailing
 * annotation — `(new)`, `(deep link)`, `` (`bareLive`) `` — is dropped, and so
 * is any entry that does not read as a path (`skills (spec, spec-start)`):
 * prose names no file, so it can clash with nothing. That is a cannot-tell,
 * and a cannot-tell claims no clash — `Area:` is declared, not measured.
 */
function parseArea(value) {
  if (!value) return []
  const paths = splitTopLevel(value)
    .map((part) => part.replace(/\s*\([^()]*\)\s*$/, '').replace(/`/g, '').trim())
    .filter((part) => /^[\w.@+\-/*{},[\]]+$/.test(part) && /[/.]/.test(part))
    .flatMap(expandBraces)
    .map((p) => p.replace(/^\.\//, ''))
  return [...new Set(paths)]
}

// One path segment against another, either of which may hold a `*`.
function segmentsMeet(a, b) {
  if (a === b || a === '**' || b === '**') return true
  const re = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
  if (a.includes('*') && re(a).test(b.replace(/\*/g, ''))) return true
  if (b.includes('*') && re(b).test(a.replace(/\*/g, ''))) return true
  return false
}

/**
 * Could one file be named by both patterns? A pattern that ends first is read
 * as a directory holding the other — `packages/api/` and `packages/api` both
 * name everything under it, since a header rarely says which it means. A bare
 * filename (no `/`) is matched against the other's last segment.
 *
 * WHAT WOULD FOOL THIS: a directory and a file of the same name read as a
 * clash, and a glob against a glob is matched loosely. Both err towards
 * naming a clash, which only ever warns.
 */
function patternsMeet(a, b) {
  const split = (p) => p.replace(/\/+$/, '').split('/').filter(Boolean)
  const sa = split(a)
  const sb = split(b)
  if (sa.length === 1 || sb.length === 1) {
    const [bare, other] = sa.length === 1 ? [sa, sb] : [sb, sa]
    return segmentsMeet(bare[0], other[other.length - 1])
  }
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    if (sa[i] === '**' || sb[i] === '**') return true
    if (!segmentsMeet(sa[i], sb[i])) return false
  }
  return true
}

/**
 * Every pair of open members whose `Area:` patterns meet, with the patterns
 * they share — the "never together" sets. A member with no readable `Area:`
 * claims nothing (stays silent), and finished members are left out: a pair
 * matters only while both may still be built.
 */
function clashes(members) {
  const open = members.filter((m) => m.area.length && !['complete', 'cancelled'].includes(m.bucket))
  const out = []
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const shared = new Set()
      for (const a of open[i].area) {
        for (const b of open[j].area) if (patternsMeet(a, b)) shared.add(a.length >= b.length ? a : b)
      }
      if (shared.size) out.push({ specs: [open[i].spec, open[j].spec], paths: [...shared].sort() })
    }
  }
  return out
}

/**
 * Index the base branch's `specs/` from a `git ls-tree -r --name-only` listing:
 * folder → `{ bucket, phases: Map<n, path> }`. A folder in two buckets (a
 * `git mv` landed half-way) is filed where it is going, the later bucket.
 */
function indexSpecTree(listing) {
  const index = new Map()
  for (const line of String(listing || '').split('\n')) {
    const m = /^specs\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(line.trim())
    if (!m || !BUCKETS.includes(m[1])) continue
    const [, bucket, folder, file] = m
    let entry = index.get(folder)
    if (!entry || BUCKETS.indexOf(bucket) > BUCKETS.indexOf(entry.bucket)) {
      entry = { bucket, phases: new Map() }
      index.set(folder, entry)
    }
    if (entry.bucket !== bucket) continue
    const phase = /^(\d\d)-.+\.md$/.exec(file)
    if (phase && file !== '00-overview.md') entry.phases.set(Number(phase[1]), `specs/${bucket}/${folder}/${file}`)
  }
  return index
}

/**
 * Resolve one wait against the base branch.
 * @returns {{ state: 'met' | 'unmet' | 'cannot-tell', why: string }}
 */
function resolveWait(wait, index, readFile) {
  if (!wait.spec) return { state: 'cannot-tell', why: `"${wait.raw}" does not read as <spec>[ phase N]` }
  const target = index.get(wait.spec)
  if (!target) return { state: 'cannot-tell', why: `${wait.spec} is not on the base branch` }
  if (target.bucket === 'complete') return { state: 'met', why: `${wait.spec} is complete` }
  if (target.bucket === 'cancelled') return { state: 'unmet', why: `${wait.spec} was cancelled` }
  if (wait.phase === null) return { state: 'unmet', why: `${wait.spec} is ${target.bucket}` }
  const file = target.phases.get(wait.phase)
  if (!file) return { state: 'cannot-tell', why: `${wait.spec} has no phase ${wait.phase} on the base branch` }
  const text = readFile(file)
  if (text === null) return { state: 'cannot-tell', why: `${file} could not be read` }
  return phaseIsDone(text)
    ? { state: 'met', why: `${wait.spec} phase ${wait.phase} is done` }
    : { state: 'unmet', why: `${wait.spec} phase ${wait.phase} is not done` }
}

/**
 * Layer members into waves, off their START waits only. A whole-spec wait on
 * another member puts this one in a LATER wave; a wait on one of its phases
 * lets it share the wave — it starts once that phase lands, beside the rest of
 * that spec. A phase file's own wait never moves a wave: it holds that phase,
 * not the spec's start, and is reported as a sync point instead. Waits on specs
 * outside the epic order nothing here.
 *
 * A cycle is found and named, never guessed through: its members and anything
 * waiting on them are left out of the waves.
 */
function layer(members) {
  const byName = new Map(members.map((m) => [m.spec, m]))
  const edges = new Map(
    members.map((m) => [m.spec, m.waits.filter((w) => w.spec && byName.has(w.spec) && w.spec !== m.spec)]),
  )

  const cycles = []
  const state = new Map()
  const stack = []
  const visit = (name) => {
    state.set(name, 'open')
    stack.push(name)
    for (const w of edges.get(name)) {
      if (state.get(w.spec) === 'open') {
        const loop = stack.slice(stack.indexOf(w.spec))
        cycles.push([...loop, w.spec])
      } else if (!state.has(w.spec)) visit(w.spec)
    }
    stack.pop()
    state.set(name, 'done')
  }
  for (const m of members) if (!state.has(m.spec)) visit(m.spec)
  const inCycle = new Set(cycles.flat())

  const wave = new Map()
  const waveOf = (name, seen = new Set()) => {
    if (wave.has(name)) return wave.get(name)
    if (inCycle.has(name) || seen.has(name)) return null
    seen.add(name)
    let n = 1
    for (const w of edges.get(name)) {
      const dep = waveOf(w.spec, seen)
      if (dep === null) {
        wave.set(name, null)
        return null
      }
      n = Math.max(n, w.phase === null ? dep + 1 : dep)
    }
    wave.set(name, n)
    return n
  }
  for (const m of members) waveOf(m.spec)

  const waves = []
  for (const m of members) {
    const n = wave.get(m.spec)
    if (n == null) continue
    while (waves.length < n) waves.push([])
    waves[n - 1].push(m.spec)
  }
  return { waves, cycles, unlayered: members.filter((m) => wave.get(m.spec) == null).map((m) => m.spec) }
}

/**
 * The whole answer.
 *
 * @param {object} a
 *   - `epic`       the epic's folder name
 *   - `index`      `indexSpecTree` of the base branch
 *   - `readFile`   base-branch path → text, or null
 *   - `candidates` base-branch overview paths that may carry an `Epic:` header
 *   - `waitIndex`/`waitRead`  where a wait is resolved, when that is not where
 *                  members are read — `epic status --here` reads members off a
 *                  working tree and still meets a wait only on the base branch
 *   - `worktrees`  `[{ folder, bucket, overview, phases: [{ n, text }] }]` —
 *                  each provisioned spec's own copy, which is where an
 *                  in-flight spec's bucket and phase progress are true
 *   - `branches`   the same shape, read off spec branches this machine has no
 *                  worktree for (`env/specbranches.js`) — how a member that
 *                  rides its own branch is seen at all. It can make a member
 *                  VISIBLE and give it a bucket; it never meets a wait, which
 *                  is still read only off the base branch.
 */
function epicStatus({ epic, index, readFile, candidates = [], worktrees = [], branches = [], waitIndex = index, waitRead = readFile }) {
  const own = new Map(worktrees.map((w) => [w.folder, w]))
  const onBranch = new Map(branches.filter((b) => !own.has(b.folder)).map((b) => [b.folder, b]))
  const members = new Map()

  for (const file of candidates) {
    const m = /^specs\/([^/]+)\/([^/]+)\/00-overview\.md$/.exec(file)
    if (!m || m[2] === epic) continue
    const text = readFile(file)
    if (text === null) continue
    const h = epicHeaders(text)
    if (h.epic !== epic) continue
    const entry = index.get(m[2])
    const phases = entry ? [...entry.phases].map(([n, p]) => ({ n, text: readFile(p) })) : []
    members.set(m[2], { spec: m[2], waits: h.waitsOn, area: h.area, phases })
  }
  // A member authored on its own branch and not landed yet is invisible on the
  // base branch; its worktree copy is what knows it belongs here — or, with no
  // worktree on this machine, its branch's copy. The worktree is read last, so
  // it wins.
  for (const w of [...onBranch.values(), ...worktrees]) {
    const h = epicHeaders(w.overview)
    // The worktree's copy is the newer word on a spec being built: it may have
    // joined, changed its waits, or moved to another epic.
    if (h.epic === epic) members.set(w.folder, { spec: w.folder, waits: h.waitsOn, area: h.area, phases: w.phases || [] })
    else if (h.epic !== null) members.delete(w.folder)
  }

  const list = [...members.values()].sort((a, b) => a.spec.localeCompare(b.spec))
  for (const m of list) {
    const wt = own.get(m.spec)
    const base = index.get(m.spec)
    // In flight is the positive signal of a worktree whose own copy has not
    // finished; otherwise the base branch's bucket.
    const br = onBranch.get(m.spec)
    m.bucket = wt && !['complete', 'cancelled'].includes(wt.bucket) ? 'in-progress' : br ? br.bucket : base ? base.bucket : wt ? wt.bucket : null
    m.resolved = m.waits.map((w) => ({ ...w, ...resolveWait(w, waitIndex, waitRead) }))
    // A phase's own `Waits on:` holds that phase, not the spec's start: the
    // sync point the field example turned on (#154 phase 2 on #159 phase 1).
    // A phase already done has nothing left to wait for.
    m.phaseWaits = m.phases
      .filter((p) => p.text !== null && !phaseIsDone(p.text))
      .flatMap((p) =>
        epicHeaders(p.text).waitsOn.map((w) => ({ at: p.n, wait: { ...w, ...resolveWait(w, waitIndex, waitRead) } })),
      )
  }

  const epicEntry = index.get(epic)
  const epicOverview = epicEntry ? readFile(`specs/${epicEntry.bucket}/${epic}/00-overview.md`) : null
  const lanes = epicHeaders(epicOverview || (own.get(epic) || {}).overview || '').lanes

  const of = (bucket) => list.filter((m) => m.bucket === bucket)
  const waiting = of('backlog')
  const ready = waiting.filter((m) => m.resolved.every((w) => w.state === 'met'))
  const blocked = waiting.filter((m) => m.resolved.some((w) => w.state === 'unmet'))
  const cannotTell = waiting.filter((m) => !ready.includes(m) && !blocked.includes(m))
  const inFlight = of('in-progress')
  const { waves, cycles, unlayered } = layer(list.filter((m) => m.bucket !== 'cancelled'))
  // Every edge finer than "this spec waits for that one": a start held on
  // another spec's phase, and a phase of this spec held on anything. `phase`
  // is the member's own phase — null for its start.
  const open = list.filter((m) => m.bucket !== 'cancelled' && m.bucket !== 'complete')
  const syncPoints = [
    ...open.flatMap((m) => m.resolved.filter((w) => w.phase !== null).map((wait) => ({ spec: m.spec, phase: null, wait }))),
    ...open.flatMap((m) => m.phaseWaits.map(({ at, wait }) => ({ spec: m.spec, phase: at, wait }))),
  ]

  const brief = (m) => ({ spec: m.spec, waits: m.resolved })
  return {
    epic,
    found: Boolean(epicEntry || own.has(epic)),
    lanes,
    freeLanes: lanes === null ? null : Math.max(0, lanes - inFlight.length),
    members: list.map((m) => ({ spec: m.spec, bucket: m.bucket, waits: m.resolved })),
    ready: ready.map(brief),
    blocked: blocked.map((m) => ({ spec: m.spec, by: m.resolved.filter((w) => w.state === 'unmet') })),
    cannotTell: cannotTell.map((m) => ({ spec: m.spec, by: m.resolved.filter((w) => w.state === 'cannot-tell') })),
    inFlight: inFlight.map(brief),
    complete: of('complete').map((m) => m.spec),
    cancelled: of('cancelled').map((m) => m.spec),
    waves,
    syncPoints,
    clashes: clashes(list),
    cycles,
    unlayered,
  }
}

// `feat-a phase 2 after feat-b phase 1 — not done`, or `feat-a starts after …`.
function syncLine({ spec, phase, wait }) {
  const who = phase === null ? `${spec} starts` : `${spec} phase ${phase}`
  const mark = { met: 'met', unmet: 'not yet', 'cannot-tell': 'cannot tell' }[wait.state]
  return `${who} after ${wait.raw} (${mark} — ${wait.why})`
}

// Columns padded to their widest cell. Plain text, never a markdown table: the
// answer is read raw under `watch` as often as it is rendered (spec
// feat-epic-next, Decision 3), and a pipe table read raw is noise.
function aligned(lines, indent = '  ') {
  const widths = lines[0].map((_, i) => Math.max(...lines.map((l) => l[i].length)))
  return lines.map((l) => (indent + l.map((c, i) => (i === l.length - 1 ? c : c.padEnd(widths[i]))).join('  ')).trimEnd())
}

/**
 * The human answer: a headline, one row per member saying what to run and in
 * which tab, then the plan's shape — waves, sync points, clashes — wherever
 * there is something to say. `s.rows` comes from `epicRows`; a status without
 * them is rendered with nothing read off disk, so an in-flight member says it
 * cannot tell rather than guessing.
 */
function formatEpicStatus(s) {
  if (!s.found && !s.members.length) {
    return `no epic named ${s.epic}, and no spec names it as its Epic${s.here ? ` in ${s.here}` : ''}.\n`
  }
  const lanes = s.lanes === null ? 'no lane cap' : `${s.lanes} lanes, ${s.freeLanes} free`
  const where = s.here ? ` · headers from ${s.here}` : s.found ? '' : ' · epic not on the base branch'
  const head = `${s.epic} — ${s.members.length} member${s.members.length === 1 ? '' : 's'} · ${lanes}${where}`
  const out = [head, '']
  if (!s.members.length) {
    out.push(`  no members — no spec carries \`> **Epic:** ${s.epic}\``)
  } else {
    const { rows, next } = s.rows ? { rows: s.rows, next: s.next } : epicRows(s)
    const state = (r) => (r.bucket === 'in-progress' ? r.next.state : r.next.state || r.bucket || 'unknown')
    out.push(
      ...aligned([['member', 'state', 'next', 'tab'], ...rows.map((r) => [r.spec, state(r), actionText(r.next), r.tab || '—'])]),
    )
    if (next) out.push('', `  ${s.epic}: ${actionText(next)}`)
  }
  const shape = [
    ['waves', s.waves.map((w, i) => `${i + 1}: ${w.join(', ')}`).join(' · ')],
    ['sync points', s.syncPoints.map(syncLine).join(' · ')],
    ['never together', s.clashes.map((c) => `${c.specs.join(' ‖ ')} (${c.paths.join(', ')})`).join(' · ')],
    ['cycle', s.cycles.map((c) => c.join(' → ')).join(' · ')],
  ].filter(([, v]) => v)
  if (shape.length) out.push('', ...aligned(shape))
  return out.join('\n') + '\n'
}

/**
 * What starting or building one member should hear about — the half of
 * `epic check` that is about other members in flight. Each warning names the
 * in-flight member and the paths the two share. Never a refusal: `Area:` is
 * declared, not measured (Decision 4). A spec that is no member of anything
 * hears nothing.
 */
function memberCheck(status, spec, { phase = null, record = {} } = {}) {
  const flying = new Set(status.inFlight.map((m) => m.spec))
  const warnings = status.clashes
    .filter((c) => c.specs.includes(spec))
    .map((c) => ({ with: c.specs.find((x) => x !== spec), paths: c.paths }))
    .filter((c) => flying.has(c.with))
    .map((c) => ({ kind: 'clash', ...c, message: `${c.with} is in flight and edits ${c.paths.join(', ')} too` }))

  // THE WAITS this build stands behind: the spec's start, always — a start
  // bypassed at `/spec-start` is not asked again — and, with `phase`, that
  // phase's own. Read where the work happens, which is the whole point
  // (Decision 8): the field example's phase 2 was built because the place it
  // was built never read the plan.
  const member = status.members.find((m) => m.spec === spec)
  const bypassed = new Set(record.bypassed || [])
  const scoped = []
  if (member && !bypassed.has('start')) scoped.push(...member.waits.map((w) => ({ scope: 'start', wait: w })))
  if (phase !== null && !bypassed.has(`phase ${phase}`)) {
    for (const p of status.syncPoints) {
      if (p.spec === spec && p.phase === phase) scoped.push({ scope: `phase ${phase}`, wait: p.wait })
    }
  }
  const unmet = scoped.filter((s) => s.wait.state === 'unmet')
  for (const s of scoped.filter((x) => x.wait.state === 'cannot-tell')) {
    warnings.push({ kind: 'cannot-tell', message: `cannot tell whether ${s.wait.raw} has landed — ${s.wait.why}` })
  }

  const result = { spec, epic: status.epic, phase, warnings, blocked: unmet.length > 0 }
  if (!unmet.length) return result
  const what = phase === null ? `${spec}'s start` : `${spec} phase ${phase}`
  result.scopes = [...new Set(unmet.map((s) => s.scope))]
  result.reason =
    `${what} waits on ${unmet.map((s) => `${s.wait.raw} (${s.wait.why})`).join(', ')} — ` +
    `land that first, or build anyway with: skitterspec epic bypass ${spec}${phase === null ? '' : ` --phase ${phase}`}`
  // Offered ONCE per obligation (`.claude/rules/offered-unblocks.md`): spent by
  // being raised, recorded by `--offered`, so a re-run is a plain refusal.
  const key = phase === null ? 'start' : `phase ${phase}`
  if (!(record.offered || []).includes(key)) {
    result.offer = {
      kind: 'bypass',
      label: 'Build it anyway — the wait is recorded as passed over',
      command: `skitterspec epic bypass ${spec}${phase === null ? '' : ` --phase ${phase}`}`,
    }
  }
  return result
}

/**
 * The dated Changelog line a bypass leaves on the member spec — where the next
 * reader of that spec, and phase 7's re-verify, will find it.
 */
function bypassLine(check, date) {
  const what = check.phase === null ? 'Started' : `Built phase ${check.phase}`
  return `- ${date} — ${what} past an unmet wait (epic check bypass, ${check.epic}): ${check.reason.split(' — land that first')[0]}.`
}

// Append `line` to the overview's `## Changelog`, which ends the file in every
// spec the skills write; a spec without one gains the section.
function appendChangelog(text, line) {
  const body = text.replace(/\s*$/, '')
  return /^## Changelog\s*$/m.test(body) ? `${body}\n${line}\n` : `${body}\n\n## Changelog\n\n${line}\n`
}

/**
 * Waits a landing's rebase will MEET — the field case behind Decision 9: a
 * phase built before the phase it waited on had landed, then rebased over it,
 * lands in the right order without ever having run with the dependency
 * underneath. A rebase satisfies the order, not the intent.
 *
 * Asked of two readings of the base branch — `before` at the spec's fork
 * point, `after` at the base it is about to land on — and of the spec's own
 * DONE phases (a phase not yet built will be built on top anyway). A wait is
 * listed only on a positive signal from BOTH reads: unmet before, met after.
 * Cannot-tell on either side is reported as such and never claimed — the cost
 * of a wrong "met by this rebase" is a re-run nobody needed, but the cost of
 * inventing one is a re-run claim nobody can check.
 *
 * @param {object} a
 *   - `overview`  the spec's own overview text (its start waits)
 *   - `phases`    `[{ n, text }]`, the spec's own phase files
 *   - `before`    `{ index, readFile }` at the fork point
 *   - `after`     `{ index, readFile }` at the base being landed on
 * @returns {{ met: [{ phase, wait }], cannotTell: [{ phase, wait }] }}
 *   `phase` is the spec's phase number, or null for its start's waits.
 */
function waitsMetByRebase({ overview, phases = [], before, after }) {
  const built = phases.filter((p) => p.text !== null && phaseIsDone(p.text))
  const scoped = [
    ...(built.length ? epicHeaders(overview || '').waitsOn.map((w) => ({ phase: null, w })) : []),
    ...built.flatMap((p) => epicHeaders(p.text).waitsOn.map((w) => ({ phase: p.n, w }))),
  ]
  const met = []
  const cannotTell = []
  for (const { phase, w } of scoped) {
    const was = resolveWait(w, before.index, before.readFile)
    const now = resolveWait(w, after.index, after.readFile)
    if (now.state !== 'met' || was.state === 'met') continue
    const wait = { ...w, why: now.why }
    if (was.state === 'unmet') met.push({ phase, wait })
    else cannotTell.push({ phase, wait: { ...wait, why: `${was.why} at the fork point` } })
  }
  return { met, cannotTell }
}

module.exports = {
  waitsMetByRebase,
  epicStatus,
  formatEpicStatus,
  epicHeaders,
  parseWaitsOn,
  parseArea,
  patternsMeet,
  indexSpecTree,
  resolveWait,
  layer,
  memberCheck,
  bypassLine,
  appendChangelog,
}
