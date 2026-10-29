#!/usr/bin/env node
'use strict'

/**
 * Set this repo's board "Deployed" field on every issue a release contains.
 *
 *   node scripts/mirror-deployed.cjs <tag> <value>     e.g. skitterspec@19.0.0 Staged
 *   node scripts/mirror-deployed.cjs --reconcile       Published, for every package's
 *                                                      newest tag that is live on npm
 *
 * This is CONSUMER code, deliberately. Skitterspec answers one release question
 * — which tickets a range contains (`spec-sync released --json`) — and writing
 * deploy state anywhere is the host project's business. This script is what
 * that looks like for this repo, and it uses nothing of the provider's but the
 * one verb a consumer would.
 *
 * Never fatal to a release: `release.yml` and `approve-release.cjs` both run it
 * after the thing that matters has already happened, and the reconcile mode
 * repairs whatever a failed run missed within the hour.
 */

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const GITHUB_BIN = path.join(ROOT, 'packages', 'github', 'bin', 'skitterspec-github.js')
const CONFIG = path.join(ROOT, 'specs', '.core', 'github.config.json')
const FIELD = 'Deployed'
const PUBLISHED = 'Published'

// --- pure helpers -----------------------------------------------------------

// `skitterspec-github@2.0.0` → `skitterspec-github@`. Everything up to and
// including the LAST `@`, so a scoped spelling would still keep its series.
function prefixOf(tag) {
  const at = String(tag).lastIndexOf('@')
  return at > 0 ? tag.slice(0, at + 1) : null
}

// The range a release spans: the previous tag in the same series to this one,
// or the whole history to this tag for a series' first release.
function rangeFor(tag, previous) {
  return previous ? `${previous}..${tag}` : tag
}

// `#12` → 12. Anything else is not an issue on this repo, and is skipped.
function issueNumber(ref) {
  const m = /^#(\d+)$/.exec(String(ref))
  return m ? Number(m[1]) : null
}

// --- side effects -----------------------------------------------------------

function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function previousTag(tag) {
  const prefix = prefixOf(tag)
  return prefix ? git(['describe', '--tags', '--abbrev=0', '--match', `${prefix}*`, `${tag}^`]) : null
}

function newestTag(prefix) {
  const out = git(['tag', '--list', `${prefix}*`, '--sort=-v:refname'])
  return out ? out.split('\n')[0] : null
}

function released(range) {
  const out = execFileSync('node', [GITHUB_BIN, 'spec-sync', 'released', range, '--json'], { cwd: ROOT, encoding: 'utf8' })
  return JSON.parse(out).tickets || []
}

// WHAT WOULD FOOL THIS: npm's registry is eventually consistent, so a version
// missing right after an approve is UNKNOWN, not unpublished. It is only ever
// read as "not yet" — the next hourly run asks again — and never as a reason
// to write anything.
function liveOnNpm(npmName, version) {
  try {
    return execFileSync('npm', ['view', `${npmName}@${version}`, 'version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === version
  } catch {
    return false
  }
}

function makeGraphql(token) {
  return async (query, variables) => {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json()
    if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json).slice(0, 300))
    return json.data
  }
}

const BOARD = `
query($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on User { projectV2(number: $number) { ...B } }
    ... on Organization { projectV2(number: $number) { ...B } }
  }
}
fragment B on ProjectV2 { id field(name: "${FIELD}") { ... on ProjectV2SingleSelectField { id options { id name } } } }`

const ITEM = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      projectItems(first: 20) {
        nodes { id project { id } fieldValueByName(name: "${FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name } } }
      }
    }
  }
}`

const SET = `
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
}`

async function mirror(tag, value, { graphql, github, log }) {
  const range = rangeFor(tag, previousTag(tag))
  const data = await graphql(BOARD, { owner: github.owner, number: github.project })
  const board = data.repositoryOwner && data.repositoryOwner.projectV2
  const field = board && board.field
  const option = field && field.options.find((o) => o.name.toLowerCase() === value.toLowerCase())
  if (!option) throw new Error(`board ${github.project} has no "${FIELD}" option "${value}"`)

  let set = 0
  for (const t of released(range)) {
    const number = issueNumber(t.ref)
    if (!number) continue
    const got = await graphql(ITEM, { owner: github.owner, repo: github.repo, number })
    const items = (got.repository && got.repository.issue && got.repository.issue.projectItems.nodes) || []
    const item = items.find((i) => i.project && i.project.id === board.id)
    // Not on the board: nothing to mark, and adding it is the push's job.
    if (!item) continue
    if (item.fieldValueByName && item.fieldValueByName.name === option.name) continue
    await graphql(SET, { project: board.id, item: item.id, field: field.id, option: option.id })
    set++
  }
  log(`mirror-deployed: ${tag} (${range}) — ${set} issue(s) set to ${option.name}`)
}

// The same token `spec-sync` uses: GITHUB_TOKEN / GH_TOKEN in CI, else the one
// `spec-sync credentials set` stored, which is what `npm run approve` has on a
// laptop. An unreadable store is a skip, never a failed release.
function tokenFor(config) {
  try {
    const { resolveCredential } = require(path.join(ROOT, 'packages', 'github', 'src', 'credentials.js'))
    const got = resolveCredential(config, process.env)
    return got.ok ? got.token : null
  } catch {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null
  }
}

async function main(argv) {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  const token = tokenFor(config)
  if (!token) {
    console.log('mirror-deployed: no GitHub token — skipped')
    return 0
  }
  const { github } = config
  const io = { graphql: makeGraphql(token), github, log: console.log }

  if (argv[0] === '--reconcile') {
    const { PACKAGES } = require('./release.js')
    for (const [short, { npm }] of Object.entries(PACKAGES)) {
      const tag = newestTag(`${short}@`)
      if (!tag || !liveOnNpm(npm, tag.slice(prefixOf(tag).length))) continue
      await mirror(tag, PUBLISHED, io)
    }
    return 0
  }

  const [tag, value] = argv
  if (!tag || !value || !prefixOf(tag)) {
    console.error('usage: mirror-deployed.cjs <package@version> <value> | --reconcile')
    return 1
  }
  await mirror(tag, value, io)
  return 0
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`mirror-deployed: ${e.message}`)
      process.exit(1)
    },
  )
}

module.exports = { prefixOf, rangeFor, issueNumber, mirror }
