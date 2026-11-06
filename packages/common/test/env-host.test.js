'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const {
  parseRemote,
  prFor,
  githubPrState,
  azurePrState,
  prCreateCommand,
  prReadyCommand,
  prAbandonCommand,
} = require('../src/env/host.js')

// --- detection table ---------------------------------------------------------

test('parseRemote: github over https, ssh and scp-like forms', () => {
  for (const url of [
    'https://github.com/acme/widgets.git',
    'https://github.com/acme/widgets',
    'git@github.com:acme/widgets.git',
    'ssh://git@github.com/acme/widgets',
  ]) {
    const r = parseRemote(url)
    assert.strictEqual(r.host, 'github', url)
    assert.strictEqual(r.org, 'acme', url)
    assert.strictEqual(r.repo, 'widgets', url)
  }
})

test('parseRemote: azure modern, user-prefixed, ssh and legacy forms', () => {
  for (const url of [
    'https://dev.azure.com/acme/Widgets/_git/widgets',
    'https://acme@dev.azure.com/acme/Widgets/_git/widgets',
    'git@ssh.dev.azure.com:v3/acme/Widgets/widgets',
    'https://acme.visualstudio.com/Widgets/_git/widgets',
    'https://acme.visualstudio.com/DefaultCollection/Widgets/_git/widgets',
  ]) {
    const r = parseRemote(url)
    assert.strictEqual(r.host, 'azure', url)
    assert.strictEqual(r.org, 'acme', url)
    assert.strictEqual(r.project, 'Widgets', url)
    assert.strictEqual(r.repo, 'widgets', url)
    assert.strictEqual(r.orgUrl, 'https://dev.azure.com/acme', url)
  }
})

test('parseRemote: an azure project with spaces is decoded', () => {
  const r = parseRemote('https://dev.azure.com/acme/My%20Project/_git/widgets')
  assert.strictEqual(r.project, 'My Project')
})

test('parseRemote: unknown hosts are null — never guessed', () => {
  // A GitHub Enterprise / Azure Server install on its own domain is the
  // deliberate degrade-to-ancestry path.
  for (const url of [
    'https://git.example.com/acme/widgets.git',
    'git@gitlab.com:acme/widgets.git',
    '',
    null,
  ]) {
    assert.strictEqual(parseRemote(url).host, null, String(url))
  }
})

// --- state mapping -----------------------------------------------------------

test('githubPrState maps MERGED / OPEN / draft / CLOSED, and junk to cannot-tell', () => {
  assert.strictEqual(githubPrState('{"state":"MERGED","number":7}').state, 'merged')
  assert.strictEqual(githubPrState('{"state":"OPEN","isDraft":false}').state, 'open')
  assert.strictEqual(githubPrState('{"state":"OPEN","isDraft":true}').state, 'draft')
  assert.strictEqual(githubPrState('{"state":"CLOSED"}').state, 'none')
  assert.strictEqual(githubPrState('not json').state, 'cannot-tell')
})

test('azurePrState: empty list is a positive none; the newest PR wins', () => {
  assert.strictEqual(azurePrState('[]').state, 'none')
  // An abandoned early attempt must not shadow the live PR.
  const list = JSON.stringify([
    { pullRequestId: 3, status: 'abandoned' },
    { pullRequestId: 9, status: 'active', isDraft: true },
  ])
  const r = azurePrState(list)
  assert.strictEqual(r.state, 'draft')
  assert.strictEqual(r.id, '9')
  assert.strictEqual(azurePrState('{"not":"a list"}').state, 'cannot-tell')
})

// --- prFor with an injected exec ----------------------------------------------

const GH = parseRemote('https://github.com/acme/widgets.git')
const AZ = parseRemote('https://dev.azure.com/acme/My%20Project/_git/widgets')

test('prFor: unknown host is cannot-tell without running anything', () => {
  let ran = false
  const r = prFor(parseRemote('https://git.example.com/a/b'), 'feat/x', () => {
    ran = true
    return { ok: true, stdout: '[]', stderr: '' }
  })
  assert.strictEqual(r.state, 'cannot-tell')
  assert.strictEqual(ran, false, 'no CLI is run for a host we did not recognise')
})

test('prFor: gh "no pull requests found" is a positive none, other failures are not', () => {
  const none = prFor(GH, 'feat/x', () => ({ ok: false, stdout: '', stderr: 'no pull requests found for branch "feat/x"' }))
  assert.strictEqual(none.state, 'none')
  for (const stderr of ['gh: command not found', 'error connecting to api.github.com', '']) {
    const r = prFor(GH, 'feat/x', () => ({ ok: false, stdout: '', stderr }))
    assert.strictEqual(r.state, 'cannot-tell', stderr || '(empty stderr)')
  }
})

test('prFor: azure passes org/project/repo from the URL and maps the result', () => {
  let seen
  const r = prFor(AZ, 'feat/x', (file, args) => {
    seen = { file, args }
    return { ok: true, stdout: '[{"pullRequestId":4,"status":"completed"}]', stderr: '' }
  })
  assert.strictEqual(r.state, 'merged')
  assert.strictEqual(seen.file, 'az')
  assert.ok(seen.args.includes('https://dev.azure.com/acme'))
  assert.ok(seen.args.includes('My Project'))
  assert.ok(seen.args.includes('widgets'))
  assert.ok(seen.args.includes('feat/x'))
})

// --- command composition -------------------------------------------------------

test('prCreateCommand: github with and without draft; azure quotes spaced names', () => {
  assert.strictEqual(
    prCreateCommand(GH, { branch: 'feat/x', base: 'main', draft: true }),
    'gh pr create --head feat/x --base main --fill --draft',
  )
  assert.strictEqual(
    prCreateCommand(GH, { branch: 'feat/x', base: 'main', draft: false }),
    'gh pr create --head feat/x --base main --fill',
  )
  const az = prCreateCommand(AZ, { branch: 'feat/x', base: 'main', draft: true })
  assert.match(az, /--project "My Project"/)
  assert.match(az, /--source-branch feat\/x --target-branch main --draft true$/)
  assert.strictEqual(prCreateCommand(parseRemote('x'), { branch: 'b', base: 'm' }), null)
})

test('ready/abandon: github addresses by branch; azure needs an id or says nothing', () => {
  assert.strictEqual(prReadyCommand(GH, { branch: 'feat/x' }), 'gh pr ready feat/x')
  assert.strictEqual(prAbandonCommand(GH, { branch: 'feat/x' }), 'gh pr close feat/x')
  assert.strictEqual(prReadyCommand(AZ, { branch: 'feat/x' }), null)
  assert.match(
    prReadyCommand(AZ, { branch: 'feat/x', id: '9' }),
    /az repos pr update --organization https:\/\/dev\.azure\.com\/acme --id 9 --draft false/,
  )
  assert.match(prAbandonCommand(AZ, { branch: 'feat/x', id: '9' }), /--status abandoned$/)
})
