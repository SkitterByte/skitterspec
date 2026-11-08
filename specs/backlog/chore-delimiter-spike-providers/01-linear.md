---
github_issue_id: "#133"
---

# Phase 1 — Linear ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a measured delimiter choice for Linear, recorded in Notes.

## Tasks

- [ ] Precondition: the workspace under its free-plan cap (archive 27+ issues), `LINEAR_API_KEY` set
- [ ] Run `create`, have the operator edit outside the block in the Linear UI,
      then `check` and `splice`; confirm `outsideIntact` for the chosen
      candidate
- [ ] If both candidates fail, try a Linear-native container before excluding it
- [ ] Run `clean`; record the choice and what the UI did in Notes
- [ ] Update `docs/linear.html`: state the delimiter and drop the provisional
      note; bump its `verified:`
- [ ] Tests: none shipped (spike); `node --test scripts/docs-freshness.test.js`
      green
