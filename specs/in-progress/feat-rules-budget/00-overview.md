---
github_identifier: "#282"
github_url: "https://github.com/SkitterByte/skitterspec/issues/282"
---

# Always-loaded rules within Claude Code's instruction budget

> **Type:** Feature
> **Name:** feat-rules-budget (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/282
> **Author:** Reuben Greaves
> **Raised:** 2026-11-23
> **Area:** packages/common/assets/rules/**, packages/common/assets/claude-md-section.md, packages/common/assets/skills/** (supporting files), packages/{github,linear,jira,azure-boards}/assets/rules/commit-trailers.md, packages/common/src/init.js, packages/common/test/ (budget + install tests), docs/rationale/ (new), docs/index.html, docs/review.html
> **Stack:** worktree
> **Docs:** index, review

## Summary

A host project's always-loaded skitterspec instructions shrink from ~126k to
≤ 30k chars. Rationale and history leave the installed files, content one skill
needs moves into that skill, and a test fails the build if the budget is
breached again.

## Problem

Claude Code warns when instruction files exceed 150k chars in total. In ereqs,
21 files total 215.4k, and skitterspec's managed rules are 118k of that:
`spec-planning.md` 65k, `spec-reports.md` 38.5k, `commit-trailers.md` 5.8k,
`offered-unblocks.md` 5.3k and `negative-checks.md` 3.4k. On main,
`spec-planning.md` has grown to 66.3k. Every rule without `paths:` loads in
full in every session, which is about 30k tokens. Most of that text is design
rationale and amendment history, not instructions. The host project can't trim
it, because the manifest hash guard keeps managed files byte-identical. Nothing
in flight trims it: the backlog, in-progress specs and all three worktree
branches leave `assets/rules` untouched.

## Acceptance criteria

- In every distribution, the always-loaded files skitterspec installs total
  ≤ 30k chars: the rules under `.claude/rules/` without `paths:`, plus the
  CLAUDE.md section.
- A test fails when any distribution exceeds that budget.
- No installed file carries amendment history or incident write-ups. Each rule
  that lost rationale ends with a one-line pointer to the doc in the
  skitterspec repo.
- Content that one skill needs is installed next to that skill's `SKILL.md`,
  and the skill reads it at the step that uses it.
- The spec-format conventions load only when Claude touches `specs/**`
  (`paths:` front-matter).
- A host can fill in its typecheck and test commands without editing a managed
  file.
- `skitterspec update` on a host installs the new layout and retires the old
  files. The manifest records every file it writes, so a host's guard tests stay
  green.
- On a host whose `spec-planning.md` was edited only in its conventions section,
  `update` carries those edits over into `project-conventions.md`.

## Decisions

1. **Rationale is not installed.** Host models need instructions, not
   history. Rationale moves to `docs/rationale/<rule>.md` in this repo, and
   each trimmed rule ends with one line linking to it on GitHub. *Rejected:*
   shipping it as on-demand reference files, which keeps the bytes and adds a
   managed directory that only maintainers read.
2. **Single-skill content becomes skill supporting files**, at
   `.claude/skills/<name>/<topic>.md`, which `SKILL.md` names at the step that
   needs it. The installer and manifest copy each skill's folder, not only
   `SKILL.md`. *Rejected:* inlining it in `SKILL.md`, which duplicates shared
   content.
3. **Content several skills share lives in one copy**, under the skill that
   owns the mechanism. The review banner and wait/re-arm contract live in
   `spec-diff/review-wait.md`, and other skills name that path. Like every
   supporting file, it never loads unless a skill reads it.
4. **Spec format is path-scoped.** Header fields, State log, lifecycle
   folders, phase-file layout and the spec types move to `spec-format.md` with
   `paths: ["specs/**"]`. The lifecycle table, the guards, the report block and
   `commit-trailers.md` stay always-loaded, because they apply outside
   `specs/`.
5. **Project conventions leave the managed file.** `init` writes
   `.claude/rules/project-conventions.md` once and never overwrites it. It is
   not in the manifest, so editing it trips nothing.
6. **Migration extracts, and only when it can tell.** A customized
   `spec-planning.md` is taken over when, with its conventions section
   removed, it hashes to a version that was shipped. The comparison uses a
   generated list of section-stripped hashes, one per tagged release. On a
   match, `update` writes the section into `project-conventions.md` (unless
   that file already exists) and installs the new files. Any other edit can't
   be told apart, so the file is kept, and `update` warns with its size and the
   `--force` step (`negative-checks.md` rule 4).
7. **The budget is 30k chars**, measured on the rendered install of each
   distribution: the base plus its provider's `commit-trailers.md` plus the
   CLAUDE.md section. The test sits beside the ≤ 500-char description test from
   `feat-skill-efficiency-pass`, and a comment explains why the budget exists.
   *Rejected:* counting rules only, which would leave the 8.3k CLAUDE.md
   section unmeasured.
8. **Rules are trimmed, not rewritten.** Every instruction a skill depends on
   survives, in a rule, a scoped rule or a supporting file. Phase 2 checks this
   by grepping every rule reference in the skills to confirm it still resolves.

## Solution overview

The always-loaded set becomes a short core:

- `spec-planning.md` keeps the lifecycle table as one-liners, skills vs.
  commands, the guards (main, project, review gate) as instructions, the
  isolation basics and the spec rules.
- `spec-reports.md` keeps the block: silence, shape, fields, verdicts,
  follow-ups and when to ask versus report.
- `negative-checks.md`, `offered-unblocks.md` and `commit-trailers.md` keep
  their rules without the narrative.

Everything else goes to one of three places, sorted by who reads it:
`spec-format.md` (scoped to `specs/**`), a skill's supporting files (live
overlay, epics, hotfix land, the tracker contract, the banner and wait
mechanics), or `docs/rationale/` in this repo, which is never installed.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | spec-planning.md, spec-reports.md, negative-checks.md, offered-unblocks.md: trimmed to instructions |
| Skill/rule | update | commit-trailers.md ×4 providers: trimmed |
| Skill/rule | add | spec-format.md (`paths: specs/**`) |
| Skill/rule | add | project-conventions.md: unmanaged, written once by init |
| Skill/rule | add | skill supporting files, e.g. spec-diff/review-wait.md, spec-to-main + spec-complete live/hotfix detail, spec-epic-next/epics.md |
| Skill/rule | update | SKILL.md bodies: name the supporting file at the step that uses it |
| Config key | update | CLAUDE.md managed section: trimmed |
| CLI command | update | `init` / `update`: install whole skill folders, write project-conventions.md, migrate the conventions section |
| Business rule | add | always-loaded budget ≤ 30k chars per distribution (test) |
| Docs | add | docs/rationale/*.md (repo only, not installed) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Installer: skill folders, project-conventions.md, budget measure | ✅ | [01-installer.md](01-installer.md) |
| 2 | Split spec-reports.md and spec-planning.md | ✅ | [02-split-core-rules.md](02-split-core-rules.md) |
| 3 | Trim the small rules and the CLAUDE.md section | ⬜ | [03-trim-the-rest.md](03-trim-the-rest.md) |
| 4 | Migration, budget gate, docs, dogfood | ⬜ | [04-migrate-and-gate.md](04-migrate-and-gate.md) |

## Open questions

- None

## Changelog

- 2026-11-23 — Spec created from the ereqs handoff (215.4k of 150k chars;
  skitterspec rules 118k).
- 2026-11-23 — Phase 1: `update` also writes project-conventions.md when it is
  missing, so upgrading hosts get it. A local uninstall removes the untouched
  template and parks a filled-in copy, like any edited file.
- 2026-11-23 — Phase 2: the live overlay, workspace modes, authoring landing
  and staging went to one file, `spec-start/isolation.md`, not to separate
  skills. The tracker contract stays as one short paragraph in
  `spec-planning.md`, not in the provider's `spec-push`, because base skills
  read it too. The review page's mechanics (verdicts, claiming, gate,
  reviewers) got their own `spec-diff/review-page.md`. `docs/rationale/` holds
  each original rule verbatim. Asset tests that pinned rationale wording now
  pin the instruction in its new home, and assertions that only quoted history
  were dropped. Always-loaded total: 31.9k (base), 38.1k (github), down from
  about 126k.
