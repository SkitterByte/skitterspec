'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const { parseFlags, unknownFlagLines } = require('../src/args.js')

const TABLE = {
  '--json': { kind: 'boolean' },
  '--limit': { kind: 'number' },
  '--plan': { kind: 'path' },
  '--to': { kind: 'string' },
  '--sub': { kind: 'list', name: 'subs' },
  '--state': {
    kind: 'custom',
    handle: (flags, value) => {
      const [bucket, ...rest] = String(value || '').split('=')
      flags.stateNames = { ...(flags.stateNames || {}), [bucket.trim()]: rest.join('=').trim() }
    },
  },
  '--key': {
    // Consumed and deliberately discarded — a secret in argv is refused, but it
    // must still be swallowed or it would print back in a usage message.
    kind: 'custom',
    handle: (flags) => {
      flags.keyArgGiven = true
    },
  },
}

test('each kind parses', () => {
  const { flags, positional, unknown } = parseFlags(
    ['my-spec', '--json', '--limit', '5', '--plan', 'p.json', '--to', ' X-1 ', '--sub', 'a=1', '--sub', 'b=2'],
    TABLE,
  )
  assert.deepStrictEqual(positional, ['my-spec'])
  assert.deepStrictEqual(unknown, [])
  assert.strictEqual(flags.json, true)
  assert.strictEqual(flags.limit, 5)
  assert.strictEqual(flags.plan, path.resolve('p.json'))
  assert.strictEqual(flags.to, 'X-1')
  assert.deepStrictEqual(flags.subs, ['a=1', 'b=2'])
})

test('a custom handler sees the raw value', () => {
  const { flags } = parseFlags(['--state', 'complete=Shipped'], TABLE)
  assert.deepStrictEqual(flags.stateNames, { complete: 'Shipped' })
})

test('a discarded secret is swallowed, never positional', () => {
  const { flags, positional } = parseFlags(['--key', 'sekret', 'spec'], TABLE)
  assert.strictEqual(flags.keyArgGiven, true)
  assert.deepStrictEqual(positional, ['spec'])
})

test('an unknown flag is collected for refusal, not silently positional', () => {
  const { unknown, positional } = parseFlags(['--write', 'spec'], TABLE)
  assert.deepStrictEqual(unknown, ['--write'])
  assert.deepStrictEqual(positional, ['spec'])
})

test('the refusal names renamed flags with their hand-off', () => {
  const lines = unknownFlagLines('spec-sync', ['--write'], {
    '--write': ['--write was replaced by --yes.'],
  })
  assert.match(lines[0], /unknown flag --write/)
  assert.match(lines[1], /replaced by --yes/)
  assert.match(lines[2], /full usage/)
})
