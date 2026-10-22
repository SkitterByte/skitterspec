---
linear_issue_id: "SKS-422"
---

# Phase 5 — Release work item on the release seam ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `spec-sync release create|deployed|complete` implements the kit's
neutral release seam (from `feat-github-provider` phase 5 /
`feat-tracker-releases` Decisions 1–7) with a release work item as the Azure
carrier — dry-run unless `--apply`, idempotent by lookup.

## Tasks

- [ ] `release create <tag>`: resolve the range (previous tag in the series),
      find-or-create the release work item by WIQL title lookup under
      `releases.workItemType` — a failed lookup is *cannot tell* and refuses
      rather than minting (`.claude/rules/negative-checks.md` rule 4) — set
      the body to the release notes, attach the range's tickets as Related
      links, comment once on each attached ticket.
- [ ] `release deployed <version> <env>`: move the release item's state to the
      env's configured state (`releases.series[].envs`); unknown env or state
      is a named refusal.
- [ ] `release complete <version>`: close the release item.
- [ ] All three dry-run by default, `--apply` to write — the `stage`
      precedent; a CI retry on the same tag updates, never duplicates.
- [ ] Tests green: range resolution reuse, idempotent create (found → update),
      cannot-tell refusal, env state mapping, comment-once. Full workspace
      suite (`pnpm test`).

## Notes

Skitterspec decides the release's contents (`Refs:` trailers via
`ticketsInRange`), never Azure — the one-definition rule from
`feat-tracker-releases` Decision 1 carries over unchanged.
