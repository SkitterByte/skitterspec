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

/**
 * Interactive confirm for removing leftover release tooling on `update`. Returns
 * true only on an explicit yes; a cancel (Ctrl-C / Esc) resolves to false so the
 * default is always to keep the files.
 */
async function confirmRemoveReleaseTooling() {
  const prompts = require('prompts')
  const ans = await prompts(
    {
      type: 'confirm',
      name: 'remove',
      message: 'Found release tooling (now in @skitterbyte/skittership). Remove it here?',
      initial: false,
    },
    { onCancel: () => false },
  )
  return Boolean(ans.remove)
}

/**
 * Interactive choice when `init` finds an already-set-up repo. Returns one of
 * `leave` | `resync` | `reset`. Defaults to (and cancels to) `leave` — the safe
 * no-op — and asks a second confirm before `reset` (destructive to managed files).
 */
async function promptExistingSetup() {
  const prompts = require('prompts')
  const { action } = await prompts(
    {
      type: 'select',
      name: 'action',
      message: 'This project already has skitterspec set up. What would you like to do?',
      initial: 0,
      choices: [
        { title: 'Leave alone — make no changes', value: 'leave' },
        { title: 'Resync — update managed files to the latest, keep my edits', value: 'resync' },
        { title: 'Start again — reset the scaffolding (your specs & config are kept)', value: 'reset' },
      ],
    },
    { onCancel: () => {} },
  )
  if (action === 'reset') {
    const { confirm } = await prompts(
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Start again overwrites managed skills/rules. Your specs and config are untouched. Continue?',
        initial: false,
      },
      { onCancel: () => false },
    )
    if (!confirm) return 'leave'
  }
  return action || 'leave'
}

module.exports = { promptSetup, confirmRemoveReleaseTooling, promptExistingSetup }
