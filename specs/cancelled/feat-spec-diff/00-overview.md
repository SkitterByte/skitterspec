---
linear_identifier: "SKS-82"
linear_url: "https://linear.app/skitterbyte/issue/SKS-82/spec-diff-a-viewer-tab-for-the-spec-you-are-driving"
---

# /spec-diff — a viewer tab for the spec you are driving

> **Type:** Feature
> **Name:** feat-spec-diff (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Cancelled (2026-09-08) — superseded by feat-spec-start-next before any work began: the Warp tab hand-off runs Claude in a correct-diff tab, so a separate viewer command has nothing left to add
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-08
> **Area:** packages/common/src/cli.js, packages/common/src/env/config.js, packages/common/assets/commands, packages/common/assets/skills/spec-go, packages/common/assets/core/env.config.md
> **Stack:** worktree

## Problem

Worktree mode currently offers two workflows and both cost something. The
default hands off to a session rooted in the worktree — correct diffs, but a
second window and a second `/spec-go`. The `--here` opt-out stays in one session
— but the terminal's branch chip and diff panel keep describing the main
checkout, which is the failure `8ffa6fc` made the hand-off mandatory to prevent.
Research confirms the missing third option cannot come from Warp: it has no
AppleScript/CLI surface for existing sessions, and every URI-scheme action
creates a new surface. But `warp://action/new_tab?path=<worktree>` opens a tab
**in the window you are already in** — so a one-keystroke *viewer* tab makes
`--here` safe: one session drives the worktree, and a correct diff panel is one
tab away. Nothing ships that keystroke today.

## Decisions

1. **A user-only slash command, `/spec-diff`, backed by a `spec-env view` verb** —
   same shape as `/spec-connect`/`/spec-live` (pre-executed engine verb, verbatim
   relay, `disable-model-invocation`). Only the operator benefits from a viewer
   tab, so only the operator should spend it. Rejected: a skill — there is no
   judgment to apply.
2. **The engine executes the viewer command rather than printing it.** The whole
   point is one keystroke; printing a command to copy recreates the problem
   `/spec-go` just fixed. It also always prints a `git status`/`diff --stat`
   summary inline, so the command is useful even with nothing configured.
3. **Configured via a new optional `open.view` template, falling back to
   `open.command`, else print-only.** One config surface (`open`), no new
   top-level key. The Warp deeplink
   (`open "warp://action/new_tab?path={worktreePath}"`) is the documented
   example, not a dependency. Rejected: a Warp-specific package — the entire
   Warp-ness is one config value, and the base must stay tool-neutral exactly as
   it stays tracker-neutral.
4. **`/spec-go --here` is promoted from "costed opt-out" to "supported, paired
   with `/spec-diff`".** The hand-off stays the default; the `--here` warning now
   names the remedy instead of only the cost. Rejected: dropping the hand-off
   default — a viewer tab still requires the operator to glance at it, and the
   default should stay the arrangement whose diff view is correct without
   remembering anything.
5. **Guards, all refusing by name:** `mode: checkout` (the checkout *is* the
   view), no worktree (`/spec-go` first), spec live in the primary checkout (the
   worktree is a detached HEAD — a viewer there would faithfully show the wrong
   tree, so point at the primary instead). Unknown state → print-only, never
   open a window at a guessed path.

## Solution overview

`spec-env view [spec]` resolves the spec (argument, else the worktree you stand
in), applies the guards, prints the branch + `git -C <worktree> status --short`
+ `diff --stat` summary, then executes the expanded `open.view` (fallback
`open.command`; neither → summary only, plus the path). `/spec-diff` is a
one-line command file relaying it. `/spec-go`'s `--here` bullet gains one
sentence pointing at `/spec-diff`; `env.config.md` documents `open.view` with
the Warp `new_tab` deeplink as the example.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env view [spec]` |
| Command | add | `/spec-diff` (`assets/commands/spec-diff.md`) |
| Config key | add | `open.view` (optional; falls back to `open.command`) |
| Skill/rule | update | spec-go `--here` bullet; env.config.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The `spec-env view` verb | ⬜ | [01-view-verb.md](01-view-verb.md) |
| 2 | The `/spec-diff` command + config | ⬜ | [02-command-and-config.md](02-command-and-config.md) |
| 3 | Pair `--here` with the viewer | ⬜ | [03-here-pairing.md](03-here-pairing.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | Ready | backlog | Reuben Greaves |
| 2026-09-08 | Cancelled | cancelled | Reuben Greaves |

## Changelog

- 2026-09-08 — Spec created after confirming Warp cannot repoint an existing
  tab (no AppleScript/CLI for existing sessions; OSC 7 unusable through a
  rendered TUI and reverted at the next prompt), while `new_tab?path=` opens a
  tab in the current window — the fact the design leans on.
- 2026-09-08 — Cancelled: grilling continued after writing and produced a better design (Tab Configs can auto-run commands, so the hand-off tab can carry Claude itself). No phase was started.
