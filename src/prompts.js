'use strict'

/**
 * Interactive setup flow for `skitterspec init`, built on the `prompts`
 * (terkelg) library. Only required from the TTY branch of the CLI — the
 * non-interactive path (flags / --yes / CI) never loads this module, so the
 * test suite never imports the interactive UI.
 *
 * `isolationSeed` pre-fills the per-spec isolation question. Returns
 * `{ isolation }`.
 */

async function promptSetup({ isolationSeed = false } = {}) {
  const prompts = require('prompts')

  let cancelled = false
  const onCancel = () => {
    cancelled = true
    return false // stop the prompt chain
  }

  const questions = [
    {
      type: 'confirm',
      name: 'isolation',
      message: 'Enable per-spec isolation — a git worktree per spec?',
      initial: isolationSeed,
    },
  ]

  const ans = await prompts(questions, { onCancel })
  if (cancelled) throw new Error('Setup cancelled')

  return { isolation: Boolean(ans.isolation) }
}

module.exports = { promptSetup }
