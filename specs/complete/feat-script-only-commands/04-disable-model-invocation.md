---
linear_issue_id: "SKS-50"
---

# Phase 4 — Take the remaining engine skills out of the listing ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done — one user-run check carried to /spec-complete

**Goal:** `spec-status`, `spec-sync` and `spec-to-main` stop occupying the
model-facing skill listing while keeping every bit of their behaviour — and the
saving is measured rather than assumed.

## Tasks

- [x] Add `disable-model-invocation: true` to `spec-status`, `spec-sync`
      (`packages/linear/assets/skills/`) and `spec-to-main`
      (`packages/common/assets/skills/`).
- [x] Re-check every reference to the three from other skills and seams. All are
      descriptive or user-facing suggestions — none was a model invocation — so
      the flag changes no hand-off. In particular `/spec-go` → `/spec-push` is
      untouched, and `spec-push` stays model-invocable.
- [x] Measure the result and record it in the Changelog (numbers below).
- [x] Update `packages/common/assets/rules/spec-planning.md` to say which entries
      are user-only, now that it is actually true.
- [x] Add a guard test asserting every shipped `SKILL.md` and command file has
      parseable frontmatter with a description, that the three named skills carry
      the flag, and — the inverse — that the judgment skills stay model-invocable,
      so a compose or overlay change cannot silently drop or add it.
- [x] Run `pnpm test` — 1130 green — and `pnpm build` — both distributions compose.
- [x] **Confirm each still works when the user types it — done 2026-09-04.**
      After `pnpm exec skitterspec-linear update` installed the flagged assets,
      the user typed `/spec-status` and it loaded and ran normally, with
      `disable-model-invocation: true` on line 4 of the invoked
      `.claude/skills/spec-status/SKILL.md`. Together with the Phase 2 spike —
      where a flagged *command* was user-invoked successfully — the flag is shown
      to restrict model invocation only, on both file types.

## Measurement

Against `3e58d49` (the commit before this spec), counting the listing entry
`- <name>: <description>` per skill, at ~4 chars/token:

| Skill | Listing entry | ~tokens |
|-------|--------------:|--------:|
| spec-connect | 481 | 120 |
| spec-live | 510 | 127 |
| spec-to-main | 499 | 124 |
| spec-status | 513 | 128 |
| spec-sync | 616 | 154 |
| **Total** | **2619** | **654** |

The whole shipped skill listing was 15 skills / 7636 chars (~1909 tokens), so
this removes **34% of it — roughly 650 tokens per session**, whether or not any
spec command is used.

Per invocation, `/spec-connect` no longer loads a 2764-char skill body (~691
tokens) and no longer makes a Bash tool call; it loads a 574-char command
(~143 tokens) whose verb has already run. `/spec-live` goes from 4184 chars
(~1046 tokens) to 648 (~162).

**Honest caveat.** The per-session listing saving is unconditional and real. The
per-invocation saving is only realised when these commands are actually used, and
the author confirmed several worktrees are normally open at once — so the cwd
resolution from Phase 1, not the command move, is what makes them usable without
an argument. Phases 1 and 4 carry most of the value; Phase 3 is what makes Phase
4's listing saving possible for the two verbs that had no judgment left to lose.

## Notes

`spec-status` is read-only, so the flag there is purely a token play rather than a
side-effect guard; it is included because nobody invokes it except by typing it.
The measurement came in at ~650 tokens per session (34% of the listing), so the
phase paid for itself and no revert is warranted.
