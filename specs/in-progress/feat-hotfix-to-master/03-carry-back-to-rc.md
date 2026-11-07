---
github_issue_id: "#121"
---

# Phase 3 — Carry back to the rc; finish ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** once the release branch has the fix, the current rc gets it too, and
the worktree goes once the land is confirmed.

## Tasks

- [ ] Carry target = the resolved base (`resolveBaseBranch` — the newest rc under
      `baseBranchPattern` when `feat-rolling-base` has landed)
- [ ] `ff`: today's carry (minus version commit, minus what the rc has) onto the
      rc; `pr`: carry onto a `carry/<hotfix>` branch and open a ready PR into the rc
- [ ] `hotfix finish`, branch-based: tear down when the release-branch land is
      confirmed merged (host-aware landed check) and the carry is merged or
      recorded as skipped; name every unmet check, no `--force`
- [ ] Tests: carry onto a resolved rc, carry PR plan, conflicted carry aborts and
      names the commit, finish refusals; run `pnpm test` — green before done
