'use strict'

/**
 * `/spec-epic` and the `/spec-start` epic hand-off (spec feat-epic-next, phase 4):
 * the epic's tab says what to start where, and keeps the epic page one command
 * away for a reader who had to close the browser to switch tabs.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const COMMAND = fs.readFileSync(path.join(ASSETS, 'commands', 'spec-epic.md'), 'utf8')
const START = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-start', 'SKILL.md'), 'utf8')
const PLANNING = fs.readFileSync(path.join(ASSETS, 'rules', 'spec-planning.md'), 'utf8')

test('/spec-epic pre-executes epic status and relays it, like the other commands', () => {
  assert.match(COMMAND, /^!`\{\{exec\}\} skitterspec epic status \$ARGUMENTS`$/m)
  assert.match(COMMAND, /^allowed-tools: Bash\(\{\{exec\}\} skitterspec epic status:\*\)$/m)
  assert.match(COMMAND, /Relay the engine output above verbatim\. Add nothing and run nothing else\./)
})

test('/spec-epic is user-only, and reads rather than acts', () => {
  assert.match(COMMAND, /^disable-model-invocation: true$/m)
  assert.match(COMMAND, /It reads, and nothing more/)
  assert.doesNotMatch(COMMAND, /spec-env review serve/)
})

test('/spec-start on an epic names the members to start in new tabs, within the free lanes', () => {
  assert.match(START, /skitterspec epic status <name> --json/)
  assert.match(START, /one `\/spec-start <member>`\n {2}for each row whose `next\.verb` is `start`, \*\*in a new tab each\*\*/)
  assert.match(START, /free lanes \(`freeLanes`/)
})

test('/spec-start on an epic carries the epic page as a row, never a banner', () => {
  assert.match(START, /\*\*`Review`\*\* carries the epic page's stack/)
  assert.match(START, /it is the row and never the banner/)
  assert.match(START, /\*\*`\/spec-epic`\*\* re-shows the table and\nthe page/)
})

test('the planning rule names /spec-epic among the commands', () => {
  assert.match(PLANNING, /\*\*`\/spec-epic` is the sixth command\*\*/)
})
