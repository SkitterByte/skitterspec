'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

test('the Linear sync skills ship in the linear package', () => {
  for (const name of ['spec-status', 'spec-push', 'spec-sync', 'spec-linear-setup']) {
    const file = path.join(ASSETS, 'skills', name, 'SKILL.md')
    assert.ok(fs.existsSync(file), `${name}/SKILL.md shipped`)
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, 'utf8'))
    assert.ok(fm, `${name} has YAML frontmatter`)
    const nm = /^name:\s*(.+)$/m.exec(fm[1])
    assert.ok(nm && nm[1].trim() === name, `${name} name matches its folder`)
  }
})

test('the Linear config template + docs ship under assets/core', () => {
  const example = path.join(ASSETS, 'core', 'linear.config.json.example')
  assert.ok(fs.existsSync(example), 'linear.config.json.example shipped')
  assert.ok(fs.existsSync(path.join(ASSETS, 'core', 'linear.config.md')), 'linear.config.md shipped')
  assert.ok(fs.existsSync(path.join(ASSETS, 'core', 'SETUP.md')), 'SETUP.md shipped')
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(example, 'utf8')), 'example is valid JSON')
})

const seamText = (name) => fs.readFileSync(path.join(ASSETS, 'seams', `${name}.md`), 'utf8')

test('the shipped example config matches the loader defaults it documents', () => {
  // The example is copied verbatim into a new project, so a value that has
  // drifted from the default silently opts every new install into old
  // behaviour — `tasks: "none"` would strip the sub-issue checklists.
  const example = JSON.parse(
    fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.json.example'), 'utf8'),
  )
  const { DEFAULT_CONFIG } = require('../src/config.js')
  assert.strictEqual(example.mapping.tasks, DEFAULT_CONFIG.mapping.tasks)
  assert.strictEqual(example.mapping.phases, DEFAULT_CONFIG.mapping.phases)
  assert.strictEqual(example.mapping.specFolder, DEFAULT_CONFIG.mapping.specFolder)
})

test('the spec-tracker-link seam fragment carries the Linear link step', () => {
  const text = seamText('spec-tracker-link')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /sub-issue per phase/i, 'creates a sub-issue per phase')
  assert.match(text, /linear_identifier/, 'the spec ends up carrying the id')
  assert.doesNotMatch(text, /linear_project_id|Create the Project|Milestone per phase/i, 'no stale project/milestone model')
  assert.match(text, /records the base snapshot/i, 'the base is written, so /spec-status starts in-sync')
})

// Linking is the FIRST push, so it must take the same engine path /spec-push
// does. It used to walk the agent through discovering MCP tools and creating the
// issue by hand — drift left behind when /spec-push moved to `spec-sync apply`,
// which meant /spec linked the slow way and re-implemented stamping.
test('linking goes through the engine, not by hand', () => {
  const text = seamText('spec-tracker-link')
  assert.match(text, /spec-sync states/, 'asks the engine for the transport first')
  assert.match(text, /spec-sync push .*--json/, 'gets a plan')
  assert.match(text, /spec-sync apply .*--plan/, 'and applies it')
  assert.doesNotMatch(text, /Discover the Linear MCP tools at runtime/, 'no hand-rolled MCP discovery')
  assert.doesNotMatch(text, /no hand-edited\s*\n?\s*frontmatter/i, 'stamping is not re-explained; apply does it')
})

test('the link fragment keeps the MCP path reachable', () => {
  const text = seamText('spec-tracker-link')
  assert.match(text, /transport = mcp/, 'branches on the mcp answer')
  assert.match(text, /fully supported/, 'and does not read as deprecated')
})

// Injected into /spec, /spec-bug and /spec-hotfix, so it must not assume it is
// describing a feature spec.
test('the link fragment reads for any spec type', () => {
  const text = seamText('spec-tracker-link')
  assert.doesNotMatch(text, /this feature|the feature you/i, 'no feature-only wording')
  assert.doesNotMatch(text, /Phase E/, 'no reference to /spec\'s own phase lettering')
})

test('the spec-go-start seam fragment reflects one-way (no pull)', () => {
  const text = seamText('spec-go-start')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /No pull|nothing to (pull|bring down)/i, 'states there is nothing to pull')
  assert.match(text, /\/spec-push/, 'points at /spec-push to refresh the mirror')
})

// The fragment fires after /spec-go has marked the phase 🔄, and the push writes
// a snapshot the skill does not commit. Saying so is what stops the next reader
// treating a dirty specs/.core/ as someone else's uncommitted work.
test('the spec-go-start seam warns that it leaves specs/.core dirty', () => {
  const text = seamText('spec-go-start')
  assert.match(text, /snapshot/i, 'names what gets written')
  assert.match(text, /does not commit|dirty/i, 'says the skill leaves it uncommitted')
})

// The engine can only put `legacy` on the plan — stopping is the skill's job, and
// the skill is prose. This asserts the instruction exists and sits BEFORE the
// apply step, which is the only ordering that prevents the destructive push.
test('/spec-push halts on a pre-9.0 mirror before applying anything', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /`legacy`/, 'names the plan field it must check')
  assert.match(text, /orphanCount/, 'relays how much would be orphaned')
  assert.match(text, /MIGRATION\.md/, 'points at the guide')
  assert.ok(
    text.indexOf('pre-9.0 mirror') < text.indexOf('## 4. Apply the plan'),
    'the halt comes before the apply step',
  )
})

// SETUP.md is what a project actually reads, and the version someone is coming
// FROM is the one they'll look for. A section that names only the oldest jump is
// one a v9 user scrolls straight past.
test('SETUP.md points every upgrade path at the migration guide', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'SETUP.md'), 'utf8')
  assert.match(text, /Upgrading an existing install/)
  assert.match(text, /MIGRATION\.md/)
  assert.match(text, /From 9\.x/, 'the breaking states gate')
  assert.match(text, /From 8\.x/, 'the mirror remap')
})

// A refusal the agent can only relay is half a fix — the skill has to offer to
// apply it, and has to ask before writing the user's config.
test('/spec-push offers to fix a bad state name, with consent', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /--workspace-states/, 'the states file is passed to push')
  assert.match(text, /refuses to run/, 'says the check is a precondition, not advice')
  assert.match(text, /offer to\s*\n?apply it to `specs\/\.core\/linear\.config\.json`/, 'offers the fix')
  assert.match(text, /[Nn]ever edit their config without asking/, 'and asks first')
})

// The reporter could not tell a deliberate projection from an oversight, because
// nothing wrote down what happens to a phase file's section structure. Whatever
// the behaviour is, the config reference has to state it.
test('linear.config.md states how task sections project', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /section headings/, 'says sections are kept')
  assert.match(text, /before\s*\n?\s*\/\/ any heading appear under `## Tasks`/, 'and what the default is')
})

// Under `mapping.phases: "deferred"` the /spec-go push is not a nicety — it is
// what mints the sub-issues. A seam that still called it optional would leave a
// started spec mirrored as a phase-less issue.
test('the spec-go-start seam makes the push mandatory under BOTH phase modes', () => {
  const text = seamText('spec-go-start')
  assert.match(text, /"deferred"/, 'names the mode')
  assert.match(text, /without asking|do it now/i, 'and says not to treat it as optional')
  assert.ok(
    text.indexOf('"subissue"') < text.indexOf('"deferred"'),
    'keeps the default mode first, so the unchanged behaviour reads first',
  )
  // The defect this fragment was moved to fix: under the DEFAULT mode the push
  // used to be "optional — refresh now or later", so in practice it never ran
  // and every phase sub-issue sat in Backlog for the whole build.
  assert.doesNotMatch(text, /\boptional\b/i, 'the default mode is no longer opt-in')
})

// A second fragment, not a reuse of spec-tracker-sync: that one documents a
// git-mv-then-commit ordering /spec-go, /spec-bug and /spec-hotfix do not have.
test('the spec-tracker-progress seam refreshes without asking and never mints', () => {
  const text = seamText('spec-tracker-progress')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /without asking/i, 'refreshes without a confirmation gate')
  assert.match(text, /Never mint/i, 'an unlinked spec is skipped, not created')
  assert.match(text, /Never fatal/i, 'a failed push does not stop the skill')
  assert.doesNotMatch(text, /Why it sits here/, 'does not inherit spec-tracker-sync prose')
})

test('/spec-push explains a plan whose sub-issues were deferred', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /phasesDeferred/, 'names the plan field')
  assert.match(text, /failed to parse/, 'rules out the alternative reading')
})

test('linear.config.md documents whether and when phases become sub-issues', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /## How phases are mirrored — `mapping.phases`/, 'has its own section')
  assert.match(text, /already carrying a\s*\n?\s*`linear_issue_id`/, 'states that linked phases never defer')
  assert.match(text, /## Phases` index/, 'states the description keeps the index meanwhile')
  // All three modes, both config forms, and the two rules an adopter has to know
  // BEFORE a backfill mints 669 sub-issues it cannot delete.
  for (const mode of ['"subissue"', '"deferred"', '"inline"']) {
    assert.match(text, new RegExp(mode.replace(/"/g, '`?"')), `documents ${mode}`)
  }
  assert.match(text, /omits defaults to `subissue`/, 'states the per-bucket default')
  assert.match(text, /loud error/, 'states that a bad key or mode fails at load')
  assert.match(text, /before\*\* the first backfill push/, 'states the adoption path')
})

test('the push and status skills relay the resolved phase mode', () => {
  // The engine prints it and the plan carries it, but the skill is what the user
  // actually reads. Under `inline` a plan with zero sub-issue creates is the
  // expected shape, and a skill that did not say so would report it as nothing
  // to do — or as a parse failure.
  const push = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(push, /`phaseMode`/, 'names the plan field')
  assert.match(push, /inline/, 'covers the mode that mints nothing')
  assert.match(push, /already carries an id keeps its sub-issue/, 'and the mixed case')

  const status = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-status', 'SKILL.md'), 'utf8')
  assert.match(status, /phases: <mode>/, 'names the line it must relay')
  assert.match(status, /inline/)
})

// A corrupted push must be caught BEFORE the snapshot records it as good —
// afterwards the next push produces an empty plan and the damage is permanent
// until someone edits the spec.
test('/spec-push verifies the round-trip before stamping', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /spec-sync verify/, 'names the command')
  assert.match(text, /not a pull/i, 'rules out the one-way reading')
  assert.ok(
    text.indexOf('spec-sync verify') < text.indexOf('## 5. Stamp the ids'),
    'the check sits before the stamp',
  )
})

test('linear.config.md documents both fidelity safeguards', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /Nested tables are reshaped/, 'the pre-send transform')
  assert.match(text, /round-trip is verified/, 'the post-push check')
  assert.match(text, /spec files are not modified/i, 'the no-disk-write promise')
})

// The skill and the CLI have to agree about the transport, or the skill will do
// MCP work on a path that makes no MCP calls — the exact waste this exists to
// remove. These pin the contract between them.
test('/spec-push asks the engine for the transport before doing MCP work', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /spec-sync states/, 'names the command that decides')
  assert.ok(
    text.indexOf('spec-sync states') < text.indexOf('discover the issue'),
    'the transport is settled before any tool discovery',
  )
  assert.match(text, /transport = api/, 'branches on the api answer')
  assert.match(text, /transport = mcp/, 'and on the mcp answer')
})

test('/spec-push applies via the engine on the api path', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /spec-sync apply <spec> --plan/, 'names the command')
  assert.ok(text.indexOf('spec-sync apply') < text.indexOf('## 4a.'), 'before the manual path')
  assert.match(text, /re-run the same command/, 'says an interrupted run is repeatable')
})

// The MCP path is not deprecated — someone whose only Linear access is their MCP
// session must still find a complete set of instructions.
test('/spec-push keeps the full MCP path as a documented fallback', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  for (const step of ['## 4a.', '## 4b.', '## 5.']) {
    assert.match(text, new RegExp(step.replace(/[.]/g, '\\.')), `${step} survives`)
  }
  assert.match(text, /save_issue/, 'the MCP calls are still spelled out')
  assert.match(text, /--via mcp/, 'and can be forced')
})

test('linear.config.md documents the key variable without ever holding a key', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /auth\.keyEnv/, 'the field')
  assert.match(text, /names the \*\*variable, never the key\*\*/, 'and that it is a name, not a secret')
  assert.match(text, /apply\.transport/, 'the transport default')
  assert.match(text, /never mints a second copy/, 'the resumability promise')
})

test('the example config ships the new blocks so they are discoverable', () => {
  const example = JSON.parse(fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.json.example'), 'utf8'))
  assert.strictEqual(example.auth.keyEnv, 'LINEAR_API_KEY')
  assert.strictEqual(example.apply.transport, '', 'empty = decide per run, the safe default')
})

// --- the lifecycle sync fragment ---------------------------------------------

// This fragment is what closes the "someone has to remember to push" gap, so the
// three rules that make it safe to run unprompted have to be stated in it — an
// agent reading only this text must not have to infer them.
test('the sync fragment states the three rules that make it safe unprompted', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'seams', 'spec-tracker-sync.md'), 'utf8')
  assert.match(text, /without asking/, 'it pushes rather than offering')
  assert.match(text, /linear_identifier/, 'gated on the spec being linked')
  assert.match(text, /Never mint/, 'an unlinked spec is skipped, not created')
  assert.match(text, /Never fatal/, 'a failed push does not block the operation')
  assert.match(text, /finish the operation anyway/i, 'and says so explicitly')
})

test('the sync fragment explains why its position matters', () => {
  // The placement is asserted in packages/common; this asserts the REASON travels
  // with the fragment, so anyone moving a marker meets the constraint first.
  const text = fs.readFileSync(path.join(ASSETS, 'seams', 'spec-tracker-sync.md'), 'utf8')
  assert.match(text, /after the `git mv` and before the commit/i)
  assert.match(text, /folder bucket/, 'why after the move')
  assert.match(text, /integrate/, 'why before the commit')
})

test('the sync fragment points at the cheap transport rather than assuming it', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'seams', 'spec-tracker-sync.md'), 'utf8')
  assert.match(text, /apply\.transport|API key/, 'says why an automatic push is affordable')
})

// --- intake, now shared by three skills --------------------------------------

// One fragment for /spec, /spec-bug and /spec-hotfix — forking a hotfix copy
// would be two texts to drift apart, which is how the link fragment went stale.
test('the intake fragment serves all three creating skills', () => {
  const text = seamText('spec-tracker-intake')
  for (const skill of ['/spec`', '/spec-bug`', '/spec-hotfix`']) {
    assert.ok(text.includes(skill), `names ${skill}`)
  }
  assert.match(text, /`\/spec-hotfix` in its step 5/, 'says when it runs for a hotfix')
})

test('intake seeds Symptom for a bug or hotfix, not just Problem', () => {
  // A report belongs under Symptom in those templates; sending it to Problem
  // would put the reporter's words in a section the template does not have.
  const text = seamText('spec-tracker-intake')
  assert.match(text, /\*\*Symptom\*\* in a bug or hotfix spec/)
})

test('intake tells a hotfix to mine the issue for a version, as a suggestion', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /mine the issue for a version/i)
  assert.match(text, /never used as a default/i, 'not a default')
  assert.match(text, /not what is deployed/, 'and says why')
})

// The two routing mistakes are not equally costly, so the precedence is a
// decision the fragment has to state rather than an accident of ordering.
test('intake routes production issues to /spec-hotfix, ahead of bug routing', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /intake\.hotfixLabels/, 'names the config key')
  assert.match(text, /\/spec-hotfix <ISSUE-REF>/, 'hands off to the hotfix skill')
  assert.match(text, /checking `hotfixLabels` first/, 'the order is explicit')
  assert.match(text, /Hotfix wins when an issue carries both/, 'and stated as a rule')
  assert.ok(
    text.indexOf('intake.hotfixLabels') < text.indexOf('intake.bugLabels'),
    'hotfix is checked before bug in the text an agent reads top-down',
  )
})

test('the fragment says why hotfix wins, not just that it does', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /never\s+reaches the running version/, 'the expensive direction')
  assert.match(text, /merely wasteful/, 'and the cheap one')
})

test('unset label lists leave intake behaving exactly as before', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /With a list unset, nothing routes through it/)
  assert.match(text, /both unset every issue is\s*\n?\s*treated as a feature request/)
})

// --- adoption prose, after the link seam started pushing at creation ---------

// feat-lifecycle-tracker-sync made linking apply immediately, so an adopted
// issue's description is replaced THEN, not on a later manual push. The old
// wording promised otherwise, on the one point a reporter cares about.
test('the fragment says the overwrite happens at creation, not on a later push', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /linking push/i, 'names what actually overwrites')
  assert.match(text, /not on some later manual push/, 'and rules out the old reading')
  assert.doesNotMatch(text, /the first `\/spec-push` will\s*\n?\s*overwrite/, 'stale promise gone')
})

test('the fragment still forbids a base sidecar, and says why', () => {
  // Load-bearing: an empty base is what makes the adopting push an UPDATE over
  // the reporter's text rather than a no-op that declares the mirror in sync.
  const text = seamText('spec-tracker-intake')
  assert.match(text, /Do not write a base sidecar/)
  assert.match(text, /declare the mirror already in sync/, 'the failure it prevents')
})

test('the fragment says where the reporter words survive, for either template', () => {
  const text = seamText('spec-tracker-intake')
  assert.match(text, /\*\*Problem\*\* \(or \*\*Symptom\*\*\)/, 'both section names')
  assert.match(text, /Linear\s*\n?\s*keeps the original/, 'and that Linear keeps the original')
})

// --- hotfixLabels is documented where someone would look for it -------------

test('the example config ships hotfixLabels beside bugLabels', () => {
  const example = JSON.parse(fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.json.example'), 'utf8'))
  assert.deepEqual(example.intake.hotfixLabels, [], 'present and empty — nothing routes by default')
  assert.ok('bugLabels' in example.intake, 'and still beside the one it mirrors')
})

test('linear.config.md documents the routing and its precedence', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /intake\.hotfixLabels/, 'the key')
  assert.match(text, /hotfixLabels` wins when an issue carries both/i, 'the precedence')
  assert.match(text, /never reaches the running version/, 'and why it is that way round')
  assert.match(text, /`\/spec-bug` still checks `hotfixLabels`/, 'the escalation rule')
})

test('linear.config.md shows starting a hotfix from an issue', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /\/spec-hotfix v33\.16\.4 SKI-123/, 'the invocation')
  assert.match(text, /never used as a default/, 'and that the version is only a suggestion')
})

// ---------------------------------------------------------------------------
// /spec-linear-setup — configure by interview rather than by hand
// ---------------------------------------------------------------------------

// The skill source is hard-wrapped, so any prose assertion has to be
// whitespace-insensitive — otherwise a re-wrap breaks a test that has nothing
// to do with the change.
const setupSkill = () =>
  fs
    .readFileSync(path.join(ASSETS, 'skills', 'spec-linear-setup', 'SKILL.md'), 'utf8')
    .replace(/\s+/g, ' ')

test('/spec-linear-setup is discovered by the skill list, and is provider-only', () => {
  // `listSkills()` finds any assets/skills/<name>/SKILL.md — no registration.
  // This asserts the contract it relies on, and that the tracker-free base
  // ships no tracker setup skill.
  const discovered = fs
    .readdirSync(path.join(ASSETS, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ASSETS, 'skills', e.name, 'SKILL.md')))
    .map((e) => e.name)
  assert.ok(discovered.includes('spec-linear-setup'), 'the provider ships it')

  const { SKILLS } = require('@skitterbyte/skitterspec-common/src/init.js')
  assert.ok(!SKILLS.includes('spec-linear-setup'), 'the base ships none')
})

test('/spec-linear-setup discovers the workspace before it asks anything', () => {
  const text = setupSkill()
  // The whole point: offer real lists, never prompt for a raw id.
  for (const tool of ['list_teams', 'list_projects', 'list_issue_labels', 'list_issue_statuses']) {
    assert.ok(text.includes(tool), `names the ${tool} discovery tool`)
  }
  assert.match(text, /never prompts for a raw id/i)
})

test('/spec-linear-setup interviews the structure, not just the fields', () => {
  // Decision 2 — the gap was that nothing asked how the work is organised.
  const text = setupSkill()
  assert.match(text, /by team, or by project/i, 'asks how products map to the workspace')
  assert.match(text, /Team per product/i, 'offers the team-per-product shape')
  assert.match(text, /Project per product/i, 'and the project-per-product shape')
  assert.match(text, /Recommend/, 'recommends an answer, as the other spec skills do')
})

test('/spec-linear-setup says a config pins ONE team for the repo', () => {
  // With several teams the choice is which product this repo holds — a fact
  // the operator cannot infer from a list of team names.
  const text = setupSkill()
  assert.match(text, /pins exactly one team for the whole repo/i)
  assert.match(text, /Several teams/, 'handles the many-team case')
  assert.match(text, /One team/, 'and the single-team case')
  assert.match(text, /spans two teams/, 'and says plainly when sync cannot express the split')
})

test('/spec-linear-setup writes through the engine, never by hand', () => {
  const text = setupSkill()
  assert.match(text, /spec-sync init-config/, 'hands the values to the engine')
  assert.match(text, /--states/, 'and passes the discovered state names for validation')
  assert.doesNotMatch(text, /write the JSON yourself|compose the config/i, 'never composes JSON')
  assert.match(text, /--force/, 'knows the overwrite flag')
})

test('/spec-linear-setup validates the state names and relays the fix', () => {
  const text = setupSkill()
  assert.match(text, /silently ignores an unknown issue state/i, 'says why it matters')
  assert.match(text, /--state complete="Shipped"/, 'shows the fixing flag')
  assert.match(text, /never apply one they didn't agree to/i, 'a suggestion still needs consent')
})

test('/spec-linear-setup degrades rather than half-writing a config', () => {
  // Matches the project picker's rule; and the file existing is what switches
  // every other command on, so a partial write is worse than no write.
  const text = setupSkill()
  assert.match(text, /Degrade, never block/i)
  assert.match(text, /SETUP\.md/, 'points at the manual path')
  assert.match(text, /stop without writing anything/i)
})

test('/spec-linear-setup reviews an existing config instead of overwriting it', () => {
  const text = setupSkill()
  assert.match(text, /default to \*\*reviewing\*\* it, not replacing it/i)
  assert.match(text, /Only write when the user asks for it/i)
})

test('/spec-linear-setup names no specific workspace, product or team', () => {
  // It ships to every consumer: the interview asks how THIS workspace is
  // organised; it must not assume a shape or leak the author's own.
  const text = setupSkill()
  assert.doesNotMatch(text, /e07c2b54|SKI2/, 'no real ids or team keys')
})

// ---------------------------------------------------------------------------
// Phase 3 — the skill is the documented path, the manual one still works
// ---------------------------------------------------------------------------

const flat = (rel) => fs.readFileSync(path.join(ASSETS, 'core', rel), 'utf8').replace(/\s+/g, ' ')

test('SETUP.md leads with the skill', () => {
  const text = flat('SETUP.md')
  assert.match(text, /## 3\. Configure — run `\/spec-linear-setup`/, 'step 3 is the skill')
  assert.match(text, /discovers your workspace/i)
  // Ordering matters: the skill has to come before the manual walkthrough, or
  // "recommended path" is just a claim.
  assert.ok(
    text.indexOf('/spec-linear-setup') < text.indexOf('Configure by hand'),
    'the skill is offered before the by-hand path',
  )
})

test('the skill points at a heading SETUP.md actually has', () => {
  // The degrade path is only useful if its pointer resolves.
  const heading = /## 4\. Configure by hand/
  assert.match(flat('SETUP.md'), heading)
  assert.match(setupSkill(), /`SETUP\.md` \("Configure by hand"\)/)
})

test('SETUP.md still documents the manual path, both ways', () => {
  // Decision 4 — the CLI is usable without Claude Code. A setup story that only
  // works inside one client would make the package quietly client-locked.
  const text = flat('SETUP.md')
  assert.match(text, /## 4\. Configure by hand/, 'the fallback survives')
  assert.match(text, /not the only one/i, 'and does not read as deprecated')
  assert.match(text, /spec-sync init-config/, 'the engine is runnable directly')
  assert.match(text, /linear\.config\.json\.example/, 'and the copy-the-example path remains')
  assert.match(text, /List my Linear teams with their ids/, 'finding the team id is still documented')
})

test('SETUP.md says what setup validates, and what a rename would cost', () => {
  const text = flat('SETUP.md')
  assert.match(text, /What setup validates/i)
  assert.match(text, /silently ignores an issue state it doesn't recognise/i, 'the failure mode')
  assert.match(text, /never moves/i, 'and its symptom')
  assert.match(text, /--state complete="Shipped"/, 'and the fix it prints')
  assert.match(text, /Editing by hand skips the state-name check/i, 'the by-hand tradeoff is named')
})

test('linear.config.md records the one-team-per-repo limit', () => {
  const text = flat('linear.config.md')
  assert.match(text, /One team per repo/i)
  assert.match(text, /every spec in a repo files into the same Linear team/i)
  assert.match(text, /split the specs across two checkouts/i, 'and says what to do instead')
})

test('linear.config.md records the initiative limit with its follow-on hook named', () => {
  // Scoped out deliberately (Decision 5). Naming the hook is what stops the
  // next person re-deriving where the filter would go.
  const text = flat('linear.config.md')
  assert.match(text, /Initiatives are not used for placement/i)
  assert.match(text, /list_projects` accepts an `initiative` filter/, 'the hook')
  assert.match(text, /listProjects/, 'and where it would be sent from')
})

test("init points at a provider's setup skill without naming any tracker", () => {
  // The base discovers `spec-<provider>-setup` from what was actually
  // installed, so the superset gets the line and the tracker-free base prints
  // nothing — with no mention of Linear in the code that composes it.
  // (`PROTECTED_CONFIG` elsewhere in the file names linear.config.json on
  // purpose: it is a don't-delete list, not knowledge of a tracker.)
  const initSrc = fs.readFileSync(
    require.resolve('@skitterbyte/skitterspec-common/src/init.js'),
    'utf8',
  )
  const from = initSrc.indexOf('const setupSkill = SKILLS.find')
  assert.ok(from !== -1, 'the setup skill is discovered')
  const block = initSrc.slice(from, initSrc.indexOf('async function init('))

  assert.match(block, /\^spec-\.\+-setup\$/, 'discovers the setup skill by shape')
  assert.match(block, /Tracker sync is opt-in/, 'and prints a next step when one is installed')
  assert.doesNotMatch(block, /linear/i, 'the output names no tracker')
})

// The setup skill must CHECK the key, never collect it. Prose is what a model
// acts on, so this rule only holds if it is pinned the same way the base's
// tracker-free skills are — an instruction nobody asserts on is an instruction
// that quietly erodes.
test('the setup skill checks readiness and never asks for the key', () => {
  const skill = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'skills', 'spec-linear-setup', 'SKILL.md'),
    'utf-8',
  )
  assert.match(skill, /credentials status/, 'runs the readiness check')
  assert.match(skill, /credentials set/, 'names the command the user runs')
  assert.match(skill, /themselves, in their own\s+terminal/, 'says who runs it')
  assert.match(skill, /Do not ask the user to paste an API key/, 'states the prohibition')
  assert.match(skill, /transcript/, 'and why — the reason is what makes it stick')
})

// --- /spec-sync: the repo-wide operations ------------------------------------
//
// The motivating friction was a user typing `spec-sync` and getting
// `command not found` — the binary is a local devDependency and never on PATH.
// A skill that prints a bare `spec-sync …` recreates exactly that.

const specSync = () => fs.readFileSync(path.join(ASSETS, 'skills', 'spec-sync', 'SKILL.md'), 'utf8')

test('/spec-sync always states the full invocation, never a bare command', () => {
  const text = specSync()
  assert.match(text, /pnpm exec skitterspec-linear spec-sync/, 'shows the runnable invocation')
  assert.match(text, /never on `?PATH`?/i, 'says why the bare command fails')
  for (const line of text.split('\n')) {
    assert.ok(
      !/^\s*(\$\s*)?spec-sync\s+\w/.test(line),
      `no bare "spec-sync …" the user could copy: ${line.trim()}`,
    )
  }
})

test('/spec-sync defers per-spec work rather than duplicating it', () => {
  const text = specSync()
  assert.match(text, /\/spec-push/, 'hands single-spec push to /spec-push')
  assert.match(text, /\/spec-status/, 'hands per-spec drift to /spec-status')
  assert.match(text, /duplicate|two front doors/i, 'says why it defers')
})

test('/spec-sync answers a bare invocation with the repo-wide overview', () => {
  assert.match(specSync(), /no argument[\s\S]{0,80}linked/i, 'bare ask routes to `linked`')
})

test('/spec-sync splits creates from updates before a bulk apply', () => {
  const text = specSync()
  const all = text.slice(text.indexOf('apply --all'))
  assert.match(all, /confirm/i, 'bulk apply is confirmed first')
  assert.match(all, /create/i)
  assert.match(all, /update/i)
  assert.match(all, /new (issues|objects)/i, 'says a create makes new objects in the tracker')
})

test('/spec-sync warns off the snapshot footgun in verify', () => {
  const text = specSync()
  assert.match(text, /\.base\.json/, 'names the file that must not be passed')
  assert.match(text, /hash/i, 'says why — it stores hashes, not descriptions')
})

// --- the docs must name commands that exist ----------------------------------
//
// `spec-sync doctor` was renamed to `retarget` and NOTHING failed: the skill
// went on documenting a command the CLI no longer had. These pin the pointers
// that make the verb discoverable, and the routing table to real verbs.

const { PROVIDER_COMMANDS } = require('../src/commands.js')

test('every spec-sync verb the skill routes to is a real subcommand', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-sync', 'SKILL.md'), 'utf8')
  const usage = String(PROVIDER_COMMANDS['spec-sync'].usage)
  assert.ok(usage, 'spec-sync is a provider command')
  // The routing table's right-hand cell may hold several verbs, or a verb with
  // its arguments (`verify <spec> --stored <file>`), so take the leading word of
  // every backticked span in it. Rows that route nowhere (`**defer**`) have none.
  const rows = [...text.matchAll(/^\|(?!\s*-+)[^\n]*\|([^|\n]*)\|\s*$/gm)].map((m) => m[1])
  const routed = [
    ...new Set(
      rows
        .flatMap((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim().split(/\s+/)[0]))
        .filter((v) => /^[a-z][a-z-]*$/.test(v)),
    ),
  ]
  assert.ok(routed.length >= 6, `found the routing table, got ${JSON.stringify(routed)}`)
  const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli-sync.js'), 'utf8')
  for (const verb of routed) {
    assert.match(cli, new RegExp(`case '${verb}':`), `/spec-sync routes to \`${verb}\`, which cli-sync must dispatch`)
  }
})

test('the retarget verb is discoverable from spec-status and the config doc', () => {
  const status = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-status', 'SKILL.md'), 'utf8')
  assert.match(status, /spec-sync retarget/, 'a key mismatch points at the verb that fixes it')
  assert.match(status, /no Linear issue found/, 'and says what the failure looks like')

  const doc = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(doc, /## Renaming a team/)
  assert.match(doc, /spec-sync retarget --yes/)
  assert.match(doc, /teamKey/, 'and explains why teamKey is worth setting')
})

test('every spec-sync verb named in a shipped asset is a real subcommand', () => {
  // Supersedes an earlier guard that banned the specific string `spec-sync
  // doctor` after that verb was removed. It caught the drift it was written for,
  // then blocked `doctor` being legitimately reintroduced as a different command.
  // Checking against the dispatch instead is self-maintaining: it catches a verb
  // that stops existing, and permits one that starts.
  const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli-sync.js'), 'utf8')
  const dispatched = new Set([
    ...[...cli.matchAll(/case '([a-z][a-z-]*)':/g)].map((m) => m[1]),
    ...[...cli.matchAll(/sub === '([a-z][a-z-]*)'/g)].map((m) => m[1]),
  ])
  assert.ok(dispatched.size > 5, `found the dispatch, got ${JSON.stringify([...dispatched])}`)

  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])

  for (const file of walk(ASSETS)) {
    const text = fs.readFileSync(file, 'utf8')
    // Anchored to the real invocation (`skitterspec[-linear] spec-sync <verb>`),
    // so prose like "the repo-wide spec-sync operations" is not read as a verb.
    for (const m of text.matchAll(/skitterspec(?:-linear)? spec-sync ([a-z][a-z-]+)/g)) {
      const verb = m[1]
      assert.ok(
        dispatched.has(verb),
        `${path.relative(ASSETS, file)} names \`spec-sync ${verb}\`, which cli-sync does not dispatch`,
      )
    }
  }
})

// --- the cross-transport check is only real if the skill runs it --------------

test('the setup skill reads the workspace and hands it to doctor', () => {
  // `doctor --mcp` can only catch a mismatch if something produces the file. The
  // engine never speaks MCP, so this step in the skill IS the MCP half of the
  // check — dropped from the skill, the row silently reports `skipped` forever
  // and nothing looks wrong.
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-linear-setup', 'SKILL.md'), 'utf8')
  assert.match(text, /get_workspace/, 'it reads which workspace the MCP server is on')
  assert.match(text, /doctor --mcp/, 'and hands the facts to doctor')
  // Decision 4: a mismatch is reported, never resolved by rewriting the config.
  assert.match(text, /do not rewrite the config/i, 'it refuses to pick a winner')
})

test('the config doc states what doctor reports for each projectId case', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /`missing`/, 'an unset project is a declined opt-in')
  assert.match(text, /file out of the team|resolves elsewhere/, 'and a foreign one is broken')
})

// --- the commit-trailer rule -------------------------------------------------
//
// Shipped by the provider, never by the tracker-free base. `build-dist.js` has
// to overlay `assets/rules` for that to happen — it originally overlaid only
// `skills` and `core`, so the rule silently never reached the distribution.

test('the commit-trailer rule ships in the linear package', () => {
  const file = path.join(ASSETS, 'rules', 'commit-trailers.md')
  assert.ok(fs.existsSync(file), 'commit-trailers.md shipped')
  const text = fs.readFileSync(file, 'utf8')
  assert.match(text, /Refs:/, 'names the trailer key')
  assert.match(text, /spec-sync ref/, 'says where the value comes from')
})

test('the rule forbids Linear magic words, and says why', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'rules', 'commit-trailers.md'), 'utf8')
  for (const word of ['Fixes', 'Closes', 'Resolves']) {
    assert.match(text, new RegExp(`\\b${word}\\b`), `names ${word} as forbidden`)
  }
  assert.match(text, /released/i, 'explains that a ticket moves on release, not merge')
})

test('the rule says to omit the trailer rather than invent one', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'rules', 'commit-trailers.md'), 'utf8')
  assert.match(text, /omit the trailer/i)
  assert.match(text, /Refs: none/, 'and rules out the fake-value escape hatch by name')
})

test('the CI wiring guide ships, and points at commands that exist', () => {
  const file = path.join(ASSETS, 'core', 'ci-stages.md')
  assert.ok(fs.existsSync(file), 'ci-stages.md shipped')
  const text = fs.readFileSync(file, 'utf8')
  // Every `spec-sync <verb>` the page instructs someone to run must be a verb
  // the CLI dispatches. A page confidently naming a renamed command is worse
  // than no page — see scripts/docs-claims.test.js for the same rule on the site.
  const cli = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli-sync.js'), 'utf8')
  // Two dispatch shapes: the switch, and the handful checked BEFORE the config
  // load (`init-config`, `doctor`) so they can report a malformed config.
  const verbs = new Set([
    ...[...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]),
    ...[...cli.matchAll(/sub === '([a-z-]+)'/g)].map((m) => m[1]),
  ])
  const named = new Set([...text.matchAll(/spec-sync ([a-z-]+)/g)].map((m) => m[1]))
  for (const verb of named) {
    assert.ok(verbs.has(verb), `ci-stages.md names "spec-sync ${verb}", which the CLI does not dispatch`)
  }
  assert.ok(named.has('stage'), 'the page is about the stage verb')
  // The env var it tells people to set must be the one the loader reads.
  const { DEFAULT_KEY_ENV } = require('../src/config.js')
  assert.match(text, new RegExp(DEFAULT_KEY_ENV))
})
