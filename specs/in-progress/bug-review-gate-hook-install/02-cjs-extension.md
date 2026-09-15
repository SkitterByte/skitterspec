# Phase 2 — ship the hook as `.cjs`, migrate stale registrations

**Goal:** the hook parses under node 22.13+ in both a `"type": "module"` and a
CommonJS project, and an upgrading project ends with exactly one `PreToolUse`
entry pointing at the file that exists.

An ESM rewrite is the alternative and is strictly worse: it inverts the same
problem onto CommonJS projects, which are still the default for anything with no
`"type"` set. The extension is the only thing that makes parse mode independent
of the host project's `package.json`.

## Tasks

- [ ] Red test: the installed hook runs clean (exit 0, no stack trace) in a
      `"type": "module"` project **and** in a CommonJS project.
- [ ] Red test: a project whose settings already register the old `.js` path ends
      with exactly **one** `PreToolUse` entry, pointing at the shipped file.
- [ ] Red test (stays-silent): an operator's own wrapping of the hook is still
      matched, not duplicated; an unrelated hook command still does not match.
- [ ] Fix: rename `assets/hooks/review-gate.js` → `review-gate.cjs`; widen
      `listHooks()` to discover `.cjs`.
- [ ] Fix: point `HOOK_SCRIPT` at `.claude/hooks/review-gate.cjs`; match
      `alreadyRegistered()` on the basename stem so a stale `.js` entry is found,
      and **rewrite** it rather than adding beside it (new `migrated` outcome).
- [ ] Decide and record: whether the stale `.claude/hooks/review-gate.js` file is
      retired via `pruneRetiredManaged` (manifest-aware, keeps a user edit) or
      `RETIRED_FILES` (unconditional delete).
- [ ] Docs: `spec-init` SKILL.md §4a, `assets/rules/spec-planning.md`, root
      `MIGRATION.md`.
- [ ] Green: `node --test` in `packages/common` passes with no regressions.
