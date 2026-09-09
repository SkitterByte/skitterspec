---
linear_issue_id: "SKS-125"
---

# Phase 4 — docs: the recipe, the returning tip, the warning ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** someone adopting the opener can copy a working line for their terminal,
knows how to get back into a worktree tomorrow, and is warned off the tempting
auto-`exec` — with the repo's own docs guards green.

## Tasks

- [ ] Expand the `open.command` block in
      `packages/common/assets/core/env.config.md`: give a recipe per terminal,
      keeping the existing `code {worktreePath}` and
      `tmux new-window -c {worktreePath}` examples and adding the two verified
      macOS forms, `open -a Warp '{worktreePath}'` and
      `open 'warp://action/new_tab?path={worktreePath}'`.
- [ ] Record what does **not** work, so nobody re-derives it: a Warp launch
      configuration opens a whole new window, and `warp://action/new_tab` silently
      ignores a `command` parameter — so no opener can auto-start Claude and the
      user types it.
- [ ] Add a short **"getting back to a worktree"** note: `open.command` fires once,
      at `/spec-start`, so returning to an in-flight spec later is a separate
      moment. Give the optional shell snippet (a `spec` function that `cd`s to the
      worktree, plus `alias c=claude`), clearly marked as a user tip rather than
      something the product installs.
- [ ] Warn against auto-`exec`ing Claude from a shell rc, **with the reason**: a
      shell cannot tell a tab opened to work from one opened to run `git log`, and
      `open -a <term> <dir>` passes no marker to guard on. Without the reason it
      reads as taste and gets ignored.
- [ ] Update the docs site page covering isolation/worktrees so its description of
      `/spec-start` matches the new default, and check the command tables still
      pass `scripts/docs-claims.test.js` — every dispatched verb must be
      documented, and no page may name a skill that does not ship. **`spec-env
      promote` from phase 1 lands here**, and the guard will fail the suite until
      it does.
- [ ] Run `pnpm test` at the repo root — the docs guards live there, not in a
      package — green before the phase is done.

## Notes

Everything terminal-specific belongs in **prose**, never in shipped defaults:
`open.command` stays `""` so the product carries no assumption about macOS, Warp
or any GUI. That is the same reasoning SKS-104 decision 6 used to keep the key
alive for tmux and VS Code users, and it is what makes this whole feature safe for
someone running in Windows Terminal or over ssh — they set their own command, or
set none and keep `EnterWorktree`.

`scripts/docs-claims.test.js` caught two real errors while phase 1 of
`feat-linear-spec-list` was being built (an undocumented verb, and a page naming a
skill that had not shipped yet). Expect it to catch this phase's omissions too —
run it early rather than at the end.
