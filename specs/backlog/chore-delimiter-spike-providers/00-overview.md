---
github_identifier: "#132"
github_url: "https://github.com/SkitterByte/skitterspec/issues/132"
---

# Delimiter spike — Linear, Jira, Azure Boards

> **Type:** Chore
> **Name:** chore-delimiter-spike-providers (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/132
> **Author:** Reuben Greaves
> **Raised:** 2026-11-08
> **Area:** scripts/spikes/description-delimiter.js, specs/in-progress/feat-tracker-held-specs (phase notes)
> **Stack:** worktree
> **Docs:** linear, jira, azure-boards
> **Origin:** follow-up from `feat-tracker-held-specs` (#123) phase 2, which measured GitHub only

## Problem

`feat-tracker-held-specs` puts a repo-owned summary block into each ticket
description, found by delimiters. Its phase 2 measured GitHub (HTML comments
survive web-editor edits outside the block; a re-splice leaves the outside text
byte-identical) but could not measure the other three: Linear's workspace is on
the free plan and over its issue cap (275 active against 250), and the repo
has no Jira or Azure test access. Until each is measured, that spec ships the
heading delimiter for them as provisional.

## Decisions

1. **Same method as GitHub.** Per provider: create the comment and heading
   candidates, the operator edits the text outside the block in the tracker's
   UI, then check, splice a v2 block, confirm the outside text is intact, and
   clean up. Reuses `scripts/spikes/description-delimiter.js`, which lands with
   `feat-tracker-held-specs`.
2. **One phase per provider**, so each runs whenever its access exists and none
   blocks the others.
3. **The answer feeds back.** Each result is recorded here and in the delimiter
   choice `feat-tracker-held-specs` (or its successor code) uses for that
   provider. A provider whose UI drops both candidates gets a provider-native
   container (Jira panel, Azure section) tried before it is excluded.

## Solution overview

Each phase adds the provider's adapter to the spike script if it needs one,
runs the four steps with the operator, and writes the result into its Notes.
The provider's docs page then states the delimiter, replacing the provisional
note.

## Impact

_No external surface changes — a measurement; the delimiter code ships in
`feat-tracker-held-specs`._

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Linear | ⬜ | [01-linear.md](01-linear.md) |
| 2 | Jira Cloud | ⬜ | [02-jira.md](02-jira.md) |
| 3 | Azure Boards | ⬜ | [03-azure-boards.md](03-azure-boards.md) |

## Open questions

- None. Access is a precondition (in each phase), not an open design question.

## Changelog

- 2026-11-08 — Spec created from `feat-tracker-held-specs` phase 2, where
  Linear hit the free-plan cap and Jira and Azure had no test access.
