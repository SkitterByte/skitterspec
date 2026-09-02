'use strict'

/**
 * An unrecognised flag must be refused, not swallowed.
 *
 * `spec-sync` parses known flags in a loop and pushes everything else onto
 * `positional` — which is right for a spec name and wrong for a flag. When
 * `--write` was renamed to `--yes`, `doctor --write` stopped meaning anything and
 * started meaning nothing: it parsed, ran, reported success, and ignored the
 * flag entirely.
 *
 * That is worse than a removed command. A removed command errors and you notice;
 * this reports `exit 0` while doing something else, so a script that repaired a
 * renamed team on 10.4.0 now silently repairs nothing and says it is fine.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { specSync } = require('../src/cli-sync.js')
const { CONFIG_FILE } = require('../src/config.js')

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-flags-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify({ linear: { teamId: 'T1', teamKey: 'SKS' } }), 'utf-8')
  return dir
}

function run(argv, cwd, env = {}) {
  const out = []
  return specSync(argv, {
    cwd,
    out: { write: (s) => out.push(s), isTTY: true },
    err: { write: () => {} },
    env,
  }).then((code) => ({ code, out: out.join('') }))
}

// --- the reported case --------------------------------------------------------

test('doctor --write is refused and points at retarget', async () => {
  // The exact 10.4.0 invocation: back then it repaired a renamed team.
  const r = await run(['doctor', '--write'], repo())
  assert.strictEqual(r.code, 1, 'it must not report success')
  assert.match(r.out, /--write/, 'names the flag it refused')
  assert.match(r.out, /retarget/, 'and what the caller almost certainly meant')
  assert.doesNotMatch(r.out, /check\(s\) need attention/, 'it does not run the readiness report instead')
})

// --- the general rule ---------------------------------------------------------

test('any unrecognised flag is refused, naming it', async () => {
  const r = await run(['linked', '--jsno'], repo())
  assert.strictEqual(r.code, 1)
  assert.match(r.out, /--jsno/, 'a typo is named rather than dropped')
})

test('the refusal happens before the command runs', async () => {
  const r = await run(['doctor', '--nonsense'], repo())
  assert.strictEqual(r.code, 1)
  assert.doesNotMatch(r.out, /scaffold/, 'no report was produced')
})

test('a spec name is still a positional, not a flag', async () => {
  const dir = repo()
  fs.mkdirSync(path.join(dir, 'specs', 'backlog', 'feat-thing'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', 'backlog', 'feat-thing', '00-overview.md'), '# Thing\n', 'utf-8')
  const r = await run(['status', 'feat-thing', '--skip-state-check'], dir)
  assert.notStrictEqual(r.code, 1, `a real invocation still works, got: ${r.out}`)
})

test('every flag the usage advertises is accepted', async () => {
  // Guards the rule against over-reach: a flag named in --help must parse.
  // Asserting the exit code would be wrong: this fixture has no skills, so
  // `doctor` legitimately exits 1. What matters is that the FLAG parsed.
  const dir = repo()
  for (const argv of [['linked', '--json'], ['doctor', '--json'], ['doctor', '--check-remote', '--json']]) {
    const r = await run(argv, dir)
    assert.doesNotMatch(r.out, /unrecognised|unknown flag/i, `${argv.join(' ')} must not be refused, got: ${r.out}`)
  }
})
