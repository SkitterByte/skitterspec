---
linear_identifier: "SKS-134"
linear_url: "https://linear.app/skitterbyte/issue/SKS-134/lazygit-on-the-specs-worktree-and-commits-that-carry-their-ref"
---

# lazygit on the spec's worktree, and commits that carry their ref

> **Type:** Feature
> **Name:** feat-lazygit-commits (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Cancelled (2026-09-11) — superseded before any work began: the
> problem is reviewing a phase, not reaching a git UI, and a rendered review
> page answers it on desktop and phone alike.
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-11
> **Area:** packages/common/src/cli.js, packages/common/assets/core/env.config.md, packages/common/test, packages/linear/src/cli-sync.js, packages/linear/src/doctor.js, packages/linear/assets/rules/commit-trailers.md, packages/linear/test, docs/index.html
> **Stack:** worktree

## Problem

A spec is built in its own worktree, but the terminal stays in the primary
checkout — so lazygit, `git diff` and every tool the shell launches answer about
`main` while the work is somewhere else. `feat-spec-start-opens-tab` (SKS-121)
tried to close that by moving the shell into a new tab; it was cancelled on
2026-09-10 because a tab is unreachable from mobile, where there is no terminal
to open one in. The diagnosis stands, the remedy does not: the fix has to be one
where **the shell never moves**.

Two things follow from that. Reaching a spec's diff needs a pointer rather than a
relocation. And a commit made **outside** Claude — in lazygit, or plain
`git commit -m` — silently drops the `Refs:` trailer, which is the one thing
`spec-sync released <range>` counts. Committing from lazygit today means
committing slightly wrong.

## Decisions

1. **Point the tool at the worktree; never move the shell.**
   `lazygit -p <worktreePath>` reads the right repo from any cwd, with no tab,
   no Warp and no session move — so it works identically on a desktop, over ssh,
   and from a phone (where it simply does not apply, rather than breaking).
   *Rejected:* opening a tab (SKS-121, cancelled); a statusline fix, which
   corrects the numbers while every tool the shell starts still opens `main`.
2. **The pointer is a flag on the existing verb, not a new one.**
   `spec-env resolve <spec> --path` prints the worktree path alone, no labels —
   the scriptable form of what `resolve` already prints. A new `spec-env git`
   verb would carry its own docs, its own usage line and its own docs-claims
   entry to deliver a substring of an existing command.
3. **Nothing lazygit-specific ships in the engine.** `--path` names a directory;
   the `lazygit -p …` recipe and the shell function live in docs. This is
   SKS-121 decision 6 carried forward — the product must not assume lazygit any
   more than it assumed Warp. *Rejected:* having `spec-env up` print a lazygit
   line among its steps.
4. **The `Refs:` trailer rides a `prepare-commit-msg` hook.** Verified in a
   scratch repo: a `commit.template` is **ignored** under `git commit -m`, which
   is exactly how lazygit's inline commit (`c`) commits, while the hook fired on
   the same commit with `source=message`. Also verified: hooks live in the shared
   git dir and fire from a **linked worktree** with no per-worktree install — so
   every worktree already in flight is covered the moment the hook exists, and
   there is no repair path to build.
5. **No per-worktree `commit.template`.** Verified footgun:
   `git -C <worktree> config commit.template X` writes the **shared** config —
   the primary checkout
   read back the worktree's value. Scoping it per worktree needs
   `extensions.worktreeConfig` plus `git config --worktree`, i.e. a repo-wide
   extension flag, to deliver a mechanism that still misses lazygit's main path.
6. **The hook belongs to the Linear package.** A tracker-free repo has no ref to
   write, so common would ship a hook that always decides to do nothing. The
   lazygit integration itself (decisions 1–3) is in **common**, which is what
   makes it work without a tracker. *Rejected:* hook plumbing in common behind a
   provider seam — revisit when a second provider exists and there are two real
   cases to generalise from.
7. **Fill only when absent, using `git interpret-trailers`.**
   `--if-exists doNothing` makes it idempotent, and git itself places it after
   `Release-Note:` and before the comment block. Verified against both shapes the
   repo's own grammar produces: a single-line note (trailer joins the block) and
   a wrapped note (trailer starts its own block after a blank line). Typing your
   own `Refs:`, or letting `/commit` write one, therefore always wins.
8. **The hook never fails a commit.** Exit 0 on every path — binary missing (a
   fresh worktree has no `node_modules`), detached HEAD, unlinked spec, CLI
   error. A `prepare-commit-msg` that exits non-zero **aborts the commit**, and
   per `.claude/rules/negative-checks.md` the unknown case routes to the harmless
   branch: no trailer is a documented, honest gap; a lost commit is not.
9. **Opt-in and explicit.** `spec-sync hook install` is the only thing that
   installs it — no lifecycle skill and no `init` does. An existing
   `prepare-commit-msg` is never clobbered: the installer composes with it or
   refuses with instructions.
10. **The ref still comes from the branch, and that is a known limit.**
    `commit-trailers.md` says the ref names the commit's subject, not your
    location; a hook only knows the branch. Decision 7 is the mitigation — the
    hook only fills a gap, so the documented backlog-spec-authored-mid-spec case
    is fixed by typing `Refs:` yourself, exactly as the rule already says.

## Solution overview

Two independent halves, in two packages.

**Reaching the work** (common, no tracker needed):

```
$ skitterspec spec-env resolve feat-x --path
/Users/me/code/repo-wt/x
$ lazygit -p "$(skitterspec spec-env resolve feat-x --path)"
```

with the docs offering the shell function that wraps it (`sgit feat-x`, and bare
`sgit` when one spec is provisioned, since `resolve` already resolves a missing
spec argument from the registry).

**Commits that carry their ref** (linear, opt-in, installed once):

```
$ skitterspec-linear spec-sync hook install
prepare-commit-msg installed: /repo/.git/hooks/prepare-commit-msg
```

The hook resolves the ref the same way the bare command does, and appends it only
when the message has none:

```sh
ref=$(skitterspec-linear spec-sync ref 2>/dev/null) || exit 0
[ -n "$ref" ] || exit 0
git interpret-trailers --in-place --if-exists doNothing --trailer "Refs: $ref" "$1"
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resolve [spec] --path` — worktree path alone, one line |
| CLI command | add | `spec-sync hook <install\|uninstall\|status>` (linear) |
| Git hook | add | `.git/hooks/prepare-commit-msg` — fills `Refs:` when absent, always exit 0 |
| CLI command | update | `spec-sync doctor` — reports whether the hook is installed |
| Skill/rule | update | `commit-trailers.md` — the hook, and that a typed ref wins |
| Docs | update | `env.config.md` + `docs/index.html` — the lazygit recipe and shell function |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-env resolve --path`, and the lazygit recipe | ⬜ | [01-worktree-pointer.md](01-worktree-pointer.md) |
| 2 | `spec-sync hook` — the trailer hook, composed and safe | ⬜ | [02-commit-hook.md](02-commit-hook.md) |
| 3 | Put it on the record — the rule, and doctor | ⬜ | [03-record-and-doctor.md](03-record-and-doctor.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-11 | Ready | backlog | Reuben Greaves |
| 2026-09-11 | Cancelled | cancelled | Reuben Greaves |

## Changelog

- 2026-09-11 — Spec created, replacing the cancelled `feat-spec-start-opens-tab`
  (SKS-121). Four mechanisms were verified in a scratch repo before anything was
  written: `commit.template` is ignored under `git commit -m`; a
  `prepare-commit-msg` hook fires there (`source=message`) and from a linked
  worktree with no per-worktree install; `git -C <worktree> config` writes the
  shared config; and `git interpret-trailers --if-exists doNothing` places the
  trailer correctly and idempotently against both shapes of this repo's commit
  grammar. `spec-sync ref` was also timed from inside a worktree — 67ms, which is
  what makes it affordable on every commit.
- 2026-09-11 — Decided against a `commit.template`, which is what the cancelled
  spec's successor was first scoped as: it only serves lazygit's
  `C`-opens-editor path and misses the inline `c` commit entirely.
- 2026-09-11 — Cancelled the same day it was written, before any phase started.
  Grilling the DX exposed the real requirement underneath: **see the phase's
  diff before committing**, which lazygit only serves on a desktop and only
  because it happens to be a git UI. A rendered review page serves it from a
  phone too, needs no terminal program, and carries a written review the diff
  cannot. Phase 1 here (`spec-env resolve --path`) survives as a task inside
  `feat-phase-review`, which needs the same worktree-path resolution; the
  commit-hook phases go with the lazygit premise.
