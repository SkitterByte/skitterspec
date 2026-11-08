---
github_issue_id: "#124"
---

# Phase 2 — Delimiter spike, per provider ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** for each provider, a measured answer to "write a description with a
delimited block and some outside text, edit the outside text in the tracker's
UI, read it back — can the block still be found and replaced, and is the
outside text intact?"

## Tasks

- [x] Throwaway script: `scripts/spikes/description-delimiter.js`
      (`create` / `check` / `splice` / `clean`, GitHub + Linear adapters).
      Writes a block with a paragraph either side, reads it back, then
      re-splices a changed block
- [x] Candidates: HTML comment markers and a fixed heading
      (`## Skitterspec summary` … `_— end of skitterspec summary —_`). A
      provider-native container is left for whichever tracker drops both
- [x] GitHub: measured. See Notes
- [x] Linear, Jira, Azure Boards: carried to
      [`chore-delimiter-spike-providers`](../../backlog/chore-delimiter-spike-providers/00-overview.md)
      (#132). Linear is over its free-plan cap (275 active against 250), and
      the repo has no Jira or Azure test access. Phase 3 ships the heading
      delimiter for those three as provisional
- [x] Tests: none shipped. The script stays under `scripts/spikes/` so the
      Linear, Jira and Azure runs can reuse it

## Notes

**GitHub, 2026-11-08: comment delimiter chosen.** Throwaway issues #130
(comment) and #131 (heading), both closed as not planned afterwards.

- Create, then read back: byte-identical for both candidates.
- The operator then edited outside the block in GitHub's web editor (on a
  phone): reworded the line above, added a link, added text below, uploaded
  a screenshot. Both delimiter pairs survived untouched; the web editor shows
  raw markdown, so the HTML comments are visible while editing but hidden
  when the issue is rendered.
- Splice of a v2 block: both candidates found and replaced. The text outside
  the block was **identical before and after** (link, image attachment and
  added paragraphs included).
- Choice: **HTML comment**. It is invisible on the rendered issue; the heading
  candidate works too, but shows up as a heading in the issue.
- Not tested: an edit *inside* the block (that is drift, handled by the
  scoped hash, not by the delimiter), or a person deleting a delimiter line.
  A missing delimiter has to be cannot-tell (phase 3): never prepend a second
  block over a description whose begin marker survives without its end.

Expected going in, still unmeasured: Linear converts markdown and likely drops
HTML comments (heading fallback); Jira ADF has no comment node; Azure stores
HTML and probably keeps comments.
