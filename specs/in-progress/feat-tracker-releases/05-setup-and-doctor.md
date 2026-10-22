# Phase 5 — Setup step, CI wiring offer, doctor ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a repo already connected to Linear adopts Releases by re-running
`/spec-linear-setup`, and doctor tells whether the wiring is real.

## Tasks

- [x] ~~`init-config`~~ `release link` (see Changelog): repeatable
      `--release-pipeline <prefix>=<pipelineId>` and
      `--release-env <prefix>:<env>=<stage>`, plus
      `--release-initial <prefix>=<env>`, validated against Linear's pipelines
      and their stages.
- [x] Add a `spec-sync release pipelines --json` listing, used by setup.
      "Unavailable (plan/permission)" degrades to the ladder offer and never
      fails setup.
- [x] Add a Releases step to `/spec-linear-setup` (next to step 7), offered
      instead of the ladder when pipelines exist. Re-running on an existing
      config offers this step alone, without the whole interview.
- [x] CI offer: show the diff of the `release create` step for the
      tag-triggered workflow, and write it only on a yes. Name the secret
      (`auth.keyEnv`) for the user to add themselves.
- [x] Doctor: configured pipelines exist, stage names valid, key has release scope.
      Warn when the ladder and releases are both set. Cannot-tell stays silent.
      (Write scope is not checkable without a write; the row says so.)
- [x] Update `linear.config.md` and `ci-stages.md`: Releases first, the
      ladder as the fallback.
- [x] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

- `release pipelines` always exits 0. `available` is `true`, `false` (Linear
  refused) or `unknown` (no key, unreachable, or an empty list, since Linear
  answers `[]` when Releases is off).
- The setup skill's new step 7a comes before the ladder (step 7), and step 8a
  links and offers the CI diff. A re-run on an existing config offers only 7a
  and 8a. The skill points at `ci-stages.md` for the YAML rather than fencing
  it, which the reader-fence guard forbids.
