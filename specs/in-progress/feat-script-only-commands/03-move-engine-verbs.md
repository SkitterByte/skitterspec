---
linear_issue_id: "SKS-49"
---

# Phase 3 — Move spec-connect and spec-live to commands ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-connect` and `/spec-live` run their CLI verb at expansion and
cost one relay turn instead of a full skill turn, with their old `SKILL.md` files
retired safely from existing installs.

## Tasks

- [ ] Write `packages/common/assets/commands/spec-connect.md`: `description`,
      `allowed-tools: Bash({{exec}} skitterspec spec-env:*)`,
      `disable-model-invocation: true`, and a body that pre-executes
      `{{exec}} skitterspec spec-env connect $ARGUMENTS` and instructs the model to
      relay the output and nothing else.
- [ ] Write `packages/common/assets/commands/spec-live.md` the same way for
      `spec-env live`. Keep the `take`/`release`/`abort`/`status` sub-verbs reachable
      by passing `$ARGUMENTS` through — `/spec-live main` must still release.
- [ ] Preserve the refusals in the CLI, not the prose: confirm `spec-env live`
      already refuses a `Stack: worktree + docker` spec, a migration-touching
      branch and a `Type: Hotfix` spec, and prints why. Anything only the SKILL.md
      enforced today must move into the engine before its skill is deleted.
- [ ] Delete `packages/common/assets/skills/spec-connect/` and
      `packages/common/assets/skills/spec-live/`.
- [ ] Add both old `SKILL.md` paths to `RETIRED_FILES` so existing installs are
      cleaned up by the manifest-aware retirement built in Phase 2.
- [ ] Re-check every cross-reference to `/spec-connect` and `/spec-live` in the
      remaining skills (`spec-go`, `spec-complete`, `spec-hotfix`, `spec-to-main`)
      — each must read as an instruction to the user, never as something the model
      invokes. Fix any that do not.
- [ ] Update `packages/common/assets/rules/spec-planning.md`: the skill table gains
      a column (or a split) distinguishing commands from skills, and the live-overlay
      paragraph stops describing `/spec-live` as a skill.
- [ ] Add tests: both commands install and carry the resolved prefix; the retired
      skill paths are removed on update from a simulated old install; a *customized*
      old `spec-live/SKILL.md` is kept with a warning rather than deleted.
- [ ] Run the project's typecheck and test commands (see
      `.claude/rules/spec-planning.md`) — green before the phase is done.

## Notes

The third task is the one with teeth. A skill body is documentation the model may
ignore; a CLI refusal is enforcement. Deleting `spec-live/SKILL.md` is only safe
once every guard it describes is demonstrably in `packages/skitterspec/src/env/live.js`.

Commands take `disable-model-invocation: true` deliberately: both mutate git and
port state, which is the documented case for user-only invocation, and it is also
what removes them from the system-prompt listing.
