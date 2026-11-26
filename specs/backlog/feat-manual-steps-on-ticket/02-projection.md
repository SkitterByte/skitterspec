---
github_issue_id: "#327"
---

# Phase 2 — Project open steps onto Task and parent ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `normalize` shows "Manual steps (open)" on the phase Task and the
parent, in both description modes, and `verify` stays intact across the
section appearing and disappearing.

## Tasks

- [ ] `projectPhaseBody`: while any step is open, hoist the section under the
      Goal and retitle it "Manual steps (open)". When every step is ticked,
      leave it in place under its own name (Decision 3)
- [ ] Render the parent section: a `## Manual steps (open)` heading, a
      `### <phase heading>` per started phase that has open steps, and each
      open step with its fenced code. Emit it first in `buildDescription`,
      ahead of any bug lead sections (Decisions 4, 5)
- [ ] Summary mode: add the open steps to `specBlockInner` after the
      acceptance criteria, and a phase's own open steps to `phaseBlockInner`
      (Decision 6)
- [ ] Stays-silent tests: a spec with no section, a legacy inline spec, a
      spec whose steps are all ticked, and a spec whose only open steps are in
      a not-started phase each project byte-identically to the current
      fixtures (`negative-checks.md` rule 3)
- [ ] Acceptance tests: an open ```` ```sql ```` step appears on both the Task
      and the parent; ticking it removes it from the parent and keeps it as
      `- [x]` on the Task
- [ ] Round-trip tests: push, tick, push again, then `verify` reports intact,
      and the description-edit detection (`compare.js`,
      `sync-remote-description-edit` cases) reports no hand edit. Run the
      Boards compare reduction over SQL containing `<`, `>` and `&`
- [ ] Check that Jira's ADF converter turns a fenced block inside a list item
      into a `codeBlock` and loses nothing
- [ ] Run `pnpm build` and `pnpm test`; green
