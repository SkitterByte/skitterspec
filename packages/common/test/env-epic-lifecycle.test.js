'use strict'

// The lifecycle half of epics (spec feat-epics, phase 4): `epic check` asked
// where the work happens, its bypass offered once and recorded, an epic's own
// tree documents-only, members grouped under their epic in `status`, and the
// skills that relay all of it.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { epicStatus, indexSpecTree, memberCheck, bypassLine, appendChangelog } = require('../src/env/epic.js')
const { formatInFlight } = require('../src/env/inflight.js')
const { run } = require('../src/cli.js')

const EPIC = 'epic-x'
const overview = (waits = null) => ['# A spec', '', `> **Epic:** ${EPIC}`, waits ? `> **Waits on:** ${waits}` : null, ''].filter((l) => l !== null).join('\n')
const phase = (done, waits = null) =>
  `# Phase — ${done ? '✅' : '⬜'}\n\n> **Status:** ${done ? 'Done' : 'Not started'}\n${waits ? `> **Waits on:** ${waits}\n` : ''}`

// feat-b waits to start on feat-a; feat-c's phase 2 waits on feat-a phase 1.
function status(files, worktrees = []) {
  const readFile = (p) => (p in files ? files[p] : null)
  const candidates = Object.keys(files).filter((p) => p.endsWith('/00-overview.md'))
  return epicStatus({ epic: EPIC, index: indexSpecTree(Object.keys(files).join('\n')), readFile, candidates, worktrees })
}
const FILES = {
  'specs/backlog/feat-a/00-overview.md': overview(),
  'specs/backlog/feat-a/01-x.md': phase(false),
  'specs/backlog/feat-b/00-overview.md': overview('feat-a'),
  'specs/backlog/feat-c/00-overview.md': overview(),
  'specs/backlog/feat-c/01-x.md': phase(false),
  'specs/backlog/feat-c/02-y.md': phase(false, 'feat-a phase 1'),
  'specs/backlog/feat-d/00-overview.md': overview('feat-ghost'),
}

test('an unmet start wait is blocked, with a bypass offer naming the command', () => {
  const r = memberCheck(status(FILES), 'feat-b')
  assert.strictEqual(r.blocked, true)
  assert.deepStrictEqual(r.scopes, ['start'])
  assert.match(r.reason, /^feat-b's start waits on feat-a \(feat-a is backlog\)/)
  assert.deepStrictEqual(r.offer, {
    kind: 'bypass',
    label: 'Build it anyway — the wait is recorded as passed over',
    command: 'skitterspec epic bypass feat-b',
  })
})

// The field case: the start is free, phase 2 is not.
test('a phase wait holds that phase only', () => {
  const s = status(FILES)
  assert.strictEqual(memberCheck(s, 'feat-c').blocked, false, 'the start has no wait')
  assert.strictEqual(memberCheck(s, 'feat-c', { phase: 1 }).blocked, false, 'phase 1 has none either')
  const p2 = memberCheck(s, 'feat-c', { phase: 2 })
  assert.strictEqual(p2.blocked, true)
  assert.match(p2.reason, /^feat-c phase 2 waits on feat-a phase 1 \(feat-a phase 1 is not done\)/)
  assert.strictEqual(p2.offer.command, 'skitterspec epic bypass feat-c --phase 2')
})

test('the offer is spent by being raised: a second ask is a plain refusal', () => {
  const r = memberCheck(status(FILES), 'feat-c', { phase: 2, record: { offered: ['phase 2'] } })
  assert.strictEqual(r.blocked, true)
  assert.strictEqual(r.offer, undefined)
  assert.match(r.reason, /skitterspec epic bypass feat-c --phase 2$/, 'the exit is still named in the reason')
})

test('a recorded bypass is not asked again, and covers only its scope', () => {
  const s = status(FILES)
  assert.strictEqual(memberCheck(s, 'feat-c', { phase: 2, record: { bypassed: ['phase 2'] } }).blocked, false)
  assert.strictEqual(memberCheck(s, 'feat-b', { record: { bypassed: ['phase 2'] } }).blocked, true)
  assert.strictEqual(memberCheck(s, 'feat-b', { phase: 1, record: { bypassed: ['start'] } }).blocked, false)
})

test('a cannot-tell wait warns and does not block', () => {
  const r = memberCheck(status(FILES), 'feat-d')
  assert.strictEqual(r.blocked, false)
  assert.deepStrictEqual(r.warnings.map((w) => w.kind), ['cannot-tell'])
  assert.match(r.warnings[0].message, /feat-ghost is not on the base branch/)
})

// STAYS-SILENT: a member with no waits, and a spec in no epic.
test('a member with nothing in its way hears nothing', () => {
  assert.deepStrictEqual(memberCheck(status(FILES), 'feat-a', { phase: 1 }), {
    spec: 'feat-a',
    epic: EPIC,
    phase: 1,
    warnings: [],
    blocked: false,
  })
})

test('a met wait is not blocked', () => {
  const files = { ...FILES, 'specs/backlog/feat-a/01-x.md': phase(true) }
  assert.strictEqual(memberCheck(status(files), 'feat-c', { phase: 2 }).blocked, false)
})

test('the bypass line names the scope, the epic and what was passed over', () => {
  const r = memberCheck(status(FILES), 'feat-c', { phase: 2 })
  assert.strictEqual(
    bypassLine(r, '2026-11-10'),
    '- 2026-11-10 — Built phase 2 past an unmet wait (epic check bypass, epic-x): ' +
      'feat-c phase 2 waits on feat-a phase 1 (feat-a phase 1 is not done).',
  )
})

test('appendChangelog adds to the section, or adds the section', () => {
  assert.strictEqual(appendChangelog('# X\n\n## Changelog\n\n- a\n\n', '- b'), '# X\n\n## Changelog\n\n- a\n- b\n')
  assert.strictEqual(appendChangelog('# X\n', '- b'), '# X\n\n## Changelog\n\n- b\n')
})

test('skitterspec epic bypass refuses without a worktree, writing nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-bypass-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' }).toString()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.invalid')
  git('config', 'user.name', 'T')
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  git('add', '-A')
  git('commit', '-q', '-m', 'plan')
  const bin = path.join(__dirname, '..', 'bin', 'skitterspec.js')
  let out = ''
  try {
    execFileSync('node', [bin, 'epic', 'bypass', 'feat-b', '--dir', dir], { stdio: 'pipe' })
  } catch (err) {
    out = err.stdout.toString()
  }
  assert.match(out, /has no worktree to record it in/)
  assert.strictEqual(git('status', '--porcelain'), '', 'nothing written')
  assert.match(
    execFileSync('node', [bin, 'epic', 'bypass', 'feat-a', '--dir', dir]).toString(),
    /feat-a has no unmet wait — nothing recorded/,
  )
  // `--offered` spends the offer; the next check carries none.
  execFileSync('node', [bin, 'epic', 'check', 'feat-b', '--offered', '--dir', dir])
  const again = JSON.parse(execFileSync('node', [bin, 'epic', 'check', 'feat-b', '--json', '--dir', dir]).toString())
  assert.strictEqual(again.blocked, true)
  assert.strictEqual(again.offer, undefined)
})

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

test('spec-env up gives an epic a documents-only tree, with or without --docs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-epic-up-'))
  try {
    fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ worktree: { root: '../{repo}-wt', folderPattern: '{slug}' }, setup: ['pnpm install'] }),
    )
    fs.mkdirSync(path.join(dir, 'specs', 'backlog', EPIC), { recursive: true })
    fs.writeFileSync(path.join(dir, 'specs', 'backlog', EPIC, '00-overview.md'), '# X\n\n> **Type:** Epic\n')
    const out = await runQuiet(['spec-env', 'up', EPIC, '--dir', dir])
    assert.match(out, /docs:\s+documents only/)
    assert.doesNotMatch(out, /pnpm install/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
  }
})

test('skitterspec status lists members under their epic; others print as before', () => {
  const row = (spec, epic) => ({ spec, worktree: `/r-wt/${spec}`, specless: false, found: true, bucket: 'in-progress', here: 'backlog', phasesDone: 0, phasesTotal: 2, currentPhase: 1, status: null, developer: null, epic })
  const out = formatInFlight([row('feat-a', EPIC), row('feat-loner', null), row('feat-b', EPIC)], { dir: '/r' })
  const lines = out.split('\n')
  const at = (s) => lines.findIndex((l) => l.includes(s))
  assert.ok(at('feat-loner') < at(EPIC), 'a spec in no epic comes first')
  assert.match(lines[at(EPIC)], /^ {2}epic-x$/)
  assert.match(lines[at('feat-a ')], /^ {4}feat-a/)
  assert.match(lines[at('feat-b ')], /^ {4}feat-b/)
  assert.match(lines[at('feat-loner')], /^ {2}feat-loner/)
})

const asset = (...p) => fs.readFileSync(path.join(__dirname, '..', 'assets', ...p), 'utf8')

test('/spec-next refuses an epic and asks a member\'s epic before each phase', () => {
  const text = asset('skills', 'spec-next', 'SKILL.md')
  assert.match(text, /\*\*An epic has no phases to build\.\*\*/)
  assert.match(text, /skitterspec epic check <spec> --phase <N> --json/)
  assert.match(text, /skitterspec epic check <spec> --phase <N> --offered/)
  assert.match(text, /\*\*It warns; it never refuses on its own\.\*\*/)
})

test('/spec-start relays a blocked start and offers the bypass once', () => {
  const text = asset('skills', 'spec-start', 'SKILL.md')
  assert.match(text, /skitterspec epic check <name> --offered/)
  assert.match(text, /\*\*An epic has no phase 1\.\*\*/)
})

test('/spec-complete refuses an epic with open members and offers completion', () => {
  const text = asset('skills', 'spec-complete', 'SKILL.md')
  assert.match(text, /### An epic — complete after its members/)
  assert.match(text, /Only for `Type: Epic` specs/)
  assert.match(text, /complete anyway with them listed as outstanding/)
})

test('spec-planning names the Epic kind, its headers and the migration', () => {
  const rule = asset('rules', 'spec-planning.md')
  assert.ok(rule.includes('epic-<name>'), 'the prefix is listed')
  assert.match(rule, /> \*\*Type:\*\* Epic/)
  for (const h of ['Epic:', 'Waits on:', 'Lanes:']) assert.ok(rule.includes(`> **${h}**`), h)
  assert.match(rule, /\*\*Migrating an `issue-` plan spec to an epic\.\*\*/)
})
