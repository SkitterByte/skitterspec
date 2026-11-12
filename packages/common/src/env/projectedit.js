'use strict'

/**
 * Setting `project.name` / `project.category` in `env.config.json` by EDITING
 * its text, never by regenerating it. PURE — text in, text out.
 *
 * WHY NOT `JSON.stringify(parsed, null, 2)`: a person wrote this file, and the
 * way they wrote it — an array on one line, a blank line between blocks — is
 * theirs. A regenerated file would turn a two-key change into a diff of the
 * whole thing, and the reviewer of that commit would have to read all of it to
 * find the two lines that mattered. So the value spans are found and replaced,
 * and everything else is left byte for byte.
 *
 * And it checks itself: the edited text must parse to exactly the object the
 * change describes. If it does not — a shape this scanner did not anticipate —
 * it throws rather than writing something it cannot vouch for.
 */

const KEYS = ['name', 'category']

// The end of the JSON value starting at `i` (exclusive), skipping strings so a
// brace inside one is not counted.
function valueEnd(text, i) {
  const open = text[i]
  if (open === '"') {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') j++
      else if (text[j] === '"') return j + 1
    }
    throw new Error('unterminated string')
  }
  if (open === '{' || open === '[') {
    let depth = 0
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (c === '"') j = valueEnd(text, j) - 1
      else if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') {
        depth--
        if (depth === 0) return j + 1
      }
    }
    throw new Error('unbalanced brackets')
  }
  const m = /^[^,}\]\s]+/.exec(text.slice(i))
  if (!m) throw new Error(`no value at ${i}`)
  return i + m[0].length
}

const skipSpace = (text, i) => {
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

/**
 * The members of the object whose `{` is at `open`, as
 * `[{ key, keyStart, valueStart, valueEnd }]`, and where it closes. Only this
 * object's own members — a `mode` inside `seedFiles` is not the top-level one.
 */
function members(text, open) {
  const out = []
  let i = skipSpace(text, open + 1)
  while (text[i] !== '}') {
    if (text[i] !== '"') throw new Error(`expected a key at ${i}`)
    const keyEnd = valueEnd(text, i)
    const key = JSON.parse(text.slice(i, keyEnd))
    let j = skipSpace(text, keyEnd)
    if (text[j] !== ':') throw new Error(`expected ':' at ${j}`)
    const valueStart = skipSpace(text, j + 1)
    const end = valueEnd(text, valueStart)
    out.push({ key, keyStart: i, valueStart, valueEnd: end })
    i = skipSpace(text, end)
    if (text[i] === ',') i = skipSpace(text, i + 1)
  }
  return { members: out, close: i }
}

/**
 * @param {string} text  the file as written
 * @param {{ name?: string, category?: string }} changes  a key left out is left
 *   alone; `''` clears it
 * @returns {string} the edited text
 * @throws when the file is not a JSON object, or the edit would not round-trip
 */
function setProjectKeys(text, changes) {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('env.config.json is not a JSON object')
  const wanted = KEYS.filter((k) => typeof changes[k] === 'string')
  if (!wanted.length) return text

  const indent = (/\n([ \t]+)"/.exec(text) || [null, '  '])[1]
  const root = text.indexOf('{')
  const top = members(text, root)
  const project = top.members.find((m) => m.key === 'project')
  const edits = [] // [start, end, replacement], applied from the back

  if (project && text[project.valueStart] === '{') {
    const inner = members(text, project.valueStart)
    const missing = []
    for (const k of wanted) {
      const m = inner.members.find((x) => x.key === k)
      if (m) edits.push([m.valueStart, m.valueEnd, JSON.stringify(changes[k])])
      else missing.push(k)
    }
    if (missing.length) {
      const deeper = indent + indent
      const lines = missing.map((k) => `${deeper}${JSON.stringify(k)}: ${JSON.stringify(changes[k])}`)
      // After the last member, or into an empty `{}`.
      const last = inner.members[inner.members.length - 1]
      const at = last ? last.valueEnd : project.valueStart + 1
      const lead = last ? ',\n' : '\n'
      const tail = last ? '' : `\n${indent}`
      edits.push([at, at, `${lead}${lines.join(',\n')}${tail}`])
    }
  } else if (project) {
    throw new Error('project in env.config.json is not an object — fix it by hand')
  } else {
    const block = [
      `${indent}"project": {`,
      KEYS.map((k) => `${indent}${indent}${JSON.stringify(k)}: ${JSON.stringify(typeof changes[k] === 'string' ? changes[k] : '')}`).join(',\n'),
      `${indent}}`,
    ].join('\n')
    // After `mode` where the file has one — where the shipped example puts it —
    // else first.
    const mode = top.members.find((m) => m.key === 'mode')
    if (mode) edits.push([mode.valueEnd, mode.valueEnd, `,\n${block}`])
    else edits.push([root + 1, root + 1, `\n${block}${top.members.length ? ',' : ''}`])
  }

  let out = text
  for (const [start, end, rep] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + rep + out.slice(end)

  const expect = JSON.parse(text)
  expect.project = { ...(expect.project || { name: '', category: '' }) }
  for (const k of wanted) expect.project[k] = changes[k]
  if (JSON.stringify(sortKeys(JSON.parse(out))) !== JSON.stringify(sortKeys(expect))) {
    throw new Error('the edit did not produce the expected config — nothing was written')
  }
  return out
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
  return v
}

module.exports = { setProjectKeys }
