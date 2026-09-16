---
linear_issue_id: "SKS-286"
---

# Phase 1 — `none` is a first-class ownership value ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a repo can declare it does not own a synced field, and every reader
already knows what that means — proven by a config setting `assignee: "none"`
pushing nothing and reporting nothing.

## Tasks

- [x] Add `'none'` to `OWNERSHIP` (`packages/linear/src/config.js:39`) and to the
      two doc comments naming the enum (`config.js:14`, `config.js:28`).
- [x] Make `toFieldSet` (`packages/sync-core/src/normalize.js:493`) skip any
      field whose ownership is `none`, so the key is **absent** from the
      projection rather than present and null. Name the blind spot beside it:
      a present-but-null key is what `compare.js` reads as "owned, currently
      nobody".
- [x] Key the doctor state-gather on the value, not the key's presence
      (`packages/linear/src/cli-sync.js:1027` — `'assignee' in …` becomes an
      is-owned test).
- [x] Update the `identity` row's skip reason in
      `packages/linear/src/doctor.js:279` to name the value.
- [x] Tests: a `none` config projects no `assignee` key; writes no `assignee`
      hash into the snapshot (`compare.js:71` follows from the projection);
      prints no assignee line in `status --remote` (`cli-sync.js:621`); and
      `mergeFieldOwnership` still throws on a value outside the enum.
- [x] **Stays-silent test:** a repo owning `assignee` normally — a healthy
      opted-in config with a stamped spec — is unchanged by this phase: the
      plan still carries the assignee, the snapshot still records its hash, and
      `doctor` still reports the identity row.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**One predicate, exported.** The tasks named three call sites that each had
to stop testing for the key. Rather than write the same condition three
times, `ownsField(config, field)` lives in `sync-core/src/normalize.js` and
is exported from the package index; `toFieldSet` and both linear call sites
ask it. The reason is in its doc comment: `field in fieldOwnership` reads
correct and silently becomes "always true" the moment phase 3 makes the
field owned by default, so the two call sites would have drifted apart
exactly when it mattered.

Decisions 2, 3 and 4. The point of doing this first is that `undefined` is
already the whole vocabulary for "not in play" everywhere downstream — this
phase only has to make one more config value produce it.
