---
linear_issue_id: "SKS-156"
---

# Phase 2 — pin the state files `/spec-complete` depends on ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `.spec-env/connected` and `.spec-env/proxy.json` are written on connect
and removed on disconnect, proven by tests — because another skill reads the
first one to decide whether to disconnect before tearing a worktree down.

## Tasks

- [ ] Add `packages/common/test/cli-spec-env-connect.test.js`, driving the CLI
      against a git fixture in the style of `cli-spec-env-live.test.js`
      (`scaffoldRepo` + a spec + a worktree + `runQuiet`).
- [ ] Assert `connect main` **deletes** both `.spec-env/connected` and
      `.spec-env/proxy.json`, not merely that it prints "disconnected". Seed both
      files first so the deletion is observable — otherwise the test passes on a
      repo where they never existed, which is the vacuous version of this check.
- [ ] Assert `connect main` is a **clean no-op** when neither file exists: it
      says nothing was connected and throws nothing. The `unlinkSync` calls are
      wrapped in `try/catch` for exactly this case, and nothing tests it.
- [ ] Name the cross-skill contract in a comment: `/spec-complete` teardown step
      1 reads `.spec-env/connected` to decide whether to run `connect main`
      before removing a worktree. A reader changing this filename needs to find
      that from here.
- [ ] Cover the refusals end-to-end through the CLI **once** — a spec with no
      reserved ports — so the plumbing between probe, planner and output is
      exercised at least once. The exhaustive branch coverage is phase 1's, and
      this must not duplicate it.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before
      the phase is done.

## Notes

**Deliberately not covered:** an end-to-end connect that spawns the proxy.
`env-proxy.test.js` already starts a real proxy and drives HTTP, a 502 and a
WebSocket upgrade through it, and `env-supervise.test.js` covers
`startProcess`/`stopProcess` including the idempotent re-run. Repeating that
through the CLI would add the suite's most flake-prone test for coverage that
already exists. Phase 1's planner tests are what make the decisions safe; the
spawning is somebody else's covered problem.

If this phase finds the `connected` file is read anywhere else, add it to the
comment rather than leaving the contract documented in one direction only.
