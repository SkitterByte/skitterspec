---
linear_identifier: "SKS-56"
linear_url: "https://linear.app/skitterbyte/issue/SKS-56/bug-initupdate-from-a-source-package-installs-uncomposed-assets"
---

# Bug: init/update from a source package installs uncomposed assets

> **Type:** Bug
> **Name:** bug-uncomposed-assets-install (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/src/init.js, packages/common/bin/skitterspec.js, packages/linear/bin/skitterspec-linear.js
> **Stack:** worktree

## Symptom

Running `pnpm exec skitterspec-linear update` in this repo reported seven
correctly-composed skills as **`customized (kept)`** with diffs like `+3 −171`,
and would have installed skills containing the literal text
`<!-- seam:spec-tracker-intake -->` had they not been kept.

Reproduce from the repo root:

```
$ node packages/common/bin/skitterspec.js init /tmp/x --yes
$ grep -c '<!-- seam:' /tmp/x/.claude/skills/spec/SKILL.md
3
```

Three raw seam markers land in the user's installed skill. The same happens via
`packages/linear/bin/skitterspec-linear.js`, which is what `pnpm exec` resolves
to in this workspace.

**Why the misreport is the dangerous half.** This repo is **dev-linked**
(`scripts/dev-link.js`): `.claude/skills/*` are symlinks into
`packages/skitterspec-linear/assets/skills/` — the *composed* distribution. The
installer compares those against `packages/common/assets` (uncomposed), so it
classifies every one as a user edit. `update --force` would then write the
seam-marker text **through the symlink** into the built assets, and the report
frames the loss as overwriting "your edits" when they are the provider build.

## Root cause

`packages/common/src/init.js:10` — `const ASSETS = path.join(__dirname, '..', 'assets')`,
unconditionally. That is correct for a **built distribution**, where
`scripts/build-dist.js` has already run `composeAssets` and replaced every
`<!-- seam:NAME -->` (with a provider fragment for `skitterspec-linear`, with
nothing for the base). It is wrong for a **workspace source package**, whose
`assets/` is pre-composition.

Both source packages expose a runnable bin over that tree:

- `packages/common/bin/skitterspec.js` → `../src/cli.js` → its own uncomposed assets.
- `packages/linear/bin/skitterspec-linear.js:34` → `require('@skitterbyte/skitterspec-common/src/cli.js')`,
  so `init`/`update` (not provider commands) delegate to common and use *common's*
  assets — which is why the run installed the base set and never touched the four
  Linear skills.

`packages/linear` is `private: true` and never published, so **no consumer is
affected**; the published `skitterspec-linear` vendors its own composed assets.
The bug is confined to the workspace — which is precisely where the maintainer
dogfoods, and where `--force` is destructive.

Each bin already opens with a guard for the neighbouring failure — "no build
output" — but it tests `existsSync(__dirname/../src)`, and its own comment
concedes *"in the workspace packages src/ always exists, so this is inert
there."* The check is inert exactly where this bug lives: an **absence** used as
evidence, per `.claude/rules/negative-checks.md`.

## Failing test (red)

`packages/common/test/init-uncomposed-assets.test.js` — run with
`node --test packages/common/test/init-uncomposed-assets.test.js`.

It spawns the bin and asserts it refuses. Before the fix:

```
✖ the init command refuses an uncomposed asset tree
  AssertionError: Missing expected rejection: refuses rather than writing seam
  markers into the user's skills
```

A companion precondition test asserts the source tree really does carry seam
markers, so the guard can never be silently measuring nothing.

## Fix

- [x] Add `assertComposedAssets()` to `packages/common/src/init.js`: walk every
      `.md` under `ASSETS` and throw if any still carries a `<!-- seam:NAME -->`
      marker, naming the offender, the count, and `npm run build`.
- [x] Call it from **both bins** for `init`/`update` only —
      `packages/common/bin/skitterspec.js` and
      `packages/linear/bin/skitterspec-linear.js` (the provider bin needs its own
      call because it delegates these two commands to the base CLI).
- [x] Failing test now passes (GREEN); `pnpm test` — **1257 green** — and
      `pnpm build` composes both distributions.
- [x] Stays-silent tests: a composed distribution passes the guard; prose that
      merely discusses seams (`spec-planning.md`) does not trip it.
## Follow-up (not fixed here)

`scripts/dev-link.js` leaves **dangling symlinks** when a skill is retired:
`.claude/skills/spec-connect` and `.claude/skills/spec-live` still point at
directories that `feat-script-only-commands` removed, and nothing reconciles
them. Harmless — the replacement commands work — but it will recur on every
future retirement. Deliberately left out of this branch rather than smuggled in
with an unrelated fix; it wants its own `/spec-bug`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `init` / `update` refuse from a source package, exit 1 |
| Service | add | `assertComposedAssets()` exported from `init.js` |

## Notes on placement

The guard sits in the **bins**, not in `init()`/`resync()` or `run()`. Both
deeper positions were tried and reverted: 20+ existing tests legitimately drive
the library and the CLI against this source tree, and guarding there would have
made them untestable while protecting nothing extra — a real install only ever
happens through a bin.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |
| 2026-09-04 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Fixed: `assertComposedAssets` guard called from both bins; test green.
- 2026-09-04 — Completed; fix green, 1257 tests pass, both distributions build. One follow-up recorded and deliberately **not** fixed here: dev-link's dangling symlinks after a skill retirement.
- 2026-09-04 — Guard moved twice before landing — from `init()`/`resync()`/`reset()`,
  then from the CLI dispatch, out to the bins. Each inner position broke existing
  tests that drive the source tree deliberately, which is the signal that the
  boundary belongs at the outermost edge.
