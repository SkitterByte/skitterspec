'use strict'

/**
 * The interactive key prompt — the path a HUMAN uses, and the only one the suite
 * never exercised.
 *
 * `--stdin` and the not-a-terminal refusal both had tests; the prompt itself was
 * covered only by fake input streams that never went near readline's terminal
 * mode. So the one path the docs tell a user to run was the one path nothing
 * ran, and it shipped writing a prompt that readline then erased — leaving a
 * blank line and a process waiting on input with nothing on screen.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { PassThrough } = require('node:stream')

const { promptHidden } = require('../src/cli-sync.js')

const QUESTION = 'Linear personal API key for T1 (SKL) (hidden): '

// A terminal readline will drive: `terminal: true` needs isTTY and a width, and
// readline calls setRawMode on the input.
function fakeTtyInput() {
  const input = new PassThrough()
  input.isTTY = true
  input.setRawMode = () => {}
  return input
}

// Capture the REAL stdout for the duration of the prompt. That is not a
// convenience — it is the point. In production `out` and readline's output are
// both `process.stdout`, so readline's redraw lands on the same stream the
// prompt was written to. A test that hands the two halves different fakes proves
// nothing: it is what let this ship.
function captureStdout(fn) {
  const orig = process.stdout.write
  let text = ''
  process.stdout.write = (chunk) => ((text += String(chunk)), true)
  try {
    return { result: fn(), text: () => text }
  } finally {
    process.stdout.write = orig
  }
}

// What is actually LEFT on screen: readline clears from the cursor to the end of
// the screen (`ESC[0J`) before every redraw, so anything written before the last
// clear is gone. Only what follows it is visible to the user.
function visible(text) {
  const cleared = text.lastIndexOf('\x1b[0J')
  return cleared === -1 ? text : text.slice(cleared + 4)
}

test('the prompt is still on screen while it waits for the key', async () => {
  const input = fakeTtyInput()
  // Nothing is typed before the assertion — this is exactly what the user stares
  // at after running `credentials set`.
  const { result: answered, text } = captureStdout(() =>
    promptHidden(QUESTION, input, process.stdout),
  )

  assert.ok(
    visible(text()).includes(QUESTION),
    'the prompt was erased — the user sees a blank line and a process that looks hung.\n' +
      `  raw:     ${JSON.stringify(text())}\n` +
      `  visible: ${JSON.stringify(visible(text()))}`,
  )

  input.write('lin_api_TESTKEY\n')
  assert.strictEqual(await answered, 'lin_api_TESTKEY')
})

test('the key itself is never echoed', async () => {
  const input = fakeTtyInput()
  const { result: answered, text } = captureStdout(() => {
    const p = promptHidden(QUESTION, input, process.stdout)
    input.write('lin_api_SECRETVALUE\n')
    return p
  })
  assert.strictEqual(await answered, 'lin_api_SECRETVALUE')
  assert.ok(!text().includes('lin_api_SECRETVALUE'), 'the key stays off the screen')
})
