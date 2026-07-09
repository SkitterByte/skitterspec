# Phase 4 — Extend /spec + /spec-go (opt-in) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** Make `/spec` create the Linear Project + snapshot + initial base, and
`/spec-go` freeze the pulled snapshot into the PR — both **only when
`linear.config.json` is present**, otherwise unchanged.

## Tasks

- [ ] Extend `assets/skills/spec/SKILL.md`: add a guarded Linear step — when
      config present, create the **Project** (description from the plan; attach
      `initiativeId` if set) + a **Milestone per phase**; add the frontmatter
      block (`linear_project_id`, `linear_identifier`, `linear_url`,
      `spec_status`, `last_synced_at`) to `00-overview.md`; **write the initial
      base sidecar** so the spec starts clean/non-diverged; echo the branch name
      from `branch.pattern`. Leave commits to the existing convention; never
      auto-push git. No config → behave exactly as today.
- [ ] Extend `assets/skills/spec-go/SKILL.md`: surgical clause — when config
      present, run `/spec-pull` first, then commit the refreshed snapshot into the
      feature branch so the frozen spec rides in the PR. Document that Linear's
      GitHub branch/PR automation may now drive state transitions; keep any such
      edit minimal.
- [ ] Note the `/spec-sync` retirement wherever a placeholder exists (none ships
      today — confirm and document that push/pull/status replace it).
- [ ] Add tests (`node --test`): assert the guarded Linear steps are documented
      and that the no-config path is preserved (skills still valid + installed).
- [ ] Run `npm test` — all green before the phase is done.

## Notes

Keep `/spec-complete`, `/spec-cancel`, `/commit` as-is. The opt-in gate is the
contract: absent config = zero behavioural change for existing users.
