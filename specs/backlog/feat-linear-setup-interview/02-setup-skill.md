# Phase 2 — The `/spec-linear-setup` skill ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** an operator with the Linear MCP server connected can configure sync by
answering questions about their workspace, never by copying an id.

## Tasks

- [ ] Create `packages/linear/assets/skills/spec-linear-setup/SKILL.md`. No
      registration needed — `listSkills()` discovers the folder and the build
      overlays it into the distribution.
- [ ] Discover over MCP before asking anything: `list_teams`, `list_projects`,
      `list_issue_labels`, `list_issue_statuses`. Offer real lists; never prompt
      for a raw id.
- [ ] Interview the structure (Decision 2): which team this repo files into;
      whether products are split by team or by project; whether specs should
      default to a project; which labels drive intake and bug/hotfix routing.
      Recommend an answer each time, as the other spec skills do.
- [ ] Handle the one-team and many-team cases differently — with several teams,
      say plainly that **this config pins one team for the whole repo**, so the
      choice is which product's work this repo files.
- [ ] Pass the gathered values to `spec-sync init-config`, including the
      discovered state names for validation, and relay its report.
- [ ] Degrade, never block: if MCP is unavailable, say so in one line and point
      at the manual path in `SETUP.md` rather than half-writing a config. Match
      the project picker's existing degrade rule.
- [ ] Detect an existing config and offer to review rather than overwrite —
      re-running should be the way to check a setup.
- [ ] Add tests in `packages/linear/test/assets.test.js`: the skill exists and is
      picked up by the skill list; it names each discovery tool it depends on; it
      calls `init-config` rather than writing JSON itself; it documents the
      degrade path. Run `node --test` — green before the phase is done.

## Notes

The skill must not name a specific product or workspace — it ships to every
consumer. The interview asks how *this* workspace is organised; it does not
assume a shape.
