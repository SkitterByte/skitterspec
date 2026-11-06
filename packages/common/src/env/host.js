'use strict'

/**
 * Host adapter — the one place skitterspec talks to a PR host.
 *
 * PR mode (`land.strategy: "pr"`) needs two things git alone cannot answer once
 * a host merges by squash or rebase: *is the PR for this branch merged?* (the
 * ancestry test goes false forever under a rewritten merge) and *what command
 * opens / readies / abandons a PR here?* Both are answered from the remote URL
 * — `dev.azure.com` / `visualstudio.com` → the `az` CLI, `github.com` → `gh` —
 * and never from extra config: the URL is the one place the host is already
 * written down.
 *
 * Everything here is pure except `prFor`, which takes an injected `exec` so the
 * CLI supplies a real subprocess and tests supply a fake. Every failure shape —
 * unknown host, missing CLI, non-zero exit, no network, unparseable output —
 * returns `state: "cannot-tell"` and says nothing: an absence is not evidence,
 * and the callers route cannot-tell to inaction
 * (`.claude/rules/negative-checks.md` rule 4).
 */

/**
 * Parse a git remote URL into { host, org, project, repo, orgUrl }.
 *
 * host: 'github' | 'azure' | null (null = no adapter; callers degrade to
 * ancestry + cannot-tell). `project` is Azure-only. `orgUrl` is the
 * `--organization` value the az CLI wants, composed as dev.azure.com even for
 * a legacy visualstudio.com remote — Azure serves both.
 *
 * WHAT WOULD FOOL THIS: a GitHub Enterprise or Azure DevOps Server install on
 * its own domain parses to host null. That is the degrade-to-ancestry path by
 * design — guessing a host from an unrecognised domain risks running the wrong
 * CLI against someone's internal URL.
 */
function parseRemote(url) {
  const none = { host: null, org: null, project: null, repo: null, orgUrl: null }
  if (typeof url !== 'string' || !url.trim()) return none
  const u = url.trim()

  // github: https://github.com/owner/repo(.git) · git@github.com:owner/repo(.git)
  // · ssh://git@github.com/owner/repo(.git)
  let m = u.match(/^(?:https:\/\/|ssh:\/\/git@|git@)github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (m) return { host: 'github', org: m[1], project: null, repo: m[2], orgUrl: null }

  // azure, modern: https://[org@]dev.azure.com/org/project/_git/repo
  m = u.match(/^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)\/?$/)
  if (m) {
    return azure(m[1], m[2], m[3])
  }
  // azure, ssh: git@ssh.dev.azure.com:v3/org/project/repo
  m = u.match(/^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)\/?$/)
  if (m) return azure(m[1], m[2], m[3])
  // azure, legacy: https://org.visualstudio.com/[DefaultCollection/]project/_git/repo
  m = u.match(/^https:\/\/([^.@/]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)\/?$/)
  if (m) return azure(m[1], m[2], m[3])

  return none
}

function azure(org, project, repo) {
  return {
    host: 'azure',
    org: decode(org),
    project: decode(project),
    repo: decode(repo),
    orgUrl: `https://dev.azure.com/${org}`,
  }
}

// Azure project/repo names may carry spaces, which arrive %20-encoded in the
// remote URL and must be literal in the az flags.
function decode(part) {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

// Shell-quote one az/gh flag value. Values come from a remote URL, so spaces
// (Azure project names) are the realistic case; a quote inside one is not a
// name Azure or GitHub accepts, but escape it anyway rather than truncate.
function q(value) {
  return /[^A-Za-z0-9_\-./]/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : value
}

/**
 * Ask the host for the PR whose source is `branch`.
 *
 * `exec(file, args, opts)` must return `{ ok, stdout, stderr }` and never
 * throw. Returns `{ state, id, url }` with state one of:
 *   merged · open · draft · none · cannot-tell
 *
 * "none" is a POSITIVE answer — the host replied and no (live) PR exists —
 * where "cannot-tell" is the lookup itself failing. The two route differently
 * (none can offer a create command; cannot-tell must not conclude anything),
 * so a failure is never softened into none.
 */
function prFor(remoteInfo, branch, exec, cwd) {
  const cannot = { state: 'cannot-tell', id: null, url: null }
  if (!remoteInfo || !remoteInfo.host) return cannot

  if (remoteInfo.host === 'github') {
    // Run in the repo (gh resolves owner/repo from the git remotes there).
    const r = exec('gh', ['pr', 'view', branch, '--json', 'state,isDraft,number,url'], { cwd })
    if (!r.ok) {
      // gh exits 1 both for "no PR" and for real failures; only the former is
      // an answer.
      return /no pull requests? found/i.test(r.stderr || '') ? { state: 'none', id: null, url: null } : cannot
    }
    return githubPrState(r.stdout)
  }

  // azure
  const r = exec(
    'az',
    [
      'repos', 'pr', 'list',
      '--organization', remoteInfo.orgUrl,
      '--project', remoteInfo.project,
      '--repository', remoteInfo.repo,
      '--source-branch', branch,
      '--status', 'all',
      '--output', 'json',
    ],
    { cwd },
  )
  if (!r.ok) return cannot
  return azurePrState(r.stdout)
}

// Map `gh pr view --json state,isDraft,number,url` output. Unparseable JSON is
// a cannot-tell, never a guess.
function githubPrState(stdout) {
  let pr
  try {
    pr = JSON.parse(stdout)
  } catch {
    return { state: 'cannot-tell', id: null, url: null }
  }
  const id = pr.number != null ? String(pr.number) : null
  const url = pr.url || null
  if (pr.state === 'MERGED') return { state: 'merged', id, url }
  if (pr.state === 'OPEN') return { state: pr.isDraft ? 'draft' : 'open', id, url }
  if (pr.state === 'CLOSED') return { state: 'none', id, url }
  return { state: 'cannot-tell', id, url }
}

// Map `az repos pr list --status all` output: the newest PR for the branch is
// the one whose state matters (an abandoned early attempt must not shadow the
// live PR). An empty list is a positive "none".
function azurePrState(stdout) {
  let list
  try {
    list = JSON.parse(stdout)
  } catch {
    return { state: 'cannot-tell', id: null, url: null }
  }
  if (!Array.isArray(list)) return { state: 'cannot-tell', id: null, url: null }
  if (list.length === 0) return { state: 'none', id: null, url: null }
  const pr = list.reduce((a, b) => ((a.pullRequestId || 0) >= (b.pullRequestId || 0) ? a : b))
  const id = pr.pullRequestId != null ? String(pr.pullRequestId) : null
  const url = null // az's list payload carries no stable web URL; callers compose nothing
  if (pr.status === 'completed') return { state: 'merged', id, url }
  if (pr.status === 'active') return { state: pr.isDraft ? 'draft' : 'open', id, url }
  if (pr.status === 'abandoned') return { state: 'none', id, url }
  return { state: 'cannot-tell', id, url }
}

/**
 * The command that opens a PR for `branch` → `base`. Null for an unknown host —
 * the caller keeps its placeholder comment rather than inventing a CLI.
 */
function prCreateCommand(remoteInfo, { branch, base, draft }) {
  if (!remoteInfo || !remoteInfo.host) return null
  if (remoteInfo.host === 'github') {
    return `gh pr create --head ${branch} --base ${base} --fill${draft ? ' --draft' : ''}`
  }
  return (
    `az repos pr create --organization ${remoteInfo.orgUrl} --project ${q(remoteInfo.project)} ` +
    `--repository ${q(remoteInfo.repo)} --source-branch ${branch} --target-branch ${base}` +
    (draft ? ' --draft true' : '')
  )
}

// Flip a draft PR to ready. Azure addresses a PR by id, so without one there is
// no command to print — null, and the caller says nothing.
function prReadyCommand(remoteInfo, { branch, id }) {
  if (!remoteInfo || !remoteInfo.host) return null
  if (remoteInfo.host === 'github') return `gh pr ready ${branch}`
  if (!id) return null
  return `az repos pr update --organization ${remoteInfo.orgUrl} --id ${id} --draft false`
}

// Close/abandon the PR without merging (the /spec-cancel path).
function prAbandonCommand(remoteInfo, { branch, id }) {
  if (!remoteInfo || !remoteInfo.host) return null
  if (remoteInfo.host === 'github') return `gh pr close ${branch}`
  if (!id) return null
  return `az repos pr update --organization ${remoteInfo.orgUrl} --id ${id} --status abandoned`
}

/**
 * The base a PR-mode view measures from: the REMOTE image of base when its
 * remote-tracking ref exists in this clone, else the local name unchanged.
 * Trunk configs pass through untouched, and nothing here fetches — a render
 * must stay offline-safe, so a missing ref is the local fallback, never an
 * error. `trimmed(argv)` is the caller's git reader (string | null).
 *
 * One helper because two copies of this selection (the server's render and the
 * CLI's) must not disagree about which range one spec's page shows.
 */
function preferRemoteBase(config, name, trimmed) {
  if (!name) return name
  if (!config || !config.land || config.land.strategy !== 'pr') return name
  const remoteRef = `${config.land.remote || 'origin'}/${name}`
  if (trimmed(['rev-parse', '--verify', '--quiet', `refs/remotes/${remoteRef}`])) {
    return remoteRef
  }
  return name
}

module.exports = {
  parseRemote,
  preferRemoteBase,
  prFor,
  githubPrState,
  azurePrState,
  prCreateCommand,
  prReadyCommand,
  prAbandonCommand,
}
