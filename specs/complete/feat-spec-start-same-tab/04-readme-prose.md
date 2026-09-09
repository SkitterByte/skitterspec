---
linear_issue_id: "SKS-108"
---

# Phase 4 — The README describes the same-tab flow ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `packages/common/README.md` — the user-facing description of isolation
— stops describing a flow that ends in another window.

## Tasks

- [x] Update the **Worktree** bullet (`packages/common/README.md:107-112`) to say
      `/spec-start` moves your session into the worktree it provisions, not only
      that it creates one.
- [x] Reframe the **opener** bullet (`:119-120`) as the fallback for when the
      session cannot be moved, matching `env.config.md` from phase 2 — it is
      currently listed as a plain feature of provisioning.
- [x] Fix the `/spec-env <spec>` synopsis comment (`:130`), which lists `opener`
      as an unconditional part of what provisioning does.
- [x] Add a prose test asserting the README calls the opener a fallback and does
      not present it as something every start runs.
- [x] Run the project's test command — green before the phase is done.

## Notes

Surfaced during `/spec-complete`, which is late: phases 1–3 changed the skills,
the rule and the config doc, and the spec's Impact table named those but not the
package README. The README is the first thing a new adopter reads about
isolation, so it is the worst place to leave the old flow described.

Deliberately **not** changed:

- `MIGRATION.md` — structured per version and breaking-changes-only (every entry
  carries a `### Breaking change` heading). This change degrades rather than
  breaks, and the existing v17 → v18 claims ("One invocation. No hand-off
  command, no re-run") remain true.
- `CHANGELOG.md` / `RELEASES.md` — generated from commits at release time; the
  `Release-Note:` footers on phases 1–3 are the input.
