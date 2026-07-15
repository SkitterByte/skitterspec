# Phase 1 — The `release.js` script ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A zero-dep `scripts/release.js` that plans a per-package release by
default, executes the local bump+commit+tag on confirmation, and publishes only
with `--publish` — never pushing git. Proven by unit tests over its pure planning
and guard logic, with no publish/tag side effects.

## Tasks

- [ ] Add `scripts/release.js` (CommonJS, zero-dep, matches `build-dist.js`
      style). Export pure helpers and gate the CLI behind
      `if (require.main === module)`.
- [ ] **Package resolution:** map `skitterspec` / `skitterspec-linear` to their
      `packages/<name>` dir and npm name `@skitterbyte/<name>`; read the current
      version from that package's `package.json`. Refuse any other name with a
      clear error listing the valid ones.
- [ ] **Version computation (pure):** `patch`/`minor`/`major` bump or an explicit
      `x.y.z`; validate semver. Reject a target that is not strictly greater than
      the current version.
- [ ] **Plan builder (pure):** given package + bump, return a structured plan —
      next version, tag `name@version`, and the ordered command list (npm version,
      git add/commit/tag, and the publish + `git push --tags` commands). This is
      the unit-test seam; it performs no I/O beyond reading package.json.
- [ ] **Default = plan only:** a bare `release.js <pkg> <bump>` prints the plan
      and changes nothing.
- [ ] **Execute path (confirmed):** run `npm version --no-git-tag-version -w <pkg>
      <bump>`, `git add <pkg>/package.json`, `git commit`, `git tag name@version`.
- [ ] **`--publish`:** run `npm publish -w @skitterbyte/<pkg> --access public`
      (prepack builds the dist). Never run `git push`; print `git push --tags`.
- [ ] **Guards (all fail closed, before any mutation):** dirty working tree;
      tag `name@version` already exists; unknown package; non-increasing version.
      Each raises a distinct, testable error.
- [ ] Add `scripts/release.test.js` (`node --test`): cover package resolution,
      version computation (each bump + explicit + invalid), plan shape (tag name,
      command ordering, `--access public` present, no `git push`), and every
      guard — all via the pure functions / plan mode, with **no** real
      publish/tag/commit. Run the project's typecheck + tests — green before the
      phase is done.

## Notes

- Keep side-effecting git/npm calls in thin wrappers around `execSync` so the
  pure planning stays trivially testable; tests never enter the execute/publish
  branches.
- The plan object doubles as the printed output (format it for humans) and the
  test assertion target — one source of truth for "what a release does".
