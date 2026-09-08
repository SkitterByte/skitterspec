---
linear_identifier: "SKS-86"
linear_url: "https://linear.app/skitterbyte/issue/SKS-86/spec-start-spec-next-the-hand-off-that-finishes-itself"
---

# /spec-start + /spec-next — the hand-off that finishes itself

> **Type:** Feature
> **Name:** feat-spec-start-next (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-08
> **Area:** packages/common/assets/skills (spec-go split into spec-start/spec-next, + every skill naming /spec-go), packages/common/src (cli.js, env/config.js, init.js), packages/linear/assets/seams, packages/common/assets/rules, MIGRATION.md
> **Stack:** worktree

## Problem

`/spec-go` conflates two jobs — provision an environment, and build a phase —
and the seam between them is where the worktree hand-off hurts: the operator
must open a session in the worktree and run `/spec-go` a second time, because
the building has to happen where the terminal's diff panel can see it. Warp
cannot repoint an existing tab (no AppleScript/CLI for existing sessions), but
its Tab Configs carry a `directory` **and** a `commands` list and open in the
**current window** via `warp://tab_config/<name>` — so the tab that satisfies
the diff panel can also launch the second session itself. What blocks using
that is the conflation: there is no command meaning just "build the next phase
here" for the tab to run.

## Decisions

1. **Split `/spec-go` into `/spec-start` and `/spec-next`.** `spec-start` owns
   identify + provision + the spec's move to `in-progress` on its branch +
   tracker refresh + the hand-off; `spec-next` owns pre-flight, marking the
   phase 🔄, the build, recording progress and the mirror push — the part you
   re-run per phase, and the command the tab runs. Rejected: keeping one skill
   with a flag — the tab needs a name that means only "build", and the split is
   the fix for the conflation, not a renaming exercise.
2. **`/spec-go` is removed, not aliased** — a MIGRATION.md entry, exactly like
   `/spec-ready` and `/spec-env` in 3.0. `init` update removes the installed
   skill (the retired-files mechanism); the retired-skill guard in
   `docs-claims.test.js` gains `spec-go`. Rejected: a deprecated router skill —
   one more thing to maintain and then remove anyway. Major version bump.
3. **Worktree-mode hand-off: `spec-start` writes a per-spec Warp Tab Config**
   (`directory` = worktree, `commands` = [`claude "/spec-next"`]) **and opens
   `warp://tab_config/<name>`** — a tab in the current window whose shell lives
   in the worktree and whose Claude session is already building. Fresh session;
   the spec is the context carrier, which is the workflow's own premise.
   In the base engine behind config (`open.tab: "warp"`, default off) — the
   whole Warp-ness is ~50 lines of toml + a deeplink, not a package. Rejected:
   a `@skitterbyte/skitterspec-warp` package (session decision, 2026-09-08).
4. **Housekeeping stays in the parent session, deliberately.** `spec-start`
   commits the spec move/headers on the branch via `git -C <worktree>` before
   the tab opens. The `8ffa6fc` rule ("never build where the diff panel can't
   see") applies to *code*; mechanical, immediately-committed housekeeping has
   nothing for a diff panel to miss. This also ends the untracked-stub shuffle
   `/spec-bug` documents at length: created in the parent, moved by `spec-start`.
5. **Checkout mode: `spec-start` flows straight into `/spec-next` inline** —
   same session, one command builds the phase, exactly today's checkout
   behaviour under the new names. No tab: the checkout is the view.
6. **Fallback is today's hand-off.** `open.tab` unset (or not Warp): run
   `open.command` if set, print the worktree path, say "run `/spec-next` from a
   session there". Nothing breaks for non-Warp users. Unknown tab-config state
   (dir missing, deeplink fails) → fall back the same way, never refuse.
7. **The tab closes itself, because nothing else can.** Warp has no
   close-a-tab action, but it closes a tab when its shell exits — so the tab
   config's command chain is `claude "/spec-next"; exit`, and quitting Claude is
   what closes the tab. `/spec-complete` run inside the tab relocates to the
   primary checkout before teardown (never saw off the branch you sit on), then
   says plainly: work is on base in the primary checkout, `/exit` closes this
   tab. Rejected: leaving the tab stranded on a deleted directory — the exact
   confusion this spec exists to end.
8. **`feat-spec-diff` is cancelled** (SKS-82): the auto tab is the
   correct-diff surface, so a separate viewer command has nothing left to add.
   `--here` remains a costed opt-out on `spec-start`.

## Solution overview

Four passes: extract `/spec-next` from `spec-go`'s build half (its description
carries the old "build the next phase" triggers); build `/spec-start` from the
provision half, ending in the mode-appropriate hand-off; add the engine's
`spec-env tab <name>` verb + `open.tab` key (writes the toml into Warp's
tab-config directory — locate it at implementation — then opens the deeplink,
executing not printing); then retire `/spec-go` across the 24 files that name
it, including renaming the provider seam `spec-go-start` → `spec-next-start`
(a build-time contract, so common and linear move together in one commit).
The existing `assets-prose` guard ("every /spec-… named is a skill that
ships") sweeps stragglers mechanically.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | add | spec-start, spec-next (SKILL.md × both asset trees' composition) |
| Skill/rule | remove | spec-go (+ MIGRATION.md entry, retired-files removal on update) |
| Skill/rule | update | every asset naming /spec-go (24 files, incl. spec templates' Name header) |
| CLI command | add | `spec-env tab <name>` (writes + opens the Warp Tab Config) |
| Config key | add | `open.tab` ("warp" \| "", default "") |
| Seam | rename | `spec-go-start` → `spec-next-start` (common + linear, one commit) |
| Test | update | retired-skill guard += spec-go; new tab-verb + fallback tests |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Extract /spec-next | ⬜ | [01-spec-next.md](01-spec-next.md) |
| 2 | Build /spec-start | ⬜ | [02-spec-start.md](02-spec-start.md) |
| 3 | The Warp tab hand-off | ⬜ | [03-warp-tab.md](03-warp-tab.md) |
| 4 | Retire /spec-go | ⬜ | [04-retire-spec-go.md](04-retire-spec-go.md) |
| 5 | Complete from the tab | ⬜ | [05-complete-from-tab.md](05-complete-from-tab.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-08 — Spec created; supersedes feat-spec-diff (cancelled, SKS-82).
  Design rests on verified Warp facts: Tab Configs run `commands` in a
  `directory` and open in the current window; existing tabs cannot be repointed.
- 2026-09-08 — Follow-up grilling: completing from inside the hand-off tab
  would tear down the session's own cwd. Added Decision 7 and Phase 5 —
  relocate before teardown, and the `; exit` chain makes quitting Claude close
  the tab, since Warp exposes no way to close it from outside.
