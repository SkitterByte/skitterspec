# Phase 1 — Make a linked package build and fail clearly ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `pnpm add <pkg>@link:…` yields a working package, and a package whose
build output is missing says so instead of raising a module-resolution error.

## Tasks

- [ ] Add `"prepare": "node ../../scripts/build-dist.js <name>"` to both
      `packages/skitterspec/package.json` and
      `packages/skitterspec-linear/package.json`, alongside the existing
      `prepack`.
- [ ] Confirm `prepare` is safe in this repo: it runs on `pnpm install` for both
      workspace packages, and `build-dist` is documented as deterministic and
      idempotent, so a rebuild on every install must be a no-op in content terms.
      Time it — if it is slow enough to be felt on install, say so here.
- [ ] Make each `bin/*.js` entry point detect missing build output and exit
      non-zero with `run "npm run build" in the skitterspec repo — this package's
      bin/src/assets are composed, not committed`. The bin itself is generated,
      so the check belongs in whatever `build-dist` composes it from.
- [ ] Verify the published path is unchanged: `prepare` runs before `prepack`, so
      a publish still builds exactly once from clean.
- [ ] Add tests: both distribution package.jsons carry `prepare` pointing at
      their own dist name; a package.json that gains `prepack` without `prepare`
      fails. Extend the release/build tests rather than adding a new file if one
      fits. Run `node --test` — green before the phase is done.

## Notes

`prepack` does not fire on install-from-directory, which is why a link target
comes up empty; `prepare` is the hook that does. Both are kept because they mean
different things — `prepare` covers install and publish, `prepack` is the
publish-only guarantee that the tarball is built from source.

The bin guard matters because `prepare` does not save you from a `git clean` or an
interrupted build afterwards, and that failure is otherwise indistinguishable from
a broken install.
