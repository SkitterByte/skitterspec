---
github_issue_id: "#124"
---

# Phase 1 — Round-trip fidelity spike ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** for each provider, a measured answer to "write a spec to a ticket,
read it back — is it the same markdown?"

## Tasks

- [ ] Pick a corpus: three real specs from `specs/complete/` covering tables,
      nested lists, checkboxes, fenced blocks, links and frontmatter-like headers
- [ ] Throwaway script per provider (GitHub, Linear, Jira, Azure Boards): create
      a ticket body from each spec, read it back, normalised diff
- [ ] Record per provider: lossless / lossy-but-normalisable / lossy, and what is
      lost — in this file's Notes
- [ ] Tests: none shipped — the spike is not merged code; delete the scripts or
      keep them under `scripts/spikes/` with a note

## Notes

Expected going in: GitHub stores markdown verbatim; Linear converts; Jira's ADF
is the known loss; Azure stores HTML.
