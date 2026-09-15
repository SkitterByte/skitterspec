---
linear_issue_id: "SKS-271"
---

# Phase 2 — ship the hook as `.cjs`, migrate stale registrations ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the hook parses under node 22.13+ in both a `"type": "module"` and a
CommonJS project, and an upgrading project ends with exactly one `PreToolUse`
entry pointing at the file that exists.

An ESM rewrite is the alternative and is strictly worse: it inverts the same
problem onto CommonJS projects, which are still the default for anything with no
`"type"` set. The extension is the only thing that makes parse mode independent
of the host project's `package.json`.

## Tasks

- [x] Red test: the installed hook runs clean (exit 0, no stack trace) in a
      `"type": "module"` project **and** in a CommonJS project.
- [x] Red test: a project whose settings already register the old `.js` path ends
      with exactly **one** `PreToolUse` entry, pointing at the shipped file.
- [x] Red test (stays-silent): an operator's own wrapping of the hook is still
      matched, not duplicated; an unrelated hook command still does not match.
- [x] Fix: rename `assets/hooks/review-gate.js` → `review-gate.cjs`; widen
      `listHooks()` to discover `.cjs`.
- [x] Fix: point `HOOK_SCRIPT` at `.claude/hooks/review-gate.cjs`; match
      `alreadyRegistered()` on the basename stem so a stale `.js` entry is found,
      and **rewrite** it rather than adding beside it (new `migrated` outcome).
- [x] Decided: retire the stale `.claude/hooks/review-gate.js` through
      `pruneRetiredManaged`, **not** `RETIRED_FILES`. It already does the right
      thing with no change — the renamed asset drops out of `managedTargets`, so
      a pristine copy is deleted and an edited one is kept with a warning.
      `RETIRED_FILES` deletes unconditionally, which would cost an operator work
      they chose to do, against a leftover that is inert once nothing registers
      it (negative-checks rule 4). Cost of the choice: `init` does not call
      `pruneRetiredManaged`, so a re-`init` on an old project leaves the dead
      file on disk — unregistered, unread, and swept by the next `update`.
- [x] Docs: `spec-init` SKILL.md §4a, `assets/rules/spec-planning.md`, root
      `MIGRATION.md`.
- [x] Green: `node --test` in `packages/common` passes with no regressions.
