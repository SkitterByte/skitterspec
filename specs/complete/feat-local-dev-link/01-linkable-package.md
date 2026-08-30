# Phase 1 — Make a linked package build and fail clearly ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `pnpm add <pkg>@link:…` yields a working package, and a package whose
build output is missing says so instead of raising a module-resolution error.

## Tasks

- [x] Add `"prepare": "node ../../scripts/build-dist.js <name>"` to both
      `packages/skitterspec/package.json` and
      `packages/skitterspec-linear/package.json`, alongside the existing
      `prepack`.
- [x] Confirm `prepare` is safe in this repo: it runs on `pnpm install` for both
      workspace packages, and `build-dist` is documented as deterministic and
      idempotent, so a rebuild on every install must be a no-op in content terms.
      Time it — if it is slow enough to be felt on install, say so here.
- [x] Make each `bin/*.js` entry point detect missing build output and exit
      non-zero with `run "npm run build" in the skitterspec repo — this package's
      bin/src/assets are composed, not committed`. The bin itself is generated,
      so the check belongs in whatever `build-dist` composes it from.
- [x] Verify the published path is unchanged: `prepare` runs before `prepack`, so
      a publish still builds exactly once from clean.
- [x] Add tests: both distribution package.jsons carry `prepare` pointing at
      their own dist name; a package.json that gains `prepack` without `prepare`
      fails. Extend the release/build tests rather than adding a new file if one
      fits. Run `node --test` — green before the phase is done.

- [x] **Added mid-phase:** `scripts/dev-link.js` + `npm run dev:link
      <consumer> [dist]`, which builds and *then* links. Needed because `prepare`
      turned out not to cover the link case at all (see below).

## Notes

`prepack` does not fire on install-from-directory, which is why a link target
comes up empty; `prepare` is the hook that does. Both are kept because they mean
different things — `prepare` covers install and publish, `prepack` is the
publish-only guarantee that the tarball is built from source.

The bin guard matters because `prepare` does not save you from a `git clean` or an
interrupted build afterwards, and that failure is otherwise indistinguishable from
a broken install.

## What testing changed

The phase assumed `prepare` would make a link target build itself. **It does
not** — verified, not reasoned:

- **pnpm does not run `prepare` for a `link:` dependency.** Linked an unbuilt
  package into a throwaway consumer: the dist stayed empty.
- **The failure is worse than the spec described.** With no `bin/` at link time
  there is nothing for pnpm to make a shim from, so `node_modules/.bin/` comes up
  *empty* and the symptom is `command not found` — never the `MODULE_NOT_FOUND`
  the guard was written for.
- **`pnpm install` at the repo root does not build them either.**

So `prepare` alone could not deliver the goal, and the guard alone could not
report it. Hence `dev:link`: it builds first and then links, which is the only
ordering that produces a working bin. Confirmed end to end from a deliberately
unbuilt state — bin present, `--help` runs.

`prepare` is **kept**: it is still the correct hook for npm-style
install-from-directory and runs before `prepack` on publish. It is now documented
as partial rather than sufficient.

The **guard still earns its place**, just for a narrower case than intended:
built, linked, and *then* cleaned. The shim exists and points at nothing, and the
guard is what turns that into a sentence. Verified by running the real bin with no
sibling `src/`.

Build cost of `prepare`: **47ms** for both distributions — no reason to avoid it
on install.
