---
github_issue_id: "#312"
---

# Phase 2 — Tests skip parked sources; docs say parked ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `pnpm test`, `pnpm test:nested` and CI run nothing under the parked
sources, and the docs say plainly that the two distributions are parked and how
to bring them back.

## Tasks

- [ ] Add `scripts/run-tests.js`: list every `*.test.js` (same discovery as
      bare `node --test`), drop files under a parked source, and spawn
      `node --test` with them plus any passed-through args. Exit with its code
- [ ] Point `package.json` `test` at it, and make `scripts/test-nested.js`
      skip parked sources
- [ ] Fix the `packages/common/test/*` and `packages/provider-kit/test/*`
      cases that need a built linear/jira dist (assets-*, base-bin-provider,
      init*, update-all, rules-budget, env-epic-clashes, released,
      nested-providers): follow the filtered set, or skip with a reason
- [ ] Test `run-tests.js`: it excludes parked files, keeps everything else,
      and with an empty parked list it discovers the same set as bare
      `node --test` (stays-silent case)
- [ ] Mark the two as parked in RELEASING.md (table plus an "Un-parking"
      section: the list and the `release.yml` triggers), README.md,
      `docs/linear.html`, `docs/jira.html` and `docs/index.html`; run
      `node scripts/docs-freshness.js verify linear jira index`
- [ ] `pnpm build && pnpm test && pnpm test:nested`: green, with the test
      count down by the parked sources' tests
