'use strict'

/**
 * Ideas — the inbox for work that is not a spec yet.
 *
 * `/spec-idea` captures a thought without grilling it, somewhere the team can
 * see. Where a ticketing provider can hold ideas, it does (an issue kept off
 * the board); everywhere else they live in one file on the base branch,
 * `specs/ideas.md`. This module is the pure half: the file's format, the id
 * an entry is addressed by, the add/drop planners, and the choice of store.
 * Every git call lives in the CLI.
 */

const IDEAS_FILE = 'specs/ideas.md'

const PREAMBLE = [
  '# Ideas',
  '',
  'Captured with `/spec-idea`, not specced yet. Promote one with',
  '`/spec idea:<id>`; discard one with `/spec-idea --drop <id>`.',
  '',
].join('\n')

// `## <id> · <YYYY-MM-DD> · <author>`
const HEADER = /^## ([a-z0-9][a-z0-9-]*) · (\d{4}-\d{2}-\d{2}) · (.+)$/

// The id is part of a commit subject (`docs(ideas): drop <id>`), and the
// subject line is held to 50 characters.
const MAX_ID = 30

/**
 * Parse `specs/ideas.md`. Everything before the first `## ` line is the
 * preamble and is kept verbatim. A `## ` line that is not an entry header is
 * reported in `malformed` rather than guessed at, because rewriting the file
 * around a hand edit we did not understand would lose it.
 */
function parseIdeas(text) {
  const lines = String(text || '').split('\n')
  const first = lines.findIndex((line) => line.startsWith('## '))
  const preamble = first === -1 ? lines.join('\n') : lines.slice(0, first).join('\n')
  const entries = []
  const malformed = []
  if (first === -1) return { preamble, entries, malformed }

  let current = null
  for (const line of lines.slice(first)) {
    if (line.startsWith('## ')) {
      const m = HEADER.exec(line)
      if (!m) {
        malformed.push(line)
        current = null
        continue
      }
      current = { id: m[1], date: m[2], author: m[3].trim(), lines: [] }
      entries.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return {
    preamble,
    entries: entries.map(({ lines: body, ...rest }) => ({ ...rest, ...splitText(body.join('\n')) })),
    malformed,
  }
}

/** First non-empty line is the title; whatever follows it is the body. */
function splitText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const at = lines.findIndex((line) => line.trim())
  if (at === -1) return { title: '', body: '' }
  return { title: lines[at].trim(), body: lines.slice(at + 1).join('\n').trim() }
}

function formatIdeas({ preamble, entries }) {
  const head = (preamble && preamble.trim() ? preamble : PREAMBLE).replace(/\s+$/, '')
  const blocks = entries.map((e) =>
    [`## ${e.id} · ${e.date} · ${e.author}`, e.title, ...(e.body ? [e.body] : [])].join('\n'),
  )
  return [head, ...blocks].join('\n\n') + '\n'
}

/** A short kebab id from the title, unique among `taken`. */
function ideaId(title, taken = []) {
  const words = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  let stem = ''
  for (const word of words) {
    const next = stem ? `${stem}-${word}` : word
    if (next.length > MAX_ID) break
    stem = next
  }
  if (!stem) stem = words.length ? words[0].slice(0, MAX_ID) : 'idea'
  const used = new Set(taken)
  if (!used.has(stem)) return stem
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${stem.slice(0, MAX_ID - suffix.length)}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}

function refuseMalformed(parsed) {
  if (!parsed.malformed.length) return null
  return (
    `${IDEAS_FILE} has ${parsed.malformed.length} heading(s) that are not idea entries ` +
    `(first: "${parsed.malformed[0]}") — fix them by hand; nothing was written`
  )
}

/**
 * Plan an add: `{ id, content, message }`, or `{ refused }`. `text` is what
 * was typed — the first line becomes the title.
 */
function planAdd(current, { text, author, date }) {
  const { title, body } = splitText(text)
  if (!title) return { refused: 'nothing to capture — give the idea some text' }
  const parsed = parseIdeas(current)
  const bad = refuseMalformed(parsed)
  if (bad) return { refused: bad }
  const id = ideaId(title, parsed.entries.map((e) => e.id))
  // A body line that opens with `## ` would read back as an entry header.
  const safe = body.replace(/^(#+ )/gm, '\\$1')
  const entry = { id, date, author: author || 'unknown', title, body: safe }
  return {
    id,
    entry,
    content: formatIdeas({ preamble: parsed.preamble, entries: [...parsed.entries, entry] }),
    message: `docs(ideas): add ${id}\n\n- Capture "${title}" in ${IDEAS_FILE}\n`,
  }
}

/** Plan a drop: `{ id, content, message }`, or `{ refused }`. */
function planDrop(current, { id, reason }) {
  const parsed = parseIdeas(current)
  const bad = refuseMalformed(parsed)
  if (bad) return { refused: bad }
  const entry = parsed.entries.find((e) => e.id === id)
  if (!entry) return { refused: `no idea "${id}" — \`skitterspec idea list\` shows them` }
  const why = reason && reason.trim() ? reason.trim() : 'no reason given'
  return {
    id,
    entry,
    content: formatIdeas({ preamble: parsed.preamble, entries: parsed.entries.filter((e) => e !== entry) }),
    message: `docs(ideas): drop ${id}\n\n- Discard "${entry.title}": ${why}\n`,
  }
}

// A provider that can hold ideas registers its store here; one that cannot
// registers `{ supports: false }`. Left unregistered, the answer is unknown.
let providerIdeaStore
function setProviderIdeaStore(store) {
  providerIdeaStore = store
}
function getProviderIdeaStore() {
  return providerIdeaStore
}

/**
 * Which store holds ideas: `file`, `provider`, or `unknown`.
 *
 * The file is chosen only on a POSITIVE answer — no provider configured, or a
 * provider that registered `supports: false`. A configured provider that said
 * nothing is unknown, and capture refuses instead of writing to the file:
 * filing there while the team reads the tracker would put one idea in each
 * store with nothing to say which is the real one.
 */
function selectStore({ providerConfigured, store }) {
  if (!providerConfigured) return 'file'
  if (store && store.supports === true) return 'provider'
  if (store && store.supports === false) return 'file'
  return 'unknown'
}

module.exports = {
  IDEAS_FILE,
  parseIdeas,
  formatIdeas,
  splitText,
  ideaId,
  planAdd,
  planDrop,
  selectStore,
  setProviderIdeaStore,
  getProviderIdeaStore,
}
