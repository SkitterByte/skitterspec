'use strict'

/**
 * The review-gate hook — enforcement one level below the skills.
 *
 * `/spec-next` refuses in prose, which can be chained past or simply not read.
 * This runs as a `PreToolUse` hook on Bash, so a `git commit` in a worktree
 * that owes a verdict is stopped by the harness itself.
 *
 * WHICH MAKES IT AN ACCUSATION, and the balance of this suite reflects that
 * (`.claude/rules/negative-checks.md` rule 3). One test proves it can fire.
 * The rest prove it does not fire on the healthy-but-unusual: a repo with no
 * isolation, no engine installed, an unreadable payload, a non-Bash tool, a
 * command that is not a commit, an engine that crashes. Every one of those
 * allows the commit, because being wrong that way costs one unreviewed commit
 * and being wrong the other way costs someone their commit with no explanation.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const { ensureReviewGateHook, alreadyRegistered, hookEntry, HOOK_SCRIPT } = require('../src/env/hooks.js')

// Derived from HOOK_SCRIPT rather than spelled out, so the asset, the registered
// path and this suite cannot name three different files.
const HOOK = path.join(__dirname, '..', 'assets', 'hooks', path.basename(HOOK_SCRIPT))
const ENGINE = path.join(__dirname, '..', 'bin', 'skitterspec.js')

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}

function scaffold({ isolation = true } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-hook-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  if (isolation) {
    fs.writeFileSync(
      path.join(dir, 'specs', '.core', 'env.config.json'),
      JSON.stringify({ baseBranch: 'main', docker: { enabled: false }, review: { reader: 'local', serve: 'never' } }),
    )
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\ntwo\n')
  const specDir = path.join(dir, 'specs', 'in-progress', 'feat-alpha')
  fs.mkdirSync(specDir, { recursive: true })
  fs.writeFileSync(path.join(specDir, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  const wt = path.resolve(dir, `../${path.basename(dir)}-wt`, 'alpha')
  git(dir, 'worktree', 'add', '-q', '-b', 'feat/alpha', wt)
  fs.writeFileSync(path.join(wt, 'app.js'), 'one\nTWO\n')
  return { dir, wt }
}

function cleanup(dir) {
  try {
    git(dir, 'worktree', 'prune')
  } catch {}
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.resolve(dir, `../${path.basename(dir)}-wt`), { recursive: true, force: true })
}

const engine = (dir, ...args) =>
  spawnSync(process.execPath, [ENGINE, 'spec-env', 'review', ...args, '--dir', dir], { encoding: 'utf8' })

// Run the hook exactly as the harness runs it: JSON on stdin, decision on
// stdout. `SKITTERSPEC_BIN` stands in for a PATH lookup a test cannot rely on.
function runHook(payload, { cwd, bin = ENGINE } = {}) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SKITTERSPEC_BIN: bin },
  })
  let decision = null
  try {
    decision = JSON.parse(res.stdout).hookSpecificOutput
  } catch {
    /* no JSON is "no opinion" */
  }
  return { status: res.status, stdout: res.stdout, decision }
}

const bashCommit = (cwd) => ({
  session_id: 's',
  cwd,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'git commit -m "phase 2"' },
})

// --- it can fire ------------------------------------------------------------

test('a commit in a worktree that owes a verdict is denied, with the way out', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    const got = runHook(bashCommit(wt), { cwd: wt })
    assert.strictEqual(got.status, 0, 'the hook itself always exits 0; the decision is the JSON')
    assert.strictEqual(got.decision.permissionDecision, 'deny')
    assert.match(got.decision.permissionDecisionReason, /awaiting a verdict/)
    // A refusal with no route onward is how a gate gets switched off instead of
    // answered, so all three exits are named in the refusal itself.
    assert.match(got.decision.permissionDecisionReason, /\/spec-reviewed/)
    assert.match(got.decision.permissionDecisionReason, /review skip/)
  } finally {
    cleanup(dir)
  }
})

// --- and everything below is it staying silent ------------------------------

test('it allows once the gate is cleared', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    engine(dir, 'skip', 'nothing to read here')
    assert.strictEqual(runHook(bashCommit(wt), { cwd: wt }).decision, null)
  } finally {
    cleanup(dir)
  }
})

test('it allows a commit where nothing was ever armed', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    assert.strictEqual(runHook(bashCommit(wt), { cwd: wt }).decision, null)
  } finally {
    cleanup(dir)
  }
})

test('it allows every commit in a repo with no isolation at all', () => {
  // The commonest healthy repo there is: no env.config.json, so no gate and no
  // review. A hook installed here must be completely inert.
  const { dir } = scaffold({ isolation: false })
  try {
    assert.strictEqual(runHook(bashCommit(dir), { cwd: dir }).decision, null)
  } finally {
    cleanup(dir)
  }
})

test('it allows a commit on the base branch while another spec owes a verdict', () => {
  // THE FALSE ACCUSATION THIS SUITE CAUGHT. The bare resolution answers with
  // the sole provisioned spec wherever you are standing, so an armed gate in a
  // worktree denied a commit in the primary checkout — which is where the
  // workflow asks you to author backlog specs. Committing one would have been
  // blocked by entirely unrelated work, with a message about a phase the
  // operator was not working on.
  const { dir } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    assert.strictEqual(runHook(bashCommit(dir), { cwd: dir }).decision, null)
  } finally {
    cleanup(dir)
  }
})

test('it allows a commit in a DIFFERENT spec\'s worktree', () => {
  // Same rule, the other way round: several specs in flight is what the
  // worktree mode is for, and one spec's obligation is not another's.
  const { dir, wt } = scaffold()
  try {
    const other = path.resolve(dir, `../${path.basename(dir)}-wt`, 'beta')
    const sd = path.join(dir, 'specs', 'in-progress', 'feat-beta')
    fs.mkdirSync(sd, { recursive: true })
    fs.writeFileSync(path.join(sd, '00-overview.md'), '# beta\n\n> **Stack:** worktree\n')
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'beta')
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/beta', other)

    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    assert.strictEqual(runHook(bashCommit(other), { cwd: other }).decision, null)
    // ...and alpha's own worktree is still refused, so the narrowing did not
    // just switch the check off.
    assert.strictEqual(runHook(bashCommit(wt), { cwd: wt }).decision.permissionDecision, 'deny')
  } finally {
    cleanup(dir)
  }
})

test('it allows anything that is not a git commit', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    for (const command of [
      'git status',
      'git add -- app.js',
      'git log --grep=commit',
      'pnpm test',
      'echo "git commit"',
    ]) {
      const got = runHook({ ...bashCommit(wt), tool_input: { command } }, { cwd: wt })
      assert.strictEqual(got.decision, null, command)
    }
  } finally {
    cleanup(dir)
  }
})

test('it allows every non-Bash tool call', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    const got = runHook(
      { ...bashCommit(wt), tool_name: 'Edit', tool_input: { file_path: 'a.js' } },
      { cwd: wt },
    )
    assert.strictEqual(got.decision, null)
  } finally {
    cleanup(dir)
  }
})

test('it allows when there is no engine to ask', () => {
  const { dir, wt } = scaffold()
  try {
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    const got = runHook(bashCommit(wt), { cwd: wt, bin: path.join(dir, 'no-such-binary') })
    assert.strictEqual(got.decision, null, 'a missing engine is not evidence of an obligation')
  } finally {
    cleanup(dir)
  }
})

test('it allows when the engine crashes', () => {
  const { dir, wt } = scaffold()
  try {
    const stub = path.join(dir, 'crashing-engine.js')
    fs.writeFileSync(stub, 'process.exit(3)\n')
    engine(dir, 'feat-alpha')
    engine(dir, 'arm', 'feat-alpha', '--phase', '2')
    // Any status but the one that means "armed" is a cannot-tell.
    const res = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify(bashCommit(wt)),
      cwd: wt,
      encoding: 'utf8',
      env: { ...process.env, SKITTERSPEC_BIN: `${process.execPath} ${stub}` },
    })
    assert.strictEqual(res.stdout.trim(), '')
  } finally {
    cleanup(dir)
  }
})

test('it allows on an unreadable payload', () => {
  const { dir, wt } = scaffold()
  try {
    for (const input of ['', 'not json', '[]', 'null']) {
      const res = spawnSync(process.execPath, [HOOK], {
        input,
        cwd: wt,
        encoding: 'utf8',
        env: { ...process.env, SKITTERSPEC_BIN: ENGINE },
      })
      assert.strictEqual(res.status, 0, input)
      assert.strictEqual(res.stdout.trim(), '', input)
    }
  } finally {
    cleanup(dir)
  }
})

// --- registration in project settings ---------------------------------------

test('it registers into a settings file that does not exist yet', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'created')
    const written = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))
    // BOTH hooks this package ships. They guard different moments — a commit,
    // and the first write — so they take different matchers and are separate
    // entries rather than one.
    assert.strictEqual(written.hooks.PreToolUse.length, 2)
    const byMatcher = Object.fromEntries(written.hooks.PreToolUse.map((e) => [e.matcher, e]))
    assert.ok(byMatcher.Bash, 'the review gate, on Bash')
    assert.ok(byMatcher['Edit|Write|NotebookEdit|MultiEdit'], 'the main guard, on the write tools')
    for (const entry of written.hooks.PreToolUse) {
      // Portable across machines and worktrees — never an absolute path.
      assert.match(entry.hooks[0].command, /\$\{CLAUDE_PROJECT_DIR\}/)
      assert.ok(entry.hooks[0].timeout > 0, 'a wedge fails open rather than hanging')
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('it merges without disturbing anything already in the file', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.claude', 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Bash(pnpm test)'] },
        hooks: { PostToolUse: [{ matcher: 'Write', hooks: [] }] },
      }),
    )
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'added')
    const written = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))
    assert.deepStrictEqual(written.permissions.allow, ['Bash(pnpm test)'], 'their permissions survive')
    assert.strictEqual(written.hooks.PostToolUse.length, 1, 'their other hooks survive')
    assert.strictEqual(written.hooks.PreToolUse.length, 2, 'both of ours, and nothing else')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('re-running registers nothing a second time', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    ensureReviewGateHook(dir)
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'present')
    const written = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))
    assert.strictEqual(written.hooks.PreToolUse.length, 2, 'neither was added twice')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("an operator's own wrapping of our hook is left alone, not duplicated", () => {
  // Matched on the SCRIPT PATH, not the command string: someone who added a
  // wrapper, a flag, or a different interpreter has registered our hook their
  // way, and a second copy beside it would run the gate twice.
  assert.strictEqual(
    alreadyRegistered([
      { matcher: 'Bash', hooks: [{ type: 'command', command: `myrunner ${HOOK_SCRIPT} --verbose` }] },
    ]),
    true,
  )
  assert.strictEqual(
    alreadyRegistered([{ matcher: 'Bash', hooks: [{ type: 'command', command: 'some-other-hook.js' }] }]),
    false,
  )
})

test('a settings file it cannot parse is reported, never rewritten', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    const file = path.join(dir, '.claude', 'settings.json')
    fs.writeFileSync(file, '{ not json')
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'malformed')
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ not json', 'their file is untouched')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the registered command points at the script the package ships', () => {
  assert.ok(fs.existsSync(HOOK), 'the hook asset exists')
  assert.match(hookEntry().hooks[0].command, new RegExp(HOOK_SCRIPT.replace(/[.]/g, '\\.')))
})

// --- the extension pins the parse mode --------------------------------------
//
// THE BUG THESE EXIST FOR. The hook was CommonJS shipped as `.js`, and it is
// copied INTO the target project — where that project's `package.json`, the one
// file skitterspec does not control, decides how node parses it. In a
// `"type": "module"` project it died on its own first `require`, and because it
// is registered on `matcher: "Bash"` it did so on every Bash tool call. Exit 1
// is non-blocking for `PreToolUse`, so the commit survived; what did not was the
// gate (it never evaluated anything) or the operator's terminal.
//
// An ESM rewrite would invert exactly this onto CommonJS projects, which are
// still the default for anything with no `"type"` set. Only an extension that
// pins the parse mode is independent of the host.

function hostProject(packageJson) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-host-')))
  if (packageJson !== null) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson))
  const installed = path.join(dir, HOOK_SCRIPT)
  fs.mkdirSync(path.dirname(installed), { recursive: true })
  fs.copyFileSync(HOOK, installed)
  return { dir, installed }
}

// A non-Bash payload so the hook allows before it ever looks for an engine —
// this is a test of whether the file PARSES, and nothing else.
const inertPayload = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.js' } })

for (const [label, pkg] of [
  ['a "type": "module" project', { name: 'x', type: 'module' }],
  ['a CommonJS project', { name: 'x', type: 'commonjs' }],
  ['a project with no "type" set at all', { name: 'x' }],
  ['a project with no package.json at all', null],
]) {
  test(`the installed hook runs clean in ${label}`, () => {
    const { dir, installed } = hostProject(pkg)
    try {
      const res = spawnSync(process.execPath, [installed], {
        input: inertPayload,
        cwd: dir,
        encoding: 'utf8',
      })
      assert.strictEqual(res.status, 0, `exit 0 in ${label}`)
      assert.strictEqual(res.stdout.trim(), '', 'no opinion')
      // The loud half. A crashing hook is merely non-blocking; a crashing hook
      // on `matcher: "Bash"` prints its stack trace over every command the
      // operator runs.
      assert.strictEqual(res.stderr.trim(), '', `no stack trace in ${label}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('every hook this package ships pins its own parse mode', () => {
  // The rule, not the instance: a bare `.js` hook is parsed however the HOST
  // project's package.json says, so shipping one re-opens this bug under a new
  // filename. `.cjs` and `.mjs` both decide it at the file.
  const dir = path.join(__dirname, '..', 'assets', 'hooks')
  const shipped = fs.readdirSync(dir).filter((f) => !f.startsWith('.'))
  assert.ok(shipped.length > 0, 'the package ships at least one hook')
  for (const name of shipped) {
    assert.ok(
      name.endsWith('.cjs') || name.endsWith('.mjs'),
      `${name} must be .cjs or .mjs — a bare .js hook is parsed by the host project's rules`,
    )
  }
})

// --- migrating a registration that names the retired path -------------------

test('a registration naming the old .js path is rewritten, not duplicated', () => {
  // A project that took the release which shipped the hook as `.js`. The file it
  // points at is retired by this same upgrade, so leaving the entry alone would
  // aim the harness at nothing — and adding a second entry beside it would run
  // the gate twice and read as a bug in the gate.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    const stale = 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/review-gate.js"'
    fs.writeFileSync(
      path.join(dir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: stale, timeout: 10 }] }] },
      }),
    )

    // `added` rather than `migrated`: this one run both rewrote the stale path
    // AND registered the main guard, and "added" is the stronger signal — a
    // refusal now exists that did not before.
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'added')
    const after = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))
    const gate = after.hooks.PreToolUse.filter((e) => /review-gate/.test(e.hooks[0].command))
    assert.strictEqual(gate.length, 1, 'exactly one review-gate entry — migrated, not duplicated')
    assert.strictEqual(gate[0].hooks.length, 1)
    assert.strictEqual(
      gate[0].hooks[0].command,
      `node "\${CLAUDE_PROJECT_DIR}/${HOOK_SCRIPT}"`,
      'and it names the file that exists',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test("an operator's own wrapping is migrated in place, not replaced", () => {
  // The path moved; their command did not become ours. Only the script path
  // inside it is rewritten, so a wrapper, a flag or a different interpreter all
  // survive the migration that fixes the extension.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'myrunner .claude/hooks/review-gate.js --verbose' }] },
          ],
        },
      }),
    )

    assert.strictEqual(ensureReviewGateHook(dir).reason, 'added')
    const after = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'))
    const theirs = after.hooks.PreToolUse.filter((e) => /myrunner/.test(e.hooks[0].command))
    assert.strictEqual(theirs.length, 1)
    assert.strictEqual(
      theirs[0].hooks[0].command,
      `myrunner ${HOOK_SCRIPT} --verbose`,
      'their runner and their flag both survive',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an entry already naming the shipped path is left completely alone', () => {
  // The stays-silent half of the migration: "present" must still mean no write.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-settings-')))
  try {
    ensureReviewGateHook(dir)
    const before = fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')
    assert.strictEqual(ensureReviewGateHook(dir).reason, 'present')
    assert.strictEqual(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), before)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a hook that merely shares the prefix is not mistaken for ours', () => {
  // `review-gate-extra.js` is somebody else's file. Matching on the stem must
  // stop at a boundary, or this upgrade silently rewrites a hook we do not own.
  assert.strictEqual(
    alreadyRegistered([
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/review-gate-extra.js' }] },
    ]),
    false,
  )
})
