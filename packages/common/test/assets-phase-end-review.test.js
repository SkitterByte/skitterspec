'use strict'

/**
 * Every skill that takes work to green renders the page and offers the review.
 *
 * There are three of them — `/spec-next` builds phases, `/spec-bug` and
 * `/spec-hotfix` drive their own fix red→green — and for a while only the first
 * carried the step. The evidence was a spec built and completed with no page on
 * disk while its three siblings that day all had one. So this file asserts the
 * step across all three rather than per-skill, which is what makes losing it in
 * one of them a red test instead of a silent gap.
 *
 * The last test is the stays-silent half (`.claude/rules/negative-checks.md`
 * rule 3): the skills that LAND branches must not gain the step by someone
 * pasting it in for symmetry. That was decided deliberately — reviewing a whole
 * spec before landing is a different question from reviewing a phase.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')
const skillText = (name) => fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8')

// The three that take work to green.
const RENDERS = ['spec-next', 'spec-bug', 'spec-hotfix']

for (const name of RENDERS) {
  const text = skillText(name)

  test(`/${name} renders the page`, () => {
    assert.match(text, /skitterspec spec-env review <spec>/)
    assert.match(text, /\*\*after\*\* the tests pass and\s*\n?\*\*before\*\* the commit/)
  })

  // The page is named in a `Review` row in the block, not in prose after it —
  // see `assets-offer-last.test.js` for why the anchor moved and what must not
  // be weakened when it moves again.
  //
  // THE ROW ASKS NOTHING. A row cannot be waited on, so a question in one is
  // unanswerable by construction: these three shipped one, and verdicts pressed
  // in answer to it sat unread. A skill that wants the question answered waits,
  // and waiting means the banner.
  // ASKING IMPLIES WAITING. All three of these wait, so all three end in the
  // banner. Any `Review` row they still write is for the render that did NOT
  // wait, and it must ask nothing — a row cannot be waited on, so a question in
  // one is unanswerable however findable it is. That row is what these three
  // shipped, and verdicts pressed in answer to it sat unread.
  test(`/${name} asks nothing in a Review row`, () => {
    assert.match(text, /`Review` row/)
    for (const m of text.matchAll(/^\|\s*\*\*Review\*\*\s*\|(.*)\|\s*$/gm)) {
      assert.ok(!m[1].includes('?'), `the row must not ask: ${m[1].trim()}`)
    }
    // The shape it must not go back to.
    assert.doesNotMatch(text, /```\nPage is rendered:/)
  })

  test(`/${name} never writes the review unasked and never publishes`, () => {
    assert.match(text, /\*\*Never write the review unasked\*\*, and \*\*never publish\*\*/)
    assert.match(text, /`\/spec-diff` §6 owns how/)
  })

  test(`/${name} treats a failed render as one line, never fatal`, () => {
    assert.match(text, /\*\*Never fatal\.\*\* A failed render/)
  })

  test(`/${name} is silent about the step when the project has no isolation`, () => {
    assert.match(text, /Only when the project has per-spec isolation/)
    assert.match(text, /rather\s+than explaining an absence/)
  })
}

// A hotfix's work starts at its base tag, so the branch view must not be
// described — or relayed — as measured from the base branch.
test('/spec-hotfix says the range is measured from the base tag', () => {
  const text = skillText('spec-hotfix')
  assert.match(text, /measured from the base tag, not from `main`/)
  assert.match(text, /says `since <tag>`/)
  assert.match(text, /do not relay it as `since main`/)
})

// --- stays silent -----------------------------------------------------------

test('the skills that land branches do not gain the step', () => {
  for (const name of ['spec-complete', 'spec-to-main']) {
    // The RENDER invocations only. `/spec-complete` names
    // `review <spec> --drop <code>` before it tears the worktree down, and
    // disowning a pass is not rendering a page — see `renderInvocations`.
    assert.doesNotMatch(
      renderInvocations(name),
      /spec-env review <spec>/,
      `${name} must not render a page — landing a branch is not ending a phase`,
    )
    assert.doesNotMatch(skillText(name), /Want a written review of it before you commit\?/, name)
  }
})

// --- the reader decides the wording, and only the engine decides the reader --

for (const name of RENDERS) {
  const text = skillText(name)

  // THE OFFER STOPPED BRANCHING ON THE READER. It used to: three reader states,
  // three different links, and the engine picking which one the reader could
  // use. That guess failed three separate ways in one day, so the render now
  // prints every tier and the skill relays all of them. The `reader:` line is
  // still the only place the question is answered — it just no longer decides
  // what is offered.
  test(`/${name} relays every tier rather than branching on the reader`, () => {
    assert.match(text, /The `reader:` line no longer decides anything here/)
    assert.match(text, /relay all three tier lines, every time/i)
    assert.match(text, /`local:`, `network:` and `remote:` lines/)
  })

  // The old failure this replaced, kept as the thing that must not come back:
  // a reader who could not open the page being sent off to start a server
  // themselves. Now there is nothing to start — the tier line names the setting
  // that turns its surface on.
  test(`/${name} does not send a reader off to start the server`, () => {
    assert.doesNotMatch(text, /spec-env review serve --host/)
    assert.match(text, /rather than editing them out/)
  })

  // Unknown is what a healthy local machine reports, and a warning there would
  // be an accusation against the common case
  // (`.claude/rules/negative-checks.md`). The warning is gone entirely now —
  // every reader gets the same stack — so what is guarded is that nothing
  // reintroduces a complaint about the detection's answer.
  test(`/${name} says nothing at all about an unknown reader`, () => {
    assert.doesNotMatch(text, /will not open where you are reading/)
    assert.doesNotMatch(text, /unknown is the ordinary state of a local machine/)
    assert.match(text, /the offer does not change with it/)
  })

  // The rule that replaced "wording, never action". Serving and publishing were
  // once one prohibition, and lumping them together is what left a remote reader
  // holding a dead link — a local server is ended by one flag, while a published
  // page is one this tooling cannot remove. The publishing half must stay
  // absolute; only the serving half moved.
  test(`/${name} authorises serving on a detection, and never publishing`, () => {
    assert.match(text, /never publish/i)
    assert.match(text, /cannot remove/)
    assert.doesNotMatch(
      text,
      /\*\*wording, never action\*\*/,
      'the old rule forbade serving too — it is what this spec overturned',
    )
  })
}

// THE regression guard for this phase. Detection lives in the engine precisely
// so it is testable, and the way that gets undone is a well-meaning edit
// teaching a skill to check the environment itself — which no test could then
// reach, and which would drift from the engine's ranking the first time either
// changed.
test('no skill sniffs the environment for the reader', () => {
  const ASSETS_SKILLS = path.join(__dirname, '..', 'assets', 'skills')
  for (const name of fs.readdirSync(ASSETS_SKILLS)) {
    const file = path.join(ASSETS_SKILLS, name, 'SKILL.md')
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    // Naming them as forbidden is the point, so only USE is a failure: a line
    // that says "never read SSH_CONNECTION" must stay legal.
    for (const line of text.split('\n')) {
      if (/\b(SSH_CONNECTION|SSH_TTY|CLAUDE_CODE_[A-Z_]+)\b/.test(line)) {
        assert.match(
          line,
          /\b(not|never|Never)\b/,
          `${name}: mentions an env var outside a prohibition — ${line.trim()}`,
        )
      }
    }
  }
})

test('the config keys are documented where an adopter reads them', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core', 'env.config.md'), 'utf8')
  assert.match(doc, /"reader": "detect"/)
  assert.match(doc, /"servePort"/)
  assert.match(doc, /BELIEVED WITHOUT SNIFFING/)
  assert.match(doc, /unguessable path token/)
})

// THE BANNER IS EARNED BY WAITING — and all three of these now earn it. The
// banner is still not free: a render nobody is held for gets the row, or this
// teaches the reader to scroll past banners, which costs exactly what the
// banner was introduced to buy. What changed is that these three all ask, and
// asking is what obliges the wait.
//
// ARMING IS SEPARATE FROM WAITING, and both are asserted because they are
// different claims. Waiting is what any offer does; arming asserts an
// obligation that outlives the turn, and belongs only to finished work — which
// a green phase, a green bug fix and a green hotfix each are.
test('every skill that renders at the end of its work arms and waits', () => {
  for (const name of RENDERS) {
    const text = skillText(name)
    assert.match(text, /## ⏸ Review ready|`\/spec-next` §5 owns the sequence/, `${name} waits`)
    assert.match(text, /spec-env review arm/, `${name} arms the gate`)
  }
})

// The reason arming is user-visible, said where the person changing it will
// meet it: a commit in that worktree is refused until the verdict or the skip.
test('the two that newly arm say what arming costs the operator', () => {
  for (const name of ['spec-bug', 'spec-hotfix']) {
    const text = skillText(name)
    assert.match(text, /a `git commit` in\s*\n?this worktree is refused/i, name)
    assert.match(text, /review skip "<reason>"/, `${name} names the exit`)
  }
})

// --- the set-level guard ----------------------------------------------------

/**
 * THE GUARD THAT WOULD HAVE CAUGHT THE ORIGINAL GAP, and the reason it is over
 * the SET rather than per skill.
 *
 * `/spec-bug` and `/spec-hotfix` each rendered a page and finished — no arm, no
 * watch, a row asking a question nobody was listening for. Neither was a slip
 * in one file: the contract sanctioned the shape, so a per-skill test would
 * have been written to match whatever each skill happened to do. Discovering
 * the set from disk is what makes a NEW skill that renders and walks away a red
 * test on the day it is written, rather than the day someone notices.
 *
 * WHAT WOULD FOOL THIS: it keys on the render command appearing in the file, so
 * a skill that renders through some other spelling is invisible to it. The
 * failure that produces is a missed skill, never a false accusation — and the
 * roster below is checked against disk, so a skill dropping out of the set is
 * itself caught.
 */

// Skills that mention the render command but are not offering a review, with
// the reason each is exempt. A name may only sit here with a reason.
const NOT_OFFERING = {
  // `/spec-start` is deliberately NOT here. It stands the review server up and
  // renders nothing, so the scan never sees it — and an exemption that grants
  // nothing is dead weight that reads as coverage. The stays-silent test below
  // is what pins that, and it asserts the absence rather than excusing it.
  //
  // It IS the pickup path — it claims a pass someone already sent. Waiting for
  // a pass while holding one is the thing it exists to end.
  'spec-reviewed': 'claims a pass that has already arrived',
}

/**
 * `spec-env review` is four verbs wearing one name, and only one of them
 * renders. Matching the command at large conflated them — a skill that names
 * `review <spec> --drop <code>` to disown a stranded pass was read as a skill
 * that renders a page and then accused of not waiting for a verdict on it.
 *
 * So the sidecar-only invocations are removed before the scan looks. They touch
 * `.spec-env/reviews/` and nothing else: no diff is read, no page is written,
 * and there is nothing for anyone to give a verdict on.
 */
const NOT_A_RENDER = [
  /skitterspec spec-env review waiting[^\n]*/g,
  /skitterspec spec-env review <spec> --drop[^\n]*/g,
  /skitterspec spec-env review <spec> --claim[^\n]*/g,
]

function renderInvocations(name) {
  let text = skillText(name)
  for (const re of NOT_A_RENDER) text = text.replace(re, '')
  return text
}

function rendersAPage(name) {
  return /skitterspec spec-env review </.test(renderInvocations(name))
}

test('every skill that renders a page waits for the verdict, or is exempt with a reason', () => {
  const dir = path.join(ASSETS, 'skills')
  const all = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort()

  const renders = all.filter(rendersAPage)
  assert.ok(renders.length >= 3, `found ${renders.length} rendering skills — the scan is not working`)

  const silent = []
  for (const name of renders) {
    if (name in NOT_OFFERING) continue
    const text = skillText(name)
    const waits =
      /## ⏸ Review ready/.test(text) ||
      /`\/spec-next` §5 owns the sequence/.test(text) ||
      /asking implies waiting/i.test(text)
    if (!waits) silent.push(name)
  }
  assert.deepStrictEqual(
    silent,
    [],
    'a skill that renders a page must wait for the verdict, or be listed in NOT_OFFERING with a reason',
  )
})

// The exemption list is checked against disk, so a name that stops shipping —
// or stops rendering — cannot sit there forever granting nothing.
test('every exemption is still load-bearing', () => {
  for (const [name, why] of Object.entries(NOT_OFFERING)) {
    assert.ok(
      fs.existsSync(path.join(ASSETS, 'skills', name, 'SKILL.md')),
      `${name} is exempted but no longer ships`,
    )
    assert.ok(rendersAPage(name), `${name} is exempted but no longer mentions the render — drop it`)
    assert.ok(why.length > 10, `${name} needs a real reason, not a placeholder`)
  }
})

// STAYS SILENT (`negative-checks.md` rule 3). `/spec-start` stands the review
// server up and renders nothing. It is the healthy-but-unusual input for the
// scan above, and accusing it would make the guard fire at a skill doing
// exactly what it should.
test('stays silent: /spec-start starts the server without owing a verdict', () => {
  const text = skillText('spec-start')
  assert.match(text, /spec-env review serve/, 'it does stand the server up')
  assert.doesNotMatch(text, /skitterspec spec-env review </, 'and it renders no page')
  assert.doesNotMatch(text, /## ⏸ Review ready/, 'so it has no banner and needs none')
})

/* ==========================================================================
 * The button set each render declares
 *
 * `/spec-next` builds a PHASE, so `Commit & Continue` names the phase after it
 * and the default committing set is right — it passes no `--buttons` on
 * purpose. `/spec-bug` and `/spec-hotfix` take a whole fix to green in one
 * pass, so there is no phase after it and the verb names nothing.
 *
 * The page cannot work this out for itself: it dims the button on
 * `data.phases.hasNextPhase === false`, and `readPhases` returns `null` for a
 * folder with no phase files, because that is also a legacy inline-phase
 * layout. So the caller declares it, which is what `buttons` is for.
 * ========================================================================== */

for (const name of ['spec-bug', 'spec-hotfix']) {
  test(`/${name} renders the single-pass button set`, () => {
    const text = skillText(name)
    assert.match(text, /skitterspec spec-env review <spec> --buttons fix/)
    assert.match(text, /Commit & Continue/, 'and says which verb it is dropping')
  })

  test(`/${name} still arms the gate — the set narrows, it does not excuse`, () => {
    // `fix` drops a verb; it does not make the work unfinished. A fix that is
    // green and rendered still owes a verdict, and `commit` is a committing
    // one, so the gate is discharged exactly as before.
    assert.match(skillText(name), /skitterspec spec-env review arm <spec>/)
  })
}

test('/spec-bug keeps the committing set for a fix it split into phases', () => {
  // The conditional half. §5 allows a large root cause to become phase files
  // for `/spec-next` to continue — and there a next phase genuinely exists.
  const text = skillText('spec-bug')
  assert.match(text, /split the fix into phase files, drop the flag/i)
})

test('STAYS SILENT: /spec-next declares no set, and still says why', () => {
  // The default IS the committing set, so passing it would be noise — but the
  // reason has to stay written down, or the next person reads the absence as
  // the oversight this spec just fixed two of.
  const text = skillText('spec-next')
  assert.ok(!/spec-env review <spec> --buttons fix/.test(text), '/spec-next must not take the single-pass set')
  assert.match(text, /`--buttons` is not passed/)
})

test('STAYS SILENT: the landing skills gain no button set either', () => {
  // Same reasoning as the render test above: they do not render a phase page,
  // so there is nothing here for them to declare.
  for (const name of ['spec-complete', 'spec-to-main']) {
    assert.ok(!/--buttons/.test(skillText(name)), `/${name} declares no button set`)
  }
})
