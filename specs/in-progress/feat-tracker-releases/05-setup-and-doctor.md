# Phase 5 — Setup step, CI wiring offer, doctor ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a repo already connected to Linear adopts Releases by re-running
`/spec-linear-setup`, and doctor tells whether the wiring is real.

## Tasks

- [ ] `init-config`: repeatable `--release-pipeline <prefix>=<pipelineId>`
      and `--release-env <prefix>:<env>=<stage>`, plus
      `--release-initial <prefix>=<env>`, validated against the listed
      pipelines and their stages.
- [ ] Add a `spec-sync release pipelines --json` listing, used by setup.
      "Unavailable (plan/permission)" degrades to the ladder offer and never
      fails setup.
- [ ] Add a Releases step to `/spec-linear-setup` (next to step 7), offered
      instead of the ladder when pipelines exist. Re-running on an existing
      config offers this step alone, without the whole interview.
- [ ] CI offer: show the diff of the `release create` step for the
      tag-triggered workflow, and write it only on a yes. Name the secret
      (`auth.keyEnv`) for the user to add themselves.
- [ ] Doctor: configured pipelines exist, stage names valid, key has release scope.
      Warn when the ladder and releases are both set. Cannot-tell stays silent.
- [ ] Update `linear.config.md` and `ci-stages.md`: Releases first, the
      ladder as the fallback.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.
