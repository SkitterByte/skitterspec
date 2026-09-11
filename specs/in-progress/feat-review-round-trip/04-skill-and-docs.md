---
linear_issue_id: "SKS-161"
---

# Phase 4 — `/spec-diff` intake and docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-diff` closes the loop end to end — takes a pasted blob, reports
what it read, works the comments on your go-ahead, and writes the resolutions
back — and every doc that describes the page says so.

## Tasks

- [ ] Add an **intake** step to `assets/skills/spec-diff/SKILL.md`: on a pasted
      blob, write it to a scratch file, run `spec-env review <spec> --notes
      <file>`, then play back the accepted count, the open comments as
      `file:line — note`, and the files it would touch. **Then stop and wait**
      (Decision 9) — state this as a rule so a later edit does not "streamline" it
      into auto-editing.
- [ ] On the go-ahead: read **only** the commented files — never the accepted ones
      — make the changes, run the project's typecheck and tests, then write
      `--resolve` and re-render. Say plainly that accepted files were not opened;
      that is the token saving, and it is only trustworthy if it is stated.
- [ ] State the intake's cost honestly alongside the existing two-cost section:
      the blob is paths plus your own notes, which the agent needs in context to
      act on them — so the paste is not overhead, but the *work* it authorises is
      ordinary phase-sized cost.
- [ ] Keep the skill's "gate it on nothing" rule intact and extend it: notes are
      never required, never complete, and a review pass can be pasted half-done.
- [ ] Keep the description within the 500-char budget
      (`scripts/skill-budget.test.js`) — this adds capability, not description
      text; the trigger phrasings stay the priority.
- [ ] Update `packages/common/assets/rules/spec-planning.md`'s `/spec-diff`
      paragraph and the docs-site page so the round-trip is described where
      adopters read, not only in the skill body.
- [ ] Extend `test/assets-spec-diff.test.js` to assert the intake and resolve
      steps are present and that the report-before-editing rule survives; add a
      docs-claims guard if the docs site names the flags.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

`/spec-next` already offers `/spec-diff` at the end of a phase; nothing there
changes. The round-trip is something you reach by reviewing, not a new step in
the lifecycle.
