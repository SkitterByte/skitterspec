'use strict'

// Both workflows carry settings that are load-bearing rather than cosmetic, and
// every one of them is invisible on a green run:
//
// 1. The matrix floor must equal `engines.node`. The floor is >= 22.13 because
//    22 (Jod) is the oldest Node line still receiving fixes, and because this
//    repo's suite cannot run without an install — a bare checkout discovers 1825
//    tests of 2362 and fails 41. A manifest floor nobody tests is a promise
//    nobody is keeping, which is the state this repo was in at `>=18`.
//
//    It was originally justified by pnpm 11.11 requiring >= 22.13. pnpm 12 is a
//    native binary that runs on no Node at all and declares `>=18.*`, so that
//    reason is gone and the two above are what hold the floor up. Do not lower
//    it on the grounds that pnpm no longer asks for it — see
//    feat-toolchain-pnpm-12.
//
// 2. No `registry-url` on `actions/setup-node`, in EITHER workflow. It writes an
//    `.npmrc` carrying an `_authToken`; with no token that resolves empty, npm
//    decides the registry is token-authenticated, never performs the OIDC
//    exchange, and the anonymous PUT comes back 404 — npm returns 404 rather
//    than 403 so it does not leak whether a package exists. release.yml is where
//    that costs a failed publish; ci.yml is guarded too so the option cannot be
//    copied across from a file where it looked harmless.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const { manifestEngines, floorOf, cmpVersion, lowest } = require('./lib/engines.js')

const ROOT = path.join(__dirname, '..')
const WORKFLOWS = path.join(ROOT, '.github', 'workflows')

// --- pure helpers -----------------------------------------------------------

/**
 * Drop comment lines before looking for configuration.
 *
 * WHAT WOULD MAKE A NAIVE CHECK LIE: this workflow *documents* why it omits
 * `registry-url`, so the string is present in the file while the setting is
 * not. A grep would fail the very file that got it right — an accusation
 * produced by the explanation of the correct behaviour.
 */
function withoutComments(yaml) {
  return yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

/** True when the workflow actually SETS registry-url, comments aside. */
function setsRegistryUrl(yaml) {
  return /^\s*registry-url\s*:/m.test(withoutComments(yaml))
}

/** The quoted node versions in a `node:` matrix list, in file order. */
function matrixNodeVersions(yaml) {
  const m = /^\s*node:\s*\[([^\]]*)\]/m.exec(withoutComments(yaml))
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

/**
 * The block under one trigger of `on:` (e.g. `push`), or null when that
 * trigger is absent. A bare `push:` yields an empty string — present, with no
 * filter, which is exactly the shape that fires on tags.
 */
function triggerBlock(yaml, event) {
  const lines = withoutComments(yaml).split('\n')
  const on = lines.findIndex((l) => /^on:\s*$/.test(l))
  if (on === -1) return null
  const start = lines.findIndex((l, i) => i > on && new RegExp(`^ {2}${event}:\\s*$`).test(l))
  if (start === -1) return null
  const body = []
  for (const l of lines.slice(start + 1)) {
    if (!/^ {4}/.test(l)) break
    body.push(l)
  }
  return body.join('\n')
}

/**
 * True when a `push` trigger is limited to branches. GitHub runs a push
 * workflow for tags unless it names `branches` without `tags`: naming only one
 * of the two filters leaves the other kind of ref out.
 */
function pushSkipsTags(yaml) {
  const push = triggerBlock(yaml, 'push')
  if (push === null) return true
  return /^\s*branches\s*:/m.test(push) && !/^\s*tags(-ignore)?\s*:/m.test(push)
}

// --- the real corpus --------------------------------------------------------

test('every manifest declares the same node floor', () => {
  const engines = manifestEngines()
  const floors = new Set(engines.map(([, node]) => node))
  assert.strictEqual(
    floors.size,
    1,
    `manifests disagree about engines.node:\n  ${engines.map(([r, n]) => `${r}: ${n}`).join('\n  ')}`,
  )
})

test('ci.yml tests the floor the manifests declare', () => {
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  const declared = floorOf(manifestEngines()[0][1])
  assert.ok(declared, 'engines.node is not a plain ">=x.y" range')

  const versions = matrixNodeVersions(yaml)
  assert.ok(versions.length > 0, 'ci.yml has no node matrix')
  assert.strictEqual(
    lowest(versions),
    declared,
    `ci.yml's lowest node is ${lowest(versions)}, but engines.node declares ${declared}`,
  )
})

test('ci.yml does not set registry-url', () => {
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  assert.strictEqual(setsRegistryUrl(yaml), false)
})

test('ci.yml does not run on tags', () => {
  // release.yml owns a tag: it gates the stage on Windows and Ubuntu, so CI on
  // the same tag re-tests code main's push already tested (chore-release-ci-test-dedup).
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  assert.strictEqual(pushSkipsTags(yaml), true)
})

// --- the checks fire --------------------------------------------------------

test('a bare push trigger, which fires on tags, is caught', () => {
  assert.strictEqual(pushSkipsTags('on:\n  push:\n  pull_request:\n'), false)
})

test('a push trigger that also names tags is caught', () => {
  assert.strictEqual(pushSkipsTags("on:\n  push:\n    branches: ['**']\n    tags: ['v*']\n"), false)
})

test('a workflow that really sets registry-url is caught', () => {
  assert.strictEqual(
    setsRegistryUrl('      - uses: actions/setup-node@v7\n        with:\n          registry-url: https://registry.npmjs.org\n'),
    true,
  )
})

test('a drifted matrix floor is caught', () => {
  const yaml = "      matrix:\n        node: ['20', '24']\n"
  assert.notStrictEqual(lowest(matrixNodeVersions(yaml)), '22.13')
})

// --- the checks stay silent -------------------------------------------------

test('a comment mentioning registry-url is not an accusation', () => {
  // The healthy-but-unusual input: ci.yml explains WHY it omits the option, so
  // the string is in the file and the setting is not. A grep-based check would
  // fail the correct file (`.claude/rules/negative-checks.md` rule 3).
  const yaml = '# NOTE: setup-node is used WITHOUT `registry-url` — see release.yml.\n      - uses: actions/setup-node@v7\n'
  assert.strictEqual(setsRegistryUrl(yaml), false)
})

test('an unfiltered pull_request trigger is not an accusation', () => {
  // Pull requests never carry a tag ref, so only `push` is held to the filter.
  assert.strictEqual(pushSkipsTags("on:\n  push:\n    branches: ['**']\n  pull_request:\n"), true)
})

test('a workflow with no push trigger is not an accusation', () => {
  assert.strictEqual(pushSkipsTags('on:\n  workflow_dispatch:\n'), true)
})

test('an unparseable engines range yields no floor, rather than a wrong one', () => {
  assert.strictEqual(floorOf('^22.13'), null)
  assert.strictEqual(floorOf(''), null)
  assert.strictEqual(floorOf(undefined), null)
})

test('versions sort numerically, not lexically', () => {
  // '9' beats '22.13' under a string sort, which would pick the wrong floor.
  assert.strictEqual(lowest(['24', '22.13']), '22.13')
  assert.strictEqual(lowest(['22.13', '9']), '9')
})

// --- release.yml ------------------------------------------------------------
//
// Each assertion below stands for one failed publish. They are text assertions
// rather than a YAML parse on purpose: the repo has no YAML dependency, and the
// failures being guarded are all the presence or absence of one setting.

const RELEASE = () => fs.readFileSync(path.join(WORKFLOWS, 'release.yml'), 'utf8')

test('release.yml does not set registry-url', () => {
  // The 404. npm finds an empty _authToken, decides the registry is
  // token-authenticated, and never performs the OIDC exchange at all.
  assert.strictEqual(setsRegistryUrl(RELEASE()), false)
})

test('release.yml requests the OIDC token', () => {
  const yaml = withoutComments(RELEASE())
  assert.match(yaml, /^\s*id-token:\s*write\s*$/m, 'id-token: write is what makes OIDC available')
  assert.match(yaml, /^\s*contents:\s*read\s*$/m)
})

test('release.yml stages, and never publishes directly', () => {
  const yaml = withoutComments(RELEASE())
  assert.match(yaml, /npm stage publish/, 'staged publishing is the whole design')
  // Trusted-publisher configs created after 2026-09-03 are stage-only, so a
  // bare `npm publish` earns `403 OIDC permission denied for this action`.
  const bare = yaml.replace(/npm stage publish/g, '')
  assert.doesNotMatch(bare, /npm publish/, 'a bare `npm publish` would be rejected 403')
})

test('release.yml upgrades npm past the staged-publishing floor', () => {
  // Node 22 bundles npm 10.x; staged publishing needs >= 11.15.0.
  assert.match(withoutComments(RELEASE()), /npm install -g npm@latest/)
})

test('release.yml triggers on both packages\' tags', () => {
  const yaml = withoutComments(RELEASE())
  assert.match(yaml, /'skitterspec@\*'/)
  assert.match(yaml, /'skitterspec-linear@\*'/)
  assert.match(yaml, /'skitterspec-jira@\*'/)
  assert.match(yaml, /'skitterspec-github@\*'/)
  assert.match(yaml, /workflow_dispatch:/, 'the recovery path')
})

test('release.yml packs from the package directory, so prepack fires', () => {
  // `bin`, `src` and `assets` are gitignored and composed at pack time; a
  // publish from the repo root ships an empty tarball.
  assert.match(withoutComments(RELEASE()), /working-directory:/)
})

test('release.yml checks the tag against package.json', () => {
  assert.match(RELEASE(), /Check the tag agrees with package\.json/)
})

test('release.yml never interpolates the tag into a shell command', () => {
  // The tag is chosen by whoever pushes it. Read via env, validated against an
  // allow-list, and only then used as a path — `packages/${{ github.ref_name }}`
  // would be a directory traversal in a release workflow.
  const yaml = withoutComments(RELEASE())
  const runBlocks = yaml.split(/^\s*- /m).filter((b) => /run:\s*\|/.test(b))
  for (const b of runBlocks) {
    assert.doesNotMatch(b.split('run:')[1] || '', /\$\{\{\s*github\.ref_name/,
      'github.ref_name belongs in env:, not inside a run: script')
  }
})

test('the filename npm is configured against is the one on disk', () => {
  // The trusted-publisher config names `release.yml` exactly. Renaming this file
  // breaks every publish with an error that names authentication, not the file.
  assert.ok(fs.existsSync(path.join(WORKFLOWS, 'release.yml')))
  assert.match(RELEASE(), /Workflow `release\.yml`/, 'the header should say so too')
})

// --- reconcile-releases.yml ---------------------------------------------------
//
// The self-healing mirror run. Each assertion is a way the run silently stops
// healing: no cron and nobody notices, a shallow checkout and every range is
// refused, a missing secret guard and the run goes red every hour instead of
// skipping.

const RECONCILE = () => fs.readFileSync(path.join(WORKFLOWS, 'reconcile-releases.yml'), 'utf8')

test('reconcile-releases.yml runs on a schedule, with a manual recovery path', () => {
  const yaml = withoutComments(RECONCILE())
  assert.match(yaml, /schedule:/)
  assert.match(yaml, /cron:/)
  assert.match(yaml, /workflow_dispatch:/)
})

test('reconcile-releases.yml checks out full history', () => {
  // reconcile ranges each tag from the previous one in its series and refuses
  // a shallow clone, so fetch-depth 0 is what keeps the run useful at all.
  assert.match(withoutComments(RECONCILE()), /fetch-depth:\s*0/)
})

test('reconcile-releases.yml skips without the PAT secret rather than failing', () => {
  // The skip lives in the script, so it holds for the release and approve
  // callers too: no token is a notice and exit 0, never a red run every hour.
  assert.match(withoutComments(RECONCILE()), /SKITTERSPEC_GITHUB_TOKEN/)
  const script = fs.readFileSync(path.join(__dirname, 'mirror-deployed.cjs'), 'utf8')
  assert.match(script, /no GitHub token — skipped'\)\n\s*return 0/)
})

test('reconcile-releases.yml runs the board reconcile', () => {
  assert.match(withoutComments(RECONCILE()), /node scripts\/mirror-deployed\.cjs --reconcile/)
})

test('reconcile-releases.yml does not set registry-url', () => {
  assert.strictEqual(setsRegistryUrl(RECONCILE()), false)
})

// --- and it stays silent ----------------------------------------------------

test('release.yml mentioning `npm publish` in prose is not an accusation', () => {
  // Its header explains why the command is NOT a bare publish, so the phrase is
  // in the file while the command is not — the same shape as the registry-url
  // comment above (`.claude/rules/negative-checks.md` rule 3).
  const prose = '# 4. The command is `npm stage publish`, never `npm publish`.\n      - run: npm stage publish\n'
  const yaml = withoutComments(prose)
  const bare = yaml.replace(/npm stage publish/g, '')
  assert.doesNotMatch(bare, /npm publish/)
})

// --- no step in ci.yml may fail without failing the build (chore-windows-ci) ----
//
// The Windows suite ran under `continue-on-error` until it was green there. A
// step that reports without gating is one nobody reads, so CI states plainly
// that every step blocks — a test that cannot apply on a platform skips itself
// with a reason instead.

function continuesOnError(yaml) {
  return /^\s*continue-on-error\s*:/m.test(withoutComments(yaml))
}

test('ci.yml has no step that can fail without failing the build', () => {
  const yaml = fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8')
  assert.strictEqual(continuesOnError(yaml), false)
})

test('a step that really continues on error is caught', () => {
  assert.strictEqual(continuesOnError('      - run: pnpm test\n        continue-on-error: true\n'), true)
})

test('STAYS SILENT: a comment mentioning continue-on-error is not an accusation', () => {
  assert.strictEqual(continuesOnError('  # once ran with continue-on-error: true\n      - run: pnpm test\n'), false)
})

// --- the Windows gate (chore-fast-windows-suite) ----------------------------
//
// ci.yml ran Windows beside release.yml, not before it, so a release staged
// while its Windows run was still going, and a red one stopped nothing.

// One job's block: from its `  <name>:` line to the next job at that indent.
function jobBlock(yaml, name) {
  const lines = withoutComments(yaml).split('\n')
  const start = lines.findIndex((l) => l === `  ${name}:`)
  if (start === -1) return null
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l))
  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}

// The suite a job runs: its `run:` lines, in order.
const runLines = (block) => (block.match(/^\s*- run: .*$/gm) || []).map((l) => l.trim())

test('release.yml stages only after its Windows gate and Windows job', () => {
  const stage = jobBlock(RELEASE(), 'stage')
  assert.ok(stage, 'release.yml has a stage job')
  assert.match(stage, /^\s*needs:\s*\[\s*windows-gate\s*,\s*windows\s*\]\s*$/m)
})

test('release.yml stages past a skipped Windows job only when the gate said skip', () => {
  // A skipped job is also what a cancelled gate or a mistyped condition
  // produces, so `skipped` alone must never be enough (chore-release-ci-test-dedup).
  const stage = jobBlock(RELEASE(), 'stage')
  assert.match(stage, /needs\.windows\.result == 'success'/)
  assert.match(stage, /needs\.windows\.result == 'skipped' && needs\.windows-gate\.outputs\.run == 'false'/)
})

test('release.yml runs Windows unless the gate answered exactly false', () => {
  // An empty output — a gate that failed or printed nothing — must run it.
  const win = jobBlock(RELEASE(), 'windows')
  assert.match(win, /^\s*needs:\s*windows-gate\s*$/m)
  assert.match(win, /needs\.windows-gate\.outputs\.run != 'false'/)
  assert.doesNotMatch(win, /outputs\.run == 'true'/)
})

test('the Windows gate reads Actions and gets no OIDC token', () => {
  const gate = jobBlock(RELEASE(), 'windows-gate')
  assert.ok(gate, 'release.yml has a windows-gate job')
  assert.match(gate, /^\s*actions:\s*read\s*$/m)
  assert.doesNotMatch(gate, /id-token/)
  assert.match(gate, /fetch-depth:\s*0/)
  assert.match(gate, /node scripts\/windows-gate\.cjs/)
})

test('the gate looks for the Windows job by the name both workflows give it', () => {
  // windows-gate.cjs finds a run's Windows job by name; a rename in either
  // workflow would leave every candidate `missing` and every tag re-running.
  const name = /^\s*name:\s*(.+)$/m
  const ci = jobBlock(fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8'), 'windows')
  const rel = jobBlock(RELEASE(), 'windows')
  const script = fs.readFileSync(path.join(__dirname, 'windows-gate.cjs'), 'utf8')
  const wanted = /const WINDOWS_JOB = '([^']+)'/.exec(script)[1]
  assert.strictEqual(name.exec(ci)[1].trim(), wanted)
  assert.strictEqual(name.exec(rel)[1].trim(), wanted)
})

test('release.yml\'s Windows job runs the same suite as ci.yml\'s', () => {
  const ci = jobBlock(fs.readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8'), 'windows')
  const rel = jobBlock(RELEASE(), 'windows')
  assert.ok(rel, 'release.yml has a windows job')
  assert.match(rel, /runs-on:\s*windows-latest/)
  assert.deepStrictEqual(runLines(rel), runLines(ci))
})

test('the Windows job does not get the OIDC token', () => {
  const rel = jobBlock(RELEASE(), 'windows')
  assert.match(rel, /^\s*permissions:\s*$/m)
  assert.doesNotMatch(rel, /id-token/)
})

test('a stage job that stages past any skipped Windows job is caught', () => {
  const yaml = "jobs:\n  stage:\n    needs: [windows-gate, windows]\n    if: ${{ needs.windows.result != 'failure' }}\n"
  assert.doesNotMatch(jobBlock(yaml, 'stage'), /needs\.windows\.result == 'skipped' && needs\.windows-gate\.outputs\.run == 'false'/)
})

test('a stage job that does not wait for Windows is caught', () => {
  const yaml = 'jobs:\n  windows:\n    runs-on: windows-latest\n  stage:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm stage publish\n'
  assert.doesNotMatch(jobBlock(yaml, 'stage'), /^\s*needs:/m)
})
