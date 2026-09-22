'use strict'

/**
 * Markdown ⇄ ADF — the two halves of Jira Cloud's description dialect.
 *
 * Jira Cloud's REST v3 stores rich text as the Atlassian Document Format, a
 * JSON tree — there is no markdown field. The engine's projections are
 * markdown, so the adapter renders outbound text with `mdToAdf` and reduces
 * every read-back with `adfToText`; ADF never escapes the adapter
 * (`api.js` normalises at the boundary).
 *
 * FIDELITY IS WORD-LEVEL, BY DESIGN. Every comparison downstream — verify's
 * `compareStored`, the snapshot's `descriptionStream`, remote-edit detection —
 * reduces text through the dialect's `canonicalForCompare` and then strips to
 * word characters (sync-core `src/verify.js`). So the round-trip contract this
 * module owes is: `stream(adfToText(mdToAdf(md))) === stream(md)` — no word
 * gained, none lost, in order. Byte-level markdown fidelity is deliberately
 * NOT promised: Jira normalises its own tree on save anyway.
 *
 * The subset is what spec projections actually contain: headings, paragraphs,
 * bullet/ordered lists (nested), task checklists, inline strong/em/code/links,
 * fenced code, blockquotes, and top-level tables. Checklists render as ADF
 * task lists (`taskList`/`taskItem`) so they are live checkboxes in Jira; the
 * mirror is still read-only — a box ticked in Jira is overwritten on the next
 * push, exactly like every other mirrored field.
 *
 * Pure string/JSON transforms: no I/O, no clock, no randomness (task-item
 * localIds are sequential — Jira rewrites them on save and nothing here reads
 * them back).
 */

// --- inline: markdown text → ADF text nodes ---------------------------------

const text = (value, marks) => {
  const node = { type: 'text', text: value }
  if (marks && marks.length) node.marks = marks
  return node
}

// Earliest match wins among: `code`, **strong**, *em*, [text](url). A `*`
// needs a non-space neighbour to open (so `2 * 3` stays literal), mirroring
// the flanking rule the rest of the toolchain uses.
function inlineNodes(src, marks = []) {
  const out = []
  let rest = String(src == null ? '' : src)
  while (rest.length) {
    const candidates = [
      { at: rest.indexOf('`'), kind: 'code' },
      { at: rest.indexOf('**'), kind: 'strong' },
      { at: rest.search(/\*(?!\*)(?=\S)/), kind: 'em' },
      { at: rest.search(/\[[^\]]*\]\([^)]*\)/), kind: 'link' },
    ]
      .filter((c) => c.at >= 0)
      .sort((a, b) => a.at - b.at)
    if (!candidates.length) {
      out.push(text(rest, marks))
      break
    }
    const { at, kind } = candidates[0]
    if (at > 0) out.push(text(rest.slice(0, at), marks))
    rest = rest.slice(at)
    if (kind === 'code') {
      const close = rest.indexOf('`', 1)
      if (close < 0) {
        out.push(text(rest, marks))
        break
      }
      const body = rest.slice(1, close)
      if (body) out.push(text(body, [...marks, { type: 'code' }]))
      rest = rest.slice(close + 1)
    } else if (kind === 'strong') {
      const close = rest.indexOf('**', 2)
      if (close < 0) {
        out.push(text(rest, marks))
        break
      }
      out.push(...inlineNodes(rest.slice(2, close), [...marks, { type: 'strong' }]))
      rest = rest.slice(close + 2)
    } else if (kind === 'em') {
      const m = /^\*(?!\*)([^*]+)\*/.exec(rest)
      if (!m) {
        out.push(text(rest.slice(0, 1), marks))
        rest = rest.slice(1)
        continue
      }
      out.push(...inlineNodes(m[1], [...marks, { type: 'em' }]))
      rest = rest.slice(m[0].length)
    } else {
      const m = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest)
      out.push(...inlineNodes(m[1], [...marks, { type: 'link', attrs: { href: m[2] } }]))
      rest = rest.slice(m[0].length)
    }
  }
  return out.length ? out : [text('', marks)]
}

const paragraph = (md) => ({ type: 'paragraph', content: inlineNodes(md) })

// --- blocks: markdown lines → ADF nodes -------------------------------------

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(?:\[([ xX])\]\s+)?(.*)$/
const FENCE_RE = /^\s*```(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/

// One list ITEM's parsed shape, before nesting is resolved.
function parseListLines(lines) {
  const items = []
  for (const line of lines) {
    const m = LIST_RE.exec(line)
    if (m) {
      items.push({
        indent: m[1].length,
        ordered: /^\d+\.$/.test(m[2]),
        check: m[3] === undefined ? null : m[3] !== ' ',
        text: m[4],
      })
    } else if (items.length) {
      // Continuation line: part of the previous item's text (soft wrap).
      items[items.length - 1].text += ' ' + line.trim()
    }
  }
  return items
}

// Fold flat items into nested ADF lists by indent. Task items become an ADF
// taskList (live checkboxes); plain items a bulletList/orderedList.
function buildList(items, taskIds, options) {
  const root = { children: [] }
  const stack = [{ indent: -1, node: root }]
  for (const item of items) {
    while (stack.length > 1 && item.indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].node
    const entry = { ...item, children: [] }
    parent.children.push(entry)
    stack.push({ indent: item.indent, node: entry })
  }

  function render(children) {
    const groups = []
    for (const child of children) {
      const kind = child.check !== null ? 'task' : child.ordered ? 'ordered' : 'bullet'
      const last = groups[groups.length - 1]
      if (last && last.kind === kind) last.items.push(child)
      else groups.push({ kind, items: [child] })
    }
    return groups.map((group) => {
      if (group.kind === 'task' && options && options.taskLists === false) {
        // The fallback switch: should the live smoke find a surface where Jira
        // drops `taskList` nodes, checklists render as plain bullets carrying
        // their checkbox as text — words preserved, interactivity forfeited.
        return {
          type: 'bulletList',
          content: group.items.map((item) => ({
            type: 'listItem',
            content: [paragraph(`[${item.check ? 'x' : ' '}] ${item.text}`), ...render(item.children)],
          })),
        }
      }
      if (group.kind === 'task') {
        return {
          type: 'taskList',
          attrs: { localId: `tasks-${++taskIds.n}` },
          content: group.items.map((item) => ({
            type: 'taskItem',
            attrs: { localId: `task-${++taskIds.n}`, state: item.check ? 'DONE' : 'TODO' },
            content: inlineNodes(item.text),
            // ADF task items cannot nest lists; a nested child is rare enough in
            // a projection that flattening it to a following sibling is fine.
          })).concat(group.items.flatMap((item) => render(item.children)).flat()),
        }
      }
      const type = group.kind === 'ordered' ? 'orderedList' : 'bulletList'
      return {
        type,
        content: group.items.map((item) => ({
          type: 'listItem',
          content: [paragraph(item.text), ...render(item.children)],
        })),
      }
    })
  }
  return render(root.children)
}

function buildTable(rows) {
  const split = (line) => {
    const cells = []
    let cur = ''
    let code = false
    for (const ch of line.replace(/^\s*\|/, '').replace(/\|\s*$/, '')) {
      if (ch === '`') code = !code
      if (ch === '|' && !code) {
        cells.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    cells.push(cur.trim())
    return cells
  }
  const bodyRows = rows.filter((r) => !TABLE_SEP_RE.test(r))
  return {
    type: 'table',
    content: bodyRows.map((row, i) => ({
      type: 'tableRow',
      content: split(row).map((cell) => ({
        type: i === 0 ? 'tableHeader' : 'tableCell',
        content: [paragraph(cell)],
      })),
    })),
  }
}

/**
 * Markdown → an ADF document (`{ version: 1, type: 'doc', content: [...] }`).
 */
function mdToAdf(md, options) {
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n')
  const content = []
  const taskIds = { n: 0 }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = FENCE_RE.exec(line)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !FENCE_RE.test(lines[i])) body.push(lines[i++])
      if (i < lines.length) i++
      const node = { type: 'codeBlock', content: body.length ? [text(body.join('\n'))] : [] }
      if (fence[1].trim()) node.attrs = { language: fence[1].trim() }
      content.push(node)
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      content.push({ type: 'heading', attrs: { level: heading[1].length }, content: inlineNodes(heading[2]) })
      i++
      continue
    }
    if (/^\s*>/.test(line)) {
      const quoted = []
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*> ?/, ''))
      content.push({ type: 'blockquote', content: mdToAdf(quoted.join('\n')).content })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && TABLE_SEP_RE.test(lines[i + 1] || '')) {
      const rows = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      content.push(buildTable(rows))
      continue
    }
    if (LIST_RE.test(line)) {
      const block = []
      while (i < lines.length && lines[i].trim() && (LIST_RE.test(lines[i]) || /^\s{2,}/.test(lines[i]))) {
        block.push(lines[i++])
      }
      content.push(...buildList(parseListLines(block), taskIds, options))
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      content.push({ type: 'rule' })
      i++
      continue
    }
    // Paragraph: consecutive plain lines are one soft-wrapped paragraph.
    const para = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !LIST_RE.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*\|.*\|\s*$/.test(lines[i])
    ) {
      para.push(lines[i++].trim())
    }
    content.push(paragraph(para.join(' ')))
  }
  return { version: 1, type: 'doc', content }
}

// --- ADF → text --------------------------------------------------------------

function inlineText(nodes) {
  let out = ''
  for (const node of nodes || []) {
    if (node.type === 'text') {
      let t = node.text || ''
      for (const mark of node.marks || []) {
        if (mark.type === 'strong') t = `**${t}**`
        else if (mark.type === 'em') t = `*${t}*`
        else if (mark.type === 'code') t = `\`${t}\``
        else if (mark.type === 'link') t = `[${t}](${(mark.attrs && mark.attrs.href) || ''})`
      }
      out += t
    } else if (node.type === 'hardBreak') {
      out += '\n'
    } else if (node.type === 'mention') {
      out += (node.attrs && node.attrs.text) || ''
    } else if (node.type === 'emoji') {
      out += (node.attrs && node.attrs.text) || ''
    } else if (node.content) {
      out += inlineText(node.content)
    }
  }
  return out
}

function listToText(node, indent, ordered) {
  const lines = []
  let n = 0
  for (const item of node.content || []) {
    n++
    const marker = ordered ? `${n}.` : '-'
    const inner = []
    const nested = []
    for (const child of item.content || []) {
      if (child.type === 'paragraph') inner.push(inlineText(child.content))
      else nested.push(child)
    }
    lines.push(`${indent}${marker} ${inner.join(' ')}`)
    for (const child of nested) lines.push(blockToText(child, indent + '  '))
  }
  return lines.join('\n')
}

function blockToText(node, indent = '') {
  switch (node.type) {
    case 'heading':
      return `${indent}${'#'.repeat((node.attrs && node.attrs.level) || 1)} ${inlineText(node.content)}`
    case 'paragraph':
      return indent + inlineText(node.content)
    case 'bulletList':
      return listToText(node, indent, false)
    case 'orderedList':
      return listToText(node, indent, true)
    case 'taskList': {
      const lines = []
      for (const item of node.content || []) {
        if (item.type === 'taskItem') {
          const mark = item.attrs && item.attrs.state === 'DONE' ? 'x' : ' '
          lines.push(`${indent}- [${mark}] ${inlineText(item.content)}`)
        } else {
          lines.push(blockToText(item, indent + '  '))
        }
      }
      return lines.join('\n')
    }
    case 'codeBlock': {
      const lang = (node.attrs && node.attrs.language) || ''
      return `${indent}\`\`\`${lang}\n${inlineText(node.content)}\n${indent}\`\`\``
    }
    case 'blockquote':
      return (node.content || [])
        .map((child) => blockToText(child, indent))
        .join('\n\n')
        .split('\n')
        .map((l) => `${indent}> ${l}`)
        .join('\n')
    case 'table': {
      const rows = []
      for (const row of node.content || []) {
        const cells = (row.content || []).map((cell) => inlineText((cell.content || [])).replace(/\n/g, ' '))
        rows.push(`${indent}| ${cells.join(' | ')} |`)
        if (!rows.seenSep && row.content && row.content[0] && row.content[0].type === 'tableHeader') {
          rows.push(`${indent}|${' -- |'.repeat(row.content.length)}`)
          rows.seenSep = true
        }
      }
      return rows.join('\n')
    }
    case 'rule':
      return `${indent}---`
    case 'mediaGroup':
    case 'mediaSingle':
      return ''
    default:
      // Unknown block: render its children rather than dropping words —
      // losing content silently is the one failure verify exists to catch.
      return node.content ? node.content.map((child) => blockToText(child, indent)).join('\n\n') : ''
  }
}

/**
 * An ADF document (or fragment) → markdown-ish text. Accepts anything
 * plausible: a full doc, a content array, a string (returned as-is), or null.
 */
function adfToText(adf) {
  if (adf == null) return ''
  if (typeof adf === 'string') return adf
  const content = Array.isArray(adf) ? adf : adf.content || []
  return content
    .map((node) => blockToText(node))
    .filter((s) => s !== '')
    .join('\n\n')
}

module.exports = { mdToAdf, adfToText }
