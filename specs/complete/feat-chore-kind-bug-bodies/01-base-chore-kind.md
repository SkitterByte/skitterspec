---
github_issue_id: "#76"
---

# Phase 1 — Base engine: the `chore` kind ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `chore-foo` resolves to `{ type: 'chore', slug: 'foo' }` everywhere
the base engine reads a kind, proven by tests including a stays-silent one for
the unknown-prefix fallback.

## Tasks

- [x] Add `chore` to `splitPrefix` in `packages/common/src/env/resolve.js`
      (regex and the comment above it); keep the unknown-prefix fallback
      (`feat` + whole folder as slug) byte-identical.
- [x] Add `chore` to the spec-shaped argument check in
      `packages/common/src/cli.js` (`/^(feat|bug|hotfix)-./`).
- [x] Sweep `packages/common/src` for any other kind list or
      `feat-`/`bug-`/`hotfix-` prefix matching (e.g. header parsing, nospec
      naming, `spec-env up` validation) and widen each; the hotfix-only check
      at `cli.js` (`Type: Hotfix`) is correct as-is. (Sweep found only the two
      sites above — nothing else in `packages/common/src` matches kinds.)
- [x] Note beside `resolveSpecless` that a `chore-foo` spec and `/no-spec foo`
      both derive `chore/foo` — collision is surfaced by git refusing the
      existing branch (decision 9).
- [x] Tests: `chore-foo → { type: 'chore', slug: 'foo' }`; branch derives as
      `chore/foo` from the default pattern; stays-silent test — an unknown
      prefix (`junk-foo`) still resolves to `{ type: 'feat', slug: 'junk-foo' }`
      with no warning (`negative-checks.md` rule 3). Run the repo's typecheck
      and test commands — green before the phase is done. (2402 pass,
      `node --test` in `packages/common`.)

## Notes

The superset packages (`skitterspec-*`) vendor these files at build via
`scripts/build-dist.js` — no edits there.
