# Phase 4 — Extend /spec + /spec-go (opt-in) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** Make `/spec` create the Linear Project + snapshot + initial base, and
`/spec-go` freeze the pulled snapshot into the PR — both **only when
`linear.config.json` is present**, otherwise unchanged.

## Tasks

- [x] Extend `assets/skills/spec/SKILL.md`: add a guarded Linear step — when
      config present, create the **Project** (description from the plan; attach
      `initiativeId` if set) + a **Milestone per phase**; add the frontmatter
      block (`linear_project_id`, `linear_identifier`, `linear_url`,
      `spec_status`, `last_synced_at`) to `00-overview.md`; **write the initial
      base sidecar** so the spec starts clean/non-diverged; echo the branch name
      from `branch.pattern`. Leave commits to the existing convention; never
      auto-push git. No config → behave exactly as today.
- [x] Extend `assets/skills/spec-go/SKILL.md`: surgical clause — when config
      present, run `/spec-pull` first, then commit the refreshed snapshot into the
      feature branch so the frozen spec rides in the PR. Document that Linear's
      GitHub branch/PR automation may now drive state transitions; keep any such
      edit minimal.
- [x] Note the `/spec-sync` retirement wherever a placeholder exists (none ships
      today — confirm and document that push/pull/status replace it).
- [x] Add tests (`node --test`): assert the guarded Linear steps are documented
      and that the no-config path is preserved (skills still valid + installed).
- [x] Run `npm test` — all green before the phase is done (185 pass, 0 fail).

## Notes

Keep `/spec-complete`, `/spec-cancel`, `/commit` as-is. The opt-in gate is the
contract: absent config = zero behavioural change for existing users.

**Delivered / decisions (Phase 4):**

- **`/spec` gained "Phase E — link to Linear (only if configured)"**, mirroring
  the existing "Phase D — isolation stack" guarded-phase shape. It stays inert
  unless `linear.config.json` is present; on the connected path it discovers the
  MCP tools at runtime, creates the Project + a Milestone per phase, writes the
  frontmatter block into `00-overview.md`, and captures the initial base via
  `spec-sync normalize` so the spec starts in-sync. Commits stay the user's; git
  is never auto-pushed (Linear's automation reacts to real branch/PR events).
- **`/spec-go` gained "3b. Sync from Linear first (opt-in)"** — a pull-before-build
  clause (run `/spec-pull`, commit the refreshed snapshot into the branch, expect
  Linear's GitHub automation to move status). Numbered `3b` to avoid renumbering
  the stable 1–6 sections.
- **`/spec-sync` retirement confirmed** — no `/spec-sync` skill ships (only the
  three sync skills reference the `spec-sync` *CLI* subcommand); the overview
  already documents that push/pull/status replace it, so nothing to migrate.
- Two doc-assertion tests added to `test/assets.test.js` (guarded step present +
  no-config path preserved for both skills); no-config behaviour is unchanged by
  construction (the gate is the only new branch).
