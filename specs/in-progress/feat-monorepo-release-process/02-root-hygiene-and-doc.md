# Phase 2 — Root hygiene + `RELEASING.md` + first-release handoff ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The sanctioned release path (`release.js`) is the *only* path — the
stale root scripts are gone, `npm version` at the private root is blocked, and
`RELEASING.md` documents the flow. Proven by tests over the root package.json
shape + guard, and by a verified dry-run plan for each first release.

## Tasks

- [ ] Remove the root `package.json` scripts `version`, `changelog`, `releases`,
      `changelog:retro`, `releases:retro` (single-package-era, target the private
      `0.0.0` root). Keep `build` and `test`. Add a convenience
      `"release": "node scripts/release.js"`.
- [ ] Add a `preversion` guard: a `scripts/no-root-version.js` (or equivalent)
      wired as the root `preversion` script that prints "run scripts/release.js —
      never `npm version` at the monorepo root" and exits non-zero, so
      `npm version` at the root fails fast.
- [ ] Write `RELEASING.md` at the repo root: the per-package flow
      (`node scripts/release.js <pkg> <bump> [--publish]`), the `name@version` tag
      scheme, plan-by-default + `--publish`, `--access public` for scoped
      packages, publish order (independent; base before linear when both), "never
      run `npm version` at the root", "push tags yourself (`git push --tags`)",
      and a one-line note that changelog/release-note generation is deferred to a
      later spec.
- [ ] Point contributors at it — a short "Releasing" link from the root
      `README`/`CONTRIBUTING` if one exists (skip if neither is the right home).
- [ ] Generate and capture the **dry-run plans** for both first releases
      (`skitterspec 2.0.0`, `skitterspec-linear 1.0.0`) to confirm the tool
      produces the correct tags/commands end-to-end on the real repo. Publishing
      itself is the operator's `--publish` step (see overview handoff) — not done
      here.
- [ ] Add/extend tests: assert the root `package.json` no longer carries the
      removed scripts and that `preversion` is present; assert the guard exits
      non-zero. Run the project's typecheck + test commands — green before the
      phase is done.

## Notes

- The guard closes the specific hole that bumped `0.0.0 → 1.0.0`: it makes the
  private root refuse the very command that misfired.
- `RELEASING.md` is a repo doc, not shipped — the published packages exclude it
  via their `files: [bin, src, assets]`.
