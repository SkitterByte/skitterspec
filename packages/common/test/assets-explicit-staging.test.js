'use strict'

/**
 * THE INVARIANT: no shipped instruction stages a directory.
 *
 * `/spec-complete` and `/spec-cancel` both used to say `git add specs/`, and on
 * 2026-09-13 that put one session's in-progress spec into another session's
 * commit, under the wrong ticket trailer. Several specs authored at once is the
 * normal shape of this workflow, not an edge case, so the instruction was wrong
 * every time it was followed and merely usually got away with it.
 *
 * A BLANKET BAN ON THE STRING WOULD BE WRONG, and would be deleted rather than
 * fixed the first time it fired. Both skills now name the anti-pattern in prose
 * — "Never `git add specs/`" — which is the sentence that keeps it from coming
 * back, and a test that failed on it would be demanding its own removal. So only
 * FENCED COMMANDS are read: prose may discuss anything, and a command must be
 * explicit. That is also what makes the check safe to point at seams and rules,
 * which are mostly prose about commands.
 *
 * WHAT WOULD FOOL THIS: an instruction written outside a fence. That is a real
 * blind spot and it is the safe one — a fence is how every one of these files
 * gives a command, so an unfenced one would not read as a command to follow.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ROOTS = [
  path.join(__dirname, '..', 'assets'),
  path.join(__dirname, '..', '..', 'linear', 'assets'),
]

// Every shipped markdown asset: skills, seams and rules alike.
function assetFiles() {
  const out = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.md')) out.push(p)
    }
  }
  for (const r of ROOTS) walk(r)
  return out
}

// The lines inside ``` fences — the ones a reader runs.
function fencedLines(text) {
  const out = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) out.push(line)
  }
  return out
}

// `git add` staging a DIRECTORY or everything: a bare `specs/`, any trailing
// slash, `-A`, or `.`. A placeholder like `<the owned paths>` is explicit by
// construction — it is the caller substituting named paths.
function stagesBroadly(line) {
  const m = line.match(/git add\s+(.*)$/)
  if (!m) return false
  const args = m[1].trim()
  if (/(^|\s)(-A|--all|\.)(\s|$)/.test(args)) return true
  // Strip the `--` separator, then look for any argument ending in a slash.
  const operands = args
    .replace(/(^|\s)--(\s|$)/, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((a) => a.replace(/^["']|["']$/g, ''))
  return operands.some((a) => a.endsWith('/'))
}

// The positive half: a check nobody can see fire is a check nobody trusts. This
// feeds the detector the exact line the incident was caused by, plus the forms a
// future edit would most plausibly reach for.
test('the detector catches the forms this exists to stop', () => {
  for (const line of [
    'git add specs/ && git commit -m "chore(spec): cancel <name>"',
    'git add -A',
    'git add .',
    'git add "specs/in-progress/"',
  ]) {
    assert.ok(stagesBroadly(line), `should be caught: ${line}`)
  }
  for (const line of [
    'git add -- "specs/in-progress/feat-x/00-overview.md"',
    'git add -- <the owned paths>',
    'git commit -m "chore(spec): complete <name>" -- <the owned paths>',
  ]) {
    assert.ok(!stagesBroadly(line), `should be allowed: ${line}`)
  }
})

test('no shipped command stages a directory', () => {
  const offenders = []
  for (const file of assetFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of fencedLines(text)) {
      if (stagesBroadly(line)) offenders.push(`${path.relative(ROOTS[0], file)}: ${line.trim()}`)
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'these stage a directory — name the paths instead ' +
      '(`skitterspec spec-env stage <name>` lists them):\n  ' +
      offenders.join('\n  '),
  )
})

test('every fenced spec commit is bounded by a pathspec', () => {
  const offenders = []
  for (const file of assetFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of fencedLines(text)) {
      if (!/git commit\b/.test(line)) continue
      // Only the lifecycle spec commits are in scope: they are the ones a second
      // session's index can contaminate. A commit shown for any other purpose
      // (an example, a hotfix tag) is not this invariant's business.
      if (!/chore\(spec\)/.test(line)) continue
      if (!line.includes(' -- ')) offenders.push(`${path.relative(ROOTS[0], file)}: ${line.trim()}`)
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    'these commit without a pathspec, so another session’s staged work rides ' +
      'along:\n  ' +
      offenders.join('\n  '),
  )
})

// STAYS-SILENT: the prose that names the anti-pattern is the thing keeping it
// from returning. If this check ever fails on it, the check is wrong.
test('prose naming the anti-pattern is not an offence', () => {
  const complete = fs.readFileSync(
    path.join(ROOTS[0], 'skills', 'spec-complete', 'SKILL.md'),
    'utf8',
  )
  assert.match(complete, /Never `git add specs\/`/, 'the warning is present')
  assert.ok(
    !fencedLines(complete).some(stagesBroadly),
    'and it is prose, so the check above does not see it',
  )
})
