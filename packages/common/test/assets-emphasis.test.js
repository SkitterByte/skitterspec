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
  return out
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
