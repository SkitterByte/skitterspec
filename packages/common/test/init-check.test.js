'use strict'

/**
 * `skitterspec update --check` — say what `update` would do, write nothing.
 *
 * The CLAUDE.md section is a COPY installed between markers, not a link, so it
 * goes quietly out of date. This repo's own was a whole spec behind the
 * template it ships, through a spec ABOUT that template, with every test green —
 * and the only symptom was that the skills' contract never reached a run.
 *
 * The check therefore reports three states and accuses on none of them. A
 * difference is either an out-of-date copy or the user's own edit, and from here
 * those are indistinguishable — so it says what would happen and lets them
 * decide (`.claude/rules/negative-checks.md` rule 4).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const { init, checkSync, claudeMdSectionState } = require('../src/init.js')

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-check-'))
  execFileSync('git', ['init', '-q', dir])
  return dir
}

const capture = () => {
  const lines = []
  return { lines, log: (m) => lines.push(m) }
}

async function installed() {
  const dir = tmpProject()
  await init({ dir, force: false, claudeMd: true, mode: 'init' })
  return dir
}

test('a freshly installed project reports fresh, and says nothing', async () => {
  const dir = await installed()
  assert.strictEqual(claudeMdSectionState(dir), 'fresh')

  const out = capture()
  const { rows } = checkSync(dir, { log: out.log })
  assert.deepStrictEqual(rows, [], `nothing to report, got ${JSON.stringify(rows)}`)
  assert.match(out.lines.join('\n'), /everything is up to date/)
})

test('a hand-edited section reports a difference, never staleness', async () => {
  const dir = await installed()
  const file = path.join(dir, 'CLAUDE.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Spec workflow', '## Spec workflow (mine)'))

  assert.strictEqual(claudeMdSectionState(dir), 'differs')

  const out = capture()
  const { rows } = checkSync(dir, { log: out.log })
  const row = rows.find(([name]) => name.startsWith('CLAUDE.md'))
  assert.ok(row, `the section is reported, got ${JSON.stringify(rows)}`)

  // The wording is the decision. It must not call the user's own edit stale, or
  // out of date, or wrong — it cannot tell, and saying so is the point.
  const text = out.lines.join('\n')
  assert.match(text, /differs from the shipped one/)
  assert.doesNotMatch(text, /\bstale\b/i)
  assert.doesNotMatch(text, /out of date\b(?!.*your edit)/i)
})

// Markers absent means never installed OR deliberately stripped (`reset` does
// exactly that). Neither is a fault, so both are silent.
test('no CLAUDE.md, and one with no markers, both report not installed', async () => {
  const dir = await installed()
  fs.rmSync(path.join(dir, 'CLAUDE.md'))
  assert.strictEqual(claudeMdSectionState(dir), 'not installed')

  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# my project\n\nNothing to do with specs.\n')
  assert.strictEqual(claudeMdSectionState(dir), 'not installed')

  const out = capture()
  const { rows } = checkSync(dir, { log: out.log })
  assert.ok(
    !rows.some(([name]) => name.startsWith('CLAUDE.md')),
    'an absent section is not a finding',
  )
})

// --- stays silent -----------------------------------------------------------
//
// The check reports; it must never write. A "check" that repaired what it found
// would make the three-state wording above a lie — the user would have no
// chance to keep their edit.
test('the check writes nothing at all', async () => {
  const dir = await installed()
  const file = path.join(dir, 'CLAUDE.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Spec workflow', '## Spec workflow (mine)'))

  const snapshot = new Map()
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else snapshot.set(p, fs.readFileSync(p, 'utf8'))
    }
  }
  walk(dir)

  checkSync(dir, { log: () => {} })

  for (const [p, before] of snapshot) {
    assert.ok(fs.existsSync(p), `${path.relative(dir, p)} still exists`)
    assert.strictEqual(fs.readFileSync(p, 'utf8'), before, `${path.relative(dir, p)} unchanged`)
  }
  const after = new Set()
  const walk2 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk2(p)
      else after.add(p)
    }
  }
  walk2(dir)
  assert.strictEqual(after.size, snapshot.size, 'no file was created either')
})

// The CLI wiring, asserted WITHOUT a subprocess. This package's own bin refuses
// to run from uncomposed assets by design, so an end-to-end run belongs at the
// built-distribution level (`scripts/build-dist.test.js`), not here. What this
// file can still pin is that `--check` is a real flag and that the update branch
// routes to the reporter rather than the writer — the two ways the wiring could
// silently turn a check into a resync.
test('--check parses, and routes update to the reporter', () => {
  const { parse } = require('../src/cli.js')
  assert.strictEqual(parse(['update', '.', '--check']).opts.check, true)
  assert.strictEqual(parse(['update', '.']).opts.check, false)

  const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8')
  const branch = cli.slice(cli.indexOf("case 'update':"), cli.indexOf('default:', cli.indexOf("case 'update':")))
  assert.match(branch, /if \(opts\.check\)/, 'update checks the flag')
  // Match the CALLS, not the words: the branch's own comment says "resync" two
  // lines above the check, and matching that made this assertion look at prose.
  assert.ok(
    branch.indexOf('checkSync(') < branch.indexOf('resync(dir'),
    'it reports and breaks before it can reach resync',
  )
})

// Reporting is not failing. A non-zero exit on a difference would break any CI
// that runs this, and would also contradict the wording: the check cannot tell
// an out-of-date copy from a deliberate edit, so it must not treat either as an
// error.
test('the reporter returns normally when it has findings', async () => {
  const dir = await installed()
  const file = path.join(dir, 'CLAUDE.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('## Spec workflow', '## Spec workflow (mine)'))

  const out = capture()
  assert.doesNotThrow(() => checkSync(dir, { log: out.log }))
  assert.match(out.lines.join('\n'), /would:/)
})
