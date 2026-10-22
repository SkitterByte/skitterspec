# Phase 3 — `release create <tag>` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** CI turns a pushed tag into a Linear release that holds exactly that
release's tickets, and running it again on the same tag changes nothing.

## Tasks

- [x] Resolve the range as previous tag in the series → this tag (Decision 5),
      reusing `readCommitRange`. Report a first release and a shallow clone
      explicitly.
- [x] Partition the tickets with `ticketsInRange` + `partitionStageMoves`.
      Attach movable + unfinished, and report foreign and unlinked (Decision 6).
- [x] Create-or-update with one `releaseSync` (idempotent per version, phase 1),
      then read the release's issues back. Report every sent ref that did not
      attach; Linear drops unresolvable refs with `success: true`. Refuse when
      the sync itself fails (Decision 4).
- [x] Flags: `--notes <file>`, repeatable `--link <url>[=label]`, `--env <key>`
      for the initial stage (`--stage` is the ladder's init-config flag), `--apply`, `--json`. Without `--apply`, print the
      plan and write nothing.
- [x] Wire `release` into `cli-sync.js` dispatch and `--help`. Refuse with one
      line on a provider without the seam.
- [x] Tests: a hotfix tag ranging from its base; a re-run producing no change;
      bookkeeping-only commits ignored; a foreign ref never attached.
- [x] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

- The command lives in `linear/src/cli-release.js`. cli-sync dispatches to it
  and passes in `readCommitRange` and `listSpecs`, so the shallow-clone guard is
  the same one `released` uses.
- `--from <ref>` names the base explicitly. With no earlier tag in a **shallow**
  clone the command refuses rather than guessing: a clone that never fetched
  tags would otherwise attach every ticket ever shipped. In a full clone it
  reports a first release.
- An untracked tag exits 0 (`not a tracked series`), because a workflow that
  runs on every tag will reach them. A ref Linear drops is a `WARNING` line and
  an `unattached` list in `--json`, still exit 0: the release is created and the
  gap is named, so a typo'd trailer never blocks a deploy.
- A dry run on this repo's real tags worked (`skitterspec@23.0.0..23.0.1` →
  SKS-400). Both package series attach SKS-400, because nothing filters commits
  by package path yet. That is a follow-up.
