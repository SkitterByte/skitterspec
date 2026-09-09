'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

// Walk every shipped Markdown asset (skills + rules).
function markdownAssets() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) out.push(abs)
    }
  }
  walk(path.join(ASSETS, 'skills'))
  walk(path.join(ASSETS, 'rules'))
  return out
}

// Tokens that would leak the tool's private origin project / wrong toolchain.
const FORBIDDEN = [/FF CSC/, /\bpnpm\b/, /\btsx\b/, /generate-releases\.ts/, /COMMIT_MESSAGES\.md/]

test('shipped Markdown assets carry no project-specific references', () => {
  for (const file of markdownAssets()) {
    const text = fs.readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN) {
      assert.ok(
        !pattern.test(text),
        `${path.relative(ASSETS, file)} contains forbidden ${pattern}`,
      )
    }
  }
})

test('every shipped skill has valid frontmatter with a matching name', () => {
  const skillsDir = path.join(ASSETS, 'skills')
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(skillsDir, entry.name, 'SKILL.md')
    assert.ok(fs.existsSync(file), `${entry.name}/SKILL.md exists`)
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))
    assert.ok(fm, `${entry.name} has YAML frontmatter`)
    const name = /^name:\s*(.+)$/m.exec(fm[1])
    const desc = /^description:\s*(.+)$/m.exec(fm[1])
    assert.ok(name && name[1].trim(), `${entry.name} has a name`)
    assert.ok(desc && desc[1].trim(), `${entry.name} has a description`)
    assert.strictEqual(name[1].trim(), entry.name, `${entry.name} name matches its folder`)
  }
})

const skillText = (name) =>
  fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// NOTE: the Linear link step (/spec) and pull-first step (/spec-next) are, as of the
// ticketing extraction, provider content — their coverage lives in the linear
// package's assets test (against the seam fragments). The shared /spec + /spec-next
// still carry the passages verbatim until Phase 3 replaces them with seam markers.

test('/spec-start documents trusting the worktree root via /add-dir', () => {
  // Provisioning lives in /spec-start, so the worktree-trust guidance does too.
  // It still matters in the one-workbench model: a spec the live overlay refuses
  // is PARKED, and its housekeeping reaches into the worktree with `git -C`.
  for (const name of ['spec-start']) {
    const text = skillText(name)
    assert.match(text, /\/add-dir/, `${name} instructs running /add-dir`)
    assert.match(
      text,
      /settings\.local\.json/,
      `${name} notes the persistent settings.local.json entry`,
    )
  }
})

// A worktree is only isolated for the AGENT. The shell that launched the session
// stays in the main checkout, and every terminal derives its git UI — branch chip,
// uncommitted-changes/diff panel — from the shell's cwd, not from ours. Reaching
// into the worktree with absolute paths therefore runs a whole spec with the diff
// panel describing a clean `main`, silently: nothing is broken, so nothing warns.
// Under the one-workbench model the hand-off is a BRANCH SWAP the operator must
// authorise (`/spec-live`, a user-only command), not a window someone opens for
// them — but it is still a hard stop, and for the same reason: this session
// cannot perform it, so carrying on regardless would build somewhere wrong.
// There is no branch swap any more: worktree mode builds the spec where it
// provisioned it. The swap used to route through `/spec-live`, a user-only
// command, which split every start across two invocations with the housekeeping
// stranded in between.
test('/spec-start never routes a start through the live overlay', () => {
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.doesNotMatch(flat, /type \*{0,2}`\/spec-live <name>`/, 'does not ask for the swap')
  assert.doesNotMatch(flat, /re-run `\/spec-start`/i, 'does not ask to be run twice')
  assert.match(flat, /the branch never leaves/i, 'says where the spec is built')
})

test('/spec-start says the live overlay is for testing, not for starting', () => {
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /Do not move the branch into this checkout/i)
  assert.match(flat, /`\/spec-live` is for testing/i)
})

// Skills whose 00-overview.md template carries the scannable `## Impact` map.
const IMPACT_TEMPLATE_SKILLS = ['spec', 'spec-bug', 'spec-hotfix']

test('spec overview templates carry the Impact map section', () => {
  for (const name of IMPACT_TEMPLATE_SKILLS) {
    const text = skillText(name)
    assert.match(text, /^## Impact$/m, `${name} template has an ## Impact heading`)
    assert.match(
      text,
      /\|\s*Surface\s*\|\s*Change\s*\|\s*Detail\s*\|/,
      `${name} template has the Surface | Change | Detail table header`,
    )
  }
})

test('spec-planning rule documents the Impact map in the overview contents', () => {
  const text = fs.readFileSync(
    path.join(ASSETS, 'rules', 'spec-planning.md'),
    'utf8',
  )
  assert.match(
    text,
    /entry point \/ dashboard[\s\S]*?Impact map/,
    'spec-planning lists the Impact map in the 00-overview.md contents',
  )
})

test('negative-checks rule states all four points', () => {
  const text = fs.readFileSync(
    path.join(ASSETS, 'rules', 'negative-checks.md'),
    'utf8',
  )
  // Phases 2 and 3 audit the codebase's accusing checks against these four —
  // a point silently dropped from the rule would take its audit with it.
  for (const heading of [
    /^## 1\. Prefer a positive signal to an absence$/m,
    /^## 2\. Name the blind spot beside the check$/m,
    /^## 3\. Pair every accusation with a stays-silent test$/m,
    /^## 4\. Bias the unknown case toward inaction$/m,
  ]) {
    assert.ok(heading.test(text), `negative-checks.md carries ${heading}`)
  }
})

// The phase-file H1 emoji is the ONE load-bearing status signal (a provider maps
// it to the phase's tracker state; an absent emoji reads as not-started). Every
// skill that authors or edits phase files must say so — /spec ships it in the
// template, /spec-next flips it, and /spec-review creates phase files whenever it
// migrates a legacy spec into the folder + phase-file form. It shipped without
// the convention once, and three migrated specs mirrored their complete phases
// as backlog; this guard is why that can't silently recur.
const PHASE_HEADING_SKILLS = ['spec-next', 'spec-review']

test('skills that author or edit phase files state the H1 status convention', () => {
  for (const name of PHASE_HEADING_SKILLS) {
    const text = skillText(name)
    // assert.ok, not assert.match — a failed match dumps the whole SKILL.md.
    assert.ok(/⬜|🔄|✅/u.test(text), `${name} names the status emoji`)
    assert.ok(/heading|h1/i.test(text), `${name} ties the status to the heading`)
  }
})

test('spec-review points the emoji at phase-file creation, not just editing', () => {
  const text = skillText('spec-review')
  // The migration path is how the convention gets missed: /spec-review is the
  // skill that splits a legacy spec into 0N-<slug>.md files from scratch.
  assert.ok(/authoritative/i.test(text), 'spec-review says the heading wins')
  assert.ok(
    /legacy spec|inline phases/i.test(text),
    'spec-review covers the legacy-migration path that authors phase files',
  )
})

test('spec-review re-validates the Impact map as a drift check', () => {
  const text = skillText('spec-review')
  assert.match(text, /Impact map/, 'spec-review references the Impact map')
  assert.match(
    text,
    /Walk every row of the[\s\S]*?Impact/,
    'spec-review instructs walking the ## Impact table against the code',
  )
})

// The Linear config template/docs and the sync-command docs are provider assets —
// covered in the linear package's assets test. (Base README Linear cleanup: Phase 4.)

// A lifecycle skill that EDITS the spec (status flip + `git mv`) and then hits a
// clean-tree guard must commit its own edits — otherwise it dirties the worktree
// and then refuses to proceed because of that dirt, every single run. The guard
// is still right for work the *user* left uncommitted; the fix is to check for
// that BEFORE editing, not to stop after.
const SELF_EDITING = ['spec-complete', 'spec-cancel']

test('a self-editing lifecycle skill commits its own edits before the guard', () => {
  for (const name of SELF_EDITING) {
    const text = skillText(name)
    // assert.ok, not assert.match — a failed match dumps the whole SKILL.md.
    assert.ok(
      /commit (its own|the) (completion|cancellation) edits/i.test(text),
      `${name} commits the edits it made itself`,
    )
    assert.ok(/chore\(spec\):/.test(text), `${name} names the commit it makes`)
    assert.ok(
      !/Do \*\*not\*\* ?\n?`git commit` unless the user asks/.test(text),
      `${name} must not blanket-forbid committing — it has to commit its own edits`,
    )
  }
})

test('a self-editing lifecycle skill checks for pre-existing dirt before editing', () => {
  for (const name of SELF_EDITING) {
    const text = skillText(name)
    const pre = text.search(/pre-existing uncommitted changes/i)
    assert.notStrictEqual(pre, -1, `${name} checks the tree before it edits`)
    const move = text.search(/## \d\. Move to (complete|cancelled)/)
    assert.notStrictEqual(move, -1, `${name} has its move step`)
    assert.ok(pre < move, `${name} checks BEFORE the move, not after`)
  }
})

test('/spec-to-main keeps the no-auto-commit rule — it edits nothing itself', () => {
  const text = skillText('spec-to-main')
  assert.ok(/don't auto-commit/.test(text), 'the rule is correct where dirt is the user\'s own work')
  assert.ok(!/## \d\. Move to /.test(text), 'spec-to-main moves no spec, so it dirties nothing')
})

// --- tracker seam placement --------------------------------------------------

// The sync seam's POSITION is load-bearing, and both halves are silent when
// wrong. Before the `git mv` the projection still reads the old folder bucket, so
// the tracker is set to the state the spec is leaving. After the commit, the ids
// and snapshot the push writes are left uncommitted, and `spec-env integrate`
// refuses to land a dirty worktree. Only the gap between them is correct.
for (const [skill, moveMarker] of [
  ['spec-complete', 'specs/complete/<name>'],
  ['spec-cancel', 'specs/cancelled/<name>'],
]) {
  test(`${skill} syncs the tracker after the move and before the commit`, () => {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    const seam = text.indexOf('<!-- seam:spec-tracker-sync -->')
    const move = text.indexOf(moveMarker)
    const commit = text.indexOf('git add specs/ && git commit')

    assert.ok(seam !== -1, 'the seam is present')
    assert.ok(move !== -1 && commit !== -1, 'the move and commit steps are recognisable')
    assert.ok(move < seam, 'the push must see the spec in its new bucket')
    assert.ok(seam < commit, 'the commit must sweep up what the push writes')
  })
}

// Reclaiming the environment is what completing a spec IS, and by the time step 7
// runs the branch is an ancestor of base with the engine's own guards in front of
// it — so a confirmation gate there stops the flow to re-ask a question already
// answered. /spec-cancel is deliberately NOT included: its branch is abandoned
// work that never landed, which is a different risk.
test('/spec-complete tears the environment down without asking', () => {
  const text = skillText('spec-complete')
  const step7 = text.slice(text.indexOf('## 7.'))
  assert.doesNotMatch(step7, /offer — don't force/, 'no confirmation gate on teardown')
  assert.match(step7, /automatically — do not ask/, 'says so explicitly')
  // The precondition is what makes the confirmation redundant; without it stated,
  // teardown could run after a conflict and take the worktree the user needs.
  assert.match(step7, /Only tear down when step 6[\s\S]{0,20}completed/, 'gated on the landing')
  // With nothing to confirm, the report is the only place the user learns.
  assert.match(step7, /Say what you reclaimed/, 'reports what it removed')
})

test('/spec-complete keeps --keep-env as the opt-out', () => {
  const step7 = skillText('spec-complete').slice(skillText('spec-complete').indexOf('## 7.'))
  assert.match(step7, /`--keep-env`/, 'names the flag')
  assert.match(step7, /skip sub-steps 1–3/, 'says what it skips')
})

test('the volume prune still asks, because it reaps other specs\' volumes', () => {
  // The reasoning that removes the teardown prompt does not reach prune: "this
  // spec landed cleanly" says nothing about orphans left by other specs.
  const step7 = skillText('spec-complete').slice(skillText('spec-complete').indexOf('## 7.'))
  assert.match(step7, /only on their confirmation/i, 'prune keeps its gate')
  assert.match(step7, /This one still asks/, 'and says why it differs from 1–3')
})

test('/spec-cancel still offers teardown rather than forcing it', () => {
  const text = skillText('spec-cancel')
  assert.match(text, /offer — don't force/, 'a cancelled branch never landed')
})

// The base distribution is tracker-free. These skills may carry the marker (it
// composes to nothing without a provider) but must never name a tracker.
test('the terminal skills stay provider-neutral in their own source', () => {
  for (const skill of ['spec-complete', 'spec-cancel']) {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(text, /linear/i, `${skill} must not name a specific tracker`)
  }
})

// A spec that is never linked is never mirrored, and /spec-bug and /spec-hotfix
// are exactly the skills invoked mid-incident, when nobody is thinking about the
// tracker. Both must link at creation, like /spec does.
for (const [skill, greenStep, reportStep] of [
  ['spec-bug', '## 5. Drive to GREEN', '## 6. Report'],
  ['spec-hotfix', '## 6. Drive to GREEN', '## 7. Report'],
]) {
  test(`${skill} links the spec it just wrote, before driving the fix`, () => {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    const seam = text.indexOf('<!-- seam:spec-tracker-link -->')
    assert.ok(seam !== -1, 'the link seam is present')
    // Before the fix work, so the issue exists WHILE the work happens rather
    // than being backfilled once it is over.
    assert.ok(seam < text.indexOf(greenStep), 'linking precedes the fix')
  })

  // The link seam fires BEFORE the fix, so nothing it sends can carry the ticks
  // the fix produces. These two skills can take a bug from report to green
  // without /spec-next ever running, so with no second seam a fully-fixed bug is
  // mirrored as an issue whose tasks are all still open, indefinitely.
  test(`${skill} refreshes the mirror after it ticks the Fix tasks`, () => {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    const link = text.indexOf('<!-- seam:spec-tracker-link -->')
    const ticks = text.indexOf('Tick the Fix tasks')
    const progress = text.indexOf('<!-- seam:spec-tracker-progress -->')
    const report = text.indexOf(reportStep)

    assert.ok(ticks !== -1, 'the tick-the-tasks write is recognisable')
    assert.ok(report !== -1, 'the report step is recognisable')
    assert.ok(progress !== -1, 'the progress seam is present')
    // Anchored on the WRITE, not the section heading: the seam has to follow the
    // ticks themselves, and a later reshuffle of the step must not slip past it.
    assert.ok(link < ticks, 'the link still precedes the fix')
    assert.ok(ticks < progress, 'the refresh follows the ticks it mirrors')
    assert.ok(progress < report, 'and precedes the report, which states the outcome')
  })
}

test('spec-review refreshes the mirror after it rewrites the spec', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-review', 'SKILL.md'), 'utf8')
  const seam = text.indexOf('<!-- seam:spec-tracker-sync -->')
  assert.ok(seam !== -1, 'the sync seam is present')
  assert.ok(seam > text.indexOf('## 4. Update the spec'), 'after the rewrite, not before')
  assert.ok(seam < text.indexOf('## 5. Report'), 'and before the report')
})

// /spec-next changes state TWICE — once when the phase starts, once when it
// finishes — and both writes live in steps 4 and 5, after the step-3b seam that
// used to be its only tracker step. A push that fires before the `🔄` flip
// mirrors the state the phase is LEAVING, which is how phase sub-issues sat in
// Backlog for a whole build and all jumped to Done at /spec-complete.
test('/spec-next syncs at phase start, after the 🔄 flip', () => {
  const text = skillText('spec-next')
  const started = text.indexOf('flip the matching row in the overview phase index to `🔄`')
  const seam = text.indexOf('<!-- seam:spec-next-start -->')
  const record = text.indexOf('## 4. Record progress')

  assert.ok(started !== -1, 'the phase-start write is recognisable')
  assert.ok(seam !== -1, 'the start seam is present')
  assert.ok(started < seam, 'the push must see the phase already marked in progress')
  assert.ok(seam < record, 'and must not wait until the phase is finished')
})

test('/spec-next refreshes the mirror after it records the phase', () => {
  const text = skillText('spec-next')
  const done = text.indexOf('flip the matching phase-index row to `✅`')
  const seam = text.indexOf('<!-- seam:spec-tracker-progress -->')
  const report = text.indexOf('## 5. Report')

  assert.ok(done !== -1, 'the phase-done write is recognisable')
  assert.ok(seam !== -1, 'the progress seam is present')
  assert.ok(done < seam, 'the push must see the phase already marked done')
  assert.ok(seam < report, 'and the report must be able to state the outcome')
})

test('spec-next stays provider-neutral in its own source', () => {
  assert.doesNotMatch(skillText('spec-next'), /linear/i, 'spec-next must not name a specific tracker')
})

test('the creating and reviewing skills stay provider-neutral in their source', () => {
  for (const skill of ['spec-bug', 'spec-hotfix', 'spec-review']) {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(text, /linear/i, `${skill} must not name a specific tracker`)
  }
})

// Each lifecycle skill's LAST tracker seam, paired with the last spec-progress
// write it has to follow. Presence alone is not enough: /spec-next carried a seam
// for months while both its phase writes happened after it, so every phase
// sub-issue sat in Backlog for a whole build and jumped to Done at the end. The
// anchors are the skills' real words, so a reworded step fails loudly here
// rather than silently matching nothing.
const SEAM_PLACEMENT = {
  spec: ['spec-tracker-link', '> **Status:** Ready — not started'],
  'spec-bug': ['spec-tracker-progress', 'Tick the Fix tasks'],
  'spec-hotfix': ['spec-tracker-progress', 'Tick the Fix tasks'],
  'spec-next': ['spec-tracker-progress', 'flip the matching phase-index row to `✅`'],
  'spec-complete': ['spec-tracker-sync', 'specs/complete/<name>'],
  'spec-cancel': ['spec-tracker-sync', 'specs/cancelled/<name>'],
  'spec-review': ['spec-tracker-sync', '## 4. Update the spec'],
}

// Returns a problem string, or null when the skill is fine. A function rather
// than inline asserts so the two tests below can feed it literals — the one that
// proves it fires, and the one that proves it stays quiet.
//
// BLIND SPOT: SEAM_PLACEMENT is hand-maintained, so a NEW lifecycle skill that
// nobody adds to it is not checked at all — this asserts the seven listed skills
// are right, never that the list is complete. There is no positive signal for
// "is this skill part of the lifecycle?" to widen it with: the skills directory
// also holds /spec-connect, /spec-live and /spec-init, which correctly have no
// seam. Adding a lifecycle skill means adding it here, by hand.
function seamPlacementProblem(skill, text, seam, lastWrite) {
  const marker = `<!-- seam:${seam} -->`
  // lastIndexOf on both: a skill may carry several seams (/spec-bug links early
  // AND refreshes late), and it is the LAST one that has to follow the write.
  const at = text.lastIndexOf(marker)
  const wrote = text.lastIndexOf(lastWrite)
  if (at === -1) return `${skill}: no ${marker}`
  // An anchor that has drifted out of the asset yields -1, which would compare
  // as "the seam comes after it" and pass while checking nothing. That vacuous
  // pass is how the /spec-next defect shipped, so a missing anchor is a failure.
  if (wrote === -1) return `${skill}: anchor ${JSON.stringify(lastWrite)} not found`
  if (at < wrote) return `${skill}: ${marker} precedes the write it mirrors`
  return null
}

test('every skill that changes spec state syncs AFTER its last write', () => {
  const problems = []
  for (const [skill, [seam, lastWrite]] of Object.entries(SEAM_PLACEMENT)) {
    const text = fs.readFileSync(path.join(ASSETS, 'skills', skill, 'SKILL.md'), 'utf8')
    const problem = seamPlacementProblem(skill, text, seam, lastWrite)
    if (problem) problems.push(problem)
  }
  assert.deepEqual(problems, [], `misplaced tracker steps:\n  ${problems.join('\n  ')}`)
})

// Proves the check can fire — all three ways it is allowed to.
test('the placement check catches a seam that is missing, early, or unanchored', () => {
  const early = 'intro\n<!-- seam:s -->\nflip it to done\n'
  assert.match(seamPlacementProblem('x', early, 's', 'flip it to done'), /precedes the write/)
  assert.match(seamPlacementProblem('x', 'flip it to done\n', 's', 'flip it to done'), /no <!-- seam:s -->/)
  assert.match(seamPlacementProblem('x', '<!-- seam:s -->\n', 's', 'reworded'), /not found/)
})

// The stays-silent case (.claude/rules/negative-checks.md rule 3): a healthy but
// UNUSUAL skill — two seams, the earlier one deliberately before the write, as
// /spec-bug and /spec-hotfix are — must not be accused. Without this, "the seam
// comes before the write" reads as a defect in the skills that are correct.
test('the placement check stays silent on a skill that links early and syncs late', () => {
  const healthy = [
    '## 4. Write it',
    '<!-- seam:spec-tracker-link -->',
    '## 5. Drive to GREEN',
    'Tick the Fix tasks; add a Changelog line.',
    '<!-- seam:spec-tracker-progress -->',
    '## 6. Report',
  ].join('\n')
  assert.equal(
    seamPlacementProblem('spec-bug', healthy, 'spec-tracker-progress', 'Tick the Fix tasks'),
    null,
    'an early link seam is correct, not a misplacement',
  )
})

// /spec-to-main and /spec-live change no status — a push from them would send an
// unchanged projection. Asserted so "add a seam everywhere" is a deliberate no.
test('the lifecycle entries that change no status carry no tracker seam', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-to-main', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(text, /<!--\s*seam:/, 'spec-to-main moves no spec between buckets')
  // spec-live is a command now; it changes no status either, and a command body
  // has no seam to fill in the first place.
  for (const cmd of ['spec-connect.md', 'spec-live.md']) {
    const body = fs.readFileSync(path.join(ASSETS, 'commands', cmd), 'utf8')
    assert.doesNotMatch(body, /<!--\s*seam:/, `${cmd} moves no spec between buckets`)
  }
})

// --- /spec-hotfix intake -----------------------------------------------------

// A hotfix is written under time pressure, against a released tag, by whoever is
// on. That is the worst moment to be retyping a report from another window — so
// it adopts the issue like the other two creating skills.
test('spec-hotfix adopts an issue before it establishes the tag', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-hotfix', 'SKILL.md'), 'utf8')
  const seam = text.indexOf('<!-- seam:spec-tracker-intake -->')
  assert.ok(seam !== -1, 'the intake seam is present')
  // Before the tag step, so the issue is in hand when the skill asks which
  // version prod is running — that is what lets it offer what the report says.
  assert.ok(seam < text.indexOf('## 1. Establish the base version'), 'intake precedes the tag')
})

test('an issue-ref-shaped argument is a ref, never a spec name', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-hotfix', 'SKILL.md'), 'utf8')
  assert.match(text, /never a name/i, 'the disambiguation rule is stated')
  assert.match(text, /SKI-123/, 'with a concrete example')
  assert.match(text, /Release tags don't take that shape/, 'and why the two cannot collide')
})

// The one failure here that is both easy and expensive: forking from the version
// the reporter happened to be on rather than the one that is deployed.
test('the base tag is offered from the issue but never assumed', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-hotfix', 'SKILL.md'), 'utf8')
  assert.match(text, /ask which version prod is running/, 'still asks')
  assert.match(text, /offer any versions it mentions/i, 'offers what the report says')
  assert.match(text, /not a default/, 'and is explicit that it is not a default')
})

// --- Grilling cadence --------------------------------------------------------
//
// `/spec` and `/spec-review` interview the user before writing. They used to
// mandate "one question at a time", which costs a full model round trip per
// question even when the questions are independent of one another — five
// unrelated questions became five turns for no gain in answer quality.
//
// The rule is now conditional: batch what is independent, sequence what is not.
// Both halves matter, so both are guarded — dropping the sequencing half would
// invite asking a question whose wording depends on an answer not yet given.
//
// THE BLIND SPOT: "one at a time" is still correct prose elsewhere. `/spec`
// tells the reader to work through DEPENDENCIES between decisions one at a
// time, which is about ordering the analysis, not about how many questions go
// in a message. So this matches the retired instruction — asking QUESTIONS one
// at a time — and never the bare phrase. The stays-silent test below pins that.
const GRILLING_SKILLS = ['spec', 'spec-review']
const retiredCadence = /(?:ask|asking)\b[^.]*\bone question at a time|one question at a time\b/i

test('no grilling skill still mandates one question at a time', () => {
  const offenders = []
  for (const name of GRILLING_SKILLS) {
    if (retiredCadence.test(skillText(name))) offenders.push(name)
  }
  assert.deepStrictEqual(offenders, [], `still mandates one-question-at-a-time: ${offenders.join(', ')}`)
})

test('the grilling skills tell you to batch AND to sequence', () => {
  // The replacement, not merely the absence of the old rule. Without this a
  // deletion would satisfy the guard above while leaving no cadence at all.
  for (const name of GRILLING_SKILLS) {
    const text = skillText(name)
    assert.match(text, /batch(?:ing|ed)?\b/i, `${name} says to batch independent questions`)
    assert.match(text, /independent/i, `${name} names independence as the condition`)
    assert.match(text, /recommended answer/i, `${name} still asks for a recommended answer`)
  }
  const spec = skillText('spec')
  assert.match(spec, /ask that one alone and wait/i, 'spec keeps the sequencing half')
})

test('the cadence guard stays silent on ordering dependent decisions', () => {
  // Healthy-but-unusual input: the sentence that must remain sayable. Resolving
  // dependencies one at a time is about the order of the analysis, and a guard
  // that could not tell it from the retired instruction would forbid correct
  // advice — and would fire on /spec today, which still says exactly this.
  const fine = [
    'resolving dependencies between decisions one at a time.',
    'Work the areas one at a time, in logical order.',
  ]
  for (const s of fine) {
    assert.ok(!retiredCadence.test(s), `false positive on: ${s}`)
  }
  const spec = skillText('spec')
  assert.match(spec, /decisions one at a time/, 'the live sentence this must not accuse is still there')
})

// --- /spec-next: the building half, gated on a spec being in flight ----------
//
// `/spec-next` conflated provisioning with building, which is why the worktree
// hand-off needed a second invocation of the same command. `/spec-next` is the
// building half alone — the command you re-run per phase, and the one a session
// in a parked worktree runs directly.
//
// Its resolution order is the load-bearing part. This skill WRITES CODE, so
// picking the wrong spec produces commits on a branch nobody asked for; it
// therefore refuses rather than falling back to whatever spec was last
// discussed, which is exactly the guess a helpful agent would otherwise make.
test('/spec-next resolves the spec in flight, in a stated order', () => {
  const text = skillText('spec-next')
  assert.match(text, /## 1\. Identify the spec in flight/, 'resolution comes first')
  assert.match(text, /spec-env live status/, 'the live receipt is the primary signal')
  assert.match(text, /worktree you are standing in/i, 'the manual-parallel path')
  assert.match(text, /current branch, in `checkout` mode/i, 'checkout mode has no worktree')
})

test('/spec-next refuses rather than guessing a spec from context', () => {
  const text = skillText('spec-next')
  assert.match(text, /no spec in flight/i, 'names the refusal')
  assert.match(text, /\/spec-start <name>/, 'points at the way out')
  assert.match(text, /Never fall back to the spec "in context"/i, 'forbids the tempting guess')
})

test('/spec-next carries the build half whole, seams included', () => {
  // Extraction, not rewrite: the tracker seams must travel or a provider
  // distribution silently loses its progress-refresh steps.
  const text = skillText('spec-next')
  for (const section of [/Pre-flight/, /Implement the phase/, /Record progress/, /Report/]) {
    assert.match(text, section, `build section present: ${section}`)
  }
  assert.match(text, /<!-- seam:spec-tracker-progress -->/, 'progress seam travelled')
  assert.match(text, /Tests are part of the phase/i, 'the green-before-done rule survived')
})

test('/spec-next does not provision — that is /spec-start', () => {
  // The split is the point. If provisioning language creeps back in, the two
  // commands have re-merged and the hand-off problem returns with them.
  const text = skillText('spec-next')
  for (const absent of [/git worktree add/, /spec-env up/, /hand off/i]) {
    assert.doesNotMatch(text, absent, `provisioning must not appear: ${absent}`)
  }
})

// --- /spec-start: the gate is the whole design -------------------------------
//
// One checkout holds one spec in flight. The gate is what makes that true, and
// it is a REFUSAL rather than an auto-park because every way past it moves
// somebody's unfinished work: stashing hides it, committing decides for them,
// `/spec-live main` rebases a branch they were mid-thought on. The refusal costs
// one command; guessing wrong costs an afternoon.
test('/spec-start gates on a free workbench before anything else', () => {
  const text = skillText('spec-start')
  const gate = text.indexOf('## 1. The gate')
  assert.ok(gate > 0 && gate < text.indexOf('## 2.'), 'the gate is section 1')
  assert.match(text, /on the base branch/i, 'requires base')
  assert.match(text, /clean/i, 'requires a clean tree')
})

test('/spec-start names the ways out of the checkout-mode gate', () => {
  // A refusal that does not say how to proceed is just an obstacle. `/spec-live
  // main` is no longer among them: parking to free the workbench is a
  // one-workbench answer, and only checkout mode holds one spec now.
  const text = skillText('spec-start')
  for (const way of ['/spec-complete', '/spec-cancel']) {
    assert.ok(text.includes(way), `names ${way} as a way out`)
  }
})

test('/spec-start never works around its own gate', () => {
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /Never get past the gate yourself/i, 'forbids it explicitly')
  assert.match(flat, /Do not stash/i, 'names stashing')
  assert.match(flat, /do not switch branches/i, 'names switching')
})

test('/spec-start builds every worktree-mode spec the same way', () => {
  // What used to be the parked path — housekeep in the worktree, open a session,
  // build there — is now the only path. A hotfix and a stateful spec stopped
  // being special cases here the moment nothing tried to take the checkout.
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /git -C <worktreePath>/, 'housekeeping is anchored to the worktree')
  assert.match(flat, /run \*{0,2}`\/spec-next`\*{0,2} from a session in it/i, 'names the way to build it')
  assert.doesNotMatch(flat, /a spec the live overlay refuses/i, 'no refusal-only branch left')
})

test('/spec-start housekeeps before it finishes', () => {
  // The ordering IS the fix: the other way round leaves a provisioned worktree
  // whose spec still reads Ready in specs/backlog/. It used to say "before any
  // hand-off"; the hand-off is now only the degraded path, so the deadline is
  // the end of the skill on every path, not the hand-off on one of them.
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /Do this before you report anything/i)
})

test('/spec-start flows into /spec-next rather than stopping', () => {
  // The operator asked to START the spec; ending on "now run /spec-next" would
  // reintroduce the two-invocation cost this split exists to remove.
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /carry straight on into `\/spec-next`/i)
  assert.match(flat, /Do not stop and ask/i)
})

test('/spec-start has no --here, because it is here', () => {
  const text = skillText('spec-start')
  assert.match(text, /There is no `--here`/, 'says so explicitly for anyone migrating')
})

test('/spec-start carries no tracker seam, and says why', () => {
  // It creates no spec and mints no issue; /spec-next's refresh covers the one
  // state change it makes. An unexplained absence would read as an oversight.
  const text = skillText('spec-start')
  assert.doesNotMatch(text, /<!-- seam:/, 'no seam markers')
  assert.match(text, /Why there is no tracker seam here/, 'the absence is documented')
})

// --- what became of the opener, and of the mode branch -----------------------
//
// Both used to be /spec-next's, and the one-workbench model moved them:
//
//  * The OPENER no longer runs at a hand-off, because worktree mode's hand-off
//    is now a branch swap into THIS checkout (`/spec-live`), not a window
//    someone opens for you. It survives on one path only — a spec the live
//    overlay refuses stays parked in its worktree and is worked on from a
//    session there. The three old tests about window lifecycle (stops after
//    opening, degrades when none is configured, never opens headlessly) were
//    deleted with the behaviour they guarded, rather than left asserting
//    something no skill does.
//
//  * The MODE BRANCH moved to /spec-start, which owns provisioning.

test('/spec-start opens a session in the worktree it provisioned', () => {
  const flat = skillText('spec-start').replace(/\s+/g, ' ')
  assert.match(flat, /run `open\.command` if one is configured/i, 'opens a session there')
})

test('/spec-start reads the mode and describes both paths', () => {
  const text = skillText('spec-start')
  assert.match(text, /read `mode` from `specs\/\.core\/env\.config\.json`/i, 'reads the key')
  assert.match(text, /### `worktree` mode/, 'names the worktree path')
  assert.match(text, /### `checkout` mode/, 'names the checkout path')
})

test('/spec-start needs no hand-off in checkout mode', () => {
  // The checkout IS the workbench there, so it alone carries straight on into
  // phase 1 in the same session.
  const text = skillText('spec-start')
  const checkout = text
    .slice(text.indexOf('### `checkout` mode'), text.indexOf('## 4.'))
    .replace(/\s+/g, ' ')
  assert.ok(checkout.length > 100, 'found the checkout section')
  assert.match(checkout, /no hand-off/i, 'says none is needed')
  assert.match(checkout, /already the workbench/i, 'explains why')
})

// --- tearing down the tree you are standing in -------------------------------
//
// Measured, not assumed: `git worktree remove` does NOT refuse the worktree the
// shell is inside. It SUCCEEDS, the directory vanishes underneath, `pwd` keeps
// reporting the dead path, and every command after it fails with
// `fatal: Unable to read current working directory`. So the teardown looks fine
// and everything following it breaks — the report, the prune, any verification.
//
// That makes relocate-FIRST the only safe ordering, and the ordering is the
// thing worth pinning: a future edit that moves the relocation after the
// teardown restores the bug while leaving both sentences present.
const TEARDOWN_SKILLS = ['spec-complete', 'spec-cancel']

test('teardown tells you to leave the worktree before removing it', () => {
  for (const name of TEARDOWN_SKILLS) {
    const flat = skillText(name).replace(/\s+/g, ' ')
    assert.match(flat, /Leave it before you tear it down/i, `${name} names the rule`)
    assert.match(flat, /Unable to read current working directory/i, `${name} names the real failure`)
  }
})

test('teardown does not claim git refuses — it says the opposite', () => {
  // The wrong reason would send the next reader hunting a refusal that never
  // comes, and invite "just force it" as the fix.
  for (const name of TEARDOWN_SKILLS) {
    const flat = skillText(name).replace(/\s+/g, ' ')
    assert.match(flat, /Not because git refuses — it does not/i, `${name} corrects the intuition`)
  }
})

test('the relocation is ordered before the teardown command, in both skills', () => {
  for (const name of TEARDOWN_SKILLS) {
    const text = skillText(name)
    const relocate = text.indexOf('Leave it before you tear it down')
    const teardown = text.indexOf('spec-env down <name>', relocate)
    assert.ok(relocate !== -1, `${name} carries the rule`)
    assert.ok(teardown > relocate, `${name} relocates BEFORE the removal`)
  }
})

// --- the stub move: gone for /spec-bug, required for /spec-hotfix ------------
//
// These two look inconsistent and are not, so the difference is asserted rather
// than left to be "tidied". A bug's worktree forks from `main`, so committing the
// stub puts it there; a hotfix's forks from a release TAG, which a commit on
// `main` never reaches. Deleting the move from the hotfix would provision a
// worktree with no spec in it.

test('/spec-bug no longer moves its stub — the gate commits it', () => {
  const flat = skillText('spec-bug').replace(/\s+/g, ' ')
  assert.doesNotMatch(flat, /mv specs\/in-progress\/bug-/, 'no manual move')
  assert.doesNotMatch(flat, /mkdir -p <worktreePath>/, 'no bucket-creation hazard left')
  assert.match(flat, /commits the stub first/i, 'says what replaced it')
})

test('/spec-hotfix keeps the move, and says why it differs', () => {
  const flat = skillText('spec-hotfix').replace(/\s+/g, ' ')
  assert.match(flat, /mv specs\/in-progress\/hotfix-/, 'the move survives')
  assert.match(flat, /checked out at the tag/i, 'names the reason')
  assert.match(flat, /differs from `\/spec-bug`/i, 'points at the sibling it differs from')
})
