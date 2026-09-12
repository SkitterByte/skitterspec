'use strict'

/**
 * THE INVARIANT: no lifecycle skill publishes a spec branch — at any point.
 * Not at provisioning, not after a phase commits, not on the way to cancelling.
 * The tooling may PRINT a `git push`; it may never run one.
 *
 * `/spec-start` used to push at provision time, which is how the rule eroded the
 * first time: the justification ("records the state for everyone, fires the
 * tracker's automation") was written once and then outlived the config that
 * would have made it true — tracker automation needs `{identifier}` in
 * `branch.pattern`, and the shipped default has none. The change that brings it
 * back will sound just as reasonable ("push after phase 1, as a backup"), so the
 * guard has to name the invariant rather than the incident.
 *
 * A blanket ban on the string `git push` is the version of this test that gets
 * deleted rather than fixed, because three legitimate pushes exist and it fails
 * on all of them: `/spec-hotfix`'s deploy TAG, `/spec-complete`'s advice that the
 * user may push the BASE branch, and teardown's `push --delete` of a remote
 * branch. So every mention is classified, and only an unclassifiable one fails.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const SKILLS_DIR = path.join(__dirname, '..', 'assets', 'skills')
const LINEAR_SKILLS_DIR = path.join(__dirname, '..', '..', 'linear', 'assets', 'skills')

function lifecycleSkills() {
  const out = []
  for (const dir of [SKILLS_DIR, LINEAR_SKILLS_DIR]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name, 'SKILL.md')
      if (fs.existsSync(file)) out.push([name, fs.readFileSync(file, 'utf8')])
    }
  }
  return out
}

// The sanctioned shapes, each with the reason it is legitimate. A mention that
// matches none of these is an unexplained push and fails the guard.
const SANCTIONED = [
  // A prohibition is not an instruction — "Do not `git push`" must stay legal.
  [/\b(do\s+not|don't|never|nothing\s+here\s+does)\b/i, 'prohibition'],
  // A deploy tag is not a branch: /spec-hotfix ships by tagging for CI/CD.
  [/\b(tag|--follow-tags)\b/i, 'tag push'],
  // The BASE branch is the user's to publish; /spec-complete and /spec-to-main
  // both say so without doing it.
  [/\bbase branch\b/i, 'base-branch advice'],
  // Teardown's remote delete removes a branch rather than publishing one, and is
  // confirmed with the user before it runs.
  [/--delete/, 'remote delete'],
  // A publish command offered to the operator. Legal only in a file that also
  // says it is never run — checked separately below.
  [/push -u origin <branch>/, 'offered publish command'],
]

// Files allowed to carry an offered publish command, each required to disclaim
// running it. Anything else offering one fails on the never-run check.
const NEVER_RUN = /never run it|Do not `git push`|nothing here does it for you/

test('no lifecycle skill carries an unclassifiable git push', () => {
  const unexplained = []
  for (const [name, text] of lifecycleSkills()) {
    for (const line of text.split('\n')) {
      if (!/git\s+(-C\s+\S+\s+)?push|\bpush -u\b/.test(line)) continue
      if (SANCTIONED.some(([re]) => re.test(line))) continue
      unexplained.push(`${name}: ${line.trim()}`)
    }
  }
  assert.deepStrictEqual(
    unexplained,
    [],
    `unclassified git push — the tooling may print one, never run one:\n${unexplained.join('\n')}`,
  )
})

test('every skill offering a publish command disclaims running it', () => {
  for (const [name, text] of lifecycleSkills()) {
    if (!/push -u origin <branch>/.test(text)) continue
    assert.match(text, NEVER_RUN, `${name} offers a publish command without saying it is never run`)
  }
})

test('/spec-start commits without publishing, and says whose job that is', () => {
  const s = fs.readFileSync(path.join(SKILLS_DIR, 'spec-start', 'SKILL.md'), 'utf8')
  assert.match(s, /\*\*Commit it\.\*\*/)
  assert.doesNotMatch(s, /Commit it, and push the branch/)
  assert.match(s, /Publishing that branch is yours to do/)
  assert.match(s, /git -C <worktreePath> push -u origin <branch>/)
})

test('/spec-start drops the tracker-automation justification', () => {
  // It was false for every default install: automation needs `{identifier}` in
  // `branch.pattern`, which the shipped default does not carry. Left in place it
  // is the argument someone uses to put the push back.
  const s = fs.readFileSync(path.join(SKILLS_DIR, 'spec-start', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(s, /records the\n\s*in-progress state for everyone and fires the tracker's automation/)
  assert.match(s, /The automation needs `\{identifier\}` in/)
})

test('/spec-start notes the teardown guard is reachable, without re-explaining it', () => {
  const s = fs.readFileSync(path.join(SKILLS_DIR, 'spec-start', 'SKILL.md'), 'utf8')
  assert.match(s, /refuseTeardownIfUnpushed/)
  assert.match(s, /`\/spec-cancel`/)
  // The detail belongs in /spec-cancel; duplicating it here is how the two drift.
  assert.doesNotMatch(s, /or accept the loss/)
})

test('/spec-bug and /spec-hotfix stay consistent — neither publishes', () => {
  // They were always the counter-examples to /spec-start's push; the point of
  // this phase is that all three now agree.
  const bug = fs.readFileSync(path.join(SKILLS_DIR, 'spec-bug', 'SKILL.md'), 'utf8')
  const hotfix = fs.readFileSync(path.join(SKILLS_DIR, 'spec-hotfix', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(bug, /push -u origin/)
  assert.match(hotfix, /Do \*\*not\*\* `git push`/)
})

test('the guard stays silent on all three legitimate pushes', () => {
  // The stays-silent half (.claude/rules/negative-checks.md rule 3). Each line
  // below is a real shape from a shipped skill; a guard that fails these is a
  // guard that gets deleted rather than fixed.
  const innocent = [
    '   remind the user to `git push origin <deploy-tag>` to deploy. Then teardown',
    '   mention the user can `git push` the base branch themselves.',
    '   `git push <remote> --delete <branch>`; on a no, leave it and say the remote',
    'needs `--force`. Do not `git push`.',
    '     git -C <worktreePath> push -u origin <branch>',
  ]
  for (const line of innocent) {
    assert.ok(
      SANCTIONED.some(([re]) => re.test(line)),
      `legitimate push was flagged: ${line.trim()}`,
    )
  }
})

test('the guard still catches the push it was written for', () => {
  // The positive half: prove it can fire. This is the exact line removed from
  // /spec-start step 4, plus the backup-shaped reintroduction the notes predict.
  const guilty = [
    '- **Commit it, and push the branch.** One commit, the spec\'s own — it records the',
    '  Then publish it as a backup: `git push -u origin feat/thing`.',
  ]
  for (const line of guilty) {
    assert.ok(
      !SANCTIONED.some(([re]) => re.test(line)),
      `guard would not catch: ${line.trim()}`,
    )
  }
})

test('the invariant holds on the COMPOSED surface, not just the source', () => {
  // What ships is the composition of a skill with its provider seams, and a seam
  // is a perfectly good place to put back a push nobody reviews — the source
  // file stays clean and the guard above stays green. Compose in memory from the
  // source: `packages/skitterspec*/assets/` is gitignored build output, so a test
  // that reads it passes for whoever just ran a build and fails on a fresh clone.
  const { composeText, loadFragments, mergeFragments } = require('../../../scripts/compose.js')
  const fragments = mergeFragments(
    loadFragments(path.join(__dirname, '..', 'assets', 'seams')),
    loadFragments(path.join(__dirname, '..', '..', 'linear', 'assets', 'seams')),
  )

  const unexplained = []
  for (const [name, text] of lifecycleSkills()) {
    for (const line of composeText(text, fragments).split('\n')) {
      if (!/git\s+(-C\s+\S+\s+)?push|\bpush -u\b/.test(line)) continue
      if (SANCTIONED.some(([re]) => re.test(line))) continue
      unexplained.push(`${name} (composed): ${line.trim()}`)
    }
  }
  assert.deepStrictEqual(unexplained, [], `unclassified git push after composition:\n${unexplained.join('\n')}`)
})
