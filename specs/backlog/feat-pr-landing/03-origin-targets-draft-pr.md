---
github_issue_id: "#109"
---

# Phase 3 — origin/base targets + mid-spec draft PR ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** in PR mode the engine measures against `origin/<base>` (local base
goes stale by design), and mid-spec work reaches CI as a draft PR that cannot
be merged.

## Tasks

- [ ] In PR mode, fetch before measuring and target `<remote>/<base>`:
      provision fork point (`provision.js` / `spec-env up`), integrate's rebase
      (phase 1 already), `live take`'s rebase (`live.js`), the review page's
      merge-base (`serve.js`), and `aheadOfBase` in `worktreeGitState`. Trunk
      mode keeps local base, untouched.
- [ ] `spec-env integrate --draft` (or a dedicated `spec-env stage-pr` verb if
      integrate's semantics stretch too far — decide at build time, record in
      this file): plan push + draft-PR create/update for an in-flight spec,
      consent-gated as phase 1.
- [ ] Fork `/spec-to-main` (SKILL.md) on the plan's strategy: ff plan → today's
      text unchanged; pr plan → push the branch, open or update the **draft**
      PR, report `Landed: PR #N (draft) updated`. It still never completes
      anything, and remains repeatable.
- [ ] `/spec-start` pre-flight: in PR mode warn (never refuse) when
      `origin/<base>` is ahead of local base, naming the fetch it ran.
- [ ] Unit tests on the planners' target selection (pr → `origin/<base>`,
      ff → `<base>`) and the draft flag; stays-silent test: trunk projects
      produce no fetch commands anywhere.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Draft is the premature-close guard: tracker automations read a draft as
in-progress and the host cannot merge it, so nothing downstream can close the
ticket until phase 4 flips it to ready. `land.draft: false` exists for hosts or
teams that do not use drafts; the disposition guard is then the only guard,
which phase 4's tests cover explicitly.
