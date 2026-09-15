'use strict'

/**
 * Registering the review-gate hook, from every install entry point.
 *
 * `env-review-hook.test.js` covers `ensureReviewGateHook` as a unit — what it
 * writes, what it merges, what it refuses to touch. This file covers the WIRING:
 * that each command a user can actually run reaches it.
 *
 * THE BUG THIS EXISTS FOR. Copying the hook script and registering it are one
 * operation, and they were split across two functions: `installHooks()` did both
 * but was reachable only from `init`/`reset`, while the `update` path copied the
 * file through `resyncManagedFile()` and never registered anything. So `update`
 * reported `created: .claude/hooks/review-gate.js` and looked complete, on a
 * project whose settings had gained nothing. That is the upgrade path — every
 * existing project taking the release got a hook file and no hook.
 *
 * Which is why the first test below is parameterised over the ENTRY POINTS
 * rather than written against `resync` alone: the failure was two of them
 * disagreeing, so the assertion has to be over the set. A new install command
 * that forgets this fails here.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { init, resync, reset, lastReport } = require('../src/init.js')
const { HOOK_SCRIPT } = require('../src/env/hooks.js')

function tmpProject() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hookwire-')))
}

// The install commands all print a report; the assertions are on disk and on
// `lastReport()`, never on stdout.
async function quiet(fn) {
  const orig = process.stdout.write
  process.stdout.write = () => true
  try {
    return await fn()
  } finally {
    process.stdout.write = orig
  }
}

const settingsFile = (dir) => path.join(dir, '.claude', 'settings.json')
const readSettings = (dir) => JSON.parse(fs.readFileSync(settingsFile(dir), 'utf8'))

function writeSettings(dir, value) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(settingsFile(dir), JSON.stringify(value, null, 2) + '\n')
}

function registeredCommands(dir) {
  const pre = readSettings(dir).hooks?.PreToolUse
  if (!Array.isArray(pre)) return []
  return pre.flatMap((g) => (Array.isArray(g.hooks) ? g.hooks : [])).map((h) => h.command)
}

// Every command a user can run that is supposed to leave a working install.
const ENTRY_POINTS = [
  ['init', (dir) => init({ dir, force: false, claudeMd: false, mode: 'init' })],
  ['update', (dir) => resync(dir, { claudeMd: false })],
  ['reset', (dir) => reset(dir, { claudeMd: false })],
]

for (const [name, run] of ENTRY_POINTS) {
  test(`${name} registers the review-gate hook, and reports it`, async () => {
    const dir = tmpProject()
    try {
      await quiet(() => run(dir))

      const commands = registeredCommands(dir)
      assert.strictEqual(commands.length, 1, `${name} registered exactly one hook`)
      assert.ok(commands[0].includes(HOOK_SCRIPT), `${name} registered the shipped script`)

      // The file and the registration are one operation — a run that lands the
      // script without wiring it is the exact failure this suite is about.
      assert.ok(
        fs.existsSync(path.join(dir, HOOK_SCRIPT)),
        `${name} installed the script it registered`,
      )

      // Reported, not silent. The bug was invisible precisely because the only
      // code that would have mentioned it never ran.
      const report = lastReport()
      const mentions = [...report.created, ...report.updated].filter((l) =>
        String(l).includes('review-gate hook'),
      )
      assert.strictEqual(mentions.length, 1, `${name} reported the registration`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('update registers into a settings file that already exists', async () => {
  // The real upgrade shape: a project that has been using Claude Code for a
  // while, so `.claude/settings.json` is present, valid, and full of the
  // operator's own configuration.
  const dir = tmpProject()
  try {
    writeSettings(dir, {
      permissions: { allow: ['Bash(pnpm test)'] },
      hooks: { PostToolUse: [{ matcher: 'Write', hooks: [] }] },
    })
    await quiet(() => resync(dir, { claudeMd: false }))

    const after = readSettings(dir)
    assert.deepStrictEqual(after.permissions.allow, ['Bash(pnpm test)'], 'their permissions survive')
    assert.strictEqual(after.hooks.PostToolUse.length, 1, 'their other hooks survive')
    assert.strictEqual(after.hooks.PreToolUse.length, 1)
    assert.ok(registeredCommands(dir)[0].includes(HOOK_SCRIPT))
    assert.ok(
      lastReport().updated.some((l) => String(l).includes('review-gate hook')),
      'merging into an existing file is reported as an update',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('re-running update registers nothing a second time, and writes nothing', async () => {
  const dir = tmpProject()
  try {
    await quiet(() => resync(dir, { claudeMd: false }))
    const before = fs.readFileSync(settingsFile(dir), 'utf8')

    await quiet(() => resync(dir, { claudeMd: false }))
    assert.strictEqual(fs.readFileSync(settingsFile(dir), 'utf8'), before, 'byte-for-byte unchanged')
    assert.strictEqual(readSettings(dir).hooks.PreToolUse.length, 1)
    assert.ok(
      lastReport().skipped.some((l) => String(l).includes('review-gate hook already registered')),
      'the second run says it was already there',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- stays silent (`.claude/rules/negative-checks.md` rule 3) ----------------

test('update leaves a settings file it cannot parse exactly as it found it', async () => {
  // Healthy-but-unusual: an operator mid-edit, or a file with comments in it.
  // Rewriting would lose everything else in there, so the only safe answer is to
  // say so and touch nothing — and `update` must answer that way too, not only
  // `init`.
  const dir = tmpProject()
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(settingsFile(dir), '{ not json')

    await quiet(() => resync(dir, { claudeMd: false }))

    assert.strictEqual(fs.readFileSync(settingsFile(dir), 'utf8'), '{ not json', 'untouched')
    assert.ok(
      lastReport().warnings.some((w) => String(w).includes('not valid JSON')),
      'reported rather than silent — the operator has to know the gate is off',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- the whole upgrade, end to end ------------------------------------------
//
// The two fixes meet here. Registering on `update` is worthless if it registers
// a path this same run retires, and retiring the old script is worse than
// useless if the harness is still pointed at it. Neither unit test can see that;
// this one runs the actual upgrade and looks at what the project is left with.

const { writeManifest, sha1, MANIFEST_FILE } = require('../src/init.js')

// A project installed by the release that shipped the hook as `.js`: the script
// on disk, the registration naming it, and a manifest recording it as ours.
function projectOnTheOldRelease({ edited = false } = {}) {
  const dir = tmpProject()
  const oldRel = '.claude/hooks/review-gate.js'
  const body = edited ? '// my own version\n' : "'use strict'\nconst fs = require('node:fs')\n"
  fs.mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(dir, oldRel), body)
  writeSettings(dir, {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: `node "\${CLAUDE_PROJECT_DIR}/${oldRel}"`, timeout: 10 }],
        },
      ],
    },
  })
  // Pristine → the manifest holds the hash of what we wrote. Edited → it holds
  // the hash of something else, which is what makes the file read as customized.
  writeManifest(dir, { [oldRel]: edited ? sha1('// what we shipped\n') : sha1(body) })
  return { dir, oldRel }
}

test('upgrading a project off the old release leaves one entry, naming the file that exists', async () => {
  const { dir, oldRel } = projectOnTheOldRelease()
  try {
    await quiet(() => resync(dir, { claudeMd: false }))

    assert.ok(fs.existsSync(path.join(dir, HOOK_SCRIPT)), 'the shipped script is installed')
    assert.ok(!fs.existsSync(path.join(dir, oldRel)), 'the retired script is gone')

    const commands = registeredCommands(dir)
    assert.strictEqual(commands.length, 1, 'exactly one entry — not one beside the other')
    assert.ok(commands[0].includes(HOOK_SCRIPT), 'pointing at the file that exists')

    // Reported as the write it is. This fell through to `unchanged: already
    // registered` while rewriting the file underneath — caught by running the
    // real `update` against a project on the old release, which is the only
    // thing that looks at what the operator is actually told.
    assert.ok(
      lastReport().updated.some((l) => String(l).includes('review-gate hook')),
      'the repointing is reported as a change, not as "already registered"',
    )
    assert.ok(
      !lastReport().skipped.some((l) => String(l).includes('review-gate hook')),
      'and never as unchanged',
    )

    // And the whole point of it: run what is registered, in the project that
    // could not parse it before.
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', type: 'module' }))
    const res = spawnSync(process.execPath, [path.join(dir, HOOK_SCRIPT)], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.js' } }),
      cwd: dir,
      encoding: 'utf8',
    })
    assert.strictEqual(res.status, 0)
    assert.strictEqual(res.stderr.trim(), '', 'no stack trace in an ESM project')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an operator who edited the old hook keeps it, and is told', async () => {
  // Stays-silent, rule 4: a hash we do not recognise is "cannot tell", and the
  // harmless branch is to keep the file. Retiring it through the manifest rather
  // than an unconditional delete is what buys that — being wrong here would cost
  // someone work they chose to do, against an inert leftover nothing runs.
  const { dir, oldRel } = projectOnTheOldRelease({ edited: true })
  try {
    await quiet(() => resync(dir, { claudeMd: false }))

    assert.ok(fs.existsSync(path.join(dir, oldRel)), 'their edit survives the upgrade')
    assert.strictEqual(fs.readFileSync(path.join(dir, oldRel), 'utf8'), '// my own version\n')
    assert.ok(
      lastReport().warnings.some((w) => String(w).includes(oldRel)),
      'and it is reported, not left to be discovered',
    )
    // The registration still moves: it is the harness pointer, not their file.
    const commands = registeredCommands(dir)
    assert.strictEqual(commands.length, 1)
    assert.ok(commands[0].includes(HOOK_SCRIPT))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the manifest stops recording the retired script', async () => {
  const { dir, oldRel } = projectOnTheOldRelease()
  try {
    await quiet(() => resync(dir, { claudeMd: false }))
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))
    assert.ok(!(oldRel in manifest.files), 'the retired path is dropped')
    assert.ok(HOOK_SCRIPT in manifest.files, 'and the shipped one is recorded')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
