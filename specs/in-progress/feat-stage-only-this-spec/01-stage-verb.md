---
linear_issue_id: "SKS-211"
---

# Phase 1 — Expose the owned set as `spec-env stage` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-env stage [<spec>] [--json]` answers which
uncommitted paths belong to a spec and which do not, so no skill has to guess.

## Tasks

- [x] Add a `stage` case to the `spec-env` dispatch in
      `packages/common/src/cli.js`, resolved with `resolveSpecWithWorktree` so a
      bare invocation means "the worktree I am standing in" like every other verb.
- [x] Read the tree with the existing `dirtyPaths()` helper (**not**
      `git status --porcelain` as planned — see Changelog) and hand the paths to
      `classifyDirtyTree(spec, dirtyPaths, config)` — no new classification
      logic, and no change to `classify.js`.
- [x] Print the human form: a count line, then the `owned` and `foreign` lists
      under headings that say whose they are. Omit a list that is empty rather
      than printing an empty heading.
- [x] Add `--json`, emitting `{"spec":…,"tree":…,"owned":[…],"foreign":[…]}`
      (`tree` added during the build; `owned`/`foreign` are `null` when git
      could not be read).
- [x] Add `stage` to the `spec-env` usage string (currently
      `<up|down|prune|dev|connect|integrate|hotfix|live|review|status|resolve>`).
- [x] Document the verb in the engine reference alongside the other verbs
      (`.claude/rules/spec-planning.md` names the verb set — keep it in step),
      in `env.config.md`, and in `docs/index.html` (`scripts/docs-claims.test.js`
      fails a dispatched verb the docs never mention).
- [x] Tests in `packages/common/test/`: owned/foreign split for a spec mid-`git
      mv` (dirty in two buckets at once), a spec whose companion snapshot is
      dirty, and the `--json` shape.
- [x] **Stays-silent test** (`.claude/rules/negative-checks.md` §3): a clean
      tree, and a tree dirty only with another spec's files, both report zero
      owned without erroring or exiting non-zero.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`classifyDirtyTree` is already correct and already tested
(`packages/common/test/env-classify.test.js`). This phase adds a caller, not
logic — resist widening the owned set here.

An unresolvable `{identifier}` companion expands to nothing on purpose (a spec
never pushed to a tracker); that path is then `foreign`, which is the safe
direction and must stay that way.
