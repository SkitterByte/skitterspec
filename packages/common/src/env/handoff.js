'use strict'

/**
 * `spec-env handoff <spec>` — make a spec's work reachable by its next owner.
 *
 * A spec branch lives in a local worktree, and nothing requires it ever to
 * reach a remote — so a ticket handed to someone else points at code only its
 * old owner can see. This plans the two things that close that: the branch
 * published (a push the operator consents to, since it is outward-facing), and
 * a note for the ticket naming where the work is. `/spec-start` on the new
 * owner's machine then resumes from the published branch rather than forking.
 *
 * Pure: every fact arrives as an argument, so each answer is testable without a
 * repo. The CLI reads git and writes the note.
 */

const { phaseProgress, progressText } = require('./phases.js')
const { shellPath } = require('./project.js')

// Uncommitted work cannot travel with a push, so a hand-over would silently
// leave it behind in the old worktree. The engine declares the way out rather
// than leaving the skill to infer one (`offered-unblocks.md`): committing is
// what the guard asks for, so it is a `satisfy`, and nothing is weakened.
const COMMIT_FIRST = Object.freeze({ kind: 'satisfy', label: 'Commit first, then hand it over', command: '/commit' })

/**
 * @param {object} f
 *   - `spec`        `{ folder, branch, worktreePath }`
 *   - `worktree`    true when the worktree exists on this machine
 *   - `dirtyPaths`  uncommitted paths in that worktree ([] when clean)
 *   - `remote`      the remote name, and `remoteConfigured` whether it exists
 *   - `headSha`     the worktree's HEAD
 *   - `remoteSha`   the branch's sha on the remote, '' when unpublished,
 *                   null when the remote could not be asked
 *   - `phases`      `[{ file, content }]`
 */
function planHandoff(f) {
  const { spec } = f
  const refuse = (reason, offer) => ({ blocked: true, reason, ...(offer ? { offer } : {}) })

  if (!f.worktree) {
    return refuse(`${spec.folder} has no worktree on this machine — hand it over from wherever it is being built`)
  }
  if (f.dirtyPaths && f.dirtyPaths.length) {
    return refuse(
      `${spec.folder}'s worktree has ${f.dirtyPaths.length} uncommitted path(s) — a push carries commits, so they would stay behind`,
      COMMIT_FIRST,
    )
  }
  if (!f.remoteConfigured) {
    return refuse(`no remote named ${f.remote} — publish ${spec.branch} somewhere the new owner can reach first`)
  }

  const progress = phaseProgress(f.phases)
  // Published AT HEAD is the positive signal the push is already done; an
  // unpublished branch and a stale one both need it, and a remote that could
  // not be asked is planned as if it does (a redundant push is harmless).
  const published = Boolean(f.headSha && f.remoteSha && f.remoteSha === f.headSha)
  const commands = published ? [] : [`git -C ${shellPath(spec.worktreePath)} push -u ${f.remote} ${spec.branch}`]
  const sha = (f.headSha || '').slice(0, 12)
  const note = [
    `**Handed over** — the work is on \`${spec.branch}\` at \`${sha}\` (${f.remote}), ${progressText(progress)}.`,
    '',
    `\`/spec-start ${spec.folder}\` resumes from that branch rather than forking a new one.`,
    '',
  ].join('\n')

  return {
    blocked: false,
    branch: spec.branch,
    sha,
    remote: f.remote,
    published,
    remoteUnknown: f.remoteSha === null,
    progress,
    commands,
    note,
  }
}

module.exports = { planHandoff, phaseProgress, progressText, COMMIT_FIRST }
