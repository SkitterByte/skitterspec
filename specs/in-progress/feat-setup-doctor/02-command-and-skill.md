# Phase 2 — The command, and the skill that runs it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec spec-sync doctor` reports every layer of a real project,
and `/spec-linear-setup` finishes by running it.

## Tasks

- [x] Gather the real state (config load, `resolveApiKey`, scaffold probe) and
      feed `runChecks`; add the `doctor` case to the `cli-sync.js` dispatch and
      its usage string.
- [x] Render the aligned table from the overview, with the `fix` line indented
      under any row that needs it, and a one-line summary.
- [x] Add `--json` emitting the `runChecks` payload verbatim.
- [x] Exit non-zero when any check is `broken`, so a skill can branch without
      parsing prose. A `missing` opt-in alone exits 0.
- [x] Reuse the credentials `fingerprint` for the key row — masked, with its
      source. Assert no test output ever contains a key.
- [x] End `/spec-linear-setup` by running `doctor` and reporting the table, in
      place of its hand-written summary of what it did and did not configure.
- [x] Name `doctor` in `SETUP.md` as the "did it work?" step.
- [x] Add `packages/linear/test/cli-doctor.test.js` over scaffolded temp
      projects: a bare dir, a scaffolded-only dir, a fully configured one; assert
      exit codes, that `--json` parses, and that a key never appears.
- [x] Dispatch `doctor` **before** the config load, beside `init-config`: the
      loader throws on malformed JSON and the dispatcher short-circuits when no
      config exists, so a doctor behind it could never report the two states it
      most needs to.
- [x] Generalise the stale-verb asset guard: every `skitterspec spec-sync <verb>`
      named in a shipped asset must be dispatched by `cli-sync.js`. It replaces
      the ban on the literal string `spec-sync doctor`, which had started
      blocking this feature's own command.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

The skill change is the point of the feature: it replaces prose about what setup
did with a check of what is actually true, which is the difference between a
summary and a verification.
