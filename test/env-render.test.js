'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { renderEnvFile, expandOpenCommand } = require('../src/env/render.js')

test('renderEnvFile emits COMPOSE_PROJECT_NAME + PORT_OFFSET', () => {
  assert.strictEqual(
    renderEnvFile({ projectName: 'app_thing', portOffset: 3010 }),
    'COMPOSE_PROJECT_NAME=app_thing\nPORT_OFFSET=3010\n',
  )
})

test('expandOpenCommand expands tokens', () => {
  const cmd = expandOpenCommand('code {worktreePath}', {
    worktreePath: '/wt/thing',
    slug: 'thing',
  })
  assert.strictEqual(cmd, 'code /wt/thing')
})

test('expandOpenCommand supports multiple tokens', () => {
  const cmd = expandOpenCommand('tmux new-window -n {slug} -c {worktreePath}', {
    worktreePath: '/wt/thing',
    slug: 'thing',
  })
  assert.strictEqual(cmd, 'tmux new-window -n thing -c /wt/thing')
})

test('expandOpenCommand returns null for empty/whitespace/non-string', () => {
  assert.strictEqual(expandOpenCommand('', {}), null)
  assert.strictEqual(expandOpenCommand('   ', {}), null)
  assert.strictEqual(expandOpenCommand(undefined, {}), null)
})
