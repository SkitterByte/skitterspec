'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { renderEnvFile } = require('../src/env/render.js')

test('renderEnvFile emits COMPOSE_PROJECT_NAME + PORT_OFFSET', () => {
  assert.strictEqual(
    renderEnvFile({ projectName: 'app_thing', portOffset: 3010 }),
    'COMPOSE_PROJECT_NAME=app_thing\nPORT_OFFSET=3010\n',
  )
})



