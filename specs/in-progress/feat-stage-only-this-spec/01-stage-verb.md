---
linear_issue_id: "SKS-211"
---

# Phase 1 — Expose the owned set as `spec-env stage` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-env stage [<spec>] [--json]` answers which
uncommitted paths belong to a spec and which do not, so no skill has to guess.

## Tasks

- [ ] Add a `stage` case to the `spec-env` dispatch in
      `packages/common/src/cli.js`, resolved with `resolveSpecWithWorktree` so a
      bare invocation means "the worktree I am standing in" like every other verb.
- [ ] Read the tree with `git status --porcelain` and hand the paths to
      `classifyDirtyTree(spec, dirtyPaths, config)` — no new classification
      logic, and no change to `classify.js`.
- [ ] Print the human form: a count line, then the `owned` and `foreign` lists
      under headings that say whose they are. Omit a list that is empty rather
      than printing an empty heading.
- [ ] Add `--json`, emitting `{"spec":…,"owned":[…],"foreign":[…]}`.
- [ ] Add `stage` to the `spec-env` usage string (currently
      `<up|down|prune|dev|connect|integrate|hotfix|live|review|status|resolve>`).
- [ ] Document the verb in the engine reference alongside the other verbs
      (`.claude/rules/spec-planning.md` names the verb set — keep it in step).
- [ ] Tests in `packages/common/test/`: owned/foreign split for a spec mid-`git
      mv` (dirty in two buckets at once), a spec whose companion snapshot is
      dirty, and the `--json` shape.
- [ ] **Stays-silent test** (`.claude/rules/negative-checks.md` §3): a clean
      tree, and a tree dirty only with another spec's files, both report zero
      owned without erroring or exiting non-zero.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

`classifyDirtyTree` is already correct and already tested
(`packages/common/test/env-classify.test.js`). This phase adds a caller, not
logic — resist widening the owned set here.

An unresolvable `{identifier}` companion expands to nothing on purpose (a spec
never pushed to a tracker); that path is then `foreign`, which is the safe
direction and must stay that way.
