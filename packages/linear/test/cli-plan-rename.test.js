'use strict'

/**
 * `spec-sync push` became `spec-sync plan` in v13. "Push" had come to name three
 * unrelated things — this verb, the `/spec-push` skill, and `git push` — and
 * this was the one that writes NOTHING: it computes a create/update plan with no
 * network access, and `spec-sync apply` does the writing.
 *
 * Two things are pinned here that the mechanical rename does not cover.
 *
 * The retired name is RECOGNISED rather than removed. Falling through to the
 * generic usage block would be a clean break too, but it throws away the one
 * line that makes the break cheap — the reader learns the command is unknown,
 * not what replaced it.
 *
 * And `fieldOwnership: { assignee: 'push' }` is NOT this verb. It names a
 * direction of ownership in every adopter's `linear.config.json`, and a
 * search-and-replace over the word "push" would silently break configs to fix a
 * problem those users do not have. The stays-silent test below is the one most
 * likely to be skipped, because the rename "obviously" did not touch config.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { execFile } = require('node:child_process')

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec-linear.js')
const REPO = path.join(__dirname, '..', '..', '..')

function run(args, cwd = REPO) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code || 1 : 0, stdout, stderr })
    })
  })
}

test('the retired name fires, and names its replacement', async () => {
  const r = await run(['spec-sync', 'push', 'feat-no-branch-autopush'])
  assert.strictEqual(r.code, 1, 'it exits non-zero')
  const text = r.stdout + r.stderr
  assert.match(text, /spec-sync push was renamed to spec-sync plan/)
  assert.doesNotMatch(text, /^Usage: skitterspec spec-sync/m, 'it does not fall through to generic usage')
})

test('the retired name says which half of the split it was', async () => {
  // Without this the reader knows the new name but not why there are two verbs,
  // and reaches for `plan` expecting it to write.
  const r = await run(['spec-sync', 'push', 'feat-no-branch-autopush'])
  const text = r.stdout + r.stderr
  assert.match(text, /writes nothing/)
  assert.match(text, /`spec-sync apply` applies it/)
})

test('the new name is dispatched, and reaches the verb itself', async () => {
  // It refuses for a real reason (no --workspace-states) rather than for being
  // unknown — which is what proves the case is wired, not merely accepted.
  const r = await run(['spec-sync', 'plan', 'feat-no-branch-autopush'])
  const text = r.stdout + r.stderr
  assert.match(text, /spec-sync plan: refusing/)
  assert.doesNotMatch(text, /^Usage: skitterspec spec-sync/m)
})

test('usage advertises plan and never the retired name', async () => {
  const r = await run(['spec-sync', 'no-such-subcommand'])
  const text = r.stdout + r.stderr
  assert.match(text, /spec-sync plan <spec> --workspace-states/)
  assert.doesNotMatch(text, /spec-sync push </)
})

test('STAYS SILENT: fieldOwnership vocabulary is untouched by the rename', () => {
  // `push` here is a direction of ownership, not a subcommand — a different
  // vocabulary that happens to share a word (decision 8). Renaming it would
  // break every adopter's config.
  const { loadLinearConfig } = require('../src/config.js')
  const fs = require('node:fs')
  const os = require('node:os')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-rename-'))
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'linear.config.json'),
    JSON.stringify({
      linear: { teamKey: 'AAA', teamId: 'team-1' },
      sync: { fieldOwnership: { assignee: 'push', description: 'push', workflowState: 'push' } },
    }),
  )
  const { config } = loadLinearConfig(dir)
  assert.strictEqual(config.sync.fieldOwnership.assignee, 'push')
  assert.strictEqual(config.sync.fieldOwnership.description, 'push')
  assert.strictEqual(config.sync.fieldOwnership.workflowState, 'push')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('STAYS SILENT: the source keeps the config vocabulary it writes', () => {
  // `spec-sync init-config --no-assign` writes
  // `fieldOwnership: { assignee: 'none' }`, and the DEFAULTS carry
  // `assignee: 'push'`. An over-eager rename of the source would make one of
  // them write 'plan', and every config it generated would mean nothing.
  const fs = require('node:fs')
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli-sync.js'), 'utf8')
  assert.match(src, /fieldOwnership: \{ assignee: 'none' \}/)
  const cfg = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8')
  assert.match(cfg, /assignee: 'push'/)
})
