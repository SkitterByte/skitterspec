'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { seamNames, composeText, loadFragments, mergeFragments, composeAssets } = require('./compose.js')

const COMMON_ASSETS = path.join(__dirname, '..', 'packages', 'common', 'assets')
const LINEAR_SEAMS = path.join(__dirname, '..', 'packages', 'linear', 'assets', 'seams')
const COMMON_SEAMS = path.join(__dirname, '..', 'packages', 'common', 'seams')
const LINEAR_SKILLS = path.join(__dirname, '..', 'packages', 'linear', 'assets', 'skills')

// Every seam name declared across common's shipped markdown assets.
function commonSeamNames() {
  const names = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) {
        for (const n of seamNames(fs.readFileSync(abs, 'utf8'))) names.add(n)
      }
    }
  }
  walk(COMMON_ASSETS)
  return [...names]
}

// Collect every .md file's text under a directory.
function markdownTexts(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) out.push(fs.readFileSync(abs, 'utf8'))
    }
  }
  walk(dir)
  return out
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skitterspec-compose-'))

// --- Unit: composeText / loadFragments -------------------------------------

test('composeText empties an unfilled seam and fills a provided one', () => {
  assert.strictEqual(composeText('a\n<!-- seam:x -->\nb'), 'a\n\nb')
  assert.strictEqual(composeText('a\n<!-- seam:x -->\nb', { x: 'HELLO' }), 'a\nHELLO\nb')
})

test('composeText leaves no raw marker even for unknown seams', () => {
  const out = composeText('<!-- seam:one -->\n<!-- seam:two -->', { one: 'X' })
  assert.doesNotMatch(out, /seam:/)
})

test('composeText is idempotent (composed output has no seams to refill)', () => {
  const once = composeText('p\n<!-- seam:x -->\nq', { x: 'FRAG' })
  assert.strictEqual(composeText(once, { x: 'FRAG' }), once)
})

test('loadFragments strips the leading doc comment and keys by filename', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'greet.md'), '<!--\nexplain this fragment\n-->\n\nHello **world**\n')
  const frags = loadFragments(dir)
  assert.deepStrictEqual(Object.keys(frags), ['greet'])
  assert.strictEqual(frags.greet, 'Hello **world**\n')
})

test('loadFragments returns nothing for a missing directory (base case)', () => {
  assert.deepStrictEqual(loadFragments(path.join(tmp(), 'nope')), {})
})

// --- Distribution builds ----------------------------------------------------

test('base build: seams emptied, no marker survives, no tracker leakage', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, {}) // no provider fragments = base
  const texts = markdownTexts(out)
  assert.ok(texts.length > 0, 'composed some markdown')
  for (const text of texts) {
    assert.doesNotMatch(text, /seam:/, 'no raw seam marker in the base build')
    assert.doesNotMatch(text, /Linear/, 'no Linear brand text in the base build')
    assert.doesNotMatch(text, /linear[_.]/i, 'no linear config/field tokens in the base build')
  }
})

test('base build copies non-markdown assets byte-for-byte', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, {})
  const example = path.join(out, 'core', 'env.config.json.example')
  assert.ok(fs.existsSync(example), 'env.config.json.example copied')
  assert.deepStrictEqual(
    fs.readFileSync(example),
    fs.readFileSync(path.join(COMMON_ASSETS, 'core', 'env.config.json.example')),
  )
})

test('superset build: both seams carry the Linear fragment', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, loadFragments(LINEAR_SEAMS))

  const spec = fs.readFileSync(path.join(out, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(spec, /seam:/, 'spec seam filled')
  assert.doesNotMatch(spec, /<!--|-->/, 'fragment doc comment stripped, no marker residue')
  assert.match(spec, /linear\.config\.json/, 'spec-tracker-link fragment injected')
  assert.match(spec, /Create the Issue/i, 'link step present')
  assert.doesNotMatch(spec, /Seam fragment for/, 'fragment header text not injected')

  const specNext = fs.readFileSync(path.join(out, 'skills', 'spec-next', 'SKILL.md'), 'utf8')
  assert.doesNotMatch(specNext, /seam:/, 'spec-next seam filled')
  assert.doesNotMatch(specNext, /<!--|-->/, 'fragment doc comment stripped, no marker residue')
  assert.match(specNext, /\/spec-push/, 'spec-next-start fragment injected (one-way: refresh via /spec-push)')
  assert.doesNotMatch(specNext, /\/spec-pull/, 'no /spec-pull anywhere — one-way')
})

// --- Guard: the seam contract between common and the provider ----------------

// Every declared seam must be filled by exactly ONE side.
//
// This replaced a guard that required the PROVIDER to supply every common seam,
// which stopped being true once common gained fragments shared between its own
// skills (the Impact-map guidance, the worktree bootstrap). Those must be filled
// in the base distribution too, where no provider exists.
//
// It also closes a hole the old guard left. An unfilled seam does not survive as
// a visible marker — `composeText` fills an unknown seam with NOTHING — so a
// common skill that declares `<!-- seam:foo -->` with no fragment anywhere ships
// with that passage silently deleted, and every "no raw marker survives" test
// still passes. Requiring a supplier is the only thing that catches it.
test('guard: every common seam is supplied by exactly one of common or the provider', () => {
  const declared = commonSeamNames()
  assert.ok(declared.length >= 2, 'common declares its seams')
  const common = loadFragments(COMMON_SEAMS)
  const provider = loadFragments(LINEAR_SEAMS)

  const orphaned = declared.filter(
    (n) => !Object.prototype.hasOwnProperty.call(common, n) && !Object.prototype.hasOwnProperty.call(provider, n),
  )
  assert.deepStrictEqual(
    orphaned,
    [],
    `seam declared with no fragment on either side — its text would vanish from the ` +
      `composed output silently: ${orphaned.join(', ')}`,
  )

  // The other half of "exactly one" — mergeFragments refuses a name both sides
  // define, so the merge itself is the assertion.
  assert.doesNotThrow(() => mergeFragments(common, provider), 'common and provider seam names are disjoint')
})

test('guard: a common-owned seam is filled in the BASE distribution, not just the superset', () => {
  // The base has no provider, so a seam common owns is the only kind that can
  // carry text there. If common's fragment went missing the base would compose
  // the passage away to nothing while the superset still looked correct.
  const common = loadFragments(COMMON_SEAMS)
  assert.ok(Object.keys(common).length > 0, 'common ships its own fragments')

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'seam-base-'))
  composeAssets(COMMON_ASSETS, out, common)
  const specText = fs.readFileSync(path.join(out, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.match(specText, /The concrete surfaces this spec touches/, 'impact-map guidance reached the base')
  assert.doesNotMatch(specText, /seam:/, 'no marker survives in the base')
})

// The provider's OWN skills are composed too (build-dist overlays them through
// composeAssets), so a marker there must resolve as well — otherwise /spec-push
// would ship a raw `<!-- seam:… -->` to users.
test('guard: a seam used by the provider\'s own skills has a fragment too', () => {
  // Merged, because build-dist overlays provider skills with BOTH fragment sets —
  // so a provider skill is free to reuse one of common's.
  const provided = mergeFragments(loadFragments(COMMON_SEAMS), loadFragments(LINEAR_SEAMS))
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.md')) {
        for (const name of seamNames(fs.readFileSync(abs, 'utf8'))) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(provided, name),
            `linear provides a fragment for seam:${name} used by ${entry.name}`,
          )
        }
      }
    }
  }
  walk(LINEAR_SKILLS)
})

test('the intake seam reaches every creating skill, in the superset only', () => {
  const linear = tmp()
  composeAssets(COMMON_ASSETS, linear, loadFragments(LINEAR_SEAMS))
  const base = tmp()
  composeAssets(COMMON_ASSETS, base, {})

  for (const skill of ['spec', 'spec-bug', 'spec-hotfix']) {
    const withLinear = fs.readFileSync(path.join(linear, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.match(withLinear, /Phase 0 — start from a Linear issue/, `${skill} can start from an issue`)
    assert.match(withLinear, /--from-issue/, `${skill} documents the inbox flag`)
    assert.match(withLinear, /spec-sync linked --json/, `${skill} dedups against adopted issues`)

    const plain = fs.readFileSync(path.join(base, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(plain, /seam:/, `${skill} seam emptied in base`)
    assert.doesNotMatch(plain, /Linear|from-issue/i, `${skill} stays tracker-free in base`)
  }
})

test('a bug-labelled issue is routed to /spec-bug rather than specced as a feature', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, loadFragments(LINEAR_SEAMS))

  const spec = fs.readFileSync(path.join(out, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.match(spec, /intake\.bugLabels/, '/spec knows the bug labels')
  assert.match(spec, /\/spec-bug <ISSUE-REF>/, '/spec hands off rather than authoring')

  // /spec-bug carries the same fragment, so adoption is identical there — but it
  // must not bounce the user onward in a loop.
  // A skip exists to stop a skill routing to itself — NOT to swallow an
  // escalation. /spec-bug must still be told when an issue needs a hotfix,
  // because fixing on main leaves production broken.
  for (const skill of ['spec-bug', 'spec-hotfix']) {
    const text = fs.readFileSync(path.join(out, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.match(text, /the bug check is skipped \(it would route you to\s*\n?\s*yourself\)/, `no /${skill} self-loop`)
    assert.match(text, /becomes\*\* the spec's issue/, `adoption applies in /${skill} too`)
  }

  const bugPath = fs.readFileSync(path.join(out, 'skills', 'spec-bug', 'SKILL.md'), 'utf8')
  assert.match(bugPath, /\*\*hotfix check still runs\*\*/, '/spec-bug can still escalate to /spec-hotfix')
  const hotfixPath = fs.readFileSync(path.join(out, 'skills', 'spec-hotfix', 'SKILL.md'), 'utf8')
  assert.match(hotfixPath, /In `\/spec-hotfix`\*\* — both are skipped/, '/spec-hotfix has nowhere left to route')
})

test('adoption never mints: the intake fragment forbids picker and base sidecar', () => {
  const out = tmp()
  composeAssets(COMMON_ASSETS, out, loadFragments(LINEAR_SEAMS))
  const spec = fs.readFileSync(path.join(out, 'skills', 'spec', 'SKILL.md'), 'utf8')
  assert.match(spec, /Do not run the project picker/, 'adoption leaves placement to Linear')
  assert.match(spec, /Do not write a base sidecar/, 'so the first push overwrites the report')
})

test('the project picker is single-sourced into both mint points', () => {
  const out = tmp()
  const fragments = loadFragments(LINEAR_SEAMS)
  composeAssets(COMMON_ASSETS, out, fragments)
  composeAssets(LINEAR_SKILLS, path.join(out, 'skills'), fragments)

  for (const skill of ['spec', 'spec-push']) {
    const text = fs.readFileSync(path.join(out, 'skills', skill, 'SKILL.md'), 'utf8')
    assert.doesNotMatch(text, /seam:/, `${skill} seam filled`)
    assert.match(text, /Picking the Linear Project/, `${skill} carries the picker`)
    assert.match(text, /None \(team only\)/, `${skill} offers the no-project option`)
  }
})

// --- mergeFragments ----------------------------------------------------------

test('mergeFragments combines the two sides', () => {
  const merged = mergeFragments({ shared: 'A' }, { tracker: 'B' })
  assert.deepStrictEqual(merged, { shared: 'A', tracker: 'B' })
})

test('mergeFragments refuses a name both sides define', () => {
  // Not a preference for one side — there is no correct winner. The same marker
  // would compose to common's text in the base and the provider's in the
  // superset, and nothing in either output would show that it had happened.
  assert.throws(
    () => mergeFragments({ dup: 'from common' }, { dup: 'from provider' }),
    /defined by both common and the provider: dup/,
  )
})

test('mergeFragments treats missing sides as empty', () => {
  assert.deepStrictEqual(mergeFragments(), {})
  assert.deepStrictEqual(mergeFragments({ a: '1' }), { a: '1' })
})

test('an orphaned seam composes to nothing — which is why the guard must exist', () => {
  // Non-vacuity proof for the coverage guard above: this is what a forgotten
  // fragment actually does. No marker, no error, just missing instructions.
  const composed = composeText('before\n<!-- seam:never-defined -->\nafter', {})
  assert.strictEqual(composed, 'before\n\nafter')
  assert.doesNotMatch(composed, /seam:/, 'the evidence is gone, not merely wrong')
})
