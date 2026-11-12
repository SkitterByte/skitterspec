---
github_issue_id: "#190"
---

# Phase 3 — Epic view grouped by state, with next steps ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the epic page and `epic status` show at a glance what is done, in
flight and left, and end on a numbered list of what to type in which tab.
Proven by render tests over the page and the text view.

## Tasks

- [ ] Engine (`epic.js`): add `progress` (`done`, `total`, `inFlight`) and
      `groups` (`inFlight` · `ready` · `waiting` · `done`) to the status. Every
      member is in exactly one group, and `cannot tell` goes into `waiting`
      with its reason. `--json` carries both
- [ ] Engine: add `steps`, the ordered next steps (Decision 9). Each step is
      `{ where, command, unblocks, caution }`
- [ ] Page (`epicpage.js`): a progress header and bar, the four groups (Done
      collapsed to a count, opened by `<details>`), then **Next steps** at the
      bottom. Waves and never-together go behind a `<details>`. It keeps the
      30 s refresh, relative member links and no pass codes (feat-epic-next
      Decisions 5–6)
- [ ] Text view (`epic status`): the same order and grouping, in plain text
      readable under `watch`
- [ ] `/spec-epic-next` reads its startable members from `steps`, so the
      skill, the page and the CLI give one answer
- [ ] Docs: `review` (the epic page) and `reference` (`epic status` output);
      bump `verified:`
- [ ] Tests: group membership (incl. cannot-tell → waiting); step order;
      `unblocks` from `Waits on:`; the clash caution; no start step beyond the
      free lanes; a stays-silent test that an all-done epic emits only
      `/spec-complete <epic>`; page render keeps no pass code
- [ ] Run typecheck + tests — green before the phase is done

## Notes

- Mock-up agreed on 2026-11-12:

  ```
  epic-library-and-sessions
  5 of 9 done · 1 in flight · 2 lanes, 1 free
  [█████░░░░]

  IN FLIGHT        feat-exercise-library-curation  2 of 2 ✅ · clean
  READY TO START   feat-distance-prescriptions  ⚠ clashes with …curation
  WAITING          feat-library-enrichment  on feat-exercise-library-curation
                   feat-session-recipes     on feat-library-enrichment
  DONE (5) ▸

  NEXT STEPS
   1. In exercise-library-curation's tab:  /spec-complete
      → unblocks feat-library-enrichment
   2. In a new tab (1 lane free):  /spec-start feat-distance-prescriptions
      ⚠ clashes with feat-exercise-library-curation; safer after step 1
  ```
