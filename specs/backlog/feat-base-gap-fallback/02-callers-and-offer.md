---
github_issue_id: "#232"
---

# Phase 2 — Every caller honours the pin and carries the offer ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every command that resolves the base reads the pin through one helper,
refuses with the offer when there is none, and shows `(pinned for the gap)`
when it used one — proven by CLI tests across a read path, a write path and
the hook.

## Tasks

- [ ] Route every `resolveBaseBranch` caller in `cli.js`, `env/serve.js` and
      `ideacmd.js` through one helper that loads the pin and deletes it when
      stale.
- [ ] Refusal output: text prints the offer's label and command under the
      reason; `--json` refusals carry `offer` in the `offered-unblocks.md`
      shape (`review`, `review wait`, `status`, `resolve`, `up`, `nospec`,
      `integrate`, `idea`).
- [ ] Base line: `review` (page and text), `status`, `resolve` and `integrate`
      plans say `base: <b> — no <pattern> branch on <remote> (pinned for the
      gap)` when `how === 'gap-pin'`.
- [ ] Main guard, served epic page and dashboard: unchanged before a pin
      (cannot-tell / fail open); with a pin, resolve to the pinned base.
- [ ] Rebuild the provider distributions (`pnpm build`) so their copies of
      `resolve.js`/`config.js`/`cli.js` match.
- [ ] Tests: a review and an `up` in the gap refuse with the offer, then succeed
      after `base --use-fallback`; the main guard refuses a write on master only
      once pinned; stays-silent — a project without a pattern sees no offer and
      no pin line anywhere.
- [ ] Run `pnpm test` — green before the phase is done.
