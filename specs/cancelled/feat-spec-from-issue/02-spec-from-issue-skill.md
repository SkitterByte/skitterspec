# Phase 2 — `/spec-from-issue` skill + scaffolder wiring ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-from-issue <id>` turns a triaged tracker issue into a seeded
spec via the existing `/spec` and `/spec-bug` paths, with a `Source` backlink and
a creation comment.

## Tasks

- [ ] Author `assets/skills/spec-from-issue/SKILL.md` (frontmatter `name` +
      auto-trigger `description`). Body steps:
  1. Resolve the active provider from `skitterspec.config.json`
     (`skitterspec config check` first; stop with a clear message if invalid).
  2. **Verify the triage gate** — confirm the issue carries `triageTag`; if not,
     warn and ask the user to confirm before proceeding.
  3. **Fetch** the raw issue via the profile's `tools.fetch` MCP tool (locate it
     with ToolSearch using `profile.mcp`); pipe the raw JSON through
     `skitterspec issue normalize`.
  4. **De-dup** — refuse if any spec already carries `Source: <id>`; point to it.
  5. **Route** on normalized `type`: `feature` → hand off to `/spec` (seed
     Phase A grill with the title/body/comments); `bug` → hand off to `/spec-bug`
     (seed repro). If `type` is null, ask the user which path.
  6. **Stamp** `> **Source:** <id>` and `> **Raised by:** <reporter>` into the new
     spec's `00-overview.md` header.
  7. **Comment back** once via `tools.comment` with the spec path; optionally set
     state to `status.InSpec` (best-effort — warn on failure, don't abort).
- [ ] Add `> **Source:**` and `> **Raised by:**` lines to the header template in
      `assets/skills/spec/SKILL.md` and `assets/skills/spec-bug/SKILL.md` (default
      `—` when not issue-sourced), so the backlink is first-class.
- [ ] Wire `spec-from-issue` into the `SKILLS` array in `src/init.js`.
- [ ] Update `README.md`, `assets/claude-md-section.md`, and
      `assets/rules/spec-planning.md` to document the skill and the `Trackers`
      config (active provider, triage tag, profile shape).
- [ ] Add tests (`node --test`): extend `test/init.test.js` to assert
      `spec-from-issue/SKILL.md` is installed and the docs mention it; add a small
      frontmatter check (valid `name`/`description`) for the new skill asset.
- [ ] Run `npm test` — all green before the phase is done.

## Notes

The skill never parses tracker JSON by hand — it calls `skitterspec issue
normalize` (Phase 1) so the field mapping stays in tested code. MCP tool
resolution is per-profile, so the skill body stays tracker-agnostic; only the
profile names `shortcut`/`get-story`/etc.
