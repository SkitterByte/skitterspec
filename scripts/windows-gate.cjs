#!/usr/bin/env node
'use strict'

/**
 * Decide whether release.yml needs its own Windows run, or can adopt one.
 *
 *   node scripts/windows-gate.cjs        (in Actions: writes run= and adopted=)
 *
 * A batch release cuts one commit and one tag per package, and the commits
 * differ from each other — and from main's head — only by a version line and a
 * RELEASES-*.md file. Each tag used to run the 5–10 minute Windows suite over
 * the same code. This looks at the ci.yml and release.yml runs created BEFORE
 * this one, keeps those whose commit is equivalent to HEAD (`equivalent`), and
 * adopts a green Windows job among them, waiting for one still in flight. Main's
 * CI push lands before the tags, so it is normally the run adopted and one
 * Windows run covers the whole batch (chore-release-ci-test-dedup).
 *
 * EVERY CANNOT-TELL RUNS THE SUITE (`.claude/rules/negative-checks.md` rule 4):
 * no token, an API error, a commit the clone does not have, a red or cancelled
 * run, a wait that outlives the deadline. The script exits 0 on every path —
 * it answers `run=true` or `run=false`, and never fails the workflow itself.
 *
 * WHAT WOULD FOOL IT: equivalence is a diff, not a test run. A test whose
 * outcome on Windows depends on a version string or a release-notes file would
 * pass on the adopted run and be skipped here. migration-guide.test.js reads
 * versions, which is why the stage job still runs `pnpm test` on Ubuntu for
 * every tag; nothing Windows-specific is known to read either.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')

const WORKFLOWS = ['ci.yml', 'release.yml']
const WINDOWS_JOB = 'windows (node 24)'
const POLL_MS = 30 * 1000
const DEADLINE_MS = 30 * 60 * 1000

// --- pure helpers -----------------------------------------------------------

const NOTES_RE = /^RELEASES-[^/]+\.md$/
const MANIFEST_RE = /^packages\/[^/]+\/package\.json$/
const VERSION_LINE_RE = /^[+-]\s*"version"\s*:\s*"[^"]*"\s*,?\s*$/

/**
 * True when a `git diff -U0 <candidate> HEAD` changes nothing but release
 * bookkeeping: a RELEASES-*.md at the root, and packages/<pkg>/package.json
 * whose only changed line is `"version"`. An empty diff is the same tree.
 *
 * A positive signal (rule 1): every file in the diff must be shown harmless.
 * A rename, mode change, binary marker or a second changed line in a manifest
 * all fail it, because each is a shape this function was not written to read.
 */
function equivalent(diff) {
  const sections = String(diff).split(/^(?=diff --git )/m).filter((s) => s.startsWith('diff --git '))
  return sections.every((section) => {
    const m = /^diff --git a\/(\S+) b\/(\S+)/.exec(section)
    if (!m || m[1] !== m[2]) return false
    const file = m[2]
    if (NOTES_RE.test(file)) return true
    if (!MANIFEST_RE.test(file)) return false
    const lines = section.split('\n')
    if (lines.some((l) => /^(new file|deleted file|old mode|new mode|rename |similarity |Binary files)/.test(l))) {
      return false
    }
    const changed = lines.filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l))
    return changed.length > 0 && changed.every((l) => VERSION_LINE_RE.test(l))
  })
}

/**
 * The state of a run's Windows job: `success`, `pending` (not finished, or
 * not created yet while the run is), or what it concluded otherwise. A finished
 * run with no such job reports `missing`.
 */
function windowsState(run, jobs) {
  const job = (jobs || []).find((j) => j.name === WINDOWS_JOB)
  if (!job) return run.status === 'completed' ? 'missing' : 'pending'
  if (job.status !== 'completed') return 'pending'
  return job.conclusion || 'unknown'
}

/**
 * What to do, given the equivalent earlier runs and their Windows state.
 *
 *   adopt — one of them is green; skip the suite
 *   wait  — none is green yet, but one is still going
 *   run   — nothing to adopt: none at all, or every one ended otherwise
 *
 * @param {{ url: string, windows: string }[]} candidates
 */
function decide(candidates) {
  const green = candidates.find((c) => c.windows === 'success')
  if (green) return { action: 'adopt', adopted: green.url, reason: `Windows green on ${green.url}` }
  if (candidates.some((c) => c.windows === 'pending')) {
    return { action: 'wait', reason: 'an equivalent run is still testing Windows' }
  }
  if (candidates.length === 0) return { action: 'run', reason: 'no earlier run tested an equivalent tree' }
  return {
    action: 'run',
    reason: `no equivalent run went green (${candidates.map((c) => c.windows).join(', ')})`,
  }
}

// --- io ---------------------------------------------------------------------

function api(path, token) {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  }).then((res) => {
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
    return res.json()
  })
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** The equivalent runs created before this one, each with its Windows state. */
async function candidates({ repo, runId, token, isEquivalent }) {
  const self = await api(`/repos/${repo}/actions/runs/${runId}`, token)
  const before = []
  for (const wf of WORKFLOWS) {
    const page = await api(`/repos/${repo}/actions/workflows/${wf}/runs?per_page=30`, token)
    for (const run of page.workflow_runs || []) {
      if (run.id !== self.id && run.created_at < self.created_at) before.push(run)
    }
  }
  const out = []
  for (const run of before) {
    if (!isEquivalent(run.head_sha)) continue
    const { jobs } = await api(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`, token)
    out.push({ url: run.html_url, windows: windowsState(run, jobs) })
  }
  return out
}

/** Equivalence per commit, cached. A commit the clone lacks is not equivalent. */
function equivalenceOf() {
  const seen = new Map()
  return (sha) => {
    if (!seen.has(sha)) {
      let ok = false
      try {
        git(['cat-file', '-e', `${sha}^{commit}`])
        ok = equivalent(git(['diff', '-U0', sha, 'HEAD']))
      } catch {
        ok = false
      }
      seen.set(sha, ok)
    }
    return seen.get(sha)
  }
}

function answer(run, adopted, why) {
  console.log(`windows-gate: ${run ? 'run the Windows suite' : 'skip it'} — ${why}`)
  const out = process.env.GITHUB_OUTPUT
  if (out) fs.appendFileSync(out, `run=${run}\nadopted=${adopted || ''}\n`)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) fs.appendFileSync(summary, `Windows gate: ${run ? 'ran the suite' : 'adopted'} — ${why}\n`)
}

async function main({ sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID
  if (!token || !repo || !runId) return answer(true, null, 'not in Actions with a token — cannot tell')

  const isEquivalent = equivalenceOf()
  const deadline = now() + DEADLINE_MS
  for (;;) {
    const found = await candidates({ repo, runId, token, isEquivalent })
    const d = decide(found)
    if (d.action === 'adopt') return answer(false, d.adopted, d.reason)
    if (d.action === 'run') return answer(true, null, d.reason)
    if (now() >= deadline) return answer(true, null, `${d.reason}, and the 30-minute wait ran out`)
    console.log(`windows-gate: ${d.reason} — checking again in ${POLL_MS / 1000}s`)
    await sleep(POLL_MS)
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (e) => {
      answer(true, null, `cannot tell (${e.message})`)
      process.exit(0)
    },
  )
}

module.exports = { equivalent, windowsState, decide }
