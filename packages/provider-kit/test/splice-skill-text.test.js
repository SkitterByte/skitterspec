'use strict'

// Every provider's /spec-push applies over MCP by hand when there is no token.
// Under `mapping.description: "summary"` that path must write the ENGINE's
// splice, never the plan's block over the whole body — which would delete the
// team's text around it with nothing looking wrong. Prose is the only thing
// carrying that rule into the MCP path, so its presence is pinned here.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..', '..')
const PROVIDERS = ['github', 'linear', 'jira', 'azure-boards']

for (const p of PROVIDERS) {
  test(`${p}'s /spec-push MCP path splices through the engine in summary mode`, () => {
    const text = fs.readFileSync(path.join(root, p, 'assets', 'skills', 'spec-push', 'SKILL.md'), 'utf-8')
    const mcp = text.slice(text.indexOf('## 4a.'))
    assert.ok(mcp.length < text.length, 'the MCP section exists')
    assert.match(mcp, /descriptionMode/)
    assert.match(mcp, /skitterspec spec-sync splice <spec> --live <file>/)
    assert.match(mcp, /Write \*\*exactly what it prints\*\*/)
  })
}
