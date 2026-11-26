'use strict'

/**
 * Frontmatter on a CRLF checkout (bug-ticket-crlf-frontmatter).
 *
 * Git for Windows checks out CRLF under `core.autocrlf=true`. The fence regex
 * matched a bare `\n`, so a linked spec read as unlinked (`data: {}`), which a
 * push plans as creates, and a stamp prepended a second frontmatter block.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { parseFrontmatter } = require('../src/normalize.js')
const { splitFrontmatter, writeFrontmatter, deleteFrontmatter } = require('../src/write.js')
const { neutralConfig } = require('./_config.js')

const crlf = (s) => s.replace(/\n/g, '\r\n')
const RAW = '---\ngithub_identifier: "#7"\nowner: "a"\n---\n\n# Spec\n'

function specWith(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-crlf-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), text, 'utf-8')
  return dir
}

test('parseFrontmatter: a CRLF overview reads as linked, with no stray \\r', () => {
  const { data, body } = parseFrontmatter(crlf(RAW))
  assert.deepStrictEqual(data, { github_identifier: '#7', owner: 'a' })
  assert.match(body, /^\r?\n# Spec/)
})

test('splitFrontmatter: a CRLF block is found, and its lines carry no \\r', () => {
  const { fmLines, had } = splitFrontmatter(crlf(RAW))
  assert.strictEqual(had, true)
  assert.deepStrictEqual(fmLines, ['github_identifier: "#7"', 'owner: "a"'])
})

test('writeFrontmatter: stamping a CRLF overview patches its block, never adds a second', () => {
  const dir = specWith(crlf(RAW))
  try {
    writeFrontmatter(dir, neutralConfig(), { github_url: 'https://x/7' })
    const out = fs.readFileSync(path.join(dir, '00-overview.md'), 'utf-8')
    assert.strictEqual(out.match(/^---\r?$/gm).length, 2, 'one block')
    assert.deepStrictEqual(parseFrontmatter(out).data.github_url, 'https://x/7')
    assert.doesNotMatch(out, /[^\r]\n/, 'the file keeps its CRLF line endings')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('deleteFrontmatter: removing a key from a CRLF overview works', () => {
  const dir = specWith(crlf(RAW))
  try {
    assert.deepStrictEqual(deleteFrontmatter(dir, neutralConfig(), ['owner']), ['owner'])
    const out = fs.readFileSync(path.join(dir, '00-overview.md'), 'utf-8')
    assert.deepStrictEqual(parseFrontmatter(out).data, { github_identifier: '#7' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('stays silent: an LF overview is written back LF', () => {
  const dir = specWith(RAW)
  try {
    writeFrontmatter(dir, neutralConfig(), { github_url: 'https://x/7' })
    assert.doesNotMatch(fs.readFileSync(path.join(dir, '00-overview.md'), 'utf-8'), /\r/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
