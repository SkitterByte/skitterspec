---
github_issue_id: "#134"
---

# Phase 2 — Jira Cloud ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a measured delimiter choice for Jira Cloud, recorded in Notes.

## Tasks

- [ ] Precondition: a test site and an email + API token pair
- [ ] Add a Jira adapter to `scripts/spikes/description-delimiter.js`
      (markdown → ADF on write, ADF → text on read)
- [ ] Run `create`, have the operator edit outside the block in the Jira Cloud UI,
      then `check` and `splice`; confirm `outsideIntact` for the chosen
      candidate
- [ ] If both candidates fail, try a Jira Cloud-native container before excluding it
- [ ] Run `clean`; record the choice and what the UI did in Notes
- [ ] Update `docs/jira.html`: state the delimiter and drop the provisional
      note; bump its `verified:`
- [ ] Tests: none shipped (spike); `node --test scripts/docs-freshness.test.js`
      green
