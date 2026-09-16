'use strict'

/**
 * Guards for `/spec-diff` — the skill text, and the two engine behaviours it
 * depends on.
 *
 * The skill assertions are not pedantry about prose. Each one pins a property
 * that a later edit would plausibly "tidy" away: the no-gate rule (the third
 * cancelled spec in this line existed because someone reached for a gate), the
 * token cost (an unpriced offer is not a choice), and never publishing
 * unprompted (publishing leaves something behind the tooling cannot remove).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { run } = require('../src/cli.js')
const {
  renderReviewBlock,
  renderReviewPage,
  reviewUrlPath,
  readReviewUrl,
  CHECK_LEVELS,
} = require('../src/env/review.js')

const ROOT = path.join(__dirname, '..', '..', '..')
const SKILL = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'skills', 'spec-diff', 'SKILL.md'),
  'utf8',
)

// --- the skill text ---------------------------------------------------------

test('the skill is model-invocable, so /spec-next can offer it', () => {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)
  assert.ok(fm, 'parseable frontmatter')
  assert.match(fm[1], /^name:\s*spec-diff$/m)
  assert.match(fm[1], /^description:\s*\S/m)
  assert.doesNotMatch(fm[1], /disable-model-invocation/, 'not user-only')
})

test('it documents all three resolution rules, in order', () => {
  assert.match(SKILL, /\*\*The name argument\*\*/, 'the argument')
  assert.match(SKILL, /spec-env live status/, 'the spec in flight for this session')
  assert.match(SKILL, /worktree this session is standing in/, 'the worktree cwd is inside')
  // An unknown name must refuse rather than fall back — a review of the wrong
  // spec is indistinguishable from a review of the right one.
  assert.match(SKILL, /unknown name \*\*refuses\*\*/)
})

test('it states the no-gate rule, and says not to add one', () => {
  assert.match(SKILL, /Gate it on nothing/i)
  assert.match(SKILL, /no preconditions and must never grow one/)
  for (const gate of ['tests passing', 'the phase being finished', 'a clean\ntree']) {
    assert.ok(SKILL.includes(gate), `names "${gate}" as a gate it does not have`)
  }
})

test('it names what the written review costs before offering it', () => {
  assert.match(SKILL, /700 output\ntokens|700 output tokens/, 'the price is stated')
  assert.match(SKILL, /The page is free/)
  assert.match(SKILL, /--page-only/, 'and there is a way to decline it')
})

test('it keeps the two costs apart, and says when the reading one is zero', () => {
  // The skill first quoted a single "~700 output tokens, because you read the
  // diff to write it" — which attaches the number to the one part it does not
  // cover. Writing the review is output and roughly constant; READING the diff
  // is input and scales, and is zero when you just built the phase yourself.
  // Collapsing them back into one number is the regression to prevent.
  assert.match(SKILL, /two separate\s*\n?ways/i, 'the two costs are named as two')
  assert.match(SKILL, /you already have the diff — do not re-read it/i)
  assert.match(SKILL, /input, and it scales/i)
  // And the cheap route for the case where you genuinely do not have it.
  assert.match(SKILL, /`--json` returns the file\s*\n?list/i)
  assert.match(SKILL, /no patches/i, 'says why --json is the cheap way to choose')
  assert.match(SKILL, /noise: true/, 'names what to skip')
})

test('it never instructs an unprompted publish', () => {
  assert.match(SKILL, /\*\*Never publish unprompted\.\*\*/)
  assert.match(SKILL, /only when the user asks|When the user asks/i)
  assert.match(SKILL, /cannot remove/, 'says why: publishing is not undoable by the tooling')
  // One spec is one page — a second entry per phase is the failure mode.
  assert.match(SKILL, /update that URL|One spec is one page/i)
  assert.match(SKILL, /Never construct the path yourself/)
})

test('it protects the property the whole design rests on', () => {
  assert.match(SKILL, /never passes through the model/i)
  assert.match(SKILL, /zero\*\* context tokens|\*\*zero\*\*/)
})

test('the check levels the skill documents are the ones the engine renders', () => {
  for (const level of CHECK_LEVELS) {
    assert.ok(SKILL.includes(`"level": "${level}"`), `the skill shows a ${level} check`)
  }
})

test('it takes a pasted review pass, and reports before it edits', () => {
  // The intake is the half that WRITES, so the rules around it are the ones a
  // later edit would most plausibly streamline away.
  assert.match(SKILL, /--notes <file>/, 'it names the engine call that stores the pass')
  assert.match(SKILL, /--resolve <file>/, 'and the one that writes back what was done')
  // Phrasing-tolerant: what is pinned is that the blob is stored AS SENT, not
  // the punctuation between the two halves of saying so.
  assert.match(SKILL, /verbatim[^.]*never retype it/, 'the blob is stored as sent')
  // AMENDED, not dropped: it stops after reporting unless the pass already said
  // what to do. A bare paste is still ambiguous and still waits — that half is
  // pinned in "the wait rule is amended" below.
  assert.match(SKILL, /\*\*Wait — unless the verdict already said otherwise\.\*\*/, 'it stops after reporting')
  assert.match(SKILL, /Pasting on its own is\s*\n?\s*not a go-ahead/i, 'and says why')
  assert.match(SKILL, /do \*\*not\*\*\s*\n?\s*open the accepted ones/i, 'accepted files are not read')
  assert.match(SKILL, /say plainly which files you did not\s*\n?\s*open/i, 'and it says so, so the saving is checkable')
})

test('it states that a mark is never a gate', () => {
  // The one rule the operator asked for by name. Three cancelled specs in this
  // line exist because someone reached for a gate; this is the same shape.
  assert.match(SKILL, /A mark is information, never a gate/)
  assert.match(SKILL, /config key defaulting to off/, 'and what it would take to change that')
  assert.match(SKILL, /nothing here may start counting them/, 'the no-gate section carries it too')
})

test('the intake is priced like everything else the skill offers', () => {
  assert.match(SKILL, /What the intake costs/)
  assert.match(SKILL, /the paste is not overhead/)
})

test('the rule adopters read describes the round-trip, not just the page', () => {
  const rule = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'rules', 'spec-planning.md'),
    'utf8',
  )
  assert.match(rule, /takes a review pass back/i)
  assert.match(rule, /--notes/, 'names the store verb')
  assert.match(rule, /--resolve/, 'and the write-back verb')
  assert.match(rule, /the marks are information, never a gate/i)
})

test('every distribution ships the skill', () => {
  for (const pkg of ['skitterspec', 'skitterspec-linear']) {
    const dir = path.join(ROOT, 'packages', pkg, 'assets')
    if (!fs.existsSync(dir)) continue
    assert.ok(
      fs.existsSync(path.join(dir, 'skills', 'spec-diff', 'SKILL.md')),
      `${pkg} ships /spec-diff`,
    )
  }
})

// --- the engine half --------------------------------------------------------

test('the review block is rendered by the engine, with every field escaped', () => {
  const html = renderReviewBlock({
    summary: 'It <works> & reads well',
    checks: [{ level: 'flag', file: 'a<b>.js', note: 'careful with "this"' }],
  })
  assert.ok(html.includes('It &lt;works&gt; &amp; reads well'))
  assert.ok(html.includes('a&lt;b&gt;.js'))
  assert.ok(html.includes('&quot;this&quot;'))
  assert.ok(!html.includes('<b>'), 'no model-authored markup reaches the page')
})

test('an unknown check level is shown neutrally, never dropped', () => {
  // Losing a reviewer's note because it was tagged oddly is worse than showing
  // it under a neutral heading.
  const html = renderReviewBlock({ checks: [{ level: 'shout', note: 'keep me' }] })
  assert.ok(html.includes('keep me'))
  assert.ok(html.includes('check confirm'))
})

test('no review at all renders nothing, not an empty box', () => {
  assert.strictEqual(renderReviewBlock(null), '')
  assert.strictEqual(renderReviewBlock(undefined), '')
  const page = renderReviewPage(
    {
      title: 't', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
      totals: { files: 0, additions: 0, deletions: 0 }, files: [], review: null,
    },
    { reviewHtml: renderReviewBlock(null) },
  )
  assert.ok(!page.includes('__REVIEW_BLOCK__'))
  assert.ok(!page.includes('class="review"'))
})

test('the review block lands in the page when there is one', () => {
  const review = { summary: 'A clean phase.', checks: [{ level: 'good', file: 'x.js', note: 'nice' }] }
  const page = renderReviewPage(
    {
      title: 't', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
      totals: { files: 0, additions: 0, deletions: 0 }, files: [], review,
    },
    { reviewHtml: renderReviewBlock(review) },
  )
  assert.ok(page.includes('A clean phase.'))
  assert.ok(page.includes('check good'))
})

test('splicing is one pass — nothing spliced in is ever rescanned', () => {
  // Found by dogfooding: the page reviews its OWN source, so the data island
  // legitimately contains every placeholder string. Sequential replaces spliced
  // the whole JSON blob into the middle of a patch — and into any review note
  // that happened to quote a placeholder name.
  const data = {
    title: '__REVIEW_DATA__', branch: 'b', mode: 'working', base: null, generatedAt: 'n',
    totals: { files: 1, additions: 1, deletions: 0 }, review: null,
    files: [{
      path: 'page.html', status: 'modified', additions: 1, deletions: 0,
      whole: true, noise: false, binary: false,
      patch: '@@ -1 +1 @@\n+<div>__REVIEW_BLOCK__</div>',
    }],
  }
  const page = renderReviewPage(data, { reviewHtml: '<p>quoting __REVIEW_DATA__ verbatim</p>' })

  assert.ok(page.includes('<p>quoting __REVIEW_DATA__ verbatim</p>'), 'the note survives as written')
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(page)
  assert.ok(island, 'the island is intact')
  const back = JSON.parse(island[1])
  assert.strictEqual(back.files[0].patch, data.files[0].patch, 'the patch survives as written')
  assert.strictEqual(back.title, '__REVIEW_DATA__')
  // Exactly one island, not one plus a copy pasted into the review block.
  assert.strictEqual((page.match(/id="review-data"/g) || []).length, 1)
})

test('the url file sits beside the page and is absent until someone publishes', () => {
  const out = path.join(os.tmpdir(), 'skitterspec-url-test', 'feat-x.html')
  assert.strictEqual(reviewUrlPath(out), path.join(path.dirname(out), 'feat-x.url'))
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
  // Cannot tell → null. An unpublished spec and an unreadable file are the same
  // answer here, and both mean "do not claim this has a URL".
  assert.strictEqual(readReviewUrl(out), null)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(reviewUrlPath(out), 'https://example.test/abc\n')
  assert.strictEqual(readReviewUrl(out), 'https://example.test/abc')
  fs.rmSync(path.dirname(out), { recursive: true, force: true })
})

// --- the stays-silent case --------------------------------------------------

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

async function runQuiet(argv) {
  const orig = process.stdout.write
  let out = ''
  process.stdout.write = (chunk) => {
    out += chunk
    return true
  }
  try {
    await run(argv)
  } finally {
    process.stdout.write = orig
  }
  return out
}

// A repo with a spec in the backlog and NO worktree — a spec nobody has started.
function scaffold() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-diff-')))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'specs', '.core'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'specs', '.core', 'env.config.json'),
    JSON.stringify({ baseBranch: 'main', docker: { enabled: false } }, null, 2),
  )
  fs.writeFileSync(path.join(dir, '.gitignore'), '/.spec-env/\n')
  const backlog = path.join(dir, 'specs', 'backlog', 'feat-x')
  fs.mkdirSync(backlog, { recursive: true })
  fs.writeFileSync(path.join(backlog, '00-overview.md'), '# X\n\n> **Stack:** worktree\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  git(dir, 'branch', '-M', 'main')
  return dir
}

test('stays silent: a spec with no worktree is reported, not accused', async () => {
  const dir = scaffold()
  try {
    const out = await runQuiet(['spec-env', 'review', 'feat-x', '--dir', dir])
    // Not started is an ORDINARY state. It must not read as breakage, and it
    // must say what to do about it.
    assert.match(out, /has no worktree/)
    assert.match(out, /spec-start/)
    assert.doesNotMatch(out, /error|failed|invalid/i)
    assert.ok(!fs.existsSync(path.join(dir, '.spec-env', 'reviews')), 'and writes no page')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown spec name refuses rather than falling back to the branch', async () => {
  const dir = scaffold()
  try {
    await assert.rejects(
      () => runQuiet(['spec-env', 'review', 'feat-nope', '--dir', dir]),
      /spec not found/,
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- what a publish leaves behind, and how it is produced -----------------

// The engine writes a complete document and an artifact host wraps page
// content, so the skill has to name the flag. Doing it by hand is what this
// asserts against: three hand publishes in one day, and the first one cut at a
// `<!doctype html>` that was patch text.
test('publishing is told to use --publish-copy, not a hand transform', () => {
  assert.match(SKILL, /--publish-copy/)
  assert.match(SKILL, /Do not split the document yourself/)
  assert.match(SKILL, /ordinary patch text/)
})

test('reporting a URL comes with where the page is deleted', () => {
  assert.match(SKILL, /skitterspec cannot remove the page/)
  assert.match(SKILL, /`\/artifacts`/)
  assert.match(SKILL, /`spec-env down`\s*\n?\s*repeats it at teardown/)
})


// ---------------------------------------------------------------------------
// The one step here that WRITES — §2.4, working the commented files on the
// go-ahead — can write into a tree this session is not standing in, because
// §1's first rule resolves by name. It had no discipline and no leak guard at
// all, which made it the wider exposure of the two skills that edit code in a
// resolved worktree.

const ACT = SKILL.slice(SKILL.indexOf('4. **On the go-ahead'), SKILL.indexOf('## 2a. An approved pass'))

test('the writing step compares the worktree against where you stand', () => {
  assert.match(ACT, /compare the worktree against where you are standing/i)
  assert.match(ACT, /`worktree:` line/)
  assert.match(ACT, /resolving both\s*\n?\s*paths first/i)
  // Named as ordinary, not exceptional: a reader who thinks this is an edge
  // case skips the comparison on the path it is actually for.
  assert.match(ACT, /the ordinary case, not an\s*\n?\s*edge one/i)
})

test('the baseline precedes the edits and the check precedes the re-render', () => {
  const record = ACT.indexOf('--record-primary')
  const resolve = ACT.indexOf('--resolve <file>')
  const assertClean = ACT.indexOf('--assert-primary-clean')
  const rerender = ACT.indexOf('Then re-render')
  assert.ok(record !== -1 && assertClean !== -1, 'both engine calls are present')
  assert.ok(record < resolve, 'a baseline taken after the edits records the leak as normal')
  assert.ok(rerender < assertClean, 'nothing is reported fixed before it is known to be in the right tree')
})

// Copied across from `/spec-next` §4b, and the reason travels with it: the guard
// sees paths appear and cannot see who wrote them.
test('the leak step forbids guessing and deleting here too', () => {
  assert.match(ACT, /Do not guess which, and do not delete anything/i)
  assert.match(ACT, /not proof of who put it there/i)
  assert.match(ACT, /cannot tell/i)
  assert.match(ACT, /An absence is not evidence/i)
})

test('the check names the tree it cannot see', () => {
  assert.match(ACT, /WHAT WOULD FOOL THIS CHECK/)
  assert.match(ACT, /never a\s*\n?\s*false accusation/i)
})

// STAYS SILENT (`negative-checks.md` rule 3). Standing in the spec's own
// worktree — every bare invocation, and every `/spec-next` hand-off — must cost
// nothing. And the no-gate rule this skill exists beside must survive the
// addition: a write discipline says HOW to write, never WHETHER to run. That
// second assertion is green on both sides by design, which is what makes it the
// guard rather than the repro.
test('one tree is inert, and the no-gate rule is untouched', () => {
  assert.match(ACT, /Same tree, and everything below is inert/i)
  assert.match(ACT, /write discipline, not a precondition/i)
  assert.match(ACT, /never \*whether\* it runs/i)
  assert.match(SKILL, /This skill has no preconditions and must never grow one/)
  assert.match(SKILL, /A mark is information, never a gate/)
})

// --- the approve branch (phase 3) -------------------------------------------

test('a committing pass hands off to the configured skill, never a vendored one', () => {
  assert.match(SKILL, /## 2a\. A committing pass commits/)
  assert.match(SKILL, /commitWith/, 'it names the key the engine answers with')
  assert.match(SKILL, /Do not read the config\s*\n?\s*yourself/i, 'one answer, from the engine')
  // Decision 4. `/commit` is skittership's, and a copy living here would be a
  // fork of someone else's skill that drifts in silence.
  assert.match(SKILL, /\*\*Never vendor it\.\*\*/)
  assert.match(SKILL, /skittership/, 'and says whose skill it is')
  // THERE IS NO OFF SWITCH: `"none"` produced a verdict that records itself and
  // does nothing, which is the one thing a review page must not offer.
  assert.match(SKILL, /\*\*There is no off switch:\*\*/)
  assert.match(SKILL, /`"none"` existed and was removed/)
})

test('availability is read off the skill list, never a file path', () => {
  // `.claude/rules/negative-checks.md` rule 1: a skill can live in several
  // places, so a missing file proves nothing — and being wrong here means
  // committing by hand while reporting a hand-off.
  assert.match(SKILL, /Decide availability from the skill list/i)
  assert.match(SKILL, /never by testing\s*\n?\s*for a file/i)
  assert.match(SKILL, /negative-checks\.md/, 'it cites the rule so an edit meets it')
})

test('the fallback commits honestly, and says which path it took', () => {
  assert.match(SKILL, /commit it yourself/i)
  assert.match(SKILL, /\*\*Say that you did, every time\.\*\*/)
  assert.match(SKILL, /rules nobody configured must never be reported as one\s*\n?\s*made under `\/commit`/i)
  // The report is the only place the distinction can be recorded, so the field
  // list has to carry it too.
  assert.match(SKILL, /\*\*Say which path made the commit\*\*/i)
})

test('a red suite stops the commit, and is never worked around', () => {
  assert.match(SKILL, /Let the commit's own failure be the answer/)
  assert.match(SKILL, /Do not fix the tests to get\s*\n?\s*the commit through/i)
  // The sentence the whole branch rests on: approving a change is not a claim
  // that it builds.
  assert.match(SKILL, /\*\*An approval judges the change; it never promises that it builds\*\*/i)
})

test('the outcome is recorded after the commit, not before', () => {
  assert.match(SKILL, /--outcome "committed <sha> via <skill\|by hand>"/)
  assert.match(SKILL, /On a\s*\n?\s*failed commit there is no outcome to record/i)
  assert.match(SKILL, /Nothing is pushed/, 'the commit is local, like /commit leaves it')
})

test('the engine answers with the configured skill, so the prose has something to read', () => {
  // The positive half of the assertions above: prose can only route on a field
  // that exists. `review.commitWith` is the default the skill names.
  const { DEFAULT_CONFIG } = require('../src/env/config.js')
  assert.strictEqual(DEFAULT_CONFIG.review.commitWith, '/commit')
})

// --- routing all three verdicts (phase 4) -----------------------------------

test('each verdict routes, and the table says where', () => {
  assert.match(SKILL, /\| `commit` \(honoured\) \| this is fine, commit it \| §2a — commit, then stop \|/)
  assert.match(SKILL, /\| `commit-continue` \(honoured\) \|.*\| §2a — commit, then `\/spec-next` \|/)
  assert.match(SKILL, /\| `changes` \|.*\| step 4 — \*\*skip the wait\*\*/)
  assert.match(SKILL, /\| `discuss` \| I have a question \| step 3 — report, then \*\*ask what's up\*\* \|/)
  // A `changes` pass authorises the WORK, never a commit — only approve reaches
  // the commit branch, which is what keeps the two decisions different sizes.
  assert.match(SKILL, /\*\*Never commit on a `changes` pass\.\*\*/)
})

test('a refused commit and no verdict at all both mean discuss', () => {
  // The default is the behaviour that existed before verdicts did, which is why
  // it is the default: a pass from an older page keeps doing what it always did.
  assert.match(SKILL, /\*\*A refused commit and a pass with no verdict both mean `discuss`\.\*\*/)
  assert.match(SKILL, /an\s*\n?\s*absent verdict has always meant "report it and wait"/i)
})

test('the wait rule is amended, not deleted — and its reasoning survives', () => {
  // The rule was written against a genuinely ambiguous input: a bare paste says
  // nothing about what to do next. A verdict is not ambiguous, so the amendment
  // narrows the rule rather than contradicting it — and the WHY has to stay, or
  // a later edit reads the amendment as permission to drop the wait entirely.
  assert.match(SKILL, /\*\*Wait — unless the verdict already said otherwise\.\*\*/)
  assert.match(SKILL, /Pasting on its own is\s*\n?\s*not a go-ahead/i, 'the original reasoning stays')
  assert.match(SKILL, /a misread comment\s*\n?\s*costs a revert/i)
  assert.match(SKILL, /asking again\s*\n?\s*is asking someone to decide twice/i, 'and why a verdict is different')
  assert.match(SKILL, /The reasoning is unchanged/i)
})

// THE INTERESTING ONE. A verdict is a person's conclusion; a gate is a refusal
// derived from how many boxes are ticked. If shipping the first had required
// weakening a guard written to keep the second out, the design drifted — so
// this asserts the no-gate rules are still there, in full, beside the verdict.
test('the no-gate rule survives the verdict intact', () => {
  assert.match(SKILL, /A mark is information, never a gate/)
  assert.match(SKILL, /config key defaulting to off/)
  assert.match(SKILL, /nothing here may start counting them/)
  // And the verdict says so itself, at the point it is read.
  assert.match(SKILL, /\*\*Never re-judge it yourself, and never count anything\*\*/)
  // The one refusal is on unresolved COMMENTS — a presence — never on files
  // left unticked. Those two are what distinguish a verdict from a tally.
  const { judgeVerdict, emptyNotes } = require('../src/env/review.js')
  const noTicks = judgeVerdict('approve', emptyNotes('feat-x'))
  assert.strictEqual(noTicks.honoured, true, 'nothing ticked, and still approvable')
})

// --- the claim path (feat-review-post-back phase 4) -------------------------

test('a review comes back three ways, and none of them is the legacy one', () => {
  assert.match(SKILL, /--claim <code>/, 'it names the engine call that claims')
  assert.match(SKILL, /--notes <file>/, 'and the one that merges a paste')
  assert.match(SKILL, /--verdict <word>/, 'and the one that sends a bare verdict')
  assert.match(SKILL, /six-digit code/i)
  // The clipboard path is the whole story on `file://` once anything is marked
  // up — a command line cannot carry notes — so it must not be described as
  // superseded by the word that now covers the unmarked case.
  assert.match(SKILL, /Not legacy/i)
  assert.match(SKILL, /\*\*all three are ordinary\*\*/i)
  // The word's own limit is stated where the reader meets the word, not left
  // to be discovered when someone's notes go missing.
  assert.match(SKILL, /do not fit on a command line/i)
})

test('a claim is a delivery mechanism, not a second kind of review', () => {
  // If the two paths ever diverge in what they MEAN, the code has stopped being
  // a way of getting the pass across and become a second kind of review.
  assert.match(SKILL, /\*\*A claim is a delivery mechanism, not a second kind of review\.\*\*/)
  assert.match(SKILL, /nothing may behave\s*\n?\s*differently because of how it arrived/i)
})

test('a wrong code refuses without naming what is waiting', () => {
  // Listing the pending codes would hand a guesser the answer the refusal was
  // withholding — the one thing the code exists to prevent.
  assert.match(SKILL, /names nothing when it does/i)
  assert.match(SKILL, /listing the waiting codes would hand a\s*\n?\s*guesser the answer/i)
})

test('the skill prices the claim against the paste', () => {
  // The saving is the point, and an unpriced one is not a choice — the same
  // rule the written review is offered under.
  assert.match(SKILL, /\*\*A claimed pass never enters the context at all\.\*\*/)
  assert.match(SKILL, /it does scale with the review/i)
})

test('passes waiting are information, never a task', () => {
  assert.match(SKILL, /\*\*Passes waiting are information — and worth raising\.\*\*/)
  assert.match(SKILL, /never\s*\n?\s*treating it as a task is the rule that survives/i)
  // Raised, though: an operator who pressed a button and hears nothing cannot
  // tell a pass that never arrived from one waiting to be confirmed.
  assert.match(SKILL, /both look like silence/i)
  // And the no-gate rule it sits beside is untouched, which is the point: this
  // spec added a delivery mechanism, not a thing that counts.
  assert.match(SKILL, /A mark is information, never a gate/)
  assert.match(SKILL, /nothing here may start counting them/)
})

test('the engine offers what the prose promises', () => {
  // The positive half: prose can only describe a flag that exists. Both arms of
  // the round-trip are real engine calls.
  const help = fs.readFileSync(path.join(ROOT, 'packages', 'common', 'src', 'cli.js'), 'utf8')
  assert.match(help, /\[--claim <code>\]/, 'the usage line offers it')
  assert.match(help, /args\[i\] === '--claim'/, 'and the parser takes it')
})

// --- never claim unasked (feat-claim-by-confirmation phase 2) ---------------
//
// The rule is enforced by prose and by these, and that is honest rather than
// weak: the holding area is a file any agent with the repo can read, so nothing
// can stop a determined one. What stops a careless one is being told — and the
// one time it was not told, it read a code off disk and claimed the operator's
// approval while reporting the round-trip working.

test('the skill forbids claiming a pass it was not asked to claim', () => {
  assert.match(SKILL, /\*\*Never claim a pass you were not asked to claim\.\*\*/)
  // The security property, stated as the narrow thing it actually is. It is no
  // longer "the page cannot reach the conversation" — a phase-end wait means it
  // can, deliberately — so what is pinned here is what REPLACED that: who can
  // POST, and which pass a wait may take.
  assert.match(SKILL, /\*\*serve token\*\*/, 'who can POST at all')
  assert.match(SKILL, /\*\*window\*\*, which decides which pass/i, 'which pass may be claimed without being named')
  assert.match(SKILL, /--claim-since/, 'the one automatic path is named, not implied')
})

// The window is the whole scope, so the two ways it can be wrong are pinned:
// nothing arrived (ordinary) and two arrived (refuse rather than pick).
test('the wait claims only inside its window, and refuses to pick', () => {
  assert.match(SKILL, /## 4b\. Wait for the verdict/)
  assert.match(SKILL, /end the turn/i, 'it waits by ending the turn, not by polling')
  assert.match(SKILL, /\*\*Two or more\*\* — it refuses/i)
  assert.match(SKILL, /never swept up|never yours to take/i, 'a pass that predates the wait is not claimed')
})

// THE BYPASS IS NAMED. Prose that says "wait to be asked" without naming the
// file does not prevent reading the file — the agent is not being disobedient,
// it is solving the problem in front of it.
test('the skill names the read-it-off-disk bypass specifically', () => {
  assert.match(SKILL, /pending\.json/, 'the file is named')
  assert.match(SKILL, /Do not read the code out of/i)
  assert.match(SKILL, /It has already happened once/i, 'and says it is not hypothetical')
})

test('the offer names the code, and never merely describes the pass', () => {
  assert.match(SKILL, /\*\*Offer it, naming the code\*\*/)
  assert.match(SKILL, /verify rather than transcribe/i)
  // The code is the only part the operator can check against their phone —
  // a stranger's approval and their own read identically otherwise.
  assert.match(SKILL, /\*\*name it rather than describing the pass\*\*/)
})

test('two waiting is a refusal to guess, not a preference', () => {
  assert.match(SKILL, /\*\*Two or more waiting is a refusal to guess\.\*\*/)
  assert.match(SKILL, /Never take the newest, the oldest, or the only `commit`/)
})

test('a disowned pass can be dropped, and why that matters', () => {
  assert.match(SKILL, /--drop <code>/)
  assert.match(SKILL, /how the real one gets missed/i)
})

test('the engine offers what the rule needs, so the prose is not asking for fiction', () => {
  // The positive half: step 0 tells the agent to read the code off the render.
  // If the render did not carry it, the rule would be unfollowable and the file
  // would be right there.
  const { describePending, emptyPending, addPending } = require('../src/env/review.js')
  const held = addPending(emptyPending('feat-x'), {
    blob: { verdict: 'approve' }, at: '2026-01-01T00:00:00.000Z', render: 'R1',
  })
  const [first] = describePending(held.pending)
  assert.strictEqual(first.code, held.code, 'the render can name a code')
  assert.strictEqual(first.verdict, 'commit', 'described as the action it will take')
  assert.ok(!('blob' in first), 'without carrying the pass itself')
})

// --- the verdict names the action (feat-verdict-is-the-action phase 3) -------

// THE ONE THAT MATTERS. `continue` is the only place a button on a phone could
// reach a destructive action, and the distance between "build the next phase"
// and "land the branch and delete the worktree" is one skill name.
test('continue builds the next phase and never completes', () => {
  assert.match(SKILL, /### `commit-continue` — then the next phase, and no further/)
  assert.match(SKILL, /\*\*Never `\/spec-complete`\.\*\*/)
  assert.match(SKILL, /\*\*lands the branch and tears the worktree down\*\*/)
  assert.match(SKILL, /a person pressing a button on a phone cannot see which one you\s*\n?\s*picked/i)
  // And when there is no phase left it says so rather than reaching further.
  assert.match(SKILL, /say the\s*\n?\s*spec has none and stop/i)
})

test('a failed commit ends the chain rather than continuing past it', () => {
  assert.match(SKILL, /\*\*A failed commit is the end of the chain\.\*\*/)
  assert.match(SKILL, /The continue is downstream of the commit, not beside it/)
})

// The Non-goal is cited, not quietly reversed. A reader meeting the chaining
// later should find the argument it overturned.
test('the overturned Non-goal is quoted where a reader will meet it', () => {
  assert.match(SKILL, /\*\*This overturns a recorded Non-goal, and cites it rather than contradicting it\.\*\*/)
  assert.match(SKILL, /go build the next thing unattended/, 'the original wording')
  assert.match(SKILL, /conflated two meanings of unattended/i, 'and why it was wrong')
})

test('discuss opens a conversation rather than ending one', () => {
  assert.match(SKILL, /\*\*`discuss` means "ask me what's up"\*\*/)
  assert.match(SKILL, /a summary that ends in\s*\n?\s*silence leaves them to ask it themselves/i)
  // It is also what an absent verdict means, so the wording must not assume a
  // button was pressed at all.
  assert.match(SKILL, /ask about the\s*\n?\s*review, never about the button/i)
})

test('the engine speaks the words the prose routes on', () => {
  // The positive half: prose can only route on verdicts that exist.
  //
  // `continue` is in the vocabulary from the engine's side; the `/spec-diff`
  // prose that routes on it lands with the skills, not here.
  const { VERDICTS, COMMITTING } = require('../src/env/review.js')
  assert.deepStrictEqual(VERDICTS, ['commit', 'commit-continue', 'continue', 'changes', 'discuss'])
  assert.deepStrictEqual(COMMITTING, ['commit', 'commit-continue'])
  const { DEFAULT_CONFIG } = require('../src/env/config.js')
  assert.strictEqual(DEFAULT_CONFIG.review.commitWith, '/commit')
})
