---
github_issue_id: "#283"
---

# Phase 1 — Installer: skill folders, project-conventions.md, budget measure ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the installer can ship what the split needs: whole skill folders, an
unmanaged conventions file, and a measure of the always-loaded set. Tests
prove each one. No rule content moves yet.

## Tasks

- [ ] `managedTargets` / skill install (`packages/common/src/init.js`): copy
      every file in a skill's asset folder, not only `SKILL.md`, and record each
      in the manifest. Retiring a supporting file goes through
      `pruneRetiredManaged` like any other managed file.
- [ ] Teach the `--local` switch (`claudeMdExcludes`, skill switch-off) about
      supporting files, so a local install still hides all of them.
- [ ] `init` writes `.claude/rules/project-conventions.md` from a new asset
      template, once. If the file already exists it is left untouched, and it
      is never written into the manifest.
- [ ] Add `alwaysLoaded(dir)`: the installed rules without `paths:`
      front-matter, plus the managed CLAUDE.md section, as `{ path, chars }`
      rows and a total. Phase 4 hangs its gate on this.
- [ ] Tests: a supporting file installs, is hashed, is kept when edited and
      pruned when retired. project-conventions.md is written once and survives
      `update` and `update --force`. `alwaysLoaded` excludes a `paths:` rule,
      and a stays-silent case covers a rule with no front-matter at all.
      Run `pnpm typecheck && pnpm test`, green before the phase is done.
