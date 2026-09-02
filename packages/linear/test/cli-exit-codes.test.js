'use strict'

/**
 * A resolve failure must be a FAILURE — printed, and non-zero.
 *
 * `spec-sync normalize|record|status <missing>` printed "spec not found" and
 * exited 0, because the helper returned null and the dispatch coerced it
 * (`specSyncStatus(...) || 0`) or discarded it outright (`fn(); return 0`).
 * `/spec-push` checks $? before applying a plan, so a resolve failure reading as
 * success is the dangerous direction: it means "nothing to do", not "I could not
 * find the spec". A missing argument was worse still — silent on every command.
 *
 * Driven through the exported `specSync` rather than the bin: the bin only
 * assigns `process.exitCode` from this return value, so this is the contract.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')

// Every subcommand that takes a <spec> and resolves it through resolveOrExit.
const SPEC_COMMANDS = ['normalize', 'record', 'status', 'push', 'verify', 'stamp']

function scaffold() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-exit-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({ linear: { teamId: 'x' } }),
  )
  const spec = path.join(dir, 'specs', 'backlog', 'feat-real')
  fs.mkdirSync(spec, { recursive: true })
  fs.writeFileSync(path.join(spec, '00-overview.md'), '---\nlinear_identifier: "AA-1"\n---\n\n# Real\n')
  return dir
}

// Capture stdout: these commands write their diagnostics there.
async function runSync(argv, dir) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  let code
  try {
    code = await specSync([...argv, '--dir', dir])
  } finally {
    process.stdout.write = orig
  }
  return { code, out }
}

for (const sub of SPEC_COMMANDS) {
  test(`${sub}: a spec that does not exist is a non-zero failure`, async () => {
    const dir = scaffold()
    try {
      const { code, out } = await runSync([sub, 'definitely-not-a-spec'], dir)
      assert.match(out, /spec not found: definitely-not-a-spec/, 'says what went wrong')
      assert.notStrictEqual(code, 0, 'and does not report success')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test(`${sub}: a missing spec argument is reported, not silent`, async () => {
    const dir = scaffold()
    try {
      const { code, out } = await runSync([sub], dir)
      assert.match(out, /no spec given/, 'says what is missing')
      assert.notStrictEqual(code, 0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('a spec that DOES resolve still succeeds — the guard is not over-broad', async () => {
  const dir = scaffold()
  try {
    const { code, out } = await runSync(['normalize', 'feat-real'], dir)
    assert.strictEqual(code, 0, 'success is still 0')
    assert.doesNotMatch(out, /not found|no spec given/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
