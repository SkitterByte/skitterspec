# Phase 2 — The command, and the skill that runs it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-sync doctor` reports every layer of a real project,
and `/spec-linear-setup` finishes by running it.

## Tasks

- [ ] Gather the real state (config load, `resolveApiKey`, scaffold probe) and
      feed `runChecks`; add the `doctor` case to the `cli-sync.js` dispatch and
      its usage string.
- [ ] Render the aligned table from the overview, with the `fix` line indented
      under any row that needs it, and a one-line summary.
- [ ] Add `--json` emitting the `runChecks` payload verbatim.
- [ ] Exit non-zero when any check is `broken`, so a skill can branch without
      parsing prose. A `missing` opt-in alone exits 0.
- [ ] Reuse the credentials `fingerprint` for the key row — masked, with its
      source. Assert no test output ever contains a key.
- [ ] End `/spec-linear-setup` by running `doctor` and reporting the table, in
      place of its hand-written summary of what it did and did not configure.
- [ ] Name `doctor` in `SETUP.md` as the "did it work?" step.
- [ ] Add `packages/linear/test/cli-doctor.test.js` over scaffolded temp
      projects: a bare dir, a scaffolded-only dir, a fully configured one; assert
      exit codes, that `--json` parses, and that a key never appears.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The skill change is the point of the feature: it replaces prose about what setup
did with a check of what is actually true, which is the difference between a
summary and a verification.
