# Phase 4 — Report the drift, and correct the docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a remotely-edited description is named by `/spec-status` and warned
about by `/spec-push`, and the docs stop promising a one-way mirror silently
overwrites nothing.

## Tasks

- [ ] In `specSyncStatus` (`packages/linear/src/cli-sync.js`), emit the
      description-drift line when `remoteDescriptionEdited` returns `true`,
      carrying the identifier, "repo wins on next push — read it before pushing",
      and the issue URL. Emit nothing on `false` or `null`.
- [ ] Keep the line out of the existing `drift:` workflow-state branch — the two
      are independent facts, and welding them would hide one behind the other.
- [ ] In the API apply path, run the same check against the issue it already
      reads before writing, and print the same warning. It must not change the
      exit code: the user chose detect-and-report over refuse.
- [ ] Update `packages/linear/assets/skills/spec-status/SKILL.md` so step 2 reads
      the description into the `--remote` file and the `⚠️` verdict covers a
      remotely-edited description alongside state drift.
- [ ] Update `packages/linear/assets/skills/spec-push/SKILL.md` to pass
      `--remote` on the MCP path, so a push that is about to overwrite a human
      edit says so first.
- [ ] Add `packages/linear/test/cli-status-description-drift.test.js`: the line
      appears on a real edit; it is absent on a reformatted-but-intact mirror; it
      is absent with a pre-upgrade snapshot; it is absent with no `--remote`.
- [ ] Update the Linear sync paragraph in `CLAUDE.md` and the ticketing-provider
      section of `packages/common/assets/rules/spec-planning.md`: sync stays
      one-way, and one-way now means the repo wins **loudly** rather than
      silently.
- [ ] Add a `Release-Note:` footer when committing — this is user-visible in both
      halves.
- [ ] Run `node --test` from the repo root — green before the phase is done.

## Notes

`/spec-status`'s report section tells the skill to relay the engine's output
verbatim, so the wording of the line is the deliverable — it is what the reader
actually sees. Write it so someone who has never read this spec knows what was
edited, what will happen if they push, and where to look.
