'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  readRegistry,
  writeRegistry,
  allocateSlot,
  freeSlot,
  portOffset,
} = require('../src/env/registry.js')

const CONFIG = { registry: '.spec-env/registry.json', docker: { portBase: 3000, portsPerSpec: 10 } }

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-reg-'))
}

test('readRegistry returns an empty registry when the file is absent', () => {
  const dir = tmpDir()
  assert.deepStrictEqual(readRegistry(dir, CONFIG), { slots: {} })
})

test('allocateSlot picks the lowest free index, filling gaps', () => {
  let reg = { slots: { a: 0, c: 2 } }
  const { registry, slot } = allocateSlot(reg, 'b')
  assert.strictEqual(slot, 1) // gap at 1 is filled before 3
  assert.deepStrictEqual(registry.slots, { a: 0, c: 2, b: 1 })
})

test('allocateSlot appends past the highest when no gaps exist', () => {
  const { slot } = allocateSlot({ slots: { a: 0, b: 1 } }, 'c')
  assert.strictEqual(slot, 2)
})

test('allocateSlot is idempotent for an already-provisioned spec', () => {
  const reg = { slots: { a: 0, b: 1 } }
  const { registry, slot } = allocateSlot(reg, 'b')
  assert.strictEqual(slot, 1)
  assert.deepStrictEqual(registry.slots, { a: 0, b: 1 })
})

test('allocateSlot does not mutate the input registry', () => {
  const reg = { slots: { a: 0 } }
  allocateSlot(reg, 'b')
  assert.deepStrictEqual(reg.slots, { a: 0 })
})

test('freeSlot removes a spec and is a no-op when absent', () => {
  assert.deepStrictEqual(freeSlot({ slots: { a: 0, b: 1 } }, 'a'), { slots: { b: 1 } })
  assert.deepStrictEqual(freeSlot({ slots: { b: 1 } }, 'missing'), { slots: { b: 1 } })
})

test('a freed slot is reused by the next allocation', () => {
  let reg = { slots: { a: 0, b: 1 } }
  reg = freeSlot(reg, 'a')
  const { slot } = allocateSlot(reg, 'c')
  assert.strictEqual(slot, 0)
})

test('portOffset math: portBase + slot * portsPerSpec', () => {
  assert.strictEqual(portOffset(0, CONFIG), 3000)
  assert.strictEqual(portOffset(1, CONFIG), 3010)
  assert.strictEqual(portOffset(5, CONFIG), 3050)
})

test('write then read round-trips the registry to disk', () => {
  const dir = tmpDir()
  writeRegistry(dir, CONFIG, { slots: { a: 0, b: 1 } })
  assert.ok(fs.existsSync(path.join(dir, '.spec-env', 'registry.json')))
  assert.deepStrictEqual(readRegistry(dir, CONFIG), { slots: { a: 0, b: 1 } })
})

test('readRegistry throws a clear error on malformed JSON', () => {
  const dir = tmpDir()
  const file = path.join(dir, '.spec-env', 'registry.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'not json')
  assert.throws(() => readRegistry(dir, CONFIG), /Invalid registry/)
})
