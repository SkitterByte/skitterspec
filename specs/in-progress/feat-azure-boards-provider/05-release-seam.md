---
linear_issue_id: "SKS-422"
github_issue_id: "#14"
---

# Phase 5 — Release work item on the release seam ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync release create|deployed|complete` implements the kit's
neutral release seam (from `feat-github-provider` phase 5 /
`feat-tracker-releases` Decisions 1–7) with a release work item as the Azure
carrier — dry-run unless `--apply`, idempotent by lookup.

## Tasks

- [x] **First, and blocked on `feat-github-provider`:** supply `AB#\d+` as the
      kit's provider ref pattern and wire `refs.foreignPatterns` into
      `released`, replacing phase 3's named refusal — `ticketsInRange` is what
      `release create` decides contents with, so this phase cannot start
      without it.

- [x] `release create <tag>`: resolve the range (previous tag in the series),
      find-or-create the release work item by WIQL title lookup under
      `releases.workItemType` — a failed lookup is *cannot tell* and refuses
      rather than minting (`.claude/rules/negative-checks.md` rule 4) — set
      the body to the release notes, attach the range's tickets as Related
      links, comment once on each attached ticket.
- [x] `release deployed <version> <env>`: move the release item's state to the
      env's configured state (`releases.series[].envs`); unknown env or state
      is a named refusal.
- [x] `release complete <version>`: close the release item.
- [x] All three dry-run by default, `--apply` to write — the `stage`
      precedent; a CI retry on the same tag updates, never duplicates.
- [x] Tests green: range resolution reuse, idempotent create (found → update),
      cannot-tell refusal, env state mapping, comment-once. Full workspace
      suite (`pnpm test`).

## Notes

Skitterspec decides the release's contents (`Refs:` trailers via
`ticketsInRange`), never Azure — the one-definition rule from
`feat-tracker-releases` Decision 1 carries over unchanged.

- Ref pattern: `AZURE_REF_RE` (`\bAB#\d+\b`) feeds the kit scan;
  `refs.foreignPatterns` + the kit's `KEY-N` shape classify an earlier
  tracker's trailers as historical, and an invalid pattern refuses by name
  rather than being dropped (a dropped pattern would re-count its history as
  unreferenced).
- `releaseStage` moves the RELEASE ITEM's state, never each ticket's — so
  `set` is 1 by design (Decision 12's answer to the two-state-machines trap).
- `releaseComplete` resolves the type's Completed-category state at run time;
  a type with none is a named refusal listing what it has.
- `releaseFind` throws on two same-titled items — the kit treats a throw as
  cannot-tell and refuses, which is the duplicate-safe branch.
- No `releaseTagExists`: the tag lives in Azure Repos, which this provider
  deliberately does not reach (Work Items scope only).
