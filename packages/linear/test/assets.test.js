'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const ASSETS = path.join(__dirname, '..', 'assets')

test('the Linear sync skills ship in the linear package', () => {
  for (const name of ['spec-status', 'spec-push']) {
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

test('the spec-go-pull seam fragment reflects one-way (no pull)', () => {
  const text = seamText('spec-go-pull')
  assert.match(text, /linear\.config\.json/, 'gate references linear.config.json')
  assert.match(text, /No pull|nothing to (pull|bring down)/i, 'states there is nothing to pull')
  assert.match(text, /\/spec-push/, 'points at /spec-push to refresh the mirror')
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
test('the spec-go-pull seam makes the push mandatory under deferred phases', () => {
  const text = seamText('spec-go-pull')
  assert.match(text, /"deferred"/, 'names the mode')
  assert.match(text, /without asking|do it now/i, 'and says not to treat it as optional')
  assert.ok(
    text.indexOf('"subissue"') < text.indexOf('"deferred"'),
    'keeps the default mode first, so the unchanged behaviour reads first',
  )
})

test('/spec-push explains a plan whose sub-issues were deferred', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'skills', 'spec-push', 'SKILL.md'), 'utf8')
  assert.match(text, /phasesDeferred/, 'names the plan field')
  assert.match(text, /failed to parse/, 'rules out the alternative reading')
})

test('linear.config.md documents when phases become sub-issues', () => {
  const text = fs.readFileSync(path.join(ASSETS, 'core', 'linear.config.md'), 'utf8')
  assert.match(text, /## Deferring sub-issues until a spec starts/, 'has its own section')
  assert.match(text, /already carrying a\s*\n?\s*`linear_issue_id`/, 'states that linked phases never defer')
  assert.match(text, /## Phases` index/, 'states the description keeps the index meanwhile')
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
