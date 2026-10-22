---
github_issue_id: "#27"
---

# Phase 3 — `release create <tag>` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** CI turns a pushed tag into a Linear release that holds exactly that
release's tickets, and running it again on the same tag changes nothing.

## Tasks

- [ ] Resolve the range as previous tag in the series → this tag (Decision 5),
      reusing `readCommitRange`. Report a first release and a shallow clone
      explicitly.
- [ ] Partition the tickets with `ticketsInRange` + `partitionStageMoves`.
      Attach movable + unfinished, and report foreign and unlinked (Decision 6).
- [ ] Find-or-create by pipeline + version. Update on a match, and refuse on a
      failed lookup (Decision 4).
- [ ] Flags: `--notes <file>`, repeatable `--link <url>[=label]`, `--stage <env>`
      for the initial stage, `--apply`, `--json`. Without `--apply`, print the
      plan and write nothing.
- [ ] Wire `release` into `cli-sync.js` dispatch and `--help`. Refuse with one
      line on a provider without the seam.
- [ ] Tests: a hotfix tag ranging from its base — both shapes `spec-env hotfix
      land` cuts, `<root>-hotfix.N` and a `hotfix.bump: patch` next patch; a
      cherry-picked hotfix ref attaching again in the next mainline range (the
      fix ships in both); a re-run producing no change; bookkeeping-only commits
      ignored; a foreign ref never attached.
- [ ] Add/extend tests covering this phase; run `pnpm test`
      (see `.claude/rules/spec-planning.md`) — green before the phase is done.
