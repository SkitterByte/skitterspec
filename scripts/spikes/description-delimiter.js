#!/usr/bin/env node
'use strict'

// SPIKE — feat-tracker-held-specs phase 2. Not shipped, not tested, not wired
// into anything. It answers one question per provider: can a delimited block
// in a ticket description be found and replaced after someone edits the text
// around it in the tracker's UI, with that text left intact?
//
//   node scripts/spikes/description-delimiter.js create <github|linear>
//   node scripts/spikes/description-delimiter.js check  <github|linear>
//   node scripts/spikes/description-delimiter.js splice <github|linear>
//   node scripts/spikes/description-delimiter.js clean  <github|linear>
//
// State (issue ids only, never a token) lives in a JSON file beside the
// session's scratch dir, given by SPIKE_STATE. Tokens are resolved the way the
// providers resolve them and are never printed.

const fs = require('node:fs')
const path = require('node:path')

const STATE = process.env.SPIKE_STATE || path.join(process.cwd(), '.spike-delimiter.json')
const OWNER = 'SkitterByte'
const REPO = 'skitterspec'

// Two candidates. `comment` is invisible where the tracker keeps HTML comments;
// `heading` is the fallback for trackers that drop them, ending on a rule.
const CANDIDATES = {
  comment: {
    begin: '<!-- skitterspec:begin -->',
    end: '<!-- skitterspec:end -->',
  },
  heading: {
    begin: '## Skitterspec summary',
    end: '_— end of skitterspec summary —_',
  },
}

const ABOVE = 'TEAM TEXT ABOVE: context the PM wrote before the block.'
const BELOW = 'TEAM TEXT BELOW: a customer quote and a [design link](https://example.invalid/design).'

function block(version) {
  return [
    `Sort the task inbox by when an item entered its state (v${version}).`,
    '',
    '**Acceptance criteria**',
    '- [ ] Both dates show on every row',
    '- [x] Sort order survives a reload',
    '',
    '**Touches** GET /tasks · tasks.state_entered_at · TaskInbox',
    `**Progress** ${version === 1 ? '25%' : '62%'} · phase ${version === 1 ? 1 : 3} of 4`,
  ].join('\n')
}

function body(candidate, version) {
  const c = CANDIDATES[candidate]
  return [ABOVE, '', c.begin, block(version), c.end, '', BELOW].join('\n')
}

// Find the block by its delimiters. Returns null when either is missing.
function locate(text, candidate) {
  const c = CANDIDATES[candidate]
  const b = text.indexOf(c.begin)
  const e = b === -1 ? -1 : text.indexOf(c.end, b + c.begin.length)
  if (b === -1 || e === -1) return null
  return { start: b, end: e + c.end.length, inner: text.slice(b + c.begin.length, e).trim() }
}

function splice(text, candidate, inner) {
  const c = CANDIDATES[candidate]
  const at = locate(text, candidate)
  const fresh = `${c.begin}\n${inner}\n${c.end}`
  return at ? text.slice(0, at.start) + fresh + text.slice(at.end) : `${fresh}\n\n${text}`
}

// ---- providers -------------------------------------------------------------

function githubToken() {
  const { resolveCredential } = require('../../packages/github/src/credentials.js')
  const got = resolveCredential({ github: { owner: OWNER } })
  if (!got.ok) throw new Error(got.error)
  return got.token
}

async function gh(method, url, payload) {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${json.message || ''}`)
  return json
}

async function linear(query, variables) {
  const key = (process.env.LINEAR_API_KEY || '').trim()
  if (!key) throw new Error('no LINEAR_API_KEY')
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Linear: ${json.errors.map((e) => e.message).join('; ')}`)
  return json.data
}

const PROVIDERS = {
  github: {
    async create(title, description) {
      const it = await gh('POST', `/repos/${OWNER}/${REPO}/issues`, { title, body: description })
      return { id: String(it.number), url: it.html_url }
    },
    async read(id) {
      return (await gh('GET', `/repos/${OWNER}/${REPO}/issues/${id}`)).body || ''
    },
    async write(id, description) {
      await gh('PATCH', `/repos/${OWNER}/${REPO}/issues/${id}`, { body: description })
    },
    async clean(id) {
      await gh('PATCH', `/repos/${OWNER}/${REPO}/issues/${id}`, { state: 'closed', state_reason: 'not_planned' })
    },
  },
  linear: {
    async create(title, description) {
      const { teams } = await linear('{ teams { nodes { id } } }')
      const teamId = teams.nodes[0].id
      const d = await linear(
        'mutation($i: IssueCreateInput!) { issueCreate(input: $i) { issue { id identifier url } } }',
        { i: { teamId, title, description } },
      )
      const it = d.issueCreate.issue
      return { id: it.id, url: it.url, label: it.identifier }
    },
    async read(id) {
      return (await linear('query($id: String!) { issue(id: $id) { description } }', { id })).issue.description || ''
    },
    async write(id, description) {
      await linear('mutation($id: String!, $d: String!) { issueUpdate(id: $id, input: { description: $d }) { success } }', {
        id,
        d: description,
      })
    },
    async clean(id) {
      await linear('mutation($id: String!) { issueDelete(id: $id) { success } }', { id })
    },
  },
}

// ---- commands --------------------------------------------------------------

const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {})
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2))

function report(candidate, text) {
  const at = locate(text, candidate)
  return {
    found: !!at,
    above: text.includes(ABOVE),
    below: text.includes(BELOW),
    beginKept: text.includes(CANDIDATES[candidate].begin),
    endKept: text.includes(CANDIDATES[candidate].end),
    inner: at ? at.inner : null,
  }
}

async function main() {
  const [cmd, provider] = process.argv.slice(2)
  const p = PROVIDERS[provider]
  if (!p || !['create', 'check', 'splice', 'clean'].includes(cmd)) {
    console.error('usage: description-delimiter.js <create|check|splice|clean> <github|linear>')
    process.exit(2)
  }
  const state = load()
  state[provider] = state[provider] || {}

  for (const candidate of Object.keys(CANDIDATES)) {
    const rec = state[provider][candidate]
    if (cmd === 'create') {
      const made = await p.create(`[skitterspec spike] delimiter: ${candidate} — delete me`, body(candidate, 1))
      state[provider][candidate] = made
      const back = await p.read(made.id)
      console.log(JSON.stringify({ provider, candidate, url: made.url, sent: body(candidate, 1) === back, ...report(candidate, back) }))
      if (body(candidate, 1) !== back) console.log(`--- stored (${candidate}) ---\n${back}\n---`)
    } else if (!rec) {
      console.log(JSON.stringify({ provider, candidate, error: 'not created' }))
    } else if (cmd === 'check') {
      const back = await p.read(rec.id)
      console.log(JSON.stringify({ provider, candidate, url: rec.url, ...report(candidate, back) }))
      console.log(`--- stored (${candidate}) ---\n${back}\n---`)
    } else if (cmd === 'splice') {
      const before = await p.read(rec.id)
      await p.write(rec.id, splice(before, candidate, block(2)))
      const after = await p.read(rec.id)
      const r = report(candidate, after)
      // The outside text after the splice must equal the outside text before it.
      const outside = (t) => {
        const at = locate(t, candidate)
        return at ? t.slice(0, at.start) + t.slice(at.end) : null
      }
      console.log(
        JSON.stringify({ provider, candidate, ...r, v2: !!(r.inner && r.inner.includes('(v2)')), outsideIntact: outside(before) === outside(after) }),
      )
    } else if (cmd === 'clean') {
      await p.clean(rec.id)
      console.log(JSON.stringify({ provider, candidate, cleaned: rec.url }))
    }
  }
  save(state)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
