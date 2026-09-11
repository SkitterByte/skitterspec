---
linear_issue_id: "SKS-136"
---

# Phase 2 — `spec-sync hook`, the trailer hook, composed and safe ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec-linear spec-sync hook install` puts a
`prepare-commit-msg` hook in the repo that fills `Refs: <id>` into any commit
message that lacks one — from lazygit, from `git commit -m`, from any worktree —
and can never fail a commit, proven by tests over a fixture repo.

## Tasks

- [ ] Add `spec-sync hook <install|uninstall|status>` to the dispatch in
      `packages/linear/src/cli-sync.js`, with its usage line in the default
      block. `status` reports installed / absent / present-but-not-ours.
- [ ] Write the hook body as posix `sh`: resolve the ref with `spec-sync ref`,
      exit 0 with no output when it prints nothing, and otherwise hand the
      message file to `git interpret-trailers`, with
      `--in-place --if-exists doNothing` and the `Refs:` trailer.
- [ ] **Never exit non-zero, on any path** — a `prepare-commit-msg` that fails
      aborts the commit. Cover: the binary not found (a fresh worktree has no
      `node_modules`), detached HEAD, an unlinked spec, a CLI error, and
      `interpret-trailers` itself failing. Name the blind spot in a comment
      beside the check, per `.claude/rules/negative-checks.md`.
- [ ] Skip the `merge` and `squash` sources (`$2`), where the message is not a
      spec commit's own. `message`, `template` and `commit` (amend) are handled —
      and amend is safe because the trailer is only ever filled when absent.
- [ ] Resolve the binary without assuming a package manager: prefer the
      `skitterspec-linear` on `PATH`, then the repo's `node_modules/.bin`. Do not
      shell out through `pnpm exec` — it costs a package-manager startup on every
      commit, where the bare binary measured 67ms.
- [ ] Install into the **shared** hooks dir (`git rev-parse --git-common-dir`),
      not `<worktree>/.git/hooks`, so one install covers every worktree — and
      honour `core.hooksPath` when the repo sets one rather than writing where
      git is not looking.
- [ ] **Never clobber an existing hook.** If `prepare-commit-msg` exists and is
      not ours, refuse with instructions (and the one line to add) rather than
      overwriting; if it is ours, re-installing is an idempotent upgrade. Mark
      ours with a stable identifying comment, and have `uninstall` remove only
      that.
- [ ] Add `packages/linear/test/cli-hook.test.js` over a fixture repo covering:
      a commit with no trailer gains the branch's ref; a message that already
      carries `Refs:` is **left exactly as it was** (the stays-silent test — a
      typed ref must win); a commit on the base branch gains nothing and still
      succeeds; the binary being absent still lets the commit through; a commit
      made from a linked worktree gets the worktree's ref, not the primary
      checkout's; an existing foreign hook is refused, not overwritten; and
      `uninstall` leaves the repo as it found it.
- [ ] Run `pnpm test` in `packages/linear` and at the repo root — green before
      the phase is done.

## Notes

The mechanism was verified before this was written, and the tests should pin each
finding rather than re-deriving it: the hook fires on `git commit -m` with
`source=message`; hooks in the shared git dir fire from linked worktrees;
`interpret-trailers --if-exists doNothing` is idempotent and places `Refs:` after
`Release-Note:` in both shapes the repo's grammar produces (a single-line note
joins the trailer block; a wrapped note gets a blank line and its own).

This hook is an accusing check's opposite — it only ever *adds* something, and
every uncertain path resolves to adding nothing. Keep it that way: no warnings on
stderr about refs it could not resolve, because that text lands in front of
someone mid-commit who did nothing wrong.
