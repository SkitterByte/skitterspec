'use strict'

/**
 * The skill wiring of autonomous runs (feat-autonomous-run, phase 5). Prose is
 * the only place this behaviour lives, so the sentences it hangs on are pinned.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS = path.join(__dirname, '..', 'assets', 'skills')
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8')

const NEXT = read('spec-next', 'SKILL.md')
const AUTO = read('spec-next', 'autonomous.md')
const START = read('spec-start', 'SKILL.md')
const DIFF = read('spec-diff', 'SKILL.md')
const COMPLETE = read('spec-complete', 'SKILL.md')
const SPEC = read('spec', 'SKILL.md')

test('/spec-next asks the engine which mode, and hands an auto run to autonomous.md', () => {
  assert.match(NEXT, /spec-env run resolve <spec>/)
  assert.match(NEXT, /\[`autonomous\.md`\]\(autonomous\.md\)/)
  assert.match(NEXT, /On `supervised`, the default everywhere/)
})

test('every phase page carries its report rows, supervised included', () => {
  assert.match(NEXT, /--report <rows\.json> --phase <n>/)
})

test('an autonomous phase snapshots, commits and records — and never arms or waits', () => {
  assert.match(AUTO, /--report <file> --phase <n> --snapshot/)
  assert.match(AUTO, /\*\*Do not arm the gate and do not wait\.\*\*/)
  assert.match(AUTO, /spec-env run phase <spec> <n> --commit <sha>/)
  assert.match(AUTO, /\*\*Re-read before building\.\*\*/)
})

test('the four stop conditions are named, and the run stays active across a stop', () => {
  for (const c of [/maxFixAttempts/, /Blocked on:/, /only a person can do/, /more than one defensible answer/]) assert.match(AUTO, c)
  assert.match(AUTO, /spec-env run stop <spec> --reason/)
  assert.match(AUTO, /\*\*The run stays active\.\*\*/)
  assert.match(AUTO, /Never step past a stop condition/)
})

test('the three endings, each ending the run on the record', () => {
  assert.match(AUTO, /spec-env review <spec> --final --run-reviewers/)
  assert.match(AUTO, /spec-env integrate <spec> --push/)
  assert.match(AUTO, /Hand off to \*\*`\/spec-complete`\*\*/)
  assert.match(AUTO, /spec-env run end <spec> --outcome <ending>/)
  assert.match(AUTO, /\*\*is\*\* the operator's consent to push for this run/)
})

test('a finish or a stop notifies where the harness can', () => {
  assert.match(AUTO, /PushNotification/)
  assert.match(AUTO, /A harness without one sends\s+nothing/)
})

test('/spec-start does not ask "build phase 1 now?" of an autonomous run', () => {
  assert.match(START, /\*\*An autonomous run does not ask\.\*\*/)
})

test('/spec-diff routes the final page’s three endings', () => {
  assert.match(DIFF, /### `complete`, `push`, `pr` — the final page of an autonomous run/)
  for (const v of ['complete', 'push', 'pr']) assert.match(DIFF, new RegExp(`- \\*\\*\`${v}\`\\*\\*`))
  assert.match(DIFF, /run end <spec> --outcome <verdict>/)
})

test('/spec-complete lists each phase in the PR body and takes the run’s consent', () => {
  assert.match(COMPLETE, /spec-env run status <name> --json/)
  assert.match(COMPLETE, /\*\*An autonomous run that ends on `pr` has already consented\*\*/)
})

test('/spec asks the Run: question only as a difference from the default', () => {
  assert.match(SPEC, /\*\*Run mode\*\*/)
  assert.match(SPEC, /> \*\*Run:\*\* <auto or supervised/)
  assert.match(SPEC, /Matching the default writes no line/)
})
