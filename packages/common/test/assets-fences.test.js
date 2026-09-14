'use strict'

/**
 * A fenced block is for a command to run, code, or engine output quoted
 * verbatim — never for a message addressed to the reader.
 *
 * The report contract was rewritten from a fenced block to a table because the
 * first person to receive one read it as code the model had written and missed
 * the row telling them what to do next. That mechanism is not specific to
 * reports: `/spec-start` asked "build phase 1 now?" inside a grey box for
 * months, and an operator read straight past it to the next thing.
 *
 * So this classifies every fenced block in every shipped skill:
 *
 *   command        a line beginning git / skitterspec / npm / …  — copied, fine
 *   structured     JSON, a markdown table, a spec header          — compared, fine
 *   allowlisted    quoted engine output, named below with a reason
 *   reader-facing  everything else — fails
 *
 * The classifier is a heuristic and will be wrong occasionally. The allowlist is
 * where being wrong gets RECORDED rather than argued, which is why every entry
 * carries a reason: an allowlist of bare names is indistinguishable from a guard
 * nobody maintains.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')

// Source trees only. `packages/skitterspec*` are composed FROM these and
// gitignored, so linting them reports every failure twice and could never be
// fixed there.
const PKGS = ['common', 'linear']

function skills() {
  const out = []
  for (const pkg of PKGS) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets', 'skills')
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name, 'SKILL.md')
      if (e.isDirectory() && fs.existsSync(file)) out.push([`${pkg}/${e.name}`, file])
    }
  }
  return out.sort()
}

const RUNNERS = /^\s*(git|skitterspec(-\w+)?|npm|pnpm|npx|yarn|node|mkdir|cd|docker|ln|rm)\b/m

// Engine output and samples that are legitimately quoted verbatim. Keyed by
// skill, matched on the block's first line. Each carries WHY it is exempt.
const ALLOWED = {
  'linear/spec-list': [
    ['sortOrder is unavailable over MCP', 'the caveat line the skill must print verbatim'],
    ['Linear unreachable', 'the degradation banner, quoted so its wording is exact'],
  ],
  'linear/spec-linear-setup': [
    ['states.complete:', "a sample of the engine's refusal output"],
    ['--stage test=', 'CLI flags, which are copied rather than read'],
    ['"spec": {', 'a config fragment the user pastes'],
  ],
  'linear/spec-sync': [['apply --all backlog would:', 'a sample of the plan the engine prints']],
  'common/spec-reviewed': [
    ['pending:', "a sample of the render's pending block, which the skill reads a code out of"],
  ],
}

function classify(label, block) {
  const first = block.trim().split('\n')[0] || ''
  if (RUNNERS.test(block)) return 'command'
  const t = block.trim()
  if (t.startsWith('{') || t.startsWith('[') || t.startsWith('|') || t.startsWith('> **')) return 'structured'
  if (/^#{1,4} /m.test(t) || /^- \[[ x]\]/m.test(t)) return 'structured'
  for (const [prefix] of ALLOWED[label] || []) {
    if (first.startsWith(prefix)) return 'allowlisted'
  }
  return 'reader-facing'
}

const blocks = (text) =>
  [...text.matchAll(/^```[a-z]*\n([\s\S]*?)^```/gm)].map((m) => m[1])

test('the corpus is readable, or this guard is vacuous', () => {
  const found = skills()
  assert.ok(found.length > 10, `found the skills, got ${found.length}`)
  const total = found.reduce((n, [, f]) => n + blocks(fs.readFileSync(f, 'utf8')).length, 0)
  assert.ok(total > 20, `found fenced blocks to classify, got ${total}`)
})

test('no skill fences a message to the reader', () => {
  const hits = []
  for (const [label, file] of skills()) {
    for (const b of blocks(fs.readFileSync(file, 'utf8'))) {
      if (classify(label, b) === 'reader-facing') {
        hits.push(`${label}: ${(b.trim().split('\n')[0] || '').slice(0, 70)}`)
      }
    }
  }
  assert.deepStrictEqual(hits, [], `a message to the reader is fenced:\n${hits.join('\n')}`)
})

// A stale allowlist silently widens the guard: an entry whose block was deleted
// or reworded goes on exempting a prefix nothing matches, and the next block
// starting that way is exempted for free.
//
// MATCHING A BLOCK IS NOT ENOUGH, and asserting only that was this test's own
// first mistake. An entry for a block the classifier already accepts some other
// way — a JSON sample is `structured` before the allowlist is ever consulted —
// matches happily while exempting nothing, so it reads as a maintained
// exemption and is really dead text. Each entry must be LOAD-BEARING: remove it
// and its block becomes reader-facing.
test('every allowlist entry is still load-bearing', () => {
  const byLabel = new Map(skills())
  for (const [label, entries] of Object.entries(ALLOWED)) {
    const file = byLabel.get(label)
    assert.ok(file, `allowlist names ${label}, which does not ship`)
    const found = blocks(fs.readFileSync(file, 'utf8'))
    for (const [prefix, reason] of entries) {
      assert.ok(reason && reason.length > 10, `${label}: "${prefix}" needs a reason, got "${reason}"`)
      const matched = found.filter((b) => (b.trim().split('\n')[0] || '').startsWith(prefix))
      assert.ok(
        matched.length > 0,
        `${label}: allowlisted "${prefix}" matches no block any more — remove the entry`,
      )
      // Without the entry, would it actually fail? If not, the entry is dead.
      const without = { ...ALLOWED, [label]: entries.filter((e) => e[0] !== prefix) }
      const saved = ALLOWED[label]
      ALLOWED[label] = without[label]
      const nowFacing = matched.some((b) => classify(label, b) === 'reader-facing')
      ALLOWED[label] = saved
      assert.ok(
        nowFacing,
        `${label}: "${prefix}" exempts nothing — the classifier accepts that block anyway, so the entry is dead text`,
      )
    }
  }
})

// --- stays silent -----------------------------------------------------------
//
// `.claude/rules/negative-checks.md` rule 3. The test above proves the guard can
// fire; these prove it does not fire at the ~17 legitimate blocks beside the two
// that were wrong. Without this, the pressure is always toward allowlisting one
// more thing to keep a checker quiet.
test('commands, structured samples and allowlisted output all pass', () => {
  const ok = [
    ['x/y', 'git -C <path> rebase main'],
    ['x/y', 'skitterspec spec-env up <name>'],
    ['x/y', '{\n  "spec": { "phases": "subissue" }\n}'],
    ['x/y', '| Date | Status |\n|------|--------|'],
    ['x/y', '> **Status:** In Progress'],
    ['x/y', '- [ ] a task checkbox'],
    ['linear/spec-sync', 'apply --all backlog would:\n  create 3 issues'],
  ]
  for (const [label, block] of ok) {
    assert.notStrictEqual(classify(label, block), 'reader-facing', `wrongly flagged: ${block.slice(0, 40)}`)
  }
})

test('the guard fires on the two shapes this phase removed', () => {
  const bad = [
    'worktree ready — this session is now in it:\n  <path>\n\nbuild phase 1 now?',
    'start one with: /spec-start <name>',
  ]
  for (const block of bad) {
    assert.strictEqual(classify('common/spec-start', block), 'reader-facing', `missed: ${block.slice(0, 40)}`)
  }
})
