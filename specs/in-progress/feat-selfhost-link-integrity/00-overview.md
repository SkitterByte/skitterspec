---
linear_identifier: "SKS-130"
linear_url: "https://linear.app/skitterbyte/issue/SKS-130/keep-the-self-hosted-install-linked-and-stop-force-writing-through-a"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Keep the self-hosted install linked, and stop --force writing through a link

> **Type:** Feature
> **Name:** feat-selfhost-link-integrity (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-10)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-10
> **Area:** scripts/claude-links.test.js, scripts/claude-relink.js, packages/common/src/init.js
> **Stack:** worktree

## Problem

This repo dogfoods itself: `.claude/skills/*` and `.claude/rules/*` are tracked
symlinks into `packages/`, so editing an asset is immediately live. `skitterspec
update` knows nothing about that, and it should not — skills are **copies** in a
consumer by design.

The two behaviours collide on a **newly shipped** skill. `writeFile` skips a
target that already exists, so existing links survive; a skill that does not
exist yet is written as a real file. `/spec-list` and `/spec-claim` arrived that
way — working, and silently frozen: editing the asset would no longer change the
installed skill. Nothing caught it. `claude-links.test.js` already asserts links
exist and none dangle, and asserts commands are *not* links, but never asserts a
skill **is** one.

Separately, `update --force` in this checkout is a live hazard. `writeFile`
follows a symlink, so forcing would write composed content — seam markers and
all — straight into `packages/*/assets`, corrupting the source the link points
at. `init.js` names this risk in a comment and nothing enforces it.

## Decisions

1. **The guard belongs here, not in the product.** This repo's convention is
   this repo's business, and a check that costs consumers nothing catches the
   fault the moment it appears. *Rejected:* a `--link` install mode — it puts a
   mode in the shipped product for one repo's benefit, and skills-as-copies is
   deliberate for consumers (`dev-sync.js` exists precisely to re-copy them).
2. **Assert the shape, not the absence.** The test asks "is this a symlink?" of
   every shipped skill and rule — a positive signal about a file that must be
   present — rather than looking for copies, which finds nothing on a tree it
   failed to read. It derives the expected set from what the distribution ships,
   so a new skill is covered the moment it exists.
3. **Commands stay the documented exception.** They carry an `{{exec}}`
   placeholder filled at install time, so linking one ships a command that tries
   to run a program called `{{exec}}`. The existing test says so; the new one
   must exempt them by the same reason, not by a silent skip.
4. **Fixing it is one command.** `scripts/claude-relink.js` links whatever is
   shipped and not yet linked. Kept out of `dev:link`, whose job is a *consumer's*
   `node_modules` and has nothing to do with this repo's `.claude`.
5. **`--force` refuses rather than repairs when the target is a live symlink.**
   Writing through it corrupts the asset the link points at, which is worse than
   the staleness `--force` was reached for. Refuse, name the path, and say to
   unlink it first — the unknown case routed to inaction
   (`.claude/rules/negative-checks.md` rule 4).

## Solution overview

Three independent pieces, in increasing blast radius:

```
1. claude-links.test.js   every shipped skill/rule under .claude is a symlink
2. claude-relink.js       link the ones that are not (commands skipped)
3. init.js writeFile      --force refuses to write through a live symlink
```

Piece 3 is the only one that touches shipped code. It changes `--force` from
"overwrite" to "overwrite, unless the target is a live symlink" — a refusal that
cannot fire in a normal consumer install, because nothing there is linked.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Test | update | `claude-links.test.js` — assert skills/rules are links |
| CLI command | add | `scripts/claude-relink.js` (+ a `relink` npm script) |
| Service | update | `init.js` `writeFile` — refuse `--force` through a live symlink |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Catch a copy where a link belongs | ✅ | [01-guard.md](01-guard.md) |
| 2 | One command to relink | ✅ | [02-relink.md](02-relink.md) |
| 3 | `--force` must not write through a link | ✅ | [03-force-refuses.md](03-force-refuses.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-10 | Ready | backlog | Reuben Greaves |
| 2026-09-10 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-12 — Phase 3 built. `writeFile` refuses a live symlink under `--force`
  and reports it in a `refused` bucket of its own, separate from `unchanged`. The
  dangling-symlink repair beside it is untouched. `lastReport()` was added to the
  exports so a test can assert what a run DECIDED, not only what it left on disk.
  The shipped `--force` help text was deliberately left alone: the refusal cannot
  fire in a consumer install, so the caveat belongs in the refusal message rather
  than in help every consumer reads.
- 2026-09-12 — Phase 2 built. `scripts/claude-relink.js` + `pnpm relink`, with
  the discovery shared into `claude-links.test.js` so guard and fixer cannot
  disagree. Verified against the real `.claude/` three ways and restored each
  time: a healthy tree is a no-op, a byte-identical copy relinks to a resolving
  link, and an edited copy is refused with the edit intact and a non-zero exit.
  While rewiring the guard I clobbered three pre-existing tests (`dogfood-linked`,
  the dangling-target check, and the commands check) with an over-wide splice and
  restored them from `HEAD` — worth noting because the suite was briefly green
  with 7 tests where it should have had 10, which is exactly the silent-shrink
  failure the non-empty preconditions in this file exist to catch.
- 2026-09-12 — Phase 1 built. The branch was 66 commits behind `main` and was
  rebased onto it first; stale build output in the worktree made
  `.claude/skills/spec-diff` a dangling link (`/spec-diff` shipped after this
  worktree was provisioned), fixed by `build-dist.js all` and not a code fault.
  The guard replaced the previous `skills are links` test rather than sitting
  beside it: that one read its expected set from the INSTALL, so a skill that
  shipped and was never linked was absent from the very list it checked. One
  deviation from the task list — the repair hint the message prints is now
  verified before it is printed, after its first version emitted a command that
  would have created a dangling link.
- 2026-09-10 — Spec created after `skitterspec update` installed `/spec-list` and
  `/spec-claim` as copies into a symlinked `.claude/`, freezing them. Found by
  hand; the existing link guard was green throughout.
