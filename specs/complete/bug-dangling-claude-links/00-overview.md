---
linear_identifier: "SKS-62"
linear_url: "https://linear.app/skitterbyte/issue/SKS-62/bug-tracked-claude-symlinks-dangle-after-a-skill-is-retired"
---

# Bug: tracked .claude symlinks dangle after a skill is retired

> **Type:** Bug
> **Name:** bug-dangling-claude-links (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** .claude/skills/, .claude/commands/, scripts/claude-links.test.js
> **Stack:** worktree

## Symptom

`.claude/skills/spec-connect` and `.claude/skills/spec-live` are **tracked**
symlinks (git mode `120000`) pointing at directories that
`feat-script-only-commands` deleted:

```
$ git ls-files -s .claude/skills/spec-connect
120000 849e657… 0	.claude/skills/spec-connect
$ ls -l .claude/skills/spec-connect
… -> ../../packages/skitterspec-linear/assets/skills/spec-connect   # gone
```

`.claude/` is what the agent reads, so a dangling entry is a skill the tool
believes it has and cannot load. Because the links are committed, every clone
gets them.

## Root cause

This repo dogfoods itself: `.claude/skills/*` are symlinks into the built
distribution, so an edited asset is live without reinstalling.

**Nothing creates or reconciles those links.** They were committed by hand.
`scripts/dev-link.js` and `scripts/dev-sync.js` link this repo *into a consumer
project* — a different job — and the only `ln -s` in the codebase is
`provision.js`'s worktree file-seeding, unrelated. So when a spec retires a
skill, the asset directory goes and the committed link is left pointing at
nothing, with no script and no test to notice.

A second, quieter inconsistency followed from the same absence: the two files
that replaced those skills, `.claude/commands/*.md`, were written as **real
copies** by `skitterspec update` rather than linked. Editing a command asset
would not have gone live the way editing a skill asset does — the two lanes
behaved differently for no visible reason.

## Failing test (red)

`scripts/claude-links.test.js` — run with
`node --test scripts/claude-links.test.js`. Before the fix:

```
✔ the repo really is dogfood-linked
✖ no symlink under .claude/ points at a missing target
✖ every shipped command is linked, like the skills are
```

The first test is a **positive precondition**: if it ever finds no symlinks the
dogfood setup has changed shape, and the guard below would otherwise pass by
measuring an empty set.

## Fix

- [x] `git rm` the two dangling symlinks.
- [x] Replace the copied `.claude/commands/*.md` with symlinks into
      `packages/skitterspec-linear/assets/commands/`, matching how every skill is
      linked — so both lanes go live on edit.
- [x] Add `scripts/claude-links.test.js`: no `.claude/` symlink may dangle, every
      shipped command must be linked (not copied), and the precondition above.
- [x] Failing tests now pass (GREEN); `pnpm test` — **1271 green**.

## Correction to the record

Three earlier reports in this session attributed these dangling links to
`scripts/dev-link.js`. That was wrong — `dev-link` never creates them, and
reading it was what established that nothing does. The absence of any
reconciling script is the actual cause, and it is why a test is the right fix
rather than a change to `dev-link`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Repo config | remove | `.claude/skills/spec-connect`, `.claude/skills/spec-live` |
| Repo config | add | `.claude/commands/*.md` as symlinks into the built assets |
| Test | add | `scripts/claude-links.test.js` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |
| 2026-09-04 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-04 — Bug reproduced; failing test added (red).
- 2026-09-04 — Fixed: dead links removed, commands linked, guard added.
- 2026-09-04 — Completed; 1271 tests green.
- 2026-09-04 — Corrected an earlier misattribution to `dev-link`; nothing in the
  repo creates these links, which is the point.
