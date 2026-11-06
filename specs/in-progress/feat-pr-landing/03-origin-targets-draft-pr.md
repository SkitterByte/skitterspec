---
github_issue_id: "#109"
---

# Phase 3 — origin/base targets + mid-spec draft PR ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** in PR mode the engine measures against `origin/<base>` (local base
goes stale by design), and mid-spec work reaches CI as a draft PR that cannot
be merged.

## Tasks

- [x] origin/base targets, scoped at build time (see Notes): integrate's
      rebase/measure (phase 1), the review page's merge-base — `preferRemoteBase`
      in `host.js`, shared by serve.js and the CLI render so the two cannot
      disagree, remote ref only when present locally, never fetching. The
      **fork point and `live take` deliberately stay on local base** — an
      origin fork would fork without a just-landed, not-yet-pushed spec
      document, and live overlay is a local-workbench concept.
- [x] `spec-env up` prints a `note:` in PR mode when `origin/<base>` is ahead of
      local base (advisory, silent on every cannot-tell) — replaces the
      origin-fork, and replaces the planned `/spec-start` warn (engine-side, so
      every caller gets it).
- [x] `spec-env integrate --draft`: same plan with the create command composed
      `--draft`, heading `(pr, draft)`; an existing PR is updated by the push
      (no second create). A dedicated verb was not needed.
- [x] Fork `/spec-to-main` (SKILL.md): §4b PR-mode section — consent-gated push,
      draft PR, after-land deferred, `Landed: PR #N (draft) opened/updated` and
      `held — not pushed` vocabulary.
- [x] Unit tests: `preferRemoteBase` selection table (pr+ref, pr−ref, trunk
      untouched and never asked), `--draft` heading, up-note with a real ahead
      remote — plus stays-silent: trunk `up` says nothing on the same stale
      base, trunk plans carry no fetch (phase 1's byte-identical test).
- [x] Run `pnpm test` — green (4284 pass; one asset-guard failure caught a
      bold span my SKILL edit wrapped across a line break — fixed).

## Notes

Draft is the premature-close guard: tracker automations read a draft as
in-progress and the host cannot merge it, so nothing downstream can close the
ticket until phase 4 flips it to ready. `land.draft: false` exists for hosts or
teams that do not use drafts; the disposition guard is then the only guard,
which phase 4's tests cover explicitly.
