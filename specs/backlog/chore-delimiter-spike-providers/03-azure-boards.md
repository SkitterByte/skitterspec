---
github_issue_id: "#135"
---

# Phase 3 — Azure Boards ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a measured delimiter choice for Azure Boards, recorded in Notes.

## Tasks

- [ ] Precondition: a test organisation/project and a PAT
- [ ] Add an Azure Boards adapter to `scripts/spikes/description-delimiter.js`
      (System.Description is HTML)
- [ ] Run `create`, have the operator edit outside the block in the Azure Boards UI,
      then `check` and `splice`; confirm `outsideIntact` for the chosen
      candidate
- [ ] If both candidates fail, try a Azure Boards-native container before excluding it
- [ ] Run `clean`; record the choice and what the UI did in Notes
- [ ] Update `docs/azure-boards.html`: state the delimiter and drop the provisional
      note; bump its `verified:`
- [ ] Tests: none shipped (spike); `node --test scripts/docs-freshness.test.js`
      green
