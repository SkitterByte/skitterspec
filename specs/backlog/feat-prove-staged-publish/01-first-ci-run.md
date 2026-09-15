---
linear_issue_id: "SKS-258"
---

# Phase 1 — Push `main` and prove CI runs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the remote has the workflows and `ci.yml` has gone green at least once,
before any tag is involved.

## Tasks

- [ ] Confirm what is about to be published to the remote: `git log --oneline
      origin/main..main` and `git status`. At the time this spec was written
      `main` was well over 150 commits ahead and the remote had no `.github/`
      directory at all.
- [ ] Push it: `git push origin main`. Ask the operator before running this — it
      is the first outward-facing act of the whole pipeline.
- [ ] Watch the first `ci.yml` run and confirm it is green on **both** matrix
      jobs (Node 22.13 and 24). A failure here is cheap and is the reason this
      phase exists.
- [ ] If the runner disagrees with local — a `pnpm install --frozen-lockfile`
      mismatch, a missing `packageManager` resolution, an action version GitHub
      rejects — fix it and push again. Record what it was in the Changelog; the
      whole value of this phase is the difference between the two environments.
- [ ] Confirm `release.yml` is **not** triggered by the push. It listens on tags
      only, and a workflow that fires on a branch push would stage on every
      commit.
- [ ] Run the project's typecheck and test commands locally too — green before
      the phase is done.

## Notes

No tag is pushed in this phase and nothing reaches the registry. The trusted
publishers do not need to exist yet, and deliberately should not be configured
until phase 2 — a staging attempt before CI is known good confuses two failures.
