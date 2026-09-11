'use strict'

/**
 * The primary-checkout leak guard.
 *
 * A phase can be built in a worktree from a session standing somewhere else —
 * every write an absolute path, every command `cd`-prefixed. That works;
 * `spec-env review` already reads a worktree exactly that way. What it cannot do
 * is *prove* it worked: one relative path and the edit lands in the primary
 * checkout, on the base branch, silently.
 *
 * So record what the primary checkout looked like before the build
 * (`--record-primary`) and compare after it (`--assert-primary-clean`).
 *
 * The baseline is the whole point. `negative-checks.md` rule 1 asks for a
 * positive signal rather than an absence, and "these were the dirty paths at a
 * known moment" is one; a bare "the primary must be clean" check would accuse
 * anyone who left an unrelated edit open in another window. Rule 4 supplies the
 * third state: when the baseline is missing, or is for another spec, the check
 * cannot tell — and cannot-tell reports and exits 0 rather than accusing.
 */

const path = require('node:path')

// The state dir sits beside the registry file, e.g. `.spec-env` — the same
// convention `dev.js` uses for logs and pids.
function stateDir(config) {
  return path.posix.dirname(config.registry) || '.spec-env'
}

/** Where the baseline lives. Gitignored with the rest of `.spec-env/`. */
function baselinePath(dir, config) {
  return path.join(dir, stateDir(config), 'building.json')
}

/**
 * Merge one or more newline-separated git path listings into a sorted, deduped
 * array. Blank lines are dropped; nothing is parsed out of the line.
 *
 * DELIBERATELY NOT `git status --porcelain`, for two reasons, both found by
 * running this against a real worktree:
 *
 *   1. Porcelain puts the path behind two fixed status columns and a space, and
 *      the repo's `gitReader` TRIMS its stdout — so the first line loses its
 *      leading space and a fixed `slice(3)` eats the first character of the
 *      first path. A guard that renames the file it is accusing you of is worse
 *      than no guard.
 *   2. Porcelain reports stat-dirty entries: a file whose mtime moved but whose
 *      content is identical to HEAD. One was observed here, reported as ` M`
 *      with an empty `git diff`. Accusing someone of leaking a file they never
 *      changed is exactly the false accusation `negative-checks.md` exists to
 *      prevent.
 *
 * `git diff --name-only HEAD` compares CONTENT, and
 * `git ls-files --others --exclude-standard` lists genuinely new files. Between
 * them they answer "what did this tree gain?" without a column to miscount.
 */
function mergePaths(...listings) {
  const out = new Set()
  for (const listing of listings) {
    for (const line of String(listing || '').split('\n')) {
      const p = line.replace(/\r$/, '').trim()
      if (p !== '') out.add(p)
    }
  }
  return [...out].sort()
}

/** Are these two paths the same tree? */
function sameTree(a, b) {
  return path.resolve(a) === path.resolve(b)
}

/** The record written by `--record-primary`. Pure. */
function buildBaseline({ spec, worktreePath, primary, paths }) {
  return { spec, worktreePath, primary, paths: [...paths].sort() }
}

/**
 * Compare a recorded baseline against the primary checkout's current state.
 *
 * Three verdicts, never two (`negative-checks.md` rule 4):
 *   - `clean`   — nothing new appeared; say nothing and exit 0.
 *   - `leaked`  — these paths appeared since; name them and exit non-zero.
 *   - `unknown` — the check cannot tell; say why and exit 0.
 *
 * Pure: every input is supplied, nothing is read from disk or git.
 *
 * WHAT WOULD FOOL THIS CHECK, deliberately unhandled:
 *   - Work the build COMMITTED in the primary checkout. A commit empties the
 *     porcelain, so a leak that was tidied away looks identical to no leak. The
 *     guard is aimed at the actual failure mode — writes going astray mid-build,
 *     while nothing has been committed yet — and runs before the phase commit
 *     for that reason.
 *   - A write to a GITIGNORED path in the primary (`.spec-env/` itself, build
 *     output, `node_modules`). `git status` cannot see it, by design, and the
 *     baseline file lives in exactly such a path so that recording it is not
 *     itself a change the next comparison trips over.
 *   - A path dirty at record time and then edited FURTHER by the build. It is in
 *     the baseline, so it stays silent. That is the deliberate trade: silence
 *     there costs a missed edit to a file someone was already working on, and
 *     the opposite default accuses every healthy concurrent edit.
 */
function compare(baseline, currentPaths, { spec, worktreePath, primary }) {
  if (sameTree(primary, worktreePath)) {
    return {
      verdict: 'unknown',
      paths: [],
      reason: 'the worktree IS the primary checkout — there is no second tree to leak into',
    }
  }
  if (!baseline) {
    return { verdict: 'unknown', paths: [], reason: 'no baseline recorded' }
  }
  if (baseline.spec !== spec) {
    return {
      verdict: 'unknown',
      paths: [],
      reason: `the baseline was recorded for ${baseline.spec}, not ${spec}`,
    }
  }
  if (!sameTree(baseline.worktreePath, worktreePath)) {
    return {
      verdict: 'unknown',
      paths: [],
      reason: 'the baseline records a different worktree for this spec',
    }
  }
  const before = new Set(baseline.paths || [])
  const appeared = [...currentPaths].filter((p) => !before.has(p)).sort()
  return appeared.length === 0
    ? { verdict: 'clean', paths: [], reason: null }
    : { verdict: 'leaked', paths: appeared, reason: null }
}

module.exports = {
  stateDir,
  baselinePath,
  mergePaths,
  sameTree,
  buildBaseline,
  compare,
}
