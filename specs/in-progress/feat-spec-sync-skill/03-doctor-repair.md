# Phase 3 — `doctor --write` — repair behind a clean-tree guard ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync doctor --write` repairs config, stamps and snapshots in one
reviewable diff, refusing on a dirty tree — proven by a round-trip test where
`status` still reads `up to date` afterwards.

## Tasks

- [x] Add `--write` to `doctor`. Refuse on a dirty git tree, naming the offending
      paths, so the rewrite is always a single `git checkout -- .`-able diff.
      Follow the dirty-tree guard `spec-env integrate` already uses.
- [x] Repair together, never partially: `config.linear.teamKey`; the
      `linear_identifier` / `linear_issue_id` / `linear_url` frontmatter stamps;
      and the snapshot filenames under `sync.baseDir`.
- [x] `git mv` the snapshot files so history survives — never write-and-delete.
- [x] Rename the identifier-keyed entries **inside** each snapshot too. The
      hashes are content-derived and stay valid; only their keys move.
- [x] Refuse to repair any ref that phase 2 classified as **missing** — repair
      what resolves, report the rest, exit non-zero so a caller notices.
- [x] Extend `packages/linear/test/cli-doctor.test.js`: a dirty tree is refused
      with nothing written; a clean run rewrites config + stamps + snapshot
      names; `spec-sync status` reads `up to date` after the repair (the
      round-trip that proves the hashes survived); a missing ref is left alone
      and reported.
- [x] Surface `doctor` in the `/spec-sync` skill from phase 1 — read by default,
      `--write` only on explicit confirmation, stating the file counts first.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Verified by hand in `~/code/ereqs` that this sequence is sound: after restamping
config + 221 refs across 54 files + 33 snapshot filenames, `spec-sync status`
still read `up to date`. That round-trip is the assertion worth encoding.

`--write` deliberately does not commit — see decision 7.
