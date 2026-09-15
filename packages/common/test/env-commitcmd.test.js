'use strict'

/**
 * "Is this a `git commit`?" — the judgement inside an accusation.
 *
 * The review-gate hook blocks a tool call on the strength of this answer, so
 * being wrong costs something in both directions — but not equally. A false
 * negative lets one commit past a gate `/spec-next` also enforces; a false
 * positive blocks a command that has nothing to do with reviewing, and leaves
 * the operator with no idea why. So the true cases are pinned, and the
 * stays-silent cases outnumber them (`.claude/rules/negative-checks.md` rule 3).
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { isGitCommit, stripQuoted } = require('../src/env/commitcmd.js')

const commits = (c) => assert.strictEqual(isGitCommit(c), true, c)
const ignores = (c) => assert.strictEqual(isGitCommit(c), false, JSON.stringify(c))

test('it fires on the shapes a commit actually takes', () => {
  commits('git commit')
  commits('git commit -m "a message"')
  commits("git commit -m 'a message' -- path/one path/two")
  commits('git commit --amend')
  // `/spec-start` and `/commit` both prefix with -C, and the verb must still be
  // found past an option that carries its own value.
  commits('git -C /tmp/wt commit -m x')
  commits('git -c user.name=Test commit')
  commits('git --git-dir=/tmp/.git commit')
  commits('/usr/bin/git commit')
  // The chained form this whole feature exists around.
  commits('pnpm test && git commit -m "phase 2"')
  commits('git add -- a.js; git commit -m x')
})

// --- stays silent -----------------------------------------------------------

test('another git subcommand is not a commit', () => {
  for (const c of [
    'git status',
    'git push',
    'git add -- a b',
    'git log --oneline -5',
    // The one most likely to catch a naive substring match.
    'git log --grep=commit',
    'git show HEAD',
    'git worktree add ../wt -b feat/x',
  ]) ignores(c)
})

test('the word inside a quoted string is prose, not a verb', () => {
  // Splitting a raw command on `&&` would manufacture a fragment out of
  // somebody's sentence. Emptying quoted spans first is what prevents it.
  ignores('echo "deploy && git commit"')
  ignores("echo 'git commit'")
  ignores('grep -r "git commit" docs/')
  // And the mirror image: a real commit whose MESSAGE mentions other commands
  // is still a commit, because a verb is never inside quotes.
  commits('git commit -m "fix the git log output"')
  commits('git commit -m "git push is not run here"')
})

test('a commit hidden where it cannot be read is a no, deliberately', () => {
  // Cannot-tell → the harmless branch. Reaching these takes a wrapper nobody
  // uses by accident, and the gate is still enforced by /spec-next.
  ignores('sh -c "git commit"')
  ignores('bash -c \'git commit -m x\'')
  ignores('$GIT commit')
})

test('nothing, and nonsense, are both a no', () => {
  for (const c of ['', '   ', null, undefined, 42, {}]) ignores(c)
})

test('an unterminated quote empties the rest rather than inventing a verb', () => {
  // A half-written command line must read as nothing, not as something.
  assert.strictEqual(stripQuoted('echo "git commit'), 'echo ')
  ignores('echo "git commit')
})

test('a commit is found wherever it sits in a chain', () => {
  commits('cd /tmp && git commit -m x')
  commits('git commit -m x || echo failed')
  commits('true; true; git commit')
  // ...and a chain with no commit in it still says nothing.
  ignores('cd /tmp && git status && git log')
})
