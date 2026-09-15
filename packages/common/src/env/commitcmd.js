'use strict'

/**
 * Is this shell command a `git commit`?
 *
 * Asked by the review-gate hook, which is handed the command line a tool is
 * about to run and has to decide whether the gate is even relevant. It lives
 * here rather than inside the hook script for one reason: **a check that blocks
 * a commit is an accusation** (`.claude/rules/negative-checks.md`), and an
 * accusation that cannot be unit-tested will be wrong in ways nobody finds. The
 * hook is a stdin shim over `spec-env review gate --check --for-command`; this
 * is the part with the judgement in it.
 *
 * It answers TRUE only on a positive reading — a `git` invocation whose first
 * non-option argument is `commit`. Everything it cannot parse confidently reads
 * FALSE, because the cost of the two mistakes is not symmetric: a false
 * negative lets one commit through a gate the skills also enforce, while a
 * false positive blocks a command that has nothing to do with reviewing and
 * leaves the operator with no idea why.
 */

// Shell metacharacters that end one command and begin another. `|` covers `||`
// too, and `&` covers `&&`; over-splitting is harmless here because each
// fragment is judged on its own.
const SEPARATORS = /[;&|\n]+/

/**
 * Remove every quoted span. Pure.
 *
 * THE POINT IS WHAT THIS PREVENTS, twice over. `echo "deploy && git commit"`
 * must not read as a commit — splitting a raw string on `&&` would manufacture
 * a fragment out of someone's prose. And `git commit -m "fix the git log"`
 * must still read as one: emptying the quotes leaves the real argv intact,
 * because a verb is never inside quotes.
 *
 * An UNTERMINATED quote empties the rest of the line, so a half-written command
 * reads as nothing rather than as something — the cannot-tell case going to the
 * harmless branch, again.
 */
function stripQuoted(command) {
  let out = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === '\\' && quote === '"') {
        i++
        continue
      }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    out += c
  }
  return out
}

// git's own options, before the subcommand. Those taking a separate value have
// to be skipped WITH their value, or `git -C /tmp commit` reads its verb as the
// path. The `=` forms carry their value already.
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'])

/**
 * Does this one fragment invoke `git commit`? Pure.
 *
 * `env`, `sudo`, `time` and the like are NOT unwrapped: a wrapper is not the
 * common case and guessing at one is how a false positive gets built. The
 * binary may be a path (`/usr/bin/git`), because that is ordinary.
 */
function fragmentCommits(fragment) {
  const tokens = fragment.trim().split(/\s+/).filter(Boolean)
  const at = tokens.findIndex((t) => t === 'git' || /(^|\/)git$/.test(t))
  if (at === -1) return false

  for (let i = at + 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (GIT_OPTS_WITH_VALUE.has(t)) {
      i++
      continue
    }
    if (t.startsWith('-')) continue
    // The first non-option token is the subcommand, whatever it is. Only one
    // word is a commit.
    return t === 'commit'
  }
  return false
}

/**
 * Does this command line run `git commit` anywhere in it? Pure.
 *
 * WHAT WOULD FOOL THIS, named here so the next reader does not have to
 * rediscover it: a commit hidden inside a quoted script (`sh -c 'git commit'`),
 * behind an alias, or built by string interpolation reads as FALSE. All three
 * are deliberate — they are the unknown case, and the unknown case does not
 * accuse. The gate is still enforced by `/spec-next`, which does not depend on
 * reading anybody's shell.
 */
function isGitCommit(command) {
  if (typeof command !== 'string' || !command.trim()) return false
  return stripQuoted(command).split(SEPARATORS).some(fragmentCommits)
}

module.exports = { isGitCommit, stripQuoted, fragmentCommits }
