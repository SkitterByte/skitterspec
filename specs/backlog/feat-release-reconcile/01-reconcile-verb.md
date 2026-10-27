---
github_issue_id: "#47"
---

# Phase 1 — Reconcile verb: move staged releases that are live on npm ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync release reconcile` moves every marked release whose version
is live (or contained in a newer live version) to the series' final env and
completes it, dry-run by default — proven by kit tests over a fake adapter and
a fake registry.

## Tasks

- [ ] Add `releaseList()` to the GitHub adapter (`packages/github/src/api.js`):
      paginated `GET /releases`, returning the same shape `releaseOf` gives
      `releaseFind`. Feature-detect it in the kit like the other release ops.
- [ ] Extend `releaseComplete(release, { latest })` in the adapter — map
      `latest` onto `make_latest: 'true' | 'false'`; default stays today's
      behaviour when the option is absent.
- [ ] Add the npm registry probe to `provider-kit/src/releases.js`: fetch
      `https://registry.npmjs.org/<encodeURIComponent(name)>` once per series,
      return the live-version set. Injectable fetch for tests. A missing
      version is "not yet"; a failed/404 package fetch or a series without
      `npm` is a cannot-tell — skip the series with one line, exit 0, and name
      the blind spot in a comment (private packages and registry lag both look
      like absence).
- [ ] Implement `reconcile(dir, config, flags, out)` in the kit and wire it
      into `makeReleaseCommands` + the usage line: enumerate marked releases,
      group by series via `tagPrefix` (longest-first, as `seriesFor`), semver-
      compare the tail, decide moves by exact-or-contained, process ascending,
      move via the existing deployed path (field set over the tag's own range +
      stage marker update), then complete with `latest` only on the series'
      newest live release. `--apply` gates all writes; dry run prints the same
      plan.
- [ ] Wire the verb in `packages/github/src/cli-sync.js` (and confirm the
      vendored copies regenerate via the existing compose/build step rather
      than by hand-editing `src/vendor/`).
- [ ] Add `packages/provider-kit/test/releases.test.js` coverage: moves an
      exact-live release; moves a contained (superseded) release; keeps a
      not-yet-published one silently; skips a series with no `npm` key and a
      registry that errors, exit 0 both ways (stays-silent tests, negative-
      checks rule 3); completes with `latest` only on the newest; ignores
      releases without the marker; dry run writes nothing.
- [ ] Extend `packages/github/test/release.test.js` for `releaseList`
      pagination and the `releaseComplete` latest option.
- [ ] Run the repo typecheck/test commands: `pnpm test` — green before the
      phase is done.

## Notes

- The marker regex and `stageOf`/`withStage` already exist in the kit — reuse
  them; do not parse release bodies a second way.
- `semver` ordering: versions here are validated `x.y.z` (release.yml enforces
  it), so a numeric three-part compare suffices — no new dependency.
