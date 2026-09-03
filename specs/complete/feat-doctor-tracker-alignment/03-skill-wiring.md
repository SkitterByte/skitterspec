# Phase 3 — Teach the setup skill to fetch it ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the `--mcp` file is produced by a skill rather than by hand, so the
cross-check runs as part of setting Linear up — and the assets suite proves the
skills say so.

## Tasks

- [x] Add a step to `/spec-linear-setup` (`packages/common/assets/skills/…` — the
      Linear fragment): after the config is written, read `get_workspace`,
      `get_team` and (when a project is configured) `get_project` over MCP, write
      them to a file in the documented shape, and run
      `skitterspec spec-sync doctor --check-remote --mcp <file>`.
- [x] Document the file shape in the skill, beside the existing
      `--workspace-states` handoff, so the two read as one pattern.
- [x] Make the mismatch actionable in the skill: on a `broken` `mcp` row, say
      which two disagree and stop — the skill must not rewrite the config to
      resolve it (decision 4).
- [x] Update `linear.config.md` (the `specs/.core` doc) so `projectId`'s entry
      says what `doctor` now reports for empty vs set vs unresolvable.
- [x] Extend `packages/linear/test/assets.test.js` to assert the setup skill
      names `--mcp` and the three MCP reads — the same guard style the phase-emoji
      convention uses, so the step cannot silently drop out of the skill.
- [x] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`/spec-linear-setup` already discovers the workspace over MCP to build the
config, so this is one more read on a path that is open — not a new dependency.

Keep the file out of the repo: it is a snapshot for one command, in the same
category as the `--workspace-states` file, not something to commit.

## Outcome

The facts file is written from the reads step 2 already makes — `get_workspace`
is the only addition, and it is explicitly *not* part of the interview: nothing
is asked about it, it is recorded so step 8 can prove the two transports agree.

Step 8 was already "finish by checking, not by describing", so `--mcp` slotted
into the `doctor` call it ran anyway. The skill is told to **omit** what it could
not fetch rather than guess, which is the contract the row is built on.

The assets guard is the load-bearing part: `doctor --mcp` can only catch a
mismatch if something produces the file, so a step quietly dropped from the skill
would leave the row reporting `skipped` forever with nothing looking wrong.
