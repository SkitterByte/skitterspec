---
linear_identifier: "SKS-53"
linear_url: "https://linear.app/skitterbyte/issue/SKS-53/remote-branch-cleanup-in-spec-env-down"
---

# Remote-branch cleanup in `spec-env down`

> **Type:** Feature
> **Name:** feat-teardown-remote-branch (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/src/env/teardown.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/assets/core/env.config.md, packages/common/assets/skills/spec-complete/SKILL.md, packages/common/assets/skills/spec-cancel/SKILL.md
> **Stack:** worktree

## Problem

`/spec-go` **pushes** the spec branch when it provisions the worktree (recording
the in-progress state and firing tracker automation). Teardown never undoes that:
`spec-env down` removes the worktree and deletes the **local** branch only, so
every completed spec leaves a merged branch on the remote forever.

Raised from `ereqs` (on `@skitterbyte/skitterspec-linear@^10.5.2`) after a
completed feature spec:

```
$ skitterspec-linear spec-env down feat-export-cost-code-columns
  run these:
    git worktree remove /Users/reubengreaves/code/ereqs-wt/export-cost-code-columns
    git branch -D feat/export-cost-code-columns
```

`origin/feat/export-cost-code-columns` survived and had to be deleted by hand.
The ask was for teardown to handle it, **prompting rather than silently**.

## Decisions

1. **The planner stays a planner.** `spec-env down` prints commands and creates
   nothing, so it must not push — and, being non-interactive, it cannot prompt
   either. It emits the delete; the skill does the asking.
2. **`commands` must stay safe to run blind.** That is the property this feature
   could most easily break, so the remote delete goes in a separate
   `remoteCommands` array and never enters `commands` — unless the project opted
   in with `"always"`, which is the config author explicitly asking for it.
3. **Gated on `landed`, and `--force` does not enable it.** Until the branch is
   merged (or captured by a hotfix's deploy tag) the remote copy is the only
   backup — that is exactly what `refuseTeardownIfUnpushed` protects. `--force`
   means "I accept losing this worktree", not "delete my backup too". Reuses the
   same `landed` verdict that picks `-D` over `-d`, so the two can never disagree
   about whether the commits are recoverable.
4. **A positive signal, never an inferred name.** `remoteBranch` is a
   remote-tracking ref this clone can actually see — upstream first (so a
   non-`origin` remote works), then a scan of the configured remotes for a branch
   pushed without `-u`. Rejected `git ls-remote`: it would close the
   pushed-from-another-machine gap at the price of making every teardown
   network-dependent, for cleanup that is cosmetic.
5. **Absence is not evidence.** No remote ref → plan nothing, say nothing. A ref
   that maps to a differently-named remote branch → plan nothing, rather than
   guess at a branch name on a shared remote.
6. **`"prompt"` is the default and an unknown value falls back to it.** A typo
   (`"Always"`, `"yes"`) must never resolve to the one policy that deletes
   without asking.

## Solution overview

```
  run these:
    git worktree remove /path/to/worktree
    git branch -D feat/thing

  remote branch — confirm with the user first:
    git push origin --delete feat/thing
```

Under `"always"` the push becomes the last line of `run these:` and the second
section is not printed. Under `"never"`, and whenever the branch is unlanded or
has no visible remote ref, nothing about the remote appears at all.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Domain object | update | `worktreeGitState()` → gains `remoteBranch: string \| null` |
| Domain object | update | `planDown()` → returns `remoteCommands: string[]` |
| CLI command | update | `spec-env down` → new confirm-first section |
| Config key | add | `teardown.deleteRemoteBranch` — `prompt` (default) / `never` / `always` |
| Skill/rule | update | `/spec-complete` step 7 — ask before the remote delete |
| Skill/rule | update | `/spec-cancel` teardown — same, noting a cancelled spec plans none |

Additive. A spec with no remote ref produces byte-identical output to before, and
`plan.commands` is unchanged in every case except the opted-in `"always"`.

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine — remote ref, plan, config | ✅ | [01-engine.md](01-engine.md) |
| 2 | Surfaces — CLI output, docs, skills | ✅ | [02-surfaces.md](02-surfaces.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |
| 2026-09-04 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-04 — Spec created from the `ereqs` handoff
  (`~/code/ereqs/docs/handoffs/skitterspec-teardown-remote-branch.md`).
- 2026-09-04 — Verified the handoff's premise before building: `/spec-go`'s
  SKILL.md does say to push the branch, but prescribes no command, so upstream
  may never be configured. That is why the ref lookup falls back to scanning the
  configured remotes rather than relying on `@{u}` alone.
- 2026-09-04 — Completed; both phases done, tests green (1221/1221). Nothing
  deferred. Verified each phase claim against the code rather than the
  checkboxes, and confirmed both built distributions carry the docs and the two
  skill edits.
