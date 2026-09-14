'use strict'

// Restore this repo's dogfood convention: `.claude/skills/*` and `.claude/rules/*`
// are symlinks into the shipped assets, so editing an asset is immediately live.
// `skitterspec update` knows nothing about that and should not — skills are
// COPIES in a consumer by design — so a newly shipped skill lands here as a real
// file, works perfectly, and is silently frozen against further asset edits.
// `/spec-list` and `/spec-claim` arrived that way and nobody noticed.
//
// `claude-links.test.js` is the guard; this is the one command that fixes what it
// reports. Both import the discovery below, deliberately: a fixer that disagreed
// with the guard would produce a repo that fails the check it just "fixed".
//
// Not wired into `dev:link`. That script's job is a CONSUMER's node_modules and
// has nothing to do with this repo's `.claude/`.

const fs = require('node:fs')
const path = require('node:path')
const { DISTS } = require('./build-dist.js')

const ROOT = path.join(__dirname, '..')

// Packages whose `assets/` is composed build output, and gitignored with it.
// Anything scanning `packages/*/assets` has to skip them or its answer depends on
// whether the reader has run a build.
const BUILT = new Set(Object.keys(DISTS))

// What this repo SHIPS, read from the source packages rather than from a list.
// A skill added tomorrow is in scope the moment its asset exists — which is the
// whole point, since the fault being fixed is a NEWLY shipped skill.
function shipped(kind, isEntry, root = ROOT) {
  const found = new Map()
  const packages = path.join(root, 'packages')
  if (!fs.existsSync(packages)) return found
  for (const pkg of fs.readdirSync(packages)) {
    if (BUILT.has(pkg)) continue
    const dir = path.join(packages, pkg, 'assets', kind)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (isEntry(path.join(dir, name), name)) found.set(name, pkg)
    }
  }
  return found
}

const shippedSkills = (root) => shipped('skills', (p) => fs.existsSync(path.join(p, 'SKILL.md')), root)
const shippedRules = (root) => shipped('rules', (_p, name) => name.endsWith('.md'), root)

// The install convention, LEARNED from the links already in place rather than
// hardcoded — the two trees genuinely differ. Skills point at the built
// distribution (`packages/skitterspec-linear/assets/skills/<name>`, seams already
// composed away); rules point at their SOURCE package, because a rule has no
// seams to compose. Hardcoding either would confidently link the other kind into
// a directory that does not exist.
//
// The candidate is VERIFIED before it is returned, and that is not belt-and-
// braces. `readdirSync` is alphabetical, so the first link under `.claude/skills`
// is `commit` — which points into `node_modules/@skitterbyte/skittership`, a
// package containing no other skill. Taking the first sibling therefore produced
// a target that does not exist, and acting on it would trade a frozen skill for
// an unloadable one. When nothing verifies, this returns null and the caller
// reports rather than guesses.
function linkTargetFor(installDir, name) {
  let entries
  try {
    entries = fs.readdirSync(installDir)
  } catch {
    return null
  }
  for (const sibling of entries) {
    if (sibling === name) continue
    const p = path.join(installDir, sibling)
    if (!fs.lstatSync(p).isSymbolicLink()) continue
    const target = path.join(path.dirname(fs.readlinkSync(p)), name)
    if (fs.existsSync(path.resolve(installDir, target))) return target
  }
  return null
}

// Byte-identical? Files compare by content, directories by entry set and then
// recursively. This is what separates "a copy waiting to become a link" from
// "somebody's edit", and getting it wrong in the permissive direction destroys
// work that exists nowhere else.
function sameTree(a, b) {
  let sa, sb
  try {
    sa = fs.statSync(a)
    sb = fs.statSync(b)
  } catch {
    return false
  }
  if (sa.isFile() && sb.isFile()) return fs.readFileSync(a).equals(fs.readFileSync(b))
  if (!sa.isDirectory() || !sb.isDirectory()) return false
  const ea = fs.readdirSync(a).sort()
  const eb = fs.readdirSync(b).sort()
  if (ea.length !== eb.length || ea.some((n, i) => n !== eb[i])) return false
  return ea.every((n) => sameTree(path.join(a, n), path.join(b, n)))
}

// Classify every shipped name against what is installed. Five states, and only
// one of them is actionable — the rest are reported, never acted on.
//
//   linked     already a symlink; nothing to do
//   link       shipped, composed by the distribution, and NOT INSTALLED AT ALL.
//              This was `absent` once, on the reasoning that not every
//              distribution installs every skill — true of a consumer, and not
//              of this repo, where the dogfood convention is that everything
//              shipped is linked. `/spec-reviewed` landed on `main` and could
//              not be invoked, while this said "nothing to do" and the guard
//              agreed. The tell is a RESOLVABLE TARGET: something to point at
//              means the link is missing; nothing to point at means the skill
//              is genuinely not part of this install.
//   absent     shipped but with no target to point at — not composed by the
//              distribution that `.claude/` links into. The ordinary state, and
//              still skipped, per `.claude/rules/negative-checks.md` rule 4.
//   relink     a real file whose content MATCHES its target — safe to replace
//   edited     a real file whose content DIFFERS — somebody's work. Refused.
//   no-target  no sibling link to learn the convention from, so the target
//              cannot be established. Refused rather than guessed.
function planRelink(names, installDir) {
  const out = []
  for (const name of names) {
    const p = path.join(installDir, name)
    let st
    try {
      st = fs.lstatSync(p)
    } catch {
      // Nothing installed under this name. Whether that is a gap or the
      // ordinary state turns on whether there is anything to point at, and
      // `linkTargetFor` verifies its candidate before returning it — so a
      // target here is evidence rather than a guess.
      const target = linkTargetFor(installDir, name)
      out.push(target ? { name, target, state: 'link' } : { name, state: 'absent' })
      continue
    }
    if (st.isSymbolicLink()) {
      out.push({ name, state: 'linked' })
      continue
    }
    const target = linkTargetFor(installDir, name)
    if (!target) {
      out.push({ name, state: 'no-target' })
      continue
    }
    const resolved = path.resolve(installDir, target)
    out.push({ name, target, state: sameTree(p, resolved) ? 'relink' : 'edited' })
  }
  return out
}

// The two actionable states, and they end the same way: a symlink where one
// belongs. `relink` replaces a stale copy, `link` creates one that was never
// installed — and `rmSync` with `force` is already a no-op on a path that is not
// there, so the difference is in the classification rather than here.
//
// Returns what it did, so the CLI reports rather than the function printing.
const ACTIONABLE = new Set(['relink', 'link'])

function applyRelink(plan, installDir) {
  const done = []
  for (const item of plan) {
    if (!ACTIONABLE.has(item.state)) continue
    const p = path.join(installDir, item.name)
    fs.rmSync(p, { recursive: true, force: true })
    fs.symlinkSync(item.target, p)
    done.push(item.name)
  }
  return done
}

// The two lanes this repo installs, and the ONLY two this touches.
// `.claude/commands/` is deliberately absent: a command carries an `{{exec}}`
// placeholder filled at install time, so linking one ships a command that tries
// to run a program called `{{exec}}`. It is a copy on purpose.
function lanes(root = ROOT) {
  const claude = path.join(root, '.claude')
  return [
    { label: 'skills', dir: path.join(claude, 'skills'), names: () => shippedSkills(root) },
    { label: 'rules', dir: path.join(claude, 'rules'), names: () => shippedRules(root) },
  ]
}

function run({ dryRun = false, root = ROOT, log = console.log } = {}) {
  let relinked = 0
  let refused = 0
  for (const lane of lanes(root)) {
    const plan = planRelink(lane.names().keys(), lane.dir)
    const todo = plan.filter((i) => ACTIONABLE.has(i.state))
    const bad = plan.filter((i) => i.state === 'edited' || i.state === 'no-target')

    if (todo.length) {
      // "linking" covers both actionable states honestly: one replaces a stale
      // copy and one creates what was never there, and both end as a symlink.
      log(`\n${lane.label}: ${dryRun ? 'would link' : 'linking'} ${todo.length}`)
      for (const i of todo) log(`  ${i.name} -> ${i.target}`)
      if (!dryRun) applyRelink(todo, lane.dir)
      relinked += todo.length
    }
    for (const i of bad) {
      refused += 1
      log(
        i.state === 'edited'
          ? `\n${lane.label}: REFUSED ${i.name} — it differs from ${i.target}.\n` +
              `  That is an edit, not a stale copy. Linking it would destroy the change.\n` +
              `  Diff it against the asset, then delete it and re-run.`
          : `\n${lane.label}: REFUSED ${i.name} — no sibling link to learn the target from.\n` +
              `  Link one entry by hand first, then re-run.`,
      )
    }
  }
  if (!relinked && !refused) log('claude-relink: nothing to do — every shipped skill and rule is linked.')
  else if (!dryRun && relinked) log(`\nclaude-relink: relinked ${relinked}.`)
  return { relinked, refused }
}

module.exports = {
  BUILT,
  shippedSkills,
  shippedRules,
  linkTargetFor,
  sameTree,
  planRelink,
  ACTIONABLE,
  applyRelink,
  lanes,
  run,
}

// CLI: node scripts/claude-relink.js [--dry-run]
//
// Applies by DEFAULT rather than making `--dry-run` the default and an
// `--apply` flag the way to mean it. The usual argument for a preview-first
// default is that a mistake is expensive; here it cannot be, because the only
// thing this replaces is a file already byte-identical to what it links to.
// Everything with anything to lose is refused. A repair command that repairs
// nothing until you find the second flag is the worse trade.
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run')
  const { refused } = run({ dryRun })
  // Non-zero on a refusal: something needs a person, and a repair tool that
  // exits 0 having repaired nothing is how that goes unread in a script.
  process.exit(refused ? 1 : 0)
}
