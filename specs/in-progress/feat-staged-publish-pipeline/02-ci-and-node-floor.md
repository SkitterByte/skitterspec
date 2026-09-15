---
linear_issue_id: "SKS-250"
---

# Phase 2 — Raise the Node floor and add ci.yml ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the suite runs on every push and PR, on the Node versions the packages
actually claim to support.

## Tasks

- [ ] Raise `engines.node` to `>=22.13` in all five packages — the floor pnpm
      11.11 imposes, and the one CI can genuinely test.
- [ ] Add `.github/workflows/ci.yml`: trigger on `push` and `pull_request`;
      matrix Node `22.13` and `24`; `pnpm/action-setup` honouring
      `packageManager`; `pnpm install --frozen-lockfile`; `pnpm test`.
- [ ] Do **not** pass `registry-url` to `actions/setup-node` here either — keep
      the two workflows consistent so the option never gets copied into
      `release.yml` later.
- [ ] Add a test asserting the ci.yml matrix's lowest Node equals the
      `engines.node` floor, so the two cannot drift apart silently.
- [ ] Run the project's test command — green before the phase is done.

## Notes

Verified rather than assumed: in a clean `git worktree` with no `node_modules`
the suite discovers **1825 tests against 2353** and fails **41**. Tests require
workspace packages by name (`@skitterbyte/skitterspec-common/…`,
`@skitterbyte/skitterspec-sync-core`) plus `prompts`, and those resolve only via
pnpm's `node_modules/@skitterbyte/*` symlinks. npm cannot substitute on a
low-Node job: the repo has no `workspaces` field and no `package-lock.json`, so
`npm install` would not create them. Hence no no-install matrix, and hence the
floor raise.

The version bump that ships this breaking change happens in phase 5, via
`release.js` — this phase only changes the declared floor.
