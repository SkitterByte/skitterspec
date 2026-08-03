# Phase 1 — Coordination primitive: guard + receipt + `live status` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Land the primitive the whole feature rests on — a reusable
"is the primary checkout on the base branch?" guard, a `.spec-env/live.json`
receipt read/write, and a read-only `spec-env live status`. Proven by unit tests
on the pure helpers plus a `status` CLI test.

## Tasks

- [ ] Add `assertPrimaryOnMain(dir)` / `currentPrimaryBranch(dir)` to
      `packages/common/src/env/resolve.js` — resolve the primary checkout
      (reuse `resolvePrimaryCheckout`), read its current branch
      (`git symbolic-ref --short HEAD`), compare against the resolved base branch
      (`baseBranch` or auto-detected). Return a structured `{ onBase, branch,
      baseBranch }`, not a throw, so callers choose the message.
- [ ] Create `packages/common/src/env/live.js` (pure) — receipt shape
      `{ spec, branch, holder, heldSince, baseMainCommit }`, and pure helpers:
      `readReceipt(state)`, `renderReceipt(fields)`, `receiptPath(config)`
      (`.spec-env/live.json`, gitignored, primary-checkout-root like the registry).
      Keep IO (actual file read/write) in `cli.js`, matching the registry pattern.
- [ ] Wire `spec-env live` dispatch in `cli.js` (`specEnvLive(rest)`), anchored on
      the primary checkout and no-op-with-message when `env.config.json` is absent
      (opt-in, like the other `spec-env` verbs). Implement the `status` subcommand:
      print the primary checkout's current branch, whether it's on base, and the
      receipt (holder / heldSince / spec) if present.
- [ ] Add `.spec-env/live.json` to the gitignore handling alongside the registry
      (confirm `.spec-env/` is already ignored; extend if the receipt needs it).
- [ ] Add tests: `packages/common/test/env-live.test.js` (receipt render/read,
      `assertPrimaryOnMain` on-base vs on-feature) and a `status` case in a
      `cli-spec-env-live.test.js`. Run `pnpm test` (single file:
      `node --test packages/common/test/env-live.test.js`) — green before done.
      (No separate typecheck — the repo is plain JS.)

## Notes

Follow the existing pure-planner + CLI-seam split (`env/*.js` return
data/commands; `cli.js` + `supervise.js` do IO). Mirror `env-registry.js` /
`env-resolve.js` test style.
