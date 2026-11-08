---
github_issue_id: "#124"
---

# Phase 2 — Delimiter spike, per provider ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** for each provider, a measured answer to "write a description with a
delimited block and some outside text, edit the outside text in the tracker's
UI, read it back — can the block still be found and replaced, and is the
outside text intact?"

## Tasks

- [ ] Throwaway script per provider (GitHub, Linear, Jira, Azure Boards): write
      a description holding a delimited block plus a paragraph either side, read
      it back, then re-splice a changed block
- [ ] Try candidates in order: HTML comment markers, a fixed heading
      (`## Skitterspec`), a provider-native container (Jira panel, Azure
      section) — record the first that survives a UI edit of the outside text
- [ ] Record per provider: delimiter chosen, what the UI does to it, and whether
      the block renders acceptably — in this file's Notes
- [ ] Tests: none shipped — delete the scripts or keep them under
      `scripts/spikes/` with a note

## Notes

Expected going in: GitHub keeps HTML comments verbatim and hides them; Azure
stores HTML and probably keeps them; Linear and Jira ADF likely drop them, so a
heading delimiter is the fallback there.
