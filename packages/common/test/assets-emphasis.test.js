'use strict'

/**
 * `.claude/rules/spec-planning.md` says never let inline emphasis or a link
 * cross a hard line break — keep a whole `**bold**`, `*italic*` or `[text](url)`
 * on one line, letting it overflow the wrap column. The reason is mechanical:
 * many round-tripping editors mangle a span that straddles a newline, so the
 * rule protects the source from being rewritten by whatever opens it next.
 *
 * The rule was stated and then not followed — 20 spans across 11 skills, most of
 * them older than the rule. A rule nothing enforces is a rule that decays, so
 * this is the enforcement: prose is data here, shipped verbatim into other
 * people's repos, and it is worth linting like code.
 *
 * Deliberately narrow. It counts `**` only, and ignores a JSDoc `/**` opener and
 * a glob like `specs/**` inside backticks — both carry `**` without being
 * emphasis at all.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..', '..')

// Source asset trees only. The `packages/skitterspec*` trees are composed FROM
// these and gitignored, so linting them reports every failure twice and could
// never be fixed there.
const TREES = ['packages/common/assets', 'packages/linear/assets']

// Committed markdown OUTSIDE the asset trees that ships or is read anyway: the
// migration guide (copied into both tarballs), the repo and package READMEs.
//
// These are listed rather than walked because the packages/skitterspec* trees
// around them ARE composed output — a walk would drag in the gitignored copies
// TREES deliberately excludes. A README in those directories is committed and
// fixable; everything beside it is not.
//
// They were unguarded until the guide picked up nine straddling spans across
// five files, two of them written the same day the rule was being enforced
// three directories away. The rule was never assets-only; the guard was.
function looseProse() {
  return [
    'MIGRATION.md',
    'README.md',
    'RELEASING.md',
    'packages/common/README.md',
    'packages/linear/README.md',
    'packages/skitterspec/README.md',
    'packages/skitterspec-linear/README.md',
  ]
    .map((rel) => path.join(ROOT, rel))
    .filter((p) => fs.existsSync(p))
}

function proseFiles() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) out.push(p)
    }
  }
  for (const t of TREES) {
    const dir = path.join(ROOT, t)
    if (fs.existsSync(dir)) walk(dir)
  }
  return [...out, ...looseProse()]
}

// A line with an odd number of `**` opens or closes a span that the next line
// finishes — i.e. the span crosses the break.
function offendingLines(file) {
  const out = []
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  let inFence = false
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (inFence) return
    const stripped = line.replace(/`[^`]*`/g, '').replace(/\/\*\*/g, '')
    if (stripped.split('**').length - 1 === 0) return
    if ((stripped.split('**').length - 1) % 2 === 1) out.push(i + 1)
  })
  return out
}

test('the loose-prose list points at files that exist', () => {
  // A list of paths is only a guard while the paths resolve. A rename would
  // silently shrink the checked set to nothing and the suite would still pass,
  // which is the failure mode a filter on existsSync invites.
  const found = looseProse()
  assert.ok(found.length >= 4, `expected the root prose files, got ${found.length}`)
  assert.ok(
    found.some((p) => p.endsWith('MIGRATION.md')),
    'the migration guide is checked — it ships in both tarballs',
  )
})

test('stays silent: a bold span that stays on its line passes', () => {
  // Proves the line-parity heuristic is not simply firing on every `**`.
  const tmp = path.join(require('node:os').tmpdir(), 'skitterspec-emphasis-ok.md')
  fs.writeFileSync(tmp, ['**one line**', 'plain text', '`specs/**` in backticks', '**a** and **b**'].join('\n'))
  assert.deepStrictEqual(offendingLines(tmp), [])
  fs.writeFileSync(tmp, ['**this one', 'straddles**'].join('\n'))
  assert.deepStrictEqual(offendingLines(tmp), [1, 2], 'and it does fire when a span straddles')
  fs.rmSync(tmp, { force: true })
})

test('no bold span crosses a hard line break in shipped prose', () => {
  const bad = []
  for (const file of proseFiles()) {
    const lines = offendingLines(file)
    if (lines.length) bad.push(`${path.relative(ROOT, file)}: line(s) ${lines.join(', ')}`)
  }
  assert.deepStrictEqual(
    bad,
    [],
    'a **bold** span must stay on one line — let it overflow the wrap column:\n  ' +
      bad.join('\n  '),
  )
})
