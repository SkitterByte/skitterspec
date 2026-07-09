# Phase 2 — Strip folder-index instructions from skills + rule + docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** No skill, rule, or doc instructs anyone to maintain a `00-index.md`;
the phase index is untouched; `grep -rn "00-index" assets README.md` returns
nothing (outside historical spec changelogs). Suite still green.

## Tasks

- [x] `assets/skills/spec/SKILL.md` — replaced Phase C (backlog-row prepend) with
      a "finish up" report step; Phase D (isolation) unchanged.
- [x] `assets/skills/spec-ready/SKILL.md` — removed the backlog-index status update.
- [x] `assets/skills/spec-go/SKILL.md` — removed the backlog-index row-removal step.
- [x] `assets/skills/spec-cancel/SKILL.md` — removed the backlog-index row removal.
- [x] `assets/skills/spec-complete/SKILL.md` — removed the completion-log prepend;
      now points at `specs/complete/` + `git log`/State log for completion order.
- [x] `assets/skills/spec-bug/SKILL.md`, `spec-review/SKILL.md`,
      `spec-init/SKILL.md` — removed their `00-index` references (`spec-init` no
      longer ensures the files); phase-index / structure wording preserved.
- [x] `assets/rules/spec-planning.md` — replaced "Folder indexes" with a "Finding
      specs" section (buckets/State log/git/Linear are the source of truth).
- [x] `README.md` — dropped the two index files from the written-files list.
      `assets/claude-md-section.md` only referenced the *phase* index — left as-is.
- [x] Verify: `grep -rn "00-index" assets README.md src test` shows only the
      deliberate note (rule) + the not-created assertions (test). `npm test` 110/110.

## Notes

- **Do not touch phase-index wording** — the per-spec table linking `01-…`/`02-…`
  with `⬜`/`🔄`/`✅` is a different feature and stays.
- `.claude/skills` and `.claude/rules` are symlinks to `assets/`, so editing the
  asset updates the dog-fooded copy too — no separate edit needed.
