---
github_issue_id: "#237"
---

# Phase 3 — Convert a committed install ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `init --local` on a repo with a committed install leaves every
managed file in place, untracked, with the hooks and block moved local, and
the removal staged for the operator to commit.

## Tasks

- [x] Detect tracked managed paths (`git ls-files` against the manifest's
      managed targets, plus `CLAUDE.md`'s section and `settings.json` hooks).
- [x] `git rm --cached --` each tracked managed path; never commit. Paths
      resolve against the git root (install may sit in a subfolder).
- [x] Move our hook entries from `settings.json` to `settings.local.json`,
      leaving every other entry in both (e.g. a project's own
      `protect-secrets` hook stays in `settings.json`). Remove per hook
      entry, never per matcher group — a group may hold ours and theirs. Merge into an existing
      `settings.local.json` — permissions and every other key preserved; an
      unparseable one is left alone and reported, like `trust.js`. Delete
      `settings.json` only if it is left `{}`-equivalent (otherwise leave it).
- [x] Move the CLAUDE section only when it is delimited by the skitterspec
      markers. A markerless "Spec workflow" section (older installs, e.g.
      skitterload) is **manual**: left in `CLAUDE.md` untouched, reported with
      the heading line it found and the hand move to make. Never infer a
      section's boundaries from headings.
- [x] Report a skitterspec dependency in `package.json` with the global
      install command as the replacement; edit nothing.
- [x] Report the staged removal and the `/commit` to make.
- [x] Tests: committed install → converted (files on disk, not in index,
      hooks/blocks moved, foreign hook entries kept); a customized managed
      file survives conversion unchanged; a repo whose `settings.json` holds
      only foreign hooks is untouched; an existing `settings.local.json` with
      permissions keeps them after the merge; a markerless CLAUDE section is
      reported and not moved; a matcher group mixing our hook with a foreign
      one (and a foreign PostToolUse hook) keeps the foreign ones. Run `pnpm test`.
