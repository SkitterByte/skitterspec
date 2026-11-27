'use strict'

/**
 * `skitterspec report-issue` — send a bug or a feature request to the repo
 * skitterspec itself lives in, from a session in any project.
 *
 * Nothing is posted. The verb builds a prefilled issue-form URL and the
 * reporter presses Submit in their own browser, signed in as themselves — so
 * it needs no token, and nothing outward-facing happens without a person.
 * The target repo is public, so everything that lands in the URL passes
 * through `redact` first, and the preview prints exactly what the form gets.
 *
 * `planReport` is pure; the git reads, the duplicate search and the browser
 * are the side-effecting half below it.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn: spawnProcess } = require('node:child_process')

// A contract with .github/ISSUE_TEMPLATE/<kind>.yml: each form's field ids
// are these, and the URL fills them by id.
const KINDS = {
  bug: { template: 'bug.yml', labels: ['triage', 'bug'] },
  feature: { template: 'feature.yml', labels: ['triage', 'enhancement'] },
}
const FIELD_IDS = ['description', 'environment']

// GitHub's own new-issue page starts failing somewhere past 8k characters.
const URL_CAP = 8000
const TRIM_MARKER = '\n\n…(trimmed to fit the link; the full report was printed, paste it in here)'

const USAGE =
  'Usage: skitterspec report-issue --kind bug|feature --title <text> --body-file <path> [--skill <name>] [--open] [--json] [--dir <path>]\n'

// owner/repo from any spelling of a GitHub remote, or null for anything
// that is not plainly GitHub — the caller treats null as cannot-tell.
function parseGithubRepo(url) {
  if (typeof url !== 'string') return null
  const m = url
    .trim()
    .match(/^(?:git\+)?(?:https?:\/\/|ssh:\/\/git@|git:\/\/|git@)(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? { owner: m[1], repo: m[2] } : null
}

function sameRepo(a, b) {
  return Boolean(a && b) && a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Replace what identifies the reporter's project with placeholders.
 *
 * WHAT WOULD FOOL THIS: it knows only what it is handed — the remote, the
 * repo root, the home directory and the project's name. A client name inside
 * the reporter's own prose, or a path outside home, passes through. That is
 * why the preview prints the redacted text verbatim before anything opens:
 * the reporter is the last check, not this function.
 */
function redact(text, { home, root, names = [], remotes = [] } = {}) {
  let out = String(text)
  for (const remote of remotes.filter(Boolean)) out = out.split(remote).join('<project-remote>')
  // The root first: it usually sits under home, and home would eat its prefix.
  if (root) out = out.split(root).join('<project>')
  if (home) out = out.split(home).join('~')
  for (const name of names) {
    // A short name ("app", "ui") would blank ordinary words all over the report.
    if (!name || name.length < 3) continue
    // Whole words only, hyphens counted as part of a word: `spec` must not
    // turn `/spec-bug` into `/<project>-bug`.
    out = out.replace(new RegExp(`(?<![\\w-])${escapeRe(name)}(?![\\w-])`, 'gi'), '<project>')
  }
  return out
}

function environmentBlock({ pkg, provider, platform, release, nodeVersion, skill }) {
  return [
    `- skitterspec: ${pkg.name}@${pkg.version}`,
    `- provider: ${provider || 'none'}`,
    `- OS: ${platform}${release ? ` ${release}` : ''}`,
    `- Node: ${nodeVersion}`,
    `- skill: ${skill || 'not given'}`,
  ].join('\n')
}

function buildUrl(target, kind, title, fields) {
  const q = new URLSearchParams({ template: KINDS[kind].template, title })
  for (const id of FIELD_IDS) q.set(id, fields[id])
  return `https://github.com/${target.owner}/${target.repo}/issues/new?${q.toString()}`
}

function fullBodyOf(fields) {
  return `### Description\n\n${fields.description}\n\n### Environment\n\n${fields.environment}\n`
}

/**
 * Decide everything about a report without touching the world.
 * Returns { refused } or { redirect } or the report: target, title, fields,
 * url, truncated, fullBody.
 */
function planReport({ kind, title, body, skill, pkg, origin, home, root, provider, platform, release, nodeVersion }) {
  if (!KINDS[kind]) return { refused: `--kind must be bug or feature, not ${kind ? `"${kind}"` : 'nothing'}` }
  if (!title || !String(title).trim()) return { refused: '--title is required' }
  if (!body || !String(body).trim()) return { refused: '--body-file is empty or missing' }

  const repository = pkg && (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url)
  const target = parseGithubRepo(repository)
  // Cannot-tell refuses: guessing a repo would send someone's report to a
  // stranger's tracker.
  if (!target) return { refused: `cannot tell where to report: ${pkg ? pkg.name : 'the package'} has no GitHub repository.url` }

  const here = parseGithubRepo(origin)
  if (sameRepo(here, target)) {
    return {
      redirect: `this session is in ${target.owner}/${target.repo} itself — file it here with /spec, /spec-bug or /spec-idea instead`,
      target,
    }
  }

  const ctx = {
    home,
    root,
    names: [root ? path.basename(root) : null, here ? here.repo : null].filter(
      (n) => n && n.toLowerCase() !== target.repo.toLowerCase(),
    ),
    remotes: origin ? [origin.trim()] : [],
  }
  const cleanTitle = redact(String(title).trim(), ctx)
  const fields = {
    description: redact(String(body).trim(), ctx),
    environment: redact(environmentBlock({ pkg, provider, platform, release, nodeVersion, skill }), ctx),
  }
  const fullBody = fullBodyOf(fields)

  let url = buildUrl(target, kind, cleanTitle, fields)
  let truncated = false
  if (url.length > URL_CAP) {
    truncated = true
    // Encoding expands unevenly, so search for the longest prefix that fits.
    let lo = 0
    let hi = fields.description.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      const fits = buildUrl(target, kind, cleanTitle, { ...fields, description: fields.description.slice(0, mid) + TRIM_MARKER })
      if (fits.length <= URL_CAP) lo = mid
      else hi = mid - 1
    }
    url = buildUrl(target, kind, cleanTitle, { ...fields, description: fields.description.slice(0, lo) + TRIM_MARKER })
  }

  return { target, kind, labels: KINDS[kind].labels, title: cleanTitle, fields, url, truncated, fullBody }
}

const STOPWORDS = new Set('the and for with when not but are was this that from into does doesn its has have'.split(' '))

function searchTerms(title) {
  return [...new Set(String(title).toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || [])]
    .filter((w) => !STOPWORDS.has(w) && w !== '<project>')
    .slice(0, 6)
}

/**
 * Open issues that look like this one, from the anonymous search API.
 * Three answers: `found`, `none` (the search ran and matched nothing), and
 * `cannot-tell` — a rate limit, no network, a timeout. Cannot-tell never
 * reads as none, and never stops the report.
 */
async function searchDuplicates({ target, title, fetch = globalThis.fetch, timeoutMs = 5000 }) {
  const terms = searchTerms(title)
  if (!terms.length) return { state: 'cannot-tell', reason: 'no search terms in the title', items: [] }
  if (typeof fetch !== 'function') return { state: 'cannot-tell', reason: 'no fetch in this Node', items: [] }
  const q = `repo:${target.owner}/${target.repo} is:issue is:open in:title ${terms.join(' OR ')}`
  try {
    const res = await fetch(`https://api.github.com/search/issues?per_page=5&q=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'skitterspec-report-issue' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { state: 'cannot-tell', reason: `GitHub search answered ${res.status}`, items: [] }
    const data = await res.json()
    const items = (data.items || []).slice(0, 5).map((i) => ({ number: i.number, title: i.title, url: i.html_url }))
    return items.length ? { state: 'found', items } : { state: 'none', items }
  } catch (e) {
    return { state: 'cannot-tell', reason: e.name === 'TimeoutError' ? 'the search timed out' : e.message, items: [] }
  }
}

function openerFor(platform, url) {
  if (platform === 'darwin') return ['open', [url]]
  // `start` goes through cmd, which splits the URL at every `&`.
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]]
  return ['xdg-open', [url]]
}

// --- the side-effecting half ---------------------------------------------

function gitRead(cwd, argv) {
  try {
    return execFileSync('git', ['-C', cwd, ...argv], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
  } catch {
    return null
  }
}

function configuredProvider(root) {
  const { PROVIDERS } = require('./provider.js')
  const hit = PROVIDERS.find((p) => fs.existsSync(path.join(root, p.configFile)))
  return hit ? hit.name : null
}

function parseArgs(argv) {
  const flags = { kind: null, title: null, bodyFile: null, skill: null, open: false, json: false, dir: null }
  const take = { '--kind': 'kind', '--title': 'title', '--body-file': 'bodyFile', '--skill': 'skill', '--dir': 'dir' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (take[a]) flags[take[a]] = argv[++i]
    else if (a === '--open') flags.open = true
    else if (a === '--json') flags.json = true
    else return { error: `unknown argument: ${a}` }
  }
  return { flags }
}

function renderText(plan, dupes, opened) {
  const lines = [
    `report-issue: ${plan.kind} for ${plan.target.owner}/${plan.target.repo} (${opened ? 'opened in the browser' : 'preview — nothing opened'})`,
    '',
    `title: ${plan.title}`,
    `labels: ${plan.labels.join(', ')} (applied by the form)`,
    '',
    '--- description ---',
    plan.fields.description,
    '--- environment ---',
    plan.fields.environment,
    '',
  ]
  if (dupes.state === 'found') {
    lines.push('possible duplicates (open):')
    for (const d of dupes.items) lines.push(`  #${d.number} ${d.title}  ${d.url}`)
  } else if (dupes.state === 'none') lines.push('duplicates: none open')
  else lines.push(`duplicates: cannot tell — ${dupes.reason}`)
  lines.push('', `url: ${plan.url}`)
  if (plan.truncated) lines.push('', 'the description was trimmed to fit the link; paste this full body into the form:', '', plan.fullBody)
  if (opened) lines.push('', 'if no browser opened, open the url above; nothing is filed until you press Submit')
  else lines.push('', 're-run with --open to open the form; nothing is filed until you press Submit')
  return lines.join('\n') + '\n'
}

async function reportIssueCommand(argv, deps = {}) {
  const { fetch = globalThis.fetch, spawn = spawnProcess, stdout = process.stdout, stderr = process.stderr } = deps
  const parsed = parseArgs(argv)
  if (parsed.error) {
    stderr.write(`skitterspec report-issue: ${parsed.error}\n${USAGE}`)
    return 2
  }
  const { flags } = parsed
  const cwd = path.resolve(flags.dir || process.cwd())

  let body = null
  if (flags.bodyFile) {
    try {
      body = fs.readFileSync(path.resolve(cwd, flags.bodyFile), 'utf8')
    } catch (e) {
      stderr.write(`skitterspec report-issue: cannot read --body-file: ${e.message}\n`)
      return 1
    }
  }

  const root = gitRead(cwd, ['rev-parse', '--show-toplevel']) || cwd
  const plan = planReport({
    kind: flags.kind,
    title: flags.title,
    body,
    skill: flags.skill,
    pkg: deps.pkg || require('../package.json'),
    origin: gitRead(cwd, ['remote', 'get-url', 'origin']),
    home: os.homedir(),
    root,
    provider: configuredProvider(root),
    platform: process.platform,
    release: os.release(),
    nodeVersion: process.version,
  })

  if (plan.refused || plan.redirect) {
    if (flags.json) stdout.write(JSON.stringify(plan, null, 2) + '\n')
    else stdout.write(`skitterspec report-issue: ${plan.refused || plan.redirect}\n${plan.refused ? USAGE : ''}`)
    return plan.refused ? 1 : 0
  }

  const dupes = await searchDuplicates({ target: plan.target, title: plan.title, fetch })

  let opened = false
  if (flags.open) {
    const [cmd, args] = openerFor(process.platform, plan.url)
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      child.on('error', () => {})
      child.unref()
      opened = true
    } catch {
      opened = false
    }
  }

  if (flags.json) stdout.write(JSON.stringify({ ...plan, duplicates: dupes, opened }, null, 2) + '\n')
  else stdout.write(renderText(plan, dupes, opened))
  return 0
}

module.exports = {
  KINDS,
  FIELD_IDS,
  URL_CAP,
  parseGithubRepo,
  redact,
  planReport,
  searchDuplicates,
  searchTerms,
  openerFor,
  reportIssueCommand,
}
