'use strict'

/**
 * Per-spec Docker stacks were removed (feat-drop-docker-stacks). A skill, rule
 * or command that still describes one sends the reader to write a
 * `Stack: worktree + docker` header nothing reads, or to wait for a
 * `docker compose` that never runs.
 *
 * WHAT THIS DOES NOT CHECK, deliberately: `core/env.config.md` and the
 * MIGRATION guide name the retired key and header, because telling an adopter
 * they are ignored is their job. Prose that describes a stack in other words
 * gets past it — this is a tripwire for the two shapes the feature used.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const DIRS = ['skills', 'rules', 'commands']

function markdownUnder(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...markdownUnder(p))
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

const FILES = DIRS.flatMap((d) => markdownUnder(path.join(ASSETS, d)))

test('the scan reaches the shipped skills, rules and commands', () => {
  // A positive signal first: an empty file list would pass the check below.
  for (const d of DIRS) {
    assert.ok(FILES.some((f) => f.includes(`${path.sep}${d}${path.sep}`)), `found files under ${d}/`)
  }
})

test('no shipped skill, rule or command describes a per-spec Docker stack', () => {
  const hits = []
  for (const file of FILES) {
    const text = fs.readFileSync(file, 'utf8')
    for (const needle of [/worktree \+ docker/i, /docker compose/i, /docker\.enabled/]) {
      if (needle.test(text)) hits.push(`${path.relative(ASSETS, file)}: ${needle}`)
    }
  }
  assert.deepStrictEqual(hits, [])
})
