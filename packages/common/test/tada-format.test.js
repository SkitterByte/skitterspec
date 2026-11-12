'use strict'

/**
 * `skitterspec tada`, phase 3 — the text the skill reads, and the skill
 * itself shipping. The text is pinned whole: its markers (`*` a move, `+` a
 * commit, `-` a prompt) are what the skill is told to read, so a drift here is
 * a drift in what the recap can tell apart.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { formatTada } = require('../src/tada/format.js')

const WINDOW = { since: '2026-11-11T00:00:00.000Z', until: '2026-11-11T18:00:00.000Z' }

test('the text form: spec groups, branch groups, moves, commits, prompts, in flight, notes', () => {
  const digest = {
    window: WINDOW,
    projects: [
      {
        repo: '/code/app',
        name: 'app',
        git: true,
        skitterspec: true,
        groups: [
          {
            spec: 'feat-orders',
            branch: 'feat/orders',
            ticket: { id: '#12', url: null },
            sessions: [
              {
                id: 's1',
                start: '2026-11-11T09:00:00Z',
                end: '2026-11-11T11:00:00Z',
                prompts: [
                  { at: '2026-11-11T09:00:00Z', command: '/spec-next', text: '' },
                  { at: '2026-11-11T10:00:00Z', text: 'make the total round up' },
                ],
                omitted: 4,
              },
            ],
            commits: [{ sha: 'a1b2c3d4e', at: '2026-11-11T11:00:00Z', subject: 'feat(orders): totals', spec: 'feat-orders', branch: 'feat/orders', refs: [] }],
            events: [{ spec: 'feat-orders', kind: 'phase-done', phase: 2, sha: 'a1b2c3d4e', at: '2026-11-11T11:00:00Z' }],
            inFlight: { spec: 'feat-orders', detail: 'in-progress · 2 of 3 phases done', next: '/spec-next' },
          },
          {
            spec: null,
            branch: 'main',
            sessions: [],
            commits: [{ sha: 'f00ba4000', at: '2026-11-11T12:00:00Z', subject: 'chore: bump', spec: null, branch: 'main', refs: [] }],
            events: [],
            inFlight: null,
          },
        ],
      },
      { repo: null, name: 'notes', git: false, skitterspec: false, groups: [] },
    ],
    notes: ['2 working directories no longer exist (torn-down worktrees, usually) — counted under the repo their session started in, on the branch it recorded'],
  }
  assert.strictEqual(
    formatTada(digest),
    [
      'ta-da: 2026-11-11T00:00:00.000Z → 2026-11-11T18:00:00.000Z',
      '',
      'app  (/code/app)',
      '  feat-orders [#12]',
      '    * phase 2 done',
      '    + a1b2c3d4e feat(orders): totals',
      '    1 session:',
      '    - /spec-next',
      '    - make the total round up',
      '    … 4 more',
      '    in flight: in-progress · 2 of 3 phases done · next: /spec-next',
      '  main — no spec',
      '    + f00ba4000 chore: bump',
      '',
      'notes  (not a git repo)',
      '',
      '2 working directories no longer exist (torn-down worktrees, usually) — counted under the repo their session started in, on the branch it recorded',
      '',
    ].join('\n'),
  )
})

// Stays silent: the quiet day prints one line and no notes.
test('an empty window says so, and nothing else', () => {
  assert.strictEqual(
    formatTada({ window: WINDOW, projects: [], notes: [] }),
    'ta-da: 2026-11-11T00:00:00.000Z → 2026-11-11T18:00:00.000Z\n  nothing in this window.\n',
  )
})

test('spec-tada ships: init installs it, and it is model-invocable', () => {
  const { SKILLS } = require('../src/init.js')
  assert.ok(SKILLS.includes('spec-tada'), `init installs spec-tada (got ${SKILLS.join(', ')})`)
  const text = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', 'spec-tada', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(text.split('\n---\n')[0], /disable-model-invocation/, '"what did I do today" should reach it')
  assert.match(text, /skitterspec tada/)
  assert.doesNotMatch(text, /skitterspec tada[^\n]*--json/, 'the skill reads the text form')
})

// --- the page (phase 4) ------------------------------------------------------

const { execFileSync } = require('node:child_process')
const os = require('node:os')
const { renderTadaPage, renderMarkdown } = require('../src/tada/page.js')

const PAGE_DIGEST = {
  window: WINDOW,
  projects: [
    {
      repo: '/code/app',
      name: 'app',
      git: true,
      skitterspec: true,
      groups: [
        {
          spec: 'feat-orders',
          branch: 'feat/orders',
          ticket: { id: '#12', url: 'https://github.com/o/r/issues/12' },
          sessions: [{ id: 's1', start: 'x', end: 'x', prompts: [{ at: 'x', text: 'why does <script>alert(1)</script> render?' }], omitted: 0 }],
          commits: [{ sha: 'a1b2c3d4e', at: 'x', subject: 'fix: escape "quotes" & <tags>', spec: 'feat-orders', branch: 'feat/orders', refs: [] }],
          events: [{ spec: 'feat-orders', kind: 'phase-done', phase: 2, sha: 'a1b2c3d4e', at: 'x' }],
          inFlight: { spec: 'feat-orders', detail: 'in-progress · 2 of 3', next: '/spec-next' },
        },
      ],
    },
  ],
  notes: [],
}

test('the page carries the recap above the digest it was written from', () => {
  const html = renderTadaPage(PAGE_DIGEST, { recap: '## Done\n\n- **orders** landed `phase 2`', title: 'Ta-da · 2026-11-11' })
  assert.match(html, /<title>Ta-da · 2026-11-11<\/title>/)
  assert.ok(html.indexOf('class="recap"') < html.indexOf('What it was written from'), 'recap first')
  assert.match(html, /<h3>Done<\/h3>\n<ul>\n<li><strong>orders<\/strong> landed <code>phase 2<\/code><\/li>/)
  assert.match(html, /<a class="ticket" href="https:\/\/github.com\/o\/r\/issues\/12">#12<\/a>/)
  assert.match(html, /phase 2 done/)
  assert.match(html, /in flight: in-progress · 2 of 3 · next: <code>\/spec-next<\/code>/)
})

test('a prompt or a subject is text on the page, never markup', () => {
  const html = renderTadaPage(PAGE_DIGEST, { recap: 'look: <img src=x onerror=alert(1)>' })
  assert.doesNotMatch(html, /<script>alert/)
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /escape &quot;quotes&quot; &amp; &lt;tags&gt;/)
})

test('the page asks nothing back: no form, no button, no script', () => {
  const html = renderTadaPage(PAGE_DIGEST, { recap: 'x' })
  assert.doesNotMatch(html, /<(form|button|script)\b/)
})

test('without a recap the page is the digest alone', () => {
  const html = renderTadaPage(PAGE_DIGEST)
  assert.doesNotMatch(html, /class="recap"/)
  assert.match(html, /What it was written from/)
})

test('code spans keep their asterisks literal', () => {
  assert.strictEqual(renderMarkdown('use `a*b*c` here'), '<p>use <code>a*b*c</code> here</p>')
})

// --- the command ---------------------------------------------------------------

const BIN = path.join(__dirname, '..', 'bin', 'skitterspec.js')
const tada = (args, env = {}) =>
  execFileSync(process.execPath, [BIN, 'tada', ...args], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tada-cfg-')), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()

test('a several-word window needs no quotes', () => {
  assert.match(tada(['--on', 'last', 'friday']), /^ta-da: \d{4}-\d{2}-\d{2}\n/)
  assert.match(tada(['--since', '3', 'days', 'ago', '--here']), /^ta-da: \S+ → \S+\n/)
})

test('a window it cannot read exits 1 and names the fix', () => {
  assert.throws(
    () => tada(['--since', '11/12']),
    (e) => e.status === 1 && /reads two ways/.test(e.stderr.toString()),
  )
})

test('--page writes a file and prints only its path', () => {
  const recap = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tada-recap-')), 'recap.md')
  fs.writeFileSync(recap, '## Done\n\n- nothing much')
  // Its own temp dir, so the test never overwrites a page the reader made.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tada-out-'))
  const out = tada(['--on', 'yesterday', '--page', '--summary', recap], { TMPDIR: tmp, TMP: tmp, TEMP: tmp })
  const m = /^page: (file:\/\/\S+)\n$/.exec(out)
  assert.ok(m, `one line, the path: ${out}`)
  assert.ok(fs.realpathSync(new URL(m[1]).pathname).startsWith(fs.realpathSync(tmp)), 'written to the temp dir')
  const html = fs.readFileSync(new URL(m[1]), 'utf8')
  assert.match(html, /<li>nothing much<\/li>/)
})
