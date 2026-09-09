---
linear_identifier: "SKS-104"
linear_url: "https://linear.app/skitterbyte/issue/SKS-104/spec-start-lands-you-in-the-worktree-in-the-same-tab"
---

# /spec-start lands you in the worktree, in the same tab

> **Type:** Feature
> **Name:** feat-spec-start-same-tab (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-09
> **Area:** packages/common/assets/skills/{spec-start,spec-complete,spec-cancel}/SKILL.md, packages/common/assets/rules/spec-planning.md, packages/common/assets/core/env.config.md, packages/common/test/assets-*.test.js, specs/.core/env.config.json
> **Stack:** worktree

## Problem

In `worktree` mode `/spec-start` ends by opening a **new terminal session** and
telling you to run `/spec-next` there. The session you typed into stays on `main`
in the primary checkout, where `/spec-next` correctly refuses — so starting a spec
costs a tab, and the tab you were in becomes useless for the work you just
started.

`feat-spec-start-seamless` (SKS-97) fixed the adjacent fault — the `/spec-live` +
re-run dance — but left this one standing, and its decision 13 is explicit that
it meant to:

> "One invocation" means no re-run and nothing typed in between — not that the
> work lands in the session you started from.

That framing rests on a premise that is false: **the session's location is not
fixed.** Claude Code ships an `EnterWorktree` tool that switches the current
session into an existing worktree by path. Nothing in this repo references it
(zero hits across the tree). With it, the mode's whole point — several specs in
their own checkouts, `main` free — is kept while the operator stays in one tab.

## Decisions

1. **`/spec-start` switches the session in; it does not open a window.** After
   provisioning, bootstrap and the step-4 housekeeping, the skill calls
   `EnterWorktree` with the worktree path. The session's cwd becomes the worktree,
   and `/spec-next` is then run in the same tab.
2. **`/spec-next`'s resolution rules are not touched.** Rule 2 — "the worktree you
   are standing in" — starts answering on its own once the session actually moves.
   The refusal that stopped this working was correct and stays: it exists to keep
   the wrong branch from being built, and loosening it would trade a cheap refusal
   for commits nobody asked for.
3. **Already inside a worktree → degrade to today's hand-off.** `EnterWorktree`
   only permits a worktree→worktree switch when the target is under
   `.claude/worktrees/`, and this project's root is `../{repo}-wt`. So when the
   session's cwd is already inside a worktree the skill does not attempt the
   switch: it provisions, housekeeps, runs `open.command`, prints the path and
   hands off exactly as today. Rejected: relocating the worktree root under
   `.claude/worktrees/` to make the second switch legal — it changes a shipped
   product default and moves every existing worktree, to buy a case that
   `commit-trailers.md` already tells you to avoid ("author backlog specs from the
   base branch").
4. **Attempt only when it can succeed.** The branch is chosen from cwd *before*
   calling, not by calling and catching. A tool error surfaced mid-skill reads as
   a bug to whoever is watching, and the condition is knowable in advance.
5. **`open.command` becomes the fallback opener, and keeps its config key.** It
   runs only when the in-session switch did **not** happen — the tool is
   unavailable, or decision 3 applies. Rejected: deprecating the key, which breaks
   tmux/VS Code users and removes the only fallback for harnesses without the
   tool. This repo's `specs/.core/env.config.json` goes back to the shipped `""`
   default; the schema is unchanged.
6. **The skill degrades, it never hard-depends.** `EnterWorktree` is a harness
   capability with no CLI counterpart, so `spec-env up` gains nothing and the
   engine is untouched. Where the tool is absent the skill behaves exactly as it
   does today.
7. **Teardown leaves the session before removing the tree.** `/spec-complete` and
   `/spec-cancel` already warn to `cd` out of a worktree before `git worktree
   remove` — but a `cd` does not unwind an `EnterWorktree` session: the session
   stays registered against a directory that no longer exists, and the user is
   prompted about it at exit. So the existing prose gains a case rather than being
   replaced — `ExitWorktree` with `action: "keep"` when the session entered that
   way, plain `cd` when it was a terminal someone opened. `keep` never removes a
   worktree entered by path, so the teardown plan stays the one thing that deletes.
8. **Trust prose becomes fallback-only too.** The `/add-dir <trusted root>`
   instruction exists because writes into a worktree from the primary checkout
   prompt. Once the session *is* the worktree those writes are in-cwd, so the
   instruction belongs on the hand-off branch with the opener.

## Solution overview

`worktree` mode, after this spec:

```
/spec-start   gate (unchanged)
            → spec-env up + bootstrap        (unchanged)
            → housekeep via git -C           (unchanged)
            → cwd already inside a worktree, or no EnterWorktree?
                 yes → open.command, print path, /add-dir note, hand off  (today)
                 no  → EnterWorktree(worktreePath)  ← this tab is the worktree
            → "run /spec-next"
/spec-next    rule 2 answers; phase 1 builds in the same tab
```

`checkout` mode is unchanged throughout — it has no worktree to enter.

Teardown, in `/spec-complete` and `/spec-cancel`:

```
standing in the worktree?
  entered via EnterWorktree  → ExitWorktree(action: "keep")
  a terminal you opened      → cd to the primary checkout
then run the spec-env down plan
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill | update | `/spec-start` — enter in-session, opener demoted to fallback |
| Skill | update | `/spec-complete`, `/spec-cancel` — `ExitWorktree` case in the leave-first prose |
| Rule | update | `spec-planning.md` — "one terminal session per spec" no longer true |
| Doc | update | `env.config.md` — `open.command` documented as the fallback opener |
| Config | update | `specs/.core/env.config.json` — `open.command` back to `""` (this repo only) |
| Test | add | `assets-*.test.js` prose tests for the branch, the fallback and the exit |

_No engine, CLI or config-schema change — `spec-env` is untouched._

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `/spec-start` enters the worktree in-session | ⬜ | [01-enter-worktree.md](01-enter-worktree.md) |
| 2 | `open.command` becomes the fallback opener | ⬜ | [02-opener-fallback.md](02-opener-fallback.md) |
| 3 | Teardown leaves the session before removing the tree | ⬜ | [03-teardown-exit.md](03-teardown-exit.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created. Corrects decision 13 of `feat-spec-start-seamless`,
  whose premise (the session's location is fixed) was falsified by the
  `EnterWorktree` harness tool.
