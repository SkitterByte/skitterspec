---
linear_identifier: "SKS-121"
linear_url: "https://linear.app/skitterbyte/issue/SKS-121/spec-start-opens-a-tab-in-the-worktree-and-the-shell-goes-with-it"
---

# /spec-start opens a tab in the worktree, and the shell goes with it

> **Type:** Feature
> **Name:** feat-spec-start-opens-tab (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Cancelled (2026-09-10) — superseded: the tab flow is poor DX and
> breaks working from mobile entirely; the shell must not have to move.
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-09
> **Area:** packages/common/src/env/{provision.js,teardown.js}, packages/common/src/cli.js, packages/common/assets/skills/{spec-start,spec-complete}/SKILL.md, packages/common/assets/core/env.config.md, packages/common/test, docs/
> **Stack:** worktree

## Problem

`/spec-start` uses `EnterWorktree`, which moves **Claude** into the worktree but
cannot move the **shell** — a child process cannot `chdir` its parent. So the
terminal stays in the primary checkout on `main`, and everything derived from the
shell's cwd keeps answering about `main`: the terminal's git panel, its diff view,
and any tool the shell launches (`git diff`, `lazygit`, `code`).

The symptom reported was "my worktree tabs show main's changes". It is not a
display bug and no display fix resolves it — a statusline reading Claude's cwd
corrects the *numbers* while every tool the shell starts still opens the wrong
repo. Three separate symptoms, one cause.

`feat-spec-start-same-tab` (SKS-104) removed the opener deliberately, on the
premise that the tab was the only cost of the old flow:

> "starting a spec costs a tab, and the tab you were in becomes useless"

That premise is false. The shell's location is load-bearing, and the tab is not a
cost but the mechanism by which the shell reaches the worktree. This spec
re-decides SKS-104 rather than patching around it.

## Decisions

1. **`open.command` becomes the entry mechanism; `EnterWorktree` becomes the
   fallback.** An inversion of SKS-104 decision 6, on the falsified premise above.
2. **Opt-in, by the config already present.** A non-empty `open.command` means
   "open a tab"; the shipped `""` default keeps today's `EnterWorktree` behaviour
   exactly. Nobody's install changes on upgrade, and the new flow costs one config
   line. *Rejected:* a second key (`worktree.entry: tab|session`) — clearer intent,
   but a key that can disagree with `open.command` is a state nothing resolves;
   and *opener always wins*, which changes behaviour for every existing user and
   strands harnesses that cannot open a tab.
3. **Never both.** When the opener runs, `EnterWorktree` is not called: Claude
   moving *and* a tab opening leaves the original session in a worktree no shell
   is in — the current fault, doubled.
4. **Housekeeping moves into the engine.** A new `spec-env promote` does the
   `git mv`, the header edits and the State log row. The skill runs one command
   instead of editing files across a directory boundary, which removes the
   `/add-dir` papercut entirely — `settings.local.json` does not hot-reload, so
   today the first write into the worktree prompts. It also makes housekeeping
   unit-testable and matches how `stamp`/`record` already work: the engine does
   file edits, not the model. *Rejected:* keeping it in the skill and paying
   `/add-dir` on every start; and moving it to the new tab, which gives up the
   guarantee that no path ends with a provisioned worktree and a spec still
   reading `Ready`.
5. **Teardown never deletes the directory its caller is standing in.**
   `/spec-complete` lands the branch, then refuses to remove that worktree and
   says to close the tab; `spec-env prune` reaps it afterwards. `prune` already
   exists and already reaps orphans, so this is an existing path rather than a new
   one. *Rejected:* removing anyway and warning — it leaves both shell and Claude
   on a deleted inode, where commands fail confusingly rather than cleanly; and
   requiring `/spec-complete` to be run from the primary checkout, which costs a
   tab switch at the end of every spec.
6. **Nothing platform-specific ships.** `open.command`'s default stays `""` and
   its value is per-project config. The verified Warp recipe belongs in docs, not
   in code — the same reasoning that kept the key alive in SKS-104 decision 6 for
   tmux and VS Code users.
7. **The docs carry a returning-to-a-worktree tip, and a warning.**
   `open.command` fires once, at `/spec-start`; coming back to an in-flight spec
   tomorrow is unserved. A short shell snippet covers it. The docs also warn
   against auto-`exec`ing Claude from a shell rc: a shell cannot distinguish a tab
   opened to work from one opened to run `git log`, and `open -a <term> <dir>`
   passes no marker to guard on.

## Solution overview

Verified on Warp before writing this — each of these was tested, not assumed:

| Mechanism | Result |
|-----------|--------|
| `open -a Warp '{worktreePath}'` | opens a **tab** in the existing window, at the worktree ✅ |
| `warp://action/new_tab?path=…` | opens a **tab** ✅ |
| `warp://launch/<config>` | opens a whole new **window** ❌ |
| `…new_tab?path=…&command=…` | `command` silently ignored ❌ |

No mechanism can auto-start Claude in a tab, so the user types `claude`. That is
the whole residual cost, and it is arguably correct: auto-starting a session
nobody asked for burns quota in a tab that may have been opened by accident.

The resulting flow, drive-tested end to end on a real phase:

```
Tab A (main)   /spec-start feat-x
               → spec-env up, git worktree add, setup
               → spec-env promote feat-x     (bucket move, header, State log)
               → commit + push, then open.command fires
Tab B (worktree, opened by the opener)
               claude → /spec-next
               terminal's git panel and diff view are correct here
               /spec-complete → lands, says close the tab; prune reaps later
```

Costs versus today: one word (`claude`), and the conversation context from
`/spec` does not cross to Tab B. Keystrokes to reach `/spec-next` are unchanged.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-env promote <spec>` — bucket move, Status/Developer headers, State log row |
| CLI command | update | `spec-env up` prints `promote` among its worktree steps |
| CLI command | update | `spec-env down` refuses to remove the worktree the caller stands in |
| Config key | update | `open.command` — from fallback opener to the default entry mechanism |
| Skill | update | `/spec-start` — opener-first when `open.command` is set; `EnterWorktree` fallback |
| Skill | update | `/spec-complete` — relays the deferred teardown, says to close the tab |
| Docs | update | `env.config.md` opener recipe, returning-to-a-worktree tip, auto-exec warning; docs site |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-env promote` — housekeeping moves into the engine | ⬜ | [01-promote.md](01-promote.md) |
| 2 | `/spec-start` opens a tab when `open.command` is set | ⬜ | [02-opener-first.md](02-opener-first.md) |
| 3 | Teardown never deletes the caller's own worktree | ⬜ | [03-safe-teardown.md](03-safe-teardown.md) |
| 4 | Docs — the recipe, the returning tip, the warning | ⬜ | [04-docs.md](04-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-10 | Cancelled | cancelled | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created, after drive-testing the flow on a real phase of
  `feat-linear-spec-list`: phase 1 was reviewed in the terminal's own diff panel,
  then `/commit` and `/spec-next` both ran from the opened tab.
- 2026-09-10 — Cancelled: superseded. No phase was started and no code was
  written — every task in all four phase files is still open. The diagnosis
  stands (the shell's location is load-bearing, and a statusline fix does not
  reach it); the remedy does not. A tab is unreachable from mobile, where there
  is no terminal to open one in, so the entry mechanism cannot be one that moves
  the shell at all. Replaced by pointing the git UI at the worktree instead —
  `lazygit -p <worktreePath>`, which needs no tab, no Warp and no session move —
  plus a per-worktree `commit.template` carrying the `Refs:` trailer so a commit
  made outside Claude still obeys the repo's grammar.
- 2026-09-10 — Salvage note: phase 1 (`spec-env promote`) is independent of the
  opener and worth keeping. Moving the bucket move, header edits and State log
  row into the engine pays off *more* on the hand-off path than it would have
  under a tab, since that is exactly the `git -C <worktreePath>` / `/add-dir`
  papercut. Re-spec it separately rather than reading it out of a cancelled spec.
