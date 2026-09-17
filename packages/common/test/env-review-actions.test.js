'use strict'

/**
 * Actions: the page can change what is RUNNING, and which tiers are permitted.
 *
 * AN ACTION IS NOT A VERDICT, and almost every test here is about that
 * separation being structural rather than remembered. A verdict is the reader's
 * conclusion, consumed once by the thing it asked for. `live-on`, `live-off`,
 * `allow-network` and `allow-remote` change something and hand the reader back
 * to the same page with the same options — so a run answering one has concluded
 * nothing, and the gate a finished phase armed must survive it untouched.
 *
 * The tier actions reopen `feat-three-review-links` decision 5, which rejected a
 * page toggle on the grounds that *"today the page can only queue a pass, and
 * that limit is what makes an open port defensible"* — recorded as decided
 * safely and open to reopening. This spec removes that premise. What replaces it
 * is asserted below: enable-only, and nothing that lets a press widen a surface
 * the presser could not already reach.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  ACTIONS,
  VERDICTS,
  COMMITTING,
  tierAction,
  surfacesFor,
  validateNotesBlob,
  judgeVerdict,
  reviewTierStack,
} = require('../src/env/review.js')

const blob = (extra) => ({ version: 1, spec: 'feat-x', ...extra })

// --- the vocabularies stay apart ------------------------------------------

test('the four actions, and none of them is a verdict', () => {
  assert.deepStrictEqual(ACTIONS, ['live-on', 'live-off', 'allow-network', 'allow-remote'])
  for (const a of ACTIONS) {
    assert.ok(!VERDICTS.includes(a), `${a} must never be a verdict`)
    assert.ok(!COMMITTING.includes(a), `${a} must never commit`)
  }
})

// STRUCTURAL, NOT REMEMBERED. The gate is discharged by a COMMITTING verdict or
// a recorded skip, and `judgeVerdict` is the only thing that says a verdict was
// honoured. An action reaches neither, so a phase that ended still owes an
// answer after the reader has looked at it running.
test('the doors an action word could arrive through both refuse it', () => {
  // The two reachable ones, asserted where they are: the blob refuses an action
  // in the verdict slot, and `judgeVerdict` no longer honours a word it does not
  // know. Both matter — the first is the page, the second is everything else.
  assert.throws(() => validateNotesBlob(blob({ verdict: 'live-on' }), 'feat-x'), /is not one of/)
})

test('an action is incapable of clearing a gate, by construction', () => {
  for (const a of ACTIONS) {
    const judged = judgeVerdict(a, { comments: [] })
    // Not a verdict, so it is not honoured as one — it falls to the default,
    // which reports and does nothing.
    assert.notStrictEqual(judged.effective, a)
    assert.ok(!COMMITTING.includes(judged.effective))
  }
})

// --- the blob ------------------------------------------------------------

test('a blob may carry an action', () => {
  for (const a of ACTIONS) {
    assert.strictEqual(validateNotesBlob(blob({ action: a }), 'feat-x').action, a)
  }
})

test('a blob with no action reports none, and is otherwise unchanged', () => {
  const parsed = validateNotesBlob(blob({ verdict: 'commit' }), 'feat-x')
  assert.strictEqual(parsed.action, null)
  assert.strictEqual(parsed.verdict, 'commit')
})

// REFUSED BY NAME, for the reason a misspelt verdict is: dropping it the way an
// unknown KEY is dropped would read as a pass carrying no instruction, reported
// as if the press had been honoured.
test('an unknown action is refused by name, not dropped', () => {
  assert.throws(() => validateNotesBlob(blob({ action: 'live-onn' }), 'feat-x'), /is not one of/)
  assert.throws(() => validateNotesBlob(blob({ action: 42 }), 'feat-x'), /is not one of/)
})

test('a blob carrying both a verdict and an action is refused', () => {
  assert.throws(
    () => validateNotesBlob(blob({ verdict: 'commit', action: 'live-on' }), 'feat-x'),
    /carries both a verdict \(commit\) and an action \(live-on\) — send one/,
  )
})

// --- enable-only ---------------------------------------------------------

// Turning `network` off from a page reached over the network kills the page
// doing the turning, and the reader gains nothing they could not get by typing
// the command. So there is no disable direction anywhere.
test('only an off tier offers an action', () => {
  assert.strictEqual(tierAction({ tier: 'network', off: true }), 'allow-network')
  assert.strictEqual(tierAction({ tier: 'remote', off: true }), 'allow-remote')
  assert.strictEqual(tierAction({ tier: 'network', url: 'http://x' }), null)
  assert.strictEqual(tierAction({ tier: 'remote', url: 'https://x' }), null)
})

test('local has no action at all — there is no setting to flip', () => {
  assert.strictEqual(tierAction({ tier: 'local', url: 'file:///x' }), null)
  assert.strictEqual(tierAction({ tier: 'local', off: true }), null)
})

test('the actions the tier stack can produce are exactly the enables', () => {
  const stack = reviewTierStack({
    served: null,
    fileUrl: 'file:///x',
    publishedUrl: null,
    config: { review: { allowNetwork: false, allowRemote: false } },
  })
  const actions = stack.map(tierAction).filter(Boolean)
  assert.deepStrictEqual(actions, ['allow-network', 'allow-remote'])
})

// --- the surfaces block --------------------------------------------------

test('a free workbench offers live-on; a live one offers live-off', () => {
  const off = surfacesFor({ live: { state: 'off' }, tiers: [] })
  assert.deepStrictEqual(off, [
    { kind: 'live', state: 'off', url: null, reason: null, action: 'live-on' },
  ])
  const on = surfacesFor({ live: { state: 'on', url: 'http://127.0.0.1:3000' }, tiers: [] })
  assert.strictEqual(on[0].action, 'live-off')
  assert.strictEqual(on[0].url, 'http://127.0.0.1:3000')
})

// `held` is another spec's to release. A press here would either park someone
// else's work or do nothing, so it offers no action and carries the reason.
test('a held workbench offers no press, and says whose it is', () => {
  const rows = surfacesFor({
    live: { state: 'held', reason: 'feat-auth holds the workbench (branch feat/auth)' },
    tiers: [],
  })
  assert.strictEqual(rows[0].state, 'held')
  assert.strictEqual(rows[0].action, null)
  assert.match(rows[0].reason, /feat-auth holds the workbench/)
})

test('an off tier becomes a row with its enable; an on one contributes nothing', () => {
  const rows = surfacesFor({
    live: null,
    tiers: [
      { tier: 'local', url: 'file:///x' },
      { tier: 'network', url: 'http://192.168.0.1:7760/x' },
      { tier: 'remote', off: true },
    ],
  })
  assert.deepStrictEqual(
    rows.map((r) => [r.tier, r.action]),
    [['remote', 'allow-remote']],
  )
})

// --- STAYS SILENT --------------------------------------------------------

// ABSENT, NOT EMPTY. A caller that passes neither a live state nor a stack must
// render the payload it rendered before any of this existed — an empty array
// would add a key, and the page would draw an empty strip from it.
test('STAYS SILENT: nothing to say produces null, never an empty block', () => {
  assert.strictEqual(surfacesFor({ live: null, tiers: null }), null)
  assert.strictEqual(surfacesFor({}), null)
  assert.strictEqual(surfacesFor({ live: { state: 'unavailable' }, tiers: [] }), null)
})

// `unavailable` is the cannot-tell state (`.claude/rules/negative-checks.md`
// rule 4) — a project with no isolation, a spec with no worktree. It must not
// become a row saying so: an explanation of an absence is the noise version of
// an accusation.
test('STAYS SILENT: an unavailable live state is no row, not a row reading unavailable', () => {
  const rows = surfacesFor({
    live: { state: 'unavailable', reason: 'no worktree to put live' },
    tiers: [{ tier: 'remote', off: true }],
  })
  assert.deepStrictEqual(
    rows.map((r) => r.kind),
    ['tier'],
  )
})

// A tier that is permitted but has no address is neither actionable nor
// reachable — a machine with no network, or remote permitted with nothing
// published. Nothing to press and nothing to open, so nothing is said.
test('STAYS SILENT: a permitted tier with no address is no row', () => {
  const rows = surfacesFor({
    live: null,
    tiers: [
      { tier: 'network', unavailable: true, note: 'no network address on this machine' },
      { tier: 'remote', unavailable: true, note: 'publishing is an ask — nothing published yet' },
    ],
  })
  assert.strictEqual(rows, null)
})

// SAID BEFORE THE PRESS. `allow` edits a COMMITTED file in the primary
// checkout — behaviour for everyone who pulls, and a dirty tree — where the
// live actions touch no tracked file at all. A reader tapping a button labelled
// only `Allow remote` must not discover that afterwards.
test('an enable row warns that it writes a committed, shared file', () => {
  const rows = surfacesFor({
    live: null,
    tiers: [
      { tier: 'network', off: true },
      { tier: 'remote', off: true },
    ],
  })
  for (const row of rows) {
    assert.match(row.note, /committed, and shared/, `${row.tier} says what it writes`)
  }
})

// The live rows carry no such warning, because there is nothing to warn about:
// `live take` moves a branch between checkouts and writes a gitignored receipt.
test('a live row carries no warning, because it writes no tracked file', () => {
  const rows = surfacesFor({ live: { state: 'off' }, tiers: [] })
  assert.strictEqual(rows[0].reason, null)
  assert.ok(!('note' in rows[0]) || !rows[0].note)
})
