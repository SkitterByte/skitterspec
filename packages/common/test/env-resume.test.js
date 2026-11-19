'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { blockers, blockingNext, parseBlockedOn, findTarget, planResume, resumeLines } = require('../src/env/resume.js')

// The engine behind `spec-env resume` (feat-spec-resume), pure half.

const overview = (extra = '', fm = '') => `${fm ? `---\n${fm}\n---\n\n` : ''}# X\n\n> **Type:** Feature\n${extra}`

test('Blocked on: is read from the overview and from each phase file, in phase order', () => {
  const found = blockers({
    overview: overview('> **Blocked on:** waiting on LSC release\n'),
    phases: [
      { n: 4, text: '# Phase 4 ⬜\n\n> **Blocked on:** 7 days in prod (until 2026-12-01)\n' },
      { n: 2, text: '# Phase 2 ✅\n' },
    ],
  })
  assert.deepStrictEqual(found, [
    { where: 'spec', text: 'waiting on LSC release', until: null },
    { where: 4, text: '7 days in prod', until: '2026-12-01' },
  ])
})

// STAYS SILENT: the ordinary spec — nothing recorded is nothing reported.
test('a spec with no Blocked on: line has no blockers, and a placeholder dash is not one', () => {
  assert.deepStrictEqual(blockers({ overview: overview(), phases: [{ n: 1, text: '# Phase 1 ⬜\n' }] }), [])
  assert.deepStrictEqual(blockers({ overview: overview('> **Blocked on:** —\n') }), [])
})

test('an until that is not a real date stays text and is never read as one', () => {
  assert.deepStrictEqual(parseBlockedOn('soak (until 2026-02-31)'), { text: 'soak (until 2026-02-31)', until: null })
  assert.deepStrictEqual(parseBlockedOn('soak (until next week)'), { text: 'soak (until next week)', until: null })
})

const copy = (folder, bucket, origin, extra = {}) => ({
  folder,
  bucket,
  origin,
  overview: overview('', extra.fm || ''),
  phases: [],
  ...extra,
})

test('a name finds its spec, and the spec\'s own worktree copy speaks over base and branch', () => {
  const copies = [
    copy('feat-x', 'backlog', 'here'),
    copy('feat-x', 'in-progress', 'branch', { local: false }),
    copy('feat-x', 'in-progress', 'worktree'),
  ]
  const { target, by } = findTarget('feat-x', copies, 'github_identifier')
  assert.strictEqual(by, 'name')
  assert.strictEqual(target.origin, 'worktree')
})

test('a local branch copy beats the remote-tracking one, and both beat a stale base copy', () => {
  const copies = [
    copy('feat-x', 'backlog', 'here'),
    copy('feat-x', 'in-progress', 'branch', { local: false, ref: 'refs/remotes/origin/feat/x' }),
    copy('feat-x', 'in-progress', 'branch', { local: true, ref: 'refs/heads/feat/x' }),
  ]
  assert.strictEqual(findTarget('feat-x', copies).target.ref, 'refs/heads/feat/x')
})

test('a ticket ref finds the spec linked to it, with or without the #', () => {
  const copies = [copy('feat-a', 'in-progress', 'branch', { fm: 'github_identifier: "#999"', local: true }), copy('feat-b', 'in-progress', 'here')]
  assert.strictEqual(findTarget('#999', copies, 'github_identifier').target.folder, 'feat-a')
  assert.strictEqual(findTarget('999', copies, 'github_identifier').target.folder, 'feat-a')
})

// STAYS SILENT: an unknown ref must never fall back to "the only spec there is".
test('a ref that matches nothing refuses and names no spec', () => {
  const copies = [copy('feat-only', 'in-progress', 'worktree')]
  const r = findTarget('#12345', copies, 'github_identifier')
  assert.ok(r.refused)
  assert.ok(!r.target)
  assert.doesNotMatch(r.refused, /feat-only/)
})

test('without identifierField a ref cannot be read, and the refusal says why', () => {
  assert.match(findTarget('#999', [], '').refused, /identifierField is not set/)
})

test('one ref linked from two specs refuses rather than picking', () => {
  const fm = 'github_identifier: "#7"'
  const r = findTarget('#7', [copy('feat-a', 'in-progress', 'here', { fm }), copy('feat-b', 'in-progress', 'here', { fm })], 'github_identifier')
  assert.match(r.refused, /feat-a, feat-b/)
})

const ENV = { branch: 'feat/x', worktreePath: '/wt/x', remote: 'origin', identifierField: 'github_identifier' }

test('backlog, complete and cancelled are refused, and backlog names /spec-start', () => {
  for (const bucket of ['backlog', 'complete', 'cancelled']) {
    const r = planResume(copy('feat-x', bucket, 'here'), { ...ENV, worktreeExists: true })
    assert.strictEqual(r.ok, false)
    assert.match(r.refused, new RegExp(`in ${bucket}`))
  }
  assert.match(planResume(copy('feat-x', 'backlog', 'here'), ENV).refused, /\/spec-start/)
})

test('an existing worktree needs nothing provisioned', () => {
  const r = planResume(copy('feat-x', 'in-progress', 'worktree'), { ...ENV, worktreeExists: true })
  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(r.commands, [])
})

test('a missing worktree attaches the local branch, then bootstraps', () => {
  const r = planResume(copy('feat-x', 'in-progress', 'branch'), { ...ENV, worktreeExists: false, localBranch: true })
  assert.deepStrictEqual(r.commands, ['git worktree add /wt/x feat/x'])
  assert.deepStrictEqual(r.then, ['skitterspec spec-env bootstrap feat-x'])
})

test('with only the remote branch it fetches and tracks — never a fresh fork', () => {
  const r = planResume(copy('feat-x', 'in-progress', 'branch'), { ...ENV, worktreeExists: false, remoteBranch: true })
  assert.deepStrictEqual(r.commands, ['git fetch origin feat/x', 'git worktree add /wt/x -b feat/x --track origin/feat/x'])
  for (const c of r.commands) assert.doesNotMatch(c, /-b feat\/x$/)
})

test('with no branch anywhere it refuses rather than starting one', () => {
  const r = planResume(copy('feat-x', 'in-progress', 'here'), { ...ENV, worktreeExists: false })
  assert.strictEqual(r.ok, false)
  assert.match(r.refused, /nothing to resume from/)
})

test('the text report carries ticket, progress, each blocker and the plan', () => {
  const target = copy('feat-x', 'in-progress', 'branch', {
    fm: 'github_identifier: "#9"',
    phases: [{ n: 1, text: '# P1 ✅\n' }, { n: 2, text: '# P2 ⬜\n\n> **Blocked on:** deploy\n' }],
  })
  const text = resumeLines(planResume(target, { ...ENV, worktreeExists: false, localBranch: true })).join('\n')
  assert.match(text, /ticket: {4}#9/)
  assert.match(text, /1 of 2 done/)
  assert.match(text, /blocked: {3}phase 2 — deploy/)
  assert.match(text, /git worktree add \/wt\/x feat\/x/)
})

const ph = (n, mark, blocked) => ({ n, text: `# Phase ${n} ${mark}\n${blocked ? `\n> **Blocked on:** ${blocked}\n` : ''}` })

test('the next unfinished phase\'s own blocker holds the next build', () => {
  const b = blockingNext({ overview: overview(), phases: [ph(1, '✅'), ph(2, '⬜', 'prod deploy of phase 1')] })
  assert.deepStrictEqual(b, { where: 2, text: 'prod deploy of phase 1', until: null })
})

test('a spec-level blocker holds whichever phase is next', () => {
  const b = blockingNext({ overview: overview('> **Blocked on:** LSC release\n'), phases: [ph(1, '🔄')] })
  assert.strictEqual(b.where, 'spec')
})

// STAYS SILENT: a wait planned for phase 4 must not stop phases 1–3.
test('a blocker on a LATER phase does not hold the next build', () => {
  assert.strictEqual(blockingNext({ overview: overview(), phases: [ph(1, '✅'), ph(2, '⬜'), ph(3, '⬜', '7 days in prod')] }), null)
})

test('with every phase done there is nothing left to block', () => {
  assert.strictEqual(blockingNext({ overview: overview('> **Blocked on:** x\n'), phases: [ph(1, '✅')] }), null)
})

test('the resume answer carries the blocker that holds the next build, and the text marks it', () => {
  const target = copy('feat-x', 'in-progress', 'worktree', { phases: [ph(1, '✅'), ph(2, '⬜', 'deploy')] })
  const r = planResume(target, { ...ENV, worktreeExists: true })
  assert.deepStrictEqual(r.blocking, { where: 2, text: 'deploy', until: null })
  assert.match(resumeLines(r).join('\n'), /phase 2 — deploy {2}← holds the next build/)
})

// A Windows worktree path is printed the way provision.js prints it — forward
// slashes, quoted only where the shell needs it — never with its backslashes
// escaped, which Windows read as a different path.
test('a Windows worktree path is written with the engine\'s shellPath', () => {
  const r = planResume(copy('feat-x', 'in-progress', 'branch'), {
    ...ENV,
    worktreePath: 'C:\\Users\\me\\repo-wt\\x',
    worktreeExists: false,
    localBranch: true,
  })
  assert.deepStrictEqual(r.commands, ['git worktree add C:/Users/me/repo-wt/x feat/x'])
})
