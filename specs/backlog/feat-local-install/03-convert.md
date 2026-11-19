---
github_issue_id: "#237"
---

# Phase 3 — Convert a committed install ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `init --local` on a repo with a committed install leaves every
managed file in place, untracked, with the hooks and block moved local, and
the removal staged for the operator to commit.

## Tasks

- [ ] Detect tracked managed paths (`git ls-files` against the manifest's
      managed targets, plus `CLAUDE.md`'s section and `settings.json` hooks).
- [ ] `git rm --cached --` each tracked managed path; never commit.
- [ ] Move our hook entries from `settings.json` to `settings.local.json`,
      leaving every other entry; delete `settings.json` only if it is left
      exactly `{}`-equivalent and was ours (otherwise leave it).
- [ ] Move the managed section from `CLAUDE.md` to `CLAUDE.local.md`; a
      manual "Spec workflow" section is left alone and reported.
- [ ] Report a skitterspec dependency in `package.json` with the global
      install command as the replacement; edit nothing.
- [ ] Report the staged removal and the `/commit` to make.
- [ ] Tests: committed install → converted (files on disk, not in index,
      hooks/blocks moved, foreign hook entries kept); a customized managed
      file survives conversion unchanged; a repo whose `settings.json` holds
      only foreign hooks is untouched. Run `pnpm test`.
