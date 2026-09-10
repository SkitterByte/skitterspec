---
linear_identifier: "SKS-130"
linear_url: "https://linear.app/skitterbyte/issue/SKS-130/keep-the-self-hosted-install-linked-and-stop-force-writing-through-a"
---

# Keep the self-hosted install linked, and stop --force writing through a link

> **Type:** Feature
> **Name:** feat-selfhost-link-integrity (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
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
| 1 | Catch a copy where a link belongs | ⬜ | [01-guard.md](01-guard.md) |
| 2 | One command to relink | ⬜ | [02-relink.md](02-relink.md) |
| 3 | `--force` must not write through a link | ⬜ | [03-force-refuses.md](03-force-refuses.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-10 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-10 — Spec created after `skitterspec update` installed `/spec-list` and
  `/spec-claim` as copies into a symlinked `.claude/`, freezing them. Found by
  hand; the existing link guard was green throughout.
