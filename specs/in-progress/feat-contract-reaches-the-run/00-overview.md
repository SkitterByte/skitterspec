---
linear_identifier: "SKS-202"
linear_url: "https://linear.app/skitterbyte/issue/SKS-202/the-report-contract-reaches-the-run-it-governs"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# The report contract reaches the run it governs

> **Type:** Feature
> **Name:** feat-contract-reaches-the-run (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-13)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-13
> **Area:** packages/common/assets/skills, packages/linear/assets/skills, packages/common/assets/rules/spec-reports.md, packages/common/src/init.js, packages/common/src/cli.js, packages/common/test
> **Stack:** worktree

## Problem

`feat-skill-report-contract` shipped a rule that every skill points at, and the
first run after it landed ignored all of it: the skill narrated its way through
("I'll start by reading the spec and checking the gate", "Gate passes —", "The
trusted root is already in settings"), and ended on a fenced block.

Nothing was stale. The composed skills carried the contract, and
`.claude/rules/spec-reports.md` was linked and current. The contract simply never
reached the moment it governs:

1. **The pointer is in the wrong place.** `/spec-start` names
   `spec-reports.md` exactly once, at line 390, in its final section, phrased as
   *"End with the block defined in …"*. A model reads top-to-bottom, narrates all
   the way down, and meets the pointer after every sentence the silence rule
   would have prevented — and then only as a definition of the ending.
2. **The always-on copy was stale, invisibly.** The `CLAUDE.md` section is a
   **copy** installed between markers, not a symlink like `.claude/rules/*`.
   Phase 4 updated the shipped template; this repo's own `CLAUDE.md` was five
   weeks old and nothing said so. Every consumer who installed before the release
   is in the same position.
3. **Two prompts are still fenced.** `/spec-start`'s *"build phase 1 now?"* and
   `/spec-list`'s *"start one with:"* are messages to the reader rendered as code
   boxes — the exact shape the contract banned, un-reviewed because they are not
   reports. (Of 19 fenced blocks across the source skills, the other 17 are
   commands or quoted engine output, which the contract allows.)

## Decisions

1. **A banner at the head of every skill.** Two lines at the top of all 17:
   stay silent while running, and read `.claude/rules/spec-reports.md` before
   reporting. Placement is the whole point — it is read before there is anything
   to narrate. Rejected: relying on the always-on instructions alone, which is
   exactly what failed here, and fails permanently for a consumer who never runs
   `skitterspec update`.
2. **The banner instructs, it does not summarise.** It tells the model to *read*
   the rule, rather than restating the block. Rejected: inlining the verdict list
   and a table skeleton into all 17 `## Report` sections — that is the
   duplication the single-rule design exists to remove, and seventeen copies
   drift against each other the first time the shape changes. The contract has
   already changed shape once mid-spec; that is the evidence.
3. **Fences are for commands, code and quoted engine output — never for a
   message to the reader.** Stated in the contract, not just implied by the
   report's own shape. A question addressed to someone is prose.
4. **Guarded by test, with an allowlist.** A heuristic finds fenced blocks with
   no command-shaped line and no quoted-output marker; legitimate ones are listed
   by skill with a reason. A new reader-facing fence fails rather than ships.
   Rejected: fixing the two and trusting review — this one was caught by a person
   reading it in anger, which is the failure mode the allowlist replaces.
5. **A drift check for the installed `CLAUDE.md` section**, reported by
   `skitterspec update --check`. `update` already resyncs the block, so the gap
   is visibility, not capability — no new fixer, one new reporter.
6. **The drift check reports three states, not two.** Matching the shipped
   section is `fresh`; absent is `not installed`; **different is "cannot tell"**
   — it may be a stale copy or the user's own edit, and those read identically.
   It says the section differs and that `skitterspec update` would refresh it,
   and never calls it stale. `.claude/rules/negative-checks.md` rule 4: the
   unknown case routes to the harmless branch.

## Solution overview

The banner sits above the first section of each `SKILL.md`, under the h1:

```
> Stay silent while this runs — speak only to ask something you cannot answer
> yourself, or to report a failure as it happens. Read
> `.claude/rules/spec-reports.md` before reporting; it defines the block this
> skill ends with.
```

Blockquote rather than a fenced block, deliberately: it is prose addressed to
the reader of the skill, and decision 3 applies to skills as much as to what they
emit.

`assets-report-contract.test.js` already drives from a list of all 17 skills and
already reads the rule's own tables, so the banner check is one more assertion
over the same list.

The fence guard classifies every fenced block in a skill as **command**
(a line starting `git`/`skitterspec`/`npm`/…), **quoted output** (listed in the
allowlist, with a reason), or **reader-facing** — and fails on the third.

`skitterspec update --check` reports what would change and exits 0, with one row
per managed area plus the `CLAUDE.md` section.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | banner at the head of 17 `SKILL.md` files |
| Skill/rule | update | `spec-reports.md` — the fence rule |
| Skill/rule | update | `/spec-start` step 6, `/spec-list` step 5 — unfence two prompts |
| CLI command | add | `skitterspec update --check` (reports, writes nothing, exits 0) |
| Test | update | `assets-report-contract.test.js` — banner assertion |
| Test | add | `assets-fences.test.js` — reader-facing fence guard + allowlist |
| Test | add | CLAUDE.md section drift: fresh · absent · differs |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The banner, on all 17 skills | ⬜ | [01-banner.md](01-banner.md) |
| 2 | Unfence the two prompts, state and guard the rule | ⬜ | [02-fences.md](02-fences.md) |
| 3 | Report a drifted CLAUDE.md section | ⬜ | [03-claude-md-drift.md](03-claude-md-drift.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-13 | Ready | backlog | Reuben Greaves |
| 2026-09-13 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-13 — Spec created, from follow-ups surfaced by
  `feat-skill-report-contract`'s first post-landing run.
