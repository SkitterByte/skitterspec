# Phase 1 — Coordination primitive: guard + receipt + `live status` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Land the primitive the whole feature rests on — a reusable
"is the primary checkout on the base branch?" guard, a `.spec-env/live.json`
receipt read/write, and a read-only `spec-env live status`. Proven by unit tests
on the pure helpers plus a `status` CLI test.

## Tasks

- [x] Add `currentBranch(git)` + `assertPrimaryOnMain(config, git)` to
      `packages/common/src/env/resolve.js` — read the checkout's current branch
      (`git symbolic-ref --short HEAD`), compare against the resolved base branch
      (`resolveBaseBranch`). Returns a structured `{ onBase, branch, baseBranch }`,
      not a throw, so callers choose the message. The CLI binds `git` to the
      primary checkout (dispatch already anchors there).
- [x] Create `packages/common/src/env/live.js` — receipt shape
      `{ spec, branch, holder, heldSince, baseMainCommit }`, with pure
      `renderReceipt`/`receiptPath`/`summarizeReceipt` and thin
      `readReceipt`/`writeReceipt`/`clearReceipt` IO. Receipt sits beside the
      registry (`.spec-env/live.json`, gitignored, primary-checkout-root).
- [x] Wire `spec-env live` dispatch in `cli.js` (`specEnvLive`), anchored on the
      primary checkout, inheriting the opt-in `env.config.json` no-op from the
      shared `specEnv` dispatch. Implement `status`: prints the primary checkout's
      current branch, whether it's on base (free vs feature-in-control), and the
      receipt summary.
- [x] Confirm `.spec-env/live.json` is gitignored — `/.spec-env/` (`.gitignore:17`)
      already covers it; no change needed.
- [x] Add tests: `packages/common/test/env-live.test.js` (receipt render/read/
      write/clear/summarize + `assertPrimaryOnMain` on-base / off-base / detached)
      and `cli-spec-env-live.test.js` (`status` free, worktree-anchored, and
      feature-in-control-with-receipt). `pnpm test` green — 345 pass, 0 fail.
      (No separate typecheck — the repo is plain JS.)

## Notes

Follow the existing pure-planner + CLI-seam split (`env/*.js` return
data/commands; `cli.js` + `supervise.js` do IO). Mirror `env-registry.js` /
`env-resolve.js` test style.
