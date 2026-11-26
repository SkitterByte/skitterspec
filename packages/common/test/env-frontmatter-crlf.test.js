'use strict'

/**
 * Frontmatter read off a CRLF file (bug-ticket-crlf-frontmatter).
 *
 * Git for Windows checks text out with CRLF line endings under
 * `core.autocrlf=true`, its installer's default, and so does the Windows CI
 * runner. Three readers matched the frontmatter fence with a bare `\n`, so on
 * those machines a stamped spec read as unlinked: `integrate` skipped its
 * `Refs:` check, a `{identifier}` branch pattern fell back to `{type}/{slug}`,
 * and `/spec-resume #N` could not find the spec. Found by release.yml's
 * Windows job on skitterspec@23.24.7.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { readTicket, readFrontmatterField, branchFor } = require('../src/env/resolve.js')
const { frontmatterField } = require('../src/env/resume.js')

const crlf = (s) => s.replace(/\n/g, '\r\n')
const OVERVIEW =
  '---\ngithub_identifier: "#7"\ngithub_url: "https://github.com/o/r/issues/7"\n---\n\n# X\n'

function specDir(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-crlf-'))
  fs.writeFileSync(path.join(dir, '00-overview.md'), text)
  return dir
}

test('readTicket: a CRLF overview yields its ticket, the same as LF', () => {
  const want = { id: '#7', url: 'https://github.com/o/r/issues/7' }
  assert.deepStrictEqual(readTicket(OVERVIEW), want)
  assert.deepStrictEqual(readTicket(crlf(OVERVIEW)), want)
})

test('readFrontmatterField: a CRLF overview yields the field, with no stray \\r', () => {
  const dir = specDir(crlf(OVERVIEW))
  try {
    assert.strictEqual(readFrontmatterField(dir, 'github_identifier'), '#7')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('branchFor: an {identifier} pattern expands off a CRLF overview', () => {
  const dir = specDir(crlf(OVERVIEW))
  try {
    const config = { branch: { pattern: '{type}/{identifier}-{slug}', identifierField: 'github_identifier' } }
    assert.strictEqual(branchFor({ type: 'feat', slug: 'x', path: dir }, config), 'feat/#7-x')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('resume frontmatterField: a CRLF copy off a branch yields the field', () => {
  assert.strictEqual(frontmatterField(crlf(OVERVIEW), 'github_identifier'), '#7')
})

test('stays silent: CRLF text with no frontmatter is still no ticket', () => {
  assert.strictEqual(readTicket(crlf('# X\n\n> **Type:** Bug\n')), null)
  assert.strictEqual(frontmatterField(crlf('# X\n'), 'github_identifier'), null)
})
