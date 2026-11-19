---
github_issue_id: "#236"
---

# Phase 2 — Fresh `init --local` and scoped `update` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** on a repo with no install, `init --local` produces a working install
whose only tracked footprint is `specs/`, and `update` keeps it that way.

## Tasks

- [ ] Parse `--local` in `init`; thread a `scope` option through the install.
- [ ] Hook registration (`env/hooks.js` and the main/project guard
      registrations) takes a target: `settings.json` (team) or
      `settings.local.json` (local), merging into an existing file and
      preserving every other key (it may already hold permissions, and may be
      ignored by a global gitignore rather than the repo's — harmless).
- [ ] Write the CLAUDE block to `CLAUDE.local.md` in local mode, with the
      same section-state logic as `CLAUDE.md`.
- [ ] Append/refresh the marked block in `.git/info/exclude` (resolve via
      `git rev-parse --git-common-dir`); per managed path, idempotent,
      replaces only its own block. Entries carry the install folder's
      `git rev-parse --show-prefix` when it sits below the git root.
- [ ] Record `scope: "local"` in the manifest; `update`/`init` read it and
      stay local without the flag. `init` without `--local` on a local repo
      stays local and says so (switching back to team is out of scope).
- [ ] `checkSync` / `isExistingSetup` recognise `CLAUDE.local.md`.
- [ ] Tests: fresh local init → `git status --porcelain` lists only `specs/`;
      re-run is idempotent; `update` writes nothing tracked; a team install
      is byte-identical to before; stays-silent test for a manifest with no
      `scope`; an install in a subfolder of the git root excludes the right
      paths. Run `pnpm test`.
