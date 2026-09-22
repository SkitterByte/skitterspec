'use strict'

/**
 * Terminal input helpers for a credentials CLI — reading a piped secret, and
 * prompting for one with the echo off.
 */

// Read stdin to completion (for `--stdin`).
function readAllStdin(input) {
  return new Promise((resolve, reject) => {
    let data = ''
    input.setEncoding('utf-8')
    input.on('data', (chunk) => (data += chunk))
    input.on('end', () => resolve(data))
    input.on('error', reject)
  })
}

// Prompt on a TTY with the input hidden. `_writeToOutput` is readline's own echo
// hook — filtering it is what keeps the key off the screen (and out of a
// screen-shared terminal or a recorded session).
//
// READLINE OWNS THE PROMPT, deliberately. Writing it ourselves and then starting
// the interface loses it: readline clears from the cursor to the end of the
// screen (`ESC[0J`) before its first redraw, so the prompt was wiped the instant
// it appeared and the user was left staring at a blank line while the process
// waited for a key — indistinguishable from a hang.
//
// The hook is assigned BEFORE `question`, so the very first redraw goes through
// it. readline hands it `prompt + what has been typed`; re-writing only the
// prompt is what keeps the key hidden while the prompt survives every redraw.
function promptHidden(question, input, out) {
  const readline = require('node:readline')
  return new Promise((resolve) => {
    // `out`, never `process.stdout`: they are the same stream in production, and
    // hardcoding one half meant readline cleared a screen the prompt had not
    // been written to under test — the split that hid this bug from the suite.
    const rl = readline.createInterface({ input, output: out, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.includes(question)) out.write(question)
    }
    rl.question(question, (answer) => {
      out.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

module.exports = { readAllStdin, promptHidden }
