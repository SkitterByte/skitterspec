---
linear_issue_id: "SKS-249"
---

# Phase 1 — Correct the publish metadata, guarded by a test ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** every package's `repository` field matches the git remote exactly, and
a test fails if it ever drifts again.

## Tasks

- [ ] Correct `repository.url` to `git+https://github.com/SkitterByte/skitterspec.git`
      in `packages/common`, `packages/skitterspec`, `packages/skitterspec-linear`
      — the case is what npm validates the sigstore bundle against.
- [ ] Add the same `repository` block to `packages/linear` and
      `packages/sync-core`, which currently have none.
- [ ] Add `"directory": "packages/<name>"` to every package's `repository` — the
      correct monorepo metadata, and what makes npm link the right subtree.
- [ ] Check `scripts/compose.js` / `build-dist.js`: confirm whether a dist
      package.json is rewritten at prepack, and if so that it carries the
      corrected `repository` through rather than regenerating a stale one.
- [ ] Add a test asserting, for every workspace package, that `repository.url`
      equals the `origin` remote normalised to `git+https://…​.git` — compared
      **case-sensitively**, since that is the failure being guarded.
- [ ] Add a stays-silent test for that check: a package legitimately without a
      `repository` field (if any remain) must not be accused
      (`.claude/rules/negative-checks.md`).
- [ ] Run the project's test command — green before the phase is done.

## Notes

The lowercase URL is already published in 18.0.0 and 12.0.0 on npm, and neither
carries `dist.attestations`. Nothing retroactive is possible; this corrects it
going forward so the first signed publish does not 422 with
`Error verifying sigstore provenance bundle: Failed to validate repository
information`.

This phase ships no behaviour, so no `Release-Note:` — the user-facing note rides
on the major in phase 5.
