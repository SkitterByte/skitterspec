---
linear_issue_id: "SKS-332"
---

# Phase 3 — Detect a description edited on Linear ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine can tell a human edit from Linear's own reformatting, proven
by a test that feeds it a healthy mirror Linear has reserialised and asserts it
says nothing.

## Tasks

- [ ] Export `stream` from `packages/sync-core/src/verify.js` through the package
      index so `compare.js` can use it without duplicating the reduction.
- [ ] Add `descriptionStream: hashField(stream(p.description ?? ''))` to
      `specIssueFieldHashes` in `packages/sync-core/src/compare.js`, beside the
      existing `description` hash and documented as serving a different question:
      one decides what to push, the other decides whether someone else has been
      here.
- [ ] Confirm the new key cannot affect `planChanges` — it must never make a
      push pending on its own. Add a test asserting an unchanged spec with a
      freshly-written snapshot still plans nothing.
- [ ] Add a pure `remoteDescriptionEdited(snapshot, remote)` helper returning
      `true` · `false` · `null` for cannot-tell, with the three cannot-tell cases
      enumerated in a comment: no `issueFields.descriptionStream` in the snapshot
      (every pre-upgrade snapshot), no `description` key on the remote, a
      `description` that is not a string.
- [ ] Add `packages/sync-core/test/sync-remote-description-edit.test.js` covering:
      a genuinely edited description returns `true`; an identical one returns
      `false`; each cannot-tell case returns `null`.
- [ ] **The stays-silent test** — feed it a description Linear has reserialised
      (unordered markers rewritten to `*`, an ordered list renumbered, a table
      separator row collapsed, trailing whitespace trimmed, blank runs collapsed)
      and assert `false`, not `true`. This is the check's whole risk: a strict
      hash would accuse every intact mirror.
- [ ] Add a second stays-silent test at the snapshot boundary — a snapshot
      written before this phase, with no `descriptionStream`, returns `null` and
      produces no output anywhere.
- [ ] Run `node --test` from the repo root — green before the phase is done.

## Notes

`stream()` discards everything that is not a letter or digit, which is what makes
it tolerant enough. The cost is that an edit consisting **only** of punctuation
or formatting is invisible to this check. That is the correct trade here: the
alternative is a false accusation on every push, and `negative-checks.md` rule 4
routes the unknown case to the harmless branch.
