'use strict'

/**
 * No shipped surface may claim that provisioning publishes the spec's branch.
 *
 * The claim was load-bearing in four places when the push was removed — it
 * justified the remote-delete prompt in `/spec-complete`, it justified `-D` over
 * `-d` in `env/teardown.js`, and it appeared in two test comments. None of them
 * was found by a test; they were found by grepping, after the behaviour had
 * already changed. A claim like that is exactly the kind that survives a
 * behaviour change: it explains something rather than doing it, so nothing goes
 * red when it stops being true.
 *
 * The guard is deliberately about the CLAIM, not about the word "push": the
 * surfaces are allowed — required, even — to talk about publishing a branch, and
 * `/spec-start` prints the very command. What none of them may say is that it
 * happens at provisioning time, or that something other than the user did it.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const COMMON = path.join(__dirname, '..')
const REPO = path.join(COMMON, '..', '..')

function shippedSurfaces() {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(md|js)$/.test(entry.name)) files.push(full)
    }
  }
  walk(path.join(COMMON, 'assets'))
  walk(path.join(COMMON, 'src'))
  walk(path.join(REPO, 'packages', 'linear', 'assets'))
  walk(path.join(REPO, 'packages', 'linear', 'src'))
  files.push(path.join(REPO, 'MIGRATION.md'))
  return files
}

// Phrasings that assert the tooling published the branch itself. Each is the
// shape of a real claim removed in this spec, generalised just enough to catch
// the same sentence rewritten.
const CLAIMS_PROVISIONING_PUSHES = [
  /\/spec-start`? push(es|ed)\b(?![^.]*\bto Linear\b)/,
  /push(es|ed)? the branch (at|when it) provision/i,
  /pushes the branch when it provisions/i,
  /\bpushed this branch when it provisioned\b/i,
]

test('no shipped surface claims provisioning publishes the branch', () => {
  const offenders = []
  for (const file of shippedSurfaces()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const re of CLAIMS_PROVISIONING_PUSHES) {
      const m = text.match(re)
      if (m) offenders.push(`${path.relative(REPO, file)}: ${m[0]}`)
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `a surface still claims provisioning publishes the branch:\n${offenders.join('\n')}`,
  )
})

test('the guard would fire on each claim this spec removed', () => {
  // The positive half: these are the four real sentences, verbatim. A guard that
  // cannot catch what it was written for is decoration.
  const removed = [
    '   `/spec-start` pushed this branch when it provisioned, so the remote copy',
    '  // `/spec-start` pushes the branch when it provisions, and the phase commits after',
    '  // `/spec-start` pushes the branch at provision time, so a completed spec otherwise',
    '// `/spec-start` pushes the branch at provision time, so without this a completed',
  ]
  for (const line of removed) {
    assert.ok(
      CLAIMS_PROVISIONING_PUSHES.some((re) => re.test(line)),
      `guard would not catch: ${line.trim()}`,
    )
  }
})

test('stays silent: the surfaces may still discuss publishing', () => {
  // The healthy shapes. A guard that fails these gets deleted rather than fixed
  // — and one of them is /spec-start's own printed command.
  const innocent = [
    'git -C <worktreePath> push -u origin <branch>',
    '**Publishing that branch is yours to do, and nothing here does it for you.**',
    'publish it first — keeps the work reachable, then re-run /spec-cancel:',
    'A hand-published spec branch otherwise leaves a merged branch on the remote',
    '`/spec-start` now pushes to Linear itself, right after it commits the move.',
    'Spec branches stop appearing on the remote.',
  ]
  for (const line of innocent) {
    assert.ok(
      !CLAIMS_PROVISIONING_PUSHES.some((re) => re.test(line)),
      `legitimate line was flagged: ${line.trim()}`,
    )
  }
})

test('the migration guide states both breaking changes', () => {
  // They are the two an upgrader notices without touching their config, so a
  // later edit tidying the entry must not drop them silently.
  const guide = fs.readFileSync(path.join(REPO, 'MIGRATION.md'), 'utf8')
  assert.match(guide, /`\/spec-start` no longer pushes the spec's branch/)
  assert.match(guide, /Spec branches stop appearing on the remote/)
  assert.match(guide, /Cancelling a spec with unpublished work now refuses/)
  assert.match(guide, /`spec-sync push` is now `spec-sync plan`/)
  assert.match(guide, /Do not search-and-replace `push` in your config/)
})
