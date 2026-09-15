---
linear_issue_id: "SKS-258"
---

# Phase 1 — Push `main` and prove CI runs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the remote has the workflows and `ci.yml` has gone green at least once,
before any tag is involved.

## Tasks

- [x] Confirm what is about to be published to the remote: `git log --oneline
      origin/main..main` and `git status`. At the time this spec was written
      `main` was well over 150 commits ahead and the remote had no `.github/`
      directory at all.
- [x] Push it: `git push origin main`. Ask the operator before running this — it
      is the first outward-facing act of the whole pipeline.
- [x] Watch the first `ci.yml` run and confirm it is green on **both** matrix
      jobs (Node 22.13 and 24). A failure here is cheap and is the reason this
      phase exists.
- [x] If the runner disagrees with local — a `pnpm install --frozen-lockfile`
      mismatch, a missing `packageManager` resolution, an action version GitHub
      rejects — fix it and push again. Record what it was in the Changelog; the
      whole value of this phase is the difference between the two environments.
- [x] Confirm `release.yml` is **not** triggered by the push. It listens on tags
      only, and a workflow that fires on a branch push would stage on every
      commit.
- [x] Run the project's typecheck and test commands locally too — green before
      the phase is done.

## Notes

No tag is pushed in this phase and nothing reaches the registry. The trusted
publishers do not need to exist yet, and deliberately should not be configured
until phase 2 — a staging attempt before CI is known good confuses two failures.

## What the runner disagreed with local about

Three runs, and the first two were red for **different** reasons — both
long-standing platform bugs the suite could not see because it had only ever run
on macOS. Each became its own spec, fixed and landed before this phase closed:

- **`bug-up-accuses-its-own-write`** — `spec-env up` wrote
  `.claude/settings.local.json` and then reported it as the operator's untouched
  work. Invisible locally because git reads `~/.config/git/ignore` as its global
  excludes with no `core.excludesFile` setting needed, and the author's listed
  that path. The fixtures were inheriting a personal ignore rule.
- **`bug-probe-race-on-linux`** — the review server's pre-flight probed both
  addresses concurrently. The probe binds, and on Linux a wildcard and a loopback
  bind of one port are mutually exclusive, so the pair raced itself and reported
  a free port as busy. No server ever started.

Both were verified against the platform that had them (`node:24-alpine`) rather
than argued from the failure text. Run 3 (`60e85ff`) is green on both matrix
jobs, and `release.yml` has never fired — it listens on tags only, which is the
half of this phase that is easy to forget to check.
