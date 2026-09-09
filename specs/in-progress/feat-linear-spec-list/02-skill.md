---
linear_issue_id: "SKS-117"
---

# Phase 2 — `/spec-list`, the skill, MCP path and degradation ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-list` answers the listing questions in plain language on both
transports, and prints a usable local listing when Linear cannot be reached.

## Tasks

- [x] Add `assets/skills/spec-list/SKILL.md` with frontmatter modelled on
      `assets/skills/spec-status/SKILL.md`: a `description` naming the queries it
      serves, and `disable-model-invocation: true` (decision 11).
- [x] Document the opt-in gate — runs only when
      `specs/.core/linear.config.json` exists; otherwise say how to enable Linear
      sync and stop.
- [x] Write the **API path**: run `spec-sync list` with the flags the user's
      question implies and relay its output.
- [x] Write the **MCP path**: when the engine prints `transport = mcp`, discover
      the issue-list tool as `/spec-push` describes, call it with the team, the
      state filter and `parentId` handling, then join `spec-sync linked --json`
      locally and format the same rows.
- [x] Write the **degradation** step (decision 10): Linear unreachable or no
      credential → print the `spec-sync linked` listing under a one-line banner
      saying the states are the repo's and may be stale for in-progress specs.
- [x] State the read-only contract and the hand-off: every row carries the spec
      folder name, and the finish-up line points at `/spec-start <name>`; the
      skill never starts, moves or writes anything (decision 6).
- [x] Register the skill in the install manifest / assets list the way
      `spec-status` is registered, and extend `test/assets.test.js` so the new
      skill is asserted present and installable. (No manifest edit was needed —
      `listSkills()` discovers `assets/skills/*/SKILL.md` from the bundled tree,
      so shipping the folder registers it. Verified via `pnpm run build`.)
- [x] Run `pnpm test` in `packages/linear` and at the repo root — green before the
      phase is done.

## Notes

Keep the skill short. The engine already decides scope, caps and joining; the
skill's job is the MCP call, the degradation banner and the wording — not a second
implementation of the query.
