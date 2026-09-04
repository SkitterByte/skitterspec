---
linear_issue_id: "SKS-49"
---

# Phase 3 — Move spec-connect and spec-live to commands ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-connect` and `/spec-live` run their CLI verb at expansion and
cost one relay turn instead of a full skill turn, with their old `SKILL.md` files
retired safely from existing installs.

## Tasks

- [x] Write `packages/common/assets/commands/spec-connect.md` — `description`,
      `argument-hint`, `allowed-tools: Bash({{exec}} skitterspec spec-env connect:*)`,
      `disable-model-invocation: true`, and a body that pre-executes the verb with
      `$ARGUMENTS` and relays the output.
- [x] Write `packages/common/assets/commands/spec-live.md` the same way, passing
      `$ARGUMENTS` straight through so `take`/`release`/`abort`/`status` all stay
      reachable.
- [x] **Verified the refusals live in the engine, not the prose.** `planTake`
      (`packages/common/src/env/live.js:185,192,199`) refuses a hotfix, a
      `Stack: worktree + docker` spec, and a migration-touching branch, each with
      its own message — and all three are already covered by
      `packages/common/test/env-live.test.js:177,183,192`. Nothing had to move out
      of the SKILL.md before deleting it.
- [x] Delete `packages/common/assets/skills/spec-connect/` and
      `packages/common/assets/skills/spec-live/`.
- [x] ~~Add both paths to `RETIRED_FILES`~~ — **not needed.** `pruneRetiredManaged`
      retires anything the manifest lists that this version no longer ships,
      keeping a customized file with a warning (Decision 6). Proven by two tests.
- [x] Re-check every cross-reference in the remaining skills. All twelve were
      already user-directed; the imperative "run `/spec-connect …`" forms in
      `spec-go`, `spec-complete`, `spec-to-main` and `spec-hotfix` were reworded to
      name the **user** as the one who types them, since the model can no longer
      invoke either.
- [x] Update `packages/common/assets/rules/spec-planning.md` — added a
      **Skills vs commands** paragraph and marked the live-overlay section as a
      command.
- [x] Update the three tests that encoded the old shape: `init.test.js` (the env
      verbs are commands now), `assets.test.js` (the no-seam check reads the
      command bodies), and `scripts/docs-claims.test.js` (a shipped command
      satisfies a `/spec-…` mention as well as a skill does).
- [x] Add the install/manifest integration tests carried over from Phase 2:
      installs with the right prefix; a yarn project gets yarn; a fresh install
      reads back **pristine**; an edited command is **customized** and kept; every
      shipped command is `disable-model-invocation` and pre-executes its verb.
- [x] Add retirement tests: a pristine old `spec-connect` skill is removed on
      resync and replaced by the command; an **edited** old `spec-live` skill is
      kept.
- [x] Run `pnpm test` — 1127 green — and `pnpm build` — both distributions compose.

## Notes

The third task was the one with teeth — a skill body is documentation the model
may ignore, a CLI refusal is enforcement — and it came back clean: every guard
the SKILL.md described was already in `packages/common/src/env/live.js` with its
own test. Deleting the skill lost nothing.

Commands take `disable-model-invocation: true` deliberately: both mutate git and
port state, which is the documented case for user-only invocation, and it is also
what removes them from the system-prompt listing.
