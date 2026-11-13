---
github_issue_id: "#203"
---

# Phase 1 — Home-scoped ta-da, with wins ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the ta-da list knows which project it was run from, and which of the
day's events were wins. Proven by digest and format tests.

## Tasks

- [ ] `tada/repo.js`: resolve the home project from the run's cwd by git
      common dir, so a worktree counts as its repo.
- [ ] `tada/digest.js`: stamp `here: true` on the home project. Tag events:
      - `saved-bacon` for a hotfix, incident or bug spec `completed` in the
        window;
      - `win` for any other spec completed, and for a release tag cut in the
        window.
- [ ] `tada/format.js`: print `(here)` after the home project's name, and one
      `★ win: …` or `★ saved bacon: …` line per tagged event.
- [ ] `/spec-tada` skill:
      - open with a **Wins** section built from the `★` lines, plus at most
        one model-promoted win citing its evidence from the prompts;
      - word other projects' next steps as in-context suggestions;
      - draw `Next` and the standup's Next/Blockers lines from the `(here)`
        project only, or say `nothing in flight here`;
      - when today is empty, point at `/spec-todo`.
- [ ] Tests:
      - home detection from the primary checkout, from a worktree, and from
        a directory that isn't in any repo (no project is `here`);
      - each tag type is applied;
      - a stays-silent test that a completed chore in another category
        isn't tagged;
      - format snapshot lines.
      Run `pnpm test`, which must be green.
