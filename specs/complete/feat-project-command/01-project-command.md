---
github_issue_id: "#196"
---

# Phase 1 — `skitterspec project`: read, write, list categories ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the command shows, sets and clears the two keys and lists the
categories in use — proven against fixture configs and transcripts.

## Tasks

- [x] `describeProject(config)` in `env/project.js` — name and category, each
      with its source (`project.name` · `review.projectName` · `folder` ·
      `unset`)
- [x] `setProjectKeys(text, changes)` — edits the JSON text in place: keeps
      indentation, key order and every other key; adds `project` after
      `mode` when absent; `""` clears
- [x] `skitterspec project [--name] [--category] [--json]` in `cli.js`,
      reading the checkout it runs in; refuses (exit 1, nothing written)
      with no `env.config.json`, naming `skitterspec init --isolation`
- [x] `--categories`: repos from the tada transcript scan, each one's
      category and a count, compared case-insensitively
- [x] Help text and the `docs/reference.html` row
- [x] Tests: read with each source; set/clear round-trips leave the rest of
      the file byte-identical; a file with no `project` block; refusal with
      no config (and no file created); `--categories` over fixture
      transcripts; a stays-silent test for a repo whose config has no
      category; run `pnpm test` — green
