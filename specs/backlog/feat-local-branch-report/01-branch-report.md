---
github_issue_id: "#263"
---

# Phase 1 — Branch report at conversion and update ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init --local` and local-scope `update` name each long-lived branch
that still commits the install, proven by fixture-repo tests.

## Tasks

- [ ] Add `branchesCarryingInstall(dir, managedPaths, git)` to `init.js`:
      candidates from `describeBaseBranch`, `hotfix.releaseBranch` and
      `origin/HEAD`, deduplicated, minus the current branch; read each
      existing local and remote-tracking ref with `ls-tree`, at the git-root
      prefix
- [ ] Count our hook entries in each ref's `.claude/settings.json`
      (`git show <ref>:<path>`); malformed JSON counts as cannot tell
- [ ] Comment the blind spot beside the check: remote refs are as of the
      last fetch (`.claude/rules/negative-checks.md` rule 2)
- [ ] Call it from `convertCommitted` and the local-scope path of `resync`;
      push one suggestion per carrying ref, a warning per cannot-tell
- [ ] Tests in `init-local.test.js`: conversion with `origin/master`
      carrying files reports it; `update` reports it until that branch is
      cleaned, then is silent
- [ ] Stays-silent tests: no remote, feature branch only, current branch
      is the only carrier, team install, unresolved base under a pattern
- [ ] Run `pnpm test` — green before the phase is done
