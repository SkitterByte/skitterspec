---
linear_issue_id: "SKS-39"
---

# Phase 1 — `spec-sync ref` and the trailer rule ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a commit made on a spec's branch can carry `Refs: <KEY-N>`, with the
ref resolved by one command rather than by hand, proven by tests over the
branch→spec mapping and its no-ref cases.

## Tasks

- [x] Add `spec-sync ref [--json]` to `packages/linear/src/cli-sync.js`: resolve
      the current git branch back to its spec and print that spec's
      `linear_identifier`.
- [x] Resolve by **inverting `branch.pattern`**, not by guessing: for each spec
      under `specs/**`, expand its branch with the existing helpers in
      `packages/common/src/env/resolve.js` and match against the current branch.
      Reuse them rather than re-deriving the pattern — a second implementation
      would drift from the one `/spec-go` provisions with.
- [x] Exit non-zero, with a reason, in each no-ref case: not on a spec branch
      (e.g. `main`), the spec is not linked to Linear, or git is unavailable.
      Print nothing on stdout in those cases, so `$(spec-sync ref)` in a script
      yields an empty string rather than an error message.
- [x] Add `packages/linear/assets/rules/commit-trailers.md`: state the
      `Refs: <KEY-N>` trailer, that it goes below the `Release-Note:` footer,
      that it is **omitted entirely** when there is no ref, and that
      `spec-sync ref` supplies it. Say explicitly that Linear's magic words
      (`Fixes`, `Closes`) must not be used, and why.
- [x] Verify the rule ships only in the Linear distribution: `pnpm build`, then
      assert it is present under `packages/skitterspec-linear/assets/rules/` and
      **absent** from `packages/skitterspec/assets/rules/`.
- [x] Add `packages/linear/test/cli-ref.test.js`: a linked spec's branch resolves
      to its identifier; `main` exits non-zero with empty stdout; an unlinked
      spec exits non-zero naming the spec; `--json` carries `{ref, spec, branch}`.
- [x] Extend `packages/linear/test/assets.test.js` to pin the rule's content —
      the trailer key, the no-ref instruction, and the magic-words prohibition.
- [x] Add the missing `assets/rules` overlay to `scripts/build-dist.js` — it
      overlaid only `skills` and `core`, so the rule never reached the
      distribution — and pin it in `scripts/build-dist.test.js` in both
      directions (superset ships and installs it; base does not).
- [x] Run `pnpm test` — green before the phase is done.

## Notes

The no-ref cases are the ones worth getting right. A commit on `main`, or on a
spec kept deliberately local, has no ticket — and a command that invented one, or
that printed an error onto stdout where a shell would splice it into the commit
message, would be worse than no command at all.

Rules are discovered dynamically (`listRules`) and provider assets are overlaid
by `build-dist.js`, so no installer change is needed — but the build check above
is what proves the base distribution stays tracker-free.
